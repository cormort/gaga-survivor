// 四位特工：外觀 sprite、專屬特質、初始武器與全情境台詞腳本。
// 特質以「鉤子」形式實作，由 Player / Game 在對應時機呼叫。

export const CHARACTERS = {
  duck: {
    id: 'duck',
    sprite: 'duck',
    codename: '007 鴨鴨',
    title: '嘎嘎特工',
    role: '均衡新手推薦 / 單體點殺與極速風箏',
    traitName: '特工風度',
    traitDesc: '移動時 +15% 暴擊率，拾取範圍 +20%',
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
      player.baseMagnet = 1.2;
      player.critChance = 0;
      player.critMovingBonus = 0.15;
    },
    tick(dt, game) {
      const p = game.player;
      // 移動中才享有暴擊加成
      p.critChance = p.walkCycle > 0 ? p.critMovingBonus : 0;
    },
  },

  rabbit: {
    id: 'rabbit',
    sprite: 'rabbit',
    codename: '暴走蘿蔔',
    title: '特工兔兔',
    role: '極限跑速 / 範圍燃燒 / 邊跑邊打',
    traitName: '兔子快跑',
    traitDesc: '跑速每 +10%，全傷害 +5%；奔跑時留下灼燒火痕',
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

      // 腳下火痕：灼燒經過的敵人
      game.particles.createHitSpark(p.x, p.y + 12, '#ff6b00');
      for (const e of game.enemies) {
        if (e.isDead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 42) {
          game.damageEnemy(e, Math.round(6 * p.damageMultiplier), 0, p.x, p.y, 'molotov');
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
    traitName: '厚脂肪裝甲',
    traitDesc: '碰撞傷害 -20%，受擊時裝甲反震引發全場衝擊波',
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
      player.damageTakenMul = 0.8;
    },
    onHit(game) {
      // 護甲反震：全場衝擊波，擊退並輕傷周圍敵人
      const p = game.player;
      game.particles.createShockwave(p.x, p.y, 240, '#9fb3c8');
      game.camera.shake = 10;
      for (const e of game.enemies) {
        if (e.isDead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 240) {
          game.damageEnemy(e, 18, 26, p.x, p.y, 'guardian');
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
    traitName: '超頻過載',
    traitDesc: '擊殺菁英怪 (巨漢/詞綴怪/Boss) 觸發過載，5 秒內所有冷卻減半',
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
      if (game.player.overloadTimer > 0) game.player.overloadTimer -= dt;
    },
    onKill(enemy, game) {
      // 菁英怪 = 生化巨漢 / 詞綴精英 / Boss
      if (enemy.typeKey !== 'brute' && !enemy.isBoss && !enemy.isElite) return;
      game.player.overloadTimer = 5;
      game.particles.createShockwave(game.player.x, game.player.y, 150, '#00e5ff');
      game.ui.say('超頻過載！冷卻減半 5 秒', '#00e5ff');
    },
  },
};

export const CHARACTER_ORDER = ['duck', 'rabbit', 'penguin', 'cat'];
