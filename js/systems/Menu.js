// 主選單與局外養成的 DOM 接線（特工／模式／關卡選擇、商店、天賦、倉庫、成就、每日挑戰）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 340 行（單是 bindEvents 就 233 行），
// 而且幾乎只碰 DOM 與存檔、不碰戰鬥與渲染 —— 是與遊戲主迴圈耦合最低的一塊。
// 手法與 js/systems/Hazards.js 相同：game 當第一個參數，this. → game.，
// 模組本身不持有遊戲狀態。
//
// 呼叫端：Game 建構子以 bindEvents(this) 接線；選單內部互呼直接走模組函式。

import { CHARACTERS, CHARACTER_ORDER } from '../characters.js';
import { DIFFICULTIES, LEVELS, getDailyChallenge } from '../levels.js';
import { whenSpritesReady } from '../sprites.js';
import { MODES, MODE_ORDER, getMode } from '../modes.js';
import { RUN_CARDS, RUN_CARD_ORDER } from '../runcards.js';
import { MAX_BOOSTER_STACK, MAX_STASH_CAP, SHOP_BOOSTERS, SHOP_CRATES, STASH_EXPANSION_STEP, stashExpandCost, shopItemLevel } from '../shop.js';
import { itemName } from '../items.js';
import { save, SLOT_COUNT } from '../save.js';
import { sound } from '../audio.js';
import {
  buildFacility,
  startPlacement,
  cancelPlacement,
  updatePlacement,
  confirmPlacement,
  inspectFacility,
  closeFacilityInspector,
  hireMercenary,
  tryUpgradeNearestTurret,
  openBuildMenu,
  closeBuildMenu,
  pickBuildMenuByIndex,
} from './Facilities.js';
import { setHeroTarget } from './TDHero.js';
import { castSkill } from './Skills.js';

export function bindEvents(game) {
  // 特工 / 關卡選擇 (可重繪：解鎖或回主選單時刷新)
  refreshModeSelect(game);
  refreshCharSelect(game);
  refreshLevelSelect(game);
  game.ui.updateDnaChip(save.data.dna, save.data.gold);

  // 特工黑市 (Shop)
  document.getElementById('btn-shop')?.addEventListener('click', () => {
    sound.playClick();
    const buy = (cur, costGold, costDna, onPaid) => {
      if (cur === 'gold' ? save.data.gold < costGold : save.data.dna < costDna) {
        game.ui.sayStatus(`${cur === 'gold' ? '金幣' : 'DNA'} 不足！`, true);
        sound.playError();
        return;
      }
      save.spend(cur === 'gold' ? costGold : 0, cur === 'dna' ? costDna : 0);
      sound.playCoin();
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
          sound.playError();
          return;
        }
        buy(currency, crate.costGold, crate.costDna, () => {
          // 箱子的裝備等級跟著玩家的最佳紀錄（shopItemLevel），不再是永遠 ilvl 1
          const item = crate.roll(shopItemLevel(save));
          save.addItem(item);
          game.ui.sayStatus(`成功開啟 ${crate.name}！獲得【${item.rarity.toUpperCase()}】Lv.${(item.ilvl || 1).toFixed(2)} 特工裝備！`);
        });
      },
      onBuyBooster: (boosterKey, currency) => {
        const booster = SHOP_BOOSTERS[boosterKey];
        if (!booster) return;
        if (save.boosterCount(boosterKey) >= MAX_BOOSTER_STACK) {
          game.ui.sayStatus(`${booster.name}已帶滿 ${MAX_BOOSTER_STACK} 劑（同一種的上限）`, true);
          return;
        }
        buy(currency, booster.costGold, booster.costDna, () => {
          const res = save.addBooster(boosterKey);
          const n = res && res.count ? res.count : save.boosterCount(boosterKey);
          game.ui.sayStatus(`戰備完成：${booster.name} ×${n} 已裝備，將於下局疊加生效！`);
        });
      },
      onExpandStash: (currency) => {
        if (save.getStashCap() >= MAX_STASH_CAP) {
          game.ui.sayStatus('倉庫已擴建至最大容量！', true);
          return;
        }
        const cost = stashExpandCost(save.getStashCap());
        buy(currency, cost.costGold, cost.costDna, () => {
          save.expandStash(STASH_EXPANSION_STEP, MAX_STASH_CAP);
          game.ui.sayStatus(`特工倉庫擴充成功！當前容量上限：${save.getStashCap()}`);
        });
      },
      onSellJewels: (id, count) => {
        const res = save.sellJewels(id, count);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playError();
          return;
        }
        sound.playCoin();
        game.ui.sayStatus(`賣出 ${res.count} 顆珠寶，獲得 ${res.gold} 🪙 + ${res.dna} 🧬`);
        game.ui.updateDnaChip(save.data.dna, save.data.gold);
        game.ui.rebuildShopView(save);
      },
    });
  });

  // 特工等級
  document.getElementById('btn-char-levels').addEventListener('click', () => {
    sound.playClick();
    game.ui.openCharLevelModal(save, (id, times) => levelUpCharacter(game, id, times));
  });
  document.getElementById('btn-close-char-levels').addEventListener('click', () => {
    document.getElementById('char-level-modal').classList.add('hidden');
  });

  // 基因強化 (天賦樹)
  document.getElementById('btn-talents').addEventListener('click', () => {
    sound.playClick();
    game.ui.openTalentModal(save, (id) => investTalent(game, id));
  });

  // 裝備倉庫
  document.getElementById('btn-gear').addEventListener('click', () => {
    sound.playClick();
    game.ui.openGearModal(save, {
      onEquip: (id) => {
        save.equipItem(id);
        sound.playEvoFanfare();
        game.ui.rebuildGearView(save);
      },
      onUnequip: (slot) => {
        save.unequipSlot(slot);
        sound.playClick();
        game.ui.rebuildGearView(save);
      },
      onSalvage: (id) => {
        const res = save.salvageItem(id);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playError();
          return;
        }
        sound.playCoin();
        game.ui.sayStatus(`分解完成，回收 ${res.gold} 🪙 + ${res.dna} 🧬`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
      },
      onReforge: (id) => {
        const res = save.reforgeItem(id);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playError();
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
        sound.playCoin();
        game.ui.sayStatus(`分解 ${res.count} 件，回收 ${res.gold} 🪙 + ${res.dna} 🧬`);
        game.ui.updateDnaChip(save.data.dna);
        game.ui.rebuildGearView(save);
      },
      onFuse: (ids) => {
        const res = save.fuseItems(ids);
        if (!res.ok) {
          game.ui.sayStatus(res.reason, true);
          sound.playError();
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
      // 合併而不是整份覆寫：settings 裡還有其他開關 (autoPocket)，覆寫會把它們洗掉
      const settings = { ...save.data.settings, sfx: sfxVol.value / 100, bgm: bgmVol.value / 100 };
      save.set({ settings });
      sound.setVolumes(settings.sfx, settings.bgm);
    };
    sfxVol.value = Math.round((save.data.settings.sfx || 1) * 100);
    bgmVol.value = Math.round((save.data.settings.bgm || 0.8) * 100);
    sfxVol.addEventListener('input', applyVol);
    bgmVol.addEventListener('input', applyVol);
    sound.setVolumes(save.data.settings.sfx || 1, save.data.settings.bgm || 0.8);
  }

  // 口袋道具自動使用開關
  const autoPocket = document.getElementById('auto-pocket');
  if (autoPocket) {
    autoPocket.checked = save.data.settings.autoPocket !== false;
    autoPocket.addEventListener('change', () => {
      save.set({ settings: { ...save.data.settings, autoPocket: autoPocket.checked } });
    });
  }

  // 開始遊戲按鈕：先確定「這一場會用到的貼圖」到手再開場
  document.getElementById('btn-start-game').addEventListener('click', async () => {
    await prepareRunSprites(game);
    game.ui.startScreen.classList.add('hidden');
    game.start();
  });

  // 重新開始按鈕（貼圖通常已經在了，走同一條路以免有例外狀況）
  document.getElementById('btn-restart').addEventListener('click', async () => {
    await prepareRunSprites(game);
    game.ui.gameOverModal.classList.add('hidden');
    game.start();
  });

  // 結算 → 回主選單 (換角/換關/強化都要先回來這裡)
  document.getElementById('btn-menu').addEventListener('click', () => {
    returnToMenu(game);
  });

  // 暫停：打開暫停面板（目前構築 + 顯示設定）；再按一次或面板的「繼續」回到戰鬥
  const pauseModal = document.getElementById('pause-modal');
  const togglePause = () => {
    if (game.state === 'PLAYING') {
      game.state = 'PAUSED';
      sound.pauseBGM();
      game.ui.pauseBtn.textContent = '▶️';
      game.ui.quitBtn?.classList.remove('hidden');
      game.ui.renderPauseBuild(game);
      pauseModal?.classList.remove('hidden');
    } else if (game.state === 'PAUSED') {
      game.state = 'PLAYING';
      sound.resumeBGM();
      game.ui.pauseBtn.textContent = '⏸️';
      game.ui.quitBtn?.classList.add('hidden');
      pauseModal?.classList.add('hidden');
    }
  };
  game.ui.pauseBtn.addEventListener('click', togglePause);
  document.getElementById('btn-resume')?.addEventListener('click', togglePause);
  // Esc / P 快捷鍵（只在戰鬥中或暫停中有效；選卡、開箱時不搶按鍵）
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
    if (game.state === 'PLAYING' || game.state === 'PAUSED') togglePause();
  });

  // 放棄任務 (暫停時可見)：以「陣亡」結算後回主選單
  const quitMission = () => {
    if (game.state !== 'PAUSED') return;
    if (!confirm('確定要放棄本次任務？（將以失敗結算）')) return;
    game.ui.quitBtn?.classList.add('hidden');
    pauseModal?.classList.add('hidden');
    game.handleGameOver(false);
    returnToMenu(game);
  };
  game.ui.quitBtn?.addEventListener('click', quitMission);
  document.getElementById('btn-pause-quit')?.addEventListener('click', quitMission);

  // 每日任務與圖鑑（領獎後重畫、更新錢包與「❗」提示）
  const afterClaim = (res, rebuild) => {
    if (!res.ok) { game.ui.sayStatus(res.reason, true); sound.playHurt(); return; }
    sound.playEvoFanfare();
    game.ui.sayStatus(`領取獎勵：${res.gold} 🪙 + ${res.dna} 🧬`);
    game.ui.updateDnaChip(save.data.dna, save.data.gold);
    rebuild();
    game.ui.updateClaimBadges(save);
  };
  document.getElementById('btn-quests')?.addEventListener('click', () => {
    sound.playGem();
    game.ui.openQuestModal(save, (i) => afterClaim(save.claimQuest(i), () => game.ui.rebuildQuestView(save)));
  });
  document.getElementById('btn-close-quests')?.addEventListener('click', () => document.getElementById('quest-modal').classList.add('hidden'));
  document.getElementById('btn-codex')?.addEventListener('click', () => {
    sound.playGem();
    game.ui.openCodexModal(save, (i) => afterClaim(save.claimCodexMilestone(i), () => game.ui.rebuildCodexView(save)));
  });
  document.getElementById('btn-close-codex')?.addEventListener('click', () => document.getElementById('codex-modal').classList.add('hidden'));
  // 存檔欄位：列出三欄，目前欄位標示；可載入或開新遊戲（新遊戲需確認）
  const renderSlots = () => {
    const list = document.getElementById('slot-list');
    if (!list) return;
    list.innerHTML = '';
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const info = save.slotSummary(n);
      const cur = n === save.slot;
      const row = document.createElement('div');
      row.className = 'slot-row' + (cur ? ' current' : '');
      row.innerHTML = `
        <div class="slot-info"><b>存檔 ${n}${cur ? '（使用中）' : ''}</b>
          <span>${info ? `通關 ${info.cleared} 關 · 特工 ${info.chars} 位 · DNA ${info.dna}` : '空欄位'}</span></div>
        <div class="slot-actions">
          ${!cur && info ? `<button class="shop-buy-btn" data-act="load" data-n="${n}">載入</button>` : ''}
          <button class="shop-buy-btn" data-act="new" data-n="${n}">🆕 新遊戲</button>
        </div>`;
      list.appendChild(row);
    }
  };
  document.getElementById('slot-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const n = Number(b.dataset.n);
    if (b.dataset.act === 'load') return save.switchSlot(n);
    const info = save.slotSummary(n);
    if (info && !confirm(`存檔 ${n} 的所有進度會清空、從頭開始（會自動留一份備份）。確定嗎？`)) return;
    save.switchSlot(n, true);
  });
  document.getElementById('btn-slots')?.addEventListener('click', () => {
    sound.playGem();
    renderSlots();
    document.getElementById('slot-modal')?.classList.remove('hidden');
  });
  document.getElementById('btn-close-slots')?.addEventListener('click', () => document.getElementById('slot-modal').classList.add('hidden'));
  game.ui.updateClaimBadges(save);

  // 顯示設定：主選單「養成基地」與暫停面板各一份，改其中一邊就同步重畫兩邊並立即套用
  const settingBoxes = ['display-settings-menu', 'display-settings-pause'].map((id) => document.getElementById(id));
  const renderSettings = () => {
    for (const box of settingBoxes) {
      game.ui.renderDisplaySettings(box, save.data.settings, (patch) => {
        save.set({ settings: { ...save.data.settings, ...patch } });
        game.applyDisplaySettings();
        renderSettings();
      });
    }
  };
  renderSettings();

  // 佈署戰場防禦設施 (1/2/3/4/5/6/7/B、HUD 按鈕、滑鼠點擊/右鍵取消)
  window.addEventListener('keydown', (e) => {
    if (game.td?.tourActive()) game.td.skipTour();   // 開場導覽：按任何鍵都跳過（這一鍵本身照常生效）
    if (e.key === 'Escape') {
      if (game.buildMenuSocket) closeBuildMenu(game);
      if (game.placement) cancelPlacement(game);
      if (game.inspectedTurret) closeFacilityInspector(game);
    }
    // 建造選單開著時，數字鍵 1–4 直接選塔（A 項）。必須排在底下的設施快捷鍵之前
    // 而且吃掉事件，否則按 1 會同時「選了選單第一座塔」＋「進入機槍砲台放置模式」。
    if (game.buildMenuSocket && /^[1-4]$/.test(e.key) && pickBuildMenuByIndex(game, Number(e.key))) return;
    if (e.key === '1') { game.selectedFacility = 'turret'; startPlacement(game, 'turret'); }
    if (e.key === '2') { game.selectedFacility = 'electric_grid'; startPlacement(game, 'electric_grid'); }
    if (e.key === '3') { game.selectedFacility = 'purifier'; startPlacement(game, 'purifier'); }
    if (e.key === '4') { game.selectedFacility = 'barricade'; startPlacement(game, 'barricade'); }
    if (e.key === '5') { game.selectedFacility = 'heavy_bolter'; startPlacement(game, 'heavy_bolter'); }
    if (e.key === '6') { game.selectedFacility = 'barracks'; startPlacement(game, 'barracks'); }
    if (e.key === '7') { game.selectedFacility = 'manufactorum'; startPlacement(game, 'manufactorum'); }
    if (e.key === 'b' || e.key === 'B') {
      if (game.placement) {
        confirmPlacement(game);
      } else {
        startPlacement(game, game.selectedFacility || 'turret');
      }
    }
    if (e.key === 't' || e.key === 'T') tryUpgradeNearestTurret(game);
    if (e.key === 'g' || e.key === 'G') hireMercenary(game);
    if ((e.key === 'n' || e.key === 'N') && game.state === 'PLAYING') game.td?.startWave(true);   // 守塔：提前開戰
    if ((e.key === 'x' || e.key === 'X') && game.td) toggleTDSpeed(game);
    if ((e.key === 'k' || e.key === 'K') && game.state === 'PLAYING' && game.td) toggleKingdomPanel(game);   // 守塔：王國升級
    if (e.key === 'e' || e.key === 'E') game.usePocketItem(0);
    if (e.key === 'f' || e.key === 'F') game.usePocketItem(1);
    if (e.key === 'q' || e.key === 'Q') castSkill(game, 0);
    if (e.key === 'r' || e.key === 'R') castSkill(game, 1);
    if (e.key === 'c' || e.key === 'C') game.usePocketItem(2);
    if (e.key === 'v' || e.key === 'V') game.usePocketItem(3);
  });

  // 守塔建築放置預覽與點擊檢查 (Canvas Pointer Events)
  const cv = game.canvas;
  // 守塔：在空地上「點一下」＝英雄走過去；「按住拖曳」＝平移鏡頭（地圖比畫面大的小螢幕才有效果）
  let pan = null;
  cv.addEventListener('pointerup', (e) => {
    if (pan && !pan.moved && game.td && game.state === 'PLAYING') {
      const w = game.screenToWorld(e.clientX, e.clientY);
      setHeroTarget(game, w.x, w.y);
    }
    pan = null;
  });
  cv.addEventListener('pointercancel', () => { pan = null; });
  cv.addEventListener('pointermove', (e) => {
    if (pan && game.td) {
      if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 8) return;   // 手指微抖不算拖曳
      pan.moved = true;
      game.camera.x = pan.cx - (e.clientX - pan.x) / game.zoom;
      game.camera.y = pan.cy - (e.clientY - pan.y) / game.zoom;
      game.clampCamera();
      return;
    }
    if (game.placement) {
      updatePlacement(game, e.clientX, e.clientY);
    } else {
      game.lastPointer = { x: e.clientX, y: e.clientY };
    }
  });

  cv.addEventListener('pointerdown', (e) => {
    if (game.bossCutscene && game.bossCutscene.active) {
      game.bossCutscene.skip();
      return;
    }
    if (game.state !== 'PLAYING') return;

    // 右鍵取消建造（順便收掉開場導覽：這一擊不進下面的世界座標計算）
    if (e.button === 2) {
      if (game.td?.tourActive()) game.td.skipTour();
      if (game.placement) {
        cancelPlacement(game);
      }
      return;
    }

    // 左鍵處理
    if (e.button === 0) {
      if (game.placement) {
        confirmPlacement(game);
        return;
      }

      // 未在建造模式時：點擊檢查既有設施或空戰術地基
      const { x: wx, y: wy } = game.screenToWorld(e.clientX, e.clientY);
      // 開場導覽：點一下就跳過，但這一擊照常處理（玩家看到什麼就點什麼，不吞掉輸入）。
      // 必須排在 screenToWorld 之後：skipTour 會把縮放從「全覽」還原成遊玩視角，
      // zoom 一變，同一個螢幕點對到的世界座標也跟著變，先跳過就會點到隔壁那一格。
      if (game.td?.tourActive()) game.td.skipTour();

      // 守塔：點塔 → 檢查面板（升級／賣出／瞄準）；點空建塔點 → 建造選單；點空地 → 收起並開始拖曳平移
      if (game.td) {
        const t = game.turrets.find((tt) => Math.hypot(tt.x - wx, tt.y - wy) <= (tt.radius || 24) + 18);
        // 建塔點判定：取最近的空建塔點；半徑至少 60 世界單位、且縮小時至少 44 螢幕像素（手指點得到）
        const reach = Math.max(60, 44 / (game.zoom || 1));
        let sock = null, best = reach;
        if (!t) for (const so of game.level.sockets) {
          const d = Math.hypot(so.x - wx, so.y - wy);
          if (!so.occupied && d <= best) { sock = so; best = d; }
        }
        if (t) {
          closeBuildMenu(game);
          inspectFacility(game, t);
        } else if (sock) {
          openBuildMenu(game, sock);
        } else {
          closeBuildMenu(game);
          if (game.inspectedTurret) closeFacilityInspector(game);
          pan = { x: e.clientX, y: e.clientY, cx: game.camera.x, cy: game.camera.y };
        }
        return;
      }

      // 1. 優先檢查是否點擊既有防禦設施 (半徑 35px 判定)
      const clickedTurret = game.turrets.find(
        (t) => Math.hypot(t.x - wx, t.y - wy) <= (t.radius || 24) + 14
      );
      if (clickedTurret) {
        inspectFacility(game, clickedTurret);
        return;
      }

      // 2. 檢查是否點擊未佔用的戰術地基 (快速進入建造吸附)
      if (game.level && game.level.sockets) {
        const clickedSocket = game.level.sockets.find(
          (s) => Math.hypot(s.x - wx, s.y - wy) <= 40 &&
            !game.turrets.some((t) => t.socket === s || Math.hypot(t.x - s.x, t.y - s.y) < 25)
        );
        if (clickedSocket) {
          startPlacement(game, game.selectedFacility || 'turret');
          updatePlacement(game, e.clientX, e.clientY);
          return;
        }
      }

      // 若點擊空白地面且正在檢查設施，則關閉檢查面板
      if (game.inspectedTurret) {
        closeFacilityInspector(game);
      }
    }
  });

  cv.addEventListener('contextmenu', (e) => {
    if (game.placement) {
      e.preventDefault();
      cancelPlacement(game);
    }
  });

  // 戰術口袋道具點擊使用 (HUD 兩格口袋 / 行動端兩顆快捷鍵，都以 data-slot 分辨)
  document.querySelectorAll('.pocket-slot[data-slot], .pocket-btn[data-slot]').forEach((el) => {
    el.addEventListener('click', () => game.usePocketItem(Number(el.dataset.slot)));
  });
  // 手機設施展開鈕
  const actionBar = document.getElementById('action-bar');
  const facToggle = document.getElementById('btn-facility-toggle');
  const setFacilityOpen = (open) => {
    actionBar?.classList.toggle('fac-open', open);
    facToggle?.setAttribute('aria-expanded', String(open));
  };
  facToggle?.addEventListener('click', () => setFacilityOpen(!actionBar.classList.contains('fac-open')));
  // 傭兵也收在展開鈕裡，按下後一樣自動收起
  document.getElementById('btn-hire')?.addEventListener('click', () => setFacilityOpen(false));
  // 設施列各按鈕點擊
  for (const [type, item] of Object.entries(game.ui.facilityButtons || {})) {
    if (item && item.btn) {
      item.btn.addEventListener('click', () => {
        setFacilityOpen(false);   // 手機：蓋完自動收起
        game.selectedFacility = type;
        startPlacement(game, type);
      });
    }
  }

  // 戰術閃避翻滾 (Space / 行動端按鈕)
  game.input.onDash = () => game.triggerDash();
  game.ui.dashBtn?.addEventListener('click', () => game.triggerDash());

  // 僱傭傭兵 (G / 行動端按鈕)
  game.ui.hireBtn?.addEventListener('click', () => hireMercenary(game));
  document.getElementById('btn-next-wave')?.addEventListener('click', () => { if (game.state === 'PLAYING') game.td?.startWave(true); });
  document.getElementById('btn-td-speed')?.addEventListener('click', () => { if (game.td) toggleTDSpeed(game); });
  // 王國升級 (K / 行動端按鈕)：面板由 UI 產生，這裡只負責「開／關＋買了之後重畫」
  document.getElementById('btn-td-kingdom')?.addEventListener('click', () => toggleKingdomPanel(game));

  // 砲塔進化專精按鈕 (UI 建構子已掛 click，走 _turretUpCb；這裡不要再掛，避免一次點擊雙重觸發)

  // 每日挑戰入口按鈕
  game.ui.dailyBtn?.addEventListener('click', () => startDailyChallenge(game));

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
    // 守塔與生存者用不同的關卡表，換模式後退回該模式的第一關
    const order = getMode(id).levelOrder;
    if (!order.includes(game.levelId) || !save.isUnlocked(game.levelId, id)) {
      game.levelId = order[0];
      save.set({ lastLevel: order[0] });
    }
    refreshLevelSelect(game);
  });
}

export function refreshLevelSelect(game) {
  game.ui.buildLevelSelect(LEVELS, getMode(game.modeId).levelOrder, save, (id) => {
    game.levelId = id;
    save.set({ lastLevel: id });
  }, game.levelId);
  // 難度下拉 (原生 select)：選項標出 DNA 倍率，下方即時說明實際影響的規則倍率。
  // 難度是分模式的（v91）：這裡列的是「這個模式」的難度與它自己的解鎖進度 ——
  // 生存者的 12 關（扣掉無盡）與守塔的 7 張圖是兩條不同的階梯，不該共用進度。
  const modeId = getMode(game.modeId).id;
  const sel = document.getElementById('difficulty-select');
  if (sel) {
    // 每次回到選單都重建：通關後可能剛解鎖新難度
    sel.innerHTML = Object.entries(DIFFICULTIES).map(([k, d], i, all) => {
      if (save.difficultyUnlocked(k, modeId)) return `<option value="${k}">${d.name} (DNA ×${d.dnaMult || 1})</option>`;
      const pr = save.difficultyProgress(k, modeId);
      const tag = modeId === 'defense' ? '守塔' : '生存者';
      return `<option value="${k}" disabled>🔒 ${d.name} (DNA ×${d.dnaMult || 1})｜${all[i - 1][1].name}（${tag}）全通關 ${pr.done}/${pr.total}</option>`;
    }).join('');
    sel.value = save.difficultyOf(modeId);
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', () => {
        // 只在「當下這個模式」的那一份難度上寫入
        const m = getMode(game.modeId).id;
        save.setDifficulty(m, sel.value);
        sound.playGem();
        renderDifficultyDesc(sel.value, m);
      });
    }
    renderDifficultyDesc(sel.value, modeId);
  }
  // 出擊規則卡：整局生效的取捨（每日挑戰不套用）
  const card = document.getElementById('runcard-select');
  if (card) {
    if (!card.options.length) {
      card.innerHTML = '<option value="">（不使用）</option>'
        + RUN_CARD_ORDER.map((k) => `<option value="${k}">${RUN_CARDS[k].icon} ${RUN_CARDS[k].name}</option>`).join('');
      card.value = RUN_CARDS[save.data.runCard] ? save.data.runCard : '';
      card.addEventListener('change', () => {
        save.set({ runCard: card.value || null });
        sound.playGem();
        renderRunCardDesc(card.value);
      });
    }
    renderRunCardDesc(card.value);
  }

  // 螢幕視野方向 (橫屏 / 竪屏 / 自動)
  const orientSel = document.getElementById('orientation-select');
  if (orientSel) {
    const curOrient = save.data.settings?.orientation || 'auto';
    orientSel.value = curOrient;
    if (!orientSel.dataset.bound) {
      orientSel.dataset.bound = '1';
      orientSel.addEventListener('change', () => {
        const val = orientSel.value;
        save.set({ settings: { ...save.data.settings, orientation: val } });
        sound.playGem();
        game.setOrientation(val);
        renderOrientationDesc(val);
      });
    }
    renderOrientationDesc(curOrient);
  }
}

export function renderOrientationDesc(key) {
  const el = document.getElementById('orientation-desc');
  if (!el) return;
  if (key === 'landscape') {
    el.textContent = '🖥️ 橫向寬螢幕視野（16:9 廣域視野，視野更開闊，適合雙手操作或電腦大螢幕）';
  } else if (key === 'portrait') {
    el.textContent = '📱 直向街機視野（9:16 縱深視野，聚焦前進通道，適合單手直握手機操作）';
  } else {
    el.textContent = '🔄 自動跟隨螢幕（依裝置即時長寬比例自適應縮放）';
  }
}

function renderRunCardDesc(key) {
  const el = document.getElementById('runcard-desc');
  if (!el) return;
  el.textContent = RUN_CARDS[key] ? RUN_CARDS[key].desc : '不改變任何規則（每日挑戰一律不套用規則卡）';
}

// 難度選單下方的效果說明：只寫「DNA ×1.4」看不出敵人變多強，
// 這裡把該難度實際乘上的規則列出來（資料直接取自 DIFFICULTIES，不會與平衡脫節）。
// 分模式列軸：生存者與守塔的套用點不同，說明只寫「這個模式真的會吃到」的倍率。
// 守塔的六軸套用點：雜兵/首領血量（TowerDefense.hpMul / startWave）、玩家受傷（main.js
// baseDamageTaken）、移速（enemyScale）、金幣（Facilities.js）、以及 v91 才接上的
// 生成密度（波次間隔）與詞綴精英機率（TowerDefense.spawn）—— 現在六軸全中。
const DIFF_AXES = {
  survivor: [
    ['enemyHpMul', '敵人血量'],
    ['damageTakenMul', '玩家受傷'],
    ['spawnMul', '生成密度'],
    ['eliteChanceMul', '菁英機率'],
    ['enemySpeedMul', '敵人速度'],
    ['goldMul', '金幣收益'],
  ],
  defense: [
    ['enemyHpMul', '敵人血量'],
    ['damageTakenMul', '玩家受傷'],
    ['spawnMul', '生成密度'],
    ['eliteChanceMul', '菁英機率'],
    ['enemySpeedMul', '敵人速度'],
    ['goldMul', '金幣收益'],
  ],
};

export function renderDifficultyDesc(key, modeId = 'survivor') {
  const el = document.getElementById('difficulty-desc');
  const d = DIFFICULTIES[key];
  if (!el || !d) return;
  const LABELS = DIFF_AXES[modeId] || DIFF_AXES.survivor;
  const parts = LABELS.filter(([k]) => d[k]).map(([k, label]) => `${label} ×${d[k]}`);
  parts.push(`DNA ×${d.dnaMult || 1}`);
  // 守塔的「生成密度」只改波次間隔（同一波的怪更密），每波總數不變 —— 這句話不寫，
  // 玩家會以為波數也跟著變多
  if (modeId === 'defense') parts.push('密度＝同一波的怪更密（總數不變）');
  el.textContent = key === 'normal'
    ? `基準難度：${parts.join(' ‧ ')}`
    : `${parts.join(' ‧ ')}`;
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
  refreshCharSelect(game);
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

export function levelUpCharacter(game, id, times) {
  const res = save.levelUpChar(id, times);
  if (!res.ok) {
    game.ui.sayStatus(res.reason, true);
    sound.playHurt();
    return;
  }
  game.ui.updateDnaChip(save.data.dna, save.data.gold);
  game.ui.rebuildCharLevelView(save);
  refreshCharSelect(game);
  game.ui.sayStatus(`${CHARACTERS[id].codename} 升到 Lv ${res.level}（+${res.gained} 級，花費 ${res.gold} 🪙 + ${res.dna} 🧬）`);
  sound.playLevelUp();
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
  document.getElementById('pause-modal')?.classList.add('hidden');
  game.ui.updateDnaChip(save.data.dna, save.data.gold);
  game.ui.updateClaimBadges(save);
  refreshModeSelect(game);
  refreshCharSelect(game);
  refreshLevelSelect(game);
  game.ui.sayStatus('');
  sound.startBGM('menu');
}

export function startDailyChallenge(game) {
  game.dailyConfig = getDailyChallenge();
  game.modeId = 'survivor';
  game.mode = getMode('survivor');
  prepareRunSprites(game).then(() => {
    game.ui.startScreen.classList.add('hidden');
    game.start(true);
  });
}

// ── 進場前把「這一場真的會用到的貼圖」準備好 ──
//
// 為什麼要這一步：貼圖還沒到時 `getSprite()` 會**靜默**退回 BUILDERS 字面值裡的程式繪圖
// ——那正是美術重繪前的舊圖。於是換版後（Service Worker 清空快取、重新下載幾十 MB 素材）
// 的前一兩分鐘，整場都是舊角色，玩家看到的是「我的角色怎麼變回舊的了」。
// 實測：把 duck.png 的請求吊住時 getSprite('duck') 是舊向量圖（w=64），
// 貼圖到了才是重繪版（w=74）。
//
// 等的是「這一場會出場的角色」：玩家自己的特工 + 本關波次會生的怪 + 本關首領。
// 上限 RUN_SPRITE_WAIT_MS，逾時照樣開場 —— 寧可先玩舊圖，也不能把玩家卡在載入。
const RUN_SPRITE_WAIT_MS = 8000;

function runSpriteKeys(game) {
  const keys = [CHARACTERS[game.characterId]?.sprite];
  const levels = game.modeId === 'towerDefense'
    ? Object.values(LEVELS).filter((l) => l && /^td_/.test(l.id || ''))
    : [LEVELS[game.modeId === 'towerDefense' ? 'td' : (game.isDaily ? game.dailyConfig?.levelKey : game.levelId)] || LEVELS.street];
  for (const level of levels) {
    for (const w of level.waves || []) {
      for (const entry of w.pool || []) keys.push(Array.isArray(entry) ? entry[0] : entry);  // 生存者：[[key, 權重], …]
      for (const g of w.groups || []) keys.push(g.type);                                    // 守塔：{ type, count, … }
      if (w.boss && w.boss.skin) keys.push(w.boss.skin);
    }
    for (const b of level.bosses || []) keys.push(b.skin);
  }
  return [...new Set(keys.filter(Boolean))];
}

async function prepareRunSprites(game) {
  const btn = document.getElementById('btn-start-game');
  const keys = runSpriteKeys(game);
  // 地表貼圖現在是一關一抓，所以在這裡就先把它叫下來：等玩家按下出擊才抓的話，
  // 第一次 render 會先烘焙 1024² 的程序化地表磚（貴），PNG 到了又得重烘一次。
  const levelId = game.modeId === 'towerDefense' ? null : (game.isDaily ? game.dailyConfig?.levelKey : game.levelId);
  try { game.ground?._ensureGroundPng?.(levelId || 'street'); } catch (err) { /* 預抓失敗不影響開場 */ }
  if (!keys.length) return;
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = `載入角色中… 0/${keys.length}`; }
  try {
    const res = await whenSpritesReady(keys, RUN_SPRITE_WAIT_MS, (ready, total) => {
      if (btn) btn.textContent = `載入角色中… ${ready}/${total}`;
    });
    if (res.timedOut) console.info(`[run] 貼圖等待逾時，先開場（${res.ready}/${res.total}）`);
  } catch (err) {
    console.warn('[run] 等待貼圖時出錯，直接開場：', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// 守塔遊戲速度 1× ↔ 2×（主迴圈依 game.tdSpeed 每幀多跑一步）
function toggleTDSpeed(game) {
  game.tdSpeed = game.tdSpeed === 2 ? 1 : 2;
  const label = document.getElementById('td-speed-label');
  if (label) label.textContent = `${game.tdSpeed}×`;
  document.getElementById('btn-td-speed')?.classList.toggle('active', game.tdSpeed === 2);
}

// 守塔王國升級面板：開／關。買了之後要重畫（錢變少、等級 +1），所以把重畫包成同一個回呼。
function toggleKingdomPanel(game) {
  if (!game.td) return;
  const el = document.getElementById('td-kingdom-panel');
  const open = el && !el.classList.contains('hidden');
  if (open) { game.ui.showKingdomPanel(false); return; }
  closeBuildMenu(game);   // 面板浮在同一塊區域，兩個一起開會疊在一起
  const refresh = () => game.ui.showKingdomPanel(true, game.td.kingdomRows(), (key) => {
    if (game.td.buyKingdom(key)) refresh();
  });
  refresh();
}
