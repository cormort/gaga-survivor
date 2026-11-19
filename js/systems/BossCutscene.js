// ============================================================================
// BossCutscene.js - 忍者龍劍傳風格 首領登場電影過場系統 (Ninja Gaiden Cinema Scenes)
// ============================================================================
// 靈感源自紅白機 (FC/NES)《忍者龍劍傳》(Ninja Gaiden) 的經典 TECMO Theater 電影式過場：
// 1. 寬螢幕劇院黑邊 (Cinematic Letterbox) 切入，帶有復古警告邊框與警示條
// 2. 招牌橫切眼部特寫 (Extreme Eye-Close-Up Slit)：殺氣騰騰的眼神特寫、瞳孔光焰、速度線與雷電閃光
// 3. 多重分鏡切換 (Multi-panel Cinema Cuts)：剪影降臨 → 眼神橫切特寫 → 霸氣半身立繪與震撼對白
// 4. 復古對話字卡 (Narrative Dialogue Card)：打字機音效、專屬首領戰意狂言、威脅評級與日式街機字體
// 5. 支援點擊螢幕或按 Space/Enter 瞬間跳過 (Skip)，不拖泥帶水，戰鬥無縫銜接
// ============================================================================

import { sound } from '../audio.js';
import { getSprite, firstSpriteKey } from '../sprites.js';

// 各關卡首領專屬設定庫 (涵蓋 11 大主線關卡、無盡模式與塔防/戰鎚首領)
export const BOSS_CINEMA_PROFILES = {
  // ── 魔化十二生肖（無盡模式專屬，endlessOwn：深淵前綴時保留自己的台詞）──
  '魔化子鼠': {
    title: '【魔化生肖・鼠疫之源】',
    code: 'PLAGUE RAT KING // THREAT: S',
    quote: '吱吱……千萬子孫將啃光你的骨頭！',
    themeColor: '#a700ff',
    accentColor: '#e0aaff',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化丑牛': {
    title: '【魔化生肖・裂地蠻王】',
    code: 'EARTHSPLITTER OX // THREAT: S',
    quote: '哞——！大地會在我的蹄下裂開，把你吞進去！',
    themeColor: '#c9a227',
    accentColor: '#ffd166',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化寅虎': {
    title: '【魔化生肖・煉獄猛虎】',
    code: 'INFERNO TIGER // THREAT: S',
    quote: '你的影子……就是我下一口的獵物。',
    themeColor: '#ff5400',
    accentColor: '#ffb703',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化卯兔': {
    title: '【魔化生肖・血月冰兔】',
    code: 'BLOOD MOON HARE // THREAT: S',
    quote: '月亮碎了，冰會替我把你封起來。',
    themeColor: '#4cc9f0',
    accentColor: '#ff4d6d',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化辰龍': {
    title: '【魔化生肖・深淵邪龍】',
    code: 'ABYSSAL DRAGON // THREAT: S',
    quote: '渺小的鴨子，在龍息裡化為灰燼吧！',
    themeColor: '#7209b7',
    accentColor: '#ff7b00',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化巳蛇': {
    title: '【魔化生肖・五毒蛇母】',
    code: 'VENOM SERPENT // THREAT: S',
    quote: '嘶……每一步，都踩在我的毒涎上。',
    themeColor: '#38b000',
    accentColor: '#b5179e',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化午馬': {
    title: '【魔化生肖・烈焰魔駒】',
    code: 'HELLFIRE STEED // THREAT: S',
    quote: '追不上的……我的鐵蹄只會留下火海！',
    themeColor: '#ff4800',
    accentColor: '#ffd166',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化未羊': {
    title: '【魔化生肖・巴弗煞羊】',
    code: 'BAPHOMET RAM // THREAT: S',
    quote: '在羊角結界裡，你的攻擊只是搔癢。',
    themeColor: '#9c19e6',
    accentColor: '#e0aaff',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化申猴': {
    title: '【魔化生肖・六耳魔猿】',
    code: 'SIX-EARED APE // THREAT: SS',
    quote: '七十二變……你猜得到我下一次在哪嗎？',
    themeColor: '#e01e37',
    accentColor: '#00e5ff',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化酉雞': {
    title: '【魔化生肖・亡骨魔雞】',
    code: 'BONE ROOSTER // THREAT: SS',
    quote: '金雞報曉之時，就是你的末日。',
    themeColor: '#ffd60a',
    accentColor: '#00e5ff',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化戌狗': {
    title: '【魔化生肖・地獄犬王】',
    code: 'HELLHOUND ALPHA // THREAT: SS',
    quote: '群狼已經聞到你的血了。',
    themeColor: '#dc2f02',
    accentColor: '#ffb703',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  '魔化亥豬': {
    title: '【魔化生肖・暴食戰彘】',
    code: 'GLUTTON BOAR // THREAT: SS',
    quote: '吃掉你……再吃掉這整個深淵！',
    themeColor: '#b5179e',
    accentColor: '#ff758f',
    bgType: 'voidroad',
    eyeColor: '#ff0055',
    endlessOwn: true,
  },
  // ── 關卡 1：淪陷商業街 ──
  '狂暴推土喪屍': {
    title: '【淪陷街區・二階惡霸】',
    code: 'RAMPAGING BULLDOZER // THREAT: A',
    quote: '鋼筋水泥與廢鐵……將把你徹底碾碎成肉泥！',
    themeColor: '#ff6b35',
    accentColor: '#f7c59f',
    bgType: 'street',
    eyeColor: '#ff2200',
  },
  '變異清潔工': {
    title: '【深夜死神・腐化清道夫】',
    code: 'MUTANT CLEANER // THREAT: S',
    quote: '清理……必須徹底清理掉這座城市所有活著的害蟲……',
    themeColor: '#38b000',
    accentColor: '#70e000',
    bgType: 'street',
    eyeColor: '#00ff66',
  },
  '巨神‧暴虐霸王龍': {
    title: '【遠古災厄・終極暴虐龍】',
    code: 'TYRANT APEX PREDATOR // THREAT: SSS',
    quote: '吼————！在史前霸主的暴虐撕咬下顫抖吧！',
    themeColor: '#d90429',
    accentColor: '#ff4d6d',
    bgType: 'street_fire',
    eyeColor: '#ff0033',
  },

  // ── 關卡 2：生化實驗所 ──
  '生化軟泥聚合體': {
    title: '【培養皿之禍・原生聚合質】',
    code: 'BIO-SLIME PRIME // THREAT: A',
    quote: '融入我們……成為母體永恆而溫暖的血肉養分……',
    themeColor: '#00f5d4',
    accentColor: '#7bf1a8',
    bgType: 'lab',
    eyeColor: '#00ff88',
  },
  '外骨骼改造猩猩': {
    title: '【生化戰兵・外骨骼狂猿】',
    code: 'CYBORG CYCLOPS PRIMATE // THREAT: S',
    quote: '純粹的機械基因強化……特工鴨，你的速度根本毫無意義！',
    themeColor: '#ffd166',
    accentColor: '#ff9f1c',
    bgType: 'lab',
    eyeColor: '#ffe600',
  },
  '母體‧零號實驗體': {
    title: '【生化災變之源・零號異變種】',
    code: 'SPECIMEN ZERO // THREAT: SSS',
    quote: '所有生物數據皆已解析完畢……特工，你的基因將歸我所有！',
    themeColor: '#b5179e',
    accentColor: '#f72585',
    bgType: 'lab_core',
    eyeColor: '#c77dff',
  },

  // ── 關卡 3：極地防線 ──
  '冰霜機甲': {
    title: '【極地重壁・零度防衛機】',
    code: 'ABSOLUTE ZERO MECHA // THREAT: A',
    quote: '入侵者體溫鎖定。立即執行永久冷凍封存協議。',
    themeColor: '#4cc9f0',
    accentColor: '#caf0f8',
    bgType: 'frost',
    eyeColor: '#00f0ff',
  },
  '極地穿山甲王': {
    title: '【萬年凍土・鑽地裂爪】',
    code: 'PERMAFROST RIPPER // THREAT: S',
    quote: '在萬年凍土之下，沒有任何獵物能逃出我的碎骨利爪！',
    themeColor: '#48cae4',
    accentColor: '#90e0ef',
    bgType: 'frost',
    eyeColor: '#70d6ff',
  },
  '冰霜暴君‧雪帝': {
    title: '【極北主宰・萬載霜王】',
    code: 'BLIZZARD EMPEROR // THREAT: SSS',
    quote: '萬里霜寒……暴風雪將掩埋你的身軀，長眠於極北吧！',
    themeColor: '#00b4d8',
    accentColor: '#ade8f4',
    bgType: 'frost_storm',
    eyeColor: '#d0f4de',
  },

  // ── 關卡 4：地心核心 ──
  '烈焰暴君': {
    title: '【地脈怒火・岩漿化身】',
    code: 'INFERNAL OVERLORD // THREAT: A',
    quote: '讓地心奔騰的滾燙熔岩……將你化為焦黑的灰燼！',
    themeColor: '#f77f00',
    accentColor: '#fcbf49',
    bgType: 'core',
    eyeColor: '#ff4800',
  },
  '熔核巨獸': {
    title: '【地心災厄・黑曜石狂獸】',
    code: 'CORE CRUSHER // THREAT: S',
    quote: '地脈深處的咆哮……大地即將在你眼前崩碎！',
    themeColor: '#d62828',
    accentColor: '#f77f00',
    bgType: 'core',
    eyeColor: '#ff6600',
  },
  '毀滅特工‧暗影鴨': {
    title: '【叛變特工・黑色死神】',
    code: 'AGENT SHADOW DUCK // THREAT: SSS',
    quote: '哼，嘎嘎特工……你那幼稚的正義，今日在此徹底終結！',
    themeColor: '#7209b7',
    accentColor: '#f72585',
    bgType: 'shadow',
    eyeColor: '#ff0055',
  },

  // ── 關卡 5：廢棄地鐵站 ──
  '裝甲列車長': {
    title: '【鐵軌死神・黑鐵車長】',
    code: 'ARMORED CONDUCTOR // THREAT: A',
    quote: '軌道已經封鎖！這趟列車的終點站——直達地獄！',
    themeColor: '#ff9f45',
    accentColor: '#ffcc80',
    bgType: 'subway',
    eyeColor: '#ff9900',
  },
  '軌道劊子手': {
    title: '【鋼軌處刑人・生鏽重斧】',
    code: 'RAILWAY EXECUTIONER // THREAT: S',
    quote: '生鏽的重型鋼輪，正渴望著特工鮮血的潤滑……',
    themeColor: '#e76f51',
    accentColor: '#f4a261',
    bgType: 'subway',
    eyeColor: '#ff3300',
  },
  '鏽鐵暴君‧終末列車': {
    title: '【鋼鐵衝角・滅絕之號】',
    code: 'DOOM EXPRESS // THREAT: SSS',
    quote: '超重汽笛鳴響之處……萬物皆將被碾碎成無形齏粉！',
    themeColor: '#e63946',
    accentColor: '#f1faee',
    bgType: 'subway_rush',
    eyeColor: '#ffbb00',
  },

  // ── 關卡 6：劇毒沼澤 ──
  '孢子主教': {
    title: '【劇毒布道者・菌絲領袖】',
    code: 'SPORE PREACHER // THREAT: A',
    quote: '劇毒是靈魂最純淨的洗禮……接受孢子的永恆恩賜吧！',
    themeColor: '#52b788',
    accentColor: '#95d5b2',
    bgType: 'swamp',
    eyeColor: '#70e000',
  },
  '腐沼巨口': {
    title: '【泥潭吞噬魔・深淵毒頜】',
    code: 'SWAMP LEVIATHAN // THREAT: S',
    quote: '飢餓……無窮無盡的飢餓……一口將你吞入腹中！',
    themeColor: '#2d6a4f',
    accentColor: '#74c69d',
    bgType: 'swamp',
    eyeColor: '#b7efc5',
  },
  '疫霧之母‧腐潮': {
    title: '【百毒之源・萬物腐化者】',
    code: 'MOTHER OF ROT // THREAT: SSS',
    quote: '在綠色瘴氣中沉淪吧……整座幽暗沼澤，都是你的墓穴！',
    themeColor: '#9b5de5',
    accentColor: '#00f5d4',
    bgType: 'swamp_deep',
    eyeColor: '#b5179e',
  },

  // ── 關卡 7：狂暴荒漠 ──
  '沙暴裝甲車': {
    title: '【荒漠絞肉機・履帶鐵騎】',
    code: 'SANDSTORM PANZER // THREAT: A',
    quote: '重裝履帶已全速前進……把擋路的特工碾成肉泥！',
    themeColor: '#f39c12',
    accentColor: '#f1c40f',
    bgType: 'storm',
    eyeColor: '#ffb703',
  },
  '沙蟲女王': {
    title: '【地底主宰・萬環巨齒】',
    code: 'DUNE QUEEN // THREAT: S',
    quote: '大地在劇烈震顫……狂暴風沙之中，我即是唯一天罰！',
    themeColor: '#e67e22',
    accentColor: '#d35400',
    bgType: 'storm',
    eyeColor: '#fb8500',
  },
  '天譴沙皇‧烈日': {
    title: '【古代黑日・熾烈神皇】',
    code: 'SCORCHING PHARAOH // THREAT: SSS',
    quote: '烈日焚天！在熾熱太陽風暴的威光之下，化作飛灰吧！',
    themeColor: '#f1c40f',
    accentColor: '#e74c3c',
    bgType: 'storm_sun',
    eyeColor: '#ffe119',
  },

  // ── 關卡 8：熔火工廠 ──
  '鑄造監督官': {
    title: '【熔爐典獄長・蒸汽重錘】',
    code: 'FOUNDRY CHIEF // THREAT: A',
    quote: '熔爐的烈火已徹底沸騰！把你扔進鐵水裡重塑筋骨！',
    themeColor: '#ff6f00',
    accentColor: '#ffb300',
    bgType: 'foundry',
    eyeColor: '#ff5400',
  },
  '鐵水巨兵': {
    title: '【千度液態金屬・熔岩構裝】',
    code: 'MOLTEN JUGGERNAUT // THREAT: S',
    quote: '千度高溫鐵水流淌……粉碎一切擅自闖入車間的鼠輩！',
    themeColor: '#ff3d00',
    accentColor: '#ff9100',
    bgType: 'foundry',
    eyeColor: '#ff7900',
  },
  '熔毀泰坦‧爐心': {
    title: '【核熱災變・超新星爐體】',
    code: 'MELTDOWN TITAN // THREAT: SSS',
    quote: '反應爐核心過載百分之千……毀滅的不可逆熔流徹底降臨！',
    themeColor: '#dd2c00',
    accentColor: '#ffd600',
    bgType: 'foundry_meltdown',
    eyeColor: '#ffffff',
  },

  // ── 關卡 9：永凍虛空 ──
  '霜封守望者': {
    title: '【時空凍結者・虛空守墓人】',
    code: 'FROSTVOID SENTRY // THREAT: A',
    quote: '虛空的永恆寒霜，將把時間與微小的靈魂一併徹底凍結。',
    themeColor: '#7209b7',
    accentColor: '#4cc9f0',
    bgType: 'frostvoid',
    eyeColor: '#9d4edd',
  },
  '虛空冰像': {
    title: '【維度千鏡・破碎幻影】',
    code: 'MIRROR APPARITION // THREAT: S',
    quote: '鏡像破裂之時……即是你在所有多維宇宙的永恆死期！',
    themeColor: '#560bad',
    accentColor: '#48cae4',
    bgType: 'frostvoid',
    eyeColor: '#48cae4',
  },
  '霜封巨像‧永凍': {
    title: '【無垠深空・絕對寂滅】',
    code: 'ABSOLUTE PERMAFROST // THREAT: SSS',
    quote: '永凍領域全面啟動……在絕對零度的深淵維度中歸於寂靜！',
    themeColor: '#3a0ca3',
    accentColor: '#00f5d4',
    bgType: 'frostvoid_abyss',
    eyeColor: '#0077b6',
  },

  // ── 關卡 10：裂道彼端 ──
  '裂道遊魂': {
    title: '【次元縫隙・幽綠殘影】',
    code: 'DIMENSION SPECTER // THREAT: A',
    quote: '穿梭於空間裂縫之間……你連我的影子都休想捕捉到！',
    themeColor: '#06d6a0',
    accentColor: '#118ab2',
    bgType: 'voidroad',
    eyeColor: '#06d6a0',
  },
  '虛空騎士': {
    title: '【無光審判官・深淵巨劍】',
    code: 'ABYSS PALADIN // THREAT: S',
    quote: '拔出你的武器吧特工……以虛空之名賜予你永恆的維度放逐！',
    themeColor: '#1b9aaa',
    accentColor: '#ef476f',
    bgType: 'voidroad',
    eyeColor: '#2ec4b6',
  },
  '裂道行者‧終焉': {
    title: '【空間撕裂者・終焉裁決】',
    code: 'REALM TEARER // THREAT: SSS',
    quote: '空間正在寸寸碎裂……迎接這片天地不可逆的終焉之刻吧！',
    themeColor: '#8338ec',
    accentColor: '#3a86ff',
    bgType: 'voidroad_rift',
    eyeColor: '#80ffdb',
  },

  // ── 關卡 11：水墨仙山 ──
  '山魈妖王': {
    title: '【青峰撼岳・齊天巨靈】',
    code: 'MOUNTAIN DEMON APE // THREAT: A',
    quote: '吼！何方扁毛畜生……膽敢擅闖仙山靈脈，拿命來！',
    themeColor: '#c9443a',
    accentColor: '#ffb703',
    bgType: 'inkmount',
    eyeColor: '#e63946',
  },
  '九尾墨狐': {
    title: '【魅世墨華・千幻妖尊】',
    code: 'NINE-TAIL INK SPIRIT // THREAT: S',
    quote: '呵呵呵……小鴨子，你的這身靈魄，本尊便笑納了～',
    themeColor: '#f5962d',
    accentColor: '#e76f51',
    bgType: 'inkmount_moon',
    eyeColor: '#f77f00',
  },
  '天劫雷尊‧渡劫': {
    title: '【九天裁決・紫霄神罰】',
    code: 'THUNDER TRIBULATION // THREAT: SSS',
    quote: '大道無情！逆天而行者——九霄劫雷，落！！',
    themeColor: '#4cc9f0',
    accentColor: '#f72585',
    bgType: 'inkmount_thunder',
    eyeColor: '#a0f0ff',
  },

  // ── 關卡 12：魔界村 ──
  '一角魔將‧獨角巨靈': {
    title: '【撼地凶煞・破軍巨魔】',
    code: 'CYCLOPS KNIGHT // THREAT: S',
    quote: '吼喔喔喔！鎧甲小子……魔界之門前，將你的骨頭碾碎成泥！',
    themeColor: '#e63946',
    accentColor: '#ffb703',
    bgType: 'makaimura_graveyard',
    eyeColor: '#ff0033',
  },
  '猩紅魔王‧阿雷默': {
    title: '【焚天劫火・猩紅魔尊】',
    code: 'RED ARREMER KING // THREAT: SS',
    quote: '桀桀桀……愚蠢的騎士，在我的無盡地獄烈焰中化為灰燼吧！',
    themeColor: '#d90429',
    accentColor: '#ff7b00',
    bgType: 'makaimura_hellfire',
    eyeColor: '#ffea00',
  },
  '雙面魔王‧阿斯塔羅特': {
    title: '【至高魔皇・深淵雙面主】',
    code: 'DEMON OVERLORD ASTAROTH // THREAT: SSS',
    quote: '螻蟻般的凡夫肉身……本座的雙面雙瞳，已宣告你的死期！！',
    themeColor: '#9d0208',
    accentColor: '#9d4edd',
    bgType: 'makaimura_throne',
    eyeColor: '#ff0055',
  },

  // ── 塔防與 40K 敵首 ──
  '歐克戰爭頭目': {
    title: '【綠皮大軍閥・鐵甲鐵爪】',
    code: 'WARBOSS GORGUTZ // THREAT: S',
    quote: 'WAAAGH!! 更多鐵皮！更多炸藥！把那隻笨鴨給老子砸成肉餅！',
    themeColor: '#2d6a4f',
    accentColor: '#d00000',
    bgType: 'ork',
    eyeColor: '#d00000',
  },
  '蟲群基因原體': {
    title: '【暗殺大師・鐮刀暴君】',
    code: 'BROODLORD // THREAT: S',
    quote: '無盡的飢渴意志……在陰影中撕裂一切血肉生靈！',
    themeColor: '#7b2cbf',
    accentColor: '#c77dff',
    bgType: 'hive',
    eyeColor: '#9d4edd',
  },
  '泰倫劊子手暴君': {
    title: '【活體攻城獸・泰倫巨擘】',
    code: 'CARNIFEX TYRANT // THREAT: SS',
    quote: '重裝外骨骼碾壓一切……沒有任何要塞防線能抵擋暴君巨力！',
    themeColor: '#3c096c',
    accentColor: '#ff0055',
    bgType: 'hive_ruins',
    eyeColor: '#ff0055',
  },
  '峽谷掠奪者': {
    title: '【黃沙劫掠者・峽谷沙怪】',
    code: 'CANYON RAIDER // THREAT: A',
    quote: '峽谷裡所有的生命與物資……都是我的獵物！',
    themeColor: '#f39c12',
    accentColor: '#f1c40f',
    bgType: 'storm',
    eyeColor: '#ff9e00',
  },
  '沼澤雙頭蛇': {
    title: '【雙生劇毒・巨鱗雙頭蛇】',
    code: 'TWIN HEAD VIPER // THREAT: S',
    quote: '嘶嘶嘶……兩顆頭，正好把你一口撕扯成兩半！',
    themeColor: '#38b000',
    accentColor: '#ccff33',
    bgType: 'swamp',
    eyeColor: '#70e000',
  },
  '要塞攻城巨像': {
    title: '【重甲鐵壁・攻城巨靈】',
    code: 'SIEGE COLOSSUS // THREAT: SS',
    quote: '要塞重裝甲無懈可擊！全火力連鎖覆蓋發射——！',
    themeColor: '#ff9f45',
    accentColor: '#00f5d4',
    bgType: 'foundry',
    eyeColor: '#00f5d4',
  },

  // ── 守塔（TD）後段首領（v92 補齊）──
  // 這 6 位原本沒有 profile，字卡只能套用通用的「戰區強敵・二階領主」，
  // 玩家看到的稱號跟畫面上的首領對不起來。
  '天啟坦克': {
    title: '【鋼鐵洪流・天啟重坦】',
    code: 'APOCALYPSE TANK // THREAT: S',
    quote: '雙主砲已上膛——在我的履帶之下，沒有哪一道防線是輾不過去的。',
    themeColor: '#d90429',
    accentColor: '#ffd60a',
    bgType: 'core',
    eyeColor: '#ffea00',
  },
  '蘇聯天啟巨坦': {
    title: '【赤色鋼鐵・末日雙砲】',
    code: 'SOVIET APOCALYPSE // THREAT: SS',
    quote: '祖國的鋼鐵不會停下來。你們的塔，只是我砲管上的一層鏽。',
    themeColor: '#ff3d00',
    accentColor: '#ffd60a',
    bgType: 'core_fire',
    eyeColor: '#ff2200',
  },
  '異蟲刀鋒宿主': {
    title: '【蟲巢先鋒・刀鋒宿主】',
    code: 'ZERG BLADE HOST // THREAT: A',
    quote: '嘶——蟲群已經聞到你們的血，這座峽谷很快就會變成蟲巢。',
    themeColor: '#9d4edd',
    accentColor: '#80ffdb',
    bgType: 'hive',
    eyeColor: '#c77dff',
  },
  '原生異蟲 ‧ 雷獸之王': {
    title: '【蟲群主宰・雷獸之王】',
    code: 'PRIMAL ULTRALISK // THREAT: SSS',
    quote: '大地在震。牠的骨刃張開了——這片灰燼，將成為蟲群的巢床。',
    themeColor: '#8338ec',
    accentColor: '#80ffdb',
    bgType: 'hive_ruins',
    eyeColor: '#ff0055',
  },
  '恐懼魔王 ‧ 瑪爾加尼斯': {
    title: '【焚天劫火・恐懼魔王】',
    code: 'DREADLORD MAL\'GANIS // THREAT: SS',
    quote: '你們的勇氣嚐起來真甜美……我會慢慢享用這場屠殺。',
    themeColor: '#d90429',
    accentColor: '#ff7b00',
    bgType: 'makaimura_hellfire',
    eyeColor: '#ffea00',
  },
  '巫妖王 ‧ 寒冰王座': {
    title: '【永凍王座・寒冰巫妖】',
    code: 'THE LICH KING // THREAT: SSS',
    quote: '這裡沒有勝利，只有無盡的寒冬——而你們，將會成為我的士兵。',
    themeColor: '#4cc9f0',
    accentColor: '#a0f0ff',
    bgType: 'frostvoid_abyss',
    eyeColor: '#a0f0ff',
  },
};

// 各 Boss 名稱對應的專屬 Skin 映射
export const BOSS_NAME_TO_SKIN = {
  '狂暴推土喪屍': 'boss_street',
  '變異清潔工': 'boss_street',
  '巨神‧暴虐霸王龍': 'boss_street_final',
  '生化軟泥聚合體': 'boss_lab',
  '外骨骼改造猩猩': 'boss_lab',
  '母體‧零號實驗體': 'boss_lab_final',
  '冰霜機甲': 'boss_frost',
  '極地穿山甲王': 'boss_frost',
  '冰霜暴君‧雪帝': 'boss_frost_final',
  '烈焰暴君': 'boss_core',
  '熔核巨獸': 'boss_core',
  '毀滅特工‧暗影鴨': 'boss_core_final',
  '裝甲列車長': 'boss_subway',
  '軌道劊子手': 'boss_subway',
  '鏽鐵暴君‧終末列車': 'boss_subway_final',
  '孢子主教': 'boss_swamp',
  '腐沼巨口': 'boss_swamp',
  '疫霧之母‧腐潮': 'boss_swamp_final',
  '沙暴裝甲車': 'boss_storm',
  '沙蟲女王': 'boss_storm',
  '天譴沙皇‧烈日': 'boss_storm_final',
  '鑄造監督官': 'boss_foundry',
  '鐵水巨兵': 'boss_foundry',
  '熔毀泰坦‧爐心': 'boss_foundry_final',
  '霜封守望者': 'boss_frostvoid',
  '虛空冰像': 'boss_frostvoid',
  '霜封巨像‧永凍': 'boss_frostvoid_final',
  '裂道遊魂': 'boss_voidroad',
  '虛空騎士': 'boss_voidroad',
  '裂道行者‧終焉': 'boss_voidroad_final',
  '山魈妖王': 'boss_inkape',
  '九尾墨狐': 'boss_inkfox',
  '天劫雷尊‧渡劫': 'boss_thunder_final',
  '一角魔將‧獨角巨靈': 'boss_unicorn',
  '猩紅魔王‧阿雷默': 'boss_arremer_king',
  '雙面魔王‧阿斯塔羅特': 'boss_astaroth',
  '歐克戰爭頭目': 'boss_nob',
  '歐克蠻牛老大': 'boss_nob',
  '蟲群基因原體': 'boss_broodlord',
  '蟲巢族長': 'boss_broodlord',
  '泰倫劊子手暴君': 'boss_carnifex',
  '劊子手甲蟲': 'boss_carnifex',
  '峽谷掠奪者': 'boss_storm',
  '沼澤雙頭蛇': 'boss_swamp',
  '要塞攻城巨像': 'boss_frostvoid',
  '天啟坦克': 'boss_frost',
  '蘇聯天啟巨坦': 'boss_frost',
  '異蟲刀鋒宿主': 'boss_broodlord',
  '原生異蟲 ‧ 雷獸之王': 'boss_carnifex',
  '恐懼魔王 ‧ 瑪爾加尼斯': 'boss_arremer_king',
  '巫妖王 ‧ 寒冰王座': 'boss_astaroth',
  '深淵魔煞': 'boss',
  '魔化子鼠': 'rat_evil',
  '魔化丑牛': 'ox_evil',
  '魔化寅虎': 'tiger_evil',
  '魔化卯兔': 'rabbit_evil',
  '魔化辰龍': 'dragon_evil',
  '魔化巳蛇': 'snake_evil',
  '魔化午馬': 'horse_evil',
  '魔化未羊': 'goat_evil',
  '魔化申猴': 'monkey_evil',
  '魔化酉雞': 'rooster_evil',
  '魔化戌狗': 'dog_evil',
  '魔化亥豬': 'pig_evil',
};

// 預設/備用資料產生器 (無盡深淵或自訂 Boss)
export function getProfile(bossName, def = {}) {
  const cleanName = bossName ? bossName.replace(/^深淵·/, '') : '';
  const skin = def.skin || BOSS_NAME_TO_SKIN[cleanName] || BOSS_NAME_TO_SKIN[bossName] || 'boss';

  if (BOSS_CINEMA_PROFILES[cleanName]) {
    const p = BOSS_CINEMA_PROFILES[cleanName];
    if (bossName && bossName.startsWith('深淵·') && !p.endlessOwn) {
      return {
        ...p,
        skin,
        title: `【無盡深淵・復甦煞神】`,
        code: `${p.code} (ABYSSAL ASCENSION)`,
        quote: `『深淵』侵蝕了一切……吾將從暗黑深海中再度將你撕裂！`,
        themeColor: '#9d4edd',
        accentColor: '#00f5d4',
        eyeColor: '#ff0055',
      };
    }
    return { ...p, skin };
  }

  let themeColor = '#ff4d6d';
  let bgType = 'street';
  if (skin.includes('lab')) { themeColor = '#00f5d4'; bgType = 'lab'; }
  else if (skin.includes('frost')) { themeColor = '#4cc9f0'; bgType = 'frost'; }
  else if (skin.includes('core')) { themeColor = '#f77f00'; bgType = 'core'; }
  else if (skin.includes('subway')) { themeColor = '#ff9f45'; bgType = 'subway'; }
  else if (skin.includes('swamp')) { themeColor = '#52b788'; bgType = 'swamp'; }
  else if (skin.includes('storm')) { themeColor = '#f39c12'; bgType = 'storm'; }
  else if (skin.includes('foundry')) { themeColor = '#ff3d00'; bgType = 'foundry'; }
  else if (skin.includes('void')) { themeColor = '#8338ec'; bgType = 'voidroad'; }
  else if (skin.includes('ink') || skin.includes('thunder')) { themeColor = '#c9443a'; bgType = 'inkmount'; }

  // def 可能是關卡資料（wave.boss，用 final）或敵人實例（Enemy，用 isFinal）——
  // 只認 final 會讓守塔的最終首領掉回一般稱號（v92）
  const isFinal = !!(def.final || def.isFinal);

  return {
    skin,
    title: isFinal ? '【終末天罰・滅世宿敵】' : '【戰區強敵・二階領主】',
    code: `CLASS-S THREAT // CONTACT DETECTED`,
    quote: isFinal ? '「特工鴨，你的戰術推演在絕對實力面前……毫無勝算！」' : '「哼……擅闖此地者，唯有死路一條！」',
    themeColor,
    accentColor: '#ffffff',
    bgType,
    eyeColor: '#ff2200',
  };
}

// ── 漫畫風格網點與筆刷快取 (Comic Halftone & Screentone) ──────────────
let _comicHalftone = null;
function getComicHalftone(ctx) {
  if (!_comicHalftone && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 12;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0, 0, 0, 0.32)';
    x.beginPath();
    x.arc(6, 6, 2.2, 0, Math.PI * 2);
    x.fill();
    _comicHalftone = ctx.createPattern(c, 'repeat');
  }
  return _comicHalftone;
}

// 繪製日漫/美漫風格高對比巨大擬聲字 (Manga Onomatopoeia Typography)
function drawComicSFX(ctx, text, x, y, opts = {}) {
  const size = opts.size || 48;
  const angle = opts.angle != null ? opts.angle : -0.16; // 傾斜約 -9度
  const fill = opts.fill || '#ffd60a';
  const stroke = opts.stroke || '#020409';
  const shadow = opts.shadow || '#ff0038';
  const scale = opts.scale || 1.0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.font = `900 ${size}px "Noto Sans TC", "Impact", "Chakra Petch", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 3;

  // 1. 3D 漫畫立體厚切投影 (Extrusion)
  ctx.fillStyle = shadow;
  for (let d = 5; d >= 2; d--) {
    ctx.fillText(text, d, d);
  }

  // 2. 粗墨黑輪廓 (Heavy Inked Contour)
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(5, size * 0.14);
  ctx.strokeText(text, 0, 0);

  // 3. 高彩填色 (Action Fill)
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);

  // 4. 頂部高光細字 (White Inner Highlight)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = `900 ${size * 0.88}px "Noto Sans TC", "Impact", sans-serif`;
  ctx.fillText(text, -1, -2);

  ctx.restore();
}

// 繪製傳統漫畫紅色印章 (Red Manga Seal Stamp)
function drawComicStamp(ctx, text, x, y, angle = -0.14, color = '#d90429') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.font = '900 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  const padH = 7;
  const padW = 10;
  const metrics = ctx.measureText(text);
  const bw = metrics.width + padW * 2;
  const bh = 22 + padH;

  // 雙層紅框印章
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.0;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

  ctx.lineWidth = 1.2;
  ctx.strokeRect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6);

  // 印章底色極淡紅
  ctx.fillStyle = 'rgba(217, 4, 41, 0.12)';
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);

  // 印章文字
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

// ── 過場動畫工具函式 (Easing / Silhouette Cache / Text Wrap) ─────────────
const _silhouetteCache = new Map();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t) {
  const p = clamp01(t);
  return 1 - Math.pow(1 - p, 3);
}

function easeOutExpo(t) {
  const p = clamp01(t);
  return p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

function easeOutBack(t) {
  const p = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

function getBossSilhouette(bossKey, frame) {
  if (!frame || !frame.width || !frame.height) return null;
  const cached = _silhouetteCache.get(bossKey);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = frame.width;
  c.height = frame.height;
  const x = c.getContext('2d');
  x.drawImage(frame, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#060913';
  x.fillRect(0, 0, c.width, c.height);

  if (_silhouetteCache.size >= 24) {
    const firstKey = _silhouetteCache.keys().next().value;
    _silhouetteCache.delete(firstKey);
  }
  _silhouetteCache.set(bossKey, c);
  return c;
}

function wrapDialogueLines(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export class BossCutscene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.startTime = 0;
    this.duration = 3.6;     // 完整過場秒數 (約 3.6 秒，緊湊刺激)
    this.boss = null;
    this.level = null;
    this.profile = null;

    this.phase = 0;
    this.typedChars = 0;
    this.lastBleepChar = 0;
    this.flash = 0;
    this.barsOffset = 1;
    this.shake = 0;
    this.particles = [];
    this.shockwaves = [];
    this._phase1Slam = false;
    this._phase2Stab = false;
    this._phase3Burst = false;
  }

  start(boss, level) {
    this.boss = boss;
    this.level = level;
    this.profile = getProfile(boss.name, boss);
    this.active = true;
    this.startTime = performance.now() / 1000;
    this.timer = 0;
    this.phase = 0;
    this.typedChars = 0;
    this.lastBleepChar = 0;
    this.flash = 0.42;
    this.barsOffset = 1;
    this.shake = 10;
    this.particles = [];
    this.shockwaves = [];
    this._phase1Slam = false;
    this._phase2Stab = false;
    this._phase3Burst = false;

    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('boss-cutscene-active');
    }

    // 播放登場過場音效
    sound.playBossCinematicSting();
  }

  skip() {
    if (!this.active) return;
    this.finish();
  }

  // 靜默重置（開新局或放棄任務回主選單時呼叫，不播音效也不震動）
  reset() {
    this.active = false;
    this.timer = 0;
    this.boss = null;
    this.profile = null;
    this.particles = [];
    this.shockwaves = [];
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('boss-cutscene-active');
    }
  }

  finish() {
    this.active = false;
    this.particles = [];
    this.shockwaves = [];
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('boss-cutscene-active');
    }
    sound.playSwordSlash();
    if (this.game && this.game.camera && this.game._shakeOn !== false) {
      this.game.camera.shake = 18;
    }
  }

  _spawnBurst(count, speedMin, speedMax, colors, horizontalBias = 0) {
    for (let i = 0; i < count; i++) {
      const ang = horizontalBias
        ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.45
        : Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        nx: 0.5,
        ny: 0.5,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.5 + Math.random() * 5,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.45,
        color: colors[i % colors.length],
      });
    }
  }

  update(dt) {
    if (!this.active) return;

    const safeDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);

    // 以遊戲活躍幀的 safeDt 累加（切換分頁或暫停時不會直接跳過過場分鏡）
    this.timer += safeDt;

    // 閃光與震動快速衰減
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - safeDt * 8.5);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - safeDt * 42);
    }

    // 更新過場粒子與衝擊波（空氣阻力依 dt*60 指數補償，60Hz/120Hz 位移一致）
    const drag = Math.pow(0.94, safeDt * 60);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += safeDt;
      if (pt.life >= pt.maxLife) {
        this.particles.splice(i, 1);
      } else {
        pt.nx += pt.vx * safeDt;
        pt.ny += pt.vy * safeDt;
        pt.vx *= drag;
        pt.vy *= drag;
      }
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life += safeDt;
      if (sw.life >= sw.maxLife) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 電影黑邊平滑閉合 (前 0.22 秒到位) + 結束前 0.16 秒平滑收起
    const exitStart = this.duration - 0.16;
    if (this.timer < 0.22) {
      this.barsOffset = 1 - easeOutCubic(this.timer / 0.22);
    } else if (this.timer > exitStart) {
      this.barsOffset = easeOutCubic((this.timer - exitStart) / 0.16);
    } else {
      this.barsOffset = 0;
    }

    // 階段判定與過渡音效/衝擊
    const p = this.profile;
    if (this.timer < 0.35) {
      this.phase = 0;
      if (!this._phase1Slam && this.timer >= 0.16) {
        this._phase1Slam = true;
        this.shake = 12;
      }
    } else if (this.timer < 1.3) {
      this.phase = 1;
    } else if (this.timer < 2.3) {
      if (!this._phase2Stab) {
        this._phase2Stab = true;
        sound.playSwordSlash();
        this.flash = 0.36;
        this.shake = 15;
        this._spawnBurst(22, 0.9, 2.4, ['#ffffff', '#ffd60a', p.eyeColor || '#ff0038'], true);
      }
      this.phase = 2;
    } else {
      if (!this._phase3Burst) {
        this._phase3Burst = true;
        sound.playSwordSlash();
        this.flash = 0.42;
        this.shake = 22;
        this.shockwaves.push(
          { life: 0, maxLife: 0.55, color: p.themeColor, width: 6 },
          { life: 0, maxLife: 0.4, color: '#ffffff', width: 3 },
        );
        this._spawnBurst(36, 0.45, 1.6, ['#ffd60a', '#ffffff', p.themeColor, p.accentColor || '#ffffff'], false);
      }
      this.phase = 3;
    }

    // 階段 3：字卡打字機
    if (this.phase === 3) {
      const quote = this.profile.quote || '';
      const typeTime = this.timer - 2.3;
      const targetChars = Math.min(quote.length, Math.floor(typeTime * 26)); // 每秒 26 字
      if (targetChars > this.typedChars) {
        this.typedChars = targetChars;
        if (this.typedChars > this.lastBleepChar) {
          sound.playTextBleep();
          this.lastBleepChar = this.typedChars;
        }
      }
    }

    // 自然結束
    if (this.timer >= this.duration) {
      this.finish();
    }
  }

  // 繪製全套電影分鏡畫面
  draw(ctx, vw, vh) {
    if (!this.active) return;

    ctx.save();

    // 1. 寬螢幕劇院黑邊高度
    const topBarHeight = Math.max(48, Math.min(72, vh * 0.11));
    const bottomBarHeight = Math.max(132, Math.min(200, vh * 0.28));
    const barAnim = this.barsOffset;

    const curTopH = topBarHeight * (1 - barAnim);
    const curBottomH = bottomBarHeight * (1 - barAnim);

    // 電影觀景窗區域 (Viewport)
    const winTop = curTopH;
    const winBottom = vh - curBottomH;
    const winHeight = winBottom - winTop;

    // 過場畫面微震偏移（尊重顯示設定的「畫面震動」開關）
    const shakeOn = !this.game || this.game._shakeOn !== false;
    const effShake = shakeOn ? this.shake : 0;
    const shakeX = effShake > 0.2 ? (Math.random() - 0.5) * effShake : 0;
    const shakeY = effShake > 0.2 ? (Math.random() - 0.5) * effShake : 0;

    if (winHeight > 10) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, winTop, vw, winHeight);
      ctx.clip();
      ctx.translate(shakeX, shakeY);

      // 2. 觀景窗背景與動態氛圍 (漫畫風高對比黑底 + 集中線 + 網點)
      this.drawCinemaBackdrop(ctx, -24, winTop - 24, vw + 48, winHeight + 48);

      // 3. 依據分鏡階段繪製主視覺
      if (this.phase === 0 || this.phase === 1) {
        // 第一分鏡：黑影剪影壓境 + 警報橫幅 + 「ゴゴゴゴ…」
        this.drawPhaseOne(ctx, vw, winTop, winHeight);
      } else if (this.phase === 2) {
        // 第二分鏡：【漫畫斜切特寫】刀光斬裂 + 極限眼神 + 「ズバッ！！」
        this.drawPhaseTwoEyeSlit(ctx, vw, winTop, winHeight);
      } else {
        // 第三分鏡：【滿版跨頁】衝擊震波 + 破格半身立繪 + 「ドドンッ！！」
        this.drawPhaseThreeBust(ctx, vw, winTop, winHeight);
      }

      // 過場粒子與衝擊波 (繪製於主視覺上層)
      this.drawCutsceneFX(ctx, vw, winTop, winHeight);

      // 復古輕量掃描線效果
      this.drawScanlines(ctx, 0, winTop, vw, winHeight);

      ctx.restore();
    }

    // 4. 繪製上下純黑邊框 (覆蓋在最頂層)
    this.drawLetterboxBars(ctx, vw, vh, curTopH, curBottomH);

    // 5. 繪製底部文字敘事卡 (Phase 3 登場台詞)
    if (curBottomH > 40 && this.phase === 3) {
      this.drawDialogueBox(ctx, vw, vh, curBottomH);
    }

    // 6. 白光一閃 (Flash，尊重顯示設定的「減少閃光」倍率)
    if (this.flash > 0) {
      const flashMul = (this.game && this.game._flashMul != null) ? this.game._flashMul : 1;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.45, this.flash) * flashMul})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    ctx.restore();
  }

  // 繪製過場衝擊波與能量粒子
  drawCutsceneFX(ctx, vw, winTop, winH) {
    const cx = vw * 0.5;
    const cy = winTop + winH * 0.52;

    if (this.shockwaves.length > 0) {
      ctx.save();
      for (const sw of this.shockwaves) {
        const prog = easeOutExpo(sw.life / sw.maxLife);
        const radius = prog * Math.max(vw, winH) * 0.72;
        ctx.globalAlpha = (1 - prog) * 0.85;
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = Math.max(1, sw.width * (1 - prog));
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.particles.length > 0) {
      ctx.save();
      for (const pt of this.particles) {
        const prog = pt.life / pt.maxLife;
        const px = pt.nx * vw;
        const py = winTop + pt.ny * winH;
        ctx.globalAlpha = 1 - prog;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (1 - prog * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 繪製動態漫畫背景 (高對比墨黑底 + 半調網點 + 放射集中線)
  drawCinemaBackdrop(ctx, x, y, w, h) {
    const p = this.profile;
    const t = this.timer;
    const cx = w / 2;
    const cy = y + h / 2;

    // 1. 純黑至深灰漫畫底色
    ctx.fillStyle = '#05070f';
    ctx.fillRect(x, y, w, h);

    // 2. 漫畫半調網點遮罩 (Halftone Screentone Grid)
    const halftone = getComicHalftone(ctx);
    if (halftone) {
      ctx.save();
      ctx.fillStyle = halftone;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    ctx.save();

    // 3. 漫畫放射集中線 (Radial Action / Speed Lines)
    const lineCount = 42;
    const maxR = Math.max(w, h) * 0.85;
    ctx.save();
    ctx.translate(cx, cy);
    // 緩慢旋轉與高頻微震，賦予壓迫窒息感
    ctx.rotate(t * 0.15 + Math.sin(t * 40) * 0.005);

    for (let i = 0; i < lineCount; i++) {
      const baseAng = (i / lineCount) * Math.PI * 2;
      const angSpan = (0.02 + ((i % 3) * 0.015));
      const rInner = 60 + ((i * 37) % 80);
      const rOuter = maxR * (0.8 + ((i * 17) % 30) * 0.01);

      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 255, 255, 0.14)' : (p.themeColor + '22');
      ctx.beginPath();
      ctx.moveTo(Math.cos(baseAng - angSpan) * rInner, Math.sin(baseAng - angSpan) * rInner);
      ctx.lineTo(Math.cos(baseAng) * rOuter, Math.sin(baseAng) * rOuter);
      ctx.lineTo(Math.cos(baseAng + angSpan) * rInner, Math.sin(baseAng + angSpan) * rInner);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 4. 水平/斜向破空疾速撕裂線
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 16; i++) {
      const ly = y + ((i * 43 + t * 400) % h);
      const lx = ((i * 197 + t * 900) % (w + 400)) - 200;
      const len = 120 + (i % 5) * 60;
      ctx.globalAlpha = 0.25 + (i % 3) * 0.15;
      ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + len, ly);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 第一階段：漫畫警告分鏡 + 黑影剪影逼近 + 「ゴゴゴゴ…」強者氣場
  drawPhaseOne(ctx, vw, winTop, winH) {
    const t = this.timer;
    const cx = vw / 2;
    const cy = winTop + winH / 2;
    const p = this.profile;

    // 1. 遠方黑影剪影逼近 (純黑剪影 + 主題色狂暴光暈 + 殺意紅眼點亮)
    const bossKey = firstSpriteKey(
      [
        this.boss && this.boss.skin,
        this.boss && this.boss.skin && this.boss.skin.replace(/_final$/, ''),
        this.profile && this.profile.skin,
        'boss',
      ],
      'boss',
    );
    const spr = getSprite(bossKey);
    if (spr) {
      const loomProg = easeOutCubic(clamp01((t - 0.08) / 1.15));
      const baseScale = Math.min(2.35, (winH * 0.72) / (spr.h || 120));
      const curScale = baseScale * (0.68 + 0.36 * loomProg);

      ctx.save();
      ctx.translate(cx, cy + winH * 0.08);

      // 背後鋸齒狀暗紅/主題色氣場光環 (非死板圓盤)
      ctx.save();
      ctx.rotate(t * 0.6);
      const auraR = 95 * curScale * 0.5;
      const spikes = 16;
      ctx.fillStyle = p.themeColor + '38';
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? auraR * 1.35 : auraR * 0.75;
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 剪影本體 (使用離屏純黑剪影，最後 0.2s 閃現原色輪廓)
      ctx.scale(curScale, curScale);
      ctx.shadowColor = p.themeColor;
      ctx.shadowBlur = 24;
      ctx.globalAlpha = clamp01((t - 0.06) * 4.5);

      const frame = spr.frames[0];
      if (frame) {
        const sil = getBossSilhouette(bossKey, frame);
        if (sil) {
          ctx.drawImage(sil, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
        } else {
          ctx.drawImage(frame, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
        }

        // 剪影收尾 (t > 0.96s) 雙目殺意紅芒亮起預告 Phase 2
        if (t > 0.96) {
          const eyeAlpha = clamp01((t - 0.96) / 0.16);
          const eyeCol = p.eyeColor || '#ff0038';
          ctx.save();
          ctx.globalAlpha = eyeAlpha;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = eyeCol;
          ctx.shadowBlur = 14;
          const eyeY = -spr.h * 0.18;
          const eyeSep = spr.w * 0.1;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * eyeSep, eyeY, 4.5, 2.2, side * -0.22, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 2. 兩側「ゴ ゴ ゴ ゴ…」日漫氣場爬升 (避開中央橫幅)
    const gogoTexts = ['ゴ', 'ゴ', 'ゴ', 'ゴ'];
    const marginX = Math.max(32, vw * 0.08);
    for (let side = -1; side <= 1; side += 2) {
      const baseX = side === -1 ? marginX : vw - marginX;
      for (let i = 0; i < gogoTexts.length; i++) {
        const rise = easeOutCubic(clamp01((t - 0.12 - i * 0.08) / 0.35));
        if (rise <= 0.01) continue;
        const charY = winTop + winH * 0.44 + i * (winH * 0.13);
        const charScale = (0.85 + i * 0.22 + Math.sin(t * 12 + i) * 0.06) * rise;
        const charAngle = side === -1 ? -0.22 : 0.22;
        drawComicSFX(ctx, gogoTexts[i], baseX + side * Math.sin(t * 15 + i) * 3, charY, {
          size: Math.round(Math.min(26, vw * 0.055) * charScale),
          angle: charAngle,
          fill: '#ffd60a',
          stroke: '#020409',
          shadow: '#d90429',
          scale: 1.0,
        });
      }
    }

    // 3. 漫畫傾斜警告標題條 (從左側疾速撞入 + 流動警示斜紋)
    const bannerIn = easeOutBack(clamp01((t - 0.12) / 0.26));
    const slideX = (1 - bannerIn) * -(vw * 0.85);
    ctx.save();
    ctx.translate(cx + slideX, winTop + winH * 0.22);
    ctx.rotate(-0.045);

    const bannerW = Math.min(vw * 0.9, 540);
    const bannerH = Math.max(54, Math.min(66, vw * 0.13));

    // 黑底粗邊
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 4;
    ctx.strokeRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);

    // 流動黃黑警示邊界斜紋 (Scrolling Hazard Stripes)
    ctx.save();
    ctx.beginPath();
    ctx.rect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);
    ctx.clip();
    ctx.fillStyle = '#ffd60a';
    const stripeShift = (t * 90) % 24;
    for (let sx = -bannerW / 2 - 24 + stripeShift; sx < bannerW / 2 + 24; sx += 24) {
      ctx.beginPath();
      ctx.moveTo(sx, -bannerH / 2);
      ctx.lineTo(sx + 12, -bannerH / 2);
      ctx.lineTo(sx + 6, -bannerH / 2 + 8);
      ctx.lineTo(sx - 6, -bannerH / 2 + 8);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(sx, bannerH / 2 - 8);
      ctx.lineTo(sx + 12, bannerH / 2 - 8);
      ctx.lineTo(sx + 6, bannerH / 2);
      ctx.lineTo(sx - 6, bannerH / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 警示大字 (依視窗寬度自適應縮放)
    const warnFontSize = Math.max(17, Math.min(24, Math.floor(bannerW * 0.056)));
    ctx.font = `900 ${warnFontSize}px "Noto Sans TC", "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pulseAlpha = 0.78 + 0.22 * Math.sin(t * 20);
    ctx.fillStyle = `rgba(255, 0, 56, ${pulseAlpha})`;
    ctx.shadowColor = '#ff0038';
    ctx.shadowBlur = 14;
    ctx.fillText('⚠ 警 告：極 惡 首 領 來 襲 ⚠', 0, -4);

    ctx.font = `800 ${Math.max(10, Math.min(13, Math.floor(bannerW * 0.028)))}px monospace, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.fillText('// HIGH-LEVEL TARGET INTERCEPTED //', 0, 17);
    ctx.restore();
  }

  // 第二階段：【漫畫斜切分鏡】刀光斬裂展開 + 殺意眼神橫切 + 「ズバッ！！」
  drawPhaseTwoEyeSlit(ctx, vw, winTop, winH) {
    const t = this.timer;
    const p = this.profile;
    const phaseAge = Math.max(0, t - 1.3);
    const openProg = easeOutExpo(clamp01(phaseAge / 0.14));
    const fullSlitH = Math.min(184, winH * 0.80);
    const slitH = Math.max(6, fullSlitH * openProg);
    const slitY = winTop + (winH - slitH) / 2;

    ctx.save();

    // 1. 傾斜漫畫眼部橫切分鏡框 (Slanted Comic Panel)
    ctx.save();
    ctx.translate(vw / 2, winTop + winH / 2);
    ctx.rotate(-0.045); // 傾斜約 -2.6 度，強烈美漫分鏡感

    const panelW = vw + 80;
    const panelH = slitH;

    // 裁切至分鏡框內，達成刀光斬裂展開效果
    ctx.save();
    ctx.beginPath();
    ctx.rect(-panelW / 2, -panelH / 2, panelW, panelH);
    ctx.clip();

    // 分鏡背景深黑墨底 + 主題色微暗漸層
    const bgGrad = ctx.createLinearGradient(0, -fullSlitH / 2, 0, fullSlitH / 2);
    bgGrad.addColorStop(0, '#04060c');
    bgGrad.addColorStop(0.5, '#0b0f1d');
    bgGrad.addColorStop(1, '#04060c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);

    // 半調網點
    const halftone = getComicHalftone(ctx);
    if (halftone) {
      ctx.fillStyle = halftone;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);
      ctx.globalAlpha = 1.0;
    }

    // 速度線狂嘯 (濃烈橫向速度線)
    ctx.strokeStyle = p.themeColor;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 24; i++) {
      const ly = -fullSlitH / 2 + (i / 24) * fullSlitH;
      const lx = ((i * 137 + t * 1500) % (panelW + 300)) - panelW / 2 - 150;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 260, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 2. 雙目極限特寫 (銳利日漫怒目 + 虹膜精準裁切於眼眶內，絕不凸出眼瞼)
    const eyeZoom = 1.0 + clamp01(phaseAge) * 0.08;
    const eyeOpen = easeOutBack(clamp01((phaseAge - 0.04) / 0.16));
    const eyeDist = Math.min(112, vw * 0.21);
    const eyeCol = p.eyeColor || '#ff0038';

    ctx.save();
    ctx.scale(eyeZoom, eyeZoom);

    // 中央眉心陰影與深邃鼻樑輪廓 (取代原本突兀的幾何符號)
    const browGrad = ctx.createLinearGradient(0, -fullSlitH / 2, 0, 26);
    browGrad.addColorStop(0, 'rgba(2, 4, 9, 0.96)');
    browGrad.addColorStop(1, 'rgba(2, 4, 9, 0)');
    ctx.fillStyle = browGrad;
    ctx.fillRect(-eyeDist * 2.2, -fullSlitH / 2, eyeDist * 4.4, fullSlitH * 0.55);

    // 鼻樑兩側銳利漫畫陰影斜線 (Hatching)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 2.5;
    for (let h = 0; h < 5; h++) {
      const hy = -6 + h * 7;
      ctx.beginPath();
      ctx.moveTo(-14, hy);
      ctx.lineTo(-4, hy + 4);
      ctx.moveTo(14, hy);
      ctx.lineTo(4, hy + 4);
      ctx.stroke();
    }

    for (const side of [-1, 1]) {
      const ex = side * eyeDist;
      ctx.save();
      ctx.translate(ex, 8);
      if (side === -1) ctx.scale(-1, 1);

      // (a) 銳利壓低怒目劍眉 (Heavy Inked Brow)
      ctx.fillStyle = '#020409';
      ctx.beginPath();
      ctx.moveTo(-78, -10);
      ctx.quadraticCurveTo(-22, -32, 66, -30);
      ctx.lineTo(72, -20);
      ctx.quadraticCurveTo(-18, -20, -74, -4);
      ctx.closePath();
      ctx.fill();

      // 睜眼垂直張開遮罩
      ctx.save();
      ctx.scale(1, Math.max(0.08, eyeOpen));

      // 定義銳利杏仁/猛獸眼眶路徑 (用於填色與裁切虹膜)
      const defineEyePath = () => {
        ctx.beginPath();
        // 內眼角 (靠近鼻樑，銳利下壓)
        ctx.moveTo(-64, 4);
        // 上眼瞼弧線 (犀利上挑)
        ctx.quadraticCurveTo(-12, -22, 64, -10);
        // 下眼瞼弧線 (緊實微弧)
        ctx.quadraticCurveTo(8, 22, -64, 4);
        ctx.closePath();
      };

      // (b) 眼白 / 眼窩 (微帶冷暗陰影，更有立體感)
      defineEyePath();
      const scleraGrad = ctx.createLinearGradient(0, -18, 0, 18);
      scleraGrad.addColorStop(0, '#cbd5e1');
      scleraGrad.addColorStop(0.35, '#fffbeb');
      scleraGrad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = scleraGrad;
      ctx.fill();

      // (c) 裁切在眼眶內繪製虹膜、瞳孔與眼角血絲
      ctx.save();
      defineEyePath();
      ctx.clip();

      // 上眼瞼投下的深色陰影
      ctx.fillStyle = 'rgba(2, 4, 9, 0.28)';
      ctx.fillRect(-70, -24, 140, 11);

      // 內外眼角微暗血絲陰影
      ctx.fillStyle = 'rgba(185, 28, 28, 0.35)';
      ctx.beginPath();
      ctx.arc(-62, 4, 22, 0, Math.PI * 2);
      ctx.arc(62, -8, 20, 0, Math.PI * 2);
      ctx.fill();

      // 巨大魔性虹膜 (被眼眶完美裁切，呈現銳利壓迫眼神)
      const pupilGlow = 1 + Math.sin(t * 24) * 0.08;
      const irisX = -6; // 略微向內凝視，更有鎖定獵物感
      const irisY = -2;
      const irisR = 20 * pupilGlow;

      const eyeRad = ctx.createRadialGradient(irisX, irisY, 2, irisX, irisY, irisR);
      eyeRad.addColorStop(0, '#ffffff');
      eyeRad.addColorStop(0.28, '#ffd60a');
      eyeRad.addColorStop(0.68, eyeCol);
      eyeRad.addColorStop(1, '#3b0712');

      ctx.fillStyle = eyeRad;
      ctx.beginPath();
      ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2);
      ctx.fill();

      // 虹膜外圈深色邊線
      ctx.strokeStyle = '#090205';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 縱向野獸貓瞳 (Feline Slit Pupil)
      ctx.fillStyle = '#020409';
      ctx.beginPath();
      ctx.ellipse(irisX, irisY, 3.8, 15 * pupilGlow, 0, 0, Math.PI * 2);
      ctx.fill();

      // 銳利瞳孔高光 (Anime Glint)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(irisX - 5, irisY - 5, 3.2, 0, Math.PI * 2);
      ctx.arc(irisX + 4, irisY + 4, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // 結束眼眶 clip

      // (d) 粗重上眼瞼墨線 + 銳利眼尾挑勾
      ctx.strokeStyle = '#020409';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-66, 5);
      ctx.quadraticCurveTo(-12, -23, 68, -11);
      ctx.stroke();

      // 下眼瞼墨線
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-62, 5);
      ctx.quadraticCurveTo(8, 22, 62, -9);
      ctx.stroke();

      // (e) 殺意眼尾光焰向外曳出 (Eye Flare Sweeping Outward)
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = eyeCol;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(46, -8);
      ctx.quadraticCurveTo(88, -14, 145, -24 + Math.sin(t * 32) * 4);
      ctx.stroke();

      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(54, -9);
      ctx.lineTo(120, -19 + Math.sin(t * 32) * 3);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore(); // 結束睜眼縮放
      ctx.restore();
    }

    ctx.restore(); // 結束 eyeZoom
    ctx.restore(); // 結束 clip

    // 分鏡框粗黑墨線與金邊
    ctx.strokeStyle = '#020409';
    ctx.lineWidth = 6;
    ctx.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 3.0;
    ctx.strokeRect(-panelW / 2 + 3, -panelH / 2 + 3, panelW - 6, panelH - 6);

    // 刀光斬裂閃痕 (前 0.22 秒橫貫分鏡的白金刀光)
    if (phaseAge < 0.22) {
      const slashAlpha = 1 - phaseAge / 0.22;
      ctx.save();
      ctx.globalAlpha = slashAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffd60a';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(-panelW / 2, 0);
      ctx.lineTo(0, -14 * slashAlpha);
      ctx.lineTo(panelW / 2, 0);
      ctx.lineTo(0, 14 * slashAlpha);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // 結束傾斜分鏡

    // 3. 右上方爆炸擬聲大字「ズバッ！！」(確保不超出右側視窗邊界)
    const slashPop = 1 + 0.35 * Math.exp(-phaseAge * 10);
    const sfxSize = Math.min(42, vw * 0.09);
    const sfxX = Math.min(vw - Math.max(108, sfxSize * 2.5), vw * 0.72);
    drawComicSFX(ctx, 'ズバッ！！', sfxX, Math.max(winTop + 34, slitY + 22), {
      size: sfxSize,
      angle: -0.16,
      fill: '#ffd60a',
      stroke: '#020409',
      shadow: '#d90429',
      scale: slashPop,
    });

    // 4. 左上方漫畫標籤印章「【殺意鎖定】」
    drawComicStamp(ctx, '【殺意鎖定】', Math.max(76, vw * 0.18), Math.max(winTop + 28, slitY + 18), -0.08, '#ffd60a');

    ctx.restore();
  }

  // 第三階段：【滿版漫畫跨頁】震撼砸落 + 巨大「ドドンッ！！」擬聲字 + 霸氣破格立繪
  drawPhaseThreeBust(ctx, vw, winTop, winH) {
    const t = this.timer;
    const p = this.profile;
    const cx = vw * 0.5;
    const cy = winTop + winH * 0.53;
    const sfxAge = Math.max(0, t - 2.3);

    ctx.save();

    // 1. 滿屏漫畫放射集中線 (Radial Action Speed Lines)
    const lineCount = 54;
    const maxR = Math.max(vw, winH) * 1.1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.08 + Math.sin(t * 30) * 0.008);

    for (let i = 0; i < lineCount; i++) {
      const baseAng = (i / lineCount) * Math.PI * 2;
      const angSpan = 0.025 + (i % 3) * 0.015;
      const rInner = 80 + (i % 5) * 20;

      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 214, 10, 0.22)' : 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(baseAng - angSpan) * rInner, Math.sin(baseAng - angSpan) * rInner);
      ctx.lineTo(Math.cos(baseAng) * maxR, Math.sin(baseAng) * maxR);
      ctx.lineTo(Math.cos(baseAng + angSpan) * rInner, Math.sin(baseAng + angSpan) * rInner);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 2. 破格立繪 (從 1.48x 巨型縮放震撼砸落回基準尺寸 + 殘影衝擊 + 呼吸感)
    const bossKey = firstSpriteKey(
      [
        this.boss && this.boss.skin,
        this.boss && this.boss.skin && this.boss.skin.replace(/_final$/, ''),
        this.profile && this.profile.skin,
        'boss',
      ],
      'boss',
    );
    const spr = getSprite(bossKey);
    if (spr) {
      const slamProg = easeOutBack(clamp01(sfxAge / 0.22));
      const slamMul = 1.48 - 0.48 * slamProg;
      const breath = Math.sin(t * 6) * 4;
      const baseScale = Math.min(2.7, (winH * 0.80) / (spr.h || 120));
      const scale = baseScale * slamMul;

      const frameIdx = Math.floor(t * 8) % (spr.frames ? spr.frames.length : 1);
      const frame = spr.frames ? spr.frames[frameIdx] : null;

      // 背後漫畫鋸齒爆氣光環
      ctx.save();
      ctx.translate(cx, cy + breath);
      ctx.rotate(-t * 0.35);
      const burstR = Math.min(vw, winH) * 0.42;
      ctx.fillStyle = p.themeColor + '33';
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const r = i % 2 === 0 ? burstR : burstR * 0.62;
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (frame) {
        // 登場瞬間殘影 (前 0.28 秒)
        if (sfxAge < 0.28) {
          const ghostAlpha = (1 - sfxAge / 0.28) * 0.35;
          const ghostScale = scale * (1 + (0.28 - sfxAge) * 0.9);
          ctx.save();
          ctx.translate(cx, cy + breath);
          ctx.scale(ghostScale, ghostScale);
          ctx.globalAlpha = ghostAlpha;
          ctx.drawImage(frame, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
          ctx.restore();
        }

        // 本體立繪
        ctx.save();
        ctx.translate(cx, cy + breath);
        ctx.scale(scale, scale);
        ctx.shadowColor = p.themeColor;
        ctx.shadowBlur = 32;
        ctx.drawImage(frame, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
        ctx.restore();
      }
    }

    // 3. 巨型日漫登場擬聲大字「ドドンッ！！」(依視窗寬度自適應位置與字級，避免互撞或裁切)
    const popScale = 1.0 + Math.max(0, 0.48 * Math.exp(-sfxAge * 7)) * Math.sin(sfxAge * 24);
    const dodonSize = Math.max(26, Math.min(56, vw * 0.105));
    const dodonX = Math.min(vw - dodonSize * 2.55, vw * 0.72);

    drawComicSFX(ctx, 'ドドンッ！！', dodonX, winTop + winH * 0.20, {
      size: dodonSize,
      angle: -0.16,
      fill: '#ffd60a',
      stroke: '#05070d',
      shadow: '#d90429',
      scale: popScale,
    });

    // 4. 左側輔助擬聲小字「バァァン！」
    const banSize = Math.max(18, Math.min(34, vw * 0.065));
    const banX = Math.max(banSize * 2.1, vw * 0.20);
    drawComicSFX(ctx, 'バァァン！', banX, winTop + winH * 0.26, {
      size: banSize,
      angle: 0.14,
      fill: '#ffffff',
      stroke: '#05070d',
      shadow: '#d90429',
      scale: popScale * 0.95,
    });

    ctx.restore();
  }

  // 繪製上下純黑漫畫邊框 (Inked Borders + Caution Ribbon)
  drawLetterboxBars(ctx, vw, vh, topH, bottomH) {
    // 頂部純黑條
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, vw, topH);

    if (topH > 20) {
      // 頂部漫畫黃黑警戒邊線
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, topH);
      ctx.lineTo(vw, topH);
      ctx.stroke();

      // 頂部標語 (窄螢幕自動精簡左側標題，避免與右側威脅等級重疊)
      const isNarrow = vw < 560;
      ctx.font = `900 ${isNarrow ? 11 : 13}px "Noto Sans TC", monospace, sans-serif`;
      ctx.fillStyle = '#ffd60a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(isNarrow ? '/// BOSS SHOWDOWN' : '/// MANGA BOSS SHOWDOWN // 極限激戰 ///', 16, topH - 14);

      ctx.textAlign = 'right';
      ctx.fillStyle = (Math.sin(this.timer * 12) > 0) ? '#ff0038' : '#880015';
      const threatMatch = this.profile?.code?.match(/THREAT:\s*(SSS|SS|S|A)/);
      const threatRank = threatMatch ? threatMatch[1] : 'SSS';
      ctx.fillText(isNarrow ? `● THREAT: ${threatRank}` : `● THREAT LEVEL: ${threatRank} EXTREME`, vw - 16, topH - 14);
    }

    // 底部純黑條
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, vh - bottomH, vw, bottomH);

    if (bottomH > 20) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, vh - bottomH);
      ctx.lineTo(vw, vh - bottomH);
      ctx.stroke();
    }
  }

  // 繪製漫畫對白框與名牌 (Manga Comic Speech Panel & Slanted Nameplate)
  drawDialogueBox(ctx, vw, vh, boxH) {
    const p = this.profile;
    const boxY = vh - boxH;
    const pad = Math.max(14, Math.min(32, vw * 0.04));
    const phaseAge = Math.max(0, this.timer - 2.3);
    const boxIn = easeOutCubic(clamp01(phaseAge / 0.16));

    ctx.save();
    ctx.globalAlpha = boxIn;

    // 1. 傾斜漫畫黑色膠帶標題橫幅 (Slanted Nameplate Ribbon - 依視窗寬度自適應排版)
    const ribbonW = Math.min(vw - pad * 2, 520);
    const ribbonH = 44;
    const ribbonCx = vw < 600 ? vw / 2 : pad + ribbonW / 2;

    ctx.save();
    ctx.translate(ribbonCx, boxY + 30);
    ctx.rotate(-0.025);

    // 黑色墨底
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH);

    // 金黃描邊
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 3.0;
    ctx.strokeRect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH);

    // 首領主名稱 (依可用寬度自動縮放字級，避免撞到副標題)
    const bossName = this.boss ? this.boss.name : '未知首領';
    const displayName = `『 ${bossName} 』`;
    const showInlineCode = ribbonW >= 380;
    const maxNameW = showInlineCode ? ribbonW * 0.56 : ribbonW - 24;

    let nameFontSize = 26;
    ctx.font = `900 ${nameFontSize}px "Noto Sans TC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    while (nameFontSize > 16 && ctx.measureText(displayName).width > maxNameW) {
      nameFontSize -= 2;
      ctx.font = `900 ${nameFontSize}px "Noto Sans TC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 6;
    ctx.fillText(displayName, -ribbonW / 2 + 12, 0);

    // 稱號副標題 (僅在寬度充裕時並排，右對齊避免重疊)
    if (showInlineCode) {
      ctx.font = '800 11px monospace, sans-serif';
      ctx.fillStyle = '#ffd60a';
      ctx.textAlign = 'right';
      ctx.shadowBlur = 0;
      const codeText = p.code || 'THREAT SSS';
      const maxCodeW = ribbonW * 0.36;
      let clippedCode = codeText;
      while (clippedCode.length > 6 && ctx.measureText(clippedCode).width > maxCodeW) {
        clippedCode = clippedCode.slice(0, -1);
      }
      ctx.fillText(clippedCode, ribbonW / 2 - 12, 0);
    }

    ctx.restore();

    // 2. 漫畫對白泡泡 (Comic Dialogue Bubble Panel)
    const bubbleX = pad;
    const bubbleY = boxY + 60;
    const bubbleW = vw - pad * 2;
    const bubbleH = Math.max(54, boxH - 84);

    // 漫畫象牙白紙面底色
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);

    // 粗墨黑色邊框 (4px)
    ctx.strokeStyle = '#05070d';
    ctx.lineWidth = 4.0;
    ctx.strokeRect(bubbleX, bubbleY, bubbleW, bubbleH);

    // 漫畫對白角標 (Sharp corner ticks)
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(bubbleX, bubbleY, 10, 10);
    ctx.fillRect(bubbleX + bubbleW - 10, bubbleY, 10, 10);

    // 對白向上指向首領的尖角尾巴 (Speech Tail)
    const tailX = Math.min(bubbleX + 75, bubbleX + bubbleW * 0.25);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(tailX - 14, bubbleY);
    ctx.lineTo(tailX, bubbleY - 12);
    ctx.lineTo(tailX + 14, bubbleY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#05070d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tailX - 14, bubbleY);
    ctx.lineTo(tailX, bubbleY - 12);
    ctx.lineTo(tailX + 14, bubbleY);
    ctx.stroke();

    // 3. 漫畫紅色印章 (蓋在對白框右上角，與名牌完全錯開不重疊)
    const stampText = p.title?.includes('終末') ? '【滅世災厄】' : '【極惡凶煞】';
    drawComicStamp(ctx, stampText, bubbleX + bubbleW - 56, bubbleY + 18, -0.10, '#ff0038');

    // 4. 打字機對白 (支援自動換行，預留右側印章安全區)
    const quote = p.quote || '「……」';
    const currentText = quote.slice(0, this.typedChars);
    const textSize = vw < 480 ? 15 : 17;
    const lineH = textSize + 6;
    const textMaxW = Math.max(120, bubbleW - 130);

    ctx.font = `700 ${textSize}px "Noto Sans TC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;

    const lines = wrapDialogueLines(ctx, currentText, textMaxW);
    const maxLines = Math.max(1, Math.floor((bubbleH - 22) / lineH));
    const visibleLines = lines.slice(0, maxLines);

    for (let i = 0; i < visibleLines.length; i++) {
      ctx.fillText(visibleLines[i], bubbleX + 18, bubbleY + 14 + i * lineH);
    }

    // 漫畫光標閃爍 (跟隨最後一行文字尾端)
    if (this.typedChars < quote.length && Math.floor(this.timer * 6) % 2 === 0) {
      const lastLineIdx = Math.max(0, visibleLines.length - 1);
      const lastLine = visibleLines[lastLineIdx] || '';
      const textWidth = ctx.measureText(lastLine).width;
      ctx.fillStyle = '#d90429';
      ctx.fillRect(bubbleX + 18 + textWidth + 4, bubbleY + 14 + lastLineIdx * lineH, 8, textSize + 2);
    }

    // 5. 翻頁/跳過提示 (Manga Page Turn / Skip Prompt)
    ctx.font = '800 12px "Noto Sans TC", sans-serif';
    const blink = Math.sin(this.timer * 8) > 0;
    ctx.fillStyle = blink ? '#ffd60a' : 'rgba(255, 214, 10, 0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('▶ 按 [SPACE] 或 點擊 翻頁跳過 (SKIP)', vw - pad, vh - 8);

    ctx.restore();
  }

  // 輕量復古 CRT 掃描線（快取 1×4 pattern，一次 fillRect 完成，取代逐行數百次 fillRect）
  drawScanlines(ctx, x, y, w, h) {
    if (!this._scanlinePat && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const sx = c.getContext('2d');
      sx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      sx.fillRect(0, 0, 4, 1);
      this._scanlinePat = ctx.createPattern(c, 'repeat');
    }
    if (this._scanlinePat) {
      ctx.fillStyle = this._scanlinePat;
      ctx.fillRect(x, y, w, h);
    }
  }
}
