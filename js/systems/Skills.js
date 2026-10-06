// 修仙六脈主動技能 (Q / R)：消耗靈力、各自冷卻。只有修仙角色有技能欄。
// 傷害以 enemyScale 的血量倍率成長 (與聖水同一條曲線)，後期不會變成刮痧。

import { enemyScale } from '../levels.js';
import { sound } from '../audio.js';
import { TD_SKILLS } from './TDHero.js';
import { spawnSwordFormation } from './SwordFormation.js';
import { spawnSignatureFX } from './SignatureFX.js';

const KEYS = ['Q', 'R'];

// 以玩家為圓心 (或指定點) 的範圍傷害；回傳命中數
function aoe(game, x, y, radius, mul, { knock = 10, stun = 0 } = {}) {
  const dmg = Math.round(mul * 100 * enemyScale(game.gameTime, game.level, game.rules).hp);
  let hits = 0;
  for (const e of game.enemies) {
    if (e.isDead) continue;
    if (Math.hypot(e.x - x, e.y - y) > radius + e.radius) continue;
    e.takeDamage(dmg, knock, x, y);
    if (stun) e.applyStun(stun);
    game.particles.createDamageText(e.x, e.y, dmg, true);
    hits++;
  }
  return hits;
}

// 離玩家最近的 n 隻 (限 range 內)
function nearest(game, n, range) {
  const p = game.player;
  return game.enemies
    .filter((e) => !e.isDead && Math.hypot(e.x - p.x, e.y - p.y) <= range)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    .slice(0, n);
}

function strike(game, e, mul, color, stun = 0) {
  game.particles.createLightning(e.x, e.y, 60);
  aoe(game, e.x, e.y, 50, mul, { knock: 6, stun });
  game.particles.createShockwave(e.x, e.y, 60, color);
}

export const SKILLS = {
  xian_sword: [
    { name: '人劍合一', icon: '🗡️', mp: 30, cd: 6, desc: '御劍前衝 220 距離，斬過路徑上所有敵人',
      cast(game) {
        const p = game.player;
        const v = game.input.vector;
        const len = Math.hypot(v.x, v.y);
        const dx = len > 0.1 ? v.x / len : p.facing || 1;
        const dy = len > 0.1 ? v.y / len : 0;
        const x0 = p.x;
        const y0 = p.y;
        for (let t = 0; t <= 1.0001; t += 0.2) aoe(game, x0 + dx * 220 * t, y0 + dy * 220 * t, 45, 0.6, { knock: 4 });
        p.x += dx * 220;
        p.y += dy * 220;
        p.invulnerableTimer = Math.max(p.invulnerableTimer, 0.3);
        game.particles.createShockwave(p.x, p.y, 90, '#6ea8ff');
      } },
    { name: '萬劍歸宗', icon: '⚔️', mp: 80, cd: 20, desc: '萬劍插地成陣、旋轉掃斬周身 300 範圍敵人，收招時歸宗再收一劍',
      cast(game) {
        // 傷害契約：落地一擊 1.2× ＋ 劍陣掃斬 6×0.3× = 3.0×（＝舊版 aoe(...,3) 的總量）
        // 其餘（落劍、劍氣、歸宗）都在 js/systems/SwordFormation.js
        spawnSwordFormation(game);
      } },
  ],
  xian_talisman: [
    { name: '烈火符', icon: '📜', mp: 30, cd: 6, desc: '飛符引爆最近的敵人，炸傷 130 範圍',
      cast(game) {
        const [e] = nearest(game, 1, 500);
        const x = e ? e.x : game.player.x;
        const y = e ? e.y : game.player.y;
        game.particles.createExplosion(x, y, 130);
        aoe(game, x, y, 130, 1.4);
      } },
    { name: '天火燎原', icon: '🔥', mp: 80, cd: 20, desc: '五道天火符連環引爆周圍敵群，留下一圈燃燒的符火陣',
      cast(game) {
        const targets = nearest(game, 5, 520);
        const p = game.player;
        const sites = [];
        for (let i = 0; i < 5; i++) {
          const e = targets[i];
          const a = (i / 5) * Math.PI * 2;
          const x = e ? e.x : p.x + Math.cos(a) * 160;
          const y = e ? e.y : p.y + Math.sin(a) * 160;
          game.particles.createExplosion(x, y, 150, true);
          aoe(game, x, y, 150, 1.6);      // 傷害與舊版一字不差（5 × 150 半徑 × 1.6×）
          sites.push({ x, y, a });
        }
        spawnSignatureFX(game, 'fire', { sites });
      } },
  ],
  xian_mage: [
    { name: '掌心雷', icon: '⚡', mp: 30, cd: 6, desc: '掌心引雷，劈向最近的 3 名敵人',
      cast(game) {
        for (const e of nearest(game, 3, 480)) strike(game, e, 1.5, '#e8f0ff');
      } },
    { name: '九天雷劫', icon: '🌩️', mp: 80, cd: 20, desc: '雷雲聚頂、召下九天神雷，雷霆依序劈擊 12 名敵人並麻痺 1.5 秒',
      cast(game) {
        // 目標在施放當下鎖定（12 名最近的敵人），雷柱依序打下。
        // 傷害總量與舊版相同：12 道 × aoe(50, 2.2×, 麻痺 1.5s)，只是從瞬發變成 0.04 秒一道。
        spawnSignatureFX(game, 'thunder', { targets: nearest(game, 12, 560) });
        game.camera.shake = Math.max(game.camera.shake, 10);
      } },
  ],
  xian_alchemy: [
    { name: '回春丹', icon: '💊', mp: 30, cd: 6, desc: '服下回春丹，回復 25% 生命',
      cast(game) {
        const p = game.player;
        const amt = Math.round(p.maxHp * 0.25);
        p.heal(amt);
        game.particles.createShockwave(p.x, p.y, 100, '#3ddc84');
        game.particles.createDamageText(p.x, p.y, `+${amt} HP`, false);
      } },
    { name: '九轉金丹', icon: '🟡', mp: 80, cd: 20, desc: '丹爐現形煉出金丹：生命全滿，10 秒內攻擊力 +40%',
      cast(game) {
        const p = game.player;
        p.heal(p.maxHp);
        p.atkPotionTimer = Math.max(p.atkPotionTimer, 10);
        game.particles.createShockwave(p.x, p.y, 160, '#ffd166');
        spawnSignatureFX(game, 'pill');
      } },
  ],
  xian_zen: [
    { name: '金剛罩', icon: '🔔', mp: 30, cd: 6, desc: '鐘形金罩護體：獲得 40% 生命的護盾，5 秒內受傷減半',
      cast(game) {
        const p = game.player;
        p.shield = Math.max(p.shield, Math.round(p.maxHp * 0.4));
        p.shieldPotionTimer = Math.max(p.shieldPotionTimer, 5);
        game.particles.createShockwave(p.x, p.y, 110, '#ffd166');
      } },
    { name: '獅子吼', icon: '🦁', mp: 80, cd: 20, desc: '身後現出佛光輪，獅吼震退 280 範圍敵人並使其暈眩 2 秒',
      cast(game) {
        const p = game.player;
        game.particles.createShockwave(p.x, p.y, 280, '#ffd166');
        game.camera.shake = Math.max(game.camera.shake, 12);
        aoe(game, p.x, p.y, 280, 1.2, { knock: 40, stun: 2 });
        spawnSignatureFX(game, 'lion');
      } },
  ],
  xian_demon: [
    { name: '血祭', icon: '🩸', mp: 30, cd: 6, desc: '血氣爆發傷害 180 範圍，每命中一名回復 2% 生命',
      cast(game) {
        const p = game.player;
        game.particles.createShockwave(p.x, p.y, 180, '#b388ff');
        const hits = aoe(game, p.x, p.y, 180, 1.3);
        if (hits) p.heal(Math.round(p.maxHp * 0.02 * Math.min(hits, 15)));
      } },
    { name: '血魔化身', icon: '👹', mp: 80, cd: 20, desc: '血霧爆開、血蓮綻放：無敵 1.5 秒、8 秒攻擊力 +40%，並爆發 240 範圍傷害',
      cast(game) {
        const p = game.player;
        p.invulnerableTimer = Math.max(p.invulnerableTimer, 1.5);
        p.atkPotionTimer = Math.max(p.atkPotionTimer, 8);
        game.particles.createExplosion(p.x, p.y, 240, true);
        aoe(game, p.x, p.y, 240, 2);
        // 演出活 8 秒＝化身期間（血氣纏身就是「我還在化身」的視覺依據）
        spawnSignatureFX(game, 'blood');
      } },
  ],
};

// 守塔關一律換成守塔英雄的兩招（TDHero.js），生存者照角色決定
export function skillsFor(characterId, game = null) {
  if (game && game.td) return TD_SKILLS;
  return SKILLS[characterId] || null;
}

// 施放第 idx 招；靈力或冷卻不足時提示並回傳 false
export function castSkill(game, idx) {
  if (game.state !== 'PLAYING' || !game.player || game.player.isDead) return false;
  const p = game.player;
  const list = skillsFor(game.characterId, game);
  const s = list?.[idx];
  if (!s) return false;
  p.skillCd = p.skillCd || [0, 0];
  if (p.skillCd[idx] > 0) return false;
  if (s.mp && p.mp < s.mp) {
    game.ui.say(`靈力不足（${s.name} 需要 ${s.mp}）`, '#4d8dff', 1.2);
    return false;
  }
  if (s.mp) p.mp -= s.mp;
  p.skillCd[idx] = s.cd;
  s.cast(game);
  sound.playEvoFanfare();
  game.ui.say(`${s.icon} ${s.name}！`, '#6ea8ff', 1.2);
  return true;
}

// 每幀：冷卻倒數 + 技能欄 HUD
export function updateSkills(game, dt) {
  const p = game.player;
  const list = skillsFor(game.characterId, game);
  const bar = document.getElementById('skill-bar');
  if (!bar) return;
  if (!list || !p) {
    bar.classList.add('hidden');
    return;
  }
  p.skillCd = p.skillCd || [0, 0];
  for (let i = 0; i < p.skillCd.length; i++) if (p.skillCd[i] > 0) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
  const barKey = game.td ? 'td' : game.characterId;   // 同一角色在守塔／生存者之間切換也要重建技能欄
  if (bar.dataset.char !== barKey) {
    bar.dataset.char = barKey;
    bar.innerHTML = list.map((s, i) => `
      <button class="skill-slot" data-skill="${i}" title="【${s.name}】${s.desc}（${s.mp ? `靈力 ${s.mp}，` : ''}冷卻 ${s.cd} 秒，按 ${KEYS[i]}）">
        <span class="skill-icon">${s.icon}</span>
        <span class="skill-key">${KEYS[i]}</span>
        ${s.mp ? `<span class="skill-mp">${s.mp}</span>` : ''}
        <span class="skill-cd"></span>
      </button>`).join('');
    bar.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => castSkill(game, Number(b.dataset.skill))));
  }
  bar.classList.remove('hidden');
  bar.querySelectorAll('[data-skill]').forEach((b, i) => {
    const cd = p.skillCd[i];
    const lack = !!list[i].mp && p.mp < list[i].mp;
    b.classList.toggle('no-mp', lack && cd <= 0);
    const ov = b.querySelector('.skill-cd');
    const h = cd > 0 ? `${Math.round((cd / list[i].cd) * 100)}%` : '0%';
    if (ov.style.height !== h) ov.style.height = h;
    const txt = cd > 0 ? Math.ceil(cd) : '';
    if (ov.textContent !== String(txt)) ov.textContent = txt;
  });
}
