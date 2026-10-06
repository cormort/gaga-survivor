// 設施與傭兵（砲塔／電網／淨化裝置／拒馬、傭兵雇用與升級、金幣乘數）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 210 行，是「經濟與部署」這一整塊，
// 與戰鬥判定、渲染無關。手法與 js/systems/Hazards.js 相同：game 當第一個參數，
// this. → game.，模組不持有任何遊戲狀態。
//
// 呼叫端：main.js 以 buildFacility(this, type) 這種形式呼叫；
// 外部（Progression 的里程碑獎勵、測試）走 Game 上的 goldMul() 薄包裝；
// `game.turretCost` / `game.mercCost` 這兩個屬性存取由主檔既有的 getter 維持。

import { Turret, TURRET_VARIANTS, FACILITY_TYPES, TD_ELITE } from '../entities/Turret.js';
import { Mercenary, MERC, REALM, rollMercCandidates } from '../entities/Mercenary.js';
import { Projectile } from '../entities/Projectile.js';
import { tdUnitSprite } from '../entities/AlliedUnit.js';
import { sound } from '../audio.js';
import { save } from '../save.js';
import { enemyScale } from '../levels.js';
import { TD_TOWERS, TD_BRANCHES, ARMOR_MUL, ARMOR_NAMES, applyTDStats, tdTowerPreview } from '../tdtowers.js';

// 打擊感 (E 項)：塔命中的火花顏色（跟 js/tdtowers.js 的 dmgType 對齊）
const SPARK_COLORS = { pierce: '#ffd166', magic: '#c77dff', siege: '#ff8c42', normal: '#e9ecef' };
// 每發命中都噴粒子的話，後期一波上百隻怪會直接把 render 時間吃光，所以只抽樣一小部分
const TURRET_SPARK_CHANCE = 0.4;

// 建造選單目前的「選了這張塔要做什麼」回呼（openBuildMenu 寫、closeBuildMenu 清）。
// 見 openBuildMenu 的註解：不能掛在 game 上，否則 tools/check-refactor-refs.mjs 會誤判成重構殘留。
let buildMenuPick = null;

// 金幣乘數的天花板。天賦財運 × 模式 × 祝福 × 每日規則 × 淘金潮是純乘法疊加、
// 原本沒有上限 —— 實測空存檔 23 分鐘 5.8 萬金，帶滿 meta 加成的存檔同時間 142 萬，
// 差 25 倍，砲塔與傭兵變成無限供應。
const GOLD_MUL_CAP = 8;

// 守塔的造價與升級費：王國升級的「工程學」會打折。所有守塔的價格都必須走這裡，
// 否則會出現「選單寫 70 🪙、實際扣 64 🪙」這種對不上的情形（舊版本就是直接讀 d.cost）。
export function tdCost(game, base) {
  if (!game.td) return base;
  const cut = game.td.kingdomStat ? game.td.kingdomStat().costCut : 0;
  return Math.max(1, Math.round(base * (1 - cut)));
}

export function getFacilityCost(game, type = 'turret') {
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
  if (game.td) return tdCost(game, conf.baseCost);   // 守塔關：固定價格（經典守塔），金幣來源是固定的賞金與波次獎金，不會無限膨脹
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

  // 3. 守塔關卡只能蓋在建塔點
  if (game.td) {
    return { valid: false, reason: '守塔關只能蓋在建塔點', cost };
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
  if (game.td) {   // 守塔關沒有自由放置（快捷鍵 1~7／B 也走這裡）
    game.ui.say('🔨 點擊路邊的建塔點來蓋塔', '#ffb703', 1.6);
    return;
  }
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
  const initialX = game.lastPointer ? game.screenToWorld(game.lastPointer.x, game.lastPointer.y).x : game.player.x;
  const initialY = game.lastPointer ? game.screenToWorld(game.lastPointer.x, game.lastPointer.y).y : game.player.y;
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

  let { x: wx, y: wy } = game.screenToWorld(screenX, screenY);

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

  const refund = turret.tdKey ? Math.round(turret.invested * 0.7)   // 守塔：總投入的 70%
    : turret.getSellValue ? turret.getSellValue() : Math.round((turret.fConf?.baseCost || 60) * 0.7);
  game.gold += refund;
  if (turret.tdKey) removeUnitsOf(game, turret);   // 守塔：賣掉兵營，路上的兵一起撤

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
  if (turret.tdKey) {
    upgradeTDTower(game, turret);
    return;
  }

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
    td: turret.tdKey ? tdInspectInfo(game, turret) : null,
    // 只有會自己挑目標開火的塔才有瞄準優先序（兵營、電網等沒有）
    priority: turret.priority ? {
      label: TARGET_PRIORITIES[turret.priority],
      onCycle: () => cycleTargetPriority(game, turret),
    } : null,
  });
}

// 守塔塔的升級資訊：下一級價格，或第 3 級時的兩個專精選項
function tdInspectInfo(game, t) {
  const d = TD_TOWERS[t.tdKey];
  return {
    upgradeCost: !t.branch && t.level < 3 ? tdCost(game, d.up[t.level - 1]) : null,
    sellValue: Math.round(t.invested * 0.7),
    branches: !t.branch && t.level === 3 ? d.branches.map((key) => {
      const b = TD_BRANCHES[key];
      const cost = tdCost(game, b.cost);
      return { name: b.name, icon: b.icon, desc: b.desc, cost, affordable: game.gold >= cost, onPick: () => chooseTDBranch(game, t, key) };
    }) : null,
    title: t.branch ? TD_BRANCHES[t.branch].name : d.name,
    icon: t.branch ? TD_BRANCHES[t.branch].icon : d.icon,
  };
}

// 關閉設施檢查面板
export function closeFacilityInspector(game) {
  game.inspectedTurret = null;
  game.ui.showFacilityInspector(false);
}

// ── 守塔關：點建塔點 → 建造選單（塔種與升級路線見 js/tdtowers.js） ──
export function openBuildMenu(game, socket) {
  closeFacilityInspector(game);
  game.ui.showKingdomPanel(false);   // 王國升級面板跟建造選單搶同一塊畫面，開一個就關另一個
  const s = { x: (socket.x - game.camera.x) * game.zoom, y: (socket.y - game.camera.y) * game.zoom };
  // 每一列除了名稱與價格，再帶一行實際數據（DPS／射程／對空）與護甲相剋標籤。
  // 「簡陋」的來源常常不是玩法而是資訊：玩家看不到 DPS 就只能憑圖示亂蓋。
  const items = Object.entries(TD_TOWERS).map(([key, d]) => {
    const p = tdTowerPreview(key);
    const tags = [];
    if (p) {
      for (const c of p.counters) tags.push({ label: `剋${ARMOR_NAMES[c]}`, good: true });
      for (const c of p.weak) tags.push({ label: `弱${ARMOR_NAMES[c]}`, good: false });
      if (p.canAir) tags.push({ label: '可對空', good: true });
    }
    const cost = tdCost(game, d.cost);
    return {
      type: key, icon: d.icon, name: d.name, desc: d.desc, cost,
      affordable: game.gold >= cost,
      // 兵營沒有自己的 DPS（開火的是小兵），硬寫「DPS 0」比不寫更糟 → 換一種說法。
      // 完整機制由 desc 顯示在下一行，所以這裡只放「一眼比較得出來」的數字。
      stats: p
        ? (p.units
          ? '小兵代打｜打不到空中'
          : `DPS ${p.dps}${p.aoe ? '（範圍）' : ''}｜射程 ${Math.round(p.range)}｜${p.canAir ? '對空對地' : '只打地面'}`)
        : '',
      tags,
    };
  });
  game.buildMenuSocket = socket;
  // A 項操作打磨：把選單內容留在 game 上、回呼留在模組層，讓 Menu.js 的數字鍵 1–4 能直接選塔。
  // 之前只有滑鼠能選，鍵盤玩家被迫在「手放在方向鍵上」與「移動滑鼠」之間來回。
  //
  // 回呼刻意不放 game.buildMenuPick：tools/check-refactor-refs.mjs 會把任何
  // `game.名字(` 當成 Game 的方法呼叫，而 Game 只認 `  name(...)` 形式的成員
  // （建構子裡的 this.x = 不算），放了就會被判定成重構殘留引用而讓驗證紅燈。
  buildMenuPick = (key) => {
    closeBuildMenu(game);
    buildTDTower(game, socket, key);
  };
  game.buildMenuKeys = items.map((it, i) => ({ index: i + 1, key: it.type, cost: it.cost, name: it.name, affordable: it.affordable }));
  game.ui.showBuildMenu(true, s, items, buildMenuPick, socket);
}

export function buildTDTower(game, socket, key) {
  const d = TD_TOWERS[key];
  if (!d || socket.occupied) return null;
  const cost = tdCost(game, d.cost);
  if (game.gold < cost) {
    game.ui.say(`金幣不足，${d.name}需要 ${cost} 🪙`, '#ffb703', 1.6);
    sound.playHurt();
    return null;
  }
  game.gold -= cost;
  const t = new Turret(socket.x, socket.y, d.type, d.variant || 'standard', socket);
  t.tdKey = key;
  t.dmgType = d.dmgType;
  t.invested = cost;
  if (d.type !== 'barracks') t.priority = 'first';   // 會自己挑目標的塔：預設先打走最前面的怪
  if (d.type === 'barracks') {
    t.maxUnits = 3;
    if (game.level.barracksArt) t.artKey = game.level.barracksArt;   // 主題地圖換兵營外觀（紅警軍營、星海兵營）
  }
  applyTDStats(t);
  socket.occupied = true;
  socket.turret = t;
  game.turrets.push(t);
  game.particles.createShockwave(t.x, t.y, 80, t.fConf.color || '#00e5ff');
  sound.playEvoFanfare();
  updateFacilityHUD(game);
  return t;
}

// 升到下一級（1→2→3）；第 3 級之後要選專精（檢查面板的兩顆按鈕 → chooseTDBranch）
export function upgradeTDTower(game, t) {
  const d = TD_TOWERS[t.tdKey];
  if (t.branch || t.level >= 3) return;
  const cost = tdCost(game, d.up[t.level - 1]);
  if (game.gold < cost) {
    game.ui.say(`金幣不足，升級需要 ${cost} 🪙`, '#ff0055', 1.6);
    sound.playHurt();
    return;
  }
  game.gold -= cost;
  t.invested += cost;
  t.level++;
  const oldHp = t.unitHpMul;
  applyTDStats(t);
  rescaleUnits(game, t, oldHp);
  game.particles.createShockwave(t.x, t.y, 100, '#00f5ff');
  sound.playEvoFanfare();
  updateFacilityHUD(game);
  if (game.inspectedTurret === t) inspectFacility(game, t);
}

export function chooseTDBranch(game, t, key) {
  const b = TD_BRANCHES[key];
  if (!b || t.branch || t.level < 3 || !TD_TOWERS[t.tdKey].branches.includes(key)) return;
  const cost = tdCost(game, b.cost);
  if (game.gold < cost) {
    game.ui.say(`金幣不足，${b.name}需要 ${cost} 🪙`, '#ff0055', 1.6);
    sound.playHurt();
    return;
  }
  game.gold -= cost;
  t.invested += cost;
  t.branch = key;
  t.level = 4;
  const oldType = t.facilityType;
  const oldHp = t.unitHpMul;
  b.apply(t);
  applyTDStats(t);
  if (t.facilityType !== oldType) {
    removeUnitsOf(game, t);   // 兵營改建成地堡：路上的步兵撤回地堡裡
  } else {
    rescaleUnits(game, t, oldHp);
  }
  game.particles.createShockwave(t.x, t.y, 140, t.fConf.color || '#ffd166');
  sound.playEvoFanfare();
  game.ui.say(`${b.icon} 專精完成：【${b.name}】`, '#ffd166', 2.2);
  updateFacilityHUD(game);
  if (game.inspectedTurret === t) inspectFacility(game, t);
}

// 兵營升級時，已經在路上的兵也跟著變強（血量依新舊倍率等比換算）
function rescaleUnits(game, t, oldHpMul) {
  for (const u of game.alliedUnits || []) {
    if (u.facility !== t || u.isDead) continue;
    const k = (t.unitHpMul || 1) / (oldHpMul || 1);
    u.maxHp = Math.round(u.maxHp * k);
    u.hp = Math.round(u.hp * k);
    u.damageMul = t.dmgMul;
    u.spriteKey = tdUnitSprite(t, game.level);   // 升級後換裝（民兵→步兵→重步兵→騎士；主題地圖不變）
  }
}

function removeUnitsOf(game, t) {
  if (game.alliedUnits) game.alliedUnits = game.alliedUnits.filter((u) => u.facility !== t);
}

// 實戰歷練（B 項）：把一次擊殺記在某座塔頭上，升星就立刻重算加成並報訊。
// 兩個來源都走這裡 —— 塔自己的砲火（updateTurrets 的傷害回呼）與兵營小兵的擊殺
// （updateAlliedUnits 讀 AlliedUnit 的 u.kills）。兵營塔自己一發子彈都不會發，
// 少了第二條路它永遠停在 ★0。
function creditKill(game, t) {
  if (!t || !t.addKill || !t.addKill()) return;
  applyTDStats(t);
  const nm = TD_ELITE.name[t.eliteTier] || '';
  const label = t.tdKey && TD_TOWERS[t.tdKey] ? TD_TOWERS[t.tdKey].name : '防禦塔';
  game.ui.say(`⭐ ${label}升上「${nm}」（★${t.eliteTier}）— 累計擊殺 ${t.kills}`, '#ffd166', 1.8);
  if (game.particles) game.particles.createShockwave(t.x, t.y, 70, '#ffd166');
}

// 攻擊類型 × 護甲（魔獸三式矩陣，見 tdtowers.js；TowerDefense 標上 e.armorClass）
function resistMul(t, e) {
  const row = t.dmgType && ARMOR_MUL[t.dmgType];
  if (!row) return 1;
  const m = row[e.armorClass || 'medium'] ?? 1;
  // 穿甲塢（地基加成，js/tdsockets.js）：把倍率往 1 拉近 ——
  // 打重甲的穿刺 0.5 在 p=0.25 時變 0.625，對已經剋制的目標（1.5）則是往下修，
  // 所以它是「均衡器」而不是無腦增傷，擺在長射程樞紐位才划算。
  const p = t.armorPierce || 0;
  return p > 0 ? m + (1 - m) * p : m;
}

export function closeBuildMenu(game) {
  game.buildMenuSocket = null;
  buildMenuPick = null;
  game.buildMenuKeys = null;
  game.ui.showBuildMenu(false);
}

// 數字鍵快速建塔（A 項）：回傳 true 表示按鍵被選單吃掉了，呼叫端不用再處理。
// 金幣不足時仍然回 true —— 選單是開著的，玩家按 1 得到的是「金幣不足」而不是
// 讓事件穿下去觸發別的快捷鍵。
export function pickBuildMenuByIndex(game, index) {
  if (!game.buildMenuSocket || !buildMenuPick || !game.buildMenuKeys) return false;
  const opt = game.buildMenuKeys.find((o) => o.index === index);
  if (!opt) return false;
  buildMenuPick(opt.key);
  return true;
}

// 瞄準優先序：檢查面板的按鈕循環切換（Turret.pickTarget 依此挑目標）
export const TARGET_PRIORITIES = { first: '最前面', last: '最後面', strong: '血最多', close: '最近' };
export function cycleTargetPriority(game, turret) {
  const keys = Object.keys(TARGET_PRIORITIES);
  turret.priority = keys[(keys.indexOf(turret.priority || 'close') + 1) % keys.length];
  inspectFacility(game, turret);
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

  // 守塔關：只能蓋在空的建塔點
  if (game.td && (!socket || socket.occupied)) {
    game.ui.say('🔨 點擊路邊的建塔點來蓋塔', '#ffb703', 1.6);
    return;
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
  // 指揮所光環（地基加成，js/tdsockets.js）：每幀重算一次。守塔一關最多 14 座塔，
  // O(n²) 的距離比較可忽略；寫進 t.auraBoost 供傷害結算與檢查面板讀取。
  // 多座指揮所不疊加（取最大值），避免整排指揮所互相灌成無限增傷。
  const commands = game.turrets.filter((t) => t.auraRadius > 0 && !t.isDead);
  for (const t of game.turrets) {
    let boost = 0;
    if (t.auraRadius <= 0) {
      for (const c of commands) {
        if (c === t) continue;
        if (Math.hypot(c.x - t.x, c.y - t.y) <= c.auraRadius) boost = Math.max(boost, c.auraMul || 0);
      }
    }
    t.auraBoost = boost;
  }

  for (let i = game.turrets.length - 1; i >= 0; i--) {
    const t = game.turrets[i];

    t.update(dt, game.enemies, (target, dmg) => {
      // 等級／地基／訓練場／指揮所光環與守塔的護甲／魔抗都在這裡統一乘上
      const mul = (t.dmgMul || 1) * (1 + (t.auraBoost || 0));
      const wasDead = target.isDead;
      game.damageEnemy(target, Math.round(dmg * mul * resistMul(t, target)), 1, t.x, t.y, t.facilityType || 'turret');
      // 打擊感 (E 項)：命中火花。顏色跟著傷害類型走，玩家光看顏色就知道哪種塔在輸出。
      // 用機率節流 —— 後期一波上百隻，每發都噴粒子會直接把 render 時間吃光。
      if (game.particles && !wasDead && Math.random() < TURRET_SPARK_CHANCE) {
        game.particles.createHitSpark(target.x, target.y, SPARK_COLORS[t.dmgType] || '#e9ecef');
      }
      // 實戰歷練 (B 項)：這一發打死了才算這座塔的擊殺，升星就立刻重算加成並報訊。
      // 只認守塔模式的塔：生存者的砲台沒有走 applyTDStats()，給了星等也不會有效果。
      if (game.td && !wasDead && target.isDead) creditKill(game, t);
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

    // 角色也不能穿過設施：推到外圈，再往切線方向滑一點 ——
    // 只推回外圈的話，正對塔心走（守塔點地移動常見）會永遠卡在塔前
    const p = game.player;
    if (p && !p.isDead) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const minD = t.radius + p.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0) {
        const d = Math.sqrt(d2);
        // 繞行方向在第一次碰到這座塔時決定、離開前不換 —— 每幀重算的話，
        // 越過塔心那條線就會翻面，變成在塔前來回抖
        if (p._slideTower !== t) {
          p._slideTower = t;
          p._slideSide = dy >= 0 ? 1 : -1;
        }
        const slide = (p.speed || 200) * dt;   // 滑動速度＝走路速度，才贏得過「繼續往塔心走」的拉力
        p.x = t.x + (dx / d) * minD - (dy / d) * p._slideSide * slide;
        p.y = t.y + (dy / d) * minD + (dx / d) * p._slideSide * slide;
      } else if (p._slideTower === t) {
        p._slideTower = null;
      }
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
    row.innerHTML = `<div class="slot-info"><b style="color:${c.sect.qi}">${c.name}</b><span>${c.sect.label}門下</span></div>`;
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
  game.ui.say(`🗡️ ${REALM[m.level - 1]}${m.sect.label}門下・${m.name}報到！(${cost} 🪙) 斬妖累積經驗、突破境界`, '#3ddc84', 2.4);
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
  // 兵營小兵也吃指揮所光環：auraBoost 由 updateTurrets 每幀寫在母塔上，
  // 這裡同步回 u.damageMul（平時 u.damageMul 是 rescaleUnits 依塔等級寫入的固定值）
  for (const u of game.alliedUnits) {
    const t = u.facility;
    if (t) u.damageMul = (t.dmgMul || 1) * (1 + (t.auraBoost || 0));
    // 兵營小兵的擊殺記回自己的兵營（見 creditKill）：u.kills 由 AlliedUnit 的
    // enlistHit 累加，這裡只認「還沒報帳過的差額」，所以換人接手也不會記錯。
    if (game.td && t && u.kills) {
      const owed = u.kills - (u.killsCredited || 0);
      if (owed > 0) {
        u.killsCredited = u.kills;
        for (let k = 0; k < owed; k++) creditKill(game, t);
      }
    }
  }
  for (let i = game.alliedUnits.length - 1; i >= 0; i--) {
    const u = game.alliedUnits[i];
    // 有逐格動畫的守塔小兵：倒下後先播 0.8 秒陣亡動畫再移除（期間不動、不擋路）
    if (u.isDead && u.spriteKey) {
      u.deathT = (u.deathT || 0) + dt;
      if (u.deathT >= 0.8) game.alliedUnits.splice(i, 1);
      continue;
    }
    u.update(dt, game.enemies, game);
    if (u.ttl != null && (u.ttl -= dt) <= 0) {   // 英雄「援軍」的限時步兵：時間到就撤離
      game.alliedUnits.splice(i, 1);
      continue;
    }

    // 敵人貼近碰撞與推擠阻截（飛行怪從頭上飛過去）
    for (const e of game.enemies) {
      if (e.isDead || e.flying) continue;
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
        if (!u.spriteKey && game.particles) game.particles.createExplosion(u.x, u.y, 25);
        sound.playHurt();
      }
      if (!u.spriteKey) game.alliedUnits.splice(i, 1);   // 有動畫的留給上面的陣亡倒數
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
