// 主選單與局外養成的 DOM 接線（特工／模式／關卡選擇、商店、天賦、倉庫、成就、每日挑戰）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 340 行（單是 bindEvents 就 233 行），
// 而且幾乎只碰 DOM 與存檔、不碰戰鬥與渲染 —— 是與遊戲主迴圈耦合最低的一塊。
// 手法與 js/systems/Hazards.js 相同：game 當第一個參數，this. → game.，
// 模組本身不持有遊戲狀態。
//
// 呼叫端：Game 建構子以 bindEvents(this) 接線；選單內部互呼直接走模組函式。

import { CHARACTERS, CHARACTER_ORDER } from '../characters.js';
import { LEVELS, LEVEL_ORDER, getDailyChallenge } from '../levels.js';
import { MODES, MODE_ORDER, getMode } from '../modes.js';
import { MAX_STASH_CAP, SHOP_BOOSTERS, SHOP_CRATES, STASH_EXPAND_COST, STASH_EXPANSION_STEP } from '../shop.js';
import { itemName } from '../items.js';
import { save } from '../save.js';
import { sound } from '../audio.js';
import { buildFacility, hireMercenary, tryUpgradeNearestTurret } from './Facilities.js';

export function bindEvents(game) {
  // 特工 / 關卡選擇 (可重繪：解鎖或回主選單時刷新)
  refreshModeSelect(game, );
  refreshCharSelect(game, );
  refreshLevelSelect(game, );
  game.ui.updateDnaChip(save.data.dna, save.data.gold);

  // 特工黑市 (Shop)
  document.getElementById('btn-shop')?.addEventListener('click', () => {
    sound.playGem();
    const buy = (cur, costGold, costDna, onPaid) => {
      if (cur === 'gold' ? save.data.gold < costGold : save.data.dna < costDna) {
        game.ui.sayStatus(`${cur === 'gold' ? '金幣' : 'DNA'} 不足！`, true);
        sound.playHurt();
        return;
      }
      save.spend(cur === 'gold' ? costGold : 0, cur === 'dna' ? costDna : 0);
      sound.playEvoFanfare();
      game.ui.updateDnaChip(save.data.dna, save.data.gold);
      onPaid();
      game.ui.rebuildShopView(save);
    };

    game.ui.openShopModal(save, {
      onBuyCrate: (crateKey, currency) => {
        const crate = SHOP_CRATES[crateKey];
        if (!crate) return;
        if (save.stashFull()) {
          game.ui.sayStatus('倉庫已滿，請先清理或擴充倉庫！', true);
          sound.playHurt();
          return;
        }
        buy(currency, crate.costGold, crate.costDna, () => {
          const item = crate.roll();
          save.addItem(item);
          game.ui.sayStatus(`成功開啟 ${crate.name}！獲得【${item.rarity.toUpperCase()}】特工裝備！`);
        });
      },
      onBuyBooster: (boosterKey, currency) => {
        const booster = SHOP_BOOSTERS[boosterKey];
        if (!booster) return;
        if (save.hasBooster(boosterKey)) {
          game.ui.sayStatus('該戰術興奮劑已就緒，將於下局自動生效！', true);
          return;
        }
        buy(currency, booster.costGold, booster.costDna, () => {
          save.addBooster(boosterKey);
          game.ui.sayStatus(`戰備完成：${booster.name} 已裝備，將於下局生效！`);
        });
      },
      onExpandStash: (currency) => {
        if (save.getStashCap() >= MAX_STASH_CAP) {
          game.ui.sayStatus('倉庫已擴建至最大容量！', true);
          return;
        }
        buy(currency, STASH_EXPAND_COST.costGold, STASH_EXPAND_COST.costDna, () => {
          save.expandStash(STASH_EXPANSION_STEP, MAX_STASH_CAP);
          game.ui.sayStatus(`特工倉庫擴充成功！當前容量上限：${save.getStashCap()}`);
        });
      },
    });
  });

  // 基因強化 (天賦樹)
  document.getElementById('btn-talents').addEventListener('click', () => {
    sound.playGem();
    game.ui.openTalentModal(save, (id) => investTalent(game, id));
  });

  // 裝備倉庫
  document.getElementById('btn-gear').addEventListener('click', () => {
    sound.playGem();
    game.ui.openGearModal(save, {
      onEquip: (id) => {
        save.equipItem(id);
        sound.playEvoFanfare();
        game.ui.rebuildGearView(save);
      },
      onUnequip: (slot) => {
        save.unequipSlot(slot);
        sound.playGem();
        game.ui.rebuildGearView(save);
      },
      onSalvage: (id) => {
        const dna = save.salvageItem(id);
        if (dna < 0) {
          game.ui.sayStatus('這件正穿在身上，要先脫下才能分解', true);
          sound.playHurt();
          return;
        }
        sound.playGem();
        game.ui.sayStatus(`分解完成，回收 ${dna} 🧬`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
      },
      onReforge: (id) => {
        const res = save.reforgeItem(id);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playHurt();
          return;
        }
        sound.playEvoFanfare();
        game.ui.sayStatus(`重鑄完成：詞條已重新洗牌 (花費 ${res.cost} 🧬)`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
      },
      onSalvageAll: (rarity) => {
        const res = save.salvageAll(rarity);
        if (res.count === 0) return;
        sound.playEvoFanfare();
        game.ui.sayStatus(`分解 ${res.count} 件，回收 ${res.dna} 🧬`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
      },
      onFuse: (ids) => {
        const res = save.fuseItems(ids);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playHurt();
          return;
        }
        sound.playEvoFanfare();
        game.ui.sayStatus(`合成成功！獲得【${itemName(res.item)}】(消耗 ${res.cost} 🧬)`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
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
    game.ui.startScreen.classList.add('hidden');
    game.start();
  });

  // 重新開始按鈕
  document.getElementById('btn-restart').addEventListener('click', () => {
    game.ui.gameOverModal.classList.add('hidden');
    game.start();
  });

  // 結算 → 回主選單 (換角/換關/強化都要先回來這裡)
  document.getElementById('btn-menu').addEventListener('click', () => {
    returnToMenu(game, );
  });

  // 暫停按鈕
  game.ui.pauseBtn.addEventListener('click', () => {
    if (game.state === 'PLAYING') {
      game.state = 'PAUSED';
      sound.pauseBGM();
      game.ui.pauseBtn.textContent = '▶️';
      game.ui.quitBtn?.classList.remove('hidden');
    } else if (game.state === 'PAUSED') {
      game.state = 'PLAYING';
      sound.resumeBGM();
      game.ui.pauseBtn.textContent = '⏸️';
      game.ui.quitBtn?.classList.add('hidden');
    }
  });

  // 放棄任務 (暫停時可見)：以「陣亡」結算後回主選單
  game.ui.quitBtn?.addEventListener('click', () => {
    if (game.state !== 'PAUSED') return;
    if (!confirm('確定要放棄本次任務？（將以失敗結算）')) return;
    game.ui.quitBtn.classList.add('hidden');
    game.handleGameOver(false);
    returnToMenu(game, );
  });

  // 佈署戰場防禦設施 (1/2/3/4/B、HUD 按鈕)
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') buildFacility(this, 'turret');
    if (e.key === '2') buildFacility(this, 'electric_grid');
    if (e.key === '3') buildFacility(this, 'purifier');
    if (e.key === '4') buildFacility(this, 'barricade');
    if (e.key === 'b' || e.key === 'B') buildFacility(this, game.selectedFacility || 'turret');
    if (e.key === 't' || e.key === 'T') tryUpgradeNearestTurret(this);
    if (e.key === 'g' || e.key === 'G') hireMercenary(this);
    if (e.key === 'e' || e.key === 'E' || e.key === 'f' || e.key === 'F') game.usePocketItem();
  });

  // 戰術口袋道具點擊使用 (HUD 口袋槽 / 行動端快捷鍵)
  game.ui.pocketSlot?.addEventListener('click', () => game.usePocketItem());
  game.ui.btnPocket?.addEventListener('click', () => game.usePocketItem());
  // 設施列各按鈕點擊
  for (const [type, item] of Object.entries(game.ui.facilityButtons || {})) {
    if (item && item.btn) {
      item.btn.addEventListener('click', () => {
        game.selectedFacility = type;
        buildFacility(this, type);
      });
    }
  }

  // 戰術閃避翻滾 (Space / 行動端按鈕)
  game.input.onDash = () => game.triggerDash();
  game.ui.dashBtn?.addEventListener('click', () => game.triggerDash());

  // 僱傭傭兵 (G / 行動端按鈕)
  game.ui.hireBtn?.addEventListener('click', () => hireMercenary(this));

  // 砲塔進化專精按鈕 (UI 建構子已掛 click，走 _turretUpCb；這裡不要再掛，避免一次點擊雙重觸發)

  // 每日挑戰入口按鈕
  game.ui.dailyBtn?.addEventListener('click', () => startDailyChallenge(game, ));

  // 超武合成圖鑑 (主選單查閱配方)
  game.ui.recipeBtn?.addEventListener('click', () => game.ui.openRecipeModal(save.data));

  // 音效切換按鈕
  game.ui.soundBtn.addEventListener('click', () => {
    const enabled = sound.toggleSound();
    game.ui.soundBtn.textContent = enabled ? '🔊' : '🔇';
  });
}

export function refreshCharSelect(game) {
  game.ui.buildCharacterSelect(
    CHARACTERS, CHARACTER_ORDER, save,
    (id) => {
      game.characterId = id;
      save.set({ character: id });
    },
    (id) => tryUnlockCharacter(game, id),
    game.characterId,
    (weaponId, aspectId) => {
      save.setWeaponAspect(weaponId, aspectId);
      sound.playSelect();
    }
  );
}

export function refreshModeSelect(game) {
  game.ui.buildModeSelect(MODES, MODE_ORDER, game.modeId, (id) => {
    game.modeId = id;
    game.mode = getMode(id);
    save.set({ mode: id });
    // 換模式後原本選的關卡可能還沒在這個模式解鎖
    if (!save.isUnlocked(game.levelId, id)) {
      game.levelId = 'street';
      save.set({ lastLevel: 'street' });
    }
    refreshLevelSelect(game, );
  });
}

export function refreshLevelSelect(game) {
  game.ui.buildLevelSelect(LEVELS, LEVEL_ORDER, save, (id) => {
    game.levelId = id;
    save.set({ lastLevel: id });
  }, game.levelId);
}

export function tryUnlockCharacter(game, id) {
  const def = CHARACTERS[id];
  if (!def || save.characterUnlocked(id)) return;
  const cost = def.unlockCost || 0;
  if (!save.unlockCharacter(id, cost)) {
    game.ui.sayStatus(`DNA 不足：解鎖「${def.title}」需要 ${cost} 🧬`, true);
    sound.playHurt();
    return;
  }
  game.characterId = id;
  save.set({ character: id });
  refreshCharSelect(game, );
  game.ui.updateDnaChip(save.data.dna);
  game.ui.sayStatus(`特工「${def.codename}」已就緒，隨時可以出擊！`);
  sound.playEvoFanfare();
}

export function investTalent(game, id) {
  const res = save.investTalent(id);
  if (!res.ok) {
    game.ui.sayStatus(res.reason, true);
    sound.playHurt();
    return;
  }
  game.ui.updateDnaChip(save.data.dna);
  game.ui.rebuildTalentView(save);
  game.ui.sayStatus(`天賦強化成功 (花費 ${res.cost} 🧬)`);
  sound.playGem();
}

export function returnToMenu(game) {
  game.state = 'START';
  // 每日挑戰會強制切成生存者，回選單要把玩家自己選的模式還原回來
  game.modeId = MODES[save.data.mode] ? save.data.mode : 'survivor';
  game.mode = getMode(game.modeId);
  game.isDaily = false;
  game.ui.gameOverModal.classList.add('hidden');
  game.ui.startScreen.classList.remove('hidden');

  game.enemies = [];
  game._pendingSpawns = [];
  game.enemyProjectiles = [];
  game.dropItems = [];
  game.pendingLevelUps = 0;
  game._levelUpHold = 0;
  game.turrets = [];
  game.mercenaries = [];
  game.decals = [];
  game.hazards = [];
  game.boss = null;
  game.core = null;
  game.ui.updateCoreHUD(null);
  game.particles.clear();
  game.camera.x = 0;
  game.camera.y = 0;
  game.camera.shake = 0;

  game.ui.updateBossHUD(null);
  game.ui.updateHUD(game.player, 0, 0, 0);
  game.ui.pauseBtn.textContent = '⏸️';
  game.ui.quitBtn?.classList.add('hidden');
  game.ui.updateDnaChip(save.data.dna, save.data.gold);
  refreshModeSelect(game, );
  refreshCharSelect(game, );
  refreshLevelSelect(game, );
  game.ui.sayStatus('');
  sound.stopBGM();
}

export function startDailyChallenge(game) {
  game.dailyConfig = getDailyChallenge();
  game.modeId = 'survivor';
  game.mode = getMode('survivor');
  game.ui.startScreen.classList.add('hidden');
  game.start(true);
}
