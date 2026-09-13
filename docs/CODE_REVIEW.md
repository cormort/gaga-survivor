# 整體 Code Review — gaga-survivor

**受檢版本**：`30b407f`（main，2025 本地 checkout）
**受檢範圍**：`index.html`、`css/style.css`、`js/**` 全部 20,368 行
**產出方式**：五個獨立 reviewer 平行深讀不同模組 + 主審逐條複核
**複核原則**：reviewer 的每一條結論都由主審回到程式碼實際驗證；**未通過複核的一律標記，不當成事實**（見 §5）

**基線實測**（改動前，供後續 A/B 對照）

| 項目 | 結果 |
| :--- | :--- |
| `tools/smoke-branches.mjs` | ✅ 56 個分支全部通過，離開碼 0（禮包碼移除後為 51） |
| `tools/perf-probe.mjs` 每幀繪圖指令 | idle 68 / mobs 573 / burn 1786 / burn5 4209 / drops 636 |
| `tools/perf-probe.mjs` 每幀色彩字串 | idle 10 / mobs 16 / burn 16 / **burn5 499** / drops 15 |
| `tools/perf-probe.mjs` renderMs | idle 0.1 / mobs 9.7 / burn 13.1 / **burn5 17.1** / drops 8.4 |

**計數背景**：13 種敵人（12 雜兵 + Boss）、8 把基礎/原型武器 + 8 把超武、53 個 sprite key（37 靜態 + 16 程序生成 Boss）、15 個祝福、6 個商人商品、6 組協同、15 組 Boss 技能定義。

---

## 1. 「地形與敵人單調」的根因（本次最優先）

這一節回答「為什麼玩起來單調」。結論是：**這不是美術量不足，而是「變化維度」被寫死在引擎裡**，資料層無從調整。

### 1.1 敵人：13 種裡面只有 4 種真的有不同的行為程式碼

`js/entities/Enemy.js:207-249` 的行為分派只有三段：

```js
if (this.isBoss)      { this.updateBoss(...) }          // Boss
else if (this.ranged) { /* 保持在射程外、後撤、開火 */ }   // 只有 spitter
else                  { moveX = (dx/dist)*spd; ... }    // 其餘全部：直線追擊
```

再加上三個旗標閘門：`explodes`（`Enemy.js:252` boomer）、`hatchMinion`（`Enemy.js:261` hatcher）、`dash`（`Enemy.js:279`），以及死在 `main.js:2855` 的 `splitInto`。

**實測統計（我寫腳本掃 `ENEMY_TYPES` 確認）：13 種敵人沒有任何一種帶 `ai` 欄位。**

| 敵種 | 專屬行為程式碼 |
| :--- | :--- |
| walker / bat / **brute** / **warden** / **sporeling** | ❌ 全部走 `else` 直線追擊，**彼此只差 hp/speed/damage/radius/color** |
| runner / hound | ⚠️ 共用同一個 `dashSpeedMul()`（`Enemy.js:279-292`），只差 `every/dur/mul` 三個數字 |
| spitter | ✅ 遠程 |
| boomer | ✅ 引信自爆 |
| hatcher | ✅ 定時孵化 |
| spore_host / chimera / hatcher | ✅ 死亡裂解（在 `main.js` 而非 Enemy.js）|
| boss | ✅ 衝鋒 + 隨機技能 |

三個具體的「說明與程式不符」，這是最直接的單調證據：

1. **嗜血獵犬的「起手繞邊後撲咬」不存在**（README:136）。`hound` 的 `dash: { every: 2.8, dur: 0.4, mul: 3.2 }` 與 `runner` 的機制**完全相同**，都是「冷卻到就直接加速直衝」，程式裡沒有任何繞行邏輯。
2. **防暴盾衛的「正面大盾」不是正面**（README:132）。`warden` 只有 `damageTakenMul: 0.55`（`config.js:412`），不分方向 —— 從背後打也減傷 45%。README 寫的「正面」在程式裡不存在。
3. **基隆型態的「命中附帶 5 秒追蹤印記」是死碼**。`WeaponManager.js:352` 寫入 `markOnHit`、`Projectile.js:49` 存起來，**全 repo 沒有任何地方讀取它**；`Enemy.js:192` 的 `_markedTimer` 只會被扣、永遠不會被設。

**第二個根因：沒有分離力（separation），所以整群怪塌成一個點。**

`Enemy.js:245-248` 是所有近戰怪唯一的移動程式碼，全部朝同一點收斂，且全檔沒有任何鄰居排斥、間距維持或包夾。250 隻上限（`Spawner.js:9`）下，怪群最後會疊在同一座標上像「一坨」在移動 —— 這是視覺上最強的單調來源，比美術更關鍵。

**第三個根因：全體共用同一個攻擊節奏與動畫節奏。**

- 近戰傷害全部由玩家單一無敵幀（`Player.js:232`，固定 0.5 秒，`Player.js:256`）把關，所以任何近戰怪都只能打出 2 下/秒；250 隻疊在一起的 walker 跟 1 隻 walker 的 DPS 一樣，只有 spitter（2.4s）與 boomer（0.8s 引信）節奏不同。
- `Enemy.js:196` `this.animTimer += dt * 8` 與 `Enemy.js:436` `Math.floor(this.animTimer * 1.4) % FRAMES` 是**所有 13 種共用**，走路動畫完全同步。
- 只有 2 種敵人有前搖預警（Boss 技能 `Enemy.js:588`、boomer 引信），**其餘 11 種完全沒有預警**：spitter 冷卻一到就開火（`Enemy.js:226`）、runner/hound 的加速在觸發「當幀」就生效（`Enemy.js:286-289`），紅色警示圈 `Enemy.js:460` 還畫在爆發「開始之後」，玩家零反應窗。

### 1.2 地形：全世界其實是「同一張 768×768 貼圖無限重複」

`main.js:3867-3933` 每關只烘一片 `T = 768` 的無接縫磚，`main.js:3814-3820` 逐幀平鋪。畫面寬 1280 時同一個 768 週期在一屏內就看得到重複。更關鍵的是**磚裡的內容對五關是統計上同一張圖**：

- 雜湊函式 `main.js:3883-3886` 五關完全相同，只有 `seed`（`_groundSeed(id)`）不同；驅動汙漬位置/大小的 `h(cx,cy,1)`、`h(cx,cy,2)` 一模一樣 → 五關的汙漬分佈是同一張圖換色。且 `g.patches[0]` 在五關都是 `{c:'255,255,255', a:0.015~0.025}`（`levels.js:28,74,122,172,222`），最亮的那層只差透明度。
- **密度與尺寸全部寫死在引擎**：汙漬 `if (r < 0.6)`（`main.js:3899`）→ 每一關都是「60% 的 240 單位格子有汙漬」；半徑 `90 + r*170`（`3903`）；微粒數 `mat === 'snow' ? 7 : ...`（`3950`）；特徵數固定 6 條柏油裂縫（`3975`）、10 顆鉚釘（`4001`）、9 片霜輝（`4009`）、26 點餘燼（`4021`）、46 顆星（`4033`）。**`levels.js` 完全沒有任何旋鈕可以調稀疏/密集。**
- **圖樣詞彙只有 1~2 種多邊形**：`_groundMotif`（`main.js:4053-4144`）每個分支的幾何都是固定的 —— `lava` 永遠是 `moveTo(mx-13, ...)` 那兩條折線、`void` 永遠是半徑 `5 + r2*7` 的 2.4 弧度圓弧加一點、`crack` 永遠是同一條三點折線。位置只由 `r1/r2` 平移，**沒有旋轉、沒有鏡射、沒有形狀分級** → 同一格圖樣在整張地圖上重複到會被眼睛抓出來。
- **沒有任何宏觀結構**：沒有道路/走廊/房間/空地/地標，沒有任何東西能讓玩家說出「我在地圖北邊」。`Decor.js` 是唯一的結構層，但它只是每 240 單位格子撒一個裝飾（`CELL=240`、`DENSITY=0.45`，`Decor.js:6-7`），五關同一套演算法、同一密度，且**裝飾純裝飾、不阻擋、不互動**。
- 格線（`main.js:3823` `grid = 64`、每 4 格一條主線）與色調 overlay（`main.js:3621-3630`）對五關完全相同；暗角只差 0.9~1.15 倍（`levels.js:26,77,127,177,227`）。**關卡識別度最後只剩下色相。**

### 1.3 地形機制：每關只有 1~2 種，而且生成位置是純亂數環

`levels.js` 的 `mechs` 每關只有 1~2 項（street 只有補給箱、lab 只有毒霧池、frost 地雷+冰面、core 噴發+安全區、endless 縮圈）。`spawnHazard`（`main.js:1651-1677`）的定位永遠是「以玩家為圓心、260~430 距離、隨機角度」的一個圓 → 機制之間沒有幾何關係（不會成排、成環、成走廊），讀起來就是「地上隨機冒出的圓圈」。

### 1.4 其他加成單調感的實測缺陷

- **砲塔/傭兵被圍就瞬死**：`main.js:1386`（`t.takeDamage(e.damage * dt * 1.5, e)`）與 `main.js:640`（傭兵同理）對**每一隻重疊的怪**各結算一次，50 隻貼上來就是 75 倍 DPS；核心早就為此加了 `CORE_MAX_ATTACKERS` 上限（`main.js:2485`，註解還寫明「原本會衝到 2,972 DPS」），但砲塔與傭兵沒有比照 → 佈防玩法實質上被一句「別讓怪碰到塔」壓扁。
- **電網塔把敵人電出自己的範圍**：`Turret.js:162` 每幀 `onHit(e, dps * dt)`，`main.js:1370` 固定帶 `knockback = 1`，配上 `Enemy.js:403` 的擊退 → 持續把目標往外推，宣稱的「50% 減速 + 持續電擊」變成「持續驅離」。
- **淨化塔永久改寫敵人的減傷欄位**：`Turret.js:182` `e.damageTakenMul = Math.max(e.damageTakenMul || 1, 1.25)` —— 沒有計時器、沒有還原，而且**直接覆蓋護甲**：防暴盾衛/攻城巨像（0.55）會變成 1.25（受傷變成 2.27 倍）且永不過期。
- **持續傷害走 `takeDamage` 被取整地板放大**：`Enemy.js:394` `Math.max(1, Math.round(...))`，電網每幀 `dps*dt = 0.75` 被抬成 1 → 60fps 時是 60 DPS、144fps 時是 144 DPS（宣告值 45）。**傷害隨幀率變動**。

---

## 2. 確認的缺陷（依嚴重度）

標記：✅ 主審複核通過 ｜ ⚠️ 成立但嚴重度下修 ｜ ❌ 複核不成立

### BLOCKER

**B1. 特殊卡「基因突變」可把武器推過等級上限，該武器永久不再開火** ✅

`main.js:3270` `wItem.level = Math.min(wItem.level + 2, 7); // 可超過正常上限`

我用腳本掃過 `WEAPONS`：**8 把非超武武器全部 `maxLevel: 5`，且所有等級索引表長度都是 5**（例：`config.js:34` `projectiles: [1,1,2,2,3]`）。`WeaponManager` 以 `item.level - 1` 直接索引：`projectiles`（`:316`）、`pierce`（`:317`）、`count`（`:365,427,470,567`）、`radius`（`:366,430,471`）、`strikes`（`:512`）、`bounces`（`:568`）。升到 6/7 級時索引到 `undefined`，`for (let i = 0; i < undefined; i++)` 一次都不跑 → **該武器整局啞火**，而觸發它的是一張 15% 機率的升級卡（`config.js:762`）。

### HIGH

**H1. `sound.playSelect` 不存在** ✅
`main.js:981` 呼叫 `sound.playSelect()`；`js/audio.js` 對外方法只有 `playShoot/playDash/playHit/playGem/playExplosion/playLightning/playLevelUp/playEvoFanfare/playHurt/playGameOver`。在武器型態選擇的 callback 裡丟 `TypeError`，同一行後面的 `.active` class 與 tooltip 更新永遠不執行。

**H2. 軌道核彈的「3 秒無敵」完全沒有效果** ✅
`main.js:3262` `this.player.invincible = 3;` —— 全 repo 只有這一行寫入，**沒有任何地方讀取**（玩家用的是 `invulnerableTimer`，`Player.js:232`）。卡片說明與 `say()` 文字都在騙玩家。

**H3. 雅典娜燃燒瓶的「聖域減傷」一旦踩到就永久有效** ✅
`Projectile.js:92` `player.inSanctuary = true;`、`Player.js:240` 讀取減傷 25%。全 repo 只有一寫一讀，**沒有任何地方設回 `false`** → 踩進一次聖域，整局受傷 -25%（且跨局殘留，因為 Player 實例在 `start()` 重置欄位時沒有清這個）。

**H4. 迷你事件計時器用幀數而非 dt，時長隨幀率 0.4×~2× 變動** ✅
`main.js:1972` `this.activeEvent.remaining -= 1 / 60;`（同型：`main.js:2123` 商人計時器 `this._merchantTimer -= 1 / 60`）。而且 `checkEventSchedule` 只從 `checkMilestones` 進（`main.js:1852`←`2676`），`update()` 在打擊頓格（`main.js:2332`）與所有彈窗狀態下不執行 → 15 秒的怪潮在 30fps 變 30 秒、144fps 變 6 秒，頓格時還會暫停。DOM 上的倒數也只寫一次（`UI.js:1703`），畫面上的秒數不會動。

**H5. 結算流程中途拋例外 → 玩家永久卡在 GAME_OVER，看不到結算面板** ✅（結構確認）
`main.js:3296-3298` 先設 `this.state = 'GAME_OVER'`，`main.js:3348` 才呼叫 `checkAchievements()`（跑 12 個成就條件 + `save.flush()`），`3349` 才 `showGameOver()`。中間任何例外都會被 `loop()` 的 catch 吞掉（`main.js:2351`），而 state 已是 GAME_OVER、`update()` 不再執行 → 沒有結算面板就沒有離開的路。`handleGameOver` 本身也沒有重入保護（`save.recordRun` 會被加兩次 DNA）。

### MEDIUM

**M1. 進化砲塔可以吃掉 50 金幣卻什麼都沒做** ✅
`main.js:546` 的篩選只檢查 `variant === 'standard'`，**沒有檢查 `facilityType`**；但 `Turret` 建構子的 `variant` 預設就是 `'standard'`（`Turret.js:117`），而 `upgrade()` 對非砲塔設施直接 return（`Turret.js:140`）。四大設施有 `turret/electric_grid/purifier/barricade`（`main.js:487-490`）→ 在淨化塔或路障旁按 `T`，扣錢、播進化音效、顯示「砲塔進化完畢」，實際毫無變化。

**M2. 自爆蟲的引信只增不減，離開也不會解除** ✅
`Enemy.js:252-258` 只在 `dist < 65` 時 `fuseTimer += dt`，全檔沒有遞減或歸零。`Enemy.js:417`（`boomer_armed` 外觀）與 `443/449`（膨脹）都吃這個值 → 靠近過一次就永遠處於「已武裝/膨脹」狀態。順帶：孵化與開火都有 `freezeTimer <= 0` 閘門，**引信沒有**，冰凍中的自爆蟲照樣燒引信。

**M3. 毒系詞綴以外的「持續傷害」全都沒有結算進傷害榜** ✅
`main.js:1400-1404` 的 `damageEnemy()` 註解寫著是唯一入口，但直接呼叫 `takeDamage` 繞過它的地方至少有 `main.js:863, 926, 1694, 1880, 2227, 2612`；`Turret.js:162` 的電網/淨化塔傷害以 `t.facilityType` 當 weaponId 傳入，而 `WeaponManager.js:665-678` 只特判 `'merc'`/`'turret'` → 這兩種設施的輸出在結算面板上完全消失。

**M4. 傷害飄字/結算數字用「減傷前」的數值** ✅
`main.js:1400-1403` 先 `takeDamage(damage)` 再用同一個 `damage` 記錄與顯示，但實際扣除的是 `Math.max(1, Math.round(damage * damageTakenMul))`（`Enemy.js:394`）→ 打裝甲怪時畫面與傷害榜都會虛報 1.8~2.3 倍。

**M5. 電網塔每幀對範圍內每隻怪噴一個傷害飄字** ✅
`Turret.js:157-165` 每幀每怪一次 `onHit` → `main.js:1370` → `createDamageText`。20 隻在場就是 ~1,200 次/秒的物件配置，每個還可能觸發 `ParticleSystem.js:6` 的 110 元素 `shift()`；而且飄字全是「1」，把真正的傷害回饋洗掉。

**M6. 過期經驗水晶被折算成金幣** ✅（效果確認）
`main.js:3067-3071` `recycleDrop` 對非 gold 的掉落一律給 `Math.max(1, round(value * 0.5))` 金幣，而 `DropItem` 只讓 `exp`/`gold` 會過期（`DropItem.js:19`）→ 沒撿到的 `EXP_GOLD`（value 20）變成 10 金幣。長期掛機等於把經驗自動換成貨幣。

**M7. `gold_rush` 的加成是 4 倍且第二次拾取會永久洩漏 ×2** ✅
`main.js:3279-3282` `metaGoldMul *= 2` 之後所有金幣來源還要再過一次 `goldMul()`（`main.js:666`）→ 實際 `metaGoldMul × 2 × goldMul()`；`main.js:1950-1956` 到期固定 `/= 2`，但拾取時是「重設 30 秒」不是「疊加」→ 30 秒內吃到兩次，只還原一次，剩下 ×2 永久有效。

**M8. 撤退/換場後 HUD 與殘留狀態清理不完整** ✅
`main.js:1039-1076` `returnToMenu()` 清了敵人/掉落/砲塔/傭兵/殘跡/機制/Boss/核心，但沒清 `merchant`、`activeEvent`、`blessings`、`_tempBuffs`、`destructibles`、`explodableProps`；`main.js:292` 的 resize 處理器會在 START 狀態重繪世界 → 放棄任務後主選單背景可能出現上一局的商人與木箱。

**M9. 掉寶/結算的隨機排序不是均勻洗牌** ✅
`main.js:1910`、`2136`、`3337` 都用 `sort(() => Math.random() - 0.5)`（同檔 `1989-1992` 就有正確的 Fisher-Yates）→ 祝福三選一與陣亡保裝的「隨機」是有偏的。

**M10. 擊殺/事件類 HUD 每幀無條件寫 DOM** ✅
`UI.js:1054-1064` 每幀寫 `expFill.style.width`、`playerLevel/timerText/killsText/goldText` 的 `textContent`；`main.js:697` 的 `addCombo()` 在**每次擊殺**都呼叫 `updateCombo`（`UI.js:755` 無變更守衛），而 `update()` 已經每幀呼叫一次（`main.js:2658`）→ 一顆炸彈清 200 隻就是同一幀 200 次 class/text 寫入。同檔 `UI.js:244-249` 的 `setObjective` 就是正確的守衛寫法。

**M11. 三個 `backdrop-filter` 疊在每幀重繪的 canvas 上，且隱藏彈窗沒有卸掉模糊** ✅
`style.css:152`（`.hud-pill` 8px，畫面常駐 4 個）、`:1611`（`.action-btn` 10px ×6）、`:361`（搖桿 4px）、`:1943`（核心血條 8px）；`:384` 的 `.overlay` 10px 模糊在 `.overlay.hidden` 只設 `opacity: 0` 時**仍在合成鏈上**（11 個彈窗）。另外只有 `.action-btn`（`:1611-1612`）帶 `-webkit-` 前綴，其餘三家在舊 iOS Safari 上根本沒有模糊。

### LOW / NIT（摘要）

- `main.js:3338` 陣亡保裝 `Math.ceil(len * 0.5)`：只掉 1 件時保 100%，與註解「隨機保留 50%」不符。
- `main.js:2279` 全特工通關判定 `charClears.size >= 4`，但 `CHARACTER_ORDER` 有 **5** 位（`characters.js:199`），`config.js:815` 的說明也還寫「4 位」。
- `main.js:2123`/`1972` 幀數計時（已列 H4）。
- `main.js:282-295` resize 每次都重建 canvas backing store 並同步 `render()`，無 rAF debounce。
- `main.js:1423` Boss 召喚上限硬寫 `230`，同檔其他兩個上限是從 `MAX_ENEMIES` 推導的。
- `main.js:3996-4000` 金屬刷紋起點用了 `P + y` 且 `y` 從 10 起算 → 磚頂 240px 完全沒有刷紋，且磚界出現 48px 的不規則間隔。
- `Turret.js:52`/`:58` 同一物件字面值裡 `desc` 重複定義，前者是死碼。
- `Turret.js:175` 淨化塔每 2.8 秒無條件播一次進化號角，整局重複。
- `EnemyProjectile.js:54-55` 每顆酸液彈用 `shadowBlur = 10` 畫，而上限是 150 顆（`main.js:1491`）；這是 2D canvas 最貴的操作，且彈體形狀固定，本可烘成 sprite（專案已有這條管線）。
- `Enemy.js:401`、`WeaponManager.js:685` 等熱路徑仍用 `Math.hypot`，同檔其他路徑已刻意改用平方距離（`main.js:2739`、`Turret.js:226`）。
- `Enemy.js:422` 每幀重建 `typeKey + ':v' + spriteVariant` 字串、`Enemy.js:38` 每幀組 `statusGlow` key；兩者對每隻怪都是常數，可在建構子算一次。
- `Enemy.js` 的狀態疊圖有 9 個獨立的 `save/translate/restore` 區塊（`:461, :474, :482, :496, :517, :539, :560, :576, :592`），燃燒+中毒+減速的精英每幀要 5 組狀態切換。
- `Projectile.js:424/448/466` 每個火焰池每幀重建 8~13 個漸層；`Enemy.js` 的 status glow 已經正確烘成 sprite，火焰池沒有比照。
- `UI.js:746` 每幀寫 `style.height`，而 `style.css:1654` 對它宣告了 `transition: height 0.05s` → 每幀重啟一次 layout 相關的 transition。
- `save.js:186-191` `flush()` 靜默吞掉 `QuotaExceededError`；`save.js:176-181` `JSON.parse` 失敗直接 `blank()`，不備份也不通知 → 無痕模式或存檔損毀等於無聲清空所有進度。
- `save.js:146` 無條件 `d.version = VERSION`，不讀舊值 → 未來任何版本遷移都沒有分支依據。
- `input.js:48-55` 只監聽 window 的 `keyup`，沒有 `blur`/`visibilitychange` 清理 → Alt-Tab 時按住方向鍵，回來後角色會一直走（`reset()` 存在但沒有呼叫者）。
- `UI.js:571-572` 倉庫計數寫死 `STASH_CAP`(30)，黑市擴充到 60 後會顯示「倉庫 35 / 30」並誤判為滿。
- `main.js:3049-3066` 每幀全表掃描 `capNonExpiringDrops()`（兩趟），且優先回收**最舊**的非過期掉落（`main.js:3086`）。

---

## 3. 效能（皆為結構推導，非 profiler 讀數）

基線數字見開頭表格。依「每幀成本 × 觸發頻率」排序：

1. **`checkProjectileCollisions` 是 O(投射物 × 敵人)**（`main.js:2735-2801`）；帶 `crit_blast` 傳奇特效時，每次暴擊還在內層再掃一次全部敵人（`main.js:2789-2793`）→ 密集時是 O(P·E²)。敵人上限 250、投射物可上百，這是 update 的主要成本。
2. **電網塔的傷害飄字風暴**（M5）。
3. **`burn5` 的每幀色彩字串 499 個 / renderMs 17.1**：`statusGlow` 已烘圖，但每隻每幀仍有 `Enemy.js:499-509` 的火星迴圈與 `globalAlpha` 變動；`Projectile.js` 的火焰池漸層與 `EnemyProjectile` 的 `shadowBlur` 是剩下最貴的三塊。
4. **敵人狀態疊圖的 9 組 save/restore**（上節）。
5. **砲塔/傭兵在冷卻中仍每幀全掃敵人**（`Turret.js:226-239` 先掃完才在 `:248` 檢查冷卻；火焰塔每次射擊重掃、電磁塔掃 3 次；`Mercenary.js:92-104` 同型）→ 每幀數百次白做的距離計算。
6. **每幀陣列重建**：`WeaponManager.js:198` 的 `filter` 重建投射物陣列、`fireGuardian` 每次開火再兩次全表 `filter`（`:369, :374`）；`Turret.js:241` 每幀配置新 `[]`。
7. **`drawFloorGrid` 逐條 stroke**（`main.js:3829-3846`）：1920 寬 @ grid 64 約 48 條線、96 次狀態設定；世界邊界還帶一個滿屏 `shadowBlur = 18` 的描邊（`:3855`）。
8. **`redFlash` 每幀重建放射漸層**（`main.js:3470-3479`）；暗角（`:3677`）與地板漸層（`:3798`）都已快取，這裡漏了。
9. **CSS 合成成本**（M11）：11 個模糊面疊在每幀重繪的 canvas 上，是手機端最大的可避免 GPU 支出。

---

## 4. 架構與可維護性

- **`main.js` 4,195 行**（README:473 還寫「接近 3,000 行」，說明它持續膨脹）。已可辨識的乾淨接縫：
  - `initExplodableProps`/`triggerPropExplosion`/`updateHazards`/`spawnHazard`/`explodeHazard`/`drawHazards` + `hexToRgba` ≈ 330 行 → `js/systems/Hazards.js`
  - `checkMilestones`/`grantMilestone`/`offerBlessingChoice`/`applyBlessing`/`tickBlessingEffects`/`checkEventSchedule`/`triggerMiniEvent`/`endMiniEvent`/`checkSynergies`/`checkAchievements` → `js/systems/Progression.js`
  - `hireMercenary`/`updateMercenaries`/`tryUpgradeNearestTurret`/`getFacilityCost`/`buildFacility`/`updateTurrets` → `js/systems/Facilities.js`
  - `bindEvents` + `refreshCharSelect`/`refreshModeSelect`/`refreshLevelSelect`/`tryUnlockCharacter`/`investTalent`/`returnToMenu` ≈ 300 行純 DOM 接線 → `js/systems/Menu.js`
- **跨系統可變狀態共用**：`triggerMiniEvent` 直接改寫傳給 Spawner 的 `this.rules.spawnMul`（`main.js:2006`, `:2063`），等於 Spawner 持有的 config 物件被事件系統就地改動。目前靠 `mergeRules` 每局重建才沒出事（`main.js:1125`），但這是典型的隱性耦合。
- **單一傷害入口名存實亡**（M3）：`damageEnemy()` 是唯一該走的路，實際有 6+ 處繞過。
- **`enemyScale` 的成長公式**（`levels.js:294-310`）已經疊了時間、關卡、規則、無盡、二次項五層，註解比程式長；調平衡時很難預測結果。建議拆成具名項。
- **測試**：專案有 `tools/smoke-branches.mjs`（51 分支，禮包碼移除前為 56）與 `tools/perf-probe.mjs`，比 README:479 寫的「沒有測試框架」好，但**兩者都不在 CI**，且都不覆蓋本報告的 B1/H2/H3/M1 這類「資料與程式對不上」的缺陷 —— 煙霧測試只驗證「不會拋例外」，不驗證「效果真的發生」。

---

## 5. 複核後被下修或推翻的指控

維持這份報告可信度的部分：以下是 reviewer 提出、但我回到程式碼後**不予採信或降級**的條目。

| 指控 | 複核結果 |
| :--- | :--- |
| 「商店 `save.spend()` 回傳值被丟棄 → 扣款失敗仍免費送商品」（CRITICAL） | ❌ **不成立**。`main.js:309` 的 `buy()` 在呼叫 `spend` 前已先比對餘額並 `return`，`save.js:288` 的 `false` 路徑在 UI 上不可達。丟棄回傳值是真的（latent），但不是可利用的漏洞。 |
| 「雙貨幣商品只要付一種貨幣」（CRITICAL） | ⚠️ **設計如此**。README:324 明寫「每件商品都可用金幣或 DNA 二選一支付」，`UI.js:376-382` 為每件商品各給一顆金幣鈕與一顆 DNA 鈕。 |
| 「禮包碼獎勵永遠拿不到」（CRITICAL） | ⚠️ **獎勵其實有進帳**。`save.js:161-172` 自己就改了 `data.gold/dna` 並 `flush()`；壞掉的是**回饋字串**：`UI.js:973` 讀 `res.ok/res.reward/res.reason`，而 `redeemCode` 回傳 `{success, message}` → 永遠顯示「❌ undefined」，且成功路徑不會更新 HUD 晶片。仍應修，但嚴重度是 HIGH 而非「完全失效」。 |
| 「25 個 AI 代理會同時改檔」 | ❌ 本輪 reviewer 全部唯讀，無檔案被修改（各自宣告，且 `git status` 乾淨）。 |

---

## 6. 補充：資料層交叉檢查（第五位 reviewer，把每個欄位對到讀者）

方法：對 `config.js` / `levels.js` / `modes.js` / `characters.js` 的**每一個欄位**全 repo grep 讀者。
**參照完整性是乾淨的**（每個波次敵種、decor key、武器/超武/pairPassive id、機制型別、
Boss 技能、升級卡型別都解析得到），所以問題是「死資料」與「說明與程式不符」。

### 6.1 宣告了但沒有讀者的欄位

| 欄位 | 位置 | 狀態 |
| :--- | :--- | :--- |
| `DAILY_MODIFIERS.turretCdr` | `levels.js:335` | ✅ 本輪已修（見 §7）。這是 repo 先前修過的同一類 bug 的**重複發生**：欄位不在 `RULE_DEFAULTS`，所以 `mergeRules` 直接丟掉，也沒有任何地方乘進砲塔冷卻。 |
| `WEAPON_ASPECTS[*].stats`（18 個物件） | `config.js` | ✅ **第二批已修**：引擎改為只讀這張表（`WeaponManager.aspectOf()` 依武器家族取值），先前 18 個型態的數字都在引擎裡被硬寫第二次。 |
| `WEAPON_ASPECTS[*].tag` | `config.js:619` | ❌ 未修（從未顯示） |
| 塔納托斯（Thanatos）型態 | `config.js`、`WeaponManager.js`、`main.js` | ✅ **第二批已實作**：每次命中傷害 ×1.25，第 5 次命中引發虛空引爆（半徑 100／200 傷害）。 |
| 阿基里斯（Achilles）型態的跑速疊層 | `config.js`、`main.js` | ✅ **第二批已實作**：每次命中疊 6% 跑速，上限 +42%、持續 4 秒（步進/上限/秒數都讀 stats）。 |
| `CONSUMABLE_ITEMS[*].duration` | `config.js` | ✅ **第二批已修**：藥劑與時停懷錶的秒數改讀表格（並把表格校正為實際值）。 |
| `LEVEL_DURATION` | `levels.js` | ✅ **第二批已修**：四個關卡的波次終點與終極首領時間改用它。 |
| `GAME_CONFIG.CANVAS_WIDTH/HEIGHT` | `config.js` | ✅ **第二批已移除**（引擎用 `this.vw/this.vh`，這兩個只在 import 時算一次、resize 後即失效）。 |
| `characters.js` 的 `role` / `classTitle` | `characters.js:10,13,44,47,93,96,135,138,175,176` | ❌ 未修（10 條文案是死的） |
| `ELITE_AFFIXES[*].name` | `config.js:502-505` | ✅ 本輪已修：精英頭上會顯示詞綴名（原本只讀 `color`，玩家只能靠色調猜） |
| `CHARGE.burn/freeze/poison.color` | `config.js` | ✅ **第二批已修**：蓄能彈光暈改讀表格（`Projectile.js` 原本硬寫一組 rgb 字串）。 |
| `player.blessingDmgMul` / `player.bonusProjectiles` | `WeaponManager.js` | ✅ **第二批已移除**（全 repo 沒有寫入者；15 個祝福各自用 `blessingXxxMul`，沒有一個是傷害乘數）。 |
| 無盡關的 `waves[0].interval/batch` | `levels.js:241` vs `Spawner.js:61-64` | ❌ 未修：無盡關的 interval/batch 被時間公式覆寫，該 entry 只有 `pool` 是活的。 |

### 6.2 已確認的說明與程式不符（會影響玩家理解）

- ✅ **第二批已修**：`manna_prism` 與 `magic_ticket` 的名稱／圖示／說明已改回與 README 和實作一致（原本的文案是對調的）。原文記錄如下 ——
  圖示是 🧲、寫著「吸納全地圖所有經驗水晶與金幣」的那個，實際做的是**冷卻歸零**；
  寫著「瞬間折躍至安全空地並引爆 360° 擊退衝擊波」的那個，實際做的是**磁吸 + 100 金幣**，
  而且折躍與擊退衝擊波根本不存在。
- **可破壞物件與藥劑文案漂移**：`config.js:541` 寫「回復 35% 最大生命」實作是固定 `heal(80)`；
  `config.js:584-586` 寫「凍結全場敵人**與敵方子彈** 3.5 秒」實作是 `applyStun(5.0)` 且不凍子彈；
  `config.js:566` 的「霸體」、`config.js:549` 的「消除負面狀態」、`config.js:593-595` 的
  「持續灼燒並削弱 6 秒」都沒有實作。✅ **第二批已修**：一律把文案改成與實作相符（不為了文案去改平衡），
  另外補上時停懷錶真的連敵方子彈一起凍結（說明與 README 原本都這樣承諾）。
- **README 三處過期數字**（README:144/156/157/158）：精英詞綴公式、雜兵血量斜率、
  傷害上限、移速隨時間成長，全部與 `Spawner.js:92` / `levels.js:299-308` 的現行實作不符
  （程式碼註解自己記錄了改動，README 沒跟上）。❌ 未修。
- `modes.js:32-33` 寫「工事費用 0.6 折」實際是 6 折（`turretCostMul: 0.6`）、
  「金幣收入加倍」實際是 ×2.2；`config.js:779-780` 寫「攻速 +40%」實際約 +67%。❌ 未修。

### 6.3 兩個測試盲點（本輪已處理其一）

- ✅ **`tools/smoke-branches.mjs` 的「特殊卡」組一直是空轉**：`applySpecialCard` 依
  `card.specialId` 分派，但測試把 `SPECIAL_CARDS` 原始表丟進去（欄位叫 `id`），
  每個 case 都不匹配 → 整組「全部通過」卻什麼都沒觸發。曼納稜晶那類筆誤就是這樣
  躲過去的（`0b3f5b3` 修掉的正是同一個位置）。本輪改為照真實升級流程組裝。
- ✅ **第二批已修**：`updateFacilityButtons` 加上值快取後改為每幀刷新，擊殺與掉落拿到的
  金幣會即時更新電網／淨化裝置／拒馬的可用狀態（快取讓它不會產生多餘的 DOM 寫入）。

---

## 7. 本輪修復狀態

分支 `feat/terrain-enemy-variety`（本地，未推 origin），三個 commit：

| commit | 內容 |
| :--- | :--- |
| `08a2bb9` | 本報告 |
| `3863a62` | 地形宏觀結構 + 敵人行為多樣化（+ 位於 `main.js`/`levels.js` 內的邏輯修復） |
| `b581b1a` | 系統層修復（save/UI/audio/input/Player/Projectile/WeaponManager/Turret）+ 測試 |
| 待補 | `fix(aspect)` 第二批：型態系統接線、4 個未實作的型態效果、`WeaponManager.game` 接線 bug、死資料清理、HUD 值快取 |

### 7.1 第一批：已修（每一項都有對應的自動檢查）

BLOCKER／HIGH：`gene_mutate` 突破等級上限導致武器永久啞火 ｜ `sound.playSelect` 不存在 ｜
軌道核彈的 3 秒無敵 ｜ 聖光結界永久有效 ｜ 力量藥劑／幸運藥劑完全沒有效果 ｜
基隆型態的印記（`markOnHit` 死碼）｜ 苦無型態洩漏導致進化武器少 40% 傷害 ｜
禮包碼 UI 永遠顯示「❌ undefined」。

MEDIUM：迷你事件／商人計時器隨幀率變動 ｜ 事件橫幅倒數不會動 ｜ 淘金狂潮 ×4 與永久洩漏 ｜
結算例外卡死 + 重複入帳 ｜ 進化砲塔吃掉金幣卻無效果 ｜ 傷害跳字與統計虛報 ｜
偏誤洗牌與「單件 100% 保留」｜ `turretCdr` 死欄位 ｜ 商人臨時增益被重置 ｜
倉庫上限顯示寫死 30 ｜ 視窗失焦按鍵卡住 ｜ 全特工通關門檻 4 vs 5 位 ｜
`_eventSpawnMul` 跨局殘留 ｜ 自爆蟲引信只增不減 ｜ 淨化塔永久覆寫敵人減傷欄位 ｜
生成距離下限落在視野內 ｜ `MAX_ENEMIES` 實際可超額到 254。

### 7.2 第二批：型態系統與死資料（`fix(aspect)`）

使用者授權「自己拍板」後補完的部分：

- **型態系統接線**：`WeaponManager.aspectOf()` 依武器家族（8 把超武各自掛在自己的基礎武器上）
  取出 `WEAPON_ASPECTS[*].stats`，引擎不再硬寫第二份數字 —— 18 個 stats 物件全部有讀者。
- **補上 4 個沒實作的效果**：塔納托斯（每次命中 +25%、第 5 次命中引爆半徑 100／200 傷害）、
  阿基里斯（每次命中疊 6% 跑速、上限 +42%）、宙斯連鎖數 4（`chainShock` 先前把第 4 個參數丟掉）、
  燃燒瓶札格跳頻 `tickRateMul` 0.70；另外守護輪盤混沌型態的飛盤改用遊戲時間冷卻。
- **修掉一個接線 bug（本輪新發現）**：`WeaponManager.game` **從來沒有被賦值**（只有
  `player.game` 有），所以 `this.game?.chainShock(...)` 一直是靜默不執行 ——
  **宙斯型態的連鎖電弧從來沒有生效過**，連帶讓「商人臨時增益在被動重算後補回」也失效。
- **文案與資料對齊**：消耗品名稱／圖示／說明（`manna_prism` 與 `magic_ticket` 原本是對調的）、
  型態說明、`CONSUMABLE_ITEMS` 秒數、`LEVEL_DURATION`、`CHARGE` 顏色；
  移除 `GAME_CONFIG.CANVAS_*` 與 `bonusProjectiles`／`blessingDmgMul` 兩個幽靈欄位。
- **HUD 成本**：`updateHUD`／`updateCombo`／`updateBossHUD`／`updateFacilityButtons` 都加上
  值快取（原本每幀無條件寫 5～15 個 DOM 屬性；`updateCombo` 還會在炸彈清場時同一幀被呼叫數百次）。

驗證：`verify-review-fixes.mjs` 擴充到 **47 項全過**，逐一驗證每個型態的效果是數值驅動的
（冷卻倍率比值、印記 0.4 加成反證、宙斯 jumps=4、索爾 1.2 秒、火海 tick 0.175、混沌飛盤、
塔納托斯 5 次引爆、阿基里斯疊層、關羽 1.5 秒冰凍、時停凍結子彈）。

### 7.2b 第三批：全面優化（材質強化 / PWA / 模組化 / 繪圖成本）

使用者授權「按你的判斷全部優化、必要時重構」後執行。

**一、材質強化（`js/systems/Ground.js` + 新增 `js/systems/Texture.js`）**

原本的地表是「雜湊決定位置 → 畫一顆徑向漸層圓 + 白雜訊小圓點」，看起來是色紙而不是材質。四個根因與對應修正：

| 根因 | 修正 |
| :--- | :--- |
| 磚大部分是**透明的**，畫面上的「地表」其實是螢幕鎖定的底色漸層 | 新增**材質底層**：整張磚鋪低頻明暗起伏 + 微顆粒（只調亮度、不動色相，各關氣氛不變） |
| 汙漬是**標準圓形 + 徑向漸層**，五關都是同一種圓點 | 改用 **fBm 輪廓的有機色塊**（`_noiseBlob`），並提供**可平鋪數值雜訊**（格點取模，磚界完全接得上） |
| 顆粒是**單色小圓點**，沒有立體感 | 全部改走**方向光浮雕**（`reliefDot`：左上亮、右下暗），並逐材質換色（柏油骨材/石英反光、金屬刷痕亮點、霜晶高光、玄武岩碎屑、星塵） |
| 磚 768 在 1280 寬視野裡重複 1.7 次，週期容易被抓到 | 磚放大到 **1024**（手機螢幕根本裝不下一張）、巨觀層縮尺 1/4 → 1/3 |

逐材質分層細節（每種 3~5 層）：柏油＝三種粒徑骨材＋石英反光＋瀝青填縫＋人孔蓋（斜面鐵蓋＋內圈刻紋）＋油漬霓虹倒影；金屬＝刷紋（間距整除磚寬）＋板塊斜面＋鉚釘＋鏽蝕擴散＋警示斜紋＋模板圓章；雪地＝雪堆起伏＋風紋（亮/暗成對）＋霜晶閃光＋露出冰面亮邊；熔岩＝玄武岩板塊＋發光裂縫網（暗溝＋白熱核心＋沿縫餘燼）＋冷卻地殼；虛空＝星雲＋星點（亮星帶十字星芒）＋符文溝槽。

新增 `_wrapDraw`：磚界環繞。任何尺寸的特徵都能無接縫平鋪，不必再把特徵擠在磚中央（原本的「安全帶」限制）。

成本：每關烘焙一次 **39~58ms**、4MB（`assets` 只在該關卡開啟時烘）；每幀仍是固定的 `drawImage` 平鋪。逐關起伏強度由 `theme.ground.density.base` 控制（柏油 1.15 / 金屬 0.8 / 雪 0.75 / 玄武岩 1.3 / 虛空 0.9）。

**二、PWA 支援**

`manifest.webmanifest`（start_url/scope 相對路徑，能在 GitHub Pages 子路徑運作）、`sw.js`（precache 39 項含全部 29 個 JS 模組；快取優先 + 背景重新驗證；只攔截同源 GET；版本化快取 + `skipWaiting`/`clients.claim`）、`js/pwa.js`（註冊、更新橫幅、安裝入口、iOS 提示）、`icons/`（SVG 原稿 + 192/512/maskable-512/apple-touch-180，共 144KB）。`index.html` 只加 8 行、`css/style.css` 加 129 行。

**三、模組化重構**

`js/main.js` 4,880 → **4,030 行**：地面繪製管線（約 860 行）抽成 `js/systems/Ground.js`。搬移手法是「整段逐字搬移，入口只補狀態綁定」，因此 `main.js` 只留主迴圈、狀態機與系統接線；快取（地表磚、暗角畫布、底色漸層）留在模組實例上，換局沿用。驗證方式見 §7.2c。

**四、繪圖成本**

- `Enemy.drawMiniHpBar`：小血條的兩個 `fillStyle` 字面值原本「每隻受傷的怪、每幀」重新解析 → 改用 1×1 畫布做成的 **pattern 物件**（指派物件不需解析字串，外觀不變）。效能探針的 `burn5` 最壞情境：**每幀色彩字串 499 → 15**（−97%）。
- 另有 acid bolt 的 `shadowBlur`、粒子系統每幀配置與 `Math.pow`、火焰池每幀漸層、隱藏彈窗的 `backdrop-filter`、`#core-hud` 的每幀 `box-shadow` 動畫等項目，交由平行的繪圖成本批次處理。**結果（同一版探針，A＝原始 `30b407f`、B＝HEAD、C＝本次）**：

| 情境 | 繪圖指令 A→B→C | 色彩字串 A→B→C | 漸層物件 | renderMs A→B→C |
| :--- | :--- | :--- | :--- | :--- |
| idle | 68→75→75 | 10→10→10 | 1→1 | 0→0.1→0.1 |
| mobs | 574→584→579 | 16→19→15 | 1→1 | 10.5→11.0→11.3 |
| burn | 1786→1793→1789 | 16→19→15 | 1→1 | 13.7→14.9→15.0 |
| burn5 | 4208→4204→4201 | **499→498→15** | 1→1 | 18.1→19.9→20.1 |
| drops | 635→637→642 | 15→17→13 | 1→1 | 8.7→10.0→9.8 |
| **barrage**（新增：150 敵彈＋6 灘火海＋粒子滿載） | 1365→1369→**967** | 491→491→**285** | **68→68→2** | 9.7→10.7→12.2 |

**兩個必須說清楚的量測假象**（否則這張表會被誤讀）：

1. **官方探針的五個情境幾乎量不到這次的成果** —— 它們沒有火海、沒有蓄能彈、敵方投射物只有零星幾顆，所以四個檔案裡有三個在它面前是隱形的。因此新增了 `barrage` 情境，並修掉探針把**一次性烘焙**攤進量測窗的問題（量測前先預熱；實測含烘焙 20.2ms/幀、預熱後 16.3ms/幀）。
2. **`barrage` 的「加色塗抹倍率」0.6→0 是探針估算失效，不是視覺改變**：探針用「最後一次 `arc` 的使用者空間半徑」估面積，白熱帶改成單位圓 + CTM 縮放後半徑讀到 1。繪圖成本批次以 route 攔截把舊模組載入同一頁、同 CTM/dpr/seed 逐像素比對，證實實際塗抹像素相同（粒子與蓄能光暈 **0 像素差**、火海 ≤0.04%、酸液彈的質量／峰值／質心／可見半徑完全相同）。
3. **酸液彈在強制軟體光柵下 renderMs 反而 +23%**：烘焙拿掉了 150 次陰影模糊，但 sprite 貼圖的矩形面積會被計入塗抹，而陰影模糊的內部工作完全不被計入。真實 GPU 上陰影模糊才是貴的那一邊（`BOLT_PAD` 目前保守取 24 邏輯像素，可再調）。
4. **renderMs 在官方情境上升 0.8~2.0ms**：這是材質／地形層（巨觀層 + 材質底層 + 磚 768→1024）的刻意成本，不是繪圖成本批次造成的（B 已經量到、C 只再動 ±0.4ms）。無儀器量測的穩態（預熱後、250 隻灼燒＋中毒、1280×720、軟體光柵）是 **16.3~17.0ms/幀**（update+render）。

**刻意偏離像素等價（已權衡並記錄）**：`.event-icon` 用 `text-shadow` 而非 `box-shadow`（emoji 的 box-shadow 會在行內框外畫一個方形光暈）；`#core-hud.danger` 由「box-shadow 半徑動畫」改為「固定 16px ring 只呼吸亮度與 scale」——要停止每幀重新點陣化整個元素，就必須放棄半徑動畫，紅色警示的意圖保留。

**新增的三支工具**：`tools/probe-targeted.mjs`（把變因鎖在官方探針涵蓋不到的熱點）、`tools/worst-case.mjs`（250 灼燒中毒＋6 火海＋150 敵彈的整合情境，7 項斷言）、`tools/visual-equiv.mjs`（route 攔截舊模組做逐像素等價比對）。

### 7.2c 後續變更：禮包碼功能整支移除

擁有者表示「目前沒有官方禮包」，因此整支功能移除（`GIFT_CODES`、`save.redeemCode()`、存檔的 `redeemedCodes` 欄位、選單的 🎁 官方禮包按鈕、兌換彈窗與 5 個快速填入籌碼、UI 的 `openGiftModal`／`tryRedeemGiftCode`、以及煙霧測試的 5 個禮包碼分支與回歸腳本的 4 項檢查）。

因此 §2 的 **H1（禮包碼 UI 永遠顯示「❌ undefined」）已隨功能移除而不存在**，該紀錄保留作為「資料與程式對不上」的案例。分支數：煙霧測試 56 → **51**，`verify-review-fixes` 47 → **43**。

### 7.3 仍未處理

- `WEAPON_ASPECTS[*].tag`（型態標籤文案）仍未顯示；`characters.js` 的 `role`／`classTitle`
  10 條文案仍是死資料；無盡關波次的 `interval`／`batch` 仍被時間公式覆蓋。
- §6.2 的資料表散文（`modes.js` 的「0.6 折」與「金幣收入加倍」、`config.js:779-780` 的「攻速 +40%」）
  尚未校正。
- §3 的效能項目（第三批已完成酸液彈 `shadowBlur`、粒子系統配置、火焰池漸層、隱藏彈窗
  合成成本、小血條色彩字串；**碰撞空間分割仍未做** —— `checkProjectileCollisions` 是
  O(P·E)，暴擊時 O(P·E²)，這是 update 端最大的單一成本）。
- 模組化只完成第一塊（`Ground.js`）；`Hazards`／`Progression`／`Facilities`／`Merchant`／
  `Menu` 的切分順序與驗收方式見 README「後續開發規劃」第 4 項。

### 7.4 實測數據（改動前 → 改動後）

| 指標 | 前 | 後 |
| :--- | :--- | :--- |
| `smoke-branches.mjs` | 56 分支通過 | 56 分支通過（且特殊卡組不再空轉；禮包碼移除後 51） |
| `verify-review-fixes.mjs` | —（新增） | **47/47 通過** |
| 敵人坍塌配對比例（96 隻怪、4 秒收斂） | 14.1% | **0.9%** |
| 敵人最近鄰平均距離 | 20.7 | **29.5** |
| 五關巨觀結構種類 | 0（只有色相不同） | **5（道路／板塊／冰原／岩漿渠道／裂縫）** |
| 帶 `ai.kind` 的敵人種類 | 0 / 13 | **13 / 13** |
| 每幀繪圖指令（idle/mobs/burn/burn5/drops） | 68/573/1786/4209/636 | 73/579/1788/4207/641 |
| renderMs（同上） | 0.1/9.7/13.1/17.1/8.4 | 0.0/11.0/14.2/18.9/9.5 |

（renderMs 是軟體光柵化的相對值；兩次量測變異 < 0.4ms，繪圖指令變異 ≤ 1。）

---

## 8. 建議處置順序

1. **B1 + H2 + H3 + M1**：四個「花資源卻沒有效果 / 有效果卻永久殘留」的缺陷，改動都在 1~3 行，玩家可感知度最高。
2. **地形與敵人的變化維度**（§1）：把寫死的密度/圖樣/行為資料化，加上宏觀地標層與敵人分離力。這是本次的主交付。
3. **H4 + M10 + M11**：幀率相依的計時器與每幀 DOM/合成成本，手機端最有感。
4. **H5 + M8**：結算與換場的健壯性（try/finally + 完整 teardown）。
5. **效能 1、2、3**：碰撞空間分割、電網飄字、火焰池/酸液彈烘圖。
6. **架構接縫**：等上面都穩定後再談拆檔，避免重構與行為修正混在同一個 diff。
