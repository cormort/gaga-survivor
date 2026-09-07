// 特工黑市 (Shop System)：消耗 DNA 與金幣購買軍火補給、單局戰術興奮劑及後勤設施擴充

import { rollItem, RARITIES } from './items.js';

export const SHOP_CRATES = {
  rare_crate: {
    id: 'rare_crate',
    name: '精良軍備箱',
    icon: '📦',
    desc: '內含 1 件精良 (Rare) 或以上特工裝備',
    color: '#00b4d8',
    costGold: 250,
    costDna: 50,
    roll: () => rollItem({ rarity: Math.random() < 0.25 ? 'epic' : 'rare' }),
  },
  epic_crate: {
    id: 'epic_crate',
    name: '史詩機密箱',
    icon: '🧰',
    desc: '內含 1 件史詩 (Epic) 或更高階特工裝備',
    color: '#b5179e',
    costGold: 650,
    costDna: 130,
    roll: () => rollItem({ rarity: Math.random() < 0.2 ? 'legendary' : 'epic' }),
  },
  legendary_crate: {
    id: 'legendary_crate',
    name: '傳奇特工箱',
    icon: '👑',
    desc: '必得 1 件傳奇 (Legendary) 裝備，附帶強力傳奇特效！',
    color: '#ffb703',
    costGold: 1600,
    costDna: 320,
    roll: () => rollItem({ rarity: 'legendary' }),
  },
};

export const SHOP_BOOSTERS = {
  speed_stim: {
    id: 'speed_stim',
    name: '迅捷興奮劑',
    icon: '💉',
    desc: '下局出擊：特工移動速度 +15%',
    color: '#4cc9f0',
    costGold: 80,
    costDna: 15,
  },
  pierce_ammo: {
    id: 'pierce_ammo',
    name: '穿甲彈藥箱',
    icon: '⚡',
    desc: '下局出擊：投射物武器穿透次數 +1',
    color: '#ffd166',
    costGold: 120,
    costDna: 25,
  },
  fortune_magnet: {
    id: 'fortune_magnet',
    name: '財運超導磁石',
    icon: '🧲',
    desc: '下局出擊：拾取半徑 +50%，局內金幣收益 +30%',
    color: '#06d6a0',
    costGold: 100,
    costDna: 20,
  },
  frenzy_core: {
    id: 'frenzy_core',
    name: '狂暴戰鬥核心',
    icon: '💥',
    desc: '下局出擊：暴擊率 +10%，暴擊傷害 +25%',
    color: '#ef476f',
    costGold: 150,
    costDna: 30,
  },
  vitality_shield: {
    id: 'vitality_shield',
    name: '納米護盾裝置',
    icon: '🛡️',
    desc: '下局出擊：開局獲得 100 點高能護盾抵擋傷害',
    color: '#118ab2',
    costGold: 100,
    costDna: 20,
  },
};

export const STASH_EXPANSION_STEP = 5;
export const MAX_STASH_CAP = 60;
export const STASH_EXPAND_COST = {
  costGold: 800,
  costDna: 160,
};
