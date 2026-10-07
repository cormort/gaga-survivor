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
    if (bossName && bossName.startsWith('深淵·')) {
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
    this._phase2Stab = false;
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
    this.flash = 0.4;
    this.barsOffset = 1;
    this._phase2Stab = false;

    // 播放登場過場音效
    sound.playBossCinematicSting();
  }

  skip() {
    if (!this.active) return;
    this.finish();
  }

  finish() {
    this.active = false;
    sound.playSwordSlash();
    if (this.game && this.game.camera) {
      this.game.camera.shake = 18;
    }
  }

  update(dt) {
    if (!this.active) return;

    // 以真即時時間計算 (避免後台或低幀率造成動畫停滯)
    const now = performance.now() / 1000;
    this.timer = now - this.startTime;

    // 閃光快速衰減
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 10.0);
    }

    // 電影黑邊平滑閉合 (前 0.25 秒到位)
    if (this.timer < 0.25) {
      const p = this.timer / 0.25;
      this.barsOffset = 1 - Math.sin(p * Math.PI / 2);
    } else {
      this.barsOffset = 0;
    }

    // 階段判定與過渡音效
    if (this.timer < 0.35) {
      this.phase = 0;
    } else if (this.timer < 1.3) {
      this.phase = 1;
    } else if (this.timer < 2.3) {
      if (!this._phase2Stab) {
        this._phase2Stab = true;
        sound.playSwordSlash();
        this.flash = 0.35;
      }
      this.phase = 2;
    } else {
      this.phase = 3;
    }

    // 階段 3：字卡打字機
    if (this.phase === 3) {
      const quote = this.profile.quote || '';
      const typeTime = this.timer - 2.3;
      const targetChars = Math.min(quote.length, Math.floor(typeTime * 24)); // 每秒 24 字
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
    const topBarHeight = Math.max(52, vh * 0.14);
    const bottomBarHeight = Math.max(120, vh * 0.28);
    const barAnim = this.barsOffset;

    const curTopH = topBarHeight * (1 - barAnim);
    const curBottomH = bottomBarHeight * (1 - barAnim);

    // 電影觀景窗區域 (Viewport)
    const winTop = curTopH;
    const winBottom = vh - curBottomH;
    const winHeight = winBottom - winTop;

    if (winHeight > 10) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, winTop, vw, winHeight);
      ctx.clip();

      // 2. 觀景窗背景與動態氛圍 (漫畫風高對比黑底 + 集中線 + 網點)
      this.drawCinemaBackdrop(ctx, 0, winTop, vw, winHeight);

      // 3. 依據分鏡階段繪製主視覺
      if (this.phase === 0 || this.phase === 1) {
        // 第一分鏡：剪影威壓壓境 + 警報橫幅 + 「ゴゴゴゴ…」
        this.drawPhaseOne(ctx, vw, winTop, winHeight);
      } else if (this.phase === 2) {
        // 第二分鏡：【漫畫斜切特寫】極限眼神 + 「ズバッ！！」
        this.drawPhaseTwoEyeSlit(ctx, vw, winTop, winHeight);
      } else {
        // 第三分鏡：【滿版跨頁】破格半身立繪 + 「ドドンッ！！」
        this.drawPhaseThreeBust(ctx, vw, winTop, winHeight);
      }

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

    // 6. 白光一閃 (Flash)
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, this.flash)})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    ctx.restore();
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

  // 第一階段：漫畫警告分鏡 + 「ゴゴゴゴ…」強者氣場
  drawPhaseOne(ctx, vw, winTop, winH) {
    const t = this.timer;
    const cx = vw / 2;
    const cy = winTop + winH / 2;
    const p = this.profile;

    // 1. 兩側「ゴ ゴ ゴ ゴ…」日漫氣場爬升
    const gogoTexts = ['ゴ', 'ゴ', 'ゴ', 'ゴ'];
    for (let side = -1; side <= 1; side += 2) {
      const baseX = side === -1 ? 52 : vw - 52;
      for (let i = 0; i < gogoTexts.length; i++) {
        const charY = winTop + winH * 0.22 + i * (winH * 0.16);
        const charScale = 1.0 + i * 0.28 + Math.sin(t * 12 + i) * 0.08;
        const charAngle = side === -1 ? -0.22 : 0.22;
        drawComicSFX(ctx, gogoTexts[i], baseX + side * Math.sin(t * 15 + i) * 4, charY, {
          size: Math.round(28 * charScale),
          angle: charAngle,
          fill: '#ffd60a',
          stroke: '#020409',
          shadow: '#d90429',
          scale: 1.0,
        });
      }
    }

    // 2. 遠方黑影剪影 (先於橫幅繪製，帶深邃黑霧與狂烈紅芒)
    const bossKey = firstSpriteKey(
      [this.boss && this.boss.skin, this.boss && this.boss.skin && this.boss.skin.replace(/_final$/, ''), 'boss'],
      'boss',
    );
    const spr = getSprite(bossKey);
    if (spr) {
      ctx.save();
      ctx.translate(cx, cy + 30);
      ctx.scale(2.2, 2.2);
      ctx.shadowColor = p.themeColor;
      ctx.shadowBlur = 32;
      ctx.globalAlpha = Math.min(0.95, Math.max(0.1, (t - 0.15) * 4));

      // 剪影背後暗紅狂暴光暈
      const haloGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
      haloGrad.addColorStop(0, p.themeColor + '88');
      haloGrad.addColorStop(0.6, p.themeColor + '33');
      haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.fill();

      const frame = spr.frames[0];
      if (frame) {
        ctx.drawImage(frame, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      }
      ctx.restore();
    }

    // 3. 漫畫傾斜警告標題條 (置於最上層，Slanted Caution Comic Banner)
    ctx.save();
    ctx.translate(cx, winTop + winH * 0.28);
    ctx.rotate(-0.05);

    const bannerW = Math.min(vw * 0.88, 560);
    const bannerH = 64;

    // 黑底粗邊
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 4;
    ctx.strokeRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH);

    // 黃黑警示邊界斜紋 (Hazard Stripes)
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(-bannerW / 2, -bannerH / 2, bannerW, 8);
    ctx.fillRect(-bannerW / 2, bannerH / 2 - 8, bannerW, 8);

    // 警示大字
    ctx.font = '900 24px "Noto Sans TC", "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff0038';
    ctx.shadowColor = '#ff0038';
    ctx.shadowBlur = 14;
    ctx.fillText('⚠ 警 告：極 惡 首 領 來 襲 ⚠', 0, -4);

    ctx.font = '800 13px monospace, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.fillText('// HIGH-LEVEL TARGET INTERCEPTED //', 0, 18);
    ctx.restore();
  }

  // 第二階段：【漫畫斜切分鏡】殺意眼神橫切 + 「ズバッ！！」斬擊音效
  drawPhaseTwoEyeSlit(ctx, vw, winTop, winH) {
    const t = this.timer;
    const p = this.profile;
    const slitH = Math.min(180, winH * 0.82);
    const slitY = winTop + (winH - slitH) / 2;

    ctx.save();

    // 1. 傾斜漫畫眼部橫切分鏡框 (Slanted Comic Panel)
    ctx.save();
    ctx.translate(vw / 2, slitY + slitH / 2);
    ctx.rotate(-0.045); // 傾斜約 -2.6 度，強烈美漫分鏡感

    const panelW = vw + 80;
    const panelH = slitH;

    // 分鏡背景深黑墨底
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);

    // 半調網點
    const halftone = getComicHalftone(ctx);
    if (halftone) {
      ctx.fillStyle = halftone;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(-panelW / 2, -panelH / 2, panelW, panelH);
      ctx.globalAlpha = 1.0;
    }

    // 速度線狂嘯 (濃烈橫向速度線)
    ctx.strokeStyle = p.themeColor;
    ctx.lineWidth = 3.0;
    for (let i = 0; i < 28; i++) {
      const ly = -panelH / 2 + (i / 28) * panelH;
      const lx = ((i * 137 + t * 1300) % (panelW + 300)) - panelW / 2 - 150;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 280, ly);
      ctx.stroke();
    }

    // 2. 雙目極限特寫 (高對比兇狠日漫怒目)
    const eyeDist = Math.min(130, vw * 0.20);
    const eyeCol = p.eyeColor || '#ff0038';

    // 眉宇深邃狂氣黑影與青筋 (Angry Furrow)
    ctx.fillStyle = '#080c16';
    ctx.beginPath();
    ctx.moveTo(-eyeDist * 2.4, -60);
    ctx.lineTo(0, -22);
    ctx.lineTo(eyeDist * 2.4, -60);
    ctx.lineTo(eyeDist * 2.4, -panelH / 2);
    ctx.lineTo(-eyeDist * 2.4, -panelH / 2);
    ctx.closePath();
    ctx.fill();

    // 額頭殺氣符紋/血印
    ctx.strokeStyle = eyeCol;
    ctx.lineWidth = 3;
    ctx.shadowColor = eyeCol;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(0, -26);
    ctx.moveTo(-12, -42);
    ctx.lineTo(0, -32);
    ctx.lineTo(12, -42);
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (const side of [-1, 1]) {
      const ex = side * eyeDist;
      ctx.save();
      ctx.translate(ex, 6);
      if (side === -1) ctx.scale(-1, 1);

      // (a) 濃烈怒目劍眉 (Heavy Inked Eyebrow)
      ctx.fillStyle = '#020409';
      ctx.beginPath();
      ctx.moveTo(-85, -32);
      ctx.quadraticCurveTo(-20, -42, 60, -18);
      ctx.quadraticCurveTo(-10, -22, -85, -32);
      ctx.fill();

      // (b) 兇猛眼眶輪廓 (高亮眼白/眼窩，破除黑底看不清問題)
      ctx.fillStyle = '#fff9db';
      ctx.beginPath();
      ctx.moveTo(-65, -8);
      ctx.quadraticCurveTo(-15, -28, 55, -8);
      ctx.quadraticCurveTo(0, 24, -65, -8);
      ctx.closePath();
      ctx.fill();

      // 眼角血絲/暗影
      ctx.fillStyle = 'rgba(217, 4, 41, 0.45)';
      ctx.beginPath();
      ctx.moveTo(-65, -8);
      ctx.quadraticCurveTo(-35, -2, -15, 6);
      ctx.quadraticCurveTo(-45, 12, -65, -8);
      ctx.fill();

      // (c) 粗重上眼瞼黑框
      ctx.strokeStyle = '#020409';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-70, -8);
      ctx.quadraticCurveTo(-15, -30, 60, -8);
      ctx.stroke();

      // (d) 下眼瞼黑框
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-60, -7);
      ctx.quadraticCurveTo(0, 26, 52, -7);
      ctx.stroke();

      // (e) 巨大魔性虹膜與怒目金/紅瞳 (Menacing Iris & Feline Slit Pupil)
      const pupilGlow = 1 + Math.sin(t * 22) * 0.12;
      const eyeRad = ctx.createRadialGradient(0, -3, 2, 0, -3, 30 * pupilGlow);
      eyeRad.addColorStop(0, '#ffffff');
      eyeRad.addColorStop(0.25, '#ffd60a');
      eyeRad.addColorStop(0.65, eyeCol);
      eyeRad.addColorStop(1, '#05070d');

      ctx.fillStyle = eyeRad;
      ctx.beginPath();
      ctx.arc(0, -3, 24 * pupilGlow, 0, Math.PI * 2);
      ctx.fill();

      // 縱向野獸貓瞳 (Feline Slit Pupil)
      ctx.fillStyle = '#020409';
      ctx.beginPath();
      ctx.ellipse(0, -3, 5, 20 * pupilGlow, 0, 0, Math.PI * 2);
      ctx.fill();

      // 瞳孔高光 (Anime Glint)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-6, -8, 4, 0, Math.PI * 2);
      ctx.arc(4, 2, 2, 0, Math.PI * 2);
      ctx.fill();

      // (f) 殺意雷霆目芒拖尾 (Eye Lightning Stream)
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 4.5;
      ctx.shadowColor = eyeCol;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(-2, -3);
      ctx.quadraticCurveTo(-40, -8, -160, -26 + Math.sin(t * 30) * 8);
      ctx.stroke();

      // 狂雷閃電微弧 (Zigzag Sparks)
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(-35, 12);
      ctx.lineTo(-65, -10);
      ctx.lineTo(-110, 8);
      ctx.stroke();

      ctx.restore();
    }

    // 分鏡框粗黑墨線與金邊
    ctx.strokeStyle = '#020409';
    ctx.lineWidth = 6;
    ctx.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 3.0;
    ctx.strokeRect(-panelW / 2 + 3, -panelH / 2 + 3, panelW - 6, panelH - 6);

    ctx.restore(); // 結束傾斜分鏡

    // 3. 右上方爆炸擬聲大字「ズバッ！！」(SLASH!!)
    drawComicSFX(ctx, 'ズバッ！！', vw - 120, slitY + 32, {
      size: 46,
      angle: -0.18,
      fill: '#ffd60a',
      stroke: '#020409',
      shadow: '#d90429',
    });

    // 4. 左上方漫畫標籤印章「【殺意鎖定】」
    drawComicStamp(ctx, '【殺意鎖定】', 95, slitY + 28, -0.08, '#ffd60a');

    ctx.restore();
  }

  // 第三階段：【滿版漫畫跨頁】巨大「ドドンッ！！」擬聲字 + 霸氣破格立繪 + 稱號印章
  drawPhaseThreeBust(ctx, vw, winTop, winH) {
    const t = this.timer;
    const p = this.profile;
    const cx = vw * 0.5;
    const cy = winTop + winH * 0.54;

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

    // 2. 破格立繪 (2.7x 巨大化半身像，帶強烈漫畫描邊與呼吸感)
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
      const breath = Math.sin(t * 6) * 4;
      const scale = Math.min(2.7, (winH * 0.82) / (spr.h || 120));

      ctx.save();
      ctx.translate(cx, cy + breath);
      ctx.scale(scale, scale);

      // 漫畫外發光
      ctx.shadowColor = p.themeColor;
      ctx.shadowBlur = 32;

      const frameIdx = Math.floor(t * 8) % (spr.frames ? spr.frames.length : 1);
      const frame = spr.frames ? spr.frames[frameIdx] : null;
      if (frame) {
        ctx.drawImage(frame, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      }
      ctx.restore();
    }

    // 3. 巨型日漫登場擬聲大字「ドドンッ！！」(DODON!!) 震撼砸落！
    // 登場前 0.3 秒具備彈簧縮放衝擊
    const sfxAge = Math.max(0, t - 2.3);
    const popScale = 1.0 + Math.max(0, 0.45 * Math.exp(-sfxAge * 7)) * Math.sin(sfxAge * 24);

    drawComicSFX(ctx, 'ドドンッ！！', vw * 0.78, winTop + winH * 0.26, {
      size: Math.min(68, vw * 0.16),
      angle: -0.18,
      fill: '#ffd60a',
      stroke: '#05070d',
      shadow: '#d90429',
      scale: popScale,
    });

    // 4. 左側輔助擬聲小字「バァァァン！！」(BAAAANG!!)
    drawComicSFX(ctx, 'バァァン！', vw * 0.22, winTop + winH * 0.32, {
      size: Math.min(38, vw * 0.09),
      angle: 0.16,
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

      // 頂部標語
      ctx.font = '900 13px "Noto Sans TC", monospace, sans-serif';
      ctx.fillStyle = '#ffd60a';
      ctx.textAlign = 'left';
      ctx.fillText('/// MANGA BOSS SHOWDOWN // 極限激戰 ///', 24, topH - 14);

      ctx.textAlign = 'right';
      ctx.fillStyle = (Math.sin(this.timer * 12) > 0) ? '#ff0038' : '#880015';
      ctx.fillText('● THREAT LEVEL: SSS EXTREME', vw - 24, topH - 14);
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
    const pad = Math.min(32, vw * 0.05);

    ctx.save();

    // 1. 傾斜漫畫黑色膠帶標題橫幅 (Slanted Nameplate Ribbon)
    ctx.save();
    ctx.translate(pad + 160, boxY + 36);
    ctx.rotate(-0.035);

    const ribbonW = Math.min(vw - pad * 2, 420);
    const ribbonH = 46;

    // 黑色墨底
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH);

    // 金黃描邊
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 3.0;
    ctx.strokeRect(-ribbonW / 2, -ribbonH / 2, ribbonW, ribbonH);

    // 首領主名稱 (大字書法 / 粗黑體)
    ctx.font = '900 28px "Noto Sans TC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 6;
    const bossName = this.boss ? this.boss.name : '未知首領';
    ctx.fillText(`『 ${bossName} 』`, -ribbonW / 2 + 16, 0);

    // 稱號副標題
    ctx.font = '800 11px monospace, sans-serif';
    ctx.fillStyle = '#ffd60a';
    ctx.fillText(p.code || 'THREAT SSS', ribbonW / 2 - 130, 0);

    ctx.restore();

    // 2. 漫畫紅色印章 (Red Seal Stamp)
    const stampText = p.title?.includes('終末') ? '【滅世災厄】' : '【極惡凶煞】';
    drawComicStamp(ctx, stampText, vw - pad - 60, boxY + 35, -0.12, '#ff0038');

    // 3. 漫畫對白泡泡 (Comic Dialogue Bubble Panel)
    const bubbleX = pad;
    const bubbleY = boxY + 68;
    const bubbleW = vw - pad * 2;
    const bubbleH = boxH - 96;

    // 漫畫象牙白紙面底色
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);

    // 粗墨黑色邊框 (4px)
    ctx.strokeStyle = '#05070d';
    ctx.lineWidth = 4.0;
    ctx.strokeRect(bubbleX, bubbleY, bubbleW, bubbleH);

    // 漫畫對白角標 (Sharp corner ticks)
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(bubbleX, bubbleY, 12, 12);
    ctx.fillRect(bubbleX + bubbleW - 12, bubbleY, 12, 12);

    // 對白向上指向首領的尖角尾巴 (Speech Tail)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(bubbleX + 60, bubbleY);
    ctx.lineTo(bubbleX + 75, bubbleY - 14);
    ctx.lineTo(bubbleX + 90, bubbleY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#05070d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(bubbleX + 60, bubbleY);
    ctx.lineTo(bubbleX + 75, bubbleY - 14);
    ctx.lineTo(bubbleX + 90, bubbleY);
    ctx.stroke();

    // 4. 打字機對白 (Typewriter text in crisp ink black)
    const quote = p.quote || '「……」';
    const currentText = quote.slice(0, this.typedChars);

    ctx.font = '700 17px "Noto Sans TC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    ctx.fillText(currentText, bubbleX + 22, bubbleY + 16);

    // 漫畫光標閃爍
    if (this.typedChars < quote.length && Math.floor(this.timer * 6) % 2 === 0) {
      const textWidth = ctx.measureText(currentText).width;
      ctx.fillStyle = '#d90429';
      ctx.fillRect(bubbleX + 22 + textWidth + 4, bubbleY + 16, 9, 20);
    }

    // 5. 翻頁/跳過提示 (Manga Page Turn / Skip Prompt)
    ctx.font = '800 12px "Noto Sans TC", sans-serif';
    const blink = Math.sin(this.timer * 8) > 0;
    ctx.fillStyle = blink ? '#ffd60a' : 'rgba(255, 214, 10, 0.55)';
    ctx.textAlign = 'right';
    ctx.fillText('▶ 按 [SPACE] 或 點擊 翻頁跳過 (SKIP)', vw - pad - 12, vh - 14);

    ctx.restore();
  }

  // 輕量復古 CRT 掃描線
  drawScanlines(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let i = 0; i < h; i += 4) {
      ctx.fillRect(x, y + i, w, 1.2);
    }
  }
}
