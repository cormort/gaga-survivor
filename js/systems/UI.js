// UI 介面管理器 (HUD 抬頭顯示、升級三選一卡牌彈窗、技能格槽位與戰鬥統計)

import { WEAPONS, PASSIVES, GAME_CONFIG } from '../config.js';
import { TALENTS, TALENT_ORDER, talentCost, upgradeKeyOf } from '../meta.js';
import { RARITIES, SLOTS, SLOT_ORDER, itemName, affixText, itemScore, salvageValue, reforgeCost, SETS, LEGENDARY_EFFECTS, legendaryEffectText, FUSION_COST, fuseItems } from '../items.js';
import { STASH_CAP } from '../save.js';
import { sound } from '../audio.js';
import { SHOP_CRATES, SHOP_BOOSTERS, STASH_EXPAND_COST, MAX_STASH_CAP, STASH_EXPANSION_STEP } from '../shop.js';

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

    this.buildBtn = document.getElementById('btn-build');
    this.buildCost = document.getElementById('build-cost');

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
  buildCharacterSelect(characters, order, save, onPick, onUnlock, initialId = order[0]) {
    this.charSelect.innerHTML = '';

    order.forEach((id, i) => {
      const c = characters[id];
      const unlocked = save.characterUnlocked(id);
      const cost = c.unlockCost || 0;

      const card = document.createElement('button');
      card.className = 'char-card'
        + (unlocked && id === initialId ? ' selected' : '')
        + (unlocked ? '' : ' locked');
      card.style.setProperty('--accent', c.accent);
      card.innerHTML = `
        <canvas class="char-portrait" width="128" height="120"></canvas>
        ${unlocked ? '' : `<div class="char-lock-badge">🔒 ${cost} 🧬</div>`}
        <div class="char-codename">${c.codename}${unlocked ? '' : ' <span class="lock-hint">未解鎖</span>'}</div>
        <div class="char-title">${c.title}</div>
        <div class="char-trait"><strong>${c.traitName}</strong>${c.traitDesc}</div>
      `;
      card.addEventListener('click', () => {
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
      for (const [key, crate] of Object.entries(SHOP_CRATES)) {
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.style.setProperty('--rarity', crate.color);
        const stashFull = save.stashFull();

        card.innerHTML = `
          <div class="shop-card-icon">${crate.icon}</div>
          <div class="shop-card-title" style="color: ${crate.color}">${crate.name}</div>
          <div class="shop-card-desc">${crate.desc}</div>
          ${stashFull ? '<div style="color: #ff0055; font-size: 11px; margin-bottom: 6px; font-weight: bold;">⚠️ 裝備倉庫已滿</div>' : ''}
          ${group('buy-crate', key, crate, stashFull)}
        `;
        grid.appendChild(card);
      }
    } else if (this._currentShopTab === 'boosters') {
      for (const [key, booster] of Object.entries(SHOP_BOOSTERS)) {
        const card = document.createElement('div');
        card.className = 'shop-card';
        const has = save.hasBooster(key);

        card.innerHTML = `
          <div class="shop-card-icon">${booster.icon}</div>
          <div class="shop-card-title" style="color: ${booster.color}">${booster.name}</div>
          <div class="shop-card-desc">${booster.desc}</div>
          ${has ? '<div class="booster-equipped-badge">✓ 已就緒 (下局生效)</div>' : group('buy-booster', key, booster, has)}
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
        ${isMax ? '<div class="booster-equipped-badge">已達最高等級 (MAX)</div>' : group('expand-stash', 'stash', STASH_EXPAND_COST, isMax)}
      `;
      grid.appendChild(card);
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
  }

  rebuildTalentView(save) {
    const dna = save.data.dna;
    this.updateDnaChip(dna);
    if (!this.talentList) return;
    this.talentList.innerHTML = '';

    TALENT_ORDER.forEach((id) => {
      const def = TALENTS[id];
      const lvl = save.talentLevel(id);
      const maxed = lvl >= def.maxLevel;
      const cost = maxed ? 0 : talentCost(def, lvl);

      const row = document.createElement('div');
      row.className = 'talent-row' + (maxed ? ' maxed' : '');
      const affordable = !maxed && dna >= cost;
      row.innerHTML = `
        <span class="talent-icon">${def.icon}</span>
        <div class="talent-info">
          <div class="talent-name">${def.name}<span class="talent-lv">LV ${lvl}/${def.maxLevel}</span></div>
          <div class="talent-desc">${def.desc}</div>
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
          ? `<div class="gear-slot-item">${RARITIES[item.rarity].name}</div>
             <div class="gear-slot-affixes">${item.affixes.map(affixText).join('<br>')}</div>
             <button class="gear-mini-btn" data-unequip="${slotKey}">脫下</button>`
          : '<div class="gear-slot-empty">未裝備</div>'}
      `;
      this.gearSlots.appendChild(cell);
    });
    this.gearSlots.querySelectorAll('[data-unequip]').forEach((btn) => {
      btn.addEventListener('click', () => this._gearHandlers?.onUnequip(btn.dataset.unequip));
    });

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
    this.gearCount.textContent = `倉庫 ${stash.length} / ${STASH_CAP}`;
    this.gearCount.classList.toggle('full', stash.length >= STASH_CAP);
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
          <div class="gear-row-name">${setHtml}${RARITIES[item.rarity].name} ${SLOTS[item.slot].name}${isOn ? ' <span class="gear-on">裝備中</span>' : ''}</div>
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
                   <button class="gear-mini-btn drop" data-salvage="${item.id}">分解 +${salvageValue(item)} 🧬</button>`}
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

  // 佈署砲塔按鈕：金幣不夠就變灰
  updateBuildBtn(gold, cost) {
    this.buildCost.textContent = cost;
    this.buildBtn.classList.toggle('affordable', gold >= cost);
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
  showLuckyChest(count, rewards, onClaim) {
    // 自動跳過開箱動畫：直接套用獎勵並回遊戲
    if (this.skipChestChk && this.skipChestChk.checked) {
      if (onClaim) onClaim();
      return;
    }

    if (!this.luckyChestModal) return;
    this.luckyChestModal.classList.remove('hidden');
    this.chestCards.innerHTML = '';
    this.chestClaimBtn.classList.add('hidden');
    this.chestSubtitle.textContent = `恭喜獲得 ${count} 連抽特工物資！`;

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

  openRecipeModal(saveData) {
    if (!this.recipeModal) return;
    this.buildRecipeList(saveData);
    this.recipeModal.classList.remove('hidden');
  }

  // 開始畫面的關卡選擇 (未解鎖的關卡不能點)
  buildLevelSelect(levels, order, save, onPick, currentId) {
    this.levelSelect.innerHTML = '';

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
      card.innerHTML = `
        <span class="level-icon">${unlocked ? lv.icon : '🔒'}</span>
        <span class="level-name">${lv.name}</span>
        <span class="level-sub">${lv.sub} ‧ 難度 ${'★'.repeat(lv.difficulty)}</span>
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

  // 依模式顯示/隱藏砲塔與傭兵按鈕 (生存者模式兩者都沒有)
  setModeButtons(mode) {
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
    }, seconds * 1000);
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

  updateHUD(player, gameTime, kills, gold) {
    // 經驗條
    const pct = Math.min(100, Math.max(0, (player.exp / player.nextExp) * 100));
    this.expFill.style.width = `${pct}%`;
    this.playerLevel.textContent = player.level;

    // 時間
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    this.timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // 擊殺與金幣
    this.killsText.textContent = kills;
    this.goldText.textContent = gold;
  }

  updateSkillSlots(weaponManager) {
    // 更新武器欄
    let wIndex = 0;
    for (const [id, item] of weaponManager.weapons.entries()) {
      const slot = document.getElementById(`weapon-slot-${wIndex}`);
      if (!slot) continue;
      const def = WEAPONS[id];
      slot.className = `skill-slot filled ${item.isEvo ? 'evo' : ''}`;
      slot.innerHTML = `
        <span class="slot-emoji">${def.icon.split(' ')[0]}</span>
        <span class="slot-stars">${item.isEvo ? 'MAX' : '★'.repeat(item.level)}</span>
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

  updateBossHUD(boss) {
    if (!boss || boss.isDead) {
      this.bossHud.classList.add('hidden');
      return;
    }
    this.bossHud.classList.remove('hidden');
    this.bossName.textContent = boss.name;
    const hpPct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    this.bossHpFill.style.width = `${hpPct}%`;
  }

  // 升級三選一對話框：渲染卡牌 + reroll 按鈕狀態
  showUpgradeCards(options, gold, rerollCost, onSelect, onReroll) {
    sound.playLevelUp();
    this.cardsGrid.innerHTML = '';
    this._rerollCb = onReroll || null;
    this._rerollCost = rerollCost || 0;

    options.forEach((opt) => {
      const card = document.createElement('div');
      card.className = `upgrade-card ${opt.isEvo ? 'card-evo' : ''}`;

      const stars = opt.isEvo
        ? '★★★★★ 超武進化'
        : opt.isNew
        ? 'NEW 首次獲取'
        : '★'.repeat(opt.nextLevel) + '☆'.repeat(opt.maxLevel - opt.nextLevel);

      card.innerHTML = `
        <div class="card-icon-box">${opt.icon}</div>
        <div class="card-info">
          <div class="card-title-row">
            <span class="card-name">${opt.name}</span>
            <span class="card-tag ${opt.isEvo ? 'tag-evo' : ''}">${opt.tag}</span>
          </div>
          <div class="card-desc">${opt.description}</div>
          <div class="card-level-stars">${stars}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.levelUpModal.classList.add('hidden');
        onSelect(opt);
      });

      this.cardsGrid.appendChild(card);
    });

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

  generateUpgradeOptions(weaponManager, excludeKeys = null) {
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
        let desc = `提升等級至 LV ${item.level + 1}。傷害與彈幕增強。`;
        let tag = '武器升級';
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
          description: hint
            ? `提升等級至 LV ${item.level + 1}。完成後即可合成【${hint.evoName}】`
            : `提升等級至 LV ${item.level + 1}。效果提升。`,
          tag: hint ? '被動升級 · 超武缺件' : '被動升級',
          nextLevel: item.level + 1,
          maxLevel: def.maxLevel,
        });
      }
    }

    // 4. 新武器 (若武器槽未滿)
    if (weaponManager.weapons.size < GAME_CONFIG.MAX_WEAPON_SLOTS) {
      for (const [id, def] of Object.entries(WEAPONS)) {
        if (!def.isEvo && !weaponManager.weapons.has(id)) {
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
              : def.description,
            tag: hint ? '新被動 · 超武缺件' : '新被動',
            isNew: true,
            nextLevel: 1,
            maxLevel: def.maxLevel,
          });
        }
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

    const unlockRow = document.getElementById('unlock-notice');
    if (stats.unlockedName) {
      unlockRow.textContent = `🎉 解鎖新關卡：${stats.unlockedName}`;
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
      const salvaged = gearSummary?.salvagedGear || []; // 倉庫滿，自動分解換 DNA
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
}
