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


// ── 極寒基地／霜封虛空 ──
function drawSnowPine(x) {
  shadow(x, 16, 26);
  x.fillStyle = '#4a3324';
  x.fillRect(-2.5, 14, 5, 12);
  for (const [y, w, c] of [[8, 20, '#274a44'], [-4, 16, '#2f5a52'], [-16, 11, '#3a6b60']]) {
    x.fillStyle = c;
    x.strokeStyle = '#0d1f1c';
    x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(-w, y + 8); x.lineTo(0, y - 12); x.lineTo(w, y + 8); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#e8f4ff';
    x.beginPath(); x.moveTo(-w * 0.7, y - 1); x.lineTo(0, y - 12); x.lineTo(w * 0.7, y - 1); x.quadraticCurveTo(0, y + 3, -w * 0.7, y - 1); x.fill();
  }
}

function drawIceRock(x) {
  shadow(x, 22, 12);
  x.fillStyle = '#7fb6d6';
  x.strokeStyle = '#1b3b52';
  x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(-22, 12); x.lineTo(-16, -6); x.lineTo(-4, -14); x.lineTo(12, -8); x.lineTo(22, 12); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath(); x.moveTo(-16, -6); x.lineTo(-4, -14); x.lineTo(0, -4); x.lineTo(-10, 2); x.closePath(); x.fill();
  x.fillStyle = '#eaf6ff';
  x.beginPath(); x.ellipse(-2, -12, 10, 3, 0, 0, Math.PI * 2); x.fill();
}

function drawSnowCrate(x) {
  shadow(x, 16, 13);
  x.fillStyle = '#5b6a4a';
  x.strokeStyle = '#1a2014';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-15, -10, 30, 22, 2); x.fill(); x.stroke();
  x.fillStyle = '#3f4a33';
  x.fillRect(-15, -1, 30, 3);
  x.fillStyle = '#f2f8ff';
  x.beginPath(); x.moveTo(-17, -10); x.quadraticCurveTo(-4, -18, 17, -10); x.lineTo(17, -7); x.quadraticCurveTo(0, -12, -17, -7); x.closePath(); x.fill();
}

function drawRuneStone(x) {
  shadow(x, 14, 22);
  glow(x, 0, 0, 30, '160,110,255', 0.28);
  x.fillStyle = '#5d6f92';
  x.strokeStyle = '#141a2a';
  x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(-12, 22); x.lineTo(-14, -8); x.lineTo(-4, -24); x.lineTo(10, -20); x.lineTo(14, 22); x.closePath(); x.fill(); x.stroke();
  x.strokeStyle = '#c9a4ff';
  x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(-4, -12); x.lineTo(4, -12); x.moveTo(0, -12); x.lineTo(0, 6); x.moveTo(-5, 0); x.lineTo(5, -4); x.stroke();
}

// ── 熔岩核心／鑄造廠 ──
function drawLavaRock(x) {
  shadow(x, 20, 12);
  glow(x, 0, 2, 26, '255,90,20', 0.25);
  x.fillStyle = '#2a2320';
  x.strokeStyle = '#0d0a09';
  x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(-20, 12); x.lineTo(-14, -8); x.lineTo(2, -14); x.lineTo(16, -4); x.lineTo(20, 12); x.closePath(); x.fill(); x.stroke();
  x.strokeStyle = '#ff7a1a';
  x.lineWidth = 1.8;
  x.beginPath(); x.moveTo(-8, 10); x.lineTo(-4, -2); x.lineTo(4, -6); x.moveTo(6, 10); x.lineTo(8, 2); x.stroke();
}

function drawVent(x) {
  shadow(x, 20, 8);
  glow(x, 0, -2, 28, '255,110,40', 0.3);
  x.fillStyle = '#2f343d';
  x.strokeStyle = '#0c0e12';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-20, -8, 40, 18, 3); x.fill(); x.stroke();
  x.fillStyle = '#ff8a2a';
  for (let i = -14; i <= 10; i += 8) x.fillRect(i, -4, 5, 10);
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(-6, -10); x.quadraticCurveTo(-12, -20, -4, -28); x.moveTo(8, -10); x.quadraticCurveTo(14, -18, 8, -26); x.stroke();
}

function drawIngots(x) {
  shadow(x, 22, 10);
  const rows = [[-14, 4, 3], [2, 4, 3], [-6, -6, 2]];
  for (const [px, py] of rows) {
    x.fillStyle = '#a0a6b0';
    x.strokeStyle = '#20242c';
    x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(px - 12, py + 6); x.lineTo(px - 9, py - 4); x.lineTo(px + 9, py - 4); x.lineTo(px + 12, py + 6); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(px - 8, py - 3, 14, 2);
  }
}

function drawLadle(x) {
  shadow(x, 16, 20);
  glow(x, 0, -4, 26, '255,140,30', 0.35);
  x.strokeStyle = '#3a3f49';
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(-14, 20); x.lineTo(-12, -14); x.moveTo(14, 20); x.lineTo(12, -14); x.stroke();
  x.fillStyle = '#4a505c';
  x.strokeStyle = '#111318';
  x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(-16, -10); x.lineTo(-10, 8); x.lineTo(10, 8); x.lineTo(16, -10); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#ffb040';
  x.beginPath(); x.ellipse(0, -10, 16, 4, 0, 0, Math.PI * 2); x.fill();
}

function drawAnvil(x) {
  shadow(x, 18, 14);
  x.fillStyle = '#3a3f49';
  x.strokeStyle = '#0d0f13';
  x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(-18, -8); x.lineTo(14, -8); x.lineTo(20, -2); x.lineTo(8, -2); x.lineTo(6, 4); x.lineTo(12, 12); x.lineTo(-12, 12); x.lineTo(-6, 4); x.lineTo(-8, -2); x.lineTo(-18, -2); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  x.fillRect(-15, -7, 26, 2);
}

// ── 地下鐵 ──
function drawRail(x) {
  shadow(x, 28, 8);
  x.fillStyle = '#4a3a2c';
  for (let i = -24; i <= 20; i += 12) x.fillRect(i, -6, 6, 14);
  x.fillStyle = '#7c828c';
  x.fillRect(-30, -4, 60, 3);
  x.fillRect(-30, 3, 60, 3);
  x.fillStyle = '#a9afb9';
  x.fillRect(-30, -4, 60, 1);
  x.fillRect(-30, 3, 60, 1);
}

function drawPillar(x) {
  shadow(x, 14, 26);
  x.fillStyle = '#5a5f68';
  x.strokeStyle = '#15181d';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-11, -26, 22, 52, 2); x.fill(); x.stroke();
  x.fillStyle = '#ffcc00';
  for (let i = -20; i < 20; i += 10) { x.beginPath(); x.moveTo(-11, i); x.lineTo(-11, i + 5); x.lineTo(11, i + 10); x.lineTo(11, i + 5); x.closePath(); x.fill(); }
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(4, -26, 7, 52);
}

function drawBench(x) {
  shadow(x, 24, 10);
  x.fillStyle = '#6a4a2c';
  x.strokeStyle = '#1c1208';
  x.lineWidth = 1.4;
  x.beginPath(); x.roundRect(-22, -6, 44, 6, 1.5); x.fill(); x.stroke();
  x.beginPath(); x.roundRect(-22, -14, 44, 6, 1.5); x.fill(); x.stroke();
  x.fillStyle = '#2a2f38';
  x.fillRect(-18, 0, 4, 10);
  x.fillRect(14, 0, 4, 10);
}

function drawPuddle(x) {
  x.fillStyle = 'rgba(30,50,70,0.55)';
  x.beginPath(); x.ellipse(0, 2, 24, 9, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(140,190,230,0.5)';
  x.lineWidth = 1.2;
  x.beginPath(); x.ellipse(-4, 1, 14, 4, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.ellipse(6, 3, 6, 2, 0, 0, Math.PI * 2); x.stroke();
}

// ── 沙暴要塞 ──
function drawDune(x) {
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.beginPath(); x.ellipse(2, 8, 28, 7, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c9a56a';
  x.strokeStyle = '#7a5f36';
  x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(-28, 8); x.quadraticCurveTo(-8, -18, 8, -6); x.quadraticCurveTo(20, -12, 28, 8); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,240,200,0.45)';
  x.beginPath(); x.moveTo(-20, 4); x.quadraticCurveTo(-8, -12, 4, -4); x.quadraticCurveTo(-6, -2, -20, 4); x.fill();
}

function drawCactus(x) {
  shadow(x, 12, 22);
  x.fillStyle = '#4c8a4a';
  x.strokeStyle = '#173818';
  x.lineWidth = 1.5;
  x.beginPath(); x.roundRect(-5, -22, 10, 44, 5); x.fill(); x.stroke();
  x.beginPath(); x.roundRect(-16, -8, 8, 5, 2); x.roundRect(-16, -14, 5, 10, 2); x.fill(); x.stroke();
  x.beginPath(); x.roundRect(8, -2, 8, 5, 2); x.roundRect(11, -10, 5, 12, 2); x.fill(); x.stroke();
}

function drawSandbags(x) {
  shadow(x, 24, 10);
  for (const [px, py] of [[-14, 3], [0, 3], [14, 3], [-7, -6], [7, -6]]) {
    x.fillStyle = '#b39762';
    x.strokeStyle = '#4a3c20';
    x.lineWidth = 1.2;
    x.beginPath(); x.ellipse(px, py, 8.5, 5.5, 0, 0, Math.PI * 2); x.fill(); x.stroke();
  }
}

function drawWreck(x) {
  shadow(x, 26, 14);
  x.fillStyle = '#6b5a45';
  x.strokeStyle = '#1e1810';
  x.lineWidth = 1.6;
  x.beginPath(); x.roundRect(-26, -6, 52, 18, 3); x.fill(); x.stroke();
  x.fillStyle = '#4a3f30';
  x.beginPath(); x.roundRect(-14, -16, 26, 12, 2); x.fill(); x.stroke();
  x.fillStyle = '#c9a56a';
  x.beginPath(); x.ellipse(-4, 12, 26, 4, 0, 0, Math.PI, true); x.fill();
  x.fillStyle = '#20180f';
  x.beginPath(); x.arc(-16, 12, 5, 0, Math.PI * 2); x.arc(16, 12, 5, 0, Math.PI * 2); x.fill();
}

// ── 虛空裂道／無盡 ──
function drawRift(x) {
  glow(x, 0, 0, 30, '170,90,255', 0.35);
  x.strokeStyle = '#e6c9ff';
  x.lineWidth = 2.4;
  x.lineJoin = 'round';
  x.beginPath(); x.moveTo(-26, 4); x.lineTo(-12, -4); x.lineTo(-4, 4); x.lineTo(8, -6); x.lineTo(26, 2); x.stroke();
  x.strokeStyle = '#7a2fd4';
  x.lineWidth = 5;
  x.globalAlpha = 0.5;
  x.stroke();
  x.globalAlpha = 1;
}

function drawRuneCircle(x) {
  x.strokeStyle = 'rgba(190,140,255,0.75)';
  x.lineWidth = 1.6;
  x.beginPath(); x.ellipse(0, 0, 30, 14, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(190,140,255,0.8)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.fillRect(Math.cos(a) * 25 - 1.5, Math.sin(a) * 11.5 - 1.5, 3, 3);
  }
  glow(x, 0, 0, 24, '150,90,255', 0.2);
}

function drawVoidShard(x) {
  shadow(x, 10, 24);
  glow(x, 0, -4, 24, '140,80,255', 0.3);
  for (const [px, h, w, c] of [[-8, 26, 6, '#5b2fa0'], [2, 36, 8, '#7a45d0'], [11, 20, 5, '#5b2fa0']]) {
    x.fillStyle = c;
    x.strokeStyle = '#1a0a33';
    x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(px - w, 22); x.lineTo(px, 22 - h); x.lineTo(px + w, 22); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.3)';
    x.beginPath(); x.moveTo(px - w, 22); x.lineTo(px, 22 - h); x.lineTo(px - 1, 22); x.closePath(); x.fill();
  }
}

function drawTendril(x) {
  shadow(x, 14, 8);
  x.strokeStyle = '#3a1a66';
  x.lineCap = 'round';
  for (const [dx, lean, h] of [[-8, -6, 26], [0, 4, 34], [8, 8, 24]]) {
    x.lineWidth = 4;
    x.beginPath(); x.moveTo(dx, 8); x.quadraticCurveTo(dx + lean * 1.5, 8 - h * 0.5, dx + lean, 8 - h); x.stroke();
    x.fillStyle = '#b48cff';
    x.beginPath(); x.arc(dx + lean, 8 - h, 2.6, 0, Math.PI * 2); x.fill();
  }
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
  snow_pine: { w: 44, h: 60, static: true, fn: drawSnowPine },
  ice_rock:  { w: 52, h: 34, static: true, fn: drawIceRock },
  snow_crate: { w: 40, h: 32, static: true, fn: drawSnowCrate },
  rune_stone: { w: 40, h: 60, static: true, fn: drawRuneStone },
  lava_rock: { w: 52, h: 34, static: true, fn: drawLavaRock },
  vent:      { w: 52, h: 50, static: true, fn: drawVent },
  ingots:    { w: 52, h: 26, static: true, fn: drawIngots },
  ladle:     { w: 40, h: 50, static: true, fn: drawLadle },
  anvil:     { w: 48, h: 32, static: true, fn: drawAnvil },
  rail:      { w: 68, h: 24, static: true, fn: drawRail },
  pillar:    { w: 34, h: 60, static: true, fn: drawPillar },
  bench:     { w: 54, h: 30, static: true, fn: drawBench },
  puddle:    { w: 56, h: 22, static: true, fn: drawPuddle },
  dune:      { w: 64, h: 32, static: true, fn: drawDune },
  cactus:    { w: 40, h: 56, static: true, fn: drawCactus },
  sandbags:  { w: 58, h: 28, static: true, fn: drawSandbags },
  wreck:     { w: 64, h: 40, static: true, fn: drawWreck },
  rift:      { w: 68, h: 30, static: true, fn: drawRift },
  rune_circle: { w: 72, h: 34, static: true, fn: drawRuneCircle },
  void_shard: { w: 40, h: 56, static: true, fn: drawVoidShard },
  tendril:   { w: 36, h: 48, static: true, fn: drawTendril },
};
