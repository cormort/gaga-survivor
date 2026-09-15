// 四位特工：外觀 sprite、專屬特質、初始武器與全情境台詞腳本。
// 特質以「鉤子」形式實作，由 Player / Game 在對應時機呼叫。

import { Turret } from './entities/Turret.js';

export const CHARACTERS = {
  duck: {
    id: 'duck',
    sprite: 'duck',
    codename: '007 鴨鴨',
    title: '嘎嘎特工',
    role: '均衡新手推薦 / 單體點殺與極速風箏',
    heroClass: '遠程',
    classColor: '#ffcc00',
    classTitle: '致命點殺 / 極速風箏',
    traitName: '特工風度',
    traitDesc: '移動時 +45% 暴擊率、翻滾冷卻 -45%；拾取範圍 +20%',
    startWeapon: 'kunai',
    accent: '#ffcc00',
    lines: {
      start: '墨鏡戴好，領帶打正。今天又是拯救池塘的一天，嘎！',
      levelup: '特工總部的補給到了？讓我看看有什麼好貨色。',
      evolve: '嘎哈哈哈！這才叫特工科技，看我的無限暴風加特林！',
      lowhp: '嘎！毛都掉了好幾根……但我這套西裝可不能髒！',
      boss: '這傢伙比總部餐廳的大廚還兇，準備領便當吧！',
      win: '任務完成，搖勻、不要攪拌。收工回池塘吃麵包屑囉～',
      death: '咕嚕嚕……誰來幫我……把瀏覽紀錄刪了……嘎……',
    },
    init(player) {
      player.baseMagnet = 1.35;
      player.critChance = 0;
      player.critMovingBonus = 0.45;
    },
    tick(dt, game) {
      const p = game.player;
      const moving = p.walkCycle > 0;
      // 移動中才享有暴擊加成。幅度從 +15% 提到 +45%：站在原地的損失必須大到
      // 逼出「風箏」玩法，否則它只是看不見的數值。
      p.critChance = moving ? p.critMovingBonus : 0;
      // 同一套邏輯的第二半：跑動時翻滾冷卻 -45%，讓「一直動」同時換到暴擊與機動
      p.dashCooldownMul = moving ? 0.55 : 1;
    },
  },

  rabbit: {
    id: 'rabbit',
    sprite: 'rabbit',
    codename: '暴走蘿蔔',
    title: '特工兔兔',
    role: '極限跑速 / 範圍燃燒 / 邊跑邊打',
    heroClass: '重火力',
    classColor: '#ff6b35',
    classTitle: '極限跑速 / 範圍火海',
    traitName: '兔子快跑',
    traitDesc: '跑速每 +10%，全傷害 +5%；奔跑時留下會隨時間增強的灼燒火痕',
    startWeapon: 'molotov',
    unlockCost: 60,
    accent: '#ff6b35',
    lines: {
      start: '引擎拉滿！吃我一記超光速蘿蔔啦！',
      levelup: '選哪個能跑得更快？只要我夠快，殭屍就追不上我！',
      evolve: '燃燒吧！整張地圖都是我的烤地瓜派對！',
      lowhp: '痛痛痛！耳朵要被咬掉了啦！溜了溜了！',
      boss: '長那麼大隻一定跑很慢！看我繞著你畫圈圈！',
      win: '呼！打破最速通關紀錄！胡蘿蔔特調，乾杯！',
      death: '腳步……慢下來了……我的紅蘿蔔蛋糕……還沒吃完……',
    },
    init(player) {
      player.baseSpeedMul = 1.25;
      player.trailTimer = 0;
    },
    // 常駐加成：跑速每 +10% → 全傷害 +5% (被動重算時套用，不會逐幀累加)
    passive(player) {
      player.damageMultiplier += (player.speedMultiplier - 1) * 0.5;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.walkCycle <= 0) return;
      p.trailTimer -= dt;
      if (p.trailTimer > 0) return;
      p.trailTimer = 0.22;

      // 腳下火痕：灼燒經過的敵人。
      // 傷害必須跟著成長曲線走 —— 原本是固定 6 點（只乘 damageMultiplier），
      // 對照武器 22→54、被動滿級 +75%、以及後期敵人血量，中期之後完全看不見。
      // 改成「基礎值隨存活時間成長 × damageMultiplier」，並附帶燃燒（吃火焰協同），
      // 讓這條火痕真的屬於「火」的玩法而不是裝飾。
      game.particles.createHitSpark(p.x, p.y + 12, '#ff6b00');
      const trailBase = 6 + game.gameTime * 0.55;
      for (const e of game.enemies) {
        if (e.isDead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 42) {
          game.damageEnemy(e, Math.round(trailBase * p.damageMultiplier), 0, p.x, p.y, 'molotov');
          e.applyBurn?.(trailBase * 0.6, 2.5, 'molotov');
        }
      }
    },
  },

  penguin: {
    id: 'penguin',
    sprite: 'penguin',
    codename: '鋼鐵肥啾',
    title: '重裝企鵝',
    role: '近身絞肉機 / 站擼護盾 / 彈射防禦',
    heroClass: '防守',
    classColor: '#9fb3c8',
    classTitle: '重裝肉盾 / 反傷力場',
    traitName: '厚脂肪裝甲',
    traitDesc: '受到的傷害 -30%，受擊時裝甲反震（傷害 = 18 + 15% 最大生命）',
    startWeapon: 'guardian',
    unlockCost: 150,
    accent: '#9fb3c8',
    lines: {
      start: '防禦力場就緒。放馬過來吧，我皮很厚的。',
      levelup: '加固裝甲，或者更多旋轉利刃。穩紮穩打才走得遠。',
      evolve: '絕對領域展開！想碰到本企鵝的一根羽毛？門都沒有！',
      lowhp: '裝甲完整度告急！但真正的重裝戰士，現在才要發力！',
      boss: '目標鎖定。來比比是你的拳頭硬，還是我的合金板硬！',
      win: '防線堅如磐石。本次行動零傷亡（指防彈板）。',
      death: '外骨骼能源……耗盡……我……先趴一下……',
    },
    init(player) {
      player.maxHp = 130;
      player.hp = 130;
      player.damageTakenMul = 0.7;
      player.armorShockCd = 0;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.armorShockCd > 0) p.armorShockCd -= dt;
    },
    onHit(game) {
      const p = game.player;
      // 兩處 onHit（敵人接觸、投射物）都會呼叫，用 0.8 秒內冷卻避免同一瞬間重複觸發
      if (p.armorShockCd > 0) return;
      p.armorShockCd = 0.8;
      // 護甲反震：全場衝擊波，擊退並傷害周圍敵人。
      // 傷害改吃「最大生命」—— 這才是「厚脂肪裝甲」該有的成長：HP 被動、裝備、
      // 祝福都會直接放大它。原本固定 18 點在後期敵人血量數千時等於沒有。
      game.particles.createShockwave(p.x, p.y, 240, '#9fb3c8');
      game.camera.shake = 10;
      const shockDmg = Math.round(18 + p.maxHp * 0.15);
      for (const e of game.enemies) {
        if (e.isDead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 240) {
          game.damageEnemy(e, shockDmg, 26, p.x, p.y, 'guardian');
        }
      }
    },
  },

  cat: {
    id: 'cat',
    sprite: 'cat',
    codename: '脈衝喵喵',
    title: '賽博駭客',
    role: '技能 CD 縮減極致 / 全螢幕連鎖天罰',
    heroClass: '輔助',
    classColor: '#00e5ff',
    classTitle: '超頻過載 / 全域天罰',
    traitName: '超頻過載',
    traitDesc: '擊殺菁英怪或每累積 25 殺觸發過載：5 秒內冷卻減半、傷害 +25%',
    startWeapon: 'lightning',
    unlockCost: 300,
    accent: '#00e5ff',
    lines: {
      start: '正在入侵戰場協議……系統權限已獲取，準備降下天罰，喵。',
      levelup: '升級韌體已推播，下載進度 100%。',
      evolve: 'Root 權限全開！感受大自然與高壓電的力量吧，渣渣們！',
      lowhp: '嘖，防火牆被突破了？本喵生氣了喔！',
      boss: '偵測到高威脅木馬程式，正在執行強制格式化。',
      win: '數據已清理乾淨。收工，我要去睡日光浴午覺了，喵～',
      death: '404 Not Found……核心核心……重啟失敗……',
    },
    init(player) {
      player.overloadTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.overloadTimer > 0) p.overloadTimer -= dt;
      // 超載期間額外 +25% 傷害：原本只有「冷卻減半」，開超載的體感只有技能變快；
      // 補上傷害讓它是一段真正的爆發期。
      p.traitDmgMul = p.overloadTimer > 0 ? 1.25 : 1;
    },
    onKill(enemy, game) {
      const p = game.player;
      p.killStreak = (p.killStreak || 0) + 1;
      // 菁英怪 = 生化巨漢 / 詞綴精英 / Boss
      const elite = enemy.typeKey === 'brute' || enemy.isBoss || enemy.isElite;
      // 原本只有菁英怪能觸發 —— 前期根本碰不到，等於開局沒有特質。
      // 加入「每 25 殺累積觸發」，讓超載從第一波就有節奏。
      const byStreak = p.killStreak >= 25;
      if (!elite && !byStreak) return;
      if (byStreak) p.killStreak = 0;
      p.overloadTimer = 5;
      game.particles.createShockwave(p.x, p.y, 150, '#00e5ff');
      game.ui.say('超頻過載！冷卻減半、傷害 +25% 持續 5 秒', '#00e5ff');
    },
  },

  mechanic: {
    id: 'mechanic',
    sprite: 'mechanic',
    codename: '工兵阿鴨',
    title: '戰地工程師',
    heroClass: '工程',
    classColor: '#00f59b',
    classTitle: '戰地工事 / 建築專精',
    role: '防禦工事專精 / 設施建造減免 / 開局戰備金',
    traitName: '工事大師',
    traitDesc: '設施部署費用 -40%、工事耐久 +100%；開局贈送一座機槍砲台與 100 🪙 工程戰備金',
    startWeapon: 'rocket',
    unlockCost: 180,
    accent: '#00f59b',
    lines: {
      start: '藍圖已確認，扳手已就緒！今天要在這片感染廢墟築起鋼鐵防線，嘎！',
      levelup: '新零件到了！這能大幅升級我的戰地設施！',
      evolve: '核彈火箭發射架改裝完成！讓殭屍嚐嚐工程學的浪漫！',
      lowhp: '防線要被衝破了？！戰地工程兵絕不後退！',
      boss: '掃描到超巨型感染體，各砲台、電網與拒馬全力開火！',
      win: '據點防衛完好無損，工程質量五星好評，收工回基地喝機油特調！',
      death: '我的……自動維修板手……螺絲鬆了……嘎……',
    },
    init(player) {
      player.facilityCostMul = 0.6;
      player.facilityHpMul = 2.0;
      player.startBonusGold = 100;
    },
    // 開局贈送一座機槍砲台：工事流派從第一秒就有東西可以指揮。
    // 原本特質只有「費用折扣 + 開局金」＝純經濟，戰鬥上完全沒有差異感。
    startBonus(game) {
      const p = game.player;
      const t = new Turret(p.x + 70, p.y + 20, 'turret');
      t.hp = t.maxHp = Math.round(t.maxHp * (p.facilityHpMul || 1));
      game.turrets.push(t);
      game.particles.createShockwave(t.x, t.y, 90, '#00f59b');
      game.ui.say('🔧 工事大師：開局贈送一座機槍砲台（耐久 ×2）', '#00f59b', 4);
    },
  },
};

export const CHARACTER_ORDER = ['duck', 'rabbit', 'penguin', 'cat', 'mechanic'];
