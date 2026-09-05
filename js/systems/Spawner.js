// 怪物生成器：完全照關卡資料 (js/levels.js) 的波次與 Boss 排程操課。

import { Enemy } from '../entities/Enemy.js';
import { LEVELS, currentWave, pickEnemy } from '../levels.js';

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
    this.bossIndex = 0;   // 下一隻要生的 Boss 在 level.bosses 的位置
    this.bossRef = null;
  }

  update(dt, gameTime, player, enemies, onBossSpawnCallback = null) {
    const level = this.level;

    // Boss 排程
    const nextBoss = level.bosses[this.bossIndex];
    if (nextBoss && gameTime >= nextBoss.at) {
      this.bossIndex++;
      this.spawnBoss(nextBoss, player, enemies, onBossSpawnCallback);
    }

    // 一般波次
    this.spawnTimer += dt;
    const wave = currentWave(level, gameTime);
    if (this.spawnTimer < wave.interval) return;
    this.spawnTimer = 0;

    if (enemies.length >= MAX_ENEMIES) return;

    // 雜兵血量隨時間與關卡難度成長
    const hpMultiplier = (1 + (gameTime / 60) * 0.4) * level.hpScale;
    for (let i = 0; i < wave.batch; i++) {
      const pos = this.getSpawnPosition(player, 480 + Math.random() * 120);
      enemies.push(new Enemy(pickEnemy(wave.pool), pos.x, pos.y, hpMultiplier));
    }
  }

  spawnBoss(def, player, enemies, onBossSpawnCallback) {
    const pos = this.getSpawnPosition(player, 550);
    const boss = new Enemy('boss', pos.x, pos.y, 1);
    boss.maxHp = boss.hp = def.hp;
    boss.name = def.name;

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
    const angle = Math.random() * Math.PI * 2;
    return {
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
    };
  }
}
