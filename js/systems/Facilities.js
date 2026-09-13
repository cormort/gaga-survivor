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
import { Mercenary, MERC } from '../entities/Mercenary.js';
import { Projectile } from '../entities/Projectile.js';
import { sound } from '../audio.js';

// 金幣乘數的天花板。天賦財運 × 模式 × 祝福 × 每日規則 × 淘金潮是純乘法疊加、
// 原本沒有上限 —— 實測空存檔 23 分鐘 5.8 萬金，帶滿 meta 加成的存檔同時間 142 萬，
// 差 25 倍，砲塔與傭兵變成無限供應。
const GOLD_MUL_CAP = 8;

export function getFacilityCost(game, type = 'turret') {
  const conf = FACILITY_TYPES[type] || FACILITY_TYPES.turret;
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

export function buildFacility(game, type = 'turret') {
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

  const minD = conf.minSpacing || 40;
  const tooClose = game.turrets.some(
    (t) => Math.hypot(t.x - game.player.x, t.y - game.player.y) < minD
  );
  if (tooClose) {
    game.ui.say('這裡太靠近其他工事設施了', '#ffb703', 1.6);
    return;
  }

  game.gold -= cost;
  const facility = new Turret(game.player.x, game.player.y, type);
  if (game.player && game.player.facilityHpMul) {
    facility.maxHp = Math.round(facility.maxHp * game.player.facilityHpMul);
    facility.hp = facility.maxHp;
  }
  game.turrets.push(facility);

  const fxColor = type === 'electric_grid' ? '#b5179e' : type === 'purifier' ? '#00f59b' : type === 'barricade' ? '#ffb703' : '#00e5ff';
  game.particles.createShockwave(game.player.x, game.player.y, 80, fxColor);
  sound.playEvoFanfare();
  game.ui.say(`已部署【${conf.name}】！`, fxColor, 1.4);
  updateFacilityHUD(game);
}

export function buildTurret(game) {
  buildFacility(game, 'turret');
}

export function grantStarterTurret(game) {
  if (!game.core || !game.mode.turrets) return;
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
    }, game.player, this);

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
      t.takeDamage(e.damage * dt * 1.5, e);
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
    game.ui.say('生存者模式沒有傭兵 —— 靠走位活下來', '#8a9bb0', 1.6);
    return;
  }
  if (game.mercenaries.length >= MERC.maxCount) {
    game.ui.say(`傭兵小隊已滿員 (${MERC.maxCount}/${MERC.maxCount})`, '#8a9bb0', 1.6);
    sound.playHurt();
    return;
  }
  const cost = game.mercCost;
  if (game.gold < cost) {
    game.ui.say(`金幣不足，僱傭傭兵需要 ${cost} 🪙`, '#ff0055', 1.8);
    sound.playHurt();
    return;
  }
  game.gold -= cost;
  const m = new Mercenary(game.player.x, game.player.y, game.mercenaries.length);
  game.mercenaries.push(m);
  game.particles.createShockwave(game.player.x, game.player.y, 90, '#3ddc84');
  sound.playEvoFanfare();
  game.ui.say(`💂 傭兵報到！(${cost} 🪙) 擊殺敵人可升級`, '#3ddc84', 2.4);
  game.ui.updateHUD(game.player, game.gameTime, game.kills, game.gold);
  game.ui.updateBuildBtn(game.gold, game.turretCost);
  // 四種設施按鈕一起刷新 (內部有值快取，每幀呼叫不會產生多餘的 DOM 寫入)
  game.ui.updateFacilityButtons(game.gold, (type) => getFacilityCost(game, type));
  game.ui.updateHireBtn(game.mercCost, game.gold >= (game.mercCost || 1e9));
}

export function updateMercenaries(game, dt) {
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
        damage: merc.damage,
        radius: 6,
        pierce: 1,
        life: 1.7,
        knockback: 1,
        mercOwner: merc,
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
      game.particles.createShockwave(m.x, m.y, 80, '#4a7c3f');
      sound.playHurt();
      game.ui.say('💂 傭兵陣亡！重新僱傭一位吧', '#ff5e5e', 2.2);
      game.mercenaries.splice(i, 1);
      game.ui.updateHireBtn(game.mercCost, game.gold >= (game.mercCost || 1e9));
    }
  }
}

export function facilityGoldMul(game) {
  // 淘金狂潮與幸運藥劑都改成「讀計時器」而不是改動 metaGoldMul：
  // 乘數本身可以隨時被重算，不會再有「到期還原一次」造成永久殘留的問題。
  let mul = game.metaGoldMul || 1;
  if (game._goldRushTimer > 0) mul *= 2;
  if (game.player && game.player.luckPotionTimer > 0) mul *= 2;
  return Math.min(GOLD_MUL_CAP, mul);
}
