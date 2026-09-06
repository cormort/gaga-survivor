// 局外存檔層：整份進度存在單一 localStorage key，其他系統一律走這裡讀寫。

import { TALENTS, talentCost } from './meta.js';
import { SLOT_ORDER, salvageValue, reforgeCost, rerollAffixes, FUSION_COST, fuseItems } from './items.js';

export const STASH_CAP = 30;

const KEY = 'gaga_save';
const VERSION = 4;

// 兩種模式的進度分開記 (最佳紀錄與關卡解鎖)，但養成完全共用：
// DNA、天賦、裝備倉庫、已解鎖特工都跨模式共享。
export const MODE_IDS = ['survivor', 'defense'];

function blank() {
  return {
    version: VERSION,
    dna: 0,                 // 局外貨幣「基因密鑰」(局內金幣只用於砲塔等戰場消耗)
    talents: {},            // 天賦樹等級 (基因強化)
    stash: [],              // 打寶倉庫 (最多 STASH_CAP 件)
    equipped: {},           // 已穿裝備 { slotKey: itemId }
    unlocked: { survivor: ['street'], defense: ['street'] }, // 已解鎖關卡 (依模式)
    unlockedChars: ['duck'], // 已解鎖特工
    best: { survivor: {}, defense: {} }, // { modeId: { levelId: { time, kills, cleared } } }
    character: 'duck',
    mode: 'survivor',       // 上次選的模式
    settings: { sfx: 1, bgm: 0.8 }, // 音量 (主選單滑桿)
    daily: { date: '', bestTime: 0, completed: false },
    evolvedEver: [],            // 歷史上合成過的超武 id (合成圖鑑打勾用)
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

  if (!Array.isArray(d.unlockedChars)) d.unlockedChars = ['duck'];
  if (!d.unlockedChars.includes('duck')) d.unlockedChars.unshift('duck');
  // 舊存檔已選了某特工 → 視為已擁有，避免改版後被鎖住
  if (d.character && !d.unlockedChars.includes(d.character)) d.unlockedChars.push(d.character);
  if (!d.talents || typeof d.talents !== 'object') d.talents = {};
  if (!Array.isArray(d.stash)) d.stash = [];
  if (!d.equipped || typeof d.equipped !== 'object') d.equipped = {};
  if (!d.daily || typeof d.daily !== 'object') d.daily = { date: '', bestTime: 0, completed: false };
  if (!Array.isArray(d.evolvedEver)) d.evolvedEver = [];
  // 已穿的裝備若已不在倉庫 (手動改存檔等情況) 就清掉，避免加成算到幽靈物品
  for (const slot of SLOT_ORDER) {
    if (d.equipped[slot] && !d.stash.some((it) => it.id === d.equipped[slot])) delete d.equipped[slot];
  }
  if (!d.settings || typeof d.settings !== 'object') d.settings = {};
  d.settings = { sfx: 1, bgm: 0.8, ...d.settings };
  // 舊存檔展開時會把自己的 version 蓋回來，這裡收尾補正，
  // 之後真的要做版本遷移時條件才會成立
  d.version = VERSION;
  return d;
}

export const save = {
  data: blank(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? { ...blank(), ...JSON.parse(raw) } : migrate(blank());
    } catch (e) {
      // 存檔壞掉不該讓遊戲開不起來，直接重來一份
      this.data = blank();
    }
    ensureDefaults(this.data);
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

  // ----- 打寶倉庫 -----
  stashFull() {
    return this.data.stash.length >= STASH_CAP;
  },

  addItem(item) {
    if (this.stashFull()) return false;
    this.data.stash.push(item);
    this.flush();
    return true;
  },

  // 分解單件：換 DNA。正穿著的要先脫下，避免手滑把主力裝拆了
  salvageItem(id) {
    const item = this.data.stash.find((it) => it.id === id);
    if (!item) return 0;
    if (Object.values(this.data.equipped).includes(id)) return -1;

    const dna = salvageValue(item);
    this.data.stash = this.data.stash.filter((it) => it.id !== id);
    this.data.dna += dna;
    this.flush();
    return dna;
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
    if (targets.length === 0) return { count: 0, dna: 0 };

    const dna = targets.reduce((sum, it) => sum + salvageValue(it), 0);
    const ids = new Set(targets.map((it) => it.id));
    this.data.stash = this.data.stash.filter((it) => !ids.has(it.id));
    this.data.dna += dna;
    this.flush();
    return { count: targets.length, dna };
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

  // 單局結算：回傳這場拿到多少 DNA、是否破紀錄、是否解鎖新關卡
  // skipProgress=true (每日挑戰) 時只發 DNA，不寫該關最佳紀錄、不解鎖下一關
  recordRun(levelId, { time, kills, level, cleared, dnaMult = 1, nextLevel = null, skipProgress = false, modeId = 'survivor' }) {
    const dna = Math.max(1, Math.round((time / 10 + kills / 20 + level * 2) * dnaMult * (cleared ? 1.5 : 1)));
    this.data.dna += dna;

    if (!skipProgress) {
      if (!this.data.best[modeId]) this.data.best[modeId] = {};
      const prev = this.data.best[modeId][levelId];
      const isRecord = !prev || time > prev.time;
      this.data.best[modeId][levelId] = {
        time: Math.max(time, prev ? prev.time : 0),
        kills: Math.max(kills, prev ? prev.kills : 0),
        cleared: cleared || (prev ? prev.cleared : false),
      };

      const unlockedNew = cleared ? this.unlock(nextLevel, modeId) : false;
      this.flush();
      return { dna, isRecord, unlockedNew };
    }
    this.flush();
    return { dna, isRecord: false, unlockedNew: false };
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

