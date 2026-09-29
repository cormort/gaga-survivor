// 新增的場景裝飾 sprite（商業街／沼澤／實驗室），程序化繪製，原點在中心。
// 只給 sprites.js 的 BUILDERS 用；尺寸與 static 標記跟其他裝飾物一致。

function shadow(x, rx, y) {
  x.fillStyle = 'rgba(0,0,0,0.4)';
  x.beginPath();
  x.ellipse(0, y, rx, rx * 0.36, 0, 0, Math.PI * 2);
  x.fill();
}

function glow(x, cx, cy, r, rgb, a) {
  const g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
}

// ── 商業街 ──
function drawCone(x) {
  shadow(x, 9, 12);
  x.fillStyle = '#1b1f2a';
  x.fillRect(-9, 8, 18, 4);
  x.fillStyle = '#ff6b1a';
  x.strokeStyle = '#3a1500';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(-7, 8); x.lineTo(-2, -12); x.lineTo(2, -12); x.lineTo(7, 8);
  x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#f4f4f4';
  x.fillRect(-4.6, -3, 9.2, 3.4);
}

function drawLamp(x) {
  shadow(x, 8, 24);
  glow(x, 0, -24, 26, '255,210,120', 0.35);
  x.strokeStyle = '#2a3240';
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 24); x.lineTo(0, -22); x.lineTo(9, -26); x.stroke();
  x.fillStyle = '#ffe9a8';
  x.beginPath(); x.ellipse(11, -25, 5, 3, 0.2, 0, Math.PI * 2); x.fill();
}

function drawRubble(x) {
  shadow(x, 22, 9);
  const bits = [[-14, 2, 10, 7, '#4a5060'], [-2, 4, 13, 8, '#3a4050'], [12, 1, 9, 6, '#565c6c'],
                [-6, -5, 8, 6, '#454b5b'], [5, -4, 7, 5, '#5b6172']];
  x.strokeStyle = '#161a24';
  x.lineWidth = 1.2;
  for (const [px, py, w, h, c] of bits) {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(px - w / 2, py + h / 2); x.lineTo(px - w / 3, py - h / 2);
    x.lineTo(px + w / 2, py - h / 3); x.lineTo(px + w / 2, py + h / 2);
    x.closePath(); x.fill(); x.stroke();
  }
}

function drawBarrier(x) {
  shadow(x, 26, 12);
  x.fillStyle = '#8a8f9a';
  x.strokeStyle = '#1c2029';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(-26, 10); x.lineTo(-22, -8); x.lineTo(22, -8); x.lineTo(26, 10);
  x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#ffcc00';
  for (let i = -18; i < 18; i += 12) {
    x.beginPath();
    x.moveTo(i, -8); x.lineTo(i + 6, -8); x.lineTo(i + 9, 2); x.lineTo(i + 3, 2);
    x.closePath(); x.fill();
  }
}

// ── 沼澤 ──
function drawReed(x) {
  shadow(x, 12, 18);
  for (const [dx, h, lean] of [[-8, 34, -3], [-2, 42, 1], [5, 38, 3], [10, 30, 5]]) {
    x.strokeStyle = '#3d5a2b';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(dx, 18); x.quadraticCurveTo(dx + lean * 0.4, 18 - h / 2, dx + lean, 18 - h); x.stroke();
    x.fillStyle = '#6b3f1d';
    x.beginPath(); x.roundRect(dx + lean - 2, 18 - h - 2, 4, 11, 2); x.fill();
  }
}

function drawLily(x) {
  x.fillStyle = 'rgba(20,50,40,0.5)';
  x.beginPath(); x.ellipse(0, 2, 26, 10, 0, 0, Math.PI * 2); x.fill();
  for (const [px, py, r] of [[-12, 0, 9], [4, 3, 11], [15, -1, 7]]) {
    x.fillStyle = '#2f7a45';
    x.strokeStyle = '#10301c';
    x.lineWidth = 1.2;
    x.beginPath(); x.ellipse(px, py, r, r * 0.55, 0, 0.3, Math.PI * 2 - 0.3); x.lineTo(px, py); x.closePath();
    x.fill(); x.stroke();
  }
  x.fillStyle = '#ff8fc0';
  x.beginPath(); x.arc(4, 1, 3, 0, Math.PI * 2); x.fill();
}

function drawLog(x) {
  shadow(x, 26, 10);
  x.fillStyle = '#4a3220';
  x.strokeStyle = '#1a0f08';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-26, -7, 52, 15, 6); x.fill(); x.stroke();
  x.strokeStyle = '#2b1b10';
  x.beginPath(); x.moveTo(-16, -2); x.lineTo(8, -2); x.moveTo(-8, 3); x.lineTo(18, 3); x.stroke();
  x.fillStyle = '#3f8a4a';
  x.beginPath(); x.ellipse(-8, -7, 10, 3, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#c9a26a';
  x.beginPath(); x.ellipse(26, 0, 3.5, 7.5, 0, 0, Math.PI * 2); x.fill();
}

function drawMushroom(x) {
  shadow(x, 13, 12);
  glow(x, 0, 0, 22, '120,255,170', 0.25);
  for (const [px, py, r, c] of [[-8, 4, 7, '#5fe3a1'], [5, 0, 9, '#8af7c0'], [12, 7, 5, '#5fe3a1']]) {
    x.fillStyle = '#d8f5e4';
    x.fillRect(px - 1.6, py, 3.2, 9);
    x.fillStyle = c;
    x.strokeStyle = '#0d3a26';
    x.lineWidth = 1.2;
    x.beginPath(); x.ellipse(px, py, r, r * 0.65, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke();
  }
}

function drawBones(x) {
  shadow(x, 18, 8);
  x.strokeStyle = '#d9d2bf';
  x.lineCap = 'round';
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(-14, 4); x.lineTo(10, -4); x.moveTo(-10, -5); x.lineTo(14, 5); x.stroke();
  x.fillStyle = '#e6dfcb';
  x.strokeStyle = '#3a3428';
  x.lineWidth = 1.2;
  x.beginPath(); x.arc(0, -2, 8, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#20241a';
  x.beginPath(); x.arc(-3, -3, 2, 0, Math.PI * 2); x.arc(3, -3, 2, 0, Math.PI * 2); x.fill();
}

// ── 實驗室 ──
function drawConsole(x) {
  shadow(x, 20, 16);
  x.fillStyle = '#2c3442';
  x.strokeStyle = '#0d1118';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-18, -8, 36, 22, 3); x.fill(); x.stroke();
  glow(x, 0, -16, 26, '80,220,255', 0.22);
  x.fillStyle = '#0a2a36';
  x.beginPath(); x.roundRect(-14, -24, 28, 18, 2); x.fill(); x.stroke();
  x.strokeStyle = '#5be7ff';
  x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(-10, -12); x.lineTo(-4, -18); x.lineTo(0, -12); x.lineTo(6, -20); x.lineTo(11, -14); x.stroke();
  x.fillStyle = '#ff5d73';
  x.fillRect(-12, 5, 4, 3);
  x.fillStyle = '#5dff9b';
  x.fillRect(-5, 5, 4, 3);
}

function drawRack(x) {
  shadow(x, 15, 25);
  x.fillStyle = '#232a36';
  x.strokeStyle = '#0a0d13';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-14, -26, 28, 50, 3); x.fill(); x.stroke();
  for (let i = 0; i < 5; i++) {
    const y = -22 + i * 9;
    x.fillStyle = '#39445a';
    x.fillRect(-11, y, 22, 6);
    x.fillStyle = i % 2 ? '#5dff9b' : '#ffb84d';
    x.fillRect(6, y + 2, 3, 2);
  }
}

function drawLabCrate(x) {
  shadow(x, 16, 13);
  x.fillStyle = '#5a6b78';
  x.strokeStyle = '#161d24';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-15, -12, 30, 24, 2); x.fill(); x.stroke();
  x.strokeStyle = '#3a4854';
  x.beginPath(); x.moveTo(-15, -12); x.lineTo(15, 12); x.moveTo(15, -12); x.lineTo(-15, 12); x.stroke();
  x.fillStyle = '#ffcc00';
  x.fillRect(-15, -3, 30, 5);
  x.fillStyle = '#161d24';
  for (let i = -12; i < 12; i += 6) x.fillRect(i, -3, 3, 5);
}

function drawCables(x) {
  shadow(x, 22, 6);
  for (const [c, off] of [['#1b2130', 0], ['#7c2a3a', 4], ['#2a5a7c', -4]]) {
    x.strokeStyle = c;
    x.lineWidth = 3;
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(-24, off); x.bezierCurveTo(-10, off - 12, 6, off + 12, 24, off - 2); x.stroke();
  }
  glow(x, 20, -2, 9, '110,220,255', 0.7);
}

export const DECOR_BUILDERS = {
  cone:      { w: 24, h: 30, static: true, fn: drawCone },
  lamp:      { w: 36, h: 60, static: true, fn: drawLamp },
  rubble:    { w: 48, h: 26, static: true, fn: drawRubble },
  barrier:   { w: 56, h: 30, static: true, fn: drawBarrier },
  reed:      { w: 34, h: 50, static: true, fn: drawReed },
  lily:      { w: 60, h: 28, static: true, fn: drawLily },
  swamp_log: { w: 58, h: 28, static: true, fn: drawLog },
  mushroom:  { w: 36, h: 34, static: true, fn: drawMushroom },
  bones:     { w: 42, h: 24, static: true, fn: drawBones },
  console:   { w: 52, h: 56, static: true, fn: drawConsole },
  rack:      { w: 34, h: 56, static: true, fn: drawRack },
  lab_crate: { w: 36, h: 32, static: true, fn: drawLabCrate },
  cables:    { w: 56, h: 26, static: true, fn: drawCables },
};
