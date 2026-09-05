// 嘎嘎特攻 (Gaga Survivor) - 遊戲核心主循環與遊戲狀態機

import { GAME_CONFIG } from './config.js';
import { Player } from './entities/Player.js';
import { DropItem } from './entities/DropItem.js';
import { Turret, TURRET } from './entities/Turret.js';
import { InputController } from './input.js';
import { WeaponManager } from './weapons/WeaponManager.js';
import { Spawner } from './systems/Spawner.js';
import { ParticleSystem } from './systems/ParticleSystem.js';
import { UIManager } from './systems/UI.js';
import { sound } from './audio.js';
import { CHARACTERS, CHARACTER_ORDER } from './characters.js';
import { LEVELS, LEVEL_ORDER } from './levels.js';
import { save } from './save.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // 狀態機: 'START', 'PLAYING', 'LEVEL_UP', 'PAUSED', 'GAME_OVER'
    this.state = 'START';

    this.input = new InputController();
    save.load();
    this.characterId = CHARACTERS[save.data.character] ? save.data.character : 'duck';
    this.levelId = save.isUnlocked(save.data.lastLevel) ? save.data.lastLevel : 'street';
    this.player = new Player(0, 0, this.characterId);
    this.weaponManager = new WeaponManager(this.player);
    this.spawner = new Spawner();
    this.particles = new ParticleSystem();
    this.ui = new UIManager();

    // 實體清單
    this.enemies = [];
    this.dropItems = [];
    this.turrets = [];

    // 統計數據
    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;

    // 相機與視差平移
    this.camera = {
      x: 0,
      y: 0,
      shake: 0,
    };

    this.lastTime = performance.now();

    this.initWindow();
    this.bindEvents();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initWindow() {
    const resize = () => {
      // ponytail: DPR 縮放讓 retina 上線條不糊；vw/vh 為邏輯像素尺寸
      // ponytail: DPR 上限 1.5，2 倍在軟體渲染的瀏覽器上會直接卡死
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this.canvas.width = Math.round(this.vw * dpr);
      this.canvas.height = Math.round(this.vh * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 暫停/結算中改變視窗大小時補畫一幀，避免畫布留白
      if (this.player && this.state !== 'PLAYING') this.render();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  bindEvents() {
    // 特工選擇
    this.ui.buildCharacterSelect(CHARACTERS, CHARACTER_ORDER, (id) => {
      this.characterId = id;
      save.set({ character: id });
    }, this.characterId);

    this.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, (id) => {
      this.levelId = id;
      save.set({ lastLevel: id });
    }, this.levelId);

    // 開始遊戲按鈕
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.ui.startScreen.classList.add('hidden');
      this.start();
    });

    // 重新開始按鈕
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.ui.gameOverModal.classList.add('hidden');
      this.start();
    });

    // 暫停按鈕
    this.ui.pauseBtn.addEventListener('click', () => {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        this.ui.pauseBtn.textContent = '▶️';
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.ui.pauseBtn.textContent = '⏸️';
      }
    });

    // 佈署砲塔 (鍵盤 B / HUD 按鈕，行動端用按鈕)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') this.buildTurret();
    });
    this.ui.buildBtn.addEventListener('click', () => this.buildTurret());

    // 音效切換按鈕
    this.ui.soundBtn.addEventListener('click', () => {
      const enabled = sound.toggleSound();
      this.ui.soundBtn.textContent = enabled ? '🔊' : '🔇';
    });
  }

  start() {
    sound.ensureContext();
    sound.startBGM();

    this.level = LEVELS[this.levelId] || LEVELS.street;
    this.spawner.setLevel(this.levelId);

    this.player = new Player(0, 0, this.characterId);
    this.weaponManager = new WeaponManager(this.player);
    this.lowHpWarned = false;
    this.particles.clear();
    this.enemies = [];
    this.dropItems = [];
    this.turrets = [];

    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;
    this.input.reset();

    this.ui.updateSkillSlots(this.weaponManager);
    this.ui.updateBossHUD(null);
    this.ui.say(this.player.character.lines.start, this.player.character.accent);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    this.state = 'PLAYING';
  }

  get turretCost() {
    return TURRET.baseCost + TURRET.costGrowth * this.turrets.length;
  }

  buildTurret() {
    if (this.state !== 'PLAYING') return;

    if (this.gold < this.turretCost) {
      this.ui.say(`金幣不足，佈署砲塔需要 ${this.turretCost} 🪙`, '#ffb703', 1.6);
      return;
    }
    // 太靠近既有砲塔就不給蓋，避免疊在同一點
    const tooClose = this.turrets.some(
      (t) => Math.hypot(t.x - this.player.x, t.y - this.player.y) < TURRET.minSpacing
    );
    if (tooClose) {
      this.ui.say('這裡太靠近其他砲塔了', '#ffb703', 1.6);
      return;
    }

    this.gold -= this.turretCost;
    this.turrets.push(new Turret(this.player.x, this.player.y));
    this.particles.createShockwave(this.player.x, this.player.y, 90, '#00e5ff');
    sound.playEvoFanfare();
    this.ui.updateBuildBtn(this.gold, this.turretCost);
  }

  updateTurrets(dt) {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];

      t.update(dt, this.enemies, (target, dmg) => {
        this.damageEnemy(target, dmg, 1, t.x, t.y);
        sound.playShoot();
      });

      // 敵人被砲塔擋住：推開並持續啃食砲塔
      for (const e of this.enemies) {
        if (e.isDead) continue;
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        const d = Math.hypot(dx, dy);
        const minD = t.radius + e.radius;
        if (d >= minD || d === 0) continue;

        e.x = t.x + (dx / d) * minD;
        e.y = t.y + (dy / d) * minD;
        t.takeDamage(e.damage * dt * 1.5);
      }

      if (t.isDead) {
        this.particles.createExplosion(t.x, t.y, 70);
        sound.playExplosion();
        this.camera.shake = 8;
        this.turrets.splice(i, 1);
        this.ui.updateBuildBtn(this.gold, this.turretCost);
      }
    }
  }

  // 對外統一的傷害入口 (角色特質、道具都走這裡，才會計入傷害統計與跳字)
  damageEnemy(enemy, damage, knockback, sourceX, sourceY, weaponId = null) {
    enemy.takeDamage(damage, knockback, sourceX, sourceY);
    if (weaponId) this.weaponManager.recordDamage(weaponId, damage);
    this.particles.createDamageText(enemy.x, enemy.y, damage, false);
  }

  loop(currentTime) {
    const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    // ponytail: 只在遊戲進行中重繪。覆蓋層有全螢幕 backdrop-filter: blur，
    // 畫布每幀變動會逼瀏覽器每幀重做全螢幕模糊 → 死亡/升級時直接卡死。
    // 停止重繪後畫布保留最後一幀，視覺上完全一樣。
    if (this.state === 'PLAYING') {
      this.update(dt);
      this.render();
    }

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.gameTime += dt;

    // 1. 更新特工玩家
    this.player.update(dt, this.input.vector);

    // 檢查特工是否身亡
    if (this.player.isDead) {
      this.handleGameOver(false);
      return;
    }

    // 2. 更新相機追隨
    const targetCamX = this.player.x - this.vw / 2;
    const targetCamY = this.player.y - this.vh / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.12;
    this.camera.y += (targetCamY - this.camera.y) * 0.12;

    // 螢幕震動衰減
    if (this.camera.shake > 0) {
      this.camera.shake *= 0.9;
      if (this.camera.shake < 0.1) this.camera.shake = 0;
    }

    // 3. 怪物波次生成
    this.spawner.update(dt, this.gameTime, this.player, this.enemies, (boss) => {
      this.boss = boss;
      this.camera.shake = 15;
      this.ui.say(
        boss.isFinal ? '終極首領降臨！擊敗它即可完成任務！' : this.player.character.lines.boss,
        '#ff0055',
        boss.isFinal ? 5 : 3.2
      );
    });

    // 4. 更新怪物行動與自爆回呼
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player, (boomer) => {
        // 自爆蟲引爆
        this.particles.createExplosion(boomer.x, boomer.y, 75);
        sound.playExplosion();
        const dist = Math.hypot(this.player.x - boomer.x, this.player.y - boomer.y);
        if (dist <= 75 + this.player.radius) {
          this.player.takeDamage(20);
          this.camera.shake = 8;
        }
      });

      // 怪物撞擊特工傷害檢測
      const dist = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
      if (dist < this.player.radius + enemy.radius) {
        if (this.player.takeDamage(enemy.damage)) {
          this.camera.shake = 6;
          this.particles.createDeathParticles(this.player.x, this.player.y, '#ff0055', 6);
          this.player.character.onHit?.(this);
        }
      }
    }

    // 4.5 砲塔開火與被啃
    this.updateTurrets(dt);

    // 5. 武器庫冷卻與攻擊
    this.weaponManager.update(dt, this.enemies, this.particles);

    // 6. 投射物與怪物碰撞檢測
    this.checkProjectileCollisions();

    // 7. 清除死亡怪物並產出掉落物
    this.cleanupDeadEnemies();

    // 8. 更新掉落物與拾取
    this.updateDropItems(dt);

    // 9. 更新粒子與跳字
    this.particles.update(dt);

    // 10. 角色專屬特質的逐幀效果
    this.player.character.tick?.(dt, this);

    // 11. 血量低於 20% 的一次性告急台詞
    if (!this.lowHpWarned && this.player.hp / this.player.maxHp < 0.2) {
      this.lowHpWarned = true;
      this.ui.say(this.player.character.lines.lowhp, '#ff0055');
    }

    // 12. 更新 UI
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    this.ui.updateBossHUD(this.boss);
  }

  checkProjectileCollisions() {
    for (const p of this.weaponManager.projectiles) {
      if (p.isDead || p.type === 'rocket') continue; // 火箭走自帶到達爆炸

      for (const enemy of this.enemies) {
        if (enemy.isDead || p.hitEnemies.has(enemy)) continue;

        const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
        if (dist < p.radius + enemy.radius) {
          p.hitEnemies.add(enemy);

          // 給予傷害與擊退
          const isDead = enemy.takeDamage(p.damage, p.knockback, p.x, p.y);
          this.weaponManager.recordDamage(p.weaponId, p.damage);
          this.particles.createDamageText(enemy.x, enemy.y, p.damage, p.isCrit || p.isEvo, p.isCrit);
          sound.playHit();

          p.pierce--;
          if (p.pierce <= 0) {
            p.isDead = true;
            break;
          }
        }
      }
    }
  }

  cleanupDeadEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) {
        this.kills++;
        this.player.character.onKill?.(enemy, this);
        this.particles.createDeathParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 8);

        // 掉落經驗寶石或稀有道具
        this.spawnDropItem(enemy);

        // 若 Boss 死亡，判定勝利或給予超級大寶箱
        if (enemy.isBoss) {
          this.camera.shake = 18;
          sound.playEvoFanfare();

          // 擊敗 15:00 的終極首領 = 任務達成
          if (enemy.isFinal) {
            this.enemies.splice(i, 1);
            this.handleGameOver(true);
            return;
          }
          // Boss 掉落大炸彈與全場磁鐵
          this.dropItems.push(new DropItem(enemy.x - 20, enemy.y, 'MAGNET'));
          this.dropItems.push(new DropItem(enemy.x + 20, enemy.y, 'BOMB'));
        }

        this.enemies.splice(i, 1);
      }
    }

    // Boss 血條跟著場上仍存活的 Boss (可能同時有階段 Boss 與終極首領)
    if (this.boss && this.boss.isDead) {
      this.boss = this.enemies.find((e) => e.isBoss && !e.isDead) || null;
    }
  }

  spawnDropItem(enemy) {
    const rand = Math.random();
    let kind = 'EXP_GREEN';

    if (enemy.isBoss) {
      kind = 'EXP_GOLD';
    } else if (enemy.exp >= 3) {
      kind = 'EXP_PURPLE';
    } else if (rand < 0.015) {
      kind = 'MAGNET'; // 1.5% 磁鐵
    } else if (rand < 0.03) {
      kind = 'BOMB'; // 1.5% 全屏清怪炸彈
    } else if (rand < 0.05) {
      kind = 'ROAST_CHICKEN'; // 2% 烤雞回血
    } else if (rand < 0.12) {
      kind = 'GOLD_COIN'; // 7% 金幣
    } else if (rand < 0.35) {
      kind = 'EXP_BLUE'; // 藍色水晶
    }

    this.dropItems.push(new DropItem(enemy.x, enemy.y, kind));
  }

  updateDropItems(dt) {
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const item = this.dropItems[i];
      item.update(dt, this.player);

      if (item.collected) {
        this.handleItemPickup(item);
        this.dropItems.splice(i, 1);
      }
    }
  }

  handleItemPickup(item) {
    if (item.type === 'exp') {
      sound.playGem();
      const leveledUp = this.player.gainExp(item.value);
      if (leveledUp) {
        this.triggerLevelUp();
      }
    } else if (item.type === 'magnet') {
      sound.playGem();
      // 全場經驗水晶瞬間全部吸向玩家
      for (const d of this.dropItems) {
        d.isAttracted = true;
      }
    } else if (item.type === 'bomb') {
      sound.playExplosion();
      this.camera.shake = 20;
      // 炸毀當前畫面上所有非 Boss 怪物
      for (const e of this.enemies) {
        if (!e.isBoss) {
          e.takeDamage(9999, 10, this.player.x, this.player.y);
        } else {
          e.takeDamage(300, 5, this.player.x, this.player.y);
        }
      }
    } else if (item.type === 'heal') {
      sound.playGem();
      this.player.heal(item.heal);
      this.particles.createDamageText(this.player.x, this.player.y, `+${item.heal} HP`, false);
    } else if (item.type === 'gold') {
      sound.playGem();
      this.gold += item.value;
    }
  }

  triggerLevelUp() {
    this.state = 'LEVEL_UP';
    this.ui.say(this.player.character.lines.levelup, this.player.character.accent);

    this.ui.showLevelUpModal(this.weaponManager, (selectedOption) => {
      // 應用升級選項
      if (selectedOption.type === 'evo') {
        this.weaponManager.evolveWeapon(selectedOption.baseId, selectedOption.targetId);
        this.ui.say(this.player.character.lines.evolve, this.player.character.accent);
      } else if (selectedOption.type === 'weapon_upgrade' || selectedOption.type === 'weapon_new') {
        this.weaponManager.upgradeWeapon(selectedOption.id);
      } else if (selectedOption.type === 'passive_upgrade' || selectedOption.type === 'passive_new') {
        this.weaponManager.addOrUpgradePassive(selectedOption.id);
      } else if (selectedOption.type === 'heal') {
        this.player.heal(this.player.maxHp * 0.5);
        this.gold += 50;
      }

      this.ui.updateSkillSlots(this.weaponManager);

      // 檢查是否還有多餘升級 (連續升級)
      if (this.player.exp >= this.player.nextExp) {
        this.player.gainExp(0);
        this.triggerLevelUp();
      } else {
        this.state = 'PLAYING';
      }
    });
  }

  handleGameOver(isVictory = false) {
    this.state = 'GAME_OVER';
    sound.stopBGM();
    const lines = this.player.character.lines;
    const result = save.recordRun(this.level.id, {
      time: this.gameTime,
      kills: this.kills,
      level: this.player.level,
      cleared: isVictory,
      dnaMult: this.level.dnaMult,
      nextLevel: this.level.next,
    });

    this.ui.showGameOver(
      {
        isVictory: isVictory,
        gameTime: this.gameTime,
        kills: this.kills,
        level: this.player.level,
        gold: this.gold,
        line: isVictory ? lines.win : lines.death,
        codename: this.player.character.codename,
        levelName: this.level.name,
        dna: result.dna,
        totalDna: save.data.dna,
        bestTime: save.data.best[this.level.id].time,
        unlockedName: result.unlockedNew ? LEVELS[this.level.next].name : null,
      },
      this.weaponManager
    );

    // 解鎖新關卡後，選單要立刻反映
    if (result.unlockedNew) {
      this.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, (id) => {
        this.levelId = id;
        save.set({ lastLevel: id });
      }, this.levelId);
    }
  }

  render() {
    // 螢幕震動偏移
    const shakeX = (Math.random() - 0.5) * this.camera.shake;
    const shakeY = (Math.random() - 0.5) * this.camera.shake;

    const renderCam = {
      x: this.camera.x + shakeX,
      y: this.camera.y + shakeY,
    };

    // 繪製地板漸層 + 網格 (本身即不透明滿版，不需另外清屏)
    this.drawFloorGrid(renderCam);

    // 繪製掉落物
    for (const item of this.dropItems) {
      item.draw(this.ctx, renderCam);
    }

    // 繪製武器投射物 (地面積火最底層)
    this.weaponManager.draw(this.ctx, renderCam);

    // 繪製砲塔
    for (const t of this.turrets) {
      t.draw(this.ctx, renderCam);
    }

    // 繪製怪物
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx, renderCam);
    }

    // 繪製主角特工鴨
    this.player.draw(this.ctx, renderCam);

    // 繪製粒子、衝擊波與傷害飄字
    this.particles.draw(this.ctx, renderCam);

    // 畫面後製：暗角 + 玩家聚光，讓視覺焦點集中在主角身上
    this.drawVignette();
  }

  drawVignette() {
    // ponytail: 暗角烘焙進離屏 canvas，每幀只做一次 drawImage
    if (!this._vigCanvas || this._vigCanvas.width !== this.vw || this._vigCanvas.height !== this.vh) {
      const oc = document.createElement('canvas');
      oc.width = Math.max(1, Math.round(this.vw));
      oc.height = Math.max(1, Math.round(this.vh));
      const octx = oc.getContext('2d');
      const g = octx.createRadialGradient(
        this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.22,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0.72)');
      octx.fillStyle = g;
      octx.fillRect(0, 0, oc.width, oc.height);
      this._vigCanvas = oc;
    }
    this.ctx.drawImage(this._vigCanvas, 0, 0, this.vw, this.vh);
  }

  drawFloorGrid(camera) {
    const ctx = this.ctx;
    const W = this.vw;
    const H = this.vh;

    ctx.save();

    // 地板底色漸層 (顏色由關卡主題決定)
    const theme = (this.level || LEVELS.street).theme;
    if (!this._floorGrad || this._floorGradH !== H || this._floorTheme !== theme) {
      const fg = ctx.createLinearGradient(0, 0, 0, H);
      fg.addColorStop(0, theme.top);
      fg.addColorStop(0.55, theme.mid);
      fg.addColorStop(1, theme.bottom);
      this._floorGrad = fg;
      this._floorGradH = H;
      this._floorTheme = theme;
    }
    ctx.fillStyle = this._floorGrad;
    ctx.fillRect(0, 0, W, H);

    // 細格線 + 每 4 格一條主格線，強化移動感
    const grid = 64;
    const ox = -(((camera.x % grid) + grid) % grid);
    const oy = -(((camera.y % grid) + grid) % grid);
    const majorX = Math.floor(camera.x / grid);
    const majorY = Math.floor(camera.y / grid);

    for (let i = 0, x = ox; x < W + grid; i++, x += grid) {
      const major = (majorX + i) % 4 === 0;
      ctx.strokeStyle = major ? theme.major : theme.grid;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
    }
    for (let i = 0, y = oy; y < H + grid; i++, y += grid) {
      const major = (majorY + i) % 4 === 0;
      ctx.strokeStyle = major ? theme.major : theme.grid;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
      ctx.stroke();
    }

    // 地圖邊界警示線 (發光紅牆)
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    const bMinX = bounds.minX - camera.x;
    const bMaxX = bounds.maxX - camera.x;
    const bMinY = bounds.minY - camera.y;
    const bMaxY = bounds.maxY - camera.y;

    ctx.shadowColor = theme.bounds;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = theme.bounds;
    ctx.lineWidth = 3;
    ctx.strokeRect(bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY);

    ctx.restore();
  }
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  // 掛在 window 上方便在 console 觀察/除錯遊戲狀態
  window.game = new Game();
});
