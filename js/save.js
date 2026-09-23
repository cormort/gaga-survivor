// 局外存檔層：整份進度存在單一 localStorage key，其他系統一律走這裡讀寫。

import { TALENTS, talentCost, CHAR_LEVEL, charLevelCost } from './meta.js';
import { SLOT_ORDER, salvageValue, salvageGold, reforgeCost, rerollAffixes, FUSION_COST, fuseItems } from './items.js';
// 疊加上限住在黑市商品表旁邊（那裡才是「可以帶幾劑」的定義），存檔只負責執行
// 倉庫基礎容量也住在黑市（擴建成本要從它算第幾次擴建），這裡再匯出給既有的讀者
import { MAX_BOOSTER_STACK, STASH_CAP } from './shop.js';
// 舊存檔的解鎖鏈修補需要關卡表（levels.js 是純資料、不 import 任何模組，不會循環）
import { LEVELS, STARTER_WEAPONS } from './levels.js';
// 珠寶是純資料檔（不 import 任何模組），不會循環
import { JEWELS, jewelValue } from './jewels.js';
import { CODEX_MILESTONES, codexProgress } from './codex.js';
import { localDateKey, generateDailyQuests, applyRunToQuest } from './quests.js';
import { WEAPONS } from './config.js';

export { STASH_CAP };

const KEY = 'gaga_save';
const VERSION = 4;

// 兩種模式的進度分開記 (最佳紀錄與關卡解鎖)，但養成完全共用：
// DNA、天賦、裝備倉庫、已解鎖特工都跨模式共享。
export const MODE_IDS = ['survivor', 'defense'];

function blank() {
  return {
    version: VERSION,
    dna: 0,                 // 局外貨幣「基因密鑰」(天賦、黑市、裝備重鑄)
    gold: 0,                // 跨局累積「特工金幣」(黑市補給、戰術興奮劑、設施升級)
    boosters: [],           // 下局出擊前啟用的戰術興奮劑清單
    stashCap: STASH_CAP,    // 倉庫容量上限 (可於黑市升級擴充)
    talents: {},            // 天賦樹等級 (基因強化)
    charLevels: {},         // 特工等級 { charId: level }，沒有記錄 = Lv1
    stash: [],              // 打寶倉庫 (最多 stashCap 件)
    jewels: {},             // 珠寶袋 { jewelId: 數量 }：撿到當下就入袋，陣亡也保留
    // 圖鑑 codex { weapons, enemies, jewels, claimed } 刻意不放在這裡：load() 是
    // { ...blank(), ...存檔 }，放了的話舊存檔會拿到空的 codex，ensureDefaults 的回填
    // （珠寶袋 → 撿過、合成過的超武 → 基礎武器取得過）永遠不會執行。由 ensureDefaults 建立。
    quests: { date: '', list: [] },   // 每日任務（依本地日期產生，跨局累積）
    runCard: null,                    // 出擊規則卡（js/runcards.js 的 id，null = 不使用）
    equipped: {},           // 已穿裝備 { slotKey: itemId }
    unlocked: { survivor: ['street'], defense: ['street'] }, // 已解鎖關卡 (依模式)
    unlockedChars: ['duck'], // 已解鎖特工
    best: { survivor: {}, defense: {} }, // { modeId: { levelId: { time, kills, cleared } } }
    character: 'duck',
    mode: 'survivor',       // 上次選的模式
    // 音量 (主選單滑桿)、口袋道具自動使用、顯示設定（傷害數字 all/crit/off、畫面震動、減少閃光）
    settings: { sfx: 1, bgm: 0.8, autoPocket: true, damageNumbers: 'all', screenShake: true, reduceFlash: false },
    daily: { date: '', bestTime: 0, completed: false },
    evolvedEver: [],            // 歷史上合成過的超武 id (合成圖鑑打勾用)
    weaponAspects: {            // Hades 武器型態配置
      kunai: 'zagreus',
      rocket: 'hestia',
      molotov: 'zagreus',
      lightning: 'zeus',
      guardian: 'zagreus',
      soccer: 'achilles',
    },
  };
}

function migrate(save) {
  // 舊版本把資料散在兩個 key，這裡一次搬進來
  const oldTime = Number(localStorage.getItem('gaga_best_time') || 0);
  if (oldTime > 0 && !save.best.survivor.street) {
    save.best.survivor.street = { time: oldTime, kills: 0, cleared: false };
  }
  const oldChar = localStorage.getItem('gaga_character');
  if (oldChar) save.character = oldChar;

  localStorage.removeItem('gaga_best_time');
  localStorage.removeItem('gaga_character');
  return save;
}

// 新版本補欄位：解鎖清單、天賦物件不存在時給預設值 (舊存檔直接升級)
function ensureDefaults(d) {
  // v3 → v4：best 與 unlocked 由「單一份」變成「依模式各一份」。
  // 舊紀錄搬進 survivor；解鎖清單兩個模式都複製一份，老玩家不會突然被鎖回第一關。
  if (Array.isArray(d.unlocked)) {
    const old = d.unlocked.length ? d.unlocked : ['street'];
    d.unlocked = { survivor: [...old], defense: [...old] };
  }
  if (!d.unlocked || typeof d.unlocked !== 'object') d.unlocked = {};
  for (const m of MODE_IDS) {
    if (!Array.isArray(d.unlocked[m])) d.unlocked[m] = ['street'];
    if (!d.unlocked[m].includes('street')) d.unlocked[m].unshift('street');
  }
  if (!d.best || typeof d.best !== 'object') d.best = {};
  // 舊的扁平 best 是 { levelId: {time,...} }，值帶 time 就代表是舊格式
  const looksFlat = Object.values(d.best).some((v) => v && typeof v === 'object' && typeof v.time === 'number');
  if (looksFlat) d.best = { survivor: d.best, defense: {} };
  for (const m of MODE_IDS) {
    if (!d.best[m] || typeof d.best[m] !== 'object') d.best[m] = {};
  }
  if (!MODE_IDS.includes(d.mode)) d.mode = 'survivor';

  // 新增關卡後修補解鎖鏈：**已經通關過的關卡，它的下一關必須是解鎖的**。
  // 為什麼需要：core 的 next 從 'endless' 改成 'subway'（這次新增三關）之後，
  // 「改版前就通關 core」的玩家不會再觸發一次 unlock，新關卡會永遠鎖著 ——
  // 玩家只會覺得「更新後什麼都沒多」，而畫面上完全沒有線索。
  for (const m of MODE_IDS) {
    for (const [levelId, rec] of Object.entries(d.best[m] || {})) {
      if (!rec || !rec.cleared) continue;
      const nxt = LEVELS[levelId] && LEVELS[levelId].next;
      if (nxt && !d.unlocked[m].includes(nxt)) d.unlocked[m].push(nxt);
    }
  }

  if (!Array.isArray(d.unlockedChars)) d.unlockedChars = ['duck'];
  if (!d.unlockedChars.includes('duck')) d.unlockedChars.unshift('duck');
  // 舊存檔已選了某特工 → 視為已擁有，避免改版後被鎖住
  if (d.character && !d.unlockedChars.includes(d.character)) d.unlockedChars.push(d.character);
  if (!d.talents || typeof d.talents !== 'object') d.talents = {};
  if (!d.charLevels || typeof d.charLevels !== 'object') d.charLevels = {};
  if (!Array.isArray(d.stash)) d.stash = [];
  if (!d.jewels || typeof d.jewels !== 'object') d.jewels = {};
  if (!d.codex || typeof d.codex !== 'object') {
    // 舊存檔補圖鑑：珠寶袋裡現有的算「撿過」、合成過的超武其基礎武器算「取得過」
    d.codex = { weapons: {}, enemies: {}, jewels: { ...d.jewels }, claimed: [] };
    for (const evo of (Array.isArray(d.evolvedEver) ? d.evolvedEver : [])) {
      for (const [id, w] of Object.entries(WEAPONS)) if (w.evoTarget === evo) d.codex.weapons[id] = 1;
    }
  }
  for (const k of ['weapons', 'enemies', 'jewels']) if (!d.codex[k] || typeof d.codex[k] !== 'object') d.codex[k] = {};
  if (!Array.isArray(d.codex.claimed)) d.codex.claimed = [];
  if (!d.quests || typeof d.quests !== 'object' || !Array.isArray(d.quests.list)) d.quests = { date: '', list: [] };
  if (!d.equipped || typeof d.equipped !== 'object') d.equipped = {};
  if (!d.daily || typeof d.daily !== 'object') d.daily = { date: '', bestTime: 0, completed: false };
  if (!Array.isArray(d.evolvedEver)) d.evolvedEver = [];
  // 已穿的裝備若已不在倉庫 (手動改存檔等情況) 就清掉，避免加成算到幽靈物品
  for (const slot of SLOT_ORDER) {
    if (d.equipped[slot] && !d.stash.some((it) => it.id === d.equipped[slot])) delete d.equipped[slot];
  }
  if (typeof d.gold !== 'number') d.gold = 0;
  if (!Array.isArray(d.boosters)) d.boosters = [];
  if (typeof d.stashCap !== 'number') d.stashCap = STASH_CAP;
  if (!d.settings || typeof d.settings !== 'object') d.settings = {};
  d.settings = { sfx: 1, bgm: 0.8, autoPocket: true, damageNumbers: 'all', screenShake: true, reduceFlash: false, ...d.settings };

  if (!d.weaponAspects || typeof d.weaponAspects !== 'object') {    d.weaponAspects = {
      kunai: 'zagreus',
      rocket: 'hestia',
      molotov: 'zagreus',
      lightning: 'zeus',
      guardian: 'zagreus',
      soccer: 'achilles',
    };
  }
  // 舊存檔展開時會把自己的 version 蓋回來，這裡收尾補正，
  // 之後真的要做版本遷移時條件才會成立
  d.version = VERSION;
  return d;
}

export const save = {
  data: blank(),

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      this.data = ensureDefaults(raw ? { ...blank(), ...JSON.parse(raw) } : migrate(blank()));
    } catch (e) {
      // 存檔壞掉不該讓遊戲開不起來，直接重來一份 ——
      // 但原始字串先備份到另一個 key：下一次 flush 就會蓋掉 KEY，不留備份等於整份進度蒸發
      try { if (raw) localStorage.setItem(`${KEY}_corrupt_backup`, raw); } catch (_) { /* 寫不進去也只能放棄 */ }
      this.data = ensureDefaults(blank());
    }
    return this.data;
  },

  flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      // 無痕模式等情境寫不進去，忽略即可
    }
  },

  set(patch) {
    Object.assign(this.data, patch);
    this.flush();
  },

  isUnlocked(levelId, modeId = this.data.mode) {
    const list = this.data.unlocked[modeId] || this.data.unlocked.survivor || [];
    return list.includes(levelId);
  },

  unlock(levelId, modeId = this.data.mode) {
    if (!levelId || this.isUnlocked(levelId, modeId)) return false;
    if (!Array.isArray(this.data.unlocked[modeId])) this.data.unlocked[modeId] = ['street'];
    this.data.unlocked[modeId].push(levelId);
    this.flush();
    return true;
  },

  // 某模式的關卡最佳紀錄 (沒打過回 undefined)
  bestOf(levelId, modeId = this.data.mode) {
    return (this.data.best[modeId] || {})[levelId];
  },

  // ----- 天賦 (基因強化) -----
  talentLevel(id) {
    return this.data.talents[id] || 0;
  },

  investTalent(id) {
    const def = TALENTS[id];
    if (!def) return { ok: false, reason: '未知天賦' };
    const lvl = this.talentLevel(id);
    if (lvl >= def.maxLevel) return { ok: false, reason: '已達最高等級' };
    const cost = talentCost(def, lvl);
    if (this.data.dna < cost) return { ok: false, reason: `DNA 不足 (需要 ${cost} 🧬)` };
    this.data.dna -= cost;
    this.data.talents[id] = lvl + 1;
    this.flush();
    return { ok: true, cost, level: lvl + 1 };
  },

  // ----- 特工等級 -----
  charLevel(id) {
    return Math.max(1, Math.min(CHAR_LEVEL.max, this.data.charLevels[id] || 1));
  },

  // 升級一名特工；times = Infinity 時一路升到錢不夠或滿級為止 (「全部升」按鈕)
  levelUpChar(id, times = 1) {
    if (!this.characterUnlocked(id)) return { ok: false, reason: '特工尚未解鎖' };
    let lvl = this.charLevel(id);
    if (lvl >= CHAR_LEVEL.max) return { ok: false, reason: '已達最高等級' };
    let gold = 0, dna = 0, gained = 0;
    while (gained < times && lvl < CHAR_LEVEL.max) {
      const c = charLevelCost(lvl);
      if (this.data.gold < c.gold || this.data.dna < c.dna) break;
      this.data.gold -= c.gold;
      this.data.dna -= c.dna;
      gold += c.gold;
      dna += c.dna;
      lvl++;
      gained++;
    }
    if (!gained) {
      const c = charLevelCost(lvl);
      return { ok: false, reason: `資源不足 (需要 ${c.gold} 🪙 + ${c.dna} 🧬)` };
    }
    this.data.charLevels[id] = lvl;
    this.flush();
    return { ok: true, level: lvl, gained, gold, dna };
  },

  // ----- 特工解鎖 -----
  characterUnlocked(id) {
    return this.data.unlockedChars.includes(id);
  },

  unlockCharacter(id, cost) {
    if (this.characterUnlocked(id)) return true;
    if (this.data.dna < cost) return false;
    this.data.dna -= cost;
    this.data.unlockedChars.push(id);
    this.flush();
    return true;
  },

  // ----- 武器型態 (Hades Aspects) -----
  setWeaponAspect(weaponId, aspectId) {
    if (!this.data.weaponAspects) this.data.weaponAspects = {};
    this.data.weaponAspects[weaponId] = aspectId;
    this.flush();
  },

  getWeaponAspect(weaponId) {
    return this.data.weaponAspects?.[weaponId] || null;
  },

  // ----- 打寶倉庫 -----
  getStashCap() {
    return this.data.stashCap || STASH_CAP;
  },

  stashFull() {
    return this.data.stash.length >= this.getStashCap();
  },

  // step / maxCap 一律由呼叫端傳 (定義在 shop.js，別在這裡放預設值造成兩處漂移)
  expandStash(step, maxCap) {
    const curr = this.getStashCap();
    if (curr >= maxCap) return false;
    this.data.stashCap = Math.min(maxCap, curr + step);
    this.flush();
    return true;
  },

  // ----- 貨幣與戰術戰備 (特工黑市) -----
  addGold(n) {
    this.data.gold = Math.max(0, (this.data.gold || 0) + Math.floor(n));
    this.flush();
    return this.data.gold;
  },

  spend(costGold = 0, costDna = 0) {
    const currGold = this.data.gold || 0;
    const currDna = this.data.dna || 0;
    if (currGold < costGold || currDna < costDna) return false;
    this.data.gold = currGold - costGold;
    this.data.dna = currDna - costDna;
    this.flush();
    return true;
  },

  hasBooster(id) {
    return this.boosterCount(id) > 0;
  },

  // 同一種興奮劑可以帶多劑（上限 MAX_BOOSTER_STACK）：這是黑市在永久天賦之外的 DNA 出口，
  // 也讓「這一局要梭多少」變成選擇。清單裡的重複項就是劑數，main.js 逐項套用即為疊加。
  boosterCount(id) {
    if (!Array.isArray(this.data.boosters)) return 0;
    return this.data.boosters.filter((b) => b === id).length;
  },

  addBooster(id) {
    if (!Array.isArray(this.data.boosters)) this.data.boosters = [];
    const count = this.boosterCount(id);
    if (count >= MAX_BOOSTER_STACK) {
      return { ok: false, reason: `已帶滿 ${MAX_BOOSTER_STACK} 劑`, count };
    }
    this.data.boosters.push(id);
    this.flush();
    return { ok: true, count: count + 1 };
  },

  consumeBoosters() {
    const active = Array.isArray(this.data.boosters) ? [...this.data.boosters] : [];
    this.data.boosters = [];
    this.flush();
    return active;
  },

  addItem(item) {
    if (this.stashFull()) return false;
    this.data.stash.push(item);
    this.flush();
    return true;
  },

  // ----- 珠寶袋 -----
  // 局內撿到就呼叫：立刻寫進 localStorage，之後陣亡／放棄任務／關閉網頁都不會丟
  addJewel(id, n = 1) {
    if (!JEWELS[id] || !(n > 0)) return false;
    this.data.jewels[id] = (this.data.jewels[id] || 0) + n;
    this.data.codex.jewels[id] = (this.data.codex.jewels[id] || 0) + n;   // 圖鑑：歷史累計
    this.flush();
    return true;
  },

  jewelCount(id) {
    return this.data.jewels[id] || 0;
  },

  // 賣出：id 為 null 時整袋賣掉；count 省略時賣掉該種全部。回傳 { ok, count, gold, dna }
  sellJewels(id = null, count = Infinity) {
    const bag = {};
    const ids = id ? [id] : Object.keys(this.data.jewels);
    for (const k of ids) {
      const have = this.data.jewels[k] || 0;
      const n = Math.min(have, count);
      if (JEWELS[k] && n > 0) bag[k] = n;
    }
    const sold = Object.values(bag).reduce((a, b) => a + b, 0);
    if (sold === 0) return { ok: false, reason: '沒有可以賣的珠寶', count: 0, gold: 0, dna: 0 };
    const { gold, dna } = jewelValue(bag);
    for (const [k, n] of Object.entries(bag)) {
      this.data.jewels[k] -= n;
      if (this.data.jewels[k] <= 0) delete this.data.jewels[k];
    }
    this.data.gold = (this.data.gold || 0) + gold;
    this.data.dna += dna;
    this.flush();
    return { ok: true, count: sold, gold, dna };
  },

  // ----- 圖鑑 -----
  // 每局結算寫一次：本局取得過的武器 id、各敵人類型的擊殺數
  recordCodex({ weapons = [], kills = {} } = {}) {
    const c = this.data.codex;
    for (const id of weapons) if (WEAPONS[id] && !WEAPONS[id].isEvo) c.weapons[id] = 1;
    for (const [type, n] of Object.entries(kills)) if (n > 0) c.enemies[type] = (c.enemies[type] || 0) + n;
    this.flush();
  },

  // 領收集里程碑（index = CODEX_MILESTONES 的第幾個）
  claimCodexMilestone(i) {
    const m = CODEX_MILESTONES[i];
    if (!m) return { ok: false, reason: '沒有這個里程碑' };
    if (this.data.codex.claimed.includes(i)) return { ok: false, reason: '已經領過了' };
    const prog = codexProgress(this.data);
    if (prog.pct + 1e-9 < m.pct) return { ok: false, reason: `收集進度未達 ${Math.round(m.pct * 100)}%` };
    this.data.codex.claimed.push(i);
    this.data.gold = (this.data.gold || 0) + m.gold;
    this.data.dna += m.dna;
    this.flush();
    return { ok: true, gold: m.gold, dna: m.dna };
  },

  // ----- 每日任務 -----
  // 換日就重新產生（同一天永遠同一組）；回傳當天的任務清單
  dailyQuests(dateKey = localDateKey()) {
    if (this.data.quests.date !== dateKey) {
      this.data.quests = { date: dateKey, list: generateDailyQuests(dateKey) };
      this.flush();
    }
    return this.data.quests.list;
  },

  // 每局結算：把本局數據累加進當天的任務（已領過的不再動）
  progressQuests(run, dateKey = localDateKey()) {
    const list = this.dailyQuests(dateKey);
    for (const q of list) if (!q.claimed) applyRunToQuest(q, run);
    this.flush();
    return list;
  },

  claimQuest(i, dateKey = localDateKey()) {
    const q = this.dailyQuests(dateKey)[i];
    if (!q) return { ok: false, reason: '沒有這個任務' };
    if (q.claimed) return { ok: false, reason: '已經領過了' };
    if (q.progress < q.target) return { ok: false, reason: '任務尚未完成' };
    q.claimed = true;
    this.data.gold = (this.data.gold || 0) + q.gold;
    this.data.dna += q.dna;
    this.flush();
    return { ok: true, gold: q.gold, dna: q.dna };
  },

  // 分解單件：換 DNA＋金幣。正穿著的要先脫下，避免手滑把主力裝拆了
  // 回傳 { ok, gold, dna }；ok:false 時 reason 說明原因
  salvageItem(id) {
    const item = this.data.stash.find((it) => it.id === id);
    if (!item) return { ok: false, reason: '物品不存在', gold: 0, dna: 0 };
    if (Object.values(this.data.equipped).includes(id)) {
      return { ok: false, reason: '這件正穿在身上，要先脫下才能分解', gold: 0, dna: 0 };
    }

    const dna = salvageValue(item);
    const gold = salvageGold(item);
    this.data.stash = this.data.stash.filter((it) => it.id !== id);
    this.data.dna += dna;
    this.data.gold = (this.data.gold || 0) + gold;
    this.flush();
    return { ok: true, gold, dna };
  },

  // 重鑄：花 DNA 把一件裝備的詞條整組重骰 (穿在身上也可以，下一場生效)
  reforgeItem(id) {
    const item = this.data.stash.find((it) => it.id === id);
    if (!item) return { ok: false, reason: '物品不存在' };
    const cost = reforgeCost(item);
    if (cost === null) return { ok: false, reason: '普通裝備沒有詞條可以重鑄' };
    if (this.data.dna < cost) return { ok: false, reason: `DNA 不足：重鑄需要 ${cost} 🧬` };
    this.data.dna -= cost;
    rerollAffixes(item);
    this.flush();
    return { ok: true, cost };
  },

  // 批次分解某稀有度 (略過已裝備的)
  salvageAll(rarity) {
    const worn = new Set(Object.values(this.data.equipped));
    const targets = this.data.stash.filter((it) => it.rarity === rarity && !worn.has(it.id));
    if (targets.length === 0) return { count: 0, dna: 0, gold: 0 };

    const dna = targets.reduce((sum, it) => sum + salvageValue(it), 0);
    const gold = targets.reduce((sum, it) => sum + salvageGold(it), 0);
    const ids = new Set(targets.map((it) => it.id));
    this.data.stash = this.data.stash.filter((it) => !ids.has(it.id));
    this.data.dna += dna;
    this.data.gold = (this.data.gold || 0) + gold;
    this.flush();
    return { count: targets.length, dna, gold };
  },

  // 三合一升階：消耗 DNA 將 3 件同部位同稀有度裝備合成為高一階裝備
  fuseItems(ids) {
    if (!Array.isArray(ids) || ids.length !== 3) {
      return { ok: false, reason: '請選擇 3 件裝備進行合成' };
    }
    const items = ids.map((id) => this.data.stash.find((it) => it.id === id));
    if (items.some((it) => !it)) {
      return { ok: false, reason: '選取的裝備不存在或已不在倉庫' };
    }
    const wornIds = new Set(Object.values(this.data.equipped));
    if (items.some((it) => wornIds.has(it.id))) {
      return { ok: false, reason: '穿戴中的裝備無法進行合成，請先脫下' };
    }
    const rarity = items[0].rarity;
    const cost = FUSION_COST[rarity];
    if (cost === undefined) {
      return { ok: false, reason: '該稀有度無法升階' };
    }
    if (this.data.dna < cost) {
      return { ok: false, reason: `DNA 不足：合成需要 ${cost} 🧬` };
    }

    const fuseRes = fuseItems(items);
    if (!fuseRes.ok) {
      return fuseRes;
    }

    this.data.dna -= cost;
    const removeIds = new Set(ids);
    this.data.stash = this.data.stash.filter((it) => !removeIds.has(it.id));
    this.data.stash.push(fuseRes.item);
    this.flush();

    return { ok: true, item: fuseRes.item, cost };
  },

  equipItem(id) {
    const item = this.data.stash.find((it) => it.id === id);
    if (!item) return false;
    this.data.equipped[item.slot] = id;
    this.flush();
    return true;
  },

  unequipSlot(slot) {
    if (!this.data.equipped[slot]) return false;
    delete this.data.equipped[slot];
    this.flush();
    return true;
  },

  // 已解鎖的武器（升級卡「新武器」的卡池）：起始兩把 + 任一模式通關過的關卡的 rewardWeapon。
  // 由通關紀錄推導而不另存，舊存檔已通關的關卡自動補發。
  unlockedWeapons() {
    const set = new Set(STARTER_WEAPONS);
    for (const m of MODE_IDS) {
      for (const [levelId, rec] of Object.entries(this.data.best[m] || {})) {
        const w = rec && rec.cleared && LEVELS[levelId] && LEVELS[levelId].rewardWeapon;
        if (w) set.add(w);
      }
    }
    return set;
  },

  // 單局結算：回傳這場拿到多少 DNA 與金幣、是否破紀錄、是否解鎖新關卡／新武器
  // skipProgress=true (每日挑戰) 時只發 DNA/金幣，不寫該關最佳紀錄、不解鎖下一關
  recordRun(levelId, { time, kills, level, cleared, dnaMult = 1, nextLevel = null, skipProgress = false, modeId = 'survivor', gold = 0 }) {
    const dna = Math.max(1, Math.round((time / 10 + kills / 20 + level * 2) * dnaMult * (cleared ? 1.5 : 1)));
    const runGold = Math.max(0, Math.floor(gold));
    this.data.dna += dna;
    this.data.gold = (this.data.gold || 0) + runGold;

    if (!skipProgress) {
      const weaponsBefore = this.unlockedWeapons();
      if (!this.data.best[modeId]) this.data.best[modeId] = {};
      const prev = this.data.best[modeId][levelId];
      const isRecord = !prev || time > prev.time;
      this.data.best[modeId][levelId] = {
        time: Math.max(time, prev ? prev.time : 0),
        kills: Math.max(kills, prev ? prev.kills : 0),
        cleared: cleared || (prev ? prev.cleared : false),
      };

      const unlockedNew = cleared ? this.unlock(nextLevel, modeId) : false;
      const w = LEVELS[levelId] && LEVELS[levelId].rewardWeapon;
      const unlockedWeapon = w && !weaponsBefore.has(w) && this.unlockedWeapons().has(w) ? w : null;
      this.flush();
      return { dna, isRecord, unlockedNew, unlockedWeapon };
    }
    this.flush();
    return { dna, isRecord: false, unlockedNew: false, unlockedWeapon: null };
  },

  recordDailyRun({ date, time, cleared }) {
    if (!this.data.daily) this.data.daily = { date: '', bestTime: 0, completed: false };
    if (this.data.daily.date !== date) {
      this.data.daily = { date, bestTime: time, completed: cleared };
    } else {
      this.data.daily.bestTime = Math.max(this.data.daily.bestTime, time);
      if (cleared) this.data.daily.completed = true;
    }
    this.flush();
    return this.data.daily;
  },

  // 記錄合成過的超武 (圖鑑 ★ 標記，跨局保留)
  markEvolved(evoId) {
    if (!this.data.evolvedEver) this.data.evolvedEver = [];
    if (!this.data.evolvedEver.includes(evoId)) {
      this.data.evolvedEver.push(evoId);
      this.flush();
    }
  },
};

