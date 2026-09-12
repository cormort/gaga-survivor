# 整體 Code Review — gaga-survivor

**受檢版本**：`30b407f`（main，2025 本地 checkout）
**受檢範圍**：`index.html`、`css/style.css`、`js/**` 全部 20,368 行
**產出方式**：五個獨立 reviewer 平行深讀不同模組 + 主審逐條複核
**複核原則**：reviewer 的每一條結論都由主審回到程式碼實際驗證；**未通過複核的一律標記，不當成事實**（見 §5）

**基線實測**（改動前，供後續 A/B 對照）

| 項目 | 結果 |
| :--- | :--- |
| `tools/smoke-branches.mjs` | ✅ 56 個分支全部通過，離開碼 0 |
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
- **測試**：專案有 `tools/smoke-branches.mjs`（56 分支）與 `tools/perf-probe.mjs`，比 README:479 寫的「沒有測試框架」好，但**兩者都不在 CI**，且都不覆蓋本報告的 B1/H2/H3/M1 這類「資料與程式對不上」的缺陷 —— 煙霧測試只驗證「不會拋例外」，不驗證「效果真的發生」。

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

## 6. 建議處置順序

1. **B1 + H2 + H3 + M1**：四個「花資源卻沒有效果 / 有效果卻永久殘留」的缺陷，改動都在 1~3 行，玩家可感知度最高。
2. **地形與敵人的變化維度**（§1）：把寫死的密度/圖樣/行為資料化，加上宏觀地標層與敵人分離力。這是本次的主交付。
3. **H4 + M10 + M11**：幀率相依的計時器與每幀 DOM/合成成本，手機端最有感。
4. **H5 + M8**：結算與換場的健壯性（try/finally + 完整 teardown）。
5. **效能 1、2、3**：碰撞空間分割、電網飄字、火焰池/酸液彈烘圖。
6. **架構接縫**：等上面都穩定後再談拆檔，避免重構與行為修正混在同一個 diff。
