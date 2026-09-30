// 依「關卡」為鍵的快取，容量滿了淘汰最久沒用到的關卡。
//
// 為什麼需要這一層：地表磚（1024² ≈ 4 MB）、宏觀地形層（約 2.2~2.8 MB）、
// 隨時間劣化的磚（512² ≈ 1 MB）都是以關卡 id 為鍵、烘一次就很貴的快取。
// 它們原本只增不減 —— 同一關重複玩完全沒差（命中率高、又省下重烘），
// 但同一個分頁把 11 關都玩過就會累積到 80 MB 以上，低階手機會有感。
//
// 保留最近 N 關的理由：實際遊玩順序是「一關重複打、偶爾換關」，
// 保留 3 關足以讓「重開同一關」與「連續打下一關」都完全命中，
// 同時把上限從 11 關壓到 3 關。
//
// 這裡刻意不做定時淘汰、也不做内存壓力監聽：容量本身已經把上限鎖死，
// 再加機制只會增加行為的不確定性（例如玩到一半被清掉而重烘，造成掉幀）。

export const LEVEL_CACHE_KEEP = 3;

export class LevelCache {
  constructor(keep = LEVEL_CACHE_KEEP) {
    this.keep = Math.max(1, keep);
    // Map 的迭代順序就是插入順序，拿來當 LRU 佇列用（重新 set 會移到尾端）
    this.map = new Map();
    // 淘汰時要順手釋放的資源（例如標記給 GC 以外的清理）
    this.onEvict = null;
  }

  has(id) {
    return this.map.has(id);
  }

  get(id) {
    if (!this.map.has(id)) return undefined;
    const v = this.map.get(id);
    // 命中就移到尾端 = 標記為最近使用
    this.map.delete(id);
    this.map.set(id, v);
    return v;
  }

  set(id, value) {
    if (this.map.has(id)) this.map.delete(id);
    this.map.set(id, value);
    this._trim();
    return value;
  }

  // 主動作廢某一關的磚（例如高解析度 PNG 地表載入完成後，要丟掉先前程序化烘出來的磚，
  // 下一幀才會改用 PNG）。淘汰回呼要照樣通知，否則貼圖資源不會被釋放。
  // 這裡漏掉的話呼叫端會拋 TypeError，而且是在 img.onload 裡 —— 例外會直接變成
  // 未捕捉錯誤，載入時每一張地表 PNG 各噴一次。
  delete(id) {
    if (!this.map.has(id)) return false;
    const value = this.map.get(id);
    this.map.delete(id);
    if (this.onEvict) {
      try { this.onEvict(id, value); } catch (e) { /* 同 _trim */ }
    }
    return true;
  }

  // 只回傳已存在或由 factory 產生的值，呼叫端不必自己寫 has/get/set 三段
  ensure(id, factory) {
    const hit = this.get(id);
    if (hit !== undefined) return hit;
    return this.set(id, factory());
  }

  _trim() {
    while (this.map.size > this.keep) {
      const oldest = this.map.keys().next().value;
      const value = this.map.get(oldest);
      this.map.delete(oldest);
      if (this.onEvict) {
        try { this.onEvict(oldest, value); } catch (e) { /* 淘汰失敗不該影響遊戲 */ }
      }
    }
  }

  get size() {
    return this.map.size;
  }

  get keys() {
    return [...this.map.keys()];
  }

  clear() {
    for (const [id, value] of this.map) {
      if (this.onEvict) {
        try { this.onEvict(id, value); } catch (e) { /* 同上 */ }
      }
    }
    this.map.clear();
  }
}
