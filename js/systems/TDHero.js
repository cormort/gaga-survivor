// 守塔英雄：主角在守塔關（game.td）改成經典守塔的「英雄」——
//   點空地走過去（拖曳是平移地圖，見 Menu.js；WASD 仍可用）
//   每清一波自動升一級：武器傷害與血量 ×1.12（取代生存者的撿寶石升級卡）
//   陣亡不會結束遊戲：RESPAWN 秒後在核心旁復活
//   Q / R 是兩招守塔技能（所有角色共用、只看冷卻不吃靈力；技能欄沿用 Skills.js）

import { GuardsmanUnit, applyTDSoldier } from '../entities/AlliedUnit.js';
import { sound } from '../audio.js';

const RESPAWN = 8;          // 復活秒數
const LEVEL_MUL = 1.12;     // 每升一級：傷害、最大血量的倍率
const ARRIVE = 10;          // 離目的地這麼近就停下

export const TD_SKILLS = [
  {
    name: '援軍', icon: '🛡️', mp: 0, cd: 20,
    desc: '在英雄身旁召來 2 名步兵上路擋怪，持續 15 秒',
    cast(game) {
      const p = game.player;
      const lv = p.heroLevel || 1;
      for (const dx of [-22, 22]) {
        const u = new GuardsmanUnit(p.x + dx, p.y, null, game);
        u.maxHp = u.hp = Math.round(u.maxHp * (1 + 0.15 * (lv - 1)));
        u.ttl = 15;   // updateAlliedUnits 倒數，時間到就撤退（消失）
        applyTDSoldier(u, game.level.soldier || 'unit_footman_2', game.level);
        game.alliedUnits.push(u);
      }
      game.particles.createShockwave(p.x, p.y, 80, '#4d8dff');
    },
  },
  {
    name: '隕石', icon: '☄️', mp: 0, cd: 25,
    desc: '隕石砸向走得最前面的 3 隻怪，各自炸傷周圍 100 範圍',
    cast(game) {
      // 傷害跟著當前波次的怪物血量走（50 倍基礎血量），後期不會刮痧
      const dmg = Math.round(50 * game.td.hpMul() * (1 + 0.1 * ((game.player.heroLevel || 1) - 1)));
      const targets = game.enemies.filter((e) => !e.isDead).sort((a, b) => (b.progress || 0) - (a.progress || 0)).slice(0, 3);
      for (const t of targets) {
        const { x, y } = t;
        game.particles.createExplosion(x, y, 110);
        game.particles.createShockwave(x, y, 120, '#ff7b00');
        for (const e of game.enemies) {
          if (e.isDead || Math.hypot(e.x - x, e.y - y) > 100 + e.radius) continue;
          e.takeDamage(dmg, 8, x, y);
          game.particles.createDamageText(e.x, e.y, e.lastDamageTaken || dmg, true);
        }
      }
      sound.playExplosion();
      game.camera.shake = Math.max(game.camera.shake, 10);
    },
  },
];

// 主迴圈用的移動向量：有按方向鍵就聽鍵盤（並取消點地目標），否則沿著路網的路徑點走向點地目標
export function heroMoveVector(game) {
  const v = game.input.vector;
  if (v.x || v.y) {
    game.heroTarget = null;
    game.heroRoute = null;
    return v;
  }
  const route = game.heroRoute;
  if (!route || !route.length) return v;
  let next = route[0];
  let d = Math.hypot(next.x - game.player.x, next.y - game.player.y);
  while (d < ARRIVE) {   // 到了這個路徑點就換下一個
    route.shift();
    if (!route.length) {
      game.heroTarget = null;
      game.heroRoute = null;
      return v;
    }
    next = route[0];
    d = Math.hypot(next.x - game.player.x, next.y - game.player.y);
  }
  return { x: (next.x - game.player.x) / d, y: (next.y - game.player.y) / d };
}

// 點地：目的地夾回最近的路面（英雄只能走在路上），再沿路網排出路徑點
export function setHeroTarget(game, x, y) {
  const p = game.player;
  const t = game.td.clampToRoad(x, y, p.radius * 0.5);
  game.heroTarget = t;
  game.heroRoute = game.td.roadRoute(p, t);
}

// 每幀把英雄夾回路面（方向鍵、翻滾、復活點都可能把人帶出路外）
export function keepHeroOnRoad(game) {
  const p = game.player;
  const c = game.td.clampToRoad(p.x, p.y, p.radius * 0.5);
  p.x = c.x;
  p.y = c.y;
}

// 陣亡倒數與復活（主迴圈在英雄死亡時每幀呼叫）
export function updateHeroRespawn(game, dt) {
  const p = game.player;
  if (game._heroRespawn == null) {
    game._heroRespawn = RESPAWN;
    game.heroTarget = null;
    game.heroRoute = null;
    game.ui.say(`💀 英雄倒下了！${RESPAWN} 秒後在核心旁復活`, '#ff5e5e', 2.5);
    return;
  }
  game._heroRespawn -= dt;
  if (game._heroRespawn > 0) return;
  game._heroRespawn = null;
  p.isDead = false;
  p.hp = p.maxHp;
  const spot = game.td.clampToRoad(game.core.x, game.core.y + game.core.radius + 40, p.radius * 0.5);   // 核心旁最近的路面
  p.x = spot.x;
  p.y = spot.y;
  p.invulnerableTimer = 2;
  game.particles.createShockwave(p.x, p.y, 90, '#ffd166');
  sound.playEvoFanfare();
  game.ui.say('✨ 英雄復活！', '#ffd166', 1.6);
}

// 清完一波：英雄升一級
export function heroLevelUp(game) {
  const p = game.player;
  if (!p) return;
  p.heroLevel = (p.heroLevel || 1) + 1;
  p.modeDmgMul *= LEVEL_MUL;
  p.heroHpMul = (p.heroHpMul || 1) * LEVEL_MUL;
  game.weaponManager.applyPassives();   // modeDmgMul、heroHpMul 都在 applyPassives 裡套用
  if (!p.isDead) p.hp = p.maxHp;
  game.particles.createShockwave(p.x, p.y, 70, '#ffd166');
}

// 點地目標的小標記（在路線之後、單位之前畫）
export function drawHeroTarget(game, ctx, cam) {
  const t = game.heroTarget;
  if (!t) return;
  const r = 14 + Math.sin(game.gameTime * 8) * 3;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,209,102,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(t.x - cam.x, t.y - cam.y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
