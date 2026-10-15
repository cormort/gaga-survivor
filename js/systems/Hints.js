// 新手引導：每個系統第一次出現時，跳一次說明（記在存檔，之後永遠不再跳）。
// 不把系統鎖起來逐關開放 —— 那會連老玩家已經在用的東西一起藏掉；改成「第一次碰到才教」，
// 一次只教一樣。延遲 1.2 秒（局內時間）才說，避免蓋掉事件本身的提示。
import { save } from '../save.js';

const HINTS = {
  blessing: '神聖祝福：三選一的局內加成，有些附帶代價。挑跟你目前武器搭的那一個',
  merchant: '流浪商人：走過去碰到他就能用金幣買東西，他待一陣子就會離開',
  altar: '挑戰祭壇：站上去會召喚精英怪，限時打完就掉物資箱；不想冒險可以不理它',
  event: '突發事件：一段時間內規則改變（例如金幣加倍、怪變多），留意畫面上的倒數',
  pocket: '口袋道具：按 E／F（或點 HUD 的 🎒）使用；預設會在危急時自動使用，可在設定關掉',
};

export function showHint(game, key) {
  const text = HINTS[key];
  if (!text || !save.data) return;
  const seen = save.data.hintsSeen || (save.data.hintsSeen = {});
  if (seen[key]) return;
  seen[key] = 1;
  save.flush();
  const say = () => game.ui.say(`💡 ${text}`, '#9be37a', 6);
  if (game.weaponManager?.schedule) game.weaponManager.schedule(1.2, say);
  else say();
}
