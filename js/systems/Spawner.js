// 怪物生成器：完全照關卡資料 (js/levels.js) 的波次與 Boss 排程操課。
// 無盡模式 (endless) 是唯一例外：波次間隔/數量隨時間成長，Boss 固定 90 秒輪播。

import { Enemy } from '../entities/Enemy.js';
import { LEVELS, OPENING, openingFactor, currentWave, pickEnemy, enemyScale, RULE_DEFAULTS, ENDLESS_BOSS_CYCLE, ENDLESS_BOSS_INTERVAL, endlessBossInterval, spawnRate } from '../levels.js';
import { worldBounds } from '../config.js';
import { elementOf, rollEliteAffix } from '../config.js';
import { hasSprite } from '../sprites.js';

// 場上敵人硬上限（main.js 的孵化／裂解上限由 spawner.maxEnemies 推導）。
// 250 → 450：實測（CPU 降速 4 倍模擬中低階手機）600 隻的遊戲邏輯每幀 7.2ms、
// 每隻畫面內的敵人只多 1 次 drawImage，效能不是瓶頸。
// 裝置真的跟不上時，自適應效能的最後一階會把上限降到 LOW_END_MAX_ENEMIES（main.js _adaptDpr）。
export const MAX_ENEMIES = 450;
export const LOW_END_MAX_ENEMIES = 300;

// 動態難度：固定的時間曲線追不上玩家輸出（實測 2→20 分鐘成長數百倍，而且因人而異），
// 一旦火力過門檻，雜兵全部死在半路 —— 難度是「階梯」而不是曲線。
// 這裡量雜兵「生成 → 死亡」的平均存活秒數，太短就提高之後生成的雜兵血量，
// 夠長就慢慢降回來；只會往上加（下限 = 原本的時間曲線），經驗與金幣不變。
export const ADAPTIVE = {
  targetLife: 3.2,   // 希望雜兵平均能活這麼久（≈ 從生成距離走到玩家面前）
  relaxLife: 4.8,    // 平均活超過這麼久才開始往下調
  rise: 0.06,        // 每秒最多 +6%（約 12 秒翻倍）
  fall: 0.03,        // 每秒最多 -3%
  max: 40,
  ema: 0.15,         // 單筆死亡對平均的權重
};

export class Spawner {
  constructor() {
    this.maxEnemies = MAX_ENEMIES;   // 目前生效的上限（低階裝置會被自適應效能調低）
    this.setLevel('street');
  }

  setLevel(levelId, rules = RULE_DEFAULTS) {
    this.level = LEVELS[levelId] || LEVELS.street;
    this.rules = rules;
    // 開局體檢：關卡的 Boss skin 必須真的有對應的 sprite。
    // 為什麼要出聲：`getSprite()` 對未知 key 會**靜默退回 walker**（見 sprites.js 的說明），
    // 所以打錯 skin 的後果是「最終首領長成一隻普通殭屍」而不是任何錯誤訊息 ——
    // 新增關卡時最容易踩到的就是這個（Decor 對裝飾 key 也有一樣的檢查）。
    for (const b of this.level.bosses || []) {
      if (b.skin && !hasSprite(b.skin)) {
        console.warn(`[Spawner] 關卡 ${this.level.id} 的 Boss skin 不存在，會退回 walker：${b.skin}`);
      }
    }
    this.reset();
  }

  reset() {
    this.spawnTimer = 0;
    this.adaptiveHpMul = 1;
    this._lifeAvg = ADAPTIVE.targetLife;
    this._adaptTick = 0;
    this._sinceKill = 0;
    this.bossIndex = 0;         // 下一隻要生的 Boss 在 level.bosses 的位置 (一般關卡)
    this.bossRef = null;
    this.endlessBossIdx = 0;    // 無盡模式的 Boss 輪播指標
    this.nextEndlessBossAt = ENDLESS_BOSS_INTERVAL; // 開場 90 秒後第一隻
  }

  // 雜兵死亡時由主迴圈回報 (Boss、召喚/孵化的小怪沒有 spawnTime，不列入)
  reportDeath(enemy, gameTime) {
    if (enemy.isBoss || enemy.spawnTime == null) return;
    const life = gameTime - enemy.spawnTime;
    this._lifeAvg += (life - this._lifeAvg) * ADAPTIVE.ema;
    this._sinceKill = 0;
  }

  updateAdaptive(dt) {
    this._sinceKill += dt;
    // 很久沒有擊殺 = 雜兵活得夠久，視同存活時間拉長
    if (this._sinceKill > 3) this._lifeAvg += (ADAPTIVE.relaxLife + 1 - this._lifeAvg) * Math.min(1, dt * 0.5);
    this._adaptTick += dt;
    if (this._adaptTick < 0.5) return;
    const step = this._adaptTick;
    this._adaptTick = 0;
    if (this._lifeAvg < ADAPTIVE.targetLife) {
      const k = (ADAPTIVE.targetLife - this._lifeAvg) / ADAPTIVE.targetLife;   // 0~1，死得越快加越多
      this.adaptiveHpMul = Math.min(ADAPTIVE.max, this.adaptiveHpMul * (1 + ADAPTIVE.rise * step * (0.3 + k)));
    } else if (this._lifeAvg > ADAPTIVE.relaxLife) {
      this.adaptiveHpMul = Math.max(1, this.adaptiveHpMul * (1 - ADAPTIVE.fall * step));
    }
  }

  update(dt, gameTime, player, enemies, onBossSpawnCallback = null) {
    const level = this.level;
    if (level.td) return;   // 守塔關：波次與首領由 TowerDefense 控制；強度只看波數，不跑動態難度
    this.updateAdaptive(dt);

    // 雜兵血量與傷害隨時間、關卡難度成長 (公式集中在 levels.js)。
    // 提到最前面算：首領生成也要吃到同一份係數（屬性壓力 elem 與關卡 levelId）。
    const scale = enemyScale(gameTime, level, this.rules);

    // Boss 排程：無盡模式 = 固定週期輪播深淵 Boss；一般關卡 = 時間表
    if (level.id === 'endless') {
      if (gameTime >= this.nextEndlessBossAt) {
        this.nextEndlessBossAt = gameTime + endlessBossInterval(gameTime);
        const def = ENDLESS_BOSS_CYCLE[this.endlessBossIdx % ENDLESS_BOSS_CYCLE.length];
        this.endlessBossIdx++;
        // 血量與時俱進，名稱加「深淵·」前綴區隔；剝掉 final 旗標避免被誤判為通關
        this.spawnBoss(
          { ...def, final: false, hp: Math.round(def.hp * (1 + gameTime / 350)), name: '深淵·' + def.name },
          player, enemies, onBossSpawnCallback, scale
        );
      }
    } else {
      const nextBoss = level.bosses[this.bossIndex];
      if (nextBoss && gameTime >= nextBoss.at) {
        this.bossIndex++;
        this.spawnBoss(nextBoss, player, enemies, onBossSpawnCallback, scale);
      }
    }

    // 一般波次
    this.spawnTimer += dt;
    const wave = currentWave(level, gameTime);

    // 生成率（隻／秒）是這一輪的主要旋鈕，不再是 interval / batch 各自跳。
    // 為什麼：波次表的 interval / batch 是分段常數，邊界直接跳 —— street 第 6 分鐘
    // 2.22 → 6.67 隻/秒（+200%）、第 8 分鐘再跳 +131%，敵人數就在那一分鐘從幾十隻
    // 衝到幾百隻。這是「怪潮毫無預警湧上來」的真正來源（見 levels.js 的 spawnRate / nominalSpawnRate）。
    //
    // batch 維持整數（一次生幾隻是離散的），由 interval 吸收內插：率連續，數量就不會一跳。
    const rules = this.rules || RULE_DEFAULTS;
    let batch = wave.batch;
    if (level.id === 'endless') {
      batch = 1 + Math.min(5, Math.floor(gameTime / 150));
    }
    // 由平滑後的「率」回推間隔。rate <= 0 只可能在關卡資料壞掉時發生，
    // 那時退回這一波原本的 interval（不要讓整個生成器停擺）。
    const rate = spawnRate(level, gameTime);
    let interval = rate > 0 ? Math.max(0.05, batch / rate) : wave.interval;

    // 生成密度：直接縮短間隔 (關卡規則 / 每日詞綴共用)
    interval /= rules.spawnMul;
    // 開局怪少：前期拉長生成間隔（所有關卡含無盡模式）
    interval *= 1 + (OPENING.sparse - 1) * openingFactor(gameTime);

    if (this.spawnTimer < interval) return;
    this.spawnTimer = 0;

    if (enemies.length >= this.maxEnemies) return;

    scale.hp *= this.adaptiveHpMul;
    for (let i = 0; i < batch; i++) {
      // 生成距離隨時間縮短 (520 → 440)：後期玩家的清場半徑遠大於此，
      // 生得太遠等於「還沒靠近就被打掉」，威脅永遠傳不到玩家身上。
      // 但下限不能太低 —— 原本 340 在世界座標下已經落在 1280×720 視野內
      // (半對角線約 735)，後期怪物會直接在玩家眼前冒出來。
      const spawnDist = Math.max(440, 520 - gameTime * 0.12) + Math.random() * 120;
      const pos = this.getSpawnPosition(player, spawnDist);
      const e = new Enemy(pickEnemy(wave.pool), pos.x, pos.y, scale);
      e.spawnTime = gameTime;
      this.rollElite(e, gameTime);
      enemies.push(e);
      // 每一隻都要檢查上限：原本只在迴圈外檢查一次，batch 5 時實際上限是 254，
      // 而孵化上限是從名目上限推導的
      if (enemies.length >= this.maxEnemies) break;
    }
  }

  // 精英詞綴：機率隨時間從 3.5% 緩升到 10% (Boss 與召喚小怪不套用)
  rollElite(enemy, gameTime) {
    if (enemy.isBoss) return;
    // 原本 gameTime/9000 要 150 分鐘才到上限，8 分鐘只有 4% —— 一局打完幾乎看不到
    // 精英，ELITE_AFFIXES 的四種詞綴等於閒置。改成 90 秒到 8%、約 5 分半到頂。
    const chance = Math.min(0.12, 0.035 + gameTime / 2000) * (this.rules || RULE_DEFAULTS).eliteChanceMul;
    if (Math.random() >= chance) return;
    enemy.makeElite(rollEliteAffix());
  }

  spawnBoss(def, player, enemies, onBossSpawnCallback, scale = null) {
    const pos = this.getSpawnPosition(player, 550);
    const boss = new Enemy('boss', pos.x, pos.y);
    boss.maxHp = boss.hp = def.hp;
    boss.name = def.name;
    // 首領的屬性：關卡資料可以指定 def.element（沒有就用 ENEMY_ELEMENTS 的預設）。
    // 首領生成不走 new Enemy(typeKey, ..., scale)，所以這兩行要在這裡補 ——
    // 少了 elementPotency，首領的屬性傷害會永遠停在 ×1，後期等於沒有屬性。
    if (def.element) boss.element = elementOf(def.element).id;
    boss.elementPotency = (scale && scale.elem) || 1;
    // 關卡主題外觀：一般 Boss 用該關皮膚，最終 Boss 換更大號的「最終」變體
    boss.skin = def.skin ? (def.final ? def.skin + '_final' : def.skin) : undefined;
    // 關卡專屬技能：charge 內建衝鋒，額外技能由 def.behaviors 帶入
    boss.behaviors = Array.isArray(def.behaviors) && def.behaviors.length > 0 ? def.behaviors.slice() : [];
    boss.skillTimer = 4 + Math.random() * 2;
    // 每隻 Boss 的移動與傷害由關卡資料決定。原本 12 隻 Boss 全部共用
    // ENEMY_TYPES.boss 的同一組 speed 75 / damage 28 / radius 40，彼此只差
    // 血量與技能子集 —— 「冰霜機甲」和「極地穿山甲王」打起來一模一樣。
    if (def.speed) boss.speed = def.speed;
    if (def.damage) boss.damage = def.damage;

    if (def.final) {
      boss.isFinal = true;
      boss.radius *= 1.25;
      boss.damage = Math.round(boss.damage * 1.4);
    }

    enemies.push(boss);
    this.bossRef = boss;
    if (onBossSpawnCallback) onBossSpawnCallback(boss);
  }

  getSpawnPosition(player, distance) {
    const b = worldBounds();   // 無限地圖時是 ±Infinity，夾範圍自動失效
    const margin = 60;
    // 生成點要夾回世界邊界內 (不然怪會生在紅牆外走不進來)，但直接夾會讓貼著角落的
    // 玩家旁邊瞬間冒出怪 —— 改成換角度重抽，抽不到就取這幾次裡離玩家最遠的那個點。
    const minDist = distance * 0.6;
    let best = null;
    let bestDist = -1;

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Math.max(b.minX + margin, Math.min(b.maxX - margin, player.x + Math.cos(angle) * distance));
      const y = Math.max(b.minY + margin, Math.min(b.maxY - margin, player.y + Math.sin(angle) * distance));
      const d = Math.hypot(x - player.x, y - player.y);
      if (d >= minDist) return { x, y };
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }
}
