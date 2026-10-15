// 魔化十二生肖的招牌技（無盡模式 Boss）：每隻一招，混在 behaviors 裡跟通用技能輪流出。
// 由 main.handleBossSkill 分派；延遲效果用 weaponManager.schedule（局內時間，暫停會停）。
import { Enemy } from '../entities/Enemy.js';
import { placeHazard } from './Hazards.js';
import { enemyScale, hazardDmgScale } from '../levels.js';
import { sound } from '../audio.js';

const alive = (b) => !b.isDead && b.hp > 0;
const aim = (game, b) => Math.atan2(game.player.y - b.y, game.player.x - b.x);

// 召喚同族小怪（血量比照通用 summon：刻意壓低）
function summonKin(game, boss, type, n, dist = 110) {
  if (game.enemies.length >= 230) return;
  const scale = enemyScale(game.gameTime, game.level, game.rules);
  scale.hp = (1 + game.gameTime / 90) * (game.level ? game.level.hpScale : 1) * 0.6 * game.spawner.adaptiveHpMul;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    game.enemies.push(new Enemy(type, boss.x + Math.cos(a) * dist, boss.y + Math.sin(a) * dist, scale));
  }
}

function shoot(game, boss, angle, { speed = 260, damage = 16, radius = 8, color = '#ff0055', glow = '#ff5400' } = {}) {
  game.spawnEnemyProjectile(boss, {
    x: boss.x + Math.cos(angle) * (boss.radius + 12),
    y: boss.y + Math.sin(angle) * (boss.radius + 12),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    damage, radius, life: 4.5, color, glow,
  });
}

// 預警圈：fuse 秒後爆炸（與通用 ground 技能同一個 schema）
function mine(game, boss, x, y, { r = 100, fuse = 1.4, dmg = 18, color = '#ff0055' } = {}) {
  game.hazards.push({
    kind: 'mine', x, y, r, color, t: 0, tick: 0.5, fuse, dur: 0, dmg, dmgEnemy: 0,
    element: boss.element || 'physical', scale: hazardDmgScale(game.gameTime), source: `${boss.name}・${boss._zodiacSkill}`,
  });
}

export const ZODIAC_ACTS = {
  // 子鼠：鼠疫潮 —— 一圈疫病魔鼠（死後留毒區），不清就越滾越多
  rat_plague(game, b) {
    summonKin(game, b, 'rat_evil', 6);
  },
  // 丑牛：裂地踐踏 —— 朝特工方向一路裂開 6 個預警圈，越遠越晚爆
  ox_fissure(game, b) {
    const a = aim(game, b);
    for (let i = 1; i <= 6; i++) mine(game, b, b.x + Math.cos(a) * i * 90, b.y + Math.sin(a) * i * 90, { r: 70, fuse: 0.8 + i * 0.15, dmg: 22, color: '#c9a227' });
    game.camera.shake = Math.max(game.camera.shake, 10);
  },
  // 寅虎：猛虎撲殺 —— 特工腳下亮圈，0.9 秒後虎身撲到那個位置並爆開
  tiger_pounce(game, b) {
    const { x, y } = game.player;
    mine(game, b, x, y, { r: 95, fuse: 0.9, dmg: 24, color: '#ff5400' });
    game.weaponManager.schedule(0.9, () => { if (alive(b)) { b.x = x; b.y = y; } });
  },
  // 卯兔：月兔搗冰 —— 特工四周一圈 7 個冰爆圈，留一個缺口逃生
  rabbit_moon(game, b) {
    const gap = Math.floor(Math.random() * 8);
    for (let i = 0; i < 8; i++) {
      if (i === gap) continue;
      const a = (i / 8) * Math.PI * 2;
      mine(game, b, game.player.x + Math.cos(a) * 150, game.player.y + Math.sin(a) * 150, { r: 80, fuse: 1.5, dmg: 18, color: '#90e0ef' });
    }
  },
  // 辰龍：龍息 —— 三波扇形火焰彈，每波追著特工當下的位置
  dragon_breath(game, b) {
    for (let w = 0; w < 3; w++) {
      game.weaponManager.schedule(w * 0.3, () => {
        if (!alive(b)) return;
        const a = aim(game, b);
        for (let i = -3; i <= 3; i++) shoot(game, b, a + i * 0.12, { speed: 300, damage: 14, color: '#ff7b00', glow: '#ffd166' });
      });
    }
    sound.playShoot();
  },
  // 巳蛇：毒涎 —— 在自己與特工之間吐出三攤毒池，切斷走位路線
  snake_venom(game, b) {
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      placeHazard(game, { type: 'pool', radius: 95, dur: 6, dmg: 7, color: '#38b000', element: 'toxic', source: `${b.name}・毒涎` },
        b.x + (game.player.x - b.x) * t, b.y + (game.player.y - b.y) * t);
    }
  },
  // 午馬：烈馬奔騰 —— 兩圈 360° 火焰彈，第二圈錯開半格
  horse_stampede(game, b) {
    for (let w = 0; w < 2; w++) {
      game.weaponManager.schedule(w * 0.45, () => {
        if (!alive(b)) return;
        for (let i = 0; i < 12; i++) shoot(game, b, ((i + w * 0.5) / 12) * Math.PI * 2, { speed: 220, damage: 15, color: '#ff4800' });
      });
    }
  },
  // 未羊：羊角結界 —— 6 秒受傷 -60%，並召兩隻巴弗煞羊護駕（先清羊再打本體）
  goat_ward(game, b) {
    b.damageTakenMul *= 0.4;
    summonKin(game, b, 'goat_evil', 2, 90);
    game.weaponManager.schedule(6, () => { b.damageTakenMul /= 0.4; });
    game.particles.createShockwave(b.x, b.y, b.radius * 3, '#9c19e6');
  },
  // 申猴：七十二變 —— 連續三次閃到特工身旁，每次落地放一圈電擊震波
  monkey_blink(game, b) {
    for (let i = 0; i < 3; i++) {
      game.weaponManager.schedule(i * 0.7, () => {
        if (!alive(b)) return;
        const a = Math.random() * Math.PI * 2;
        b.x = game.player.x + Math.cos(a) * 170;
        b.y = game.player.y + Math.sin(a) * 170;
        mine(game, b, b.x, b.y, { r: 110, fuse: 0.45, dmg: 16, color: '#00e5ff' });
      });
    }
  },
  // 酉雞：金雞報曉 —— 三波旋轉羽刃，每波轉 15°
  rooster_dawn(game, b) {
    for (let w = 0; w < 3; w++) {
      game.weaponManager.schedule(w * 0.35, () => {
        if (!alive(b)) return;
        for (let i = 0; i < 8; i++) shoot(game, b, (i / 8) * Math.PI * 2 + w * 0.26, { speed: 240, damage: 14, color: '#ffd60a', glow: '#00e5ff' });
      });
    }
  },
  // 戌狗：地獄犬群 —— 四隻地獄狂犬從兩側包抄
  dog_pack(game, b) {
    summonKin(game, b, 'dog_evil', 4, 140);
  },
  // 亥豬：暴食狂化 —— 回 8% 血，6 秒移速 ×1.5
  pig_frenzy(game, b) {
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.08);
    b.speed *= 1.5;
    game.weaponManager.schedule(6, () => { b.speed /= 1.5; });
    game.particles.createDamageText(b.x, b.y - b.radius, '暴食！', true);
    game.particles.createShockwave(b.x, b.y, b.radius * 3, '#b5179e');
  },
};

// 招牌技中文名：施放時畫面提示用
export const ZODIAC_ACT_NAMES = {
  rat_plague: '鼠疫潮', ox_fissure: '裂地踐踏', tiger_pounce: '猛虎撲殺', rabbit_moon: '月兔搗冰',
  dragon_breath: '龍息', snake_venom: '毒涎', horse_stampede: '烈馬奔騰', goat_ward: '羊角結界',
  monkey_blink: '七十二變', rooster_dawn: '金雞報曉', dog_pack: '地獄犬群', pig_frenzy: '暴食狂化',
};
