// 嘎嘎特攻 (Gaga Survivor) - 遊戲核心主循環與遊戲狀態機

import { GAME_CONFIG, ENEMY_TYPES } from './config.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { DropItem } from './entities/DropItem.js';
import { Turret, TURRET } from './entities/Turret.js';
import { InputController } from './input.js';
import { WeaponManager } from './weapons/WeaponManager.js';
import { Spawner } from './systems/Spawner.js';
import { ParticleSystem } from './systems/ParticleSystem.js';
import { UIManager } from './systems/UI.js';
import { sound } from './audio.js';
import { CHARACTERS, CHARACTER_ORDER } from './characters.js';
import { LEVELS, LEVEL_ORDER, currentWave, pickEnemy } from './levels.js';
import { save } from './save.js';
import { drawDecor } from './systems/Decor.js';
import { metaBonuses, upgradeKeyOf } from './meta.js';
import { rollItem, rollRarity, itemLevelFor, itemName, gearBonuses, salvageValue, RARITIES } from './items.js';

// #rrggbb + alpha → rgba() 字串 (地形機制的半透明渲染用)
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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

    // 地形機制 (毒霧/地雷/噴發) 與里程碑排程
    this.hazards = [];
    this.hazardTimer = 10;
    this.killMilestoneAt = 100;
    this.timeMilestoneAt = 120;

    // 統計數據
    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;

    // 局內金幣 reroll：升級三選一花錢重抽；幸運加成天賦放大金幣收入
    this.rerollCost = 60;
    this.metaGoldMul = 1;
    this._shownUpgradeKeys = [];

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
    // 特工 / 關卡選擇 (可重繪：解鎖或回主選單時刷新)
    this.refreshCharSelect();
    this.refreshLevelSelect();
    this.ui.updateDnaChip(save.data.dna);

    // 基因強化 (天賦樹)
    document.getElementById('btn-talents').addEventListener('click', () => {
      sound.playGem();
      this.ui.openTalentModal(save, (id) => this.investTalent(id));
    });

    // 裝備倉庫
    document.getElementById('btn-gear').addEventListener('click', () => {
      sound.playGem();
      this.ui.openGearModal(save, {
        onEquip: (id) => {
          save.equipItem(id);
          sound.playEvoFanfare();
          this.ui.rebuildGearView(save);
        },
        onUnequip: (slot) => {
          save.unequipSlot(slot);
          sound.playGem();
          this.ui.rebuildGearView(save);
        },
        onSalvage: (id) => {
          const dna = save.salvageItem(id);
          if (dna < 0) {
            this.ui.sayStatus('這件正穿在身上，要先脫下才能分解', true);
            sound.playHurt();
            return;
          }
          sound.playGem();
          this.ui.sayStatus(`分解完成，回收 ${dna} 🧬`);
          this.ui.updateDnaChip(save.data.dna);
          this.ui.rebuildGearView(save);
        },
        onReforge: (id) => {
          const res = save.reforgeItem(id);
          if (!res.ok) {
            this.ui.sayStatus(res.reason, true);
            sound.playHurt();
            return;
          }
          sound.playEvoFanfare();
          this.ui.sayStatus(`重鑄完成：詞條已重新洗牌 (花費 ${res.cost} 🧬)`);
          this.ui.updateDnaChip(save.data.dna);
          this.ui.rebuildGearView(save);
        },
        onSalvageAll: (rarity) => {
          const res = save.salvageAll(rarity);
          if (res.count === 0) return;
          sound.playEvoFanfare();
          this.ui.sayStatus(`分解 ${res.count} 件，回收 ${res.dna} 🧬`);
          this.ui.updateDnaChip(save.data.dna);
          this.ui.rebuildGearView(save);
        },
      });
    });

    // 主選單音量滑桿 (直接寫入存檔)
    const sfxVol = document.getElementById('sfx-vol');
    const bgmVol = document.getElementById('bgm-vol');
    if (sfxVol && bgmVol) {
      const applyVol = () => {
        const settings = { sfx: sfxVol.value / 100, bgm: bgmVol.value / 100 };
        save.set({ settings });
        sound.setVolumes(settings.sfx, settings.bgm);
      };
      sfxVol.value = Math.round((save.data.settings.sfx || 1) * 100);
      bgmVol.value = Math.round((save.data.settings.bgm || 0.8) * 100);
      sfxVol.addEventListener('input', applyVol);
      bgmVol.addEventListener('input', applyVol);
      sound.setVolumes(save.data.settings.sfx || 1, save.data.settings.bgm || 0.8);
    }

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

    // 結算 → 回主選單 (換角/換關/強化都要先回來這裡)
    document.getElementById('btn-menu').addEventListener('click', () => {
      this.returnToMenu();
    });

    // 暫停按鈕
    this.ui.pauseBtn.addEventListener('click', () => {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        sound.pauseBGM();
        this.ui.pauseBtn.textContent = '▶️';
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        sound.resumeBGM();
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

  // 主選單特工卡 (含 DNA 解鎖)
  refreshCharSelect() {
    this.ui.buildCharacterSelect(
      CHARACTERS, CHARACTER_ORDER, save,
      (id) => {
        this.characterId = id;
        save.set({ character: id });
      },
      (id) => this.tryUnlockCharacter(id),
      this.characterId
    );
  }

  refreshLevelSelect() {
    this.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, (id) => {
      this.levelId = id;
      save.set({ lastLevel: id });
    }, this.levelId);
  }

  tryUnlockCharacter(id) {
    const def = CHARACTERS[id];
    if (!def || save.characterUnlocked(id)) return;
    const cost = def.unlockCost || 0;
    if (!save.unlockCharacter(id, cost)) {
      this.ui.sayStatus(`DNA 不足：解鎖「${def.title}」需要 ${cost} 🧬`, true);
      sound.playHurt();
      return;
    }
    this.characterId = id;
    save.set({ character: id });
    this.refreshCharSelect();
    this.ui.updateDnaChip(save.data.dna);
    this.ui.sayStatus(`特工「${def.codename}」已就緒，隨時可以出擊！`);
    sound.playEvoFanfare();
  }

  investTalent(id) {
    const res = save.investTalent(id);
    if (!res.ok) {
      this.ui.sayStatus(res.reason, true);
      sound.playHurt();
      return;
    }
    this.ui.updateDnaChip(save.data.dna);
    this.ui.rebuildTalentView(save);
    this.ui.sayStatus(`天賦強化成功 (花費 ${res.cost} 🧬)`);
    sound.playGem();
  }

  // 結算畫面 → 回主選單：清掉戰局殘留並重繪選單 (DNA 等資料已由 recordRun 更新)
  returnToMenu() {
    this.state = 'START';
    this.ui.gameOverModal.classList.add('hidden');
    this.ui.startScreen.classList.remove('hidden');

    this.enemies = [];
    this.dropItems = [];
    this.turrets = [];
    this.hazards = [];
    this.boss = null;
    this.particles.clear();
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.shake = 0;

    this.ui.updateBossHUD(null);
    this.ui.updateHUD(this.player, 0, 0, 0);
    this.ui.pauseBtn.textContent = '⏸️';
    this.ui.updateDnaChip(save.data.dna);
    this.refreshCharSelect();
    this.refreshLevelSelect();
    this.ui.sayStatus('');
    sound.stopBGM();
  }

  // 把局外天賦加成套進這一局的玩家身上 (傷害天賦需在被動重算時保留 → 寫進 metaDmg)
  applyMetaTalents() {
    const t = metaBonuses(save.data.talents);
    const g = gearBonuses(save.data.stash, save.data.equipped);
    const m = {
      dmg: t.dmg + g.dmg,
      hp: t.hp + g.hp,
      speed: t.speed + g.speed,
      magnet: t.magnet + g.magnet,
      gold: t.gold + g.gold,
      cdr: g.cdr,
      crit: g.crit,
      critdmg: g.critdmg,
      armor: g.armor,
      exp: g.exp,
    };
    const p = this.player;
    p.metaDmg = m.dmg;
    p.metaCdr = m.cdr;
    p.metaCrit = m.crit;
    p.metaCritDmg = m.critdmg;
    p.metaArmor = Math.min(0.5, m.armor);   // 減傷上限 50%，防止堆滿免疫
    p.metaExp = m.exp;
    p.damageMultiplier = 1 + m.dmg; // 開場就生效；之後 applyPassives 重置時也會加回 metaDmg
    p.baseSpeedMul += m.speed;
    p.baseMagnet += m.magnet;
    p.magnetMultiplier = p.baseMagnet;
    p.speedMultiplier = p.baseSpeedMul;
    p.maxHp += m.hp;
    p.baseMaxHp += m.hp;
    p.hp = p.maxHp;
    this.metaGoldMul = 1 + m.gold;
    // 冷卻加成要在被動重算時才會套用，開局先跑一次
    this.weaponManager.applyPassives();
  }

  start() {
    sound.ensureContext();
    sound.startBGM(this.levelId);

    this.level = LEVELS[this.levelId] || LEVELS.street;
    this.spawner.setLevel(this.levelId);

    this.player = new Player(0, 0, this.characterId);
    this.weaponManager = new WeaponManager(this.player);
    this.applyMetaTalents();
    this.lowHpWarned = false;
    this.particles.clear();
    this.enemies = [];
    this.dropItems = [];
    this.turrets = [];

    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.shake = 0;
    this.hazards = [];
    this.hazardTimer = 10;      // 開場 10 秒再放第一波地形機制
    this.killMilestoneAt = 100;
    this.timeMilestoneAt = 120;
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

      // 敵人被砲塔擋住：推開並持續啃食砲塔 (平方距離先篩，真的擠到才開根號)
      for (const e of this.enemies) {
        if (e.isDead) continue;
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        const minD = t.radius + e.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;

        const d = Math.sqrt(d2);
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

  // Boss 專屬技能效果 (由 Enemy.updateBoss 依冷卻觸發)
  handleBossSkill(boss, act) {
    if (act === 'nova') {
      // 範圍震波：光圈內受傷 + 震屏
      const R = boss.radius * 7;
      this.particles.createShockwave(boss.x, boss.y, R, '#ff0055');
      sound.playExplosion();
      this.camera.shake = Math.max(this.camera.shake, 10);
      const d = Math.hypot(this.player.x - boss.x, this.player.y - boss.y);
      if (d < R + this.player.radius) {
        this.player.takeDamage(14);
        this.particles.createHurtText(this.player.x, this.player.y, 14);
      }
    } else if (act === 'summon') {
      // 召喚 3 隻當前波次的小怪 (數量逼近上限就不召)
      if (this.enemies.length < 230) {
        const pool = currentWave(this.level || LEVELS.street, this.gameTime).pool;
        const hpMul = (1 + this.gameTime / 90) * (this.level ? this.level.hpScale : 1) * 0.6;
        for (let i = 0; i < 3; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.enemies.push(new Enemy(
            pickEnemy(pool),
            boss.x + Math.cos(ang) * 120,
            boss.y + Math.sin(ang) * 120,
            hpMul
          ));
        }
      }
      this.particles.createShockwave(boss.x, boss.y, 130, '#b5179e');
    }
  }

  // 關卡地形機制更新 (levels.mech)：毒霧持續傷害、地雷/噴發倒數引爆
  updateHazards(dt) {
    const mech = (this.level || LEVELS.street).mech;
    if (mech) {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        this.hazardTimer = mech.interval + Math.random() * (mech.jitter || 0);
        this.spawnHazard(mech);
      }
    }

    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;

      if (h.kind === 'pool') {
        // 毒霧池：玩家在範圍內持續扣血 (吃無敵幀 → 實際 ~每 0.5 秒一跳)
        h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.5;
          const dx = p.x - h.x;
          const dy = p.y - h.y;
          const rr = h.r + p.radius;
          if (dx * dx + dy * dy < rr * rr) {
            if (p.takeDamage(h.dmg)) this.particles.createHurtText(p.x, p.y, h.dmg);
          }
        }
        if (h.t >= h.dur) this.hazards.splice(i, 1);
      } else if (h.kind === 'mine' || h.kind === 'geyser') {
        if (h.t >= h.fuse) {
          this.explodeHazard(h);
          this.hazards.splice(i, 1);
        }
      }
    }
  }

  spawnHazard(mech) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 260 + Math.random() * 170;
    const b = GAME_CONFIG.WORLD_BOUNDS;
    const m = 60;
    const x = Math.max(b.minX + m, Math.min(b.maxX - m, this.player.x + Math.cos(angle) * dist));
    const y = Math.max(b.minY + m, Math.min(b.maxY - m, this.player.y + Math.sin(angle) * dist));

    if (mech.type === 'supply') {
      // 街頭空投：直接放物資箱在地面
      this.dropItems.push(new DropItem(x, y, 'SUPPLY'));
      this.particles.createShockwave(x, y, 70, '#ffb703');
      sound.playEvoFanfare();
      return;
    }
    this.hazards.push({
      kind: mech.type,
      x, y,
      r: mech.radius,
      color: mech.color,
      t: 0,
      tick: 0.5,
      fuse: mech.fuse || 0,
      dur: mech.dur || 0,
      dmg: mech.dmg || 0,
      dmgEnemy: mech.dmgEnemy || 0,
    });
  }

  // 地雷/噴發引爆：敵我皆傷 (噴發對敵傷害高，幫清場但要閃)
  explodeHazard(h) {
    sound.playExplosion();
    this.camera.shake = Math.max(this.camera.shake, 9);
    this.particles.createExplosion(h.x, h.y, h.r, h.kind === 'geyser');
    this.particles.createShockwave(h.x, h.y, h.r, h.color);

    const rr = h.r;
    for (const e of this.enemies) {
      if (e.isDead) continue;
      const dx = e.x - h.x;
      const dy = e.y - h.y;
      if (dx * dx + dy * dy < (rr + e.radius) * (rr + e.radius)) {
        e.takeDamage(h.dmgEnemy, 6, h.x, h.y);
      }
    }
    const pd = Math.hypot(this.player.x - h.x, this.player.y - h.y);
    if (pd < rr + this.player.radius) this.player.takeDamage(h.dmg);
  }

  drawHazards(cam) {
    const ctx = this.ctx;
    for (const h of this.hazards) {
      const sx = h.x - cam.x;
      const sy = h.y - cam.y;
      const margin = h.r + 60;
      if (sx < -margin || sx > this.vw + margin || sy < -margin || sy > this.vh + margin) continue;

      ctx.save();
      ctx.translate(sx, sy);
      if (h.kind === 'pool') {
        // 毒霧池：鼓動的半透明毒圈 (出現/消失前淡入淡出)
        const wob = 1 + Math.sin(h.t * 3.2 + h.x) * 0.04;
        const fadeIn = Math.min(1, h.t / 0.4);
        const fadeOut = Math.min(1, (h.dur - h.t) / 0.5);
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(0, 0, h.r * 0.15, 0, 0, h.r * wob);
        g.addColorStop(0, hexToRgba(h.color, 0.38));
        g.addColorStop(1, hexToRgba(h.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(h.color, 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 地雷/噴發：倒數警示圈 (越接近引爆收得越緊、越亮)
        const prog = Math.min(1, h.t / h.fuse);
        ctx.strokeStyle = h.color;
        ctx.globalAlpha = 0.35 + prog * 0.45;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * (1.25 - prog * 0.25), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = h.color;
        ctx.globalAlpha = 0.45 + prog * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, 6 + prog * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 里程碑獎勵：每 100 殺一輪 [磁力/金幣/醫療/震撼彈]，每 2 分鐘一次後勤補給
  checkMilestones() {
    while (this.kills >= this.killMilestoneAt) {
      const n = this.killMilestoneAt;
      this.killMilestoneAt += 100;
      const kinds = ['magnet', 'gold', 'heal', 'bomb'];
      this.grantMilestone(kinds[((n / 100) - 1) % 4], `擊殺 ${n}`);
    }
    while (this.gameTime >= this.timeMilestoneAt) {
      this.timeMilestoneAt += 120;
      this.grantMilestone('resupply', `存活 ${Math.round(this.gameTime / 60)} 分鐘`);
    }
  }

  grantMilestone(tag, title) {
    const mul = this.metaGoldMul || 1;
    switch (tag) {
      case 'magnet':
        for (const d of this.dropItems) d.isAttracted = true;
        this.particles.createShockwave(this.player.x, this.player.y, 200, '#00e5ff');
        sound.playGem();
        this.ui.say(`${title}！磁力空投：全場戰利品吸收`, '#00e5ff', 2.4);
        break;
      case 'gold':
        this.gold += Math.round(80 * mul);
        sound.playGem();
        this.ui.say(`${title}！獎勵金幣 +${Math.round(80 * mul)} 🪙`, '#ffb703', 2.4);
        break;
      case 'heal':
        this.player.heal(40);
        sound.playGem();
        this.ui.say(`${title}！戰地醫療 +40 HP`, '#00f59b', 2.4);
        break;
      case 'bomb':
        this.camera.shake = Math.max(this.camera.shake, 14);
        sound.playExplosion();
        for (const e of this.enemies) {
          if (e.isBoss) e.takeDamage(300, 5, this.player.x, this.player.y);
          else e.takeDamage(9999, 10, this.player.x, this.player.y);
        }
        this.particles.createExplosion(this.player.x, this.player.y, 170);
        this.ui.say(`${title}！震撼彈支援：全場敵人重創`, '#ff0055', 2.4);
        break;
      case 'resupply':
        this.player.heal(20);
        this.gold += Math.round(40 * mul);
        sound.playGem();
        this.ui.say(`${title} — 總部後勤補給 (+20 HP / +40 🪙)`, '#9fb3c8', 2.4);
        break;
    }
  }

  // 任務目標提示：下一波 Boss 倒數 / 終極首領通關條件 (無盡 = 生存挑戰)
  objectiveText() {
    const lv = this.level;
    if (!lv) return '';
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (lv.id === 'endless') {
      const wait = Math.ceil(this.spawner.nextEndlessBossAt - this.gameTime);
      return wait > 0 ? `生存挑戰：下一隻深淵首領 ${fmt(wait)}` : '深淵首領降臨 — 撐下去！';
    }
    const next = lv.bosses.find((b) => b.at > this.gameTime);
    if (next) {
      return next.final
        ? `撐到 ${fmt(next.at)}，擊敗終極首領即可通關`
        : `下一波首領：${fmt(next.at)} (${next.name})`;
    }
    const finalAlive = this.enemies.some((e) => e.isFinal && !e.isDead);
    return finalAlive ? '終極首領降臨 — 擊敗它即可通關！' : '';
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
      }, (boss, act) => this.handleBossSkill(boss, act));

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

    // 4.6 關卡地形機制 (毒霧/地雷/噴發/空投)
    this.updateHazards(dt);

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
    this.ui.setObjective(this.objectiveText());

    // 13. 里程碑獎勵 (擊殺數 / 存活時間)
    this.checkMilestones();
  }

  checkProjectileCollisions() {
    for (const p of this.weaponManager.projectiles) {
      if (p.isDead || p.type === 'rocket') continue; // 火箭走自帶到達爆炸

      const hitR = p.radius;

      for (const enemy of this.enemies) {
        if (enemy.isDead || p.hitEnemies.has(enemy)) continue;

        // 平方距離比較：省掉每組碰撞一次的開根號 (滿級彈幕×兩百隻怪是每幀幾萬次運算)
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const rr = hitR + enemy.radius;
        if (dx * dx + dy * dy >= rr * rr) continue;

        p.hitEnemies.add(enemy);

        // 給予傷害與擊退
        enemy.takeDamage(p.damage, p.knockback, p.x, p.y);
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

  cleanupDeadEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.isDead) {
        this.kills++;
        this.player.character.onKill?.(enemy, this);
        this.particles.createDeathParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 8);

        // 掉落經驗寶石或稀有道具
        this.spawnDropItem(enemy);

        // 孢子母體死亡裂解成幼體 (沿用母體的血量成長係數)
        if (enemy.splitInto && this.enemies.length < 240) {
          const hpMul = enemy.maxHp / ENEMY_TYPES[enemy.typeKey].hp;
          for (let n = 0; n < enemy.splitCount; n++) {
            const ang = (n / enemy.splitCount) * Math.PI * 2 + Math.random();
            this.enemies.push(new Enemy(
              enemy.splitInto,
              enemy.x + Math.cos(ang) * 26,
              enemy.y + Math.sin(ang) * 26,
              hpMul
            ));
          }
        }

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

    // 精英怪掉得更好：保底紫水晶，另有機率改噴金幣
    if (enemy.isElite && !enemy.isBoss) {
      if (Math.random() < 0.25) kind = 'GOLD_COIN';
      else if (kind === 'EXP_GREEN' || kind === 'EXP_BLUE') kind = 'EXP_PURPLE';
    }

    this.dropItems.push(new DropItem(enemy.x, enemy.y, kind));
    this.rollGearDrop(enemy);
  }

  // 打寶掉落：只有精英與 Boss 會噴裝備 (雜兵噴裝會讓倉庫瞬間爆掉且毫無驚喜感)
  rollGearDrop(enemy) {
    let chance = 0;
    let rarityBoost = 0;

    if (enemy.isFinal) {
      chance = 1;
      rarityBoost = 3;          // 終極首領保底一件，且大幅偏向高稀有度
    } else if (enemy.isBoss) {
      chance = 1;
      rarityBoost = 1.2;
    } else if (enemy.isElite) {
      chance = 0.22;
      rarityBoost = 0;
    }
    if (chance === 0 || Math.random() >= chance) return;

    const ilvl = itemLevelFor(this.level ? this.level.difficulty : 1, this.gameTime);
    const item = rollItem({ rarity: rollRarity(rarityBoost), ilvl });
    const offset = enemy.isBoss ? 34 : 0;
    this.dropItems.push(new DropItem(enemy.x + offset, enemy.y, 'GEAR', item));
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
      // 裝備「領悟」詞條放大經驗水晶 (每顆至少 1)
      const val = Math.max(1, Math.round(item.value * (1 + (this.player.metaExp || 0))));
      const leveledUp = this.player.gainExp(val);
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
      this.gold += Math.round(item.value * (this.metaGoldMul || 1));
    } else if (item.type === 'gear') {
      const gear = item.item;
      if (!gear) return;
      if (!save.addItem(gear)) {
        // 倉庫滿了就地分解，總比讓玩家白撿一場好
        save.data.dna += salvageValue(gear);
        save.flush();
        sound.playGem();
        this.ui.say(`倉庫已滿 — ${itemName(gear)} 就地分解，回收 ${salvageValue(gear)} 🧬`, '#ffb703', 3);
        return;
      }
      const color = RARITIES[gear.rarity].color;
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 130, color);
      this.ui.say(`獲得 ${itemName(gear)}！`, color, 2.6);
    } else if (item.type === 'supply') {
      // 街頭空投物資箱：金幣 + 回血 + 金色衝擊波
      const gold = Math.round(30 * (this.metaGoldMul || 1));
      this.gold += gold;
      this.player.heal(25);
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 150, '#ffb703');
      this.particles.createDamageText(this.player.x, this.player.y, `+${gold} 🪙 +25 HP`, false);
    }
  }

  triggerLevelUp() {
    this.state = 'LEVEL_UP';
    this.ui.say(this.player.character.lines.levelup, this.player.character.accent);

    this.presentUpgradeChoices(null);
  }

  // 生成並顯示三張升級卡；excludeKeys = 上一輪顯示的卡 (reroll 時用)
  presentUpgradeChoices(excludeKeys) {
    const opts = this.ui.generateUpgradeOptions(this.weaponManager, excludeKeys);
    this._shownUpgradeKeys = opts.map(upgradeKeyOf);
    this.ui.showUpgradeCards(
      opts,
      this.gold,
      this.rerollCost,
      (selectedOption) => this.applyUpgradeOption(selectedOption),
      () => this.tryRerollUpgrade()
    );
  }

  // 金幣 reroll：扣 60 金，重抽不重複的三選一
  tryRerollUpgrade() {
    if (this.state !== 'LEVEL_UP') return;
    if (this._shownUpgradeKeys.length <= 1) {
      this.ui.flashRerollDenied('沒有其他選項了！');
      return;
    }
    if (this.gold < this.rerollCost) {
      this.ui.flashRerollDenied();
      sound.playHurt();
      return;
    }
    this.gold -= this.rerollCost;
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    sound.playGem();
    this.presentUpgradeChoices(this._shownUpgradeKeys);
  }

  applyUpgradeOption(selectedOption) {
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
      this.gold += Math.round(50 * (this.metaGoldMul || 1));
    }

    this.ui.updateSkillSlots(this.weaponManager);

    // 檢查是否還有多餘升級 (連續升級)
    if (this.player.exp >= this.player.nextExp) {
      this.player.gainExp(0);
      this.triggerLevelUp();
    } else {
      this.state = 'PLAYING';
    }
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

    // 繪製場景裝飾 (地板之上、掉落物之下)
    drawDecor(this.ctx, renderCam, this.level || LEVELS.street, this.vw, this.vh);

    // 繪製掉落物
    for (const item of this.dropItems) {
      item.draw(this.ctx, renderCam);
    }

    // 繪製地形機制 (毒霧圈 / 地雷警示)
    this.drawHazards(renderCam);

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

    // 小地圖
    this.drawMinimap();
  }

  drawVignette() {
    // ponytail: 暗角烘焙進離屏 canvas，每幀只做一次 drawImage
    if (!this._vigCanvas || this._vigCanvas.width !== Math.round(this.vw) || this._vigCanvas.height !== Math.round(this.vh)) {
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

  drawMinimap() {
    const ctx = this.ctx;
    const size = this.vw < 620 ? 96 : 136;
    const pad = this.vw < 620 ? 10 : 18;
    const ox = this.vw - size - pad;
    const oy = this.vh - size - pad;

    // 以玩家為中心的局部視野。整張地圖 4000 單位縮到 136px 的話所有東西會擠成一團，
    // 只顯示周圍 RANGE 單位才看得出敵人分佈與 Boss 方位。
    const RANGE = 1300;
    const k = size / (RANGE * 2);
    const cx = ox + size / 2;
    const cy = oy + size / 2;
    const toX = (wx) => cx + (wx - this.player.x) * k;
    const toY = (wy) => cy + (wy - this.player.y) * k;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.72)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ox, oy, size, size, 8);
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    // 地圖邊界 (走近時才會出現在小地圖上，提示別撞牆)
    const b = GAME_CONFIG.WORLD_BOUNDS;
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(toX(b.minX), toY(b.minY), (b.maxX - b.minX) * k, (b.maxY - b.minY) * k);

    // 目前畫面視野
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(this.camera.x), toY(this.camera.y), this.vw * k, this.vh * k);

    // 砲塔
    ctx.fillStyle = '#00e5ff';
    for (const t of this.turrets) {
      ctx.fillRect(toX(t.x) - 2, toY(t.y) - 2, 4, 4);
    }

    // 稀有掉落物 (經驗水晶太多，標了會糊成一片)
    ctx.fillStyle = '#ffb703';
    for (const d of this.dropItems) {
      if (d.type === 'exp') continue;
      ctx.fillRect(toX(d.x) - 1.5, toY(d.y) - 1.5, 3, 3);
    }

    // 敵人
    ctx.fillStyle = 'rgba(255, 90, 90, 0.9)';
    for (const e of this.enemies) {
      if (e.isDead || e.isBoss) continue;
      ctx.fillRect(toX(e.x) - 1.5, toY(e.y) - 1.5, 3, 3);
    }

    // Boss：範圍外時貼在小地圖邊緣當方位指示
    for (const e of this.enemies) {
      if (e.isDead || !e.isBoss) continue;
      let bx = toX(e.x);
      let by = toY(e.y);
      const outside = bx < ox + 5 || bx > ox + size - 5 || by < oy + 5 || by > oy + size - 5;
      bx = Math.max(ox + 5, Math.min(ox + size - 5, bx));
      by = Math.max(oy + 5, Math.min(oy + size - 5, by));

      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(bx, by, outside ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (outside) {
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 玩家
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
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
