// 局外存檔層：整份進度存在單一 localStorage key，其他系統一律走這裡讀寫。

const KEY = 'gaga_save';
const VERSION = 1;

function blank() {
  return {
    version: VERSION,
    dna: 0,                 // 局外貨幣「基因密鑰」(局內金幣只用於砲塔等戰場消耗)
    talents: {},            // 天賦樹等級 (Phase F)
    equipment: {},          // 裝備工坊 (Phase G)
    unlocked: ['street'],   // 已解鎖關卡
    best: {},               // { levelId: { time, kills, cleared } }
    character: 'duck',
  };
}

function migrate(save) {
  // 舊版本把資料散在兩個 key，這裡一次搬進來
  const oldTime = Number(localStorage.getItem('gaga_best_time') || 0);
  if (oldTime > 0 && !save.best.street) {
    save.best.street = { time: oldTime, kills: 0, cleared: false };
  }
  const oldChar = localStorage.getItem('gaga_character');
  if (oldChar) save.character = oldChar;

  localStorage.removeItem('gaga_best_time');
  localStorage.removeItem('gaga_character');
  return save;
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

  isUnlocked(levelId) {
    return this.data.unlocked.includes(levelId);
  },

  unlock(levelId) {
    if (!levelId || this.isUnlocked(levelId)) return false;
    this.data.unlocked.push(levelId);
    this.flush();
    return true;
  },

  // 單局結算：回傳這場拿到多少 DNA、是否破紀錄、是否解鎖新關卡
  recordRun(levelId, { time, kills, level, cleared, dnaMult = 1, nextLevel = null }) {
    const dna = Math.max(1, Math.round((time / 10 + kills / 20 + level * 2) * dnaMult * (cleared ? 1.5 : 1)));
    this.data.dna += dna;

    const prev = this.data.best[levelId];
    const isRecord = !prev || time > prev.time;
    this.data.best[levelId] = {
      time: Math.max(time, prev ? prev.time : 0),
      kills: Math.max(kills, prev ? prev.kills : 0),
      cleared: cleared || (prev ? prev.cleared : false),
    };

    const unlockedNew = cleared ? this.unlock(nextLevel) : false;
    this.flush();
    return { dna, isRecord, unlockedNew };
  },
};
