// 流浪商人（週期出現、面板商品、購買與離場）。
//
// 為什麼獨立成一個模組：這批方法佔 main.js 約 170 行，是完整的「商店」子系統 ——
// 面板 DOM、商品洗牌、購買結算都在這裡。手法與 js/systems/Hazards.js 相同：
// game 當第一個參數，this. → game.，模組本身不持有遊戲狀態。
//
// 呼叫端：main.js 以 checkMerchantSchedule(this, dt) 這種形式呼叫。

import { sound } from '../audio.js';
import { shuffleInPlace } from './Progression.js';

export function checkMerchantSchedule(game, dt) {
  if (game.merchant || !game.mode || game.mode.id !== 'survivor') return;
  game._merchantTimer -= dt;   // 原本寫死 1/60，120Hz 時商人會提早一倍出現
  if (game._merchantTimer <= 0) {
    spawnMerchant(game);
    game._merchantTimer = 150; // 下次 2.5 分鐘後
  }
}

export function spawnMerchant(game) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 250 + Math.random() * 150;
  const mx = game.player.x + Math.cos(ang) * dist;
  const my = game.player.y + Math.sin(ang) * dist;
  // 隨機挑 3 件商品
  const shuffled = shuffleInPlace([...MERCHANT_ITEMS]);
  game.merchant = {
    x: mx, y: my,
    timer: 25, // 停留 25 秒
    items: shuffled.slice(0, 3),
    interactDist: 80,
  };
  game.ui.say('🏪 流浪商人出現了！快去看看', '#ffd166', 3);
}

export function updateMerchant(game, dt) {
  if (!game.merchant) return;
  game.merchant.timer -= dt;
  if (game.merchant.timer <= 0) {
    closeMerchantPanel(game);
    game.merchant = null;
    return;
  }
  // 玩家靠近時顯示購買面板
  const dx = game.player.x - game.merchant.x;
  const dy = game.player.y - game.merchant.y;
  const dist = Math.hypot(dx, dy);
  if (dist < game.merchant.interactDist) {
    if (!game.merchant.panelOpen) openMerchantPanel(game);
  } else if (game.merchant.panelOpen) {
    closeMerchantPanel(game);
  }
}

export function dismissMerchant(game) {
  closeMerchantPanel(game);
  game.merchant = null;
}

export function openMerchantPanel(game) {
  if (game.state !== 'PLAYING') return;
  game.merchant.panelOpen = true;
  game.state = 'MERCHANT_MODAL';
  sound.pauseBGM();
  game.ui.showMerchant(game.merchant, game.gold, (item) => buyMerchantItem(game, item));
}

export function closeMerchantPanel(game) {
  if (game.merchant) game.merchant.panelOpen = false;
  if (game.state === 'MERCHANT_MODAL') {
    game.state = 'PLAYING';
    sound.resumeBGM();
  }
  game.ui.hideMerchant();
}

export function buyMerchantItem(game, item) {
  const cost = Math.round(item.cost * (game.mode.turretCostMul || 1));
  if (game.gold < cost) {
    game.ui.say('金幣不足！', '#ff0055', 1.5);
    sound.playHurt();
    return;
  }
  game.gold -= cost;
  game._merchantBuys++;
  sound.playGem();
  game.particles.createShockwave(game.player.x, game.player.y, 120, item.color);

  switch (item.id) {
    case 'mega_heal':
      game.player.heal(80);
      break;
    case 'temp_overclock':
      game.player.cdrMultiplier = Math.max(0.3, game.player.cdrMultiplier * 0.6);
      game._tempBuffs.push({
        id: item.id, timer: item.duration,
        revert: (p) => { p.cdrMultiplier = Math.min(1, p.cdrMultiplier / 0.6); },
        // applyPassives 會把 cdrMultiplier 從頭算，這裡讓重算後能補回 buff
        reapply: (p) => { p.cdrMultiplier = Math.max(0.3, p.cdrMultiplier * 0.6); },
      });
      break;
    case 'energy_shield':
      game.player.shield = (game.player.shield || 0) + 100;
      game.player.maxShield = Math.max(game.player.maxShield || 0, game.player.shield);
      break;
    case 'hyper_magnet':
      game.player.magnetMultiplier *= 3;
      game._tempBuffs.push({
        id: item.id, timer: item.duration,
        revert: (p) => { p.magnetMultiplier /= 3; },
        reapply: (p) => { p.magnetMultiplier *= 3; },
      });
      break;
    case 'orbital_strike':
      game.weaponManager.schedule(3, () => {
        game.camera.shake = Math.max(game.camera.shake, 20);
        sound.playExplosion();
        for (const e of game.enemies) {
          if (e.isBoss) e.takeDamage(500, 8, game.player.x, game.player.y);
          else e.takeDamage(500, 12, game.player.x, game.player.y);
        }
        game.particles.createExplosion(game.player.x, game.player.y, 220);
      });
      break;
    case 'fire_enchant':
      game.player._fireEnchant = true;
      game._tempBuffs.push({
        id: item.id, timer: item.duration,
        revert: (p) => { p._fireEnchant = false; },
      });
      break;
  }
  // 從商人貨架移除已購買的商品
  if (game.merchant) {
    game.merchant.items = game.merchant.items.filter((i) => i.id !== item.id);
    if (game.merchant.items.length === 0) {
      closeMerchantPanel(game);
      game.merchant = null;
    } else {
      game.ui.showMerchant(game.merchant, game.gold, (it) => buyMerchantItem(game, it));
    }
  }
  game.ui.say(`購買：${item.icon} ${item.name}`, item.color, 2);
}

export function drawMerchant(game, camera) {
  if (!game.merchant) return;
  const sx = game.merchant.x - camera.x;
  const sy = game.merchant.y - camera.y;
  const ctx = game.ctx;

  // 互動範圍金色光圈 (脈衝效果)
  const pulse = 1 + Math.sin(Date.now() / 200) * 0.08;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, game.merchant.interactDist * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 腳下金色光暈
  ctx.beginPath();
  ctx.arc(sx, sy, 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
  ctx.fill();

  // 商人圖標 (黑市浣熊商人)
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦝', sx, sy - 6);

  // 標籤與剩餘時間
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`流浪商人 (${Math.ceil(game.merchant.timer)}s)`, sx, sy - 34);

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('靠近選購', sx, sy + 22);
  ctx.restore();
}
