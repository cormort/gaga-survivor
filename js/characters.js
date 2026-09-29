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
};

export const CHARACTER_ORDER = ['duck', 'rabbit', 'penguin', 'cat', 'mechanic',
  'astartes_duck', 'techpriest_goose',
  'xian_sword', 'xian_talisman', 'xian_mage', 'xian_alchemy', 'xian_zen', 'xian_demon'];
