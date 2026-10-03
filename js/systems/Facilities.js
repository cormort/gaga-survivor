// 設施與傭兵（砲塔／電網／淨化裝置／拒馬、傭兵雇用與升級、金幣乘數）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 210 行，是「經濟與部署」這一整塊，
// 與戰鬥判定、渲染無關。手法與 js/systems/Hazards.js 相同：game 當第一個參數，
// this. → game.，模組不持有任何遊戲狀態。
//
// 呼叫端：main.js 以 buildFacility(this, type) 這種形式呼叫；
// 外部（Progression 的里程碑獎勵、測試）走 Game 上的 goldMul() 薄包裝；
// `game.turretCost` / `game.mercCost` 這兩個屬性存取由主檔既有的 getter 維持。

import { Turret, TURRET_VARIANTS, FACILITY_TYPES } from '../entities/Turret.js';
import { Mercenary, MERC, REALM, rollMercCandidates } from '../entities/Mercenary.js';
import { Projectile } from '../entities/Projectile.js';
import { sound } from '../audio.js';
import { save } from '../save.js';
import { nearestOnPaths } from '../tdlevels.js';
import { enemyScale } from '../levels.js';

// 金幣乘數的天花板。天賦財運 × 模式 × 祝福 × 每日規則 × 淘金潮是純乘法疊加、
// 原本沒有上限 —— 實測空存檔 23 分鐘 5.8 萬金，帶滿 meta 加成的存檔同時間 142 萬，
// 差 25 倍，砲塔與傭兵變成無限供應。
const GOLD_MUL_CAP = 8;

export function getFacilityCost(game, type = 'turret') {
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
  if (game.td) return conf.baseCost;   // 守塔關：固定價格（經典守塔），金幣來源是固定的賞金與波次獎金，不會無限膨脹
  const count = game.turrets.filter((t) => (t.facilityType || 'turret') === type).length;
  // 原本是線性 (60 + 35n)，蓋 20 座也才 760 —— 後期金幣以萬計，等於無限重建。
  // 乘上 1.12^n 形成軟天花板：20 座約 7.3k、30 座約 33k、40 座約 136k。
  let raw = (conf.baseCost + conf.costGrowth * count) * Math.pow(1.12, count);
  if (game.player && game.player.facilityCostMul) {
    raw *= game.player.facilityCostMul;
  }
  const modeMul = (game.mode && game.mode.turretCostMul != null) ? game.mode.turretCostMul : 1;
  return Math.max(10, Math.round(raw * modeMul));
}

export function updateFacilityHUD(game) {
  game.ui.updateFacilityButtons(game.gold, (type) => getFacilityCost(game, type));
  game.ui.updateBuildBtn(game.gold, game.turretCost);
}

// 驗證放置位置是否合法
export function checkPlacementValid(game, wx, wy, type, socket = null) {
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
  const cost = getFacilityCost(game, type);

  // 1. 金幣檢驗
  if (game.gold < cost) {
    return { valid: false, reason: `金幣不足 (${cost} 🪙)`, cost };
  }

  // 2. 若吸附到戰術地基槽 (Tactical Socket)
  if (socket) {
    const occupied = game.turrets.some(t => t.socket === socket || (Math.hypot(t.x - socket.x, t.y - socket.y) < 25));
    if (occupied) {
      return { valid: false, reason: '此戰術地基已被佔用', cost };
    }
    return { valid: true, reason: `戰術地基 (${socket.label})`, cost };
  }

  // 3. 守塔關卡非地基點：必須在行軍道路兩側 (路肩)
  if (game.td) {
    const near = nearestOnPaths(game.level, wx, wy);
    const half = (game.level.pathWidth || 80) / 2;
    if (near.d < half + 10) {
      return { valid: false, reason: '不能蓋在行軍路面上', cost };
    }
    if (near.d > half + 250) {
      return { valid: false, reason: '離行軍路線太遠', cost };
    }
  }

  // 4. 與其他設施的最小間隔
  const minD = conf.minSpacing || 40;
  const tooClose = game.turrets.some(t => Math.hypot(t.x - wx, t.y - wy) < minD);
  if (tooClose) {
    return { valid: false, reason: '離鄰近工事太近', cost };
  }

  // 5. 基地核心碰撞保護 (守塔模式)
  if (game.core) {
    const dCore = Math.hypot(game.core.x - wx, game.core.y - wy);
    if (dCore < (game.core.radius || 40) + conf.radius + 8) {
      return { valid: false, reason: '不能重疊基地核心', cost };
    }
  }

  return { valid: true, reason: '可建造', cost };
}

// 開始建造預覽 (滑鼠/觸控拖曳放置模式)
export function startPlacement(game, type = 'turret') {
  if (game.state !== 'PLAYING' || !game.player) return;
  if (!game.mode.turrets) {
    game.ui.say('目前模式無法建造防禦工事', '#8a9bb0', 1.6);
    return;
  }

  const cost = getFacilityCost(game, type);
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
  if (game.gold < cost) {
    game.ui.say(`金幣不足，佈署【${conf.name}】需要 ${cost} 🪙`, '#ffb703', 1.6);
    sound.playHurt();
    return;
  }

  // 關閉目前正在檢查的設施彈窗
  if (game.inspectedTurret) {
    closeFacilityInspector(game);
  }

  // 初始化 placement 狀態
  const initialX = game.lastPointer ? (game.lastPointer.x + game.camera.x) : game.player.x;
  const initialY = game.lastPointer ? (game.lastPointer.y + game.camera.y) : game.player.y;
  const initialScreenX = game.lastPointer ? game.lastPointer.x : (game.vw / 2);
  const initialScreenY = game.lastPointer ? game.lastPointer.y : (game.vh / 2);

  game.placement = {
    type,
    x: initialX,
    y: initialY,
    screenX: initialScreenX,
    screenY: initialScreenY,
    valid: false,
    reason: '',
    socket: null,
    cost,
  };

  updatePlacement(game, initialScreenX, initialScreenY);
  game.ui.showPlacementHUD(true, conf, cost, () => cancelPlacement(game));
}

// 取消建造預覽
export function cancelPlacement(game) {
  if (game.placement) {
    game.placement = null;
    game.ui.showPlacementHUD(false);
    game.ui.say('已取消建造模式', '#8a9bb0', 1.0);
  }
}

// 更新建造幽靈位置 (含戰術地基 55px 磁性吸附)
export function updatePlacement(game, screenX, screenY) {
  if (!game.placement) return;
  game.lastPointer = { x: screenX, y: screenY };
  game.placement.screenX = screenX;
  game.placement.screenY = screenY;

  let wx = screenX + game.camera.x;
  let wy = screenY + game.camera.y;

  // 戰術地基槽磁性吸附 (55px 範圍內自動吸附)
  let snappedSocket = null;
  if (game.level && game.level.sockets) {
    let closestD = 55;
    for (const s of game.level.sockets) {
      const isOccupied = game.turrets.some(t => t.socket === s || (Math.hypot(t.x - s.x, t.y - s.y) < 25));
      if (isOccupied) continue;
      const d = Math.hypot(s.x - wx, s.y - wy);
      if (d < closestD) {
        closestD = d;
        snappedSocket = s;
      }
    }
  }

  if (snappedSocket) {
    wx = snappedSocket.x;
    wy = snappedSocket.y;
    game.placement.socket = snappedSocket;
  } else {
    game.placement.socket = null;
  }

  game.placement.x = wx;
  game.placement.y = wy;

  const check = checkPlacementValid(game, wx, wy, game.placement.type, game.placement.socket);
  game.placement.valid = check.valid;
  game.placement.reason = check.reason;
  game.placement.cost = check.cost;
}

// 確認建造
export function confirmPlacement(game) {
  if (!game.placement) return false;
  const p = game.placement;
  const check = checkPlacementValid(game, p.x, p.y, p.type, p.socket);
  if (!check.valid) {
    game.ui.say(check.reason || '無法在此處建造', '#ff0055', 1.4);
    sound.playHurt();
    return false;
  }

  const cost = check.cost;
  if (game.gold < cost) {
    game.ui.say(`金幣不足 (${cost} 🪙)`, '#ffb703', 1.4);
    sound.playHurt();
    return false;
  }

  // 扣款並建造
  game.gold -= cost;
  const facility = new Turret(p.x, p.y, p.type, 'standard', p.socket);
  if (p.socket) {
    p.socket.occupied = true;
    p.socket.turret = facility;
  }
  if (game.player && game.player.facilityHpMul) {
    facility.maxHp = Math.round(facility.maxHp * game.player.facilityHpMul);
    facility.hp = facility.maxHp;
  }
  game.turrets.push(facility);

  const conf = FACILITY_TYPES[p.type] || FACILITY_TYPES.turret;
  const fxColor = p.type === 'electric_grid' ? '#b5179e' : p.type === 'purifier' ? '#00f59b' : p.type === 'barricade' ? '#ffb703' : p.type === 'heavy_bolter' ? '#f39c12' : p.type === 'barracks' ? '#27ae60' : p.type === 'manufactorum' ? '#e67e22' : '#00e5ff';
  game.particles.createShockwave(facility.x, facility.y, 85, fxColor);
  sound.playEvoFanfare();

  const socketBonusMsg = p.socket ? `（⚡ 錨定【${p.socket.label}】！）` : '';
  game.ui.say(`已部署【${conf.name}】${socketBonusMsg}`, fxColor, 1.8);

  game.placement = null;
  game.ui.showPlacementHUD(false);
  updateFacilityHUD(game);
  return true;
}

// 拆除回收 (Demolish / Sell) - 70% 金幣返還
export function recycleFacility(game, turret) {
  if (!turret || !game.turrets) return;
  const idx = game.turrets.indexOf(turret);
  if (idx === -1) return;

  const refund = turret.getSellValue ? turret.getSellValue() : Math.round((turret.fConf?.baseCost || 60) * 0.7);
  game.gold += refund;

  // 釋放地基槽
  if (turret.socket) {
    turret.socket.occupied = false;
    turret.socket.turret = null;
  }

  // 特效與音效
  game.particles.createExplosion(turret.x, turret.y, 60);
  game.particles.createShockwave(turret.x, turret.y, 80, '#ffb703');
  sound.playHit();
  sound.playGem();

  game.turrets.splice(idx, 1);
  game.ui.say(`已拆除回收【${turret.fConf?.name || '防禦設施'}】，返還 ${refund} 🪙`, '#ffb703', 2.0);

  closeFacilityInspector(game);
  updateFacilityHUD(game);
}

// 升級設施 (Upgrade Facility)
export function upgradeFacility(game, turret) {
  if (!turret || turret.isDead) return;

  // 標準機槍砲台可先進化型態
  if (turret.facilityType === 'turret' && turret.variant === 'standard') {
    const upgradeCost = 50;
    if (game.gold < upgradeCost) {
      game.ui.say(`金幣不足，砲塔進化需要 ${upgradeCost} 🪙`, '#ff0055', 1.8);
      sound.playHurt();
      return;
    }
    const variants = ['flame', 'cryo', 'tesla'];
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    game.gold -= upgradeCost;
    turret.upgrade(chosen);
    game.particles.createShockwave(turret.x, turret.y, 140, TURRET_VARIANTS[chosen].color);
    sound.playEvoFanfare();
    game.ui.say(`砲塔進化完畢：【${TURRET_VARIANTS[chosen].name}】！`, TURRET_VARIANTS[chosen].color, 2.8);
  } else {
    // 等級提升 (Level Up)
    const cost = turret.getUpgradeCost ? turret.getUpgradeCost() : 60;
    if (game.gold < cost) {
      game.ui.say(`金幣不足，升級需要 ${cost} 🪙`, '#ff0055', 1.8);
      sound.playHurt();
      return;
    }
    game.gold -= cost;
    turret.upgradeLevel();
    game.particles.createShockwave(turret.x, turret.y, 100, '#00f5ff');
    sound.playEvoFanfare();
    game.ui.say(`【${turret.fConf?.name}】升級至 LV.${turret.level}！耐久與威力提升`, '#00f5ff', 2.2);
  }

  updateFacilityHUD(game);
  // 刷新檢查面板
  if (game.inspectedTurret === turret) {
    inspectFacility(game, turret);
  }
}

// 開啟設施檢查面板
export function inspectFacility(game, turret) {
  if (!turret || turret.isDead) return;
  game.inspectedTurret = turret;
  game.ui.showFacilityInspector(true, turret, {
    onUpgrade: () => upgradeFacility(game, turret),
    onRecycle: () => recycleFacility(game, turret),
    onClose: () => closeFacilityInspector(game),
  });
}

// 關閉設施檢查面板
export function closeFacilityInspector(game) {
  game.inspectedTurret = null;
  game.ui.showFacilityInspector(false);
}

export function buildFacility(game, type = 'turret', targetX = null, targetY = null, socket = null) {
  if (game.state !== 'PLAYING' || !game.player) return;
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
  if (!game.mode.turrets) {
    game.ui.say('目前模式無法建造防禦工事', '#8a9bb0', 1.6);
    return;
  }

  const cost = getFacilityCost(game, type);
  if (game.gold < cost) {
    game.ui.say(`金幣不足，佈署【${conf.name}】需要 ${cost} 🪙`, '#ffb703', 1.6);
    return;
  }

  const bx = targetX !== null ? targetX : game.player.x;
  const by = targetY !== null ? targetY : game.player.y;

  // 守塔關：若不是指定 socket，檢查只能蓋在路邊
  if (game.td && !socket) {
    const near = nearestOnPaths(game.level, bx, by);
    const half = (game.level.pathWidth || 80) / 2;
    if (near.d < half + 10) {
      game.ui.say('不能蓋在路上 —— 站到路邊再佈署', '#ffb703', 1.6);
      return;
    }
    if (near.d > half + 240) {
      game.ui.say('離路線太遠了，打不到怪物', '#ffb703', 1.6);
      return;
    }
  }

  const minD = conf.minSpacing || 40;
  const tooClose = game.turrets.some(
    (t) => Math.hypot(t.x - bx, t.y - by) < minD
  );
  if (tooClose && !socket) {
    game.ui.say('這裡太靠近其他工事設施了', '#ffb703', 1.6);
    return;
  }

  game.gold -= cost;
  const facility = new Turret(bx, by, type, 'standard', socket);
  if (socket) {
    socket.occupied = true;
    socket.turret = facility;
  }
  if (game.player && game.player.facilityHpMul) {
    facility.maxHp = Math.round(facility.maxHp * game.player.facilityHpMul);
    facility.hp = facility.maxHp;
  }
  game.turrets.push(facility);

  const fxColor = type === 'electric_grid' ? '#b5179e' : type === 'purifier' ? '#00f59b' : type === 'barricade' ? '#ffb703' : type === 'heavy_bolter' ? '#f39c12' : type === 'barracks' ? '#27ae60' : type === 'manufactorum' ? '#e67e22' : '#00e5ff';
  game.particles.createShockwave(bx, by, 80, fxColor);
  sound.playEvoFanfare();
  game.ui.say(`已部署【${conf.name}】！`, fxColor, 1.4);
  updateFacilityHUD(game);
}

export function buildTurret(game) {
  buildFacility(game, 'turret');
}

export function grantStarterTurret(game) {
  if (!game.core || !game.mode.turrets || game.td) return;   // 守塔關改發開局金幣，自己決定蓋什麼
  const t = new Turret(game.core.x, game.core.y + game.core.radius + 46, 'turret');
  game.turrets.push(t);
  game.particles.createShockwave(t.x, t.y, 90, '#00e5ff');
  game.ui.say('🗼 基地已預置一座機槍砲台 — 走到空地按建造鈕可再佈署更多', '#00e5ff', 4.5);
  updateFacilityHUD(game);
}

export function updateTurrets(game, dt) {
  for (let i = game.turrets.length - 1; i >= 0; i--) {
    const t = game.turrets[i];

    t.update(dt, game.enemies, (target, dmg) => {
      game.damageEnemy(target, dmg, 1, t.x, t.y, t.facilityType || 'turret');
      sound.playShoot();
    }, game.player, game);

    // 敵人被設施擋住：推開並持續啃食 (反傷拒馬自動反射傷害)
    for (const e of game.enemies) {
      if (e.isDead) continue;
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const minD = t.radius + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;

      const d = Math.sqrt(d2);
      e.x = t.x + (dx / d) * minD;
      e.y = t.y + (dy / d) * minD;
      if (!game.td) t.takeDamage(e.damage * dt * 1.5, e);   // 守塔關的塔不會被打壞
    }

    if (t.isDead) {
      game.particles.createExplosion(t.x, t.y, 70);
      sound.playExplosion();
      game.camera.shake = 8;
      game.turrets.splice(i, 1);
      updateFacilityHUD(game);
    }
  }
}

export function tryUpgradeNearestTurret(game) {
  if (game.state !== 'PLAYING' || !game.player || !game.mode.turrets) return;
  const upgradeCost = 50;
  const standardTurrets = game.turrets
    // 必須同時是「砲塔」這個設施類型：電網/淨化裝置/拒馬的 variant 預設也是
    // 'standard'，而 upgrade() 對非砲塔直接 return —— 原本會扣 50 金幣、
    // 播進化音效、顯示「進化完畢」，實際什麼都沒變
    .filter((t) => t.facilityType === 'turret' && t.variant === 'standard' &&
      Math.hypot(t.x - game.player.x, t.y - game.player.y) <= 125)
    .sort((a, b) =>
      Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y)
    );
  if (standardTurrets.length === 0) {
    game.ui.say('附近沒有可進化的標準砲塔', '#ffb703', 1.5);
    return;
  }
  if (game.gold < upgradeCost) {
    game.ui.say(`金幣不足，砲塔進化需要 ${upgradeCost} 🪙`, '#ff0055', 1.8);
    sound.playHurt();
    return;
  }
  const target = standardTurrets[0];
  const variants = ['flame', 'cryo', 'tesla'];
  const chosen = variants[Math.floor(Math.random() * variants.length)];
  game.gold -= upgradeCost;
  target.upgrade(chosen);
  game.particles.createShockwave(target.x, target.y, 140, TURRET_VARIANTS[chosen].color);
  sound.playEvoFanfare();
  game.ui.say(`砲塔進化完畢：【${TURRET_VARIANTS[chosen].name}】！`, TURRET_VARIANTS[chosen].color, 2.8);
  game.ui.updateBuildBtn(game.gold, game.turretCost);
}

export function hireMercenary(game) {
  if (game.state !== 'PLAYING' || !game.player) return;
  if (!game.mode.mercs) {
    game.ui.say('此模式沒有傭兵', '#8a9bb0', 1.6);
    return;
  }
  if (game.mercenaries.length >= MERC.maxCount) {
    game.ui.say(`已有一名傭兵隨行 (上限 ${MERC.maxCount})`, '#8a9bb0', 1.6);
    sound.playHurt();
    return;
  }
  const cost = game.mercCost;
  if (game.gold < cost) {
    game.ui.say(`金幣不足，僱傭傭兵需要 ${cost} 🪙`, '#ff0055', 1.8);
    sound.playHurt();
    return;
  }
  // 暫停遊戲，讓玩家從三名候選弟子中挑一位
  game.state = 'MERC_MODAL';
  sound.pauseBGM();
  const modal = document.getElementById('merc-modal');
  const list = document.getElementById('merc-list');
  const close = () => {
    modal.classList.add('hidden');
    if (game.state === 'MERC_MODAL') { game.state = 'PLAYING'; sound.resumeBGM(); }
  };
  list.innerHTML = '';
  for (const c of rollMercCandidates(3)) {
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `<div class="slot-info"><b style="color:${c.sect.qi}">${c.name}</b><span>${c.sect.label}弟子</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'game-btn primary-btn';
    btn.textContent = '僱傭';
    btn.addEventListener('click', () => { close(); spawnMercenary(game, cost, c); });
    row.appendChild(btn);
    list.appendChild(row);
  }
  document.getElementById('btn-close-merc').onclick = close;
  modal.classList.remove('hidden');
}

function spawnMercenary(game, cost, cand) {
  if (game.state !== 'PLAYING' || !game.player || game.gold < cost) return;
  game.gold -= cost;
  const m = new Mercenary(game.player.x, game.player.y, game.mercenaries.length, save.data.merc, cand);
  m.onLevelUp = (merc) => {
    save.flush();
    game.particles.createShockwave(merc.x, merc.y, 110, merc.qiColor);
    game.ui.say(`⚡ ${merc.name}突破境界：【${REALM[merc.level - 1]}】！血量與傷害提升`, merc.qiColor, 2.6);
  };
  game.mercenaries.push(m);
  game.particles.createShockwave(game.player.x, game.player.y, 90, '#3ddc84');
  sound.playEvoFanfare();
  game.ui.say(`🗡️ ${REALM[m.level - 1]}${m.sect.label}${m.name}報到！(${cost} 🪙) 斬妖累積經驗、突破境界`, '#3ddc84', 2.4);
  game.ui.updateHUD(game.player, game.gameTime, game.kills, game.gold);
  game.ui.updateBuildBtn(game.gold, game.turretCost);
  // 四種設施按鈕一起刷新 (內部有值快取，每幀呼叫不會產生多餘的 DOM 寫入)
  game.ui.updateFacilityButtons(game.gold, (type) => getFacilityCost(game, type));
  game.ui.updateHireBtn(game.mercCost, game.gold >= (game.mercCost || 1e9));
}

export function updateMercenaries(game, dt) {
  // 傭兵傷害跟著雜兵血量成長：原本固定 30～138，開局皮厚 ×2.5 與時間成長一疊上去，
  // 飛劍打在怪身上幾乎沒感覺（看起來像「傭兵不會攻擊」）。基準 3 = enemyScale 在 0 秒、無加成時的值。
  const growth = Math.max(1, enemyScale(game.gameTime, game.level, game.rules).hp / 3 * (game.spawner?.adaptiveHpMul || 1));
  for (let i = game.mercenaries.length - 1; i >= 0; i--) {
    const m = game.mercenaries[i];
    m.update(dt, game.player, game.enemies, (merc, target) => {
      const dx = target.x - merc.x;
      const dy = target.y - merc.y;
      const dist = Math.hypot(dx, dy) || 1;
      game.weaponManager.projectiles.push(new Projectile({
        type: 'merc',
        weaponId: 'merc',
        x: merc.x + (dx / dist) * 10,
        y: merc.y + (dy / dist) * 10,
        vx: (dx / dist) * MERC.bulletSpeed,
        vy: (dy / dist) * MERC.bulletSpeed,
        damage: Math.round(merc.damage * growth),
        radius: 9,
        pierce: 2,
        life: 1.7,
        knockback: 1,
        mercOwner: merc,
        qiColor: merc.qiColor,
      }));
      sound.playShoot();
    });

    // 敵人貼身啃傭兵 (比照砲塔被啃)：推開 + 持續傷害
    for (const e of game.enemies) {
      if (e.isDead) continue;
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      const minD = 11 + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      e.x = m.x + (dx / d) * minD;
      e.y = m.y + (dy / d) * minD;
      m.takeDamage(e.damage * dt * 1.5);
    }

    if (m.isDead) {
      game.particles.createExplosion(m.x, m.y, 40);
      game.particles.createShockwave(m.x, m.y, 80, m.qiColor);
      sound.playHurt();
      game.ui.say(`🗡️ ${m.name}兵解！境界與經驗保留，重新僱傭即可`, '#ff5e5e', 2.2);
      save.flush();   // 陣亡不掉境界，經驗先寫回存檔
      game.mercenaries.splice(i, 1);
      game.ui.updateHireBtn(game.mercCost, game.gold >= (game.mercCost || 1e9));
    }
  }
}

export function updateAlliedUnits(game, dt) {
  if (!game.alliedUnits) return;
  for (let i = game.alliedUnits.length - 1; i >= 0; i--) {
    const u = game.alliedUnits[i];
    u.update(dt, game.enemies, game);

    // 敵人貼近碰撞與推擠阻截
    for (const e of game.enemies) {
      if (e.isDead) continue;
      const dx = e.x - u.x;
      const dy = e.y - u.y;
      const minD = u.radius + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;

      const d = Math.sqrt(d2);
      // 實體阻絕：敵人無法穿越士兵或戰車，被推擠阻隔在陣線外
      e.x = u.x + (dx / d) * minD;
      e.y = u.y + (dy / d) * minD;

      // 單位受傷
      u.takeDamage(e.damage * dt * 1.5, e);

      // 黎曼魯斯坦克履帶碾壓反傷
      if (u.type === 'leman_russ') {
        game.damageEnemy(e, 85 * dt, 2, u.x, u.y, 'ram');
      }
    }

    if (u.isDead) {
      if (u.type === 'leman_russ') {
        if (game.particles) {
          game.particles.createExplosion(u.x, u.y, 90);
          game.particles.createShockwave(u.x, u.y, 140, '#e67e22');
        }
        sound.playExplosion();
        if (game.camera) game.camera.shake = 10;
        game.ui.say('💥 黎曼魯斯坦克殉爆！為帝皇盡忠！', '#e67e22', 2.0);
      } else {
        if (game.particles) game.particles.createExplosion(u.x, u.y, 25);
        sound.playHurt();
      }
      game.alliedUnits.splice(i, 1);
    }
  }
}

export function facilityGoldMul(game) {
  // 淘金狂潮與幸運藥劑都改成「讀計時器」而不是改動 metaGoldMul：
  // 乘數本身可以隨時被重算，不會再有「到期還原一次」造成永久殘留的問題。
  // runGoldMul 放單局興奮劑：與 metaGoldMul 分開，才不會被開局的天賦重算蓋掉。
  // rules.goldMul（關卡／難度／每日詞綴）也一起放在這裡相乘 —— rules 會被我方
  // 事件暫時改寫，烘進 metaGoldMul 會在事件結束後留下殘留值。
  let mul = (game.metaGoldMul || 1) * (game.runGoldMul || 1) * ((game.rules && game.rules.goldMul) || 1);
  if (game._goldRushTimer > 0) mul *= 2;
  if (game.player && game.player.luckPotionTimer > 0) mul *= 2;
  return Math.min(GOLD_MUL_CAP, mul);
}
