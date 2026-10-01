// 四位特工：外觀 sprite、專屬特質、初始武器與全情境台詞腳本。
// 特質以「鉤子」形式實作，由 Player / Game 在對應時機呼叫。

import { Turret } from './entities/Turret.js';

export const CHARACTERS = {
  duck: {
    id: 'duck',
    sprite: 'duck',
    codename: '007 鴨鴨',
    title: '呱呱特工',
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

  // ── 戰鎚 40K 遠征英雄 ─────────────────────────────────────────────
  astartes_duck: {
    id: 'astartes_duck',
    sprite: 'astartes_duck',
    codename: '阿斯塔特鴨',
    title: '極限星際特工',
    role: '重型陶鋼裝甲 / 陣地狂怒火力',
    heroClass: '星際戰士',
    classColor: '#0077b6',
    classTitle: '為了帝皇 / 陣地壓制',
    traitName: '卡迪亞不屈',
    traitDesc: '常駐減免 20% 受到的傷害；原地站立超過 0.5 秒或生命低於 50% 時觸發【神聖狂怒】，攻速 +35%、武器擊退 +50%',
    startWeapon: 'bolter',
    unlockCost: 150,
    accent: '#0077b6',
    lines: {
      start: '以帝皇與池塘之名，異形受死！嘎！',
      levelup: '動力裝甲機魂共鳴，火力提升！',
      evolve: '為了帝皇！品嚐神聖風暴的怒火吧！',
      lowhp: '阿斯塔特絕不退縮！痛楚只是虔誠的證明！',
      boss: '異形巨獸休得猖狂，帝皇的裁決降臨了！',
      win: '陣線屹立不倒！勝利屬於帝皇與池塘，嘎！',
      death: '我的職責……至死方休……為了帝皇……',
    },
    init(player) {
      player.damageReduction = 0.2;
      player.standTimer = 0;
      player.maxHp = Math.round(player.maxHp * 1.25);
      player.hp = player.maxHp;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.walkCycle === 0) {
        p.standTimer = (p.standTimer || 0) + dt;
      } else {
        p.standTimer = 0;
      }
      const isHolyFury = (p.standTimer >= 0.5) || (p.hp / p.maxHp < 0.5);
      p.holyFury = isHolyFury;
      p.cooldownMultiplier = isHolyFury ? 0.65 : 1.0;
      p.knockbackMultiplier = isHolyFury ? 1.5 : 1.0;
    },
  },

  techpriest_goose: {
    id: 'techpriest_goose',
    sprite: 'techpriest_goose',
    codename: '機械主教鵝',
    title: '萬機神之僕',
    role: '機械修復 / 伺服灼光 / 減速冷卻液',
    heroClass: '機械神教',
    classColor: '#d90429',
    classTitle: '血肉孱弱 / 機械飛昇',
    traitName: '機魂安撫',
    traitDesc: '每 2.5 秒伺服臂自動修復附近設施與坦克 70 HP，並向最近敵人激發熱熔射線；設施建造費用 -20%',
    startWeapon: 'chainsword',
    unlockCost: 180,
    accent: '#d90429',
    lines: {
      start: '血肉孱弱，唯有機油與齒輪永恆……咕嘎！',
      levelup: '讚美萬機神，神聖代碼重構完畢。',
      evolve: '機魂大悅！神聖解離力場啟動！',
      lowhp: '裝甲受損 35%……正在引導冷卻液……',
      boss: '偵測到未被萬機神淨化的低等生物，執行物理銷毀！',
      win: '協議達成。聖油已灑遍廢墟，讚美歐姆尼賽亞！',
      death: '二進制信號……正在衰退……回歸萬機神……',
    },
    init(player) {
      player.facilityCostMul = 0.8;
      player.servoTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      p.servoTimer = (p.servoTimer || 0) + dt;
      if (p.servoTimer >= 2.5) {
        p.servoTimer = 0;

        // 1. 修復附近設施、坦克或核心
        let targetHeal = null;
        let minD = 300;
        if (game.turrets) {
          for (const t of game.turrets) {
            if (t.isDead || t.hp >= t.maxHp) continue;
            const d = Math.hypot(t.x - p.x, t.y - p.y);
            if (d < minD) { minD = d; targetHeal = t; }
          }
        }
        if (targetHeal) {
          targetHeal.hp = Math.min(targetHeal.maxHp, targetHeal.hp + 70);
          game.particles.createShockwave(targetHeal.x, targetHeal.y, 35, '#00f59b');
        }

        // 2. 伺服灼光熱熔射線攻擊最近敵人
        if (game.enemies && game.enemies.length) {
          let closest = null;
          let closeD = 280;
          for (const e of game.enemies) {
            if (e.isDead) continue;
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < closeD) { closeD = d; closest = e; }
          }
          if (closest) {
            closest.takeDamage(65, 8, p.x, p.y);
            game.particles.createDamageText(closest.x, closest.y, 65, true);
            game.particles.createShockwave(closest.x, closest.y, 25, '#ff5400');
          }
        }
      }
    },
  },

  // ── 修仙六脈 (貼圖來自 assets/xian/，攻擊沿用對應武器) ────────────────
  xian_sword: {
    id: 'xian_sword', sprite: 'xian_sword',
    codename: '劍修', title: '御劍劍修',
    role: '飛劍穿梭 / 移動暴擊',
    heroClass: '劍修', classColor: '#6ea8ff', classTitle: '人劍合一 / 快劍點殺',
    traitName: '劍心通明',
    traitDesc: '常駐 +20% 暴擊率，移動中再 +20%；移速 +10%',
    startWeapon: 'phase_blade', unlockCost: 200, accent: '#6ea8ff',
    lines: {
      start: '三尺青鋒出鞘，今夜斬妖除魔。',
      levelup: '劍意又進一層，再來！',
      evolve: '萬劍歸宗！',
      lowhp: '劍心未亂，還能再戰。',
      boss: '妖王？正好試我新劍。',
      win: '收劍歸鞘，此山已清。',
      death: '劍……折了……',
    },
    init(player) { player.baseSpeedMul = 1.1; },
    tick(dt, game) {
      const p = game.player;
      p.critChance = 0.2 + (p.walkCycle > 0 ? 0.2 : 0);
    },
  },

  xian_talisman: {
    id: 'xian_talisman', sprite: 'xian_talisman',
    codename: '符修', title: '符籙真人',
    role: '飛符連發 / 爆發傷害',
    heroClass: '符修', classColor: '#ff6b5e', classTitle: '符火連環 / 爆發輸出',
    traitName: '符火燎原',
    traitDesc: '全傷害 +15%；每 30 殺引燃一次符火，周圍妖獸受到 40 + 20% 最大生命的傷害',
    startWeapon: 'kunai', unlockCost: 220, accent: '#ff6b5e',
    lines: {
      start: '一紙符籙，敕令天火！',
      levelup: '再畫一道新符。',
      evolve: '天火符陣，急急如律令！',
      lowhp: '符紙快用完了……',
      boss: '大妖？就用爆炎符招呼你！',
      win: '符散火熄，妖邪退散。',
      death: '符……燒盡了……',
    },
    init(player) { player.talismanKills = 0; },
    tick(dt, game) { game.player.traitDmgMul = 1.15; },
    onKill(enemy, game) {
      const p = game.player;
      p.talismanKills = (p.talismanKills || 0) + 1;
      if (p.talismanKills < 30) return;
      p.talismanKills = 0;
      game.particles.createShockwave(p.x, p.y, 200, '#ff6b5e');
      const dmg = Math.round(40 + p.maxHp * 0.2);
      for (const e of game.enemies) {
        if (!e.isDead && Math.hypot(e.x - p.x, e.y - p.y) < 200) game.damageEnemy(e, dmg, 12, p.x, p.y, 'kunai');
      }
    },
  },

  xian_mage: {
    id: 'xian_mage', sprite: 'xian_mage',
    codename: '法修', title: '雷法天師',
    role: '天雷法陣 / 範圍連鎖',
    heroClass: '法修', classColor: '#e8e8e8', classTitle: '五雷正法 / 群體控場',
    traitName: '法力無邊',
    traitDesc: '全傷害 +10%；每 20 殺頓悟一次：6 秒內傷害 +30%',
    startWeapon: 'lightning', unlockCost: 240, accent: '#dfe6ff',
    lines: {
      start: '天地法則，聽我號令。',
      levelup: '參悟新的法訣。',
      evolve: '五雷轟頂！',
      lowhp: '法力將竭……',
      boss: '讓你見識何謂天威。',
      win: '法陣收起，塵埃落定。',
      death: '道……未成……',
    },
    init(player) { player.enlightenTimer = 0; player.mageKills = 0; },
    tick(dt, game) {
      const p = game.player;
      if (p.enlightenTimer > 0) p.enlightenTimer -= dt;
      p.traitDmgMul = p.enlightenTimer > 0 ? 1.4 : 1.1;
    },
    onKill(enemy, game) {
      const p = game.player;
      p.mageKills = (p.mageKills || 0) + 1;
      if (p.mageKills < 20) return;
      p.mageKills = 0;
      p.enlightenTimer = 6;
      game.particles.createShockwave(p.x, p.y, 150, '#dfe6ff');
    },
  },

  xian_alchemy: {
    id: 'xian_alchemy', sprite: 'xian_alchemy',
    codename: '丹修', title: '青囊丹師',
    role: '丹火灼燒 / 持續回復',
    heroClass: '丹修', classColor: '#3ddc84', classTitle: '丹火煉妖 / 以戰養戰',
    traitName: '九轉還丹',
    traitDesc: '生命上限 +20；每秒回復 1% 最大生命',
    startWeapon: 'molotov', unlockCost: 200, accent: '#3ddc84',
    lines: {
      start: '丹爐已熱，今夜煉妖成丹。',
      levelup: '得一味新藥材。',
      evolve: '九轉金丹，成了！',
      lowhp: '先服一顆回春丹……',
      boss: '這妖丹品相不錯。',
      win: '收爐！此行收穫頗豐。',
      death: '丹……炸爐了……',
    },
    init(player) { player.maxHp = 120; player.hp = 120; player.pillTimer = 0; },
    tick(dt, game) {
      const p = game.player;
      p.pillTimer = (p.pillTimer || 0) + dt;
      if (p.pillTimer >= 1) {
        p.pillTimer = 0;
        if (p.hp < p.maxHp) p.heal(p.maxHp * 0.01);
      }
    },
  },

  xian_zen: {
    id: 'xian_zen', sprite: 'xian_zen',
    codename: '禪修', title: '金剛禪師',
    role: '佛光護體 / 近身肉盾',
    heroClass: '禪修', classColor: '#ffd166', classTitle: '金剛不壞 / 佛光普照',
    traitName: '金剛不壞',
    traitDesc: '生命上限 140、受到傷害 -30%，但移速 -10%',
    startWeapon: 'guardian', unlockCost: 220, accent: '#ffd166',
    lines: {
      start: '阿彌陀佛，施主請回頭。',
      levelup: '禪定又深一分。',
      evolve: '佛光普照，萬邪不侵！',
      lowhp: '色即是空……痛也是空……',
      boss: '貧僧今日要開殺戒了。',
      win: '善哉，妖魔盡散。',
      death: '貧僧……先行圓寂……',
    },
    init(player) { player.maxHp = 140; player.hp = 140; player.damageTakenMul = 0.7; player.baseSpeedMul = 0.9; },
  },

  xian_demon: {
    id: 'xian_demon', sprite: 'xian_demon',
    codename: '魔修', title: '血魔妖姬',
    role: '魔氣射線 / 越殘越強',
    heroClass: '魔修', classColor: '#b388ff', classTitle: '以血換力 / 殘血爆發',
    traitName: '血魔大法',
    traitDesc: '全傷害 +15%；生命低於 50% 時改為 +50%，但受到傷害 +15%',
    startWeapon: 'annihilation_beam', unlockCost: 300, accent: '#b388ff',
    lines: {
      start: '正道？那是什麼？',
      levelup: '魔功再進一層。',
      evolve: '天魔解體！',
      lowhp: '呵……血越少，我越強。',
      boss: '你的妖丹，我收下了。',
      win: '這山頭，以後歸我。',
      death: '魔心……不滅……',
    },
    init(player) { player.damageTakenMul = 1.15; },
    tick(dt, game) {
      const p = game.player;
      p.traitDmgMul = p.hp < p.maxHp * 0.5 ? 1.5 : 1.15;
    },
  },

  // ── 12 生肖正道特工 (Zodiac Heroes) ──
  rat_hero: {
    id: 'rat_hero', sprite: 'rat_hero',
    codename: '天機靈鼠', title: '忍術特工',
    role: '極速暴擊 / 暗影疾行 / 穿透連擊',
    heroClass: '刺客', classColor: '#00f5d4', classTitle: '極速暴擊 / 暗影遁影',
    traitName: '子鼠穿雲',
    traitDesc: '移速 +15%，暴擊率 +20%；每次暴擊後 2 秒內移速再 +30%、拾取範圍 +50%',
    startWeapon: 'kunai', unlockCost: 200, accent: '#00f5d4',
    lines: {
      start: '天機已動，神出鬼沒！暗夜正是子鼠的狩獵場！',
      levelup: '影忍奧義再進一步，手裡劍更利了！',
      evolve: '天機極限解放！萬千穿影，看你們往哪躲！',
      lowhp: '切……這點擦傷算什麼，別眨眼，我隨時會從背後出現！',
      boss: '塊頭大只不過是更容易被扎成刺蝟罷了！',
      win: '任務完成，遁入虛空！不留一絲痕跡～',
      death: '可惡……算漏了一步……影分身……消散……',
    },
    init(player) {
      player.baseSpeedMul = 1.15;
      player.critChance = 0.20;
      player.ratSpeedTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.ratSpeedTimer > 0) {
        p.ratSpeedTimer -= dt;
        p.speedMul = 1.45;
        p.magnetMul = 1.5;
      } else {
        p.speedMul = 1.15;
        p.magnetMul = 1.0;
      }
    },
  },

  ox_hero: {
    id: 'ox_hero', sprite: 'ox_hero',
    codename: '撼地金牛', title: '玄甲重衛',
    role: '極限減傷 / 衝擊反震 / 萬夫莫敵',
    heroClass: '重裝', classColor: '#ffb703', classTitle: '鋼鐵重盾 / 震地破甲',
    traitName: '丑牛撼地',
    traitDesc: '生命上限 +50、受到傷害 -25%；受傷時觸發金鐘反震波震碎周圍敵人',
    startWeapon: 'guardian', unlockCost: 220, accent: '#ffb703',
    lines: {
      start: '金牛踏地，山崩地裂！誰敢擋我一步！',
      levelup: '玄甲加固，巨角愈利！無可阻擋！',
      evolve: '金牛神尊現世！萬魔伏誅！',
      lowhp: '這點力道……不過是給我搔癢罷了！吼！',
      boss: '看是你的骨頭硬，還是我的金角利！撞過去！',
      win: '踏平一切障礙！沒有什麼是一蹄子解決不了的！',
      death: '老牛……力竭矣……但此陣……絕不能破……',
    },
    init(player) {
      player.maxHp = 150;
      player.hp = 150;
      player.damageTakenMul = 0.75;
      player.oxShockCd = 0;
    },
    tick(dt) {
      const p = game.player;
      if (p.oxShockCd > 0) p.oxShockCd -= dt;
    },
    onHit(game) {
      const p = game.player;
      if (p.oxShockCd > 0) return;
      p.oxShockCd = 1.0;
      game.particles.createShockwave(p.x, p.y, 250, '#ffb703');
      game.camera.shake = 12;
      const dmg = Math.round(25 + p.maxHp * 0.2);
      for (const e of game.enemies) {
        if (!e.isDead && Math.hypot(e.x - p.x, e.y - p.y) < 250) {
          game.damageEnemy(e, dmg, 30, p.x, p.y, 'guardian');
        }
      }
    },
  },

  tiger_hero: {
    id: 'tiger_hero', sprite: 'tiger_hero',
    codename: '破邪白虎', title: '嘯天宗師',
    role: '武道極致 / 範圍虎嘯 / 霸體增傷',
    heroClass: '格鬥', classColor: '#7fd8ff', classTitle: '虎嘯生風 / 破甲拳罡',
    traitName: '寅虎嘯天',
    traitDesc: '全傷害 +25%；每擊殺 20 隻敵人發出白虎震天吼，震退並重創全螢幕敵人',
    startWeapon: 'katana', unlockCost: 240, accent: '#7fd8ff',
    lines: {
      start: '風從虎，雲從龍！白虎門弟子，在此領教群魔！',
      levelup: '拳罡入微，爪風如刀！',
      evolve: '神威白虎！百步之內，寸草不生！',
      lowhp: '負傷的老虎才是最凶猛的！放馬過來！',
      boss: '吼！你身上的煞氣，正是最配我虎爪的磨刀石！',
      win: '妖邪退散！白虎鎮世，天下太平！',
      death: '浩氣長存……白虎之魂……永不低頭……',
    },
    init(player) {
      player.tigerKillCount = 0;
      player.baseDmgMul = (player.baseDmgMul || 1) * 1.25;
    },
  },

  rabbit_hero: {
    id: 'rabbit_hero', sprite: 'rabbit_hero',
    codename: '月宮仙兔', title: '穿雲遊俠',
    role: '高頻彈幕 / 躍影疾射 / 超遠射程',
    heroClass: '遊俠', classColor: '#ff758f', classTitle: '月影疾風 / 穿雲飛矢',
    traitName: '卯兔凌波',
    traitDesc: '投射物速度 +35%、射程 +25%；翻滾冷卻 -40%',
    startWeapon: 'boomerang', unlockCost: 240, accent: '#ff758f',
    lines: {
      start: '月宮特訓不是白練的！吃我一發超光速月影狙擊！',
      levelup: '月光能量補給到位！射程拉滿！',
      evolve: '滿月之怒！月華漫天，貫穿萬物！',
      lowhp: '耳朵都要被震麻了……但我的準星可不會抖！',
      boss: '大塊頭！月光照耀之處，就是你的死穴！',
      win: '任務圓滿完成！回月宮喝杯桂花酒慶祝一下囉～',
      death: '月影……黯淡了……抱歉……我先跳一步了……',
    },
    init(player) {
      player.projSpeedMul = 1.35;
      player.dashCooldownMul = 0.6;
    },
  },

  dragon_hero: {
    id: 'dragon_hero', sprite: 'dragon_hero',
    codename: '蒼龍天尊', title: '九霄龍皇',
    role: '天罰雷劫 / 龍魂領域 / 滅世風暴',
    heroClass: '法聖', classColor: '#00f59b', classTitle: '九天雷劫 / 真龍龍息',
    traitName: '辰龍降世',
    traitDesc: '冷卻縮減 +20%、技能範圍 +30%；每 4 秒降下一道真龍天罰雷重創場上最強敵首',
    startWeapon: 'lightning', unlockCost: 350, accent: '#00f59b',
    lines: {
      start: '吾乃九天蒼龍！爾等邪魔宵小，還不速速伏法！',
      levelup: '龍力湧現，風雷匯聚！',
      evolve: '真龍現世，萬古雷動！九霄天劫，落！',
      lowhp: '真龍之軀，豈容宵小褻瀆！雷霆，聽我號令！',
      boss: '孽障！在真龍威壓之下顫抖吧！',
      win: '龍嘯九天，風平浪靜。邪魔外道，不堪一擊。',
      death: '龍魂歸墟……九霄……終將再臨……',
    },
    init(player) {
      player.cooldownReduction = 0.20;
      player.dragonThunderTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      p.dragonThunderTimer = (p.dragonThunderTimer || 0) + dt;
      if (p.dragonThunderTimer >= 4.0) {
        p.dragonThunderTimer = 0;
        let target = null;
        let maxHp = 0;
        for (const e of game.enemies) {
          if (!e.isDead && e.hp > maxHp) {
            maxHp = e.hp;
            target = e;
          }
        }
        if (target) {
          game.particles.createLightningLink(target.x, target.y - 120, target.x, target.y, '#00f59b');
          game.particles.createShockwave(target.x, target.y, 100, '#00f59b');
          game.damageEnemy(target, Math.round(90 + (p.level || 1) * 15), 20, target.x, target.y, 'lightning');
        }
      }
    },
  },

  snake_hero: {
    id: 'snake_hero', sprite: 'snake_hero',
    codename: '幽篁青蛇', title: '毒煞仙子',
    role: '劇毒蔓延 / 腐蝕擴散 / 疊層爆發',
    heroClass: '毒師', classColor: '#52b788', classTitle: '青幽曼陀 / 萬毒歸宗',
    traitName: '巳蛇幽步',
    traitDesc: '所有中毒傷害 +60%；中毒致死的敵人會爆發劇毒毒池擴散感染周圍目標',
    startWeapon: 'molotov', unlockCost: 260, accent: '#52b788',
    lines: {
      start: '嘶……青竹蛇兒口，黃蜂尾上針。兩般尤未毒，最毒是妾心～',
      levelup: '幽毒提純，見血封喉。',
      evolve: '萬毒萬蠱！讓這片大地化作劇毒之海吧～',
      lowhp: '惹惱了毒蛇，後果可是很嚴重的哦……嘶……',
      boss: '體型再大，毒素滲入心脈也只需三息。乖乖躺下吧。',
      win: '咯咯咯～都化作妾身靈蛇的養料吧。',
      death: '蛇蛻……未成……此毒……反噬自身……',
    },
    init(player) {
      player.poisonDmgMul = 1.6;
    },
  },

  horse_hero: {
    id: 'horse_hero', sprite: 'horse_hero',
    codename: '天駟神駒', title: '聖芒騎士',
    role: '無限馳騁 / 奔雷踐踏 / 衝鋒光環',
    heroClass: '騎兵', classColor: '#ffd166', classTitle: '奔雷極速 / 聖光踐踏',
    traitName: '午馬破軍',
    traitDesc: '基礎移速 +25%；奔馳時前方帶有聖芒衝撞力場，直接碾壓路徑上的敵人',
    startWeapon: 'drone', unlockCost: 260, accent: '#ffd166',
    lines: {
      start: '蹄聲雷動，破陣前鋒！天駟騎士，衝鋒！',
      levelup: '馬踏飛燕，長槍貫日！',
      evolve: '天馬破軍！聖芒閃耀，萬軍莫阻！',
      lowhp: '白馬義從，死戰不退！再衝一次！',
      boss: '任你重兵據守，天駟神駒照樣踏破敵營！殺！',
      win: '全線大捷！長驅直入，橫掃千軍！',
      death: '馬失前蹄……戰魂……仍馳騁在原野……',
    },
    init(player) {
      player.baseSpeedMul = 1.25;
      player.horseStompTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.walkCycle > 0) {
        p.horseStompTimer = (p.horseStompTimer || 0) + dt;
        if (p.horseStompTimer >= 0.4) {
          p.horseStompTimer = 0;
          for (const e of game.enemies) {
            if (!e.isDead && Math.hypot(e.x - p.x, e.y - p.y) < 48) {
              game.damageEnemy(e, 20, 15, p.x, p.y, 'drone');
            }
          }
        }
      }
    },
  },

  goat_hero: {
    id: 'goat_hero', sprite: 'goat_hero',
    codename: '青丘靈羊', title: '妙手仙尊',
    role: '靈泉回春 / 護盾庇佑 / 祥瑞庇護',
    heroClass: '神官', classColor: '#b8c0ff', classTitle: '祥雲瑞氣 / 萬物回生',
    traitName: '未羊吉瑞',
    traitDesc: '每 2.5 秒自動回復 2% 最大生命；受到傷害時 30% 機率召喚祥雲護體免傷',
    startWeapon: 'frost_orb', unlockCost: 280, accent: '#b8c0ff',
    lines: {
      start: '祥雲飄渺，吉瑞呈祥。願靈泉甘霖洗去世間污濁。',
      levelup: '藥香入骨，神魂寧靜。',
      evolve: '九品淨世甘露！萬物逢春，邪魔退散！',
      lowhp: '莫慌，心若如水，生生不息……服一顆還魂草。',
      boss: '戾氣如此深重，就由貧道以靈泉化解你的執念吧。',
      win: '濁氣已清，靈山重見天日。善哉善哉。',
      death: '羽化登仙……化作春泥……護佑人間……',
    },
    init(player) {
      player.goatHealTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      p.goatHealTimer = (p.goatHealTimer || 0) + dt;
      if (p.goatHealTimer >= 2.5) {
        p.goatHealTimer = 0;
        if (p.hp < p.maxHp) p.heal(Math.round(p.maxHp * 0.02));
      }
    },
  },

  monkey_hero: {
    id: 'monkey_hero', sprite: 'monkey_hero',
    codename: '齊天大聖', title: '萬妖之王',
    role: '定海神針 / 金猴分身 / 狂暴金身',
    heroClass: '神將', classColor: '#ff9e00', classTitle: '如意金箍 / 法相天地',
    traitName: '申猴齊天',
    traitDesc: '全武器攻擊範圍 +35%，擊退力 +100%；生命低於 30% 時大聖金身 5 秒無敵且暴擊 100%',
    startWeapon: 'flame_orbit', unlockCost: 350, accent: '#ff9e00',
    lines: {
      start: '俺老孫來也！吃俺老孫一棒！',
      levelup: '金箍棒再重三千斤！痛快痛快！',
      evolve: '大鬧天宮！七十二變，翻江倒海！',
      lowhp: '哼，俺老孫銅頭鐵臂火眼金睛，這點小傷算什麼！',
      boss: '哪裡跑！吃俺老孫一記如意金箍棒！',
      win: '哈哈哈！一個能打的都沒有！收工回花果山吃仙桃囉！',
      death: '金身……碎裂……回花果山……歇歇……',
    },
    init(player) {
      player.monkeyGoldUsed = false;
      player.monkeyGoldTimer = 0;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.monkeyGoldTimer > 0) {
        p.monkeyGoldTimer -= dt;
        p.invincible = true;
        p.critChance = 1.0;
      } else if (!p.monkeyGoldUsed && p.hp < p.maxHp * 0.3) {
        p.monkeyGoldUsed = true;
        p.monkeyGoldTimer = 5.0;
        game.particles.createShockwave(p.x, p.y, 200, '#ff9e00');
      }
    },
  },

  rooster_hero: {
    id: 'rooster_hero', sprite: 'rooster_hero',
    codename: '破曉金雞', title: '金烏神衛',
    role: '烈陽光刃 / 破曉之鳴 / 驅逐陰邪',
    heroClass: '劍豪', classColor: '#e63946', classTitle: '破曉金啼 / 烈焰狂斬',
    traitName: '酉雞報曉',
    traitDesc: '暴擊傷害 +50%；每擊殺 50 隻敵人觸發破曉真陽，全場爆燃引發巨量烈焰傷害',
    startWeapon: 'annihilation_beam', unlockCost: 280, accent: '#e63946',
    lines: {
      start: '雄雞一聲天下白！破曉真火，焚盡陰邪！',
      levelup: '烈陽劍氣，純陽無極！',
      evolve: '金烏降世！大日凌空，群魔灰飛煙滅！',
      lowhp: '羽毛帶血，神采更昂！破曉之前最是黑暗！',
      boss: '陰煞巨妖？在純陽烈日下化作飛灰吧！',
      win: '金啼破曉，陽光普照！黑暗再無容身之處！',
      death: '夕陽西下……待到明朝……再鳴破曉……',
    },
    init(player) {
      player.critDmgMul = (player.critDmgMul || 1.5) + 0.5;
    },
  },

  dog_hero: {
    id: 'dog_hero', sprite: 'dog_hero',
    codename: '忠勇義犬', title: '星際先鋒',
    role: '警戒戰術 / 槍火支援 / 忠誠守護',
    heroClass: '特種', classColor: '#48cae4', classTitle: '精準彈幕 / 星際搜救',
    traitName: '戌狗忠誠',
    traitDesc: '拾取範圍 +50%，經驗獲取 +25%；常駐呼叫空投雷達，地圖資源刷新率提升',
    startWeapon: 'railgun', unlockCost: 280, accent: '#48cae4',
    lines: {
      start: '汪！警犬特工隊已就緒！嗅到危險的氣味了，出發！',
      levelup: '戰術背心升級，雷達靈敏度已達到最高！',
      evolve: '極限突擊協議啟動！星際警犬，全面出擊！',
      lowhp: '汪嗚……絕不退縮！特工守則第一條，誓死守衛前線！',
      boss: '目標已被精準咬定！呼叫高空軌道打擊！',
      win: '區域威脅已肅清！任務完成，呼叫肉骨頭獎勵～',
      death: '雷達訊號……中斷……但我……守護住了……大家……',
    },
    init(player) {
      player.baseMagnet = 1.5;
      player.expMul = 1.25;
    },
  },

  pig_hero: {
    id: 'pig_hero', sprite: 'pig_hero',
    codename: '天蓬元帥', title: '福澤神將',
    role: '暴食回復 / 九齒釘耙 / 橫掃千軍',
    heroClass: '先鋒', classColor: '#ff758f', classTitle: '天蓬神威 / 暴食吞天',
    traitName: '亥豬吞天',
    traitDesc: '生命上限 +40；拾取金幣與經驗時 20% 機率直接回血 3 點；生命越高傷害越強',
    startWeapon: 'rocket', unlockCost: 300, accent: '#ff758f',
    lines: {
      start: '天河水軍大元帥在此！九齒釘耙動一動，妖魔鬼怪抖三抖！',
      levelup: '這伙食不錯！耙子更有勁了！',
      evolve: '天蓬真君顯聖！萬丈狂瀾，吞天食地！',
      lowhp: '哎呀肚子餓了……快拿些大魚大肉來補一補！',
      boss: '就你這小妖也敢在元帥面前耀武揚威？吃老豬一耙！',
      win: '打完收工！快快備下百桌御宴，老豬要大吃三天三夜！',
      death: '哎喲……西天路遠……老豬……走不動了……',
    },
    init(player) {
      player.maxHp = 140;
      player.hp = 140;
    },
    tick(dt, game) {
      const p = game.player;
      p.traitDmgMul = 1.0 + Math.max(0, (p.maxHp - 100) * 0.003);
    },
  },

  arthur: {
    id: 'arthur',
    sprite: 'arthur',
    codename: '亞瑟',
    title: '魔界騎士',
    role: '重甲破邪 / 投擲長矛 / 絕境爆衣不屈',
    heroClass: '前鋒',
    classColor: '#4cc9f0',
    classTitle: '重甲破邪 / 絕境不屈',
    traitName: '黃金聖鎧與草莓四角褲',
    traitDesc: '常駐減傷 25%；受致命傷時鎧甲碎裂爆發聖光擊退全場，獲得 2.5 秒無敵與 +50% 移速 (每局 2 次)',
    startWeapon: 'kunai',
    unlockCost: 0,
    accent: '#4cc9f0',
    lines: {
      start: '為了王國與公主的誓言！魔界的妖孽們，休想越過亞瑟的長矛！',
      levelup: '聖光庇佑！騎士的長矛更加鋒芒銳利！',
      evolve: '這就是黃金聖鎧的終極力量！破邪穿刺——！',
      lowhp: '鎧甲快碎了……可惡！難道又要只穿四角褲戰鬥了嗎？！',
      boss: '魔界領主現身了！以王國騎士之名，受死吧！',
      win: '魔界的妖霧散去了……公主，亞瑟凱旋而歸！',
      death: '我的鎧甲……我的草莓四角褲……不甘心啊……',
    },
    init(player) {
      player.armor = (player.armor || 0) + 4;
      player.arthurRevives = 2;
      player.arthurInvulnTimer = 0;
    },
    passive(player) {
      player.damageReduction = (player.damageReduction || 0) + 0.25;
    },
    tick(dt, game) {
      const p = game.player;
      if (p.arthurInvulnTimer > 0) {
        p.arthurInvulnTimer -= dt;
        p.invulnerable = true;
        if (p.arthurInvulnTimer <= 0) {
          p.speedMultiplier /= 1.5;
        }
      }
      // 爆衣不屈機制：當 HP 歸零且還有次數時爆發聖光脫困
      if (p.hp <= 0 && p.arthurRevives > 0) {
        p.arthurRevives--;
        p.hp = Math.round(p.maxHp * 0.45);
        p.arthurInvulnTimer = 2.5;
        p.speedMultiplier *= 1.5;
        game.floatingText?.(p.x, p.y - 40, '💥 鎧甲爆裂！草莓四角褲出擊！', '#ffd166');
        game.sound?.playLevelUp?.();
        for (const e of game.enemies) {
          if (e.isDead) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 350) {
            game.damageEnemy(e, Math.round(180 * p.damageMultiplier), 18, p.x, p.y, 'holy');
          }
        }
      }
    },
  },
};

export const CHARACTER_ORDER = [
  'duck', 'rabbit', 'penguin', 'cat', 'mechanic',
  'astartes_duck', 'techpriest_goose',
  'arthur',
  'xian_sword', 'xian_talisman', 'xian_mage', 'xian_alchemy', 'xian_zen', 'xian_demon',
  // 12 生肖特工
  'rat_hero', 'ox_hero', 'tiger_hero', 'rabbit_hero', 'dragon_hero', 'snake_hero',
  'horse_hero', 'goat_hero', 'monkey_hero', 'rooster_hero', 'dog_hero', 'pig_hero',
];
