// UI 介面管理器 (HUD 抬頭顯示、升級三選一卡牌彈窗、技能格槽位與戰鬥統計)

import {
  WEAPONS,
  PASSIVES,
  GAME_CONFIG,
  SPECIAL_CARDS,
  ACHIEVEMENTS,
  CONSUMABLE_ITEMS,
  WEAPON_ASPECTS,
  ENEMY_TYPES,
} from '../config.js';
import { TALENTS, TALENT_ORDER, talentCost, talentInvested, talentTreeCost, talentValueAt, upgradeKeyOf, isBanishable, CHAR_LEVEL, charLevelBonuses, charLevelCost } from '../meta.js';
import { CHARACTERS, CHARACTER_ORDER } from '../characters.js';
import {
  RARITIES,
  SLOTS,
  SLOT_ORDER,
  itemName,
  ilvlText,
  affixText,
  itemScore,
  gearBonuses,
  AFFIXES,
  AFFIX_ORDER,
  LEGENDARY_EFFECTS,
  salvageValue,
  salvageGold,
  reforgeCost,
  SETS,
  legendaryEffectText,
  FUSION_COST,
  fuseItems,
} from '../items.js';
import { JEWELS, JEWEL_ORDER, jewelValue } from '../jewels.js';
import { questText } from '../quests.js';
import { MECH_INFO } from '../levels.js';
import { CODEX_MILESTONES, codexCategories, codexHas, codexProgress } from '../codex.js';
import { save, STASH_CAP } from '../save.js';
import { sound } from '../audio.js';
import {
  MAX_BOOSTER_STACK,
  SHOP_CRATES,
  SHOP_BOOSTERS,
  stashExpandCost,
  MAX_STASH_CAP,
  STASH_EXPANSION_STEP,
  shopItemLevel,
} from '../shop.js';

// 加成列最多顯示幾個 (只留最近取得的，其餘收成「+N」)
const BUFF_BAR_MAX = 4;

// 技能欄與加成列平時收起，更新時才展開這麼久 —— 它們久久才變一次，卻常駐佔掉
// 螢幕上緣一大塊。只是「瞄一眼確認拿到什麼」，收得快一點沒關係。
const HUD_PEEK_SECONDS = 1.0;

// 提示氣泡的時長上限。原本 1.4–4.5 秒，較長的訊息 (每日詞綴、關卡規則、Boss
// 警告) 會久久蓋住畫面下緣；但壓到 1 秒又來不及讀完。取中間值，短訊息維持原本
// 的時長，只有超過上限的才被截短。
const HUD_HINT_MAX_SECONDS = 2.5;

// 升級卡的實際數值變化：和 WeaponManager 開火時讀的是同一份 config，改平衡時卡面自動跟著變
const LEVEL_STAT_LABELS = {
  projectiles: '發射數', count: '數量', pierce: '穿透', radius: '範圍', explosionRadius: '爆炸半徑',
  strikes: '落雷數', bounces: '彈跳', outTime: '飛行時間', width: '光束寬',
};
export function weaponLevelDiff(def, level) {
  const parts = [];
  if (def.damageGrowth) parts.push(`傷害 +${def.damageGrowth}`);
  if (def.cooldownGrowth) parts.push(`冷卻 ${def.cooldownGrowth}s`);
  for (const [k, label] of Object.entries(LEVEL_STAT_LABELS)) {
    const arr = def[k];
    if (Array.isArray(arr) && arr[level] !== undefined && arr[level] !== arr[level - 1]) {
      parts.push(`${label} ${arr[level - 1]}→${arr[level]}`);
    }
  }
  return parts.join('，') || '效果提升';
}

// 被動配件卡：標出它是哪把「已持有武器」的超武配方，選卡時不用翻圖鑑
function pairedWeaponNote(passiveId, weaponManager) {
  for (const [wid, item] of weaponManager.weapons.entries()) {
    const def = WEAPONS[wid];
    if (!item.isEvo && def.pairPassive === passiveId && def.evoTarget) {
      return `<br>✨ ${def.icon}${def.name} 的超武配件（→【${WEAPONS[def.evoTarget].name}】）`;
    }
  }
  return '';
}

export class UIManager {
  constructor() {
    this.expFill = document.getElementById('exp-bar-fill');
    this.playerLevel = document.getElementById('player-level');
    this.timerText = document.getElementById('game-timer');
    this.killsText = document.getElementById('kill-count');
    this.goldText = document.getElementById('gold-count');
    this.objectiveEl = document.getElementById('objective');
    this._objectiveText = null;
    this.weaponSlots = document.getElementById('weapon-slots');
    this.passiveSlots = document.getElementById('passive-slots');

    this.bossHud = document.getElementById('boss-hud');
    this.bossHpFill = document.getElementById('boss-hp-fill');
    this.bossName = document.getElementById('boss-name');

    this.levelUpModal = document.getElementById('level-up-modal');
    this.cardsGrid = document.getElementById('upgrade-cards');
    this.rerollBtn = document.getElementById('btn-reroll');
    this.skipUpgradeBtn = document.getElementById('btn-skip-upgrade');
    this.banishInfo = document.getElementById('banish-info');

    this.startScreen = document.getElementById('start-screen');
    this.gameOverModal = document.getElementById('game-over-modal');

    // 主選單基因強化 (天賦)
    this.dnaChip = document.getElementById('dna-chip');
    this.statusEl = document.getElementById('start-status');
    this.talentStatusEl = document.getElementById('talent-status');
    this.gearModal = document.getElementById('gear-modal');
    this.gearSlots = document.getElementById('gear-slots');
    this.gearList = document.getElementById('gear-list');
    this.gearCount = document.getElementById('gear-count');
    this.gearStatus = document.getElementById('gear-status');
    this.talentModal = document.getElementById('talent-modal');
    this.talentList = document.getElementById('talent-list');
    this.talentDna = document.getElementById('talent-dna');

    this.soundBtn = document.getElementById('btn-sound');
    this.pauseBtn = document.getElementById('btn-pause');
    this.quitBtn = document.getElementById('btn-quit');
    this.skipChestChk = document.getElementById('chk-skip-chest');

    // 特工黑市 (Shop)
    this.goldChip = document.getElementById('gold-chip');
    this.shopModal = document.getElementById('shop-modal');
    this.shopBody = document.getElementById('shop-body');
    this.shopDnaVal = document.getElementById('shop-dna-val');
    this.shopGoldVal = document.getElementById('shop-gold-val');
    this.shopStashVal = document.getElementById('shop-stash-val');
    this.shopStatusEl = document.getElementById('shop-status');
    this.shopTabs = document.querySelectorAll('.shop-tab');
    this._currentShopTab = 'crates';

    this.shopTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.shopTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._currentShopTab = tab.dataset.tab;
        if (this._shopSave) this.rebuildShopView(this._shopSave);
      });
    });

    document.getElementById('btn-close-shop')?.addEventListener('click', () => {
      this.shopModal?.classList.add('hidden');
    });

    this.facilityBar = document.getElementById('facility-bar');
    this.buildBtn = document.getElementById('btn-build');
    this.buildCost = document.getElementById('build-cost');
    this.facilityButtons = {
      turret: { btn: document.getElementById('btn-build'), cost: document.getElementById('build-cost') },
      electric_grid: { btn: document.getElementById('btn-build-grid'), cost: document.getElementById('build-grid-cost') },
      purifier: { btn: document.getElementById('btn-build-purifier'), cost: document.getElementById('build-purifier-cost') },
      barricade: { btn: document.getElementById('btn-build-barricade'), cost: document.getElementById('build-barricade-cost') },
    };

    this.dashBtn = document.getElementById('btn-dash');
    this.dashOverlay = document.getElementById('dash-cooldown-overlay');
    this.turretUpBtn = document.getElementById('btn-turret-upgrade');
    this.hireBtn = document.getElementById('btn-hire');
    this.comboHud = document.getElementById('combo-hud');
    this.comboCount = document.getElementById('combo-count');

    this.luckyChestModal = document.getElementById('lucky-chest-modal');
    this.chestCards = document.getElementById('chest-cards');
    this.chestSubtitle = document.getElementById('chest-subtitle');
    this.chestClaimBtn = document.getElementById('btn-chest-claim');
    this.dailyBtn = document.getElementById('btn-daily');
    this.recipeBtn = document.getElementById('btn-recipe');
    this.recipeModal = document.getElementById('recipe-modal');
    this.recipeList = document.getElementById('recipe-list');
    // 兵器型態彈窗：型態選擇原本只掛在「角色卡的起始武器」上，導致 8 個家族裡有 3 個
    // （足球／迴力鏢／軌道炮）在 UI 上完全選不到、永遠只能用預設型態。這個彈窗把全部家族列出來。
    this.aspectBtn = document.getElementById('btn-aspects');
    this.aspectModal = document.getElementById('aspect-modal');
    this.aspectList = document.getElementById('aspect-list');

    this.charSelect = document.getElementById('character-select');
    this.levelSelect = document.getElementById('level-select');
    this.bubble = document.getElementById('dialogue-bubble');
    this.bubbleTimer = null;

    // 裝備三合一合成模式狀態
    this._fuseMode = false;
    this._selectedFuseIds = new Set();

    // 升級彈窗內的 reroll 按鈕 (純金幣消耗，遊戲端驗收)
    if (this.rerollBtn) {
      this.rerollBtn.addEventListener('click', () => {
        if (this._rerollCb) this._rerollCb();
      });
    }
    // 天賦彈窗關閉
    document.getElementById('btn-close-talents')?.addEventListener('click', () => {
      this.talentModal?.classList.add('hidden');
    });
    document.getElementById('btn-close-gear')?.addEventListener('click', () => {
      this.gearModal?.classList.add('hidden');
    });
    document.getElementById('btn-close-recipe')?.addEventListener('click', () => {
      this.recipeModal?.classList.add('hidden');
    });
    document.getElementById('btn-close-aspects')?.addEventListener('click', () => {
      this.aspectModal?.classList.add('hidden');
    });

    // 局內隨機事件橫幅
    this.eventBanner = document.getElementById('event-banner');

    // 局內祝福與協同欄
    this.skillsTray = document.getElementById('skills-tray');
    this.buffsTray = document.getElementById('buffs-tray');
    this._peekTimers = new Map();
    this.skillsTray?.classList.add('hud-peek');
    this.buffsTray?.classList.add('hud-peek');
    this.blessingsBar = document.getElementById('blessings-bar');
    this.synergiesBar = document.getElementById('synergies-bar');

    // 祝福選擇彈窗
    this.blessingModal = document.getElementById('blessing-modal');
    this.blessingTitle = document.getElementById('blessing-title');
    this.blessingCards = document.getElementById('blessing-cards');

    // 流浪商人彈窗
    this.merchantModal = document.getElementById('merchant-modal');
    this.merchantCards = document.getElementById('merchant-cards');
    this.merchantGoldVal = document.getElementById('merchant-gold-val');
    document.getElementById('btn-close-merchant')?.addEventListener('click', () => {
      this.onMerchantClose ? this.onMerchantClose() : this.hideMerchant();
    });

    // 成就彈窗
    this.achievementsModal = document.getElementById('achievements-modal');
    this.achievementsList = document.getElementById('achievements-list');
    this.achievementsProgress = document.getElementById('achievements-progress');
    this.achievementsTotalReward = document.getElementById('achievements-total-reward');
    this.achievementsBtn = document.getElementById('btn-achievements');
    this.achievementsBtn?.addEventListener('click', () => {
      this.showAchievements();
    });
    document.getElementById('btn-close-achievements')?.addEventListener('click', () => {
      this.achievementsModal?.classList.add('hidden');
    });

    if (this.turretUpBtn) {
      this.turretUpBtn.addEventListener('click', () => {
        if (this._turretUpCb) this._turretUpCb();
      });
    }

    this.initSlotPlaceholders();
  }

  // 選單狀態提示 (主選單 + 天賦彈窗 + 黑市各一列；訊息寫在看得見的那一層)
  sayStatus(text, isError = false) {
    clearTimeout(this._statusTimer);
    for (const el of [this.statusEl, this.talentStatusEl, this.gearStatus, this.shopStatusEl]) {
      if (!el) continue;
      el.textContent = text || '';
      el.classList.toggle('err', !!isError);
    }
    if (text) {
      this._statusTimer = setTimeout(() => {
        for (const el of [this.statusEl, this.talentStatusEl, this.gearStatus, this.shopStatusEl]) {
          if (el && el.textContent === text) el.textContent = '';
        }
      }, 2600);
    }
  }

  updateDnaChip(dna, gold) {
    const txt = `🧬 ${dna}`;
    if (this.dnaChip) this.dnaChip.textContent = txt;
    if (this.talentDna) this.talentDna.textContent = txt;
    if (this.shopDnaVal) this.shopDnaVal.textContent = dna;
    if (gold !== undefined) {
      if (this.goldChip) this.goldChip.textContent = `🪙 ${gold}`;
      if (this.shopGoldVal) this.shopGoldVal.textContent = gold;
    }
  }

  // HUD 任務提示列 (文字不變就不碰 DOM，避免每幀寫入)
  setObjective(text) {
    if (!this.objectiveEl) return;
    if (this._objectiveText === text) return;
    this._objectiveText = text;
    this.objectiveEl.textContent = text;
    this.objectiveEl.classList.toggle('urgent', /(終極|降臨)/.test(text));
  }

  // 開始畫面的特工選擇卡 (未解鎖的特工要花 DNA 解鎖，點卡即購買)
  buildCharacterSelect(characters, order, save, onPick, onUnlock, initialId = order[0], onAspectChange = null) {
    this.charSelect.innerHTML = '';

    order.forEach((id, i) => {
      const c = characters[id];
      const unlocked = save.characterUnlocked(id);
      const cost = c.unlockCost || 0;

      const card = document.createElement('div');
      card.className = 'char-card'
        + (unlocked && id === initialId ? ' selected' : '')
        + (unlocked ? '' : ' locked');
      card.style.setProperty('--accent', c.accent);
      const classColor = c.classColor || c.accent || '#00e5ff';
      const heroClass = c.heroClass || '特工';

      const aspects = WEAPON_ASPECTS[c.startWeapon] || [];
      const currentAspect = save.getWeaponAspect(c.startWeapon) || aspects[0]?.id;
      let aspectHtml = '';
      if (unlocked && aspects.length > 0) {
        aspectHtml = `
          <div class="char-aspect-section">
            <div class="char-aspect-title">⚔️ 兵器型態:</div>
            <div class="aspect-chips" data-weapon="${c.startWeapon}">
              ${aspects.map(a => `
                <span class="aspect-chip ${a.id === currentAspect ? 'active' : ''}" data-aspect="${a.id}" title="${a.name}: ${a.desc}">
                  ${a.icon} ${a.name.split(' ')[0]}
                </span>
              `).join('')}
            </div>
            <div class="aspect-desc-tooltip">${aspects.find(a => a.id === currentAspect)?.desc || ''}</div>
          </div>
        `;
      }

      card.innerHTML = `
        <canvas class="char-portrait" width="128" height="120"></canvas>
        <div class="char-class-badge" style="background:${classColor}; color:#0c1017;">${heroClass}</div>
        ${unlocked ? '' : `<div class="char-lock-badge">🔒 ${cost} 🧬</div>`}
        <div class="char-codename">${c.codename}${unlocked ? ` <span class="char-lv">Lv ${save.charLevel(id)}</span>` : ' <span class="lock-hint">未解鎖</span>'}</div>
        <div class="char-title">${c.title} <span class="char-class-tag" style="color:${classColor};">(${heroClass})</span></div>
        <div class="char-trait"><strong>${c.traitName}</strong>${c.traitDesc}</div>
        ${aspectHtml}
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.aspect-chip')) return;
        if (!unlocked) {
          // 鎖定卡：有給解鎖回呼就試買 (DNA 不足時由遊戲端顯示提示)
          if (typeof onUnlock === 'function') onUnlock(id, cost);
          return;
        }
        sound.playGem();
        this.charSelect.querySelectorAll('.char-card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        onPick(id);
      });

      if (unlocked && aspects.length > 0) {
        card.querySelectorAll('.aspect-chip').forEach(chip => {
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const aId = chip.dataset.aspect;
            save.setWeaponAspect(c.startWeapon, aId);
            sound.playGem();
            card.querySelectorAll('.aspect-chip').forEach(el => el.classList.toggle('active', el.dataset.aspect === aId));
            const descEl = card.querySelector('.aspect-desc-tooltip');
            if (descEl) {
              const found = aspects.find(a => a.id === aId);
              if (found) descEl.textContent = found.desc;
            }
            if (typeof onAspectChange === 'function') onAspectChange(c.startWeapon, aId);
          });
        });
      }

      this.charSelect.appendChild(card);

      // 直接把遊戲內同一組 sprite 畫成頭像，選角看到的就是實際長相
      import('../sprites.js').then(({ getSprite }) => {
        const ctx = card.querySelector('.char-portrait').getContext('2d');
        const sp = getSprite(c.sprite);
        ctx.save();
        ctx.translate(64, 68);
        ctx.scale(1.5, 1.5);
        ctx.drawImage(sp.frames[0], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        ctx.restore();
      });
    });
  }

  // 特工等級彈窗：每位已解鎖特工一列，「升 1 級」與「全部升」(花到資源不夠或滿級)
  openCharLevelModal(save, onLevelUp) {
    this._onCharLevelUp = onLevelUp;
    this.rebuildCharLevelView(save);
    document.getElementById('char-level-modal')?.classList.remove('hidden');
  }

  rebuildCharLevelView(save) {
    const list = document.getElementById('char-level-list');
    if (!list) return;
    const { gold, dna } = save.data;
    document.getElementById('char-level-wallet').textContent = `🪙 ${gold}　🧬 ${dna}`;
    const pct = (v) => `${Math.round(v * 1000) / 10}%`;
    list.innerHTML = '';
    for (const id of CHARACTER_ORDER) {
      if (!save.characterUnlocked(id)) continue;
      const c = CHARACTERS[id];
      const lvl = save.charLevel(id);
      const maxed = lvl >= CHAR_LEVEL.max;
      const now = charLevelBonuses(lvl);
      const next = charLevelBonuses(lvl + 1);
      const cost = charLevelCost(lvl);
      const affordable = !maxed && gold >= cost.gold && dna >= cost.dna;
      const row = document.createElement('div');
      row.className = 'talent-row' + (maxed ? ' maxed' : '');
      row.innerHTML = `
        <span class="talent-icon" style="color:${c.accent}">★</span>
        <div class="talent-info">
          <div class="talent-name">${c.codename}<span class="talent-lv">LV ${lvl}/${CHAR_LEVEL.max}</span></div>
          <div class="talent-desc">傷害 +${pct(now.dmg)}・生命 +${now.hp}・減傷 +${pct(now.armor)}${maxed ? '（已滿）' : `
            <span class="talent-next">下一級 → +${pct(next.dmg)} / +${next.hp} / +${pct(next.armor)}</span>`}</div>
        </div>
        <div class="char-level-btns">
          <button class="talent-up${affordable ? ' affordable' : ''}" data-times="1"${maxed ? ' disabled' : ''}>${maxed ? 'MAX' : `升級 ${cost.gold}🪙 ${cost.dna}🧬`}</button>
          ${maxed ? '' : `<button class="talent-up${affordable ? ' affordable' : ''}" data-times="all">全部升</button>`}
        </div>
      `;
      row.querySelectorAll('button[data-times]').forEach((b) => b.addEventListener('click', () => {
        this._onCharLevelUp?.(id, b.dataset.times === 'all' ? Infinity : 1);
      }));
      list.appendChild(row);
    }
  }

  // 基因強化 (天賦樹) 彈窗
  openTalentModal(save, onInvest) {
    this._onTalentInvest = onInvest || null;
    this.rebuildTalentView(save);
    this.talentModal?.classList.remove('hidden');
  }

  // 特工黑市彈窗
  openShopModal(save, handlers) {
    this._shopSave = save;
    this._shopHandlers = handlers;
    this.rebuildShopView(save);
    this.shopModal?.classList.remove('hidden');
  }

  rebuildShopView(save) {
    if (!this.shopBody) return;
    const dna = save.data.dna || 0;
    const gold = save.data.gold || 0;
    const stashCap = save.getStashCap();
    const stashLen = (save.data.stash || []).length;

    if (this.shopDnaVal) this.shopDnaVal.textContent = dna;
    if (this.shopGoldVal) this.shopGoldVal.textContent = gold;
    if (this.shopStashVal) this.shopStashVal.textContent = `${stashLen} / ${stashCap}`;

    this.shopBody.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'shop-grid';

    const bal = (cur) => (cur === 'gold' ? gold : dna);
    const btn = (attr, cur, key, cost, blocked) =>
      `<button class="shop-buy-btn" data-${attr}="${key}" data-currency="${cur}" ${bal(cur) >= cost && !blocked ? '' : 'disabled'}>${cur === 'gold' ? '🪙' : '🧬'} ${cost}</button>`;
    // 同一件商品的金幣 / DNA 兩種付款按鈕
    const group = (attr, key, costs, blocked) => `<div class="shop-btn-group">
      ${btn(attr, 'gold', key, costs.costGold, blocked)}
      ${btn(attr, 'dna', key, costs.costDna, blocked)}
    </div>`;

    if (this._currentShopTab === 'crates') {
      // 箱子的裝備等級跟著玩家的最佳紀錄（shopItemLevel）：把它顯示出來，
      // 玩家才看得出「打得深 → 黑市貨也跟著變好」這條線
      const lvl = shopItemLevel(save);
      for (const [key, crate] of Object.entries(SHOP_CRATES)) {
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.style.setProperty('--rarity', crate.color);
        const stashFull = save.stashFull();

        card.innerHTML = `
          <div class="shop-card-icon">${crate.icon}</div>
          <div class="shop-card-title" style="color: ${crate.color}">${crate.name}</div>
          <div class="shop-card-desc">${crate.desc}</div>
          <div class="shop-card-ilvl">裝備等級 <strong>Lv.${lvl.toFixed(2)}</strong>（隨你的最佳紀錄提升）</div>
          ${stashFull ? '<div style="color: #ff0055; font-size: 11px; margin-bottom: 6px; font-weight: bold;">⚠️ 裝備倉庫已滿</div>' : ''}
          ${group('buy-crate', key, crate, stashFull)}
        `;
        grid.appendChild(card);
      }
    } else if (this._currentShopTab === 'boosters') {
      for (const [key, booster] of Object.entries(SHOP_BOOSTERS)) {
        const card = document.createElement('div');
        card.className = 'shop-card';
        const owned = save.boosterCount(key);
        const full = owned >= MAX_BOOSTER_STACK;

        card.innerHTML = `
          <div class="shop-card-icon">${booster.icon}</div>
          <div class="shop-card-title" style="color: ${booster.color}">${booster.name}</div>
          <div class="shop-card-desc">${booster.desc}</div>
          ${owned > 0 ? `<div class="booster-equipped-badge">✓ 已就緒 ×${owned} / ${MAX_BOOSTER_STACK} (下局疊加生效)</div>` : ''}
          ${full ? '<div class="booster-equipped-badge">已帶滿上限</div>' : group('buy-booster', key, booster, false)}
        `;
        grid.appendChild(card);
      }
    } else if (this._currentShopTab === 'facilities') {
      const card = document.createElement('div');
      card.className = 'shop-card';
      const isMax = stashCap >= MAX_STASH_CAP;

      card.innerHTML = `
        <div class="shop-card-icon">🏢</div>
        <div class="shop-card-title" style="color: #4cc9f0">特工倉庫擴建</div>
        <div class="shop-card-desc">擴充特工裝備庫存容量 +${STASH_EXPANSION_STEP} 格<br>當前容量: <strong>${stashCap}</strong> / 最大: <strong>${MAX_STASH_CAP}</strong></div>
        ${isMax ? '<div class="booster-equipped-badge">已達最高等級 (MAX)</div>' : group('expand-stash', 'stash', stashExpandCost(stashCap), isMax)}
      `;
      grid.appendChild(card);
    } else if (this._currentShopTab === 'jewels') {
      // 珠寶收購：局內撿到的珠寶（陣亡也保留）在這裡換成金幣＋DNA
      const bag = save.data.jewels || {};
      const total = jewelValue(bag);
      const totalN = Object.values(bag).reduce((a, b) => a + b, 0);
      const head = document.createElement('div');
      head.className = 'shop-card jewel-sell-all';
      head.innerHTML = `
        <div class="shop-card-icon">💰</div>
        <div class="shop-card-title" style="color:#ffd166">整袋賣出</div>
        <div class="shop-card-desc">珠寶在局內撿到當下就收進珠寶袋，<strong>陣亡、放棄任務也不會遺失</strong>。<br>
          目前 ${totalN} 顆，總值 <strong>${total.gold} 🪙 + ${total.dna} 🧬</strong></div>
        <button class="shop-buy-btn" data-sell-jewel="*" ${totalN > 0 ? '' : 'disabled'}>全部賣出</button>
      `;
      grid.appendChild(head);
      for (const id of JEWEL_ORDER) {
        const j = JEWELS[id];
        const n = bag[id] || 0;
        const card = document.createElement('div');
        card.className = 'shop-card' + (n > 0 ? '' : ' jewel-empty');
        card.innerHTML = `
          <div class="shop-card-icon">${j.icon}</div>
          <div class="shop-card-title" style="color:${j.color}">${j.name}</div>
          <div class="shop-card-desc">收購價 ${j.gold} 🪙 + ${j.dna} 🧬<br>持有 <strong>${n}</strong> 顆</div>
          <div class="shop-btn-group">
            <button class="shop-buy-btn" data-sell-jewel="${id}" data-count="1" ${n > 0 ? '' : 'disabled'}>賣 1 顆</button>
            <button class="shop-buy-btn" data-sell-jewel="${id}" ${n > 1 ? '' : 'disabled'}>全賣 ×${n}</button>
          </div>
        `;
        grid.appendChild(card);
      }
    }

    this.shopBody.appendChild(grid);

    // Bind purchase buttons
    grid.querySelectorAll('[data-buy-crate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._shopHandlers?.onBuyCrate(btn.dataset.buyCrate, btn.dataset.currency);
      });
    });

    grid.querySelectorAll('[data-buy-booster]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._shopHandlers?.onBuyBooster(btn.dataset.buyBooster, btn.dataset.currency);
      });
    });

    grid.querySelectorAll('[data-expand-stash]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._shopHandlers?.onExpandStash(btn.dataset.currency);
      });
    });

    grid.querySelectorAll('[data-sell-jewel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sellJewel === '*' ? null : btn.dataset.sellJewel;
        this._shopHandlers?.onSellJewels(id, btn.dataset.count ? Number(btn.dataset.count) : Infinity);
      });
    });
  }

  rebuildTalentView(save) {
    const dna = save.data.dna;
    this.updateDnaChip(dna);
    if (!this.talentList) return;
    this.talentList.innerHTML = '';

    // 總進度：讓「基因強化還有多長」看得見（先前只有 5 個 LV x/5，看不出全樹規模）
    const invested = talentInvested(save.data.talents || {});
    const total = talentTreeCost();
    const head = document.createElement('div');
    head.className = 'talent-progress';
    head.innerHTML = `
      <div class="talent-progress-text">基因強化進度 <strong>${invested}</strong> / ${total} 🧬（${Math.round(invested / total * 100)}%）</div>
      <div class="talent-progress-bar"><span style="width:${Math.min(100, invested / total * 100).toFixed(1)}%"></span></div>
    `;
    this.talentList.appendChild(head);

    TALENT_ORDER.forEach((id) => {
      const def = TALENTS[id];
      const lvl = save.talentLevel(id);
      const maxed = lvl >= def.maxLevel;
      const cost = maxed ? 0 : talentCost(def, lvl);
      const now = talentValueAt(def, lvl);
      const next = talentValueAt(def, lvl + 1);

      const row = document.createElement('div');
      row.className = 'talent-row' + (maxed ? ' maxed' : '');
      const affordable = !maxed && dna >= cost;
      const nowTxt = def.valuePerLevel < 1 ? `${Math.round(now * 100)}%` : `${Math.round(now)}`;
      const nextTxt = def.valuePerLevel < 1 ? `${Math.round(next * 100)}%` : `${Math.round(next)}`;
      // 有 levelDesc 的天賦（緊急復甦）逐級用文字描述，數字說明不了
      const lvText = def.levelDesc
        ? (maxed ? `（已滿：${def.levelDesc[def.maxLevel]}）` : `　<span class="talent-next">下一級：${def.levelDesc[lvl + 1]}</span>`)
        : (maxed ? `（已滿：+${nextTxt}）` : `　<span class="talent-next">下一級 ${nowTxt} → ${nextTxt}</span>`);
      row.innerHTML = `
        <span class="talent-icon">${def.icon}</span>
        <div class="talent-info">
          <div class="talent-name">${def.name}<span class="talent-lv">LV ${lvl}/${def.maxLevel}</span></div>
          <div class="talent-desc">${def.desc}${lvText}</div>
        </div>
        <button class="talent-up${affordable ? ' affordable' : ''}"${maxed ? ' disabled' : ''}>${maxed ? 'MAX' : `升級 ${cost} 🧬`}</button>
      `;
      if (!maxed) {
        row.querySelector('.talent-up').addEventListener('click', () => {
          if (this._onTalentInvest) this._onTalentInvest(id);
        });
      }
      this.talentList.appendChild(row);
    });
  }

  // 裝備倉庫彈窗
  openGearModal(save, handlers) {
    this._gearHandlers = handlers;
    this.rebuildGearView(save);
    this.gearModal?.classList.remove('hidden');
  }

  rebuildGearView(save) {
    if (!this.gearSlots || !this.gearList) return;
    const stash = save.data.stash;
    const equipped = save.data.equipped;
    const byId = new Map(stash.map((it) => [it.id, it]));

    // 三個裝備槽
    this.gearSlots.innerHTML = '';
    SLOT_ORDER.forEach((slotKey) => {
      const def = SLOTS[slotKey];
      const item = byId.get(equipped[slotKey]);
      const cell = document.createElement('div');
      cell.className = 'gear-slot' + (item ? ' filled' : '');
      if (item) cell.style.setProperty('--rarity', RARITIES[item.rarity].color);
      cell.innerHTML = `
        <div class="gear-slot-icon">${def.icon}</div>
        <div class="gear-slot-name">${def.name}</div>
        ${item
          ? `<div class="gear-slot-item">${RARITIES[item.rarity].name} <span class="gear-ilvl">${ilvlText(item)}</span></div>
             <div class="gear-slot-affixes">${item.affixes.map(affixText).join('<br>')}</div>
             <button class="gear-mini-btn" data-unequip="${slotKey}">脫下</button>`
          : '<div class="gear-slot-empty">未裝備</div>'}
      `;
      this.gearSlots.appendChild(cell);
    });
    this.gearSlots.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', () => this._gearHandlers?.onUnequip(btn.dataset.unequip));
    });

    // 裝備總和摘要：把「火力 +25.5%、要害 +15.8%、處決 +57.8%…」攤開來，並換算成
    // 一句「等效傷害」。為什麼需要：裝備的價值分散在 6~9 條詞條上，玩家在倉庫裡只看到
    // 一件件的細項，感覺不到總共換到什麼 —— 這是「裝備感覺不到用處」的一大半原因。
    //
    // 等效傷害必須與 WeaponManager.fireWeapon 的實際公式一致，否則這個數字就是騙人：
    //   引擎：finalDamage = baseDmg × damageMultiplier × … × (crit ? 2 + critdmg : 1)
    //   期望值：1 + crit × (1 + critdmg)      ← 暴擊是「加倍再加 critdmg」
    // 舊版寫成 1 + crit × (1 + critdmg)，把暴擊的「2 倍」寫成了「1 倍」，
    // 系統提示因此系統性高估裝備價值（實測 ×1.98 vs 實際 ×1.86）。
    // 暴擊率另外夾在 100%：超過的部分沒有第二條路徑可以兌現。
    const summary = document.getElementById('gear-summary');
    if (summary) {
      const g = gearBonuses(stash, equipped);
      const parts = [];
      for (const key of AFFIX_ORDER) {
        const def = AFFIXES[key];
        const v = g[def.stat] || 0;
        if (v <= 0.0001) continue;
        parts.push(def.pct ? `${def.name} +${(v * 100).toFixed(1)}%` : `${def.name} +${Math.round(v)}`);
      }
      const crit = Math.min(1, g.crit || 0);
      const critFactor = 1 + crit * (1 + (g.critdmg || 0));
      const effective = (1 + (g.dmg || 0)) * critFactor;
      const eff = `等效傷害 ×${effective.toFixed(2)}（+${((effective - 1) * 100).toFixed(0)}%）`;
      const fx = (g.effects || []).map((k) => LEGENDARY_EFFECTS[k]?.name).filter(Boolean);
      const sets = (g.activeSets || []).map((s) => `★${s.name}`).join(' ');
      summary.innerHTML = parts.length
        ? `<div class="gear-summary-line"><strong>裝備總和</strong>：${parts.join('、')}</div>`
          + `<div class="gear-summary-line accent">${eff}${sets ? '　' + sets : ''}${fx.length ? '　特效：' + fx.join('、') : ''}</div>`
        : '<div class="gear-summary-line dim">尚未裝備任何裝備</div>';
    }

    // 套裝狀態列 (集齊 3 件專屬加成)
    const setStatus = document.getElementById('gear-status');
    if (setStatus) {
      const equippedItems = SLOT_ORDER.map((s) => byId.get(equipped[s])).filter(Boolean);
      const setCounts = {};
      for (const it of equippedItems) {
        if (it.setKey) setCounts[it.setKey] = (setCounts[it.setKey] || 0) + 1;
      }
      const badges = [];
      for (const [k, count] of Object.entries(setCounts)) {
        const sDef = SETS[k];
        if (!sDef) continue;
        if (count >= 3) {
          badges.push(`<span class="set-badge active" style="--set-c:${sDef.color}">★ ${sDef.name} (3/3 已激活：${sDef.bonusText})</span>`);
        } else {
          badges.push(`<span class="set-badge inactive" style="--set-c:${sDef.color}">${sDef.name} (${count}/3)</span>`);
        }
      }
      setStatus.innerHTML = badges.length > 0
        ? `<div class="set-badges-row">${badges.join(' ')}</div>`
        : '<div class="set-badges-empty">穿齊 3 件同套裝可激活專屬加成</div>';
    }

    // 批次分解 & 三合一升階按鈕
    const worn = new Set(Object.values(equipped));
    const bulk = document.getElementById('gear-bulk');
    if (bulk) {
      bulk.innerHTML = '';
      // 三合一升階切換鈕
      const fuseBtn = document.createElement('button');
      fuseBtn.className = 'gear-mini-btn fuse' + (this._fuseMode ? ' active' : '');
      fuseBtn.textContent = this._fuseMode ? '✕ 退出合成' : '🔀 三合一升階';
      fuseBtn.addEventListener('click', () => {
        this._fuseMode = !this._fuseMode;
        this._selectedFuseIds.clear();
        this.rebuildGearView(save);
      });
      bulk.appendChild(fuseBtn);

      if (!this._fuseMode) {
        for (const rk of ['common', 'rare', 'epic']) {
          const n = stash.filter((it) => it.rarity === rk && !worn.has(it.id)).length;
          if (n === 0) continue;
          const btn = document.createElement('button');
          btn.className = 'gear-mini-btn bulk';
          btn.style.setProperty('--rarity', RARITIES[rk].color);
          btn.textContent = `分解全部${RARITIES[rk].name} (${n})`;
          btn.addEventListener('click', () => this._gearHandlers?.onSalvageAll(rk));
          bulk.appendChild(btn);
        }
      }
    }

    // 倉庫清單 (依種類 / 部位分組，同種類內由高至低降冪排序)
    // 上限要用實際容量：黑市可以擴充到 60，原本寫死常數 30 會顯示
    // 「倉庫 35 / 30」並在還沒滿的時候就標記成滿
    const cap = (save.getStashCap && save.getStashCap()) || STASH_CAP;
    this.gearCount.textContent = `倉庫 ${stash.length} / ${cap}`;
    this.gearCount.classList.toggle('full', stash.length >= cap);
    this.gearList.innerHTML = '';

    if (stash.length === 0) {
      this.gearList.innerHTML = '<div class="gear-empty">還沒有任何裝備 —— 擊敗精英怪與 Boss 就會掉落。</div>';
      return;
    }

    // 三合一模式提示列
    if (this._fuseMode) {
      const promptBar = document.createElement('div');
      promptBar.className = 'fuse-prompt-bar';
      const selCount = this._selectedFuseIds.size;
      const selectedItems = [...this._selectedFuseIds].map((id) => byId.get(id)).filter(Boolean);

      let hint = `請選取 3 件同部位同稀有度的未穿戴裝備 (已選 ${selCount}/3)`;
      let canConfirm = false;
      let costDna = 0;

      if (selCount === 3) {
        const valRes = fuseItems(selectedItems);
        if (!valRes.ok) {
          hint = `⚠️ ${valRes.reason}`;
        } else {
          costDna = FUSION_COST[selectedItems[0].rarity] || 0;
          if (save.data.dna < costDna) {
            hint = `DNA 不足：合成需要 ${costDna} 🧬 (目前 ${save.data.dna})`;
          } else {
            hint = `條件齊全！合成需要 ${costDna} 🧬`;
            canConfirm = true;
          }
        }
      }

      promptBar.innerHTML = `
        <span>${hint}</span>
        ${canConfirm ? `<button id="btn-confirm-fuse" class="gear-mini-btn fuse-confirm">✨ 確認合成高階</button>` : ''}
      `;
      this.gearList.appendChild(promptBar);

      if (canConfirm) {
        promptBar.querySelector('#btn-confirm-fuse')?.addEventListener('click', () => {
          const ids = [...this._selectedFuseIds];
          this._selectedFuseIds.clear();
          this._fuseMode = false;
          this._gearHandlers?.onFuse(ids);
        });
      }
    }

    const rank = { mythic: 4, legendary: 3, epic: 2, rare: 1, common: 0 };
    const slotIdx = (s) => {
      const i = SLOT_ORDER.indexOf(s);
      return i >= 0 ? i : SLOT_ORDER.length;
    };
    // 種類 (部位) 分組在前，同種類內稀有度→戰力 由高至低
    const sorted = [...stash].sort(
      (a, b) => (slotIdx(a.slot) - slotIdx(b.slot)) || (rank[b.rarity] - rank[a.rarity]) || (itemScore(b) - itemScore(a))
    );

    let lastSlot = null;
    sorted.forEach((item) => {
      if (item.slot !== lastSlot) {
        lastSlot = item.slot;
        const head = document.createElement('div');
        head.className = 'gear-slot-header';
        head.textContent = `${SLOTS[item.slot].icon} ${SLOTS[item.slot].name}`;
        this.gearList.appendChild(head);
      }
      const isOn = equipped[item.slot] === item.id;
      const reforge = reforgeCost(item);
      const row = document.createElement('div');
      const isSelected = this._selectedFuseIds.has(item.id);

      let rowClass = 'gear-row' + (isOn ? ' equipped' : '');
      if (this._fuseMode) {
        if (isOn) rowClass += ' fuse-disabled';
        else {
          rowClass += ' fuse-selectable';
          if (isSelected) rowClass += ' fuse-selected';
        }
      }
      row.className = rowClass;
      row.style.setProperty('--rarity', RARITIES[item.rarity].color);

      // 套裝標記與傳奇特效標籤
      const setDef = item.setKey ? SETS[item.setKey] : null;
      const setHtml = setDef ? `<span class="gear-set-tag" style="color:${setDef.color}">[${setDef.name}]</span>` : '';
      const legHtml = item.legendaryEffect ? `<div class="gear-legendary-tag">${legendaryEffectText(item.legendaryEffect)}</div>` : '';

      row.innerHTML = `
        <span class="gear-row-icon">${SLOTS[item.slot].icon}</span>
        <div class="gear-row-info">
          <div class="gear-row-name">${setHtml}${RARITIES[item.rarity].name} ${SLOTS[item.slot].name} <span class="gear-ilvl" title="裝備等級：詞條數值的倍率，深入高難度關卡並撐得越久掉得越高">${ilvlText(item)}</span>${isOn ? ' <span class="gear-on">裝備中</span>' : ''}</div>
          <div class="gear-row-affixes">${item.affixes.length > 0 ? item.affixes.map(affixText).join(' ‧ ') : '無詞條 (可分解)'}</div>
          ${legHtml}
        </div>
        <div class="gear-row-actions">
          ${this._fuseMode
            ? (isOn
                ? '<span class="gear-locked-hint">穿戴中不可合成</span>'
                : `<span class="gear-locked-hint" style="color:${isSelected ? '#ffd166' : '#888'}">${isSelected ? '✓ 已選中' : '點擊選取'}</span>`)
            : `
              ${reforge !== null
                ? `<button class="gear-mini-btn reforge" data-reforge="${item.id}" ${save.data.dna < reforge ? 'disabled' : ''} title="花 ${reforge} 🧬 重骰全部詞條">🔁 ${reforge}🧬</button>`
                : ''}
              ${isOn
                ? (reforge === null ? '<span class="gear-locked-hint">脫下才能分解</span>' : '')
                : `<button class="gear-mini-btn equip" data-equip="${item.id}">裝備</button>
                   <button class="gear-mini-btn drop" data-salvage="${item.id}">分解 +${salvageGold(item)}🪙 +${salvageValue(item)}🧬</button>`}
            `}
        </div>
      `;

      if (this._fuseMode && !isOn) {
        row.addEventListener('click', (ev) => {
          if (ev.target.tagName === 'BUTTON') return;
          if (this._selectedFuseIds.has(item.id)) {
            this._selectedFuseIds.delete(item.id);
          } else {
            if (this._selectedFuseIds.size < 3) {
              this._selectedFuseIds.add(item.id);
            }
          }
          this.rebuildGearView(save);
        });
      }

      this.gearList.appendChild(row);
    });

    if (!this._fuseMode) {
      this.gearList.querySelectorAll('[data-equip]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._gearHandlers?.onEquip(btn.dataset.equip);
        });
      });
      this.gearList.querySelectorAll('[data-salvage]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._gearHandlers?.onSalvage(btn.dataset.salvage);
        });
      });
      this.gearList.querySelectorAll('[data-reforge]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._gearHandlers?.onReforge(btn.dataset.reforge);
        });
      });
    }
  }

  // 佈署設施按鈕列狀態更新 (金幣不夠就變灰)
  // 以「上次顯示的值」快取，動作列每幀刷新也不會產生多餘的 DOM 寫入。
  // 這樣才能安全地跟 updateHUD 一起每幀呼叫 —— 先前只在開局/建造/陣亡時刷新，
  // 靠擊殺與掉落賺到的金幣不會更新電網/淨化裝置/拒馬，同一條動作列上的
  // 四顆按鈕因此互相矛盾 (砲塔鈕每幀更新，其餘三顆停在舊狀態)。
  updateFacilityButtons(gold, costFn) {
    if (!this.facilityButtons) return;
    const c = this._facilityCache || (this._facilityCache = {});
    if (c.gold === gold) return;
    c.gold = gold;
    for (const [type, item] of Object.entries(this.facilityButtons)) {
      if (!item || !item.btn) continue;
      const cost = typeof costFn === 'function' ? costFn(type) : 50;
      if (item.cost) item.cost.textContent = cost;
      item.btn.classList.toggle('affordable', gold >= cost);
    }
  }

  // 佈署砲塔按鈕：保持相容
  updateBuildBtn(gold, cost) {
    if (this.buildCost) this.buildCost.textContent = cost;
    if (this.buildBtn) this.buildBtn.classList.toggle('affordable', gold >= cost);
  }

  // 戰術閃避冷卻進度
  updateDash(cdRatio) {
    if (!this.dashOverlay || !this.dashBtn) return;
    if (cdRatio > 0) {
      this.dashOverlay.style.height = `${Math.min(100, cdRatio * 100)}%`;
      this.dashBtn.classList.remove('ready');
    } else {
      this.dashOverlay.style.height = '0%';
      this.dashBtn.classList.add('ready');
    }
  }

  // 連擊 Combo 與暴走狀態
  updateCombo(combo, isFrenzy) {
    if (!this.comboHud) return;
    // addCombo() 每次擊殺都會呼叫這裡，而 update() 也每幀呼叫一次 —— 一顆炸彈
    // 清 200 隻就是同一幀 200 次 classList/textContent 寫入。快取比對即可。
    const c = this._comboCache || (this._comboCache = {});
    if (c.combo === combo && c.frenzy === !!isFrenzy) return;
    c.combo = combo;
    c.frenzy = !!isFrenzy;
    if (combo >= 5) {
      this.comboHud.classList.remove('hidden');
      this.comboCount.textContent = combo;
      this.comboHud.classList.toggle('frenzy', !!isFrenzy);
    } else {
      this.comboHud.classList.add('hidden');
      this.comboHud.classList.remove('frenzy');
    }
  }

  // 砲塔升級互動按鈕
  showTurretUpgrade(show, onUpgrade = null) {
    if (!this.turretUpBtn) return;
    if (show) {
      this.turretUpBtn.classList.remove('hidden');
      this._turretUpCb = onUpgrade;
    } else {
      this.turretUpBtn.classList.add('hidden');
      this._turretUpCb = null;
    }
  }

  // 僱傭傭兵按鈕狀態 (cost=null 表示滿員)
  updateHireBtn(cost, affordable) {
    if (!this.hireBtn) return;
    const key = this.hireBtn.querySelector('.action-key');
    if (key) key.textContent = cost === null ? 'MAX' : `${cost}🪙`;
    this.hireBtn.disabled = cost === null || !affordable;
    this.hireBtn.title = cost === null
      ? '傭兵小隊已滿員'
      : affordable ? `僱傭傭兵 (${cost} 🪙, G)` : `金幣不足 (需要 ${cost} 🪙)`;
  }

  // 幸運物資箱抽獎彈窗
  // opts：{ title, subtitle } —— 首領寶藏箱用不同標題；一般補給箱沿用預設
  showLuckyChest(count, rewards, onClaim, opts = {}) {
    // 自動跳過開箱動畫：直接套用獎勵並回遊戲
    if (this.skipChestChk && this.skipChestChk.checked) {
      if (onClaim) onClaim();
      return;
    }

    if (!this.luckyChestModal) return;
    this.luckyChestModal.classList.remove('hidden');
    this.chestCards.innerHTML = '';
    this.chestClaimBtn.classList.add('hidden');
    this.chestSubtitle.textContent = opts.subtitle || `恭喜獲得 ${count} 連抽特工物資！`;
    const titleEl = this.luckyChestModal.querySelector('.chest-title');
    if (titleEl) titleEl.textContent = opts.title || '🎁 特工幸運補給！ 🎁';

    sound.playGem();

    rewards.forEach((r, idx) => {
      setTimeout(() => {
        const card = document.createElement('div');
        card.className = 'chest-card' + (r.isGold ? ' gold-tier' : '');
        const title = r.title || r.name || '神秘獎勵';
        card.innerHTML = `
          <div class="chest-item-icon">${r.icon}</div>
          <div class="chest-item-title">${title}</div>
          <div class="chest-item-desc">${r.desc}</div>
        `;
        this.chestCards.appendChild(card);
        sound.playHit();

        if (idx === rewards.length - 1) {
          setTimeout(() => {
            this.chestClaimBtn.classList.remove('hidden');
            sound.playLevelUp();
          }, 300);
        }
      }, (idx + 1) * 350);
    });

    this.chestClaimBtn.onclick = () => {
      this.luckyChestModal.classList.add('hidden');
      if (onClaim) onClaim();
    };
  }

  // 超武合成圖鑑：列出所有 武器→配件→超武 配方 (★ = 歷史合成過)
  buildRecipeList(saveData) {
    if (!this.recipeList) return;
    this.recipeList.innerHTML = '';
    const evolved = saveData && Array.isArray(saveData.evolvedEver) ? new Set(saveData.evolvedEver) : new Set();

    for (const [id, def] of Object.entries(WEAPONS)) {
      if (!def.evoTarget || def.isEvo) continue;
      const evoDef = WEAPONS[def.evoTarget];
      if (!evoDef) continue;
      const pairDef = PASSIVES[def.pairPassive] || WEAPONS[def.pairPassive];
      if (!pairDef) continue;

      const row = document.createElement('div');
      row.className = 'recipe-row';

      const cell = (cls, icon, text) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = icon ? `${icon} ${text}` : text;
        return span;
      };
      row.appendChild(cell('recipe-item', def.icon, def.name));
      row.appendChild(cell('recipe-plus', null, '＋'));
      row.appendChild(cell('recipe-item recipe-pair', pairDef.icon, `${pairDef.name} LV${pairDef.maxLevel}`));
      row.appendChild(cell('recipe-equals', null, '＝'));
      row.appendChild(cell('recipe-item recipe-evo', evoDef.icon, evoDef.name));

      const chip = document.createElement('span');
      chip.className = 'recipe-chip' + (evolved.has(evoDef.id) ? ' done' : '');
      chip.textContent = evolved.has(evoDef.id) ? '★ 已合成過' : '未合成';
      row.appendChild(chip);

      const desc = document.createElement('div');
      desc.className = 'recipe-desc';
      desc.textContent = evoDef.description;
      row.appendChild(desc);

      this.recipeList.appendChild(row);
    }
  }

  // 兵器型態：列出所有家族 × 3 型態，點了立刻寫進存檔（與角色卡上的 chips 共用同一個 API）
  openAspectModal(save, onChange) {
    if (!this.aspectModal) return;
    this.buildAspectList(save, onChange);
    this.aspectModal.classList.remove('hidden');
  }

  buildAspectList(save, onChange) {
    if (!this.aspectList) return;
    this.aspectList.innerHTML = '';
    for (const [family, aspects] of Object.entries(WEAPON_ASPECTS)) {
      const current = save.getWeaponAspect(family) || (aspects[0] && aspects[0].id);
      const row = document.createElement('div');
      row.className = 'aspect-family-row';
      row.innerHTML = `
        <div class="aspect-family-head">
          <span class="aspect-family-icon">${WEAPONS[family] ? WEAPONS[family].icon : '⚔️'}</span>
          <span class="aspect-family-name">${WEAPONS[family] ? WEAPONS[family].name : family}</span>
        </div>
        <div class="aspect-chips" data-weapon="${family}">
          ${aspects.map((a) => `
            <span class="aspect-chip ${a.id === current ? 'active' : ''}" data-aspect="${a.id}" title="${a.name}: ${a.desc}">
              ${a.icon} ${a.name.split(' ')[0]}
            </span>`).join('')}
        </div>
        <div class="aspect-desc-tooltip">${(aspects.find((a) => a.id === current) || {}).desc || ''}</div>
      `;
      row.querySelectorAll('.aspect-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const aId = chip.dataset.aspect;
          if (onChange) onChange(family, aId);
          row.querySelectorAll('.aspect-chip').forEach((el) => el.classList.toggle('active', el.dataset.aspect === aId));
          const desc = (aspects.find((a) => a.id === aId) || {}).desc || '';
          const tip = row.querySelector('.aspect-desc-tooltip');
          if (tip) tip.textContent = desc;
          sound.playGem();
        });
      });
      this.aspectList.appendChild(row);
    }
  }

  openRecipeModal(saveData) {
    if (!this.recipeModal) return;
    this.buildRecipeList(saveData);
    this.recipeModal.classList.remove('hidden');
  }

  // 開始畫面的關卡選擇 (未解鎖的關卡不能點)
  buildLevelSelect(levels, order, save, onPick, currentId) {
    this.levelSelect.innerHTML = '';
    const weaponsOwned = save.unlockedWeapons();

    order.forEach((id) => {
      const lv = levels[id];
      const unlocked = save.isUnlocked(id, save.data.mode);
      const best = save.bestOf(id, save.data.mode);

      const card = document.createElement('button');
      card.className = 'level-card' + (id === currentId && unlocked ? ' selected' : '') + (unlocked ? '' : ' locked');
      card.disabled = !unlocked;
      const bestLine = best
        ? `最佳 ${String(Math.floor(best.time / 60)).padStart(2, '0')}:${String(Math.floor(best.time % 60)).padStart(2, '0')}${best.cleared ? ' ✔' : ''}`
        : '尚未挑戰';
      // 地形機制逐項列出（每種一個標籤），不再只寫在說明文字裡
      const mechChips = unlocked && lv.mechs?.length
        ? `<span class="level-mechs">${lv.mechs.filter((m) => MECH_INFO[m.type])
          .map((m) => `<span class="level-mech">${MECH_INFO[m.type].icon} ${MECH_INFO[m.type].name}</span>`).join('')}</span>`
        : '';
      // 過關獎勵武器：取得前是「🎁 過關解鎖」，取得後打勾
      const rw = lv.rewardWeapon && WEAPONS[lv.rewardWeapon];
      const rewardLine = rw
        ? `<span class="level-reward${weaponsOwned.has(lv.rewardWeapon) ? ' owned' : ''}">`
          + `${weaponsOwned.has(lv.rewardWeapon) ? '✔ 已取得' : '🎁 過關解鎖'}：${rw.icon} ${rw.name}</span>`
        : '';
      card.innerHTML = `
        <span class="level-icon">${unlocked ? lv.icon : '🔒'}</span>
        <span class="level-name">${lv.name}</span>
        <span class="level-sub">${lv.sub} ‧ 難度 ${'★'.repeat(lv.difficulty)}</span>
        ${unlocked && lv.rules?.label ? `<span class="level-rule" title="${lv.rules.desc}">⚔️ ${lv.rules.label}</span>` : ''}
        ${mechChips}
        ${rewardLine}
        <span class="level-best">${unlocked ? bestLine : '通關前一關即可解鎖'}</span>
      `;
      card.addEventListener('click', () => {
        if (!unlocked) return;
        sound.playGem();
        this.levelSelect.querySelectorAll('.level-card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        onPick(id);
      });
      this.levelSelect.appendChild(card);
    });
  }

  // 開始畫面的模式選擇 (切模式會連帶重繪關卡卡片，因為解鎖與紀錄依模式而分)
  buildModeSelect(modes, order, currentId, onPick) {
    const box = document.getElementById('mode-select');
    if (!box) return;
    box.innerHTML = '';

    order.forEach((id) => {
      const m = modes[id];
      const card = document.createElement('button');
      card.className = 'mode-card' + (id === currentId ? ' selected' : '');
      card.style.setProperty('--mode-accent', m.accent);
      card.innerHTML = `
        <span class="mode-icon">${m.icon}</span>
        <span class="mode-name">${m.name}</span>
        <span class="mode-sub">${m.sub}</span>
        <span class="mode-desc">${m.desc}</span>
      `;
      card.addEventListener('click', () => {
        sound.playGem();
        box.querySelectorAll('.mode-card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        onPick(id);
      });
      box.appendChild(card);
    });
  }

  // 依模式顯示/隱藏砲塔與傭兵按鈕
  setModeButtons(mode) {
    this.facilityBar?.classList.toggle('hidden', !mode.turrets);
    this.buildBtn?.classList.toggle('hidden', !mode.turrets);
    this.hireBtn?.classList.toggle('hidden', !mode.mercs);
    if (!mode.turrets) this.showTurretUpgrade(false);
  }

  // 基地核心血條 (守塔模式)
  updateCoreHUD(core) {
    if (!this.coreHud) {
      this.coreHud = document.getElementById('core-hud');
      this.coreHpFill = document.getElementById('core-hp-fill');
      this.coreHpText = document.getElementById('core-hp-text');
    }
    if (!this.coreHud) return;
    if (!core) {
      this.coreHud.classList.add('hidden');
      return;
    }
    this.coreHud.classList.remove('hidden');
    const pct = Math.max(0, (core.hp / core.maxHp) * 100);
    this.coreHpFill.style.width = `${pct}%`;
    // 危險時整條轉紅提示
    this.coreHud.classList.toggle('danger', pct < 30);
    this.coreHpText.textContent = Math.ceil(core.hp);
  }

  // 角色台詞氣泡
  // 讓一個列「探頭」幾秒再收回去。收合用 CSS 的 .hud-peek/.peeking 控制。
  peek(el) {
    if (!el) return;
    el.classList.add('peeking');
    clearTimeout(this._peekTimers.get(el));
    this._peekTimers.set(el, setTimeout(() => {
      el.classList.remove('peeking');
    }, HUD_PEEK_SECONDS * 1000));
  }

  say(text, color = '#00e5ff', seconds = 3.2) {
    if (!text) return;
    this.bubble.textContent = text;
    this.bubble.style.setProperty('--accent', color);
    this.bubble.classList.remove('hidden');
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth; // 重啟動畫
    this.bubble.classList.add('pop');

    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      this.bubble.classList.add('hidden');
    }, Math.min(seconds, HUD_HINT_MAX_SECONDS) * 1000);
  }

  initSlotPlaceholders() {
    this.weaponSlots.innerHTML = '';
    this.passiveSlots.innerHTML = '';

    for (let i = 0; i < GAME_CONFIG.MAX_WEAPON_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot';
      slot.id = `weapon-slot-${i}`;
      this.weaponSlots.appendChild(slot);
    }

    for (let i = 0; i < GAME_CONFIG.MAX_PASSIVE_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot';
      slot.id = `passive-slot-${i}`;
      this.passiveSlots.appendChild(slot);
    }
  }

  // 每幀都會被呼叫，所以每個欄位都要先比對再寫。原本是無條件寫入 5 個屬性，
  // 等於每秒 300 次不必要的 style/textContent 指派 —— 時間文字一秒才變一次，
  // 金幣與擊殺也多半幾秒才動一次。同檔的 setObjective() 早就是這個寫法。
  updateHUD(player, gameTime, kills, gold) {
    const hud = this._hudCache || (this._hudCache = {});
    const pct = Math.round(Math.min(100, Math.max(0, (player.exp / player.nextExp) * 100)) * 10) / 10;
    if (hud.pct !== pct) {
      hud.pct = pct;
      this.expFill.style.width = `${pct}%`;
    }
    if (hud.level !== player.level) {
      hud.level = player.level;
      this.playerLevel.textContent = player.level;
    }
    const secs = Math.floor(gameTime);
    if (hud.secs !== secs) {
      hud.secs = secs;
      const mins = Math.floor(secs / 60);
      this.timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }
    if (hud.kills !== kills) {
      hud.kills = kills;
      this.killsText.textContent = kills;
    }
    if (hud.gold !== gold) {
      hud.gold = gold;
      this.goldText.textContent = gold;
    }
  }

  updateSkillSlots(weaponManager) {
    this.peek(this.skillsTray);
    // 更新武器欄
    let wIndex = 0;
    for (const [id, item] of weaponManager.weapons.entries()) {
      const slot = document.getElementById(`weapon-slot-${wIndex}`);
      if (!slot) continue;
      const def = WEAPONS[id];
      const aspectId = weaponManager.player?.weaponAspects?.[id];
      const aspectList = WEAPON_ASPECTS[id];
      const asp = aspectList?.find((a) => a.id === aspectId);
      const aspectBadge = asp ? `<span class="slot-aspect-badge" title="${asp.name}: ${asp.desc}">${asp.icon}</span>` : '';

      slot.className = `skill-slot filled ${item.isEvo ? 'evo' : ''}`;
      slot.innerHTML = `
        <span class="slot-emoji">${def.icon.split(' ')[0]}</span>
        <span class="slot-stars">${item.isEvo ? 'MAX' : '★'.repeat(item.level)}</span>
        ${aspectBadge}
      `;
      wIndex++;
    }
    // 空槽重置
    for (let i = wIndex; i < GAME_CONFIG.MAX_WEAPON_SLOTS; i++) {
      const slot = document.getElementById(`weapon-slot-${i}`);
      if (slot) {
        slot.className = 'skill-slot';
        slot.innerHTML = '';
      }
    }

    // 更新被動配件欄
    let pIndex = 0;
    for (const [id, item] of weaponManager.passives.entries()) {
      const slot = document.getElementById(`passive-slot-${pIndex}`);
      if (!slot) continue;
      const def = PASSIVES[id];
      slot.className = 'skill-slot filled';
      slot.innerHTML = `
        <span class="slot-emoji">${def.icon}</span>
        <span class="slot-stars">${item.level >= def.maxLevel ? 'MAX' : '★'.repeat(item.level)}</span>
      `;
      pIndex++;
    }
    for (let i = pIndex; i < GAME_CONFIG.MAX_PASSIVE_SLOTS; i++) {
      const slot = document.getElementById(`passive-slot-${i}`);
      if (slot) {
        slot.className = 'skill-slot';
        slot.innerHTML = '';
      }
    }
  }

  // 兩格口袋：HUD 槽與行動端按鈕都用 data-slot 對應 player.pockets 的索引
  updatePockets(pockets) {
    this.peek(this.skillsTray);
    const auto = save.data.settings.autoPocket !== false;
    pockets.forEach((s, i) => {
      const key = i === 0 ? 'E' : 'F';
      const conf = s && CONSUMABLE_ITEMS[s.id];
      const slotEl = document.querySelector(`.pocket-slot[data-slot="${i}"]`);
      const btnEl = document.querySelector(`.pocket-btn[data-slot="${i}"]`);
      if (slotEl) {
        slotEl.className = conf ? `pocket-slot filled${auto ? ' auto' : ''}` : 'pocket-slot empty';
        slotEl.title = conf
          ? `【${conf.name}】${conf.desc}${auto ? `\n自動使用：${conf.auto}` : ''} (按 ${key} 或點擊使用)`
          : `戰術口袋 ${i + 1} (目前為空)`;
        slotEl.querySelector('.pocket-icon').textContent = conf ? conf.icon : '🎒';
        const badge = slotEl.querySelector('.pocket-badge');
        badge.textContent = s ? s.count : 0;
        badge.classList.toggle('hidden', !s || s.count <= 1);
      }
      if (btnEl) {
        btnEl.classList.toggle('hidden', !conf);
        if (conf) btnEl.querySelector('.action-icon').textContent = conf.icon;
        const badge = btnEl.querySelector('.action-badge');
        badge.textContent = s ? s.count : 0;
        badge.classList.toggle('hidden', !s || s.count <= 1);
      }
    });
  }

  updateBossHUD(boss) {
    if (!boss || boss.isDead) {
      this.bossHud.classList.add('hidden');
      return;
    }
    this.bossHud.classList.remove('hidden');
    if (this._bossNameShown !== boss.name) {
      this._bossNameShown = boss.name;
      this.bossName.textContent = boss.name;
    }
    // style.css 對這條血條宣告了 transition: width 0.1s，每幀無條件寫入等於
    // 每 16.7ms 就重啟一次轉場 (永遠追不上)。量化到 0.5% 再寫。
    const hpPct = Math.round(Math.max(0, (boss.hp / boss.maxHp) * 100) * 2) / 2;
    if (this._bossHpShown !== hpPct) {
      this._bossHpShown = hpPct;
      this.bossHpFill.style.width = `${hpPct}%`;
    }
  }

  // ── 每日任務 ──
  openQuestModal(save, onClaim) {
    this._questClaim = onClaim;
    this.rebuildQuestView(save);
    document.getElementById('quest-modal')?.classList.remove('hidden');
  }

  rebuildQuestView(save) {
    const box = document.getElementById('quest-list');
    if (!box) return;
    const list = save.dailyQuests();
    box.innerHTML = '';
    list.forEach((q, i) => {
      const done = q.progress >= q.target;
      const row = document.createElement('div');
      row.className = 'quest-row' + (q.claimed ? ' claimed' : done ? ' done' : '');
      const pct = Math.min(100, (q.progress / q.target) * 100);
      const prog = q.stat === 'survive'
        ? `${Math.floor(q.progress / 60)}:${String(q.progress % 60).padStart(2, '0')} / ${Math.floor(q.target / 60)}:${String(q.target % 60).padStart(2, '0')}`
        : `${q.progress.toLocaleString()} / ${q.target.toLocaleString()}`;
      row.innerHTML = `
        <div class="quest-main">
          <div class="quest-text">${questText(q)}</div>
          <div class="quest-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <div class="quest-meta">${prog}　獎勵 ${q.gold} 🪙 + ${q.dna} 🧬</div>
        </div>
        <button class="shop-buy-btn quest-claim" data-quest="${i}" ${done && !q.claimed ? '' : 'disabled'}>${q.claimed ? '已領取' : done ? '領取' : '進行中'}</button>
      `;
      row.querySelector('button').addEventListener('click', () => this._questClaim?.(i));
      box.appendChild(row);
    });
    const reset = document.createElement('div');
    reset.className = 'quest-reset';
    reset.textContent = '每天午夜（本地時間）換一組新任務';
    box.appendChild(reset);
  }

  // ── 圖鑑 ──
  openCodexModal(save, onClaim) {
    this._codexClaim = onClaim;
    if (!this._codexTabsBound) {
      this._codexTabsBound = true;
      this._codexCat = 'weapons';
      document.querySelectorAll('.codex-tab').forEach((t) => t.addEventListener('click', () => {
        document.querySelectorAll('.codex-tab').forEach((x) => x.classList.toggle('active', x === t));
        this._codexCat = t.dataset.cat;
        this.rebuildCodexView(this._codexSave);
      }));
    }
    this._codexSave = save;
    this.rebuildCodexView(save);
    document.getElementById('codex-modal')?.classList.remove('hidden');
  }

  rebuildCodexView(save) {
    const data = save.data;
    const prog = codexProgress(data);
    const progEl = document.getElementById('codex-progress');
    if (progEl) progEl.textContent = `收集進度 ${prog.found} / ${prog.total}（${Math.round(prog.pct * 100)}%）`;

    const ms = document.getElementById('codex-milestones');
    if (ms) {
      ms.innerHTML = '';
      CODEX_MILESTONES.forEach((m, i) => {
        const claimed = data.codex.claimed.includes(i);
        const ready = prog.pct + 1e-9 >= m.pct;
        const b = document.createElement('button');
        b.className = 'shop-buy-btn codex-ms';
        b.disabled = claimed || !ready;
        b.textContent = `${Math.round(m.pct * 100)}%：${claimed ? '已領取' : `${m.gold}🪙 + ${m.dna}🧬`}`;
        b.addEventListener('click', () => this._codexClaim?.(i));
        ms.appendChild(b);
      });
    }

    const list = document.getElementById('codex-list');
    if (!list) return;
    const cat = this._codexCat || 'weapons';
    const ids = codexCategories()[cat] || [];
    list.innerHTML = '';
    for (const id of ids) {
      const has = codexHas(data, cat, id);
      let icon = '❓';
      let name = '？？？';
      let sub = '';
      if (cat === 'weapons' || cat === 'evos') {
        const w = WEAPONS[id];
        if (has) { icon = w.icon; name = w.name; sub = cat === 'evos' ? '已合成' : '已取得'; }
        else sub = cat === 'evos' ? '合成後解鎖' : '局內取得後解鎖';
      } else if (cat === 'enemies') {
        const e = ENEMY_TYPES[id];
        if (has) {
          icon = `<span style="color:${e.color}">●</span>`;
          name = e.name;
          sub = `擊殺 ${(data.codex.enemies[id] || 0).toLocaleString()}`;
        } else sub = '擊殺後解鎖';
      } else if (cat === 'jewels') {
        const j = JEWELS[id];
        if (has) { icon = j.icon; name = j.name; sub = `累計撿到 ${data.codex.jewels[id]}`; }
        else sub = '撿到後解鎖';
      }
      const el = document.createElement('div');
      el.className = 'codex-entry' + (has ? '' : ' locked');
      el.innerHTML = `<span class="codex-icon">${icon}</span><span class="codex-name">${name}</span><span class="codex-sub">${sub}</span>`;
      list.appendChild(el);
    }
  }

  // 主選單按鈕上的「❗」：有可以領的每日任務／圖鑑里程碑
  updateClaimBadges(save) {
    const quests = save.dailyQuests();
    const qReady = quests.some((q) => !q.claimed && q.progress >= q.target);
    const prog = codexProgress(save.data);
    const cReady = CODEX_MILESTONES.some((m, i) => !save.data.codex.claimed.includes(i) && prog.pct + 1e-9 >= m.pct);
    document.getElementById('btn-quests')?.classList.toggle('has-claim', qReady);
    document.getElementById('btn-codex')?.classList.toggle('has-claim', cReady);
  }

  // 暫停面板：目前的構築。參考 Brotato／吸血鬼倖存者的暫停畫面 ——
  // 玩家在戰鬥中最常想知道的是「每把武器幾級、離超武還差什麼、總數值多少」。
  renderPauseBuild(game) {
    const box = document.getElementById('pause-build');
    if (!box) return;
    const wm = game.weaponManager;
    const p = game.player;
    const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // 武器 + 超武配方進度
    const weaponRows = [...wm.weapons.entries()].map(([id, item]) => {
      const def = WEAPONS[id];
      if (!def) return '';
      let recipe = '';
      if (item.isEvo) {
        recipe = `<span class="pb-note">超武覺醒 ${item.level}/${def.maxLevel}</span>`;
      } else if (def.evoTarget && WEAPONS[def.evoTarget]) {
        const pid = def.pairPassive;
        const pDef = PASSIVES[pid] || WEAPONS[pid];
        const pItem = wm.passives.get(pid) || wm.weapons.get(pid);
        const pLv = pItem ? pItem.level : 0;
        const wOk = item.level >= def.maxLevel;
        const pOk = pDef && pLv >= pDef.maxLevel;
        recipe = `<span class="pb-note">→ ${WEAPONS[def.evoTarget].icon} ${esc(WEAPONS[def.evoTarget].name)}：`
          + `武器 ${wOk ? '✓' : `${item.level}/${def.maxLevel}`} · `
          + `${pDef ? `${pDef.icon}${esc(pDef.name)} ${pOk ? '✓' : `${pLv}/${pDef.maxLevel}`}` : '—'}`
          + `${wOk && pOk ? ' <b class="pb-ready">可合成</b>' : ''}</span>`;
      }
      return `<div class="pb-row"><span class="pb-name">${def.icon} ${esc(def.name)}</span>`
        + `<span class="pb-lv">LV ${item.level}/${def.maxLevel}</span>${recipe}</div>`;
    }).join('');

    const passiveRows = [...wm.passives.entries()].map(([id, item]) => {
      const def = PASSIVES[id];
      return def ? `<div class="pb-row"><span class="pb-name">${def.icon} ${esc(def.name)}</span><span class="pb-lv">LV ${item.level}/${def.maxLevel}</span></div>` : '';
    }).join('');

    const crit = (p.critChance || 0) + (p.metaCrit || 0) + (p.luckPotionTimer > 0 ? 0.25 : 0);
    const stats = [
      ['⚔️ 傷害', `×${((p.damageMultiplier || 1) * (p.traitDmgMul || 1)).toFixed(2)}`],
      ['⏱️ 冷卻', pct((p.cdrMultiplier || 1) - 1)],
      ['🎯 暴擊率', `${Math.round(crit * 100)}%`],
      ['💥 暴擊傷害', `×${(2 + (p.metaCritDmg || 0)).toFixed(2)}`],
      ['📐 範圍', pct((p.rangeMultiplier || 1) - 1)],
      ['👟 移速', pct((p.speedMultiplier || 1) - 1)],
      ['🧲 拾取', pct((p.magnetMultiplier || 1) - 1)],
      ['🛡️ 減傷', `${Math.round((p.metaArmor || 0) * 100)}%`],
      ['❤️ 生命', `${Math.round(p.hp)}/${Math.round(p.maxHp)}`],
      ['💗 每秒回復', `${(p.hpRegen || 0).toFixed(1)}`],
      ['🩸 承受傷害', `×${(p.damageTakenMul || 1).toFixed(2)}`],
    ].map(([k, v]) => `<div class="pb-stat"><span>${k}</span><strong>${v}</strong></div>`).join('');

    const chips = (list) => list.map((b) => `<span class="pb-chip">${b.icon || ''} ${esc(b.name)}</span>`).join('');
    const buffs = [...(game.runCard ? [{ icon: game.runCard.icon, name: `規則卡：${game.runCard.name}` }] : []),
      ...(game.blessings || []), ...(game.activeSynergies || [])];

    box.innerHTML = `
      <div class="pb-section"><div class="pb-title">🔫 武器（${wm.weapons.size}/${GAME_CONFIG.MAX_WEAPON_SLOTS}）</div>${weaponRows || '<div class="pb-empty">—</div>'}</div>
      <div class="pb-section"><div class="pb-title">🧩 配件（${wm.passives.size}/${GAME_CONFIG.MAX_PASSIVE_SLOTS}）</div>${passiveRows || '<div class="pb-empty">尚未取得</div>'}</div>
      <div class="pb-section"><div class="pb-title">📊 總數值</div><div class="pb-stats">${stats}</div></div>
      ${buffs.length ? `<div class="pb-section"><div class="pb-title">✨ 規則卡、祝福與協同</div><div class="pb-chips">${chips(buffs)}</div></div>` : ''}
      <div class="pb-section pb-meta">🚫 封印剩 ${game.banishesLeft ?? 0} 次 · ⏭️ 跳過剩 ${game.skipsLeft ?? 0} 次 · 🎲 刷新 ${game.rerollCost} 🪙</div>
    `;
  }

  // 顯示設定（主選單與暫停面板共用同一份）：onChange(patch) 由呼叫端寫存檔並套用
  renderDisplaySettings(container, settings, onChange) {
    if (!container) return;
    const st = settings || {};
    const mode = ['all', 'crit', 'off'].includes(st.damageNumbers) ? st.damageNumbers : 'all';
    container.innerHTML = `
      <label class="ds-item">🔢 傷害數字
        <select data-ds="damageNumbers">
          <option value="all"${mode === 'all' ? ' selected' : ''}>全部顯示</option>
          <option value="crit"${mode === 'crit' ? ' selected' : ''}>只顯示暴擊</option>
          <option value="off"${mode === 'off' ? ' selected' : ''}>關閉</option>
        </select>
      </label>
      <label class="ds-item"><input type="checkbox" data-ds="screenShake"${st.screenShake !== false ? ' checked' : ''}> 📳 畫面震動</label>
      <label class="ds-item"><input type="checkbox" data-ds="reduceFlash"${st.reduceFlash ? ' checked' : ''}> 🕶️ 減少閃光</label>
    `;
    container.querySelector('[data-ds="damageNumbers"]').addEventListener('change', (e) => onChange({ damageNumbers: e.target.value }));
    container.querySelector('[data-ds="screenShake"]').addEventListener('change', (e) => onChange({ screenShake: e.target.checked }));
    container.querySelector('[data-ds="reduceFlash"]').addEventListener('change', (e) => onChange({ reduceFlash: e.target.checked }));
  }

  // 升級三選一對話框：渲染卡牌 + reroll 按鈕狀態
  // extra：{ silent, banishesLeft, skipsLeft, skipGold, onBanish(opt), onSkip() }
  showUpgradeCards(options, gold, rerollCost, onSelect, onReroll, extra = {}) {
    if (!extra.silent) sound.playLevelUp();
    this.cardsGrid.innerHTML = '';
    this._rerollCb = onReroll || null;
    this._rerollCost = rerollCost || 0;

    options.forEach((opt) => {
      const card = document.createElement('div');
      card.className = `upgrade-card ${opt.isEvo ? 'card-evo' : (opt.type === 'special' ? 'card-special' : '')}`;
      if (opt.color) {
        card.style.setProperty('--card-glow-color', opt.color);
      }

      const stars = opt.isEvo
        ? '★★★★★ 超武進化'
        : opt.type === 'special'
        ? '★ 特殊奇遇'
        : opt.type === 'heal'
        ? '緊急補給'
        : opt.isNew
        ? 'NEW 首次獲取'
        : '★'.repeat(opt.nextLevel || 1) + '☆'.repeat(Math.max(0, (opt.maxLevel || 1) - (opt.nextLevel || 1)));

      card.innerHTML = `
        <div class="card-icon-box">${opt.icon}</div>
        <div class="card-info">
          <div class="card-title-row">
            <span class="card-name">${opt.name}</span>
            <span class="card-tag ${opt.isEvo ? 'tag-evo' : (opt.type === 'special' ? 'tag-special' : '')}">${opt.tag}</span>
          </div>
          <div class="card-desc">${opt.description}</div>
          <div class="card-level-stars">${stars}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.levelUpModal.classList.add('hidden');
        onSelect(opt);
      });

      // 封印按鈕：卡片右上角。點它不能順便選到這張卡（stopPropagation）
      if (extra.onBanish && isBanishable(opt)) {
        const ban = document.createElement('button');
        ban.className = 'card-banish';
        ban.type = 'button';
        ban.textContent = '🚫';
        ban.title = extra.banishesLeft > 0 ? `封印：【${opt.name}】本局不再出現（剩 ${extra.banishesLeft} 次）` : '封印次數已用完';
        ban.disabled = !(extra.banishesLeft > 0);
        ban.addEventListener('click', (ev) => {
          ev.stopPropagation();
          extra.onBanish(opt);
        });
        card.appendChild(ban);
      }

      this.cardsGrid.appendChild(card);
    });

    // 跳過與封印剩餘次數
    const skip = this.skipUpgradeBtn;
    if (skip) {
      const left = extra.skipsLeft || 0;
      skip.classList.toggle('hidden', !extra.onSkip);
      skip.disabled = left <= 0;
      skip.textContent = `⏭️ 跳過 +${extra.skipGold || 0}🪙（剩 ${left}）`;
      skip.onclick = () => { if (left > 0 && extra.onSkip) extra.onSkip(); };
    }
    if (this.banishInfo) {
      this.banishInfo.textContent = extra.onBanish ? `🚫 封印剩 ${extra.banishesLeft || 0} 次（點卡片右下角 🚫）` : '';
    }

    // 金幣 reroll：花錢重抽三選一 (不重複目前顯示的卡)
    const rr = this.rerollBtn;
    if (rr) {
      rr.classList.remove('hidden', 'reroll-denied');
      rr.textContent = `🎲 刷新選擇 (${rerollCost} 🪙)`;
      this.updateRerollState(gold);
    }

    this.levelUpModal.classList.remove('hidden');
  }

  updateRerollState(gold) {
    const rr = this.rerollBtn;
    if (!rr) return;
    const cost = this._rerollCost || 0;
    rr.disabled = gold < cost;
    rr.classList.toggle('reroll-affordable', gold >= cost);
    if (gold < cost) {
      rr.title = '金幣不足';
    } else {
      rr.title = '重新抽三張不同的升級卡';
    }
  }

  flashRerollDenied(message = '金幣不足！') {
    const rr = this.rerollBtn;
    if (!rr) return;
    const original = `🎲 刷新選擇 (${this._rerollCost || 0} 🪙)`;
    rr.textContent = message;
    rr.classList.add('reroll-denied');
    clearTimeout(this._denyTimer);
    this._denyTimer = setTimeout(() => {
      rr.classList.remove('reroll-denied');
      if (!rr.disabled) rr.textContent = original;
    }, 900);
  }

  // banished：本局被封印的武器／配件 id（Set），它們的卡不會進卡池
  generateUpgradeOptions(weaponManager, excludeKeys = null, banished = null) {
    const candidates = [];

    // ── 超武配方狀態 (VS 精神：武器滿級 + 對應配件也滿級才可合成) ──
    // pairInfo: 回傳該武器配方配件的持有/滿級狀態；缺件的配方記錄下來做提示
    const pairInfo = (baseId) => {
      const def = WEAPONS[baseId];
      if (!def || !def.evoTarget) return null;
      const pairId = def.pairPassive;
      const pItem = weaponManager.passives.get(pairId) || weaponManager.weapons.get(pairId);
      const pDef = PASSIVES[pairId] || WEAPONS[pairId];
      if (!pItem || !pDef) return { pairId, owned: false, maxed: false };
      return { pairId, owned: true, maxed: pItem.level >= pDef.maxLevel };
    };
    const recipeHints = new Map(); // pairId -> { weaponName, evoName }：武器滿級但配件還沒滿級

    // 1. 檢查是否有滿足條件的超武 (武器滿級 + 配件滿級)
    for (const [id, item] of weaponManager.weapons.entries()) {
      const def = WEAPONS[id];
      if (!item.isEvo && item.level >= def.maxLevel && def.evoTarget) {
        const pair = pairInfo(id);
        if (pair && pair.owned && pair.maxed) {
          const evoDef = WEAPONS[def.evoTarget];
          candidates.push({
            type: 'evo',
            baseId: id,
            targetId: def.evoTarget,
            name: evoDef.name,
            icon: evoDef.icon,
            description: evoDef.description,
            tag: '超武 EVO',
            isEvo: true,
          });
        } else if (pair && !pair.maxed) {
          // 武器已滿級但配件的等級不夠 → 提示缺件，引導玩家補配件
          recipeHints.set(pair.pairId, { weaponName: def.name, evoName: WEAPONS[def.evoTarget].name, owned: pair.owned });
        }
      }
    }

    // 2. 現有武器升級 (升級到滿級前一張會提示配方狀態)
    for (const [id, item] of weaponManager.weapons.entries()) {
      const def = WEAPONS[id];
      if (!item.isEvo && item.level < def.maxLevel) {
        const isLastLevel = item.level + 1 === def.maxLevel;
        const pair = pairInfo(id);
        const hint = recipeHints.get(id); // 自己是別把武器的雙武合成缺件 (如 苦無 for 相位風暴)
        const recipeReady = pair && pair.maxed && isLastLevel;
        let desc = `LV ${item.level} → ${item.level + 1}：${weaponLevelDiff(def, item.level)}`;
        let tag = '武器升級';
        // 還沒到最後一級也給「距超武多遠」，不必另開超武配方查
        if (!recipeReady && !hint && def.evoTarget) {
          const pDef = PASSIVES[def.pairPassive] || WEAPONS[def.pairPassive];
          const pLv = pair && pair.owned ? (weaponManager.passives.get(def.pairPassive) || weaponManager.weapons.get(def.pairPassive)).level : 0;
          if (pDef) desc += `<br>✨ 超武【${WEAPONS[def.evoTarget].name}】：武器差 ${def.maxLevel - item.level} 級 · ${pDef.icon}${pDef.name} ${pLv ? `LV ${pLv}/${pDef.maxLevel}` : '未持有'}`;
        }
        if (recipeReady) {
          desc = `提升至滿級！配方齊備，可合成【${WEAPONS[def.evoTarget].name}】`;
          tag = '武器升級 · 配方就緒';
        } else if (hint) {
          desc = `提升等級至 LV ${item.level + 1}。完成後即可與【${hint.weaponName}】合成【${hint.evoName}】`;
          tag = '武器升級 · 超武缺件';
        }
        candidates.push({
          type: 'weapon_upgrade',
          id: id,
          name: def.name,
          icon: def.icon,
          description: desc,
          tag,
          nextLevel: item.level + 1,
          maxLevel: def.maxLevel,
        });
      }
    }

    // 2b. 超武覺醒：進化後的超武仍可升級（每級 +evoGrowth × 基礎傷害）。
    // 為什麼要這段：超武先前 `level` 永遠停在 1、也不會出現在升級卡裡，四把武器都進化完之後
    // 升級卡就只剩「補血包」那條退路 —— 這一段讓後期升級仍然有意義。
    for (const [id, item] of weaponManager.weapons.entries()) {
      const def = WEAPONS[id];
      if (!item.isEvo || !def.evoGrowth || item.level >= def.maxLevel) continue;
      const gain = Math.round(def.evoGrowth * 100);
      const total = Math.round(def.evoGrowth * item.level * 100);
      candidates.push({
        type: 'weapon_upgrade',
        id,
        name: def.name,
        icon: def.icon,
        description: `超武覺醒：傷害 +${gain}%（累積 +${total}%）。`,
        tag: `超武覺醒 ${item.level} → ${item.level + 1}`,
        nextLevel: item.level + 1,
        maxLevel: def.maxLevel,
      });
    }

    // 3. 現有被動升級 (若正是某把滿級武器的缺件，特別標註)
    for (const [id, item] of weaponManager.passives.entries()) {
      const def = PASSIVES[id];
      if (item.level < def.maxLevel) {
        const hint = recipeHints.get(id);
        candidates.push({
          type: 'passive_upgrade',
          id: id,
          name: def.name,
          icon: def.icon,
          description: (hint
            ? `提升等級至 LV ${item.level + 1}。完成後即可合成【${hint.evoName}】`
            : `提升等級至 LV ${item.level + 1}。效果提升。`) + (hint ? '' : pairedWeaponNote(id, weaponManager)),
          tag: hint ? '被動升級 · 超武缺件' : '被動升級',
          nextLevel: item.level + 1,
          maxLevel: def.maxLevel,
        });
      }
    }

    // 4. 新武器 (若武器槽未滿)
    if (weaponManager.weapons.size < GAME_CONFIG.MAX_WEAPON_SLOTS) {
      for (const [id, def] of Object.entries(WEAPONS)) {
        // weaponPool：本局可抽的武器（未通關解鎖的不進卡池）；null = 全開放（每日挑戰）
        if (!def.isEvo && !weaponManager.weapons.has(id) && (!weaponManager.weaponPool || weaponManager.weaponPool.has(id))) {
          const hint = recipeHints.get(id);
          candidates.push({
            type: 'weapon_new',
            id: id,
            name: def.name,
            icon: def.icon,
            description: hint
              ? `${def.description}（缺件：取得並升滿即可與【${hint.weaponName}】合成【${hint.evoName}】）`
              : def.description,
            tag: hint ? '新武器 · 超武缺件' : '新武器',
            isNew: true,
            nextLevel: 1,
            maxLevel: def.maxLevel,
          });
        }
      }
    }

    // 5. 新被動 (若被動槽未滿)
    if (weaponManager.passives.size < GAME_CONFIG.MAX_PASSIVE_SLOTS) {
      for (const [id, def] of Object.entries(PASSIVES)) {
        if (!weaponManager.passives.has(id)) {
          const hint = recipeHints.get(id); // 某把滿級武器的配方配件還沒拿
          candidates.push({
            type: 'passive_new',
            id: id,
            name: def.name,
            icon: def.icon,
            description: hint
              ? `${def.description}（缺件：取得並升滿即可合成【${hint.evoName}】）`
              : def.description + pairedWeaponNote(id, weaponManager),
            tag: hint ? '新被動 · 超武缺件' : '新被動',
            isNew: true,
            nextLevel: 1,
            maxLevel: def.maxLevel,
          });
        }
      }
    }

    // 6. 特殊升級卡 (15% 機率混入一張)
    if (Math.random() < 0.15 && SPECIAL_CARDS && SPECIAL_CARDS.length > 0) {
      const sp = SPECIAL_CARDS[Math.floor(Math.random() * SPECIAL_CARDS.length)];
      candidates.push({
        type: 'special',
        specialId: sp.id,
        name: sp.name,
        icon: sp.icon,
        description: sp.desc,
        tag: '特殊奇遇',
        color: sp.color,
      });
    }

    // 封印：被封印的武器／配件本局不再出現（超武進化卡不受影響 —— 它的 id 是 undefined）
    if (banished && banished.size > 0) {
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (isBanishable(candidates[i]) && banished.has(candidates[i].id)) candidates.splice(i, 1);
      }
    }

    // 若全部選滿/無可升級，提供特工急救包
    if (candidates.length === 0) {
      candidates.push({
        type: 'heal',
        name: '特工應急急救包',
        icon: '🧰',
        description: '恢復 50% 生命值，並獲得額外金幣。',
        tag: '補給',
      });
    }

    // 隨機抽取 3 個不重複選項 (優先保證超武排在第一位)
    const evoList = candidates.filter((c) => c.isEvo);
    const otherList = candidates.filter((c) => !c.isEvo).sort(() => Math.random() - 0.5);

    const result = [];
    if (evoList.length > 0) {
      result.push(evoList[0]);
    }

    // reroll 時優先抽上一輪沒出現過的；不夠三張才用出現過的補滿。
    // (先抽三張再濾掉重複會讓玩家花了錢只拿到一兩張，等於付費降級)
    const seen = excludeKeys && excludeKeys.length > 0 ? new Set(excludeKeys) : null;
    const fresh = seen ? otherList.filter((o) => !seen.has(upgradeKeyOf(o))) : otherList;
    const reused = seen ? otherList.filter((o) => seen.has(upgradeKeyOf(o))) : [];

    for (const list of [fresh, reused]) {
      while (result.length < 3 && list.length > 0) {
        result.push(list.pop());
      }
    }

    // 超武配方缺件引導：武器已滿級但配件未滿級 → 該配件卡保證在三選一內 (取代一張非 EVO 卡)
    if (recipeHints.size > 0) {
      const hintId = recipeHints.keys().next().value;
      if (!result.some((o) => o.id === hintId)) {
        const hintCard = otherList.find((o) => o.id === hintId);
        const slot = result.findIndex((o) => !o.isEvo);
        if (hintCard && slot >= 0) {
          result[slot] = hintCard;
        }
      }
    }
    return result;
  }

  showGameOver(stats, weaponManager, gearSummary = null) {
    sound.playGameOver();

    const resultTitle = document.getElementById('result-title');
    const resultSub = document.getElementById('result-subtitle');
    if (stats.isVictory) {
      resultTitle.textContent = '任務圓滿達成！';
      resultTitle.className = 'result-title glow-green';
      resultSub.textContent = stats.line || '成功清剿變異怪物群，凱旋歸來！';
    } else {
      resultTitle.textContent = '任務失敗';
      resultTitle.className = 'result-title glow-red';
      resultSub.textContent = stats.line || '特工壯烈成仁，重振旗鼓再戰！';
    }

    const mins = Math.floor(stats.gameTime / 60);
    const secs = Math.floor(stats.gameTime % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    document.getElementById('final-time').textContent = timeStr;
    document.getElementById('final-kills').textContent = stats.kills;
    document.getElementById('final-level').textContent = `LV ${stats.level}`;
    document.getElementById('final-gold').textContent = stats.gold;

    // 最高紀錄 (由存檔層提供)
    const bestSecs = stats.bestTime || stats.gameTime;
    const bMins = Math.floor(bestSecs / 60);
    const bSecs = Math.floor(bestSecs % 60);
    document.getElementById('best-time').textContent = `${String(bMins).padStart(2, '0')}:${String(bSecs).padStart(2, '0')}`;

    // 關卡名與局外收益
    document.getElementById('result-level-name').textContent = stats.levelName || '';
    document.getElementById('final-dna').textContent = `+${stats.dna}`;
    document.getElementById('total-dna').textContent = stats.totalDna;
    const totalGoldEl = document.getElementById('total-gold');
    if (totalGoldEl) totalGoldEl.textContent = stats.totalGold ?? 0;

    const recapRow = document.getElementById('death-recap');
    if (recapRow) {
      recapRow.textContent = stats.deathRecap || '';
      recapRow.classList.toggle('hidden', !stats.deathRecap);
    }

    const unlockRow = document.getElementById('unlock-notice');
    const unlockLines = [];
    if (stats.unlockedName) unlockLines.push(`🎉 解鎖新關卡：${stats.unlockedName}`);
    if (stats.unlockedWeapon) unlockLines.push(`🔓 解鎖新武器：${stats.unlockedWeapon.icon} ${stats.unlockedWeapon.name}（之後的升級卡會出現）`);
    if (unlockLines.length) {
      unlockRow.innerHTML = unlockLines.join('<br>');   // 關卡與武器名稱都是靜態資料
      unlockRow.classList.remove('hidden');
    } else {
      unlockRow.classList.add('hidden');
    }

    // 武器傷害統計 (含武器、僱傭兵部隊與戰術砲塔)
    const dmgList = document.getElementById('damage-stats-list');
    dmgList.innerHTML = '';

    let totalDmg = 0;
    for (const [id, item] of weaponManager.weapons.entries()) {
      totalDmg += item.totalDamage;
    }
    const mercDmg = Math.round(weaponManager.mercTotalDamage || 0);
    const turretDmg = Math.round(weaponManager.turretTotalDamage || 0);
    totalDmg += mercDmg + turretDmg;

    for (const [id, item] of weaponManager.weapons.entries()) {
      const def = WEAPONS[id];
      const pct = totalDmg > 0 ? Math.round((item.totalDamage / totalDmg) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'damage-stat-item';
      row.innerHTML = `
        <span>${def.icon} ${def.name}</span>
        <strong>${item.totalDamage.toLocaleString()} (${pct}%)</strong>
      `;
      dmgList.appendChild(row);
    }

    if (mercDmg > 0) {
      const pct = totalDmg > 0 ? Math.round((mercDmg / totalDmg) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'damage-stat-item';
      row.innerHTML = `
        <span>💂 僱傭兵部隊</span>
        <strong>${mercDmg.toLocaleString()} (${pct}%)</strong>
      `;
      dmgList.appendChild(row);
    }

    if (turretDmg > 0) {
      const pct = totalDmg > 0 ? Math.round((turretDmg / totalDmg) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'damage-stat-item';
      row.innerHTML = `
        <span>🗼 戰術砲塔</span>
        <strong>${turretDmg.toLocaleString()} (${pct}%)</strong>
      `;
      dmgList.appendChild(row);
    }

    // 局內裝備回收結算展示
    const gearBox = document.getElementById('game-over-gear-box');
    const gearStatus = document.getElementById('game-over-gear-status');
    const gearItems = document.getElementById('game-over-gear-items');
    if (gearBox && gearStatus && gearItems) {
      const saved = gearSummary?.savedGear || [];
      const lost = gearSummary?.lostGear || [];
      const salvaged = gearSummary?.salvagedGear || []; // 倉庫滿，自動分解換金幣＋DNA
      if (saved.length > 0 || lost.length > 0 || salvaged.length > 0) {
        gearBox.classList.remove('hidden');
        const parts = [`入庫 ${saved.length} 件`];
        if (salvaged.length > 0) parts.push(`倉庫已滿自動分解 ${salvaged.length} 件`);
        if (lost.length > 0) parts.push(`遺失 ${lost.length} 件`);
        gearStatus.textContent = parts.join(' / ');
        gearItems.innerHTML = '';
        const addChip = (it, prefix, cls) => {
          const chip = document.createElement('span');
          chip.className = cls;
          chip.style.setProperty('--chip-color', RARITIES[it.rarity].color);
          chip.textContent = `${prefix} ${itemName(it)}`;
          gearItems.appendChild(chip);
        };
        saved.forEach((it) => addChip(it, '✓', 'gear-chip-mini'));
        salvaged.forEach((it) => addChip(it, '♻', 'gear-chip-mini'));
        lost.forEach((it) => addChip(it, '✕', 'gear-chip-mini lost'));
      } else {
        gearBox.classList.add('hidden');
      }
    }

    // 每日任務：這局讓幾個任務剛好完成 → 提醒回主選單領取
    const qLine = document.getElementById('game-over-quest-line');
    if (qLine) {
      const n = gearSummary?.questsDone || 0;
      qLine.classList.toggle('hidden', n === 0);
      qLine.textContent = n > 0 ? `📋 完成 ${n} 個每日任務！回主選單「養成基地 → 每日任務」領取獎勵` : '';
    }

    // 本局珠寶（撿到當下已入存檔）：列出數量與可換得的金幣／DNA
    const jBox = document.getElementById('game-over-jewel-box');
    const jStatus = document.getElementById('game-over-jewel-status');
    const jItems = document.getElementById('game-over-jewel-items');
    if (jBox && jStatus && jItems) {
      const bag = gearSummary?.jewels || {};
      const ids = JEWEL_ORDER.filter((id) => bag[id] > 0);
      if (ids.length > 0) {
        const v = jewelValue(bag);
        jBox.classList.remove('hidden');
        jStatus.textContent = `價值 ${v.gold} 🪙 + ${v.dna} 🧬`;
        jItems.innerHTML = '';
        for (const id of ids) {
          const chip = document.createElement('span');
          chip.className = 'gear-chip-mini';
          chip.style.setProperty('--chip-color', JEWELS[id].color);
          chip.textContent = `${JEWELS[id].icon} ${JEWELS[id].name} ×${bag[id]}`;
          jItems.appendChild(chip);
        }
      } else {
        jBox.classList.add('hidden');
      }
    }

    // 成就解鎖結算展示
    const achBox = document.getElementById('game-over-achievements-box');
    const achList = document.getElementById('game-over-achievements-list');
    if (achBox && achList) {
      const newly = stats.achievements || [];
      if (newly.length > 0) {
        achBox.classList.remove('hidden');
        achList.innerHTML = '';
        newly.forEach((ach) => {
          const item = document.createElement('div');
          item.className = 'game-over-ach-item';
          item.innerHTML = `<span>${ach.icon} <strong>${ach.name}</strong>：${ach.desc}</span><strong class="ach-dna">+${ach.reward} 🧬</strong>`;
          achList.appendChild(item);
        });
      } else {
        achBox.classList.add('hidden');
      }
    }

    // 祝福與協同結算展示
    const buffsBox = document.getElementById('game-over-buffs-box');
    const buffsList = document.getElementById('game-over-buffs-list');
    if (buffsBox && buffsList) {
      const bList = stats.blessings || [];
      const sList = stats.synergies || [];
      if (bList.length > 0 || sList.length > 0) {
        buffsBox.classList.remove('hidden');
        buffsList.innerHTML = '';
        bList.forEach((b) => {
          const chip = document.createElement('span');
          chip.className = 'game-over-buff-chip';
          chip.innerHTML = `${b.icon} ${b.name}`;
          buffsList.appendChild(chip);
        });
        sList.forEach((s) => {
          const chip = document.createElement('span');
          chip.className = 'game-over-buff-chip synergy-chip';
          chip.style.borderColor = s.color;
          chip.innerHTML = `${s.icon} ${s.name}`;
          buffsList.appendChild(chip);
        });
      } else {
        buffsBox.classList.add('hidden');
      }
    }

    this.gameOverModal.classList.remove('hidden');
  }

  // 局內待回收裝備 HUD 更新
  updatePendingGear(count) {
    const chip = document.getElementById('pending-gear-chip');
    const countEl = document.getElementById('pending-gear-count');
    if (!chip) return;
    if (count > 0) {
      chip.classList.remove('hidden');
      if (countEl) countEl.textContent = count;
    } else {
      chip.classList.add('hidden');
    }
  }

  // ── 方向 1：局內隨機祝福 UI ──
  // 只顯示最近取得的幾個，其餘收成一個「+N」計數。後期祝福與協同會長到兩排、
  // 把遊戲視野壓掉一半，而玩家其實只需要知道剛拿到什麼 —— 完整清單在結算畫面。
  renderBuffBar(bar, list, makeBadge) {
    bar.innerHTML = '';
    const shown = list.slice(-BUFF_BAR_MAX);
    const hidden = list.length - shown.length;
    if (hidden > 0) {
      const more = document.createElement('div');
      more.className = 'buff-badge buff-more';
      more.textContent = `+${hidden}`;
      more.title = list.slice(0, hidden).map((x) => x.name).join('、');
      bar.appendChild(more);
    }
    shown.forEach((x) => bar.appendChild(makeBadge(x)));
  }

  updateBlessings(blessings) {
    if (!this.blessingsBar) return;
    this.peek(this.buffsTray);
    this.renderBuffBar(this.blessingsBar, blessings, (b) => {
      const badge = document.createElement('div');
      badge.className = 'buff-badge blessing-badge';
      badge.innerHTML = `<span class="buff-icon">${b.icon}</span>`;
      badge.title = `${b.name}`;
      return badge;
    });
  }

  showBlessingChoice(title, choices, onSelect) {
    if (!this.blessingModal) return;
    sound.playEvoFanfare();
    if (this.blessingTitle) this.blessingTitle.textContent = `🔮 神聖祝福降臨！ (${title})`;
    if (this.blessingCards) {
      this.blessingCards.innerHTML = '';
      choices.forEach((b) => {
        const card = document.createElement('div');
        // 有 damageRisk 的祝福一律標成代價祝福：讓「代價」在卡片上就看得見，
        // 而不是要玩家點進去玩一輪才發現受傷變高。
        const risky = !!b.damageRisk;
        card.className = `upgrade-card card-blessing ${b.risk || risky ? 'card-risk' : ''}`;
        // 風險／報酬同時列出來：只寫「攻速 +25%」玩家無從判斷划不划算。
        const riskLine = risky
          ? `<div class="card-risk-line">⚠️ 承受傷害 +${Math.round((b.damageRisk - 1) * 100)}%</div>`
          : '';
        card.innerHTML = `
          <div class="card-icon-box">${b.icon}</div>
          <div class="card-info">
            <div class="card-title-row">
              <span class="card-name">${b.name}</span>
              <span class="card-tag ${b.risk || risky ? 'tag-risk' : 'tag-blessing'}">${b.risk || risky ? '代價祝福' : '神聖祝福'}</span>
            </div>
            <div class="card-desc">${b.desc}</div>
            ${riskLine}
          </div>
        `;
        card.addEventListener('click', () => {
          this.blessingModal.classList.add('hidden');
          onSelect(b);
        });
        this.blessingCards.appendChild(card);
      });
    }
    this.blessingModal.classList.remove('hidden');
  }

  // ── 方向 2：隨機事件 UI ──
  updateEventBanner(activeEvent) {
    if (!this.eventBanner) return;
    if (!activeEvent) {
      this.eventBanner.classList.add('hidden');
      return;
    }
    this.eventBanner.classList.remove('hidden');
    this.eventBanner.style.setProperty('--event-color', activeEvent.color);
    this.eventBanner.innerHTML = `
      <span class="event-icon">${activeEvent.icon}</span>
      <div class="event-body">
        <strong class="event-title">${activeEvent.name}</strong>
        <span class="event-desc">${activeEvent.desc}</span>
      </div>
      <span class="event-timer">${Math.ceil(activeEvent.remaining)}s</span>
    `;
    this._eventTimerShown = Math.ceil(activeEvent.remaining);
  }

  // 只更新倒數秒數，不重建整個橫幅。原本 remaining 會倒數但 DOM 只在
  // 觸發與結束時各寫一次，畫面上的秒數從頭到尾都是同一個數字。
  updateEventTimer(remaining) {
    if (!this.eventBanner || this.eventBanner.classList.contains('hidden')) return;
    const secs = Math.ceil(remaining);
    if (secs === this._eventTimerShown) return;
    this._eventTimerShown = secs;
    const el = this.eventBanner.querySelector('.event-timer');
    if (el) el.textContent = `${secs}s`;
  }

  // ── 方向 4：武器協同 UI ──
  updateSynergies(synergies) {
    if (!this.synergiesBar) return;
    this.peek(this.buffsTray);
    this.renderBuffBar(this.synergiesBar, synergies, (s) => {
      const badge = document.createElement('div');
      badge.className = 'buff-badge synergy-badge';
      badge.style.setProperty('--badge-color', s.color);
      badge.innerHTML = `<span class="buff-icon">${s.icon}</span>`;
      badge.title = `【${s.name}】${s.desc}`;
      return badge;
    });
  }

  // ── 方向 5：局內黑市商人 UI ──
  showMerchant(merchant, currentGold, onBuy) {
    if (!this.merchantModal) return;
    if (this.merchantGoldVal) this.merchantGoldVal.textContent = currentGold;
    if (this.merchantCards) {
      this.merchantCards.innerHTML = '';
      merchant.items.forEach((item) => {
        const card = document.createElement('div');
        const affordable = currentGold >= item.cost;
        card.className = `upgrade-card merchant-card ${affordable ? '' : 'merchant-disabled'}`;
        card.innerHTML = `
          <div class="card-icon-box">${item.icon}</div>
          <div class="card-info">
            <div class="card-title-row">
              <span class="card-name">${item.name}</span>
              <span class="card-tag tag-merchant">${item.cost} 🪙</span>
            </div>
            <div class="card-desc">${item.desc}</div>
            <button class="game-btn primary-btn merchant-buy-btn" ${affordable ? '' : 'disabled'}>
              ${affordable ? '購買' : '金幣不足'}
            </button>
          </div>
        `;
        const btn = card.querySelector('.merchant-buy-btn');
        btn?.addEventListener('click', (e) => {
          e.stopPropagation();
          onBuy(item);
        });
        this.merchantCards.appendChild(card);
      });
    }
    this.merchantModal.classList.remove('hidden');
  }

  hideMerchant() {
    this.merchantModal?.classList.add('hidden');
  }

  // ── 方向 6：成就系統 UI ──
  showAchievements() {
    if (!this.achievementsModal) return;
    const unlocked = new Set(save.data.achievements || []);
    let totalUnlocked = 0;
    let totalReward = 0;

    if (this.achievementsList) {
      this.achievementsList.innerHTML = '';
      ACHIEVEMENTS.forEach((ach) => {
        const isDone = unlocked.has(ach.id);
        if (isDone) {
          totalUnlocked++;
          totalReward += ach.reward;
        }
        const row = document.createElement('div');
        row.className = `achievement-row ${isDone ? 'done' : 'locked'}`;
        row.innerHTML = `
          <div class="ach-icon">${ach.icon}</div>
          <div class="ach-info">
            <div class="ach-title-row">
              <strong class="ach-name">${ach.name}</strong>
              <span class="ach-reward">+${ach.reward} 🧬</span>
            </div>
            <div class="ach-desc">${ach.desc}</div>
          </div>
          <div class="ach-status-badge">${isDone ? '✓ 已達成' : '未解鎖'}</div>
        `;
        this.achievementsList.appendChild(row);
      });
    }
    if (this.achievementsProgress) {
      this.achievementsProgress.textContent = `${totalUnlocked} / ${ACHIEVEMENTS.length}`;
    }
    if (this.achievementsTotalReward) {
      this.achievementsTotalReward.textContent = `${totalReward}`;
    }
    this.achievementsModal.classList.remove('hidden');
  }
}
