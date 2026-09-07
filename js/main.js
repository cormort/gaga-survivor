// 嘎嘎特攻 (Gaga Survivor) - 遊戲核心主循環與遊戲狀態機

import { GAME_CONFIG, ENEMY_TYPES, WEAPONS, FX } from './config.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { EnemyProjectile } from './entities/EnemyProjectile.js';
import { DropItem } from './entities/DropItem.js';
import { Mercenary, MERC } from './entities/Mercenary.js';
import { Projectile } from './entities/Projectile.js';
import { Turret, TURRET, TURRET_VARIANTS } from './entities/Turret.js';
import { InputController } from './input.js';
import { WeaponManager } from './weapons/WeaponManager.js';
import { Spawner } from './systems/Spawner.js';
import { ParticleSystem } from './systems/ParticleSystem.js';
import { UIManager } from './systems/UI.js';
import { sound } from './audio.js';
import { CHARACTERS, CHARACTER_ORDER } from './characters.js';
import { LEVELS, LEVEL_ORDER, currentWave, pickEnemy, getDailyChallenge } from './levels.js';
import { save } from './save.js';
import { drawDecor } from './systems/Decor.js';
import { metaBonuses, upgradeKeyOf } from './meta.js';
import { rollItem, rollRarity, itemLevelFor, itemName, gearBonuses, salvageValue, RARITIES } from './items.js';
import { MODES, MODE_ORDER, getMode } from './modes.js';
import { Core } from './entities/Core.js';
import { SHOP_CRATES, SHOP_BOOSTERS, STASH_EXPAND_COST, MAX_STASH_CAP, STASH_EXPANSION_STEP } from './shop.js';

const MAX_ENEMIES = 240; // 場上敵人硬上限 (孵化/裂解都受限)
// 核心外圈實際擠得下的同時攻擊數 (半徑 46 的六角形一圈約十幾隻)
const CORE_MAX_ATTACKERS = 16;

// #rrggbb + alpha → rgba() 字串 (地形機制的半透明渲染用)
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // 狀態機: 'START', 'PLAYING', 'LEVEL_UP', 'PAUSED', 'GAME_OVER', 'CHEST_MODAL'
    this.state = 'START';

    this.input = new InputController();
    save.load();
    this.characterId = CHARACTERS[save.data.character] ? save.data.character : 'duck';
    this.modeId = MODES[save.data.mode] ? save.data.mode : 'survivor';
    this.mode = getMode(this.modeId);
    this.levelId = save.isUnlocked(save.data.lastLevel, this.modeId) ? save.data.lastLevel : 'street';
    this.core = null;
    this.player = new Player(0, 0, this.characterId);
    this.weaponManager = new WeaponManager(this.player);
    this.spawner = new Spawner();
    this.particles = new ParticleSystem();
    this.ui = new UIManager();

    // 實體清單
    this.enemies = [];
    this._pendingSpawns = [];
    this.enemyProjectiles = [];
    this.dropItems = [];
    this.turrets = [];
    this.mercenaries = [];
    this.decals = []; // 地面殘跡 (血漬/焦痕)

    // 遊戲性增強系統狀態
    this.hitstopTimer = 0;
    this.redFlash = 0; // Boss 大招紅閃
    this.combo = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.explodableProps = [];
    this.extractionWell = null;
    this.isDaily = false;
    this.dailyConfig = null;

    // 地形機制 (毒霧/地雷/噴發) 與里程碑排程
    this.hazards = [];
    this._mechTimers = {};
    this._shrinkCircle = null;
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
    this.refreshModeSelect();
    this.refreshCharSelect();
    this.refreshLevelSelect();
    this.ui.updateDnaChip(save.data.dna, save.data.gold);

    // 特工黑市 (Shop)
    document.getElementById('btn-shop')?.addEventListener('click', () => {
      sound.playGem();
      const buy = (cur, costGold, costDna, onPaid) => {
        if (cur === 'gold' ? save.data.gold < costGold : save.data.dna < costDna) {
          this.ui.sayStatus(`${cur === 'gold' ? '金幣' : 'DNA'} 不足！`, true);
          sound.playHurt();
          return;
        }
        save.spend(cur === 'gold' ? costGold : 0, cur === 'dna' ? costDna : 0);
        sound.playEvoFanfare();
        this.ui.updateDnaChip(save.data.dna, save.data.gold);
        onPaid();
        this.ui.rebuildShopView(save);
      };

      this.ui.openShopModal(save, {
        onBuyCrate: (crateKey, currency) => {
          const crate = SHOP_CRATES[crateKey];
          if (!crate) return;
          if (save.stashFull()) {
            this.ui.sayStatus('倉庫已滿，請先清理或擴充倉庫！', true);
            sound.playHurt();
            return;
          }
          buy(currency, crate.costGold, crate.costDna, () => {
            const item = crate.roll();
            save.addItem(item);
            this.ui.sayStatus(`成功開啟 ${crate.name}！獲得【${item.rarity.toUpperCase()}】特工裝備！`);
          });
        },
        onBuyBooster: (boosterKey, currency) => {
          const booster = SHOP_BOOSTERS[boosterKey];
          if (!booster) return;
          if (save.hasBooster(boosterKey)) {
            this.ui.sayStatus('該戰術興奮劑已就緒，將於下局自動生效！', true);
            return;
          }
          buy(currency, booster.costGold, booster.costDna, () => {
            save.addBooster(boosterKey);
            this.ui.sayStatus(`戰備完成：${booster.name} 已裝備，將於下局生效！`);
          });
        },
        onExpandStash: (currency) => {
          if (save.getStashCap() >= MAX_STASH_CAP) {
            this.ui.sayStatus('倉庫已擴建至最大容量！', true);
            return;
          }
          buy(currency, STASH_EXPAND_COST.costGold, STASH_EXPAND_COST.costDna, () => {
            save.expandStash(STASH_EXPANSION_STEP, MAX_STASH_CAP);
            this.ui.sayStatus(`特工倉庫擴充成功！當前容量上限：${save.getStashCap()}`);
          });
        },
      });
    });

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
        onFuse: (ids) => {
          const res = save.fuseItems(ids);
          if (!res.ok) {
            this.ui.sayStatus(res.reason, true);
            sound.playHurt();
            return;
          }
          sound.playEvoFanfare();
          this.ui.sayStatus(`合成成功！獲得【${itemName(res.item)}】(消耗 ${res.cost} 🧬)`);
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
        this.ui.quitBtn?.classList.remove('hidden');
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        sound.resumeBGM();
        this.ui.pauseBtn.textContent = '⏸️';
        this.ui.quitBtn?.classList.add('hidden');
      }
    });

    // 放棄任務 (暫停時可見)：以「陣亡」結算後回主選單
    this.ui.quitBtn?.addEventListener('click', () => {
      if (this.state !== 'PAUSED') return;
      if (!confirm('確定要放棄本次任務？（將以失敗結算）')) return;
      this.ui.quitBtn.classList.add('hidden');
      this.handleGameOver(false);
      this.returnToMenu();
    });

    // 佈署砲塔 (鍵盤 B / HUD 按鈕，行動端用按鈕)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') this.buildTurret();
      if (e.key === 't' || e.key === 'T') this.tryUpgradeNearestTurret();
      if (e.key === 'g' || e.key === 'G') this.hireMercenary();
    });
    this.ui.buildBtn.addEventListener('click', () => this.buildTurret());

    // 戰術閃避翻滾 (Space / 行動端按鈕)
    this.input.onDash = () => this.triggerDash();
    this.ui.dashBtn?.addEventListener('click', () => this.triggerDash());

    // 僱傭傭兵 (G / 行動端按鈕)
    this.ui.hireBtn?.addEventListener('click', () => this.hireMercenary());

    // 砲塔進化專精按鈕 (UI 建構子已掛 click，走 _turretUpCb；這裡不要再掛，避免一次點擊雙重觸發)

    // 每日挑戰入口按鈕
    this.ui.dailyBtn?.addEventListener('click', () => this.startDailyChallenge());

    // 超武合成圖鑑 (主選單查閱配方)
    this.ui.recipeBtn?.addEventListener('click', () => this.ui.openRecipeModal(save.data));

    // 音效切換按鈕
    this.ui.soundBtn.addEventListener('click', () => {
      const enabled = sound.toggleSound();
      this.ui.soundBtn.textContent = enabled ? '🔊' : '🔇';
    });
  }

  // 戰術閃避翻滾
  triggerDash() {
    if (this.state !== 'PLAYING' || !this.player) return;
    if (this.player.dash(this.input.vector)) {
      this.camera.shake = Math.max(this.camera.shake, 4);
      this.ui.updateDash(this.player.dashMaxTimer ? this.player.dashTimer / this.player.dashMaxTimer : 0);
    }
  }

  // 砲塔專精進化 (消耗 50 金幣)
  tryUpgradeNearestTurret() {
    if (this.state !== 'PLAYING' || !this.player || !this.mode.turrets) return;
    const upgradeCost = 50;
    const standardTurrets = this.turrets
      .filter((t) => t.variant === 'standard' && Math.hypot(t.x - this.player.x, t.y - this.player.y) <= 125)
      .sort((a, b) =>
        Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y)
      );
    if (standardTurrets.length === 0) {
      this.ui.say('附近沒有可進化的標準砲塔', '#ffb703', 1.5);
      return;
    }
    if (this.gold < upgradeCost) {
      this.ui.say(`金幣不足，砲塔進化需要 ${upgradeCost} 🪙`, '#ff0055', 1.8);
      sound.playHurt();
      return;
    }
    const target = standardTurrets[0];
    const variants = ['flame', 'cryo', 'tesla'];
    const chosen = variants[Math.floor(Math.random() * variants.length)];
    this.gold -= upgradeCost;
    target.upgrade(chosen);
    this.particles.createShockwave(target.x, target.y, 140, TURRET_VARIANTS[chosen].color);
    sound.playEvoFanfare();
    this.ui.say(`砲塔進化完畢：【${TURRET_VARIANTS[chosen].name}】！`, TURRET_VARIANTS[chosen].color, 2.8);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
  }

  // 僱傭傭兵 (局內金幣消耗；最多 MERC.maxCount 名，費用隨人數成長)
  hireMercenary() {
    if (this.state !== 'PLAYING' || !this.player) return;
    if (!this.mode.mercs) {
      this.ui.say('生存者模式沒有傭兵 —— 靠走位活下來', '#8a9bb0', 1.6);
      return;
    }
    if (this.mercenaries.length >= MERC.maxCount) {
      this.ui.say(`傭兵小隊已滿員 (${MERC.maxCount}/${MERC.maxCount})`, '#8a9bb0', 1.6);
      sound.playHurt();
      return;
    }
    const cost = this.mercCost;
    if (this.gold < cost) {
      this.ui.say(`金幣不足，僱傭傭兵需要 ${cost} 🪙`, '#ff0055', 1.8);
      sound.playHurt();
      return;
    }
    this.gold -= cost;
    const m = new Mercenary(this.player.x, this.player.y, this.mercenaries.length);
    this.mercenaries.push(m);
    this.particles.createShockwave(this.player.x, this.player.y, 90, '#3ddc84');
    sound.playEvoFanfare();
    this.ui.say(`💂 傭兵報到！(${cost} 🪙) 擊殺敵人可升級`, '#3ddc84', 2.4);
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
  }

  get mercCost() {
    const n = this.mercenaries.length;
    return n >= MERC.maxCount ? null : MERC.baseCost + MERC.costGrowth * n;
  }

  // 傭兵 AI 更新：跟隨/索敵開火 + 被敵人啃食；陣亡清掉
  updateMercenaries(dt) {
    for (let i = this.mercenaries.length - 1; i >= 0; i--) {
      const m = this.mercenaries[i];
      m.update(dt, this.player, this.enemies, (merc, target) => {
        const dx = target.x - merc.x;
        const dy = target.y - merc.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.weaponManager.projectiles.push(new Projectile({
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
      for (const e of this.enemies) {
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
        this.particles.createExplosion(m.x, m.y, 40);
        this.particles.createShockwave(m.x, m.y, 80, '#4a7c3f');
        sound.playHurt();
        this.ui.say('💂 傭兵陣亡！重新僱傭一位吧', '#ff5e5e', 2.2);
        this.mercenaries.splice(i, 1);
        this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
      }
    }
  }

  // 啟動每日挑戰。固定跑生存者模式 —— 每日挑戰的賣點是「同一天所有人條件一致」，
  // 讓它跟著當前選的模式跑就破功了。
  startDailyChallenge() {
    this.dailyConfig = getDailyChallenge();
    this.modeId = 'survivor';
    this.mode = getMode('survivor');
    this.ui.startScreen.classList.add('hidden');
    this.start(true);
  }

  // 打擊微頓挫 (Hitstop)
  triggerHitstop(duration = 0.05) {
    this.hitstopTimer = Math.max(this.hitstopTimer, duration);
  }

  // 連擊計算與狂潮觸發
  addCombo() {
    this.combo++;
    this.comboTimer = 3.6;
    if (this.combo === 30 || (this.combo > 30 && (this.combo - 30) % 25 === 0)) {
      this.frenzyTimer = 7.5;
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 160, '#00e5ff');
      this.ui.say('🔥 連擊狂潮！急速射擊！', '#00e5ff', 2.2);
    }
    this.ui.updateCombo(this.combo, this.frenzyTimer > 0);
  }

  // 初始化全圖可引爆場景物件
  initExplodableProps() {
    this.explodableProps = [];
    const bounds = GAME_CONFIG.WORLD_BOUNDS;
    const count = 14;
    const types = ['tank', 'car', 'hazard'];
    for (let i = 0; i < count; i++) {
      let px = 0, py = 0;
      let tries = 0;
      do {
        px = bounds.minX + 250 + Math.random() * (bounds.maxX - bounds.minX - 500);
        py = bounds.minY + 250 + Math.random() * (bounds.maxY - bounds.minY - 500);
        tries++;
      } while (Math.hypot(px, py) < 320 && tries < 20);

      const type = types[Math.floor(Math.random() * types.length)];
      this.explodableProps.push({
        x: px,
        y: py,
        hp: 45,
        maxHp: 45,
        radius: type === 'car' ? 32 : 24,
        type: type,
        flashTimer: 0,
      });
    }
  }

  // 引爆場景油桶/載具
  triggerPropExplosion(prop) {
    this.particles.createExplosion(prop.x, prop.y, 140);
    this.particles.createShockwave(prop.x, prop.y, 180, '#ff9e00');
    sound.playExplosion();
    this.camera.shake = Math.max(this.camera.shake, 14);
    // 爆炸焦痕
    this.addDecal(prop.x, prop.y, 150, FX.scorch.fill, FX.scorch.a, FX.scorch.accent, FX.decalLife + 2);

    const blastR = 175;
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const d = Math.hypot(enemy.x - prop.x, enemy.y - prop.y);
      if (d < blastR + enemy.radius) {
        this.damageEnemy(enemy, 350, 16, prop.x, prop.y);
      }
    }
    const playerDist = Math.hypot(this.player.x - prop.x, this.player.y - prop.y);
    if (playerDist < blastR && this.player.takeDamage(12)) {
      this.particles.createHurtText(this.player.x, this.player.y, 12);
    }
  }

  // 拾取幸運補給箱抽獎
  openLuckyChest() {
    this.state = 'CHEST_MODAL';
    sound.pauseBGM();
    sound.playEvoFanfare();

    const roll = Math.random();
    const count = roll < 0.2 ? 1 : roll < 0.85 ? 3 : 5;

    const rewardPool = [
      { name: '金幣大獎', desc: '+120 🪙 戰備金', icon: '🪙', isGold: true, apply: () => { this.gold += Math.round(120 * this.metaGoldMul); } },
      { name: '急救補給包', desc: '+45 HP 治療', icon: '🩹', apply: () => { this.player.heal(45); } },
      { name: '超導磁石', desc: '瞬間吸收全圖寶石', icon: '🧲', apply: () => { for (const d of this.dropItems) d.isAttracted = true; } },
      { name: '基因碎片', desc: '+35 🧬 密鑰', icon: '🧬', apply: () => { save.data.dna += 35; save.flush(); } },
      { name: '全頻震盪波', desc: '消滅全螢幕雜兵', icon: '💣', apply: () => {
        for (const e of this.enemies) {
          if (!e.isBoss) e.takeDamage(9999, 10, this.player.x, this.player.y);
          else e.takeDamage(300, 5, this.player.x, this.player.y);
        }
      }},
    ];

    // 可升級的既有武器 (不含超武；level 已滿的也排除)
    const upgradeable = [];
    for (const [id, item] of this.weaponManager.weapons) {
      const def = WEAPONS[id];
      if (def && !item.isEvo && item.level < def.maxLevel) upgradeable.push(id);
    }
    if (upgradeable.length > 0) {
      rewardPool.push({
        name: '武器突變',
        desc: '隨機在場武器立即升級 +1',
        icon: '⚡',
        apply: () => {
          const wid = upgradeable[Math.floor(Math.random() * upgradeable.length)];
          this.weaponManager.upgradeWeapon(wid);
          this.ui.updateSkillSlots(this.weaponManager);
        }
      });
    }

    const pickedRewards = [];
    for (let i = 0; i < count; i++) {
      const rw = rewardPool[Math.floor(Math.random() * rewardPool.length)];
      pickedRewards.push(rw);
    }

    this.ui.showLuckyChest(count, pickedRewards, () => {
      for (const r of pickedRewards) {
        r.apply();
      }
      this.state = 'PLAYING';
      sound.resumeBGM();
      this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
      this.ui.updateBuildBtn(this.gold, this.turretCost);
      this.particles.createShockwave(this.player.x, this.player.y, 160, '#ffd60a');
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

  // 切模式：解鎖清單與最佳紀錄都依模式而分，所以要連帶重繪關卡卡片
  refreshModeSelect() {
    this.ui.buildModeSelect(MODES, MODE_ORDER, this.modeId, (id) => {
      this.modeId = id;
      this.mode = getMode(id);
      save.set({ mode: id });
      // 換模式後原本選的關卡可能還沒在這個模式解鎖
      if (!save.isUnlocked(this.levelId, id)) {
        this.levelId = 'street';
        save.set({ lastLevel: 'street' });
      }
      this.refreshLevelSelect();
    });
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
    // 每日挑戰會強制切成生存者，回選單要把玩家自己選的模式還原回來
    this.modeId = MODES[save.data.mode] ? save.data.mode : 'survivor';
    this.mode = getMode(this.modeId);
    this.isDaily = false;
    this.ui.gameOverModal.classList.add('hidden');
    this.ui.startScreen.classList.remove('hidden');

    this.enemies = [];
    this._pendingSpawns = [];
    this.enemyProjectiles = [];
    this.dropItems = [];
    this.turrets = [];
    this.mercenaries = [];
    this.decals = [];
    this.hazards = [];
    this.boss = null;
    this.core = null;
    this.ui.updateCoreHUD(null);
    this.particles.clear();
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.shake = 0;

    this.ui.updateBossHUD(null);
    this.ui.updateHUD(this.player, 0, 0, 0);
    this.ui.pauseBtn.textContent = '⏸️';
    this.ui.quitBtn?.classList.add('hidden');
    this.ui.updateDnaChip(save.data.dna, save.data.gold);
    this.refreshModeSelect();
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
    p.legendaryEffects = g.effects || [];
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
    this.metaGoldMul = (1 + m.gold) * (this.mode ? this.mode.goldMul : 1);
    // 冷卻加成要在被動重算時才會套用，開局先跑一次
    this.weaponManager.applyPassives();
  }

  start(isDaily = false) {
    this.isDaily = isDaily;
    this.dailyConfig = isDaily ? (this.dailyConfig || getDailyChallenge()) : null;

    sound.ensureContext();
    const activeLevelId = this.isDaily ? this.dailyConfig.levelKey : this.levelId;
    sound.startBGM(activeLevelId);

    this.level = LEVELS[activeLevelId] || LEVELS.street;
    this.spawner.setLevel(activeLevelId);

    // 模式：守塔在場中央生出基地核心，玩家開場站在核心下方讓出位置
    this.mode = getMode(this.modeId);
    this.core = this.mode.core ? new Core(this.mode.core) : null;
    const spawnY = this.core ? this.core.y + this.core.radius + 90 : 0;
    this.player = new Player(this.core ? this.core.x : 0, spawnY, this.characterId);
    this.weaponManager = new WeaponManager(this.player);
    this.applyMetaTalents();
    this.player.modeDmgMul = this.mode.weaponMul;
    this.weaponManager.applyPassives();

    // 戰術興奮劑 (單局戰備加成) 注入套用
    // 只讀不消耗：真正扣除留到 handleGameOver，開局秒退/放棄才不會白白吃掉戰備
    const activeBoosters = [...(save.data.boosters || [])];
    if (activeBoosters.length > 0) {
      for (const bId of activeBoosters) {
        if (bId === 'speed_stim') {
          this.player.speedMultiplier += 0.15;
          this.player.baseSpeedMul += 0.15;
        } else if (bId === 'pierce_ammo') {
          this.player.bonusPierce = (this.player.bonusPierce || 0) + 1;
        } else if (bId === 'fortune_magnet') {
          this.player.magnetMultiplier += 0.5;
          this.player.baseMagnet += 0.5;
          this.metaGoldMul = (this.metaGoldMul || 1) * 1.3;
        } else if (bId === 'frenzy_core') {
          this.player.metaCrit = (this.player.metaCrit || 0) + 0.10;
          this.player.metaCritDmg = (this.player.metaCritDmg || 0) + 0.25;
        } else if (bId === 'vitality_shield') {
          this.player.shield = 100;
          this.player.maxShield = 100;
        }
      }
      this.ui.sayStatus(`💉 戰術興奮劑已生效！(${activeBoosters.length} 項戰備)`);
    }

    // 每日挑戰詞條套用
    if (this.isDaily && this.dailyConfig) {
      for (const mod of this.dailyConfig.modifiers) {
        if (mod.playerSpeedMul) this.player.speedMultiplier *= mod.playerSpeedMul;
        if (mod.playerHpMul) {
          this.player.maxHp = Math.round(this.player.maxHp * mod.playerHpMul);
          this.player.hp = this.player.maxHp;
        }
      }
    }

    this.lowHpWarned = false;
    this.particles.clear();
    this.enemies = [];
    this._pendingSpawns = [];
    this.enemyProjectiles = [];
    this.dropItems = [];
    this.turrets = [];
    this.mercenaries = [];
    this.decals = [];
    this.initExplodableProps();
    this.extractionWell = null;

    this.gameTime = 0;
    this.kills = 0;
    this.gold = 0;
    this.boss = null;
    this.hitstopTimer = 0;
    this.redFlash = 0; // Boss 大招紅閃
    this.combo = 0;
    this.comboTimer = 0;
    this.frenzyTimer = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.shake = 0;
    this.hazards = [];
    this._mechTimers = {};       // 每種 mech 各自計時
    this._shrinkCircle = null;   // 深淵縮圈狀態
    this.player.iceFriction = 0; // 重設冰面慣性
    this.killMilestoneAt = 100;
    this.timeMilestoneAt = 120;
    this.pendingGear = [];       // 局內拾獲待回收裝備 (暫存區)
    this.ui.updatePendingGear(0);
    this.input.reset();

    this.ui.updateSkillSlots(this.weaponManager);
    this.ui.updateBossHUD(null);
    this.ui.updateDash(0);
    this.ui.updateCombo(0, false);
    this.ui.showTurretUpgrade(false);

    if (this.isDaily && this.dailyConfig) {
      this.ui.say(`每日挑戰啟動！【${this.dailyConfig.modifiers.map((m) => m.name).join(' | ')}】`, '#00e5ff', 4.5);
    } else {
      this.ui.say(this.player.character.lines.start, this.player.character.accent);
    }

    this.ui.setModeButtons(this.mode);
    this.ui.updateCoreHUD(this.core);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
    this.state = 'PLAYING';
  }

  get turretCost() {
    const raw = TURRET.baseCost + TURRET.costGrowth * this.turrets.length;
    return Math.round(raw * (this.mode ? this.mode.turretCostMul : 1));
  }

  buildTurret() {
    if (this.state !== 'PLAYING') return;
    if (!this.mode.turrets) {
      this.ui.say('生存者模式沒有砲塔 —— 靠走位活下來', '#8a9bb0', 1.6);
      return;
    }

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
        this.damageEnemy(target, dmg, 1, t.x, t.y, 'turret');
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
    // Boss 大招紅閃 (Soulstone 風格：施法瞬間畫面邊緣泛紅；召喚較輕)
    this.redFlash = Math.max(this.redFlash, act === 'summon' ? 0.3 : 0.55);
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
    } else if (act === 'barrage') {
      // 扇形散彈幕 (7 發)
      const count = 7;
      const spread = Math.PI * 0.55;
      const baseAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
      sound.playShoot();
      for (let i = 0; i < count; i++) {
        const angle = baseAngle - spread / 2 + (spread / (count - 1)) * i;
        const spd = 260;
        this.spawnEnemyProjectile(boss, {
          x: boss.x + Math.cos(angle) * (boss.radius + 12),
          y: boss.y + Math.sin(angle) * (boss.radius + 12),
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          damage: 16,
          radius: 8,
          life: 4.5,
          color: '#ff0055',
          glow: '#ff5400',
        });
      }
      this.particles.createShockwave(boss.x, boss.y, boss.radius * 2, '#ff0055');
    } else if (act === 'vortex') {
      // 引力漩渦：短暫強烈吸引玩家往 Boss 靠近
      boss.vortexTimer = 2.2;
      this.particles.createShockwave(boss.x, boss.y, 220, '#7209b7');
      sound.playExplosion();
      this.camera.shake = Math.max(this.camera.shake, 8);
    } else if (act === 'ground') {
      // 地面預警雷區：在特工附近召喚定時爆破地雷 (與關卡 mech 地雷同 schema：kind/r/t)
      const offsetAng = Math.random() * Math.PI * 2;
      const offsetDist = Math.random() * 80 + 35;
      const b = GAME_CONFIG.WORLD_BOUNDS;
      const mx = Math.max(b.minX + 60, Math.min(b.maxX - 60, this.player.x + Math.cos(offsetAng) * offsetDist));
      const my = Math.max(b.minY + 60, Math.min(b.maxY - 60, this.player.y + Math.sin(offsetAng) * offsetDist));
      this.hazards.push({
        kind: 'mine',
        x: mx,
        y: my,
        r: 110,
        color: '#ff0055',
        t: 0,
        tick: 0.5,
        fuse: 1.6,
        dur: 0,
        dmg: 18,
        dmgEnemy: 450,
      });
      this.particles.createShockwave(boss.x, boss.y, 90, '#ff0055');
    }
  }

  spawnEnemyProjectile(shooter, projData) {
    if (this.enemyProjectiles.length < 150) {
      this.enemyProjectiles.push(new EnemyProjectile(projData));
    }
  }

  updateEnemyProjectiles(dt) {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      ep.update(dt);
      if (ep.isDead) {
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  checkEnemyProjectileHits() {
    const p = this.player;
    if (p.isDead) return;

    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      if (ep.isDead) continue;

      const dist = Math.hypot(p.x - ep.x, p.y - ep.y);
      let consumed = false;
      // 優先判定玩家 (含無敵幀擋彈)
      if (dist < p.radius + ep.radius) {
        consumed = true;
        if (p.takeDamage(ep.damage)) {
          this.camera.shake = Math.max(this.camera.shake, 6);
          this.particles.createHurtText(p.x, p.y, ep.damage);
          this.particles.createDeathParticles(ep.x, ep.y, ep.color || '#06d6a0', 6);
          p.character.onHit?.(this);
        }
      }
      // 沒打到玩家就檢查傭兵 (酸液/彈幕會打傭兵)
      if (!consumed) {
        for (const m of this.mercenaries) {
          if (m.isDead) continue;
          const dm = Math.hypot(m.x - ep.x, m.y - ep.y);
          if (dm < 11 + ep.radius) {
            consumed = true;
            m.takeDamage(ep.damage);
            this.particles.createDeathParticles(ep.x, ep.y, ep.color || '#06d6a0', 3);
            break;
          }
        }
      }
      if (consumed) {
        ep.isDead = true;
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  // 關卡地形機制更新 (levels.mechs 陣列)：毒霧、地雷、噴發 + 冰面/安全高台/縮圈
  updateHazards(dt) {
    const level = this.level || LEVELS.street;
    // 向下相容：舊的 mech 單物件自動包成陣列
    const mechs = level.mechs || (level.mech ? [level.mech] : []);

    for (const mech of mechs) {
      // 冰面慣性：只需每幀設定玩家的 iceFriction
      if (mech.type === 'ice') {
        this.player.iceFriction = mech.friction || 0.92;
        continue;
      }
      // 縮圈結界：每幀縮小半徑，圈外扣血 + 向圈心微推
      if (mech.type === 'shrinkCircle') {
        if (!this._shrinkCircle) {
          this._shrinkCircle = { radius: mech.startRadius, tick: 0 };
        }
        const sc = this._shrinkCircle;
        sc.radius = Math.max(mech.endRadius, sc.radius - mech.shrinkRate * dt);
        sc.tick -= dt;
        const p = this.player;
        const dist = Math.hypot(p.x, p.y); // 圈心固定在世界原點
        if (dist > sc.radius) {
          if (sc.tick <= 0) {
            sc.tick = mech.dmgInterval || 0.4;
            if (p.takeDamage(mech.dmg)) this.particles.createHurtText(p.x, p.y, mech.dmg);
          }
          // 微推向圈心
          if (dist > 0) {
            p.x -= (p.x / dist) * 30 * dt;
            p.y -= (p.y / dist) * 30 * dt;
          }
        }
        continue;
      }

      // 需要計時器的機制 (pool/mine/geyser/supply/safeZone)
      const timerKey = mech.type;
      if (this._mechTimers[timerKey] === undefined) {
        this._mechTimers[timerKey] = 10; // 開場 10 秒後才開始
      }
      this._mechTimers[timerKey] -= dt;
      if (this._mechTimers[timerKey] <= 0) {
        this._mechTimers[timerKey] = mech.interval + Math.random() * (mech.jitter || 0);
        this.spawnHazard(mech);
      }
    }

    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;

      if (h.kind === 'pool') {
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
      } else if (h.kind === 'safeZone') {
        // 安全高台：站在範圍「外」持續扣血
        h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.5;
          const dx = p.x - h.x;
          const dy = p.y - h.y;
          const rr = h.r + p.radius;
          if (dx * dx + dy * dy > rr * rr) {
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
      dur: mech.dur || mech.duration || 0,
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
    // 地雷/噴發地面焦痕
    this.addDecal(h.x, h.y, h.r * 0.9, FX.scorch.fill, FX.scorch.a, hexToRgba(h.color, 0.45), FX.decalLife + 2);

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
      } else if (h.kind === 'mine' || h.kind === 'geyser') {
        // 地雷/噴發：倒數警示 (Soulstone 風格刻紋圓陣：旋轉虛線外環 + 內縮實圈 + 輻條)
        const prog = Math.min(1, h.t / h.fuse); // 0→1 越接近引爆
        const R = h.r * (1.3 - prog * 0.3);
        ctx.strokeStyle = h.color;
        // 外環旋轉虛線
        ctx.globalAlpha = 0.25 + prog * 0.4;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 9]);
        ctx.lineDashOffset = -h.t * 40;
        ctx.beginPath();
        ctx.arc(0, 0, R + 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // 內縮主警示圈
        ctx.globalAlpha = 0.4 + prog * 0.5;
        ctx.lineWidth = 3 + prog * 2;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        // 8 支輻條
        ctx.globalAlpha = 0.2 + prog * 0.45;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + h.t * 1.2;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          ctx.moveTo(ca * (R + 18), sa * (R + 18));
          ctx.lineTo(ca * (R + 24 + prog * 4), sa * (R + 24 + prog * 4));
        }
        ctx.stroke();
        // 中央核心點 (越接近越亮越大)
        ctx.fillStyle = h.color;
        ctx.globalAlpha = 0.5 + prog * 0.4;
        ctx.shadowColor = h.color;
        ctx.shadowBlur = 10 + prog * 10;
        ctx.beginPath();
        ctx.arc(0, 0, 5 + prog * 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (h.kind === 'safeZone') {
        // 安全高台：亮綠色光圈，站裡面才安全
        const wob = 1 + Math.sin(h.t * 2.5) * 0.03;
        const fadeIn = Math.min(1, h.t / 0.5);
        const fadeOut = Math.min(1, (h.dur - h.t) / 0.6);
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
        ctx.stroke();
        // 內部安全光暈
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.r * wob);
        g.addColorStop(0, 'rgba(0,230,118,0.12)');
        g.addColorStop(1, 'rgba(0,230,118,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, h.r * wob, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 縮圈結界 (深淵無盡戰)
    if (this._shrinkCircle) {
      const sc = this._shrinkCircle;
      const mechs = (this.level || LEVELS.street).mechs || [];
      const scMech = mechs.find((m) => m.type === 'shrinkCircle');
      if (scMech) {
        ctx.save();
        const cx = 0 - cam.x;
        const cy = 0 - cam.y;
        // 圈外半透明紫霧
        ctx.fillStyle = 'rgba(120,50,255,0.06)';
        ctx.beginPath();
        ctx.rect(0, 0, this.vw, this.vh);
        ctx.arc(cx, cy, sc.radius, 0, Math.PI * 2, true);
        ctx.fill();
        // 圈邊緣
        ctx.strokeStyle = scMech.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 + Math.sin(this.gameTime * 2) * 0.15;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -this.gameTime * 30;
        ctx.beginPath();
        ctx.arc(cx, cy, sc.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
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
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
        this.render();
      } else {
        this.update(dt);
        this.render();
      }
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

    // 4. 更新怪物行動、遠程射擊與自爆回呼
    // 守塔模式：雜兵朝基地核心進攻；Boss 仍鎖玩家 (技能全以玩家為原點，且核心撐不住 Boss)
    const mobTarget = this.core && this.mode.enemyTarget === 'core' ? this.core : this.player;
    for (const enemy of this.enemies) {
      enemy.update(dt, enemy.isBoss ? this.player : mobTarget, {
        onExplode: (boomer) => {
          // 自爆蟲引爆
          this.particles.createExplosion(boomer.x, boomer.y, 75);
          sound.playExplosion();
          const dist = Math.hypot(this.player.x - boomer.x, this.player.y - boomer.y);
          if (dist <= 75 + this.player.radius) {
            this.player.takeDamage(20);
            this.camera.shake = 8;
          }
        },
        onBossSkill: (boss, act) => this.handleBossSkill(boss, act),
        onShoot: (shooter, projData) => this.spawnEnemyProjectile(shooter, projData),
        onHatch: (e) => this.spawnHatchling(e),
      });

      // Boss 引力漩渦吸附判定
      if (enemy.isBoss && enemy.vortexTimer > 0) {
        enemy.vortexTimer -= dt;
        const vdx = enemy.x - this.player.x;
        const vdy = enemy.y - this.player.y;
        const vdist = Math.hypot(vdx, vdy);
        if (vdist > 15) {
          const pullSpeed = 165 * dt;
          this.player.x += (vdx / vdist) * pullSpeed;
          this.player.y += (vdy / vdist) * pullSpeed;
        }
        if (Math.random() < 0.4) {
          this.particles.createDeathParticles(
            enemy.x + (Math.random() - 0.5) * 160,
            enemy.y + (Math.random() - 0.5) * 160,
            '#b5179e',
            2
          );
        }
      }

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

    // 4.2 更新敵方投射物與判定
    this.updateEnemyProjectiles(dt);
    this.checkEnemyProjectileHits();

    // 4.5 砲塔開火與被啃
    this.updateTurrets(dt);

    // 4.55 基地核心 (守塔模式)：雜兵貼上來就啃，破了即任務失敗。
    // 推擠對所有貼上來的怪都生效 (物理阻擋)，但「打得到核心」的只有最外圈的
    // CORE_MAX_ATTACKERS 隻 —— 否則傷害會隨怪數無上限累加 (實測不防守時會衝到
    // 2,972 DPS、249 隻同時啃)，核心開多少血都是幾十秒內被秒。
    if (this.core) {
      this.core.update(dt);
      let attackers = 0;
      for (const e of this.enemies) {
        if (e.isDead) continue;
        const dx = e.x - this.core.x;
        const dy = e.y - this.core.y;
        const minD = this.core.radius + e.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        // 推開，讓怪圍在核心外圈啃 (比照砲塔被啃的處理)
        e.x = this.core.x + (dx / d) * minD;
        e.y = this.core.y + (dy / d) * minD;
        if (attackers < CORE_MAX_ATTACKERS) {
          attackers++;
          this.core.takeDamage(e.damage * dt * 1.5);
        }
      }
      if (this.core.isDead) {
        this.particles.createExplosion(this.core.x, this.core.y, 220);
        this.particles.createShockwave(this.core.x, this.core.y, 420, '#ff0055');
        sound.playExplosion();
        this.camera.shake = 24;
        this.ui.say('💥 基地核心被摧毀！任務失敗', '#ff0055', 3);
        this.handleGameOver(false);
        return;
      }
      this.ui.updateCoreHUD(this.core);
    }

    // 迴圈中孵化的新怪統一在這裡入場 (下一幀才開始行動)
    if (this._pendingSpawns.length > 0) {
      this.enemies.push(...this._pendingSpawns);
      this._pendingSpawns.length = 0;
    }

    // 4.6 傭兵 AI (跟隨/索敵/被啃)
    this.updateMercenaries(dt);

    // 檢測是否在標準砲塔附近 (顯示進化按鈕)
    const nearStandardTurret = this.turrets.find(
      (t) => t.variant === 'standard' && Math.hypot(t.x - this.player.x, t.y - this.player.y) <= 125
    );
    if (nearStandardTurret && this.gold >= 50) {
      // 第二參數才是點擊回呼 (UI 簽名 showTurretUpgrade(show, onUpgrade)) — 別把砲塔物件當回呼傳
      this.ui.showTurretUpgrade(true, () => this.tryUpgradeNearestTurret());
    } else {
      this.ui.showTurretUpgrade(false);
    }

    // 4.6 關卡地形機制 (毒霧/地雷/噴發/空投)
    this.updateHazards(dt);

    // 4.7 可引爆物件受傷閃白更新
    for (const prop of this.explodableProps) {
      if (prop.flashTimer > 0) prop.flashTimer -= dt;
    }

    // 地面殘跡生命週期
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const dc = this.decals[i];
      dc.life -= dt;
      if (dc.life <= 0) this.decals.splice(i, 1);
    }

    // 4.8 撤離井刷新與倒數 (生成位置 clamp 在世界邊界內，避免貼牆時開在界外)
    if (!this.extractionWell && ((this.gameTime >= 150 && this.gameTime < 155) || (this.gameTime >= 330 && this.gameTime < 335))) {
      const ang = Math.random() * Math.PI * 2;
      const d = 360 + Math.random() * 120;
      const b = GAME_CONFIG.WORLD_BOUNDS;
      this.extractionWell = {
        x: Math.max(b.minX + 90, Math.min(b.maxX - 90, this.player.x + Math.cos(ang) * d)),
        y: Math.max(b.minY + 90, Math.min(b.maxY - 90, this.player.y + Math.sin(ang) * d)),
        radius: 75,
        holdTime: 0,
        requiredTime: 4.0,
        life: 25, // 25 秒沒人進去就關閉，讓 5:30 的第二窗口能再開
        active: true,
      };
      sound.playEvoFanfare();
      this.ui.say('🚨 戰術撤離井已開啟！前往光環完成撤離獲取巨額獎勵！', '#00e5ff', 4.5);
    }

    if (this.extractionWell && this.extractionWell.active) {
      this.extractionWell.life -= dt;
      if (this.extractionWell.life <= 0) {
        // 錯過窗口：關閉並清掉，下一窗口才能再開
        this.extractionWell = null;
        this.ui.say('🚁 戰術撤離井已關閉', '#8a9bb0', 2);
      } else {
        const dist = Math.hypot(this.player.x - this.extractionWell.x, this.player.y - this.extractionWell.y);
        if (dist <= this.extractionWell.radius) {
          this.extractionWell.holdTime += dt;
          if (Math.random() < 0.4) {
            this.particles.createShockwave(this.extractionWell.x, this.extractionWell.y, this.extractionWell.radius, '#00e5ff');
          }
          if (this.extractionWell.holdTime >= this.extractionWell.requiredTime) {
            this.extractionWell.active = false;
            sound.playEvoFanfare();
            this.particles.createShockwave(this.extractionWell.x, this.extractionWell.y, 600, '#00e5ff');
            const rewardDna = 180;
            save.data.dna += rewardDna;

            // 撤離井成功：目前背包內的所有待回收裝備直接安全入庫！
            // (只保住此刻手上的，之後再撿的照樣吃陣亡懲罰 —— 這才是「回收風險」)
            let securedCount = 0;
            if (this.pendingGear && this.pendingGear.length > 0) {
              securedCount = this.pendingGear.length;
              for (const it of this.pendingGear) {
                if (!save.addItem(it)) {
                  save.data.dna += salvageValue(it);
                }
              }
              this.pendingGear = [];
              this.ui.updatePendingGear(0);
            }
            save.flush();

            this.gold += 150;
            const secMsg = securedCount > 0 ? `，安全運回 ${securedCount} 件裝備！` : '！';
            this.ui.say(`🚁 戰術撤離成功！+${rewardDna} 🧬 DNA, +150 🪙${secMsg}`, '#ffd60a', 4);
            for (const e of this.enemies) {
              if (!e.isBoss && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 500) {
                e.takeDamage(9999, 10, this.player.x, this.player.y);
              }
            }
            // 撤離成功後清掉，讓 5:30 的第二窗口能再開一次
            this.extractionWell = null;
          }
        } else {
          this.extractionWell.holdTime = Math.max(0, this.extractionWell.holdTime - dt * 0.8);
        }
      }
    }

    // 5. 武器庫冷卻與攻擊 (連擊狂潮下攻速加速 35%)
    const weaponDt = this.frenzyTimer > 0 ? dt * 1.35 : dt;
    this.weaponManager.update(weaponDt, this.enemies, this.particles);

    // 6. 投射物與怪物/環境碰撞檢測
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

    // 12. 翻滾冷卻與連擊倒數更新
    this.ui.updateDash(this.player.dashMaxTimer ? this.player.dashTimer / this.player.dashMaxTimer : 0);
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
      this.ui.updateCombo(this.combo, this.frenzyTimer > 0);
    }
    if (this.redFlash > 0) this.redFlash = Math.max(0, this.redFlash - dt * 1.6);
    if (this.frenzyTimer > 0) {
      this.frenzyTimer -= dt;
      if (Math.random() < 0.25) {
        this.particles.createShockwave(this.player.x, this.player.y, 25, '#00e5ff');
      }
    }

    // 13. 更新 UI
    this.ui.updateHUD(this.player, this.gameTime, this.kills, this.gold);
    this.ui.updateBuildBtn(this.gold, this.turretCost);
    this.ui.updateHireBtn(this.mercCost, this.gold >= (this.mercCost || 1e9));
    this.ui.updateBossHUD(this.boss);
    this.ui.setObjective(this.objectiveText());

    // 14. 里程碑獎勵 (擊殺數 / 存活時間)
    this.checkMilestones();
  }

  checkProjectileCollisions() {
    for (const p of this.weaponManager.projectiles) {
      if (p.isDead || p.type === 'rocket') continue; // 火箭走自帶到達爆炸

      const hitR = p.radius;

      // 投射物與可引爆物判定
      for (let i = this.explodableProps.length - 1; i >= 0; i--) {
        const prop = this.explodableProps[i];
        const dx = prop.x - p.x;
        const dy = prop.y - p.y;
        const rr = hitR + prop.radius;
        if (dx * dx + dy * dy < rr * rr) {
          prop.hp -= p.damage;
          prop.flashTimer = 0.12;
          this.particles.createDamageText(prop.x, prop.y, p.damage, false);
          sound.playHit();
          p.pierce--;
          if (p.pierce <= 0) {
            p.isDead = true;
          }
          if (prop.hp <= 0) {
            this.triggerPropExplosion(prop);
            this.explodableProps.splice(i, 1);
          }
          break;
        }
      }

      for (const enemy of this.enemies) {
        if (p.isDead) break; // 投射物已撞爆可引爆物件身亡，不再繼續掃怪
        if (enemy.isDead || p.hitEnemies.has(enemy)) continue;

        // 平方距離比較：省掉每組碰撞一次的開根號 (滿級彈幕×兩百隻怪是每幀幾萬次運算)
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const rr = hitR + enemy.radius;
        if (dx * dx + dy * dy >= rr * rr) continue;

        p.hitEnemies.add(enemy);

        // 給予傷害與擊退
        const died = enemy.takeDamage(p.damage, p.knockback, p.x, p.y);
        if (died && p.mercOwner) p.mercOwner.gainKill(); // 傭兵擊殺 → 經驗升級
        this.weaponManager.recordDamage(p.weaponId, p.damage);
        this.particles.createDamageText(enemy.x, enemy.y, p.damage, p.isCrit || p.isEvo, p.isCrit);
        sound.playHit();

        // 傳奇特效：暴擊衝擊波
        if (p.isCrit && this.player.legendaryEffects?.includes('crit_blast')) {
          this.particles.createShockwave(enemy.x, enemy.y, 45, '#ffb703');
          for (const nearE of this.enemies) {
            if (nearE !== enemy && !nearE.isDead && Math.hypot(nearE.x - enemy.x, nearE.y - enemy.y) < 55) {
              nearE.takeDamage(Math.round(p.damage * 0.4), 3, enemy.x, enemy.y);
            }
          }
        }

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
        this.addCombo();
        // 傳奇特效：擊殺汲取生命
        if (this.player.legendaryEffects?.includes('kill_heal')) {
          this.player.heal(3);
        }
        if (enemy.isBoss) {
          this.triggerHitstop(0.08);
        } else if (enemy.isElite) {
          this.triggerHitstop(0.035);
        }
        this.player.character.onKill?.(enemy, this);
        this.particles.createDeathParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 8);

        // 地面殘跡：雜兵死亡留血漬 (Soulstone 風格視覺回饋)
        if (!enemy.isBoss && Math.random() < FX.bloodChance) {
          const [rr, gg, bb] = this._hexRgb(enemy.color);
          this.addDecal(enemy.x, enemy.y, enemy.radius * FX.splatScale,
            `${Math.round(rr * 0.55)},${Math.round(gg * 0.5)},${Math.round(bb * 0.55)}`, 0.5);
        }

        // 掉落經驗寶石或稀有道具
        this.spawnDropItem(enemy);

        // 孢子母體死亡裂解成幼體 (沿用母體的血量成長係數)
        if (enemy.splitInto && this.enemies.length < MAX_ENEMIES) {
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

          // Boss 級焦痕
          const [rr, gg, bb] = this._hexRgb(enemy.color);
          this.addDecal(enemy.x, enemy.y, enemy.radius * FX.bossSplatScale,
            `${Math.round(rr * 0.4)},${Math.round(gg * 0.38)},${Math.round(bb * 0.42)}`, 0.62, null, FX.bossDecalLife);

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

  // 增殖胞囊孵化：吐出雜兵 (沿用目前關卡的雜兵血量成長係數)
  spawnHatchling(hatcher) {
    if (this.enemies.length + this._pendingSpawns.length >= MAX_ENEMIES) return;
    const hpMul =
      (1 + (this.gameTime / 60) * 0.4) * (this.level ? this.level.hpScale : 1);
    for (let i = 0; i < (hatcher.hatchCount || 1); i++) {
      const ang = Math.random() * Math.PI * 2;
      // 不能直接 push 進 this.enemies：孵化是在敵人 update 迴圈裡觸發的，
      // 當場加入會讓新生怪在同一幀被 update + 撞擊判定 (玩家還沒看到就吃傷害)
      this._pendingSpawns.push(new Enemy(
        hatcher.hatchMinion,
        hatcher.x + Math.cos(ang) * (hatcher.radius + 10),
        hatcher.y + Math.sin(ang) * (hatcher.radius + 10),
        hpMul
      ));
    }
    this.particles.createExplosion(hatcher.x, hatcher.y, 46);
    sound.playExplosion();
  }

  spawnDropItem(enemy) {
    const rand = Math.random();
    let kind = 'EXP_GREEN';

    if (enemy.isBoss) {
      kind = 'EXP_GOLD';
      // Boss 必掉幸運輪盤補給箱 (終極首領打完直接勝利，箱子撿不到，略過)
      if (!enemy.isFinal) {
        this.dropItems.push(new DropItem(enemy.x + 24, enemy.y + 24, 'CHEST'));
      }
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

    // 精英怪掉得更好：保底紫水晶，22% 機率掉幸運補給箱，另有機率改噴金幣
    if (enemy.isElite && !enemy.isBoss) {
      if (Math.random() < 0.22) {
        this.dropItems.push(new DropItem(enemy.x + 18, enemy.y, 'CHEST'));
      } else if (Math.random() < 0.25) {
        kind = 'GOLD_COIN';
      } else if (kind === 'EXP_GREEN' || kind === 'EXP_BLUE') {
        kind = 'EXP_PURPLE';
      }
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
        // 開箱/升級會切換狀態機 (CHEST_MODAL/LEVEL_UP)：剩餘掉落物等恢復後再撿，
        // 避免同幀疊加 (雙箱互蓋、升級卡被箱子蓋掉)
        if (this.state !== 'PLAYING') break;
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
    } else if (item.type === 'chest') {
      this.openLuckyChest();
    } else if (item.type === 'gear') {
      const gear = item.item;
      if (!gear) return;
      if (!this.pendingGear) this.pendingGear = [];
      this.pendingGear.push(gear);
      this.ui.updatePendingGear(this.pendingGear.length);
      const color = RARITIES[gear.rarity].color;
      sound.playEvoFanfare();
      this.particles.createShockwave(this.player.x, this.player.y, 130, color);
      this.ui.say(`拾獲 ${itemName(gear)}！(暫存待回收)`, color, 2.6);
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
      save.markEvolved(selectedOption.targetId); // 圖鑑 ★ 標記 (跨局保留)
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
    save.consumeBoosters(); // 本局結算了才真正消耗戰術興奮劑
    const lines = this.player.character.lines;
    const result = save.recordRun(this.level.id, {
      time: this.gameTime,
      kills: this.kills,
      level: this.player.level,
      cleared: isVictory,
      dnaMult: this.level.dnaMult,
      nextLevel: this.level.next,
      // 每日挑戰成績獨立 (daily 欄位)：不寫入該關 best、不解鎖下一關，但 DNA 照發
      skipProgress: this.isDaily,
      modeId: this.modeId,
      gold: this.gold,
    });

    if (this.isDaily && this.dailyConfig) {
      save.recordDailyRun({
        date: this.dailyConfig.date,
        time: this.gameTime,
        cleared: isVictory,
      });
    }

    // 局內待回收裝備結算：通關 100% 入庫，陣亡隨機保留 50% (撤離井是當場入庫，不留旗標)
    const savedGear = [];
    const lostGear = [];
    const salvagedGear = []; // 倉庫滿 → 自動分解換 DNA，跟真的入庫要分開列
    const secure = (it) => {
      if (save.addItem(it)) savedGear.push(it);
      else {
        save.data.dna += salvageValue(it);
        salvagedGear.push(it);
      }
    };
    if (this.pendingGear && this.pendingGear.length > 0) {
      if (isVictory) {
        for (const it of this.pendingGear) secure(it);
      } else {
        const shuffled = [...this.pendingGear].sort(() => Math.random() - 0.5);
        const keepCount = Math.ceil(shuffled.length * 0.5);
        for (const it of shuffled.slice(0, keepCount)) secure(it);
        lostGear.push(...shuffled.slice(keepCount));
      }
      save.flush();
      this.pendingGear = [];
      this.ui.updatePendingGear(0);
    }

    this.ui.showGameOver(
      {
        isVictory: isVictory,
        gameTime: this.gameTime,
        kills: this.kills,
        level: this.player.level,
        gold: this.gold,
        line: isVictory ? lines.win : lines.death,
        codename: this.player.character.codename,
        levelName: this.isDaily
          ? `每日挑戰·${this.level.name} (${this.dailyConfig?.date || ''})`
          : this.level.name,
        dna: result.dna,
        totalDna: save.data.dna,
        totalGold: save.data.gold,
        bestTime: this.isDaily
          ? (save.data.daily && save.data.daily.date === this.dailyConfig?.date ? save.data.daily.bestTime || 0 : 0)
          : (save.bestOf(this.level.id, this.modeId)?.time || 0),
        unlockedName: result.unlockedNew ? LEVELS[this.level.next].name : null,
      },
      this.weaponManager,
      { savedGear, lostGear, salvagedGear }
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

    // 地面殘跡 (血漬/焦痕，實體之下)
    this.drawDecals(this.ctx, renderCam);

    // 全域色調 overlay (Soulstone 風格調光：場景染上關卡色，角色保持原色)
    this.drawColorGrade();

    // 繪製掉落物
    for (const item of this.dropItems) {
      item.draw(this.ctx, renderCam);
    }

    // 繪製可引爆場景物件 (油桶/載具)
    this.drawExplodableProps(renderCam);

    // 繪製戰術撤離井
    if (this.extractionWell && this.extractionWell.active) {
      this.drawExtractionWell(renderCam);
    }

    // 繪製地形機制 (毒霧圈 / 地雷警示)
    this.drawHazards(renderCam);

    // 繪製武器投射物 (地面積火最底層)
    this.weaponManager.draw(this.ctx, renderCam);

    // 繪製基地核心 (守塔模式)
    if (this.core) this.core.draw(this.ctx, renderCam);

    // 繪製砲塔
    for (const t of this.turrets) {
      t.draw(this.ctx, renderCam);
    }

    // 繪製怪物
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx, renderCam);
    }

    // 繪製敵方投射物
    for (const ep of this.enemyProjectiles) {
      ep.draw(this.ctx, renderCam);
    }

    // 繪製傭兵 (隊友，畫在敵人之上、特工之下)
    for (const m of this.mercenaries) {
      m.draw(this.ctx, renderCam);
    }

    // 繪製主角特工鴨
    this.player.draw(this.ctx, renderCam);

    // 繪製粒子、衝擊波與傷害飄字
    this.particles.draw(this.ctx, renderCam);

    // 畫面後製：暗角 + 玩家聚光，讓視覺焦點集中在主角身上
    this.drawVignette();

    // Boss 大招紅閃 (畫面邊緣泛紅，最上層)
    if (this.redFlash > 0) {
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(
        this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.35,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      g.addColorStop(0, 'rgba(255,0,60,0)');
      g.addColorStop(1, `rgba(255,0,60,${(0.3 * this.redFlash).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }

    // 小地圖
    this.drawMinimap();
  }

  drawExplodableProps(camera) {
    const ctx = this.ctx;
    for (const p of this.explodableProps) {
      const rx = p.x - camera.x;
      const ry = p.y - camera.y;
      if (rx < -80 || rx > this.vw + 80 || ry < -80 || ry > this.vh + 80) continue;

      ctx.save();
      ctx.translate(rx, ry);

      // 陰影
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, p.radius * 0.7, p.radius, p.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 受擊閃白
      if (p.flashTimer > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      if (p.type === 'tank') {
        // 紅色高爆汽油桶
        ctx.fillStyle = '#d90429';
        ctx.strokeStyle = '#2b2d42';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-16, -22, 32, 44, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-14, -8, 28, 6);
        ctx.fillRect(-14, 6, 28, 6);

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛢️', 0, 0);
      } else if (p.type === 'hazard') {
        // 毒素生化廢料桶
        ctx.fillStyle = '#06d6a0';
        ctx.strokeStyle = '#073b4c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-18, -20, 36, 40, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☣️', 0, 0);
      } else {
        // 廢棄裝甲車
        ctx.fillStyle = '#3a5a40';
        ctx.strokeStyle = '#1b263b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-28, -18, 56, 36, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1b263b';
        ctx.fillRect(-20, -10, 40, 20);

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚨', 0, 0);
      }

      // 血條
      if (p.hp < p.maxHp) {
        const bw = p.radius * 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-bw / 2, -p.radius - 10, bw, 4);
        ctx.fillStyle = '#ef233c';
        ctx.fillRect(-bw / 2, -p.radius - 10, bw * (p.hp / p.maxHp), 4);
      }

      ctx.restore();
    }
  }

  drawExtractionWell(camera) {
    const ctx = this.ctx;
    const well = this.extractionWell;
    const rx = well.x - camera.x;
    const ry = well.y - camera.y;

    ctx.save();
    ctx.translate(rx, ry);

    const pulse = (Math.sin(this.gameTime * 4) + 1) * 0.5;
    ctx.strokeStyle = `rgba(0, 229, 255, ${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, well.radius + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const progress = Math.min(1, well.holdTime / well.requiredTime);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, well.radius, 0, Math.PI * 2);
    ctx.fill();

    if (progress > 0) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, well.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    }

    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚁', 0, 0);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`撤離進度 ${Math.round(progress * 100)}%`, 0, well.radius + 18);

    ctx.restore();
  }

  // 全域色調 overlay：關卡色上下漸層，極淡染上場景 (角色繪製在其上，不受影響)
  drawColorGrade() {
    const theme = (this.level || LEVELS.street).theme;
    const gr = theme && theme.grade;
    if (!gr) return;
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.vh);
    g.addColorStop(0, `rgba(${gr.c1},${gr.a1})`);
    g.addColorStop(0.55, `rgba(${gr.c1},${(gr.a1 * 0.4).toFixed(4)})`);
    g.addColorStop(1, `rgba(${gr.c2},${gr.a2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  drawVignette() {
    // ponytail: 暗角烘焙進離屏 canvas，每幀只做一次 drawImage
    const vigLevel = this.level || LEVELS.street;
    const vigMult = (vigLevel.theme && vigLevel.theme.vignette) || 1;
    if (!this._vigCanvas || this._vigCanvas.width !== Math.round(this.vw) ||
        this._vigCanvas.height !== Math.round(this.vh) || this._vigKey !== vigLevel.id) {
      const oc = document.createElement('canvas');
      oc.width = Math.max(1, Math.round(this.vw));
      oc.height = Math.max(1, Math.round(this.vh));
      const octx = oc.getContext('2d');
      const g = octx.createRadialGradient(
        this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.22,
        this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, `rgba(0,0,0,${(0.28 * vigMult).toFixed(3)})`);
      g.addColorStop(1, `rgba(0,0,0,${(0.72 * vigMult).toFixed(3)})`);
      octx.fillStyle = g;
      octx.fillRect(0, 0, oc.width, oc.height);
      this._vigCanvas = oc;
      this._vigKey = vigLevel.id;
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

    // Soulstone 風格地面質感層：汙漬色塊 + 每關專屬地表材質 (畫在網格之下)
    // 材質細節每關烘焙成一片世界錨定的無接縫紋理磚，逐幀只做 drawImage 拼貼
    const groundTex = this.getGroundTexture(this.level || LEVELS.street);
    const gTile = groundTex.width;
    const gOx = -(((camera.x % gTile) + gTile) % gTile);
    const gOy = -(((camera.y % gTile) + gTile) % gTile);
    for (let gy = gOy; gy < H; gy += gTile) {
      for (let gx = gOx; gx < W; gx += gTile) {
        ctx.drawImage(groundTex, gx, gy);
      }
    }

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

  // 程序化地面材質烘焙 (Soulstone 風格參考)：世界座標雜湊決定汙漬與材質細節，
  // 結果烘進一片無接縫紋理磚，之後每幀只做 drawImage。紋理/材質種類由
  // levels.js theme.ground.motif / material 資料決定。
  getGroundTexture(level) {
    const id = (level && level.id) || 'street';
    if (this._groundTextures && this._groundTextures[id]) return this._groundTextures[id];

    // 世界錨定的接縫消除：先把細節畫在一片比成品大 2×PAD 的畫布上，
    // 再裁出中央區塊當磚。跨磚界的柔光汙漬光暈照常接合，不會出現週期接縫。
    const T = 768;            // 成品磚大小
    const P = 230;            // 出血區 (涵蓋最大光暈半徑與裂縫漂移)
    const B = T + P * 2;

    const big = document.createElement('canvas');
    big.width = big.height = B;
    const bx = big.getContext('2d');

    const g = level.theme && level.theme.ground;
    const seed = this._groundSeed(id);
    const h = (cx, cy, k) => {
      const s = Math.sin(cx * 127.1 + cy * 311.7 + (seed + k * 74.7)) * 43758.5453;
      return s - Math.floor(s);
    };
    const cell = 240;
    const c0 = Math.floor(-P / cell) - 1;
    const c1 = Math.ceil((T + P) / cell) + 1;

    for (let cy = c0; cy <= c1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const x = cx * cell + P;   // 磚面座標 = 世界座標 + 出血位移
        const y = cy * cell + P;
        if (!g) continue;
        const r = h(cx, cy, 1);

        // 1) 大面積柔光汙漬 (光暈半徑最大 ~192 ≤ P，烘焙後無接縫)
        if (r < 0.6) {
          const p = g.patches[r < 0.25 ? 0 : 1];
          const px = x + r * cell * 2.6 - cell * 0.8;
          const py = y + h(cx, cy, 2) * cell * 2.6 - cell * 0.8;
          const rad = 90 + r * 170;
          const grad = bx.createRadialGradient(px, py, 0, px, py, rad);
          grad.addColorStop(0, `rgba(${p.c},${p.a})`);
          grad.addColorStop(1, `rgba(${p.c},0)`);
          bx.fillStyle = grad;
          bx.beginPath();
          bx.arc(px, py, rad, 0, Math.PI * 2);
          bx.fill();
        }

        // 2) 專屬地表紋理 (每格 1-2 筆)
        const n = 1 + Math.floor(h(cx, cy, 3) * 2);
        for (let k = 0; k < n; k++) {
          this._groundMotif(bx, g, x, y, cell, h(cx, cy, 4 + k), h(cx, cy, 9 + k));
        }

        // 3) 每格的材質微粒 (粗礫 / 刷紋 / 霜雪 / 星塵)
        if (g.material) this._groundGrain(bx, g, x, y, cell, h(cx, cy, 40), h(cx, cy, 41), h(cx, cy, 42));
      }
    }

    // 4) 材質大範圍特徵 (油漬裂縫、鉚釘、熔岩餘燼、星點…)
    if (g && g.material) this._groundMaterialAccents(bx, g, h, T, P);

    const tile = document.createElement('canvas');
    tile.width = tile.height = T;
    tile.getContext('2d').drawImage(big, P, P, T, T, 0, 0, T, T);
    if (!this._groundTextures) this._groundTextures = {};
    this._groundTextures[id] = tile;
    return tile;
  }

  _groundSeed(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
    return s;
  }

  // 材質微粒：依材質在每個格子內撒低對比顆粒，做出「材質感」而非純色地板
  _groundGrain(ctx, g, x, y, cell, r1, r2, r3) {
    const mat = g.material;
    const dot = (gx, gy, rad, rgb, a) => {
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.beginPath();
      ctx.arc(gx, gy, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    const count = mat === 'snow' ? 7 : mat === 'metal' ? 2 : 2 + Math.floor(r1 * 4);
    for (let i = 0; i < count; i++) {
      const gx = x + ((r2 + i * 0.31) % 1) * cell;
      const gy = y + ((r3 + i * 0.17) % 1) * cell;
      const rad = 0.6 + ((r2 * 7 + i) % 1) * 1.6;
      if (mat === 'snow') dot(gx, gy, rad, '235,245,255', 0.1 + r1 * 0.12);
      else if (mat === 'metal') dot(gx, gy, rad * 0.8, '255,255,255', 0.04);
      else if (mat === 'lava') dot(gx, gy, rad, '15,8,6', 0.5);
      else if (mat === 'void') dot(gx, gy, rad * 0.7, '255,255,255', 0.06 + r1 * 0.14);
      else dot(gx, gy, rad, '0,0,0', 0.1 + r1 * 0.12);   // asphalt 粗礫
    }
  }

  // 材質大範圍特徵。中心點都收進「安全帶」([P+m, T-(P+m)])，讓放射狀光暈
  // 完整落在成品磚內，磚界才不會切到半顆光暈。
  _groundMaterialAccents(ctx, g, h, T, P) {
    const mat = g.material;
    const bandX = (n, a, m, maxR = 10) => P + (maxR + h(n, a, 0) * (T - maxR * 2));
    const bandY = (n, a, m, maxR = 10) => P + (maxR + h(n, a, 1) * (T - maxR * 2));

    ctx.save();
    if (mat === 'asphalt') {
      // 深色柏油縫裂 (短、粗、不走太遠才不會被磚界切段)
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      for (let n = 0; n < 6; n++) {
        const x0 = bandX(n, 0, 0, 160);
        const y0 = bandY(n, 0, 0, 160);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let i = 1; i < 5; i++) {
          ctx.lineTo(x0 + (h(n, i, 0) - 0.5) * 52, y0 + (h(n, i, 0) - 0.5) * 52);
        }
        ctx.stroke();
      }
      // 偶發圓形人孔蓋縫
      for (let n = 0; n < 2; n++) {
        const cx = P + (120 + h(n, 22, 0) * (T - 240));
        const cy = P + (120 + h(n, 23, 0) * (T - 240));
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (mat === 'metal') {
      // 水平金屬刷紋 + 鉚釘點列
      for (let y = 10; y < T + P; y += 84) {
        const a = Math.max(0, 0.03 + Math.sin(y * 0.25) * 0.02);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(P, P + y, T, 1.2);
      }
      for (let n = 0; n < 10; n++) {
        const px = bandX(n, 30, 0, 20);
        const py = bandY(n, 30, 0, 20);
        ctx.fillStyle = 'rgba(200,255,225,0.16)';
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mat === 'snow') {
      // 大面積霜雪輝光 (安全帶確保光暈不切到磚界)
      for (let n = 0; n < 9; n++) {
        const px = bandX(n, 40, 0, 150);
        const py = bandY(n, 40, 0, 150);
        const rad = 60 + h(n, 41, 0) * 90;
        const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, 'rgba(255,255,255,0.06)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mat === 'lava') {
      // 熔岩餘燼光點 (帶 glow)
      for (let n = 0; n < 26; n++) {
        const px = bandX(n, 50, 0, 8);
        const py = bandY(n, 50, 0, 8);
        const rad = 1.2 + h(n, 51, 0) * 2.2;
        const gr = ctx.createRadialGradient(px, py, 0, px, py, rad * 3.4);
        gr.addColorStop(0, 'rgba(255,160,50,0.85)');
        gr.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(px, py, rad * 3.4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mat === 'void') {
      // 虛空星點 (含少量大星帶星芒)
      for (let n = 0; n < 46; n++) {
        const px = bandX(n, 60, 0, 6);
        const py = bandY(n, 60, 0, 6);
        const sz = h(n, 61, 0);
        if (sz > 0.45) {
          const big = sz > 0.85;
          const rad = big ? 2.6 : 1.4;
          const gr = ctx.createRadialGradient(px, py, 0, px, py, rad * 3.2);
          gr.addColorStop(0, 'rgba(230,210,255,0.9)');
          gr.addColorStop(1, 'rgba(230,210,255,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(px, py, rad * 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(px, py, big ? 1.2 : 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  _groundMotif(ctx, g, x, y, cell, r1, r2) {
    const mx = x + r1 * cell;
    const my = y + r2 * cell;
    ctx.save();
    switch (g.motif) {
      case 'panel': {
        // 實驗室金屬板接縫 (與主網格錯位的淡框) + 少數鉚釘
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx - cell * 0.22, my - cell * 0.22, cell * 0.44, cell * 0.44);
        if (r2 > 0.72) {
          ctx.fillStyle = g.accent;
          ctx.beginPath();
          ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'crystal': {
        // 雪地冰晶簇: 3-4 支半透明藍白三角
        ctx.fillStyle = g.motifColor;
        const base = r1 > 0.5 ? 4 : 3;
        for (let i = 0; i < base; i++) {
          const a = -Math.PI / 2 + (i - (base - 1) / 2) * 0.55 + (r2 - 0.5) * 0.4;
          const len = 5 + r1 * 12 + i * 2;
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(a + Math.PI / 2) * 3.4, my + Math.sin(a + Math.PI / 2) * 3.4);
          ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len);
          ctx.lineTo(mx - Math.cos(a + Math.PI / 2) * 3.4, my - Math.sin(a + Math.PI / 2) * 3.4);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'lava': {
        // 熔爐龜裂地殼: 暗色裂縫 + 透出橙紅餘燼光點
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(mx - 13, my + (i ? 11 : -7));
          ctx.lineTo(mx - 3, my + (i ? 4 : 2));
          ctx.lineTo(mx + 9, my + (i ? -7 : 10));
          ctx.stroke();
        }
        ctx.shadowColor = g.accent;
        ctx.shadowBlur = 8;
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.arc(mx + (r2 - 0.5) * 15, my + (r1 - 0.5) * 15, 1.4 + r2 * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'void': {
        // 深淵虛空: 淡紫同心弧符文 + 星塵點
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, 5 + r2 * 7, r1 * 6.283, r1 * 6.283 + 2.4);
        ctx.stroke();
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.arc(mx + 11, my - 7, 1.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        // 商業街柏油裂紋 + 偶發霓虹微光裂縫
        ctx.strokeStyle = g.motifColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(mx - 15, my + (r2 - 0.5) * 17);
        ctx.lineTo(mx - 4, my + (r1 - 0.5) * 10);
        ctx.lineTo(mx + 11, my + (r2 - 0.5) * 19);
        ctx.stroke();
        if (r1 > 0.62) {
          ctx.strokeStyle = g.accent;
          ctx.lineWidth = 1;
          ctx.shadowColor = g.accent;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(mx - 6, my + 4);
          ctx.lineTo(mx + 6, my - 3);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        break;
      }
    }
    ctx.restore();
  }
  // ── 地面殘跡 (血漬/焦痕，Soulstone 風格) ──
  addDecal(x, y, r, fill, alpha = 0.5, accent = null, life = FX.decalLife) {
    if (this.decals.length >= FX.decalCap) this.decals.shift();
    this.decals.push({
      x: x + (Math.random() - 0.5) * r * 0.4,
      y: y + (Math.random() - 0.5) * r * 0.4,
      r: r * (0.8 + Math.random() * 0.4),
      life,
      maxLife: life,
      fill,
      a: alpha,
      accent,
    });
  }

  _hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  drawDecals(ctx, cam) {
    for (const d of this.decals) {
      const sx = d.x - cam.x;
      const sy = d.y - cam.y;
      const m = d.r + 30;
      if (sx < -m || sx > this.vw + m || sy < -m || sy > this.vh + m) continue;
      const p = d.life / d.maxLife; // 1 → 0，隨時間淡出
      ctx.save();
      ctx.globalAlpha = d.a * Math.min(1, p * 1.8);
      ctx.fillStyle = `rgba(${d.fill},0.85)`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, d.r * 0.95, d.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (d.accent) {
        ctx.globalAlpha = d.a * p;
        ctx.strokeStyle = d.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, d.r * 0.95, d.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  // 掛在 window 上方便在 console 觀察/除錯遊戲狀態
  window.game = new Game();
});
