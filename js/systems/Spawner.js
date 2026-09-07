// 怪物生成器：完全照關卡資料 (js/levels.js) 的波次與 Boss 排程操課。
// 無盡模式 (endless) 是唯一例外：波次間隔/數量隨時間成長，Boss 固定 90 秒輪播。

import { Enemy } from '../entities/Enemy.js';
import { LEVELS, currentWave, pickEnemy, ENDLESS_BOSS_CYCLE, ENDLESS_BOSS_INTERVAL } from '../levels.js';
import { GAME_CONFIG } from '../config.js';
import { ELITE_AFFIXES } from '../config.js';

const MAX_ENEMIES = 250;

export class Spawner {
  constructor() {
    this.setLevel('street');
  }

  setLevel(levelId) {
    this.level = LEVELS[levelId] || LEVELS.street;
    this.reset();
  }

  reset() {
    this.spawnTimer = 0;
    this.bossIndex = 0;         // 下一隻要生的 Boss 在 level.bosses 的位置 (一般關卡)
    this.bossRef = null;
    this.endlessBossIdx = 0;    // 無盡模式的 Boss 輪播指標
    this.nextEndlessBossAt = ENDLESS_BOSS_INTERVAL; // 開場 90 秒後第一隻
  }

  update(dt, gameTime, player, enemies, onBossSpawnCallback = null) {
    const level = this.level;

    // Boss 排程：無盡模式 = 固定週期輪播深淵 Boss；一般關卡 = 時間表
    if (level.id === 'endless') {
      if (gameTime >= this.nextEndlessBossAt) {
        this.nextEndlessBossAt = gameTime + ENDLESS_BOSS_INTERVAL;
        const def = ENDLESS_BOSS_CYCLE[this.endlessBossIdx % ENDLESS_BOSS_CYCLE.length];
        this.endlessBossIdx++;
        // 血量與時俱進，名稱加「深淵·」前綴區隔；剝掉 final 旗標避免被誤判為通關
        this.spawnBoss(
          { ...def, final: false, hp: Math.round(def.hp * (1 + gameTime / 350)), name: '深淵·' + def.name },
          player, enemies, onBossSpawnCallback
        );
      }
    } else {
      const nextBoss = level.bosses[this.bossIndex];
      if (nextBoss && gameTime >= nextBoss.at) {
        this.bossIndex++;
        this.spawnBoss(nextBoss, player, enemies, onBossSpawnCallback);
      }
    }

    // 一般波次
    this.spawnTimer += dt;
    const wave = currentWave(level, gameTime);

    // 無盡模式：間隔隨時間縮短、單次數量增加 (有上限避免一口氣灌爆)
    let interval = wave.interval;
    let batch = wave.batch;
    if (level.id === 'endless') {
      interval = Math.max(0.15, 0.55 - gameTime * 0.00055);
      batch = 1 + Math.min(5, Math.floor(gameTime / 150));
    }

    if (this.spawnTimer < interval) return;
    this.spawnTimer = 0;

    if (enemies.length >= MAX_ENEMIES) return;

    // 雜兵血量隨時間與關卡難度成長 (無盡模式額外疊時間係數)
    const hpMultiplier =
      (1 + (gameTime / 60) * 0.4) * level.hpScale * (level.id === 'endless' ? 1 + gameTime / 300 : 1);
    for (let i = 0; i < batch; i++) {
      const pos = this.getSpawnPosition(player, 480 + Math.random() * 120);
      const e = new Enemy(pickEnemy(wave.pool), pos.x, pos.y, hpMultiplier);
      this.rollElite(e, gameTime);
      enemies.push(e);
    }
  }

  // 精英詞綴：機率隨時間從 3.5% 緩升到 10% (Boss 與召喚小怪不套用)
  rollElite(enemy, gameTime) {
    if (enemy.isBoss) return;
    const chance = Math.min(0.1, 0.035 + gameTime / 9000);
    if (Math.random() >= chance) return;
    const keys = Object.keys(ELITE_AFFIXES);
    enemy.makeElite(keys[Math.floor(Math.random() * keys.length)]);
  }

  spawnBoss(def, player, enemies, onBossSpawnCallback) {
    const pos = this.getSpawnPosition(player, 550);
    const boss = new Enemy('boss', pos.x, pos.y, 1);
    boss.maxHp = boss.hp = def.hp;
    boss.name = def.name;
    // 關卡主題外觀：一般 Boss 用該關皮膚，最終 Boss 換更大號的「最終」變體
    boss.skin = def.skin ? (def.final ? def.skin + '_final' : def.skin) : undefined;
    // 關卡專屬技能：charge 內建衝鋒，額外技能由 def.behaviors 帶入
    boss.behaviors = Array.isArray(def.behaviors) && def.behaviors.length > 0 ? def.behaviors.slice() : [];
    boss.skillTimer = 4 + Math.random() * 2;

    if (def.final) {
      boss.isFinal = true;
      boss.radius *= 1.25;
      boss.damage = Math.round(boss.damage * 1.4);
    }

    enemies.push(boss);
    this.bossRef = boss;
    if (onBossSpawnCallback) onBossSpawnCallback(boss);
  }

  getSpawnPosition(player, distance) {
    const b = GAME_CONFIG.WORLD_BOUNDS;
    const margin = 60;
    // 生成點要夾回世界邊界內 (不然怪會生在紅牆外走不進來)，但直接夾會讓貼著角落的
    // 玩家旁邊瞬間冒出怪 —— 改成換角度重抽，抽不到就取這幾次裡離玩家最遠的那個點。
    const minDist = distance * 0.6;
    let best = null;
    let bestDist = -1;

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Math.max(b.minX + margin, Math.min(b.maxX - margin, player.x + Math.cos(angle) * distance));
      const y = Math.max(b.minY + margin, Math.min(b.maxY - margin, player.y + Math.sin(angle) * distance));
      const d = Math.hypot(x - player.x, y - player.y);
      if (d >= minDist) return { x, y };
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }
}
