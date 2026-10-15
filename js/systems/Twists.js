// 關卡玩法規則（level.rules.twist）：數值規則只改手感，這一層改「怎麼走位」。
// 每關最多一條，只在生存者模式生效（守塔的生成走路線，視野與推力會干擾擺塔）。
//   front：怪潮只從一個扇形方向湧入，方向定時轉移（鏽蝕地下鐵）
//   fog  ：玩家周圍以外被濃霧遮蔽，視野半徑緩慢呼吸（毒霧沼澤）
//   wind ：持續沙暴推著特工走，風向定時改變並先預警（沙暴要塞）
//   cycle：每 every 秒輪換 pool 裡的下一條規則，開場 every 秒內無規則（深淵無盡戰）

const DIR_NAMES = ['東', '東南', '南', '西南', '西', '西北', '北', '東北'];
const dirName = (a) => DIR_NAMES[Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];

// 換向：至少轉 90°，不然玩家感覺不到變化
const turnAngle = (a) => a + (Math.PI / 2 + Math.random() * Math.PI) * (Math.random() < 0.5 ? 1 : -1);

export function initTwist(game) {
  const t = game.td ? null : game.level?.rules?.twist;
  game.twistCycle = t?.type === 'cycle' ? { ...t, timer: 0, idx: 0 } : null;
  applyTwist(game, game.twistCycle ? null : t);
}

function applyTwist(game, t) {
  // radius 先給 min：start() 會在第一次 update 前就 render 一次
  game.twist = t ? { ...t, angle: Math.random() * Math.PI * 2, timer: 0, warn: 0, radius: t.min } : null;
  game.spawner.frontArc = null;
  game.player.windPush = null;
  if (t?.type === 'front') game.spawner.frontArc = { angle: game.twist.angle, width: t.arc };
}

export function updateTwist(game, dt) {
  const c = game.twistCycle;
  if (c && (c.timer += dt) >= c.every) {
    c.timer = 0;
    const t = c.pool[c.idx++ % c.pool.length];
    applyTwist(game, t);
    game.ui.say(`🌀 深淵變相：${t.label}`, '#b388ff', 3.5);
  }
  const tw = game.twist;
  if (!tw) return;
  tw.timer += dt;

  if (tw.type === 'front' || tw.type === 'wind') {
    // 換向前 tw.warnTime 秒先預告新方向
    if (!tw.warn && tw.timer >= tw.every - tw.warnTime) {
      tw.next = turnAngle(tw.angle);
      tw.warn = 1;
      // tw.msg 可自訂（{dir} 換成方向）：同一種規則在不同關卡有自己的說法（鑄造廠的傳送帶、魔界村的大門）
      const msg = tw.msg ? tw.msg.replace('{dir}', dirName(tw.next))
        : tw.type === 'front'
        ? `🚇 隧道轉向！怪潮即將改從【${dirName(tw.next)}】湧入`
        : `🌪️ 風向轉變！沙暴即將吹向【${dirName(tw.next)}】`;
      game.ui.say(msg, '#ffb703', 3);
    }
    if (tw.timer >= tw.every) {
      tw.angle = tw.next;
      tw.timer = 0;
      tw.warn = 0;
      if (game.spawner.frontArc) game.spawner.frontArc.angle = tw.angle;
    }
  }

  if (tw.type === 'wind') {
    // 陣風：力道在 0.6~1.0 之間起伏，預警期間減弱（給玩家換位的空檔）
    const gust = tw.warn ? 0.35 : 0.8 + 0.2 * Math.sin(tw.timer * 1.3);
    game.player.windPush = { x: Math.cos(tw.angle) * tw.force * gust, y: Math.sin(tw.angle) * tw.force * gust };
  }

  if (tw.type === 'fog') {
    // 視野呼吸：每 tw.every 秒一個週期，在 min~max 之間緩慢變化
    const k = 0.5 - 0.5 * Math.cos((tw.timer / tw.every) * Math.PI * 2);
    tw.radius = tw.min + (tw.max - tw.min) * k;
  }
}

// 畫在粒子之後、暗角之前（螢幕空間，ctx 已套用 zoom）
export function drawTwist(game, ctx, cam) {
  const tw = game.twist;
  if (!tw) return;
  const { vw, vh } = game;
  const px = game.player.x - cam.x;
  const py = game.player.y - cam.y;

  if (tw.type === 'fog') {
    const r = tw.radius;
    const c = tw.color || '28,44,22';   // 霧的顏色（沼澤孢子綠、霜封暴風雪白、仙山山嵐灰）
    const g = ctx.createRadialGradient(px, py, r * 0.55, px, py, r * 1.35);
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(0.6, `rgba(${c},0.78)`);
    g.addColorStop(1, `rgba(${c},0.96)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    return;
  }

  if (tw.type === 'front') {
    // 畫面邊緣的紅色箭頭指出怪潮方向；預警時另以黃色箭頭指出下一個方向
    drawChevrons(ctx, vw, vh, tw.angle, 'rgba(255,70,70,', game.gameTime, true);
    if (tw.warn) drawChevrons(ctx, vw, vh, tw.next, 'rgba(255,200,40,', game.gameTime * 2, true);
    return;
  }

  if (tw.type === 'wind') {
    // 風沙條紋：固定 48 條、位置由索引雜湊決定、沿風向平移
    const w = game.player.windPush;
    if (!w) return;
    const len = Math.hypot(w.x, w.y) || 1;
    const dx = w.x / len, dy = w.y / len;
    const t = game.gameTime * 420;
    ctx.save();
    ctx.strokeStyle = tw.streak || 'rgba(232,200,140,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const sx = ((i * 7919) % 1000) / 1000 * vw;
      const sy = ((i * 6271) % 1000) / 1000 * vh;
      const x = ((sx + dx * (t + i * 37)) % vw + vw) % vw;
      const y = ((sy + dy * (t + i * 37)) % vh + vh) % vh;
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * 26, y - dy * 26);
    }
    ctx.stroke();
    ctx.restore();
    if (tw.warn) drawChevrons(ctx, vw, vh, tw.next, 'rgba(255,200,40,', game.gameTime * 2, false);
  }
}

function drawChevrons(ctx, vw, vh, angle, rgbaPrefix, t, inward) {
  const cx = vw / 2, cy = vh / 2;
  const r = Math.min(vw, vh) * 0.3;   // 0.42 會被頂部 HUD／橫幅蓋住
  const a = 0.55 + 0.35 * Math.sin(t * 5);
  ctx.save();
  ctx.translate(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  ctx.rotate(inward ? angle + Math.PI : angle);   // 怪潮朝內（湧向玩家）、風向朝外（吹往那邊）
  ctx.strokeStyle = `${rgbaPrefix}${a.toFixed(2)})`;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  for (let i = 0; i < 3; i++) {
    const o = i * 20;
    ctx.beginPath();
    ctx.moveTo(o - 12, -18);
    ctx.lineTo(o + 6, 0);
    ctx.lineTo(o - 12, 18);
    ctx.stroke();
  }
  ctx.restore();
}
