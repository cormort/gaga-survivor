// tools/render_td_paths.js
// Procedural high-fidelity seamless path texture generator for Gaga Survivor Tower Defense
// Generates 7 thematic seamless road textures matching each TD map environment

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const task = await taskSpace("render-td-paths-" + Date.now());
const page = task.page("p1");

console.log("Navigating to local dev server to initialize rendering context...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");

console.log("Rendering 7 thematic TD path textures...");

const renderedTextures = await page.evaluate(async () => {
  const results = {};
  const SIZE = 512;

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    return [c, c.getContext('2d')];
  }

  // Helper: seamless pseudo-random noise generator
  function pseudoNoise(x, y, seed = 1337) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  }

  // 1. Canyon (峽谷岩土徑): Sandstone pavers, gravel, sun-baked desert cracked earth
  function renderCanyon() {
    const [c, ctx] = makeCanvas();
    // Warm ochre dirt base
    ctx.fillStyle = '#6e4521';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Varied dirt patches
    for (let y = 0; y < SIZE; y += 4) {
      for (let x = 0; x < SIZE; x += 4) {
        const n = pseudoNoise(x / 30, y / 30, 42);
        if (n > 0.5) {
          ctx.fillStyle = `rgba(180, 115, 55, ${(n - 0.5) * 0.4})`;
          ctx.fillRect(x, y, 4, 4);
        } else {
          ctx.fillStyle = `rgba(60, 32, 12, ${(0.5 - n) * 0.35})`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Seamless flagstone pavers
    const step = 64;
    for (let gy = 0; gy < SIZE; gy += step) {
      for (let gx = 0; gx < SIZE; gx += step) {
        const shift = ((gy / step) % 2) * (step / 2);
        const x = (gx + shift) % SIZE;
        const y = gy;
        const pw = step - 8;
        const ph = step - 8;

        const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
        grad.addColorStop(0, '#d97706');
        grad.addColorStop(0.4, '#b45309');
        grad.addColorStop(0.8, '#92400e');
        grad.addColorStop(1, '#78350f');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, pw, ph, 4);
        ctx.fill();
        ctx.stroke();

        // Stone bevel highlight
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 4, y + 4, pw - 4, ph - 4);

        // Cracks & weathered stone texture
        if ((gx + gy) % 3 === 0) {
          ctx.strokeStyle = 'rgba(40, 20, 5, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + pw * 0.2, y + ph * 0.3);
          ctx.lineTo(x + pw * 0.5, y + ph * 0.6);
          ctx.lineTo(x + pw * 0.8, y + ph * 0.4);
          ctx.stroke();
        }
      }
    }

    // Fine desert gravel pebbles
    for (let i = 0; i < 280; i++) {
      const px = (pseudoNoise(i, 1) * SIZE) % SIZE;
      const py = (pseudoNoise(i, 2) * SIZE) % SIZE;
      const r = 2 + pseudoNoise(i, 3) * 3;
      ctx.fillStyle = pseudoNoise(i, 4) > 0.5 ? '#fde68a' : '#78350f';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return c.toDataURL('image/png');
  }

  // 2. Swamp (沼澤木排道): Damp timber logs, moss, dark muddy water puddles
  function renderSwamp() {
    const [c, ctx] = makeCanvas();
    // Deep dark bog mud
    ctx.fillStyle = '#141d13';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Muddy water reflections
    for (let y = 0; y < SIZE; y += 8) {
      for (let x = 0; x < SIZE; x += 8) {
        const n = pseudoNoise(x / 40, y / 40, 88);
        if (n > 0.6) {
          ctx.fillStyle = 'rgba(20, 83, 45, 0.4)';
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }

    // Wooden corduroy logs (horizontal logs laid side by side)
    const logH = 32;
    for (let y = 0; y < SIZE; y += logH) {
      const logGrad = ctx.createLinearGradient(0, y, 0, y + logH);
      logGrad.addColorStop(0, '#1c1917');
      logGrad.addColorStop(0.2, '#44403c');
      logGrad.addColorStop(0.5, '#292524');
      logGrad.addColorStop(0.8, '#365314'); // mossy green tint
      logGrad.addColorStop(1, '#0c0a09');

      ctx.fillStyle = logGrad;
      ctx.strokeStyle = '#0c0a09';
      ctx.lineWidth = 3;
      ctx.fillRect(0, y + 2, SIZE, logH - 4);
      ctx.strokeRect(0, y + 2, SIZE, logH - 4);

      // Wood grain lines
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.35)';
      ctx.lineWidth = 1.2;
      for (let l = 6; l < logH - 4; l += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y + l);
        ctx.lineTo(SIZE, y + l);
        ctx.stroke();
      }

      // Iron spikes / rivets holding logs
      for (let rx = 32; rx < SIZE; rx += 96) {
        ctx.fillStyle = '#78716c';
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, y + logH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Bioluminescent moss clusters
      if ((y / logH) % 3 === 0) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.45)';
        ctx.beginPath();
        ctx.arc((y * 7) % SIZE, y + logH * 0.5, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return c.toDataURL('image/png');
  }

  // 3. Fortress (寒冰要塞石板大道): Chiselled granite, ice crystals, cyan frost mortar
  function renderFortress() {
    const [c, ctx] = makeCanvas();
    // Deep slate blue base
    ctx.fillStyle = '#090e17';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const step = 64;
    for (let gy = 0; gy < SIZE; gy += step) {
      for (let gx = 0; gx < SIZE; gx += step) {
        const shift = ((gy / step) % 2) * (step / 2);
        const x = (gx + shift) % SIZE;
        const y = gy;
        const pw = step - 6;
        const ph = step - 6;

        const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.2, '#1e293b');
        grad.addColorStop(0.6, '#0f172a');
        grad.addColorStop(1, '#0284c7');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, pw, ph, 4);
        ctx.fill();
        ctx.stroke();

        // Glowing frost mortar line
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 3, y + 3, pw - 2, ph - 2);

        // Ancient frost rune / snowflake motif on certain stones
        if ((gx + gy * 2) % 4 === 0) {
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.6)';
          ctx.lineWidth = 1.5;
          const cx = x + pw / 2;
          const cy = y + ph / 2;
          ctx.beginPath();
          ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
          ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
          ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
          ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx + 5, cy - 5);
          ctx.stroke();
        }
      }
    }

    // Ice crystal sparkles
    for (let i = 0; i < 150; i++) {
      const px = (pseudoNoise(i, 11) * SIZE) % SIZE;
      const py = (pseudoNoise(i, 22) * SIZE) % SIZE;
      ctx.fillStyle = 'rgba(224, 242, 254, 0.8)';
      ctx.fillRect(px, py, 2, 2);
    }

    return c.toDataURL('image/png');
  }

  // 4. Forgeworld (機械教鋼鐵格柵道): Industrial diamond steel plate, hazard trim, glowing plasma vents
  function renderForgeworld() {
    const [c, ctx] = makeCanvas();
    // Dark scorched iron base
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const step = 64;
    for (let gy = 0; gy < SIZE; gy += step) {
      for (let gx = 0; gx < SIZE; gx += step) {
        const x = gx;
        const y = gy;
        const pw = step - 4;
        const ph = step - 4;

        // Dark gunmetal plate
        const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
        grad.addColorStop(0, '#44403c');
        grad.addColorStop(0.3, '#292524');
        grad.addColorStop(0.7, '#1c1917');
        grad.addColorStop(1, '#0c0a09');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.fillRect(x + 2, y + 2, pw, ph);
        ctx.strokeRect(x + 2, y + 2, pw, ph);

        // Diamond tread texture
        ctx.strokeStyle = 'rgba(168, 162, 158, 0.4)';
        ctx.lineWidth = 1.5;
        for (let dy = 8; dy < ph - 6; dy += 12) {
          for (let dx = 8; dx < pw - 6; dx += 12) {
            ctx.beginPath();
            ctx.moveTo(x + dx - 3, y + dy);
            ctx.lineTo(x + dx + 3, y + dy);
            ctx.stroke();
          }
        }

        // Heavy industrial rivets at four corners
        ctx.fillStyle = '#78716c';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        const corners = [
          [x + 6, y + 6], [x + pw - 2, y + 6],
          [x + 6, y + ph - 2], [x + pw - 2, y + ph - 2]
        ];
        corners.forEach(([rx, ry]) => {
          ctx.beginPath();
          ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        // Glowing reactor ventilation grate (every 4th plate)
        if ((gx + gy) % 128 === 0) {
          // Vent cutout
          ctx.fillStyle = '#7f1d1d';
          ctx.fillRect(x + 12, y + 12, pw - 20, ph - 20);

          // Orange plasma underglow
          const pGrad = ctx.createRadialGradient(x + pw / 2, y + ph / 2, 2, x + pw / 2, y + ph / 2, 24);
          pGrad.addColorStop(0, '#f97316');
          pGrad.addColorStop(0.5, '#dc2626');
          pGrad.addColorStop(1, 'rgba(0,0,0,0.8)');
          ctx.fillStyle = pGrad;
          ctx.fillRect(x + 12, y + 12, pw - 20, ph - 20);

          // Metal grill bars over vent
          ctx.fillStyle = '#1c1917';
          for (let bx = 16; bx < pw - 16; bx += 8) {
            ctx.fillRect(x + bx, y + 12, 3, ph - 20);
          }
        }
      }
    }

    return c.toDataURL('image/png');
  }

  // 5. Red Alert (寒冬雪地坦克戰道): Packed snow, dark frozen mud, deep dual tank tread grooves
  function renderRedAlert() {
    const [c, ctx] = makeCanvas();
    // Cold gray-blue slush base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Churned dark earth & frozen mud
    for (let y = 0; y < SIZE; y += 6) {
      for (let x = 0; x < SIZE; x += 6) {
        const n = pseudoNoise(x / 35, y / 35, 1917);
        if (n > 0.45) {
          ctx.fillStyle = `rgba(15, 23, 42, ${(n - 0.45) * 0.7})`;
          ctx.fillRect(x, y, 6, 6);
        }
      }
    }

    // Heavy compacted snow patches
    for (let y = 0; y < SIZE; y += 4) {
      for (let x = 0; x < SIZE; x += 4) {
        const sn = pseudoNoise(x / 25, y / 25, 999);
        if (sn > 0.55) {
          ctx.fillStyle = `rgba(241, 245, 249, ${(sn - 0.55) * 0.8})`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Dual heavy tank tread ruts running vertically (seamless repeat)
    const treadTracks = [SIZE * 0.28, SIZE * 0.72];
    const trackWidth = 48;
    const treadStep = 18;

    treadTracks.forEach(center => {
      const left = center - trackWidth / 2;
      // Depressed dark furrow
      const fGrad = ctx.createLinearGradient(left, 0, left + trackWidth, 0);
      fGrad.addColorStop(0, 'rgba(15, 23, 42, 0.8)');
      fGrad.addColorStop(0.5, 'rgba(2, 6, 23, 0.95)');
      fGrad.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
      ctx.fillStyle = fGrad;
      ctx.fillRect(left, 0, trackWidth, SIZE);

      // Deep tread chevron bars
      for (let ty = 0; ty < SIZE; ty += treadStep) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(left + 4, ty + 2);
        ctx.lineTo(center, ty + 8);
        ctx.lineTo(left + trackWidth - 4, ty + 2);
        ctx.lineTo(left + trackWidth - 4, ty + 7);
        ctx.lineTo(center, ty + 13);
        ctx.lineTo(left + 4, ty + 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cold steel highlight on tread edges
        ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.fillRect(left + 6, ty + 3, 4, 3);
        ctx.fillRect(left + trackWidth - 10, ty + 3, 4, 3);
      }
    });

    return c.toDataURL('image/png');
  }

  // 6. Starcraft (查爾熔岩灰燼與菌毯道): Volcanic basalt rock, glowing magma fissures, purple Zerg creep
  function renderStarcraft() {
    const [c, ctx] = makeCanvas();
    // Scorched charcoal obsidian base
    ctx.fillStyle = '#0a030f';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Glowing magma fissure veins in the bedrock
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const startX = (i * 64) % SIZE;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.quadraticCurveTo((startX + 80) % SIZE, SIZE / 2, (startX + 20) % SIZE, SIZE);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const startX = (i * 64) % SIZE;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.quadraticCurveTo((startX + 80) % SIZE, SIZE / 2, (startX + 20) % SIZE, SIZE);
      ctx.stroke();
    }

    // Organic Zerg Creep Membrane layering
    for (let y = 0; y < SIZE; y += 4) {
      for (let x = 0; x < SIZE; x += 4) {
        const cn = pseudoNoise(x / 30, y / 30, 777);
        if (cn > 0.4) {
          const alpha = (cn - 0.4) * 0.85;
          ctx.fillStyle = `rgba(88, 28, 135, ${alpha})`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Glossy chitinous bio-veins & pustules
    for (let i = 0; i < 60; i++) {
      const cx = (pseudoNoise(i, 101) * SIZE) % SIZE;
      const cy = (pseudoNoise(i, 202) * SIZE) % SIZE;
      const rad = 6 + pseudoNoise(i, 303) * 14;

      const pGrad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad);
      pGrad.addColorStop(0, '#e879f9');
      pGrad.addColorStop(0.4, '#a855f7');
      pGrad.addColorStop(0.8, '#581c87');
      pGrad.addColorStop(1, 'rgba(24, 4, 43, 0.9)');

      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();

      // Specular slime sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(cx - rad * 0.35, cy - rad * 0.35, rad * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    return c.toDataURL('image/png');
  }

  // 7. Warcraft (洛丹倫天譴哥德石道): Dark weathered flagstones, ancient tombstone slabs, necrotic soul moss
  function renderWarcraft() {
    const [c, ctx] = makeCanvas();
    // Dark blighted earth base
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Weathered gothic cobblestones
    const step = 64;
    for (let gy = 0; gy < SIZE; gy += step) {
      for (let gx = 0; gx < SIZE; gx += step) {
        const shift = ((gy / step) % 2) * (step / 2);
        const x = (gx + shift) % SIZE;
        const y = gy;
        const pw = step - 7;
        const ph = step - 7;

        const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
        grad.addColorStop(0, '#334155');
        grad.addColorStop(0.3, '#1e293b');
        grad.addColorStop(0.7, '#0f172a');
        grad.addColorStop(1, '#020617');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, pw, ph, 5);
        ctx.fill();
        ctx.stroke();

        // Chipped edges & bevel
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 4, y + 4, pw - 4, ph - 4);

        // Unholy necrotic green moss in the crevices
        if ((gx + gy) % 3 === 0) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
          ctx.beginPath();
          ctx.ellipse(x + pw * 0.3, y + ph * 0.7, 14, 6, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Crushed bone dust / skull motif
        if ((gx * 3 + gy * 7) % 5 === 0) {
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.arc(x + pw * 0.5, y + ph * 0.5, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Ghostly cyan/emerald soul mist wisps
    for (let i = 0; i < 40; i++) {
      const mx = (pseudoNoise(i, 51) * SIZE) % SIZE;
      const my = (pseudoNoise(i, 73) * SIZE) % SIZE;
      const mGrad = ctx.createRadialGradient(mx, my, 2, mx, my, 28);
      mGrad.addColorStop(0, 'rgba(52, 211, 153, 0.25)');
      mGrad.addColorStop(0.6, 'rgba(16, 185, 129, 0.08)');
      mGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mGrad;
      ctx.fillRect(mx - 30, my - 30, 60, 60);
    }

    return c.toDataURL('image/png');
  }

  results['path_canyon'] = renderCanyon();
  results['path_swamp'] = renderSwamp();
  results['path_fortress'] = renderFortress();
  results['path_forgeworld'] = renderForgeworld();
  results['path_redalert'] = renderRedAlert();
  results['path_starcraft'] = renderStarcraft();
  results['path_warcraft'] = renderWarcraft();

  return results;
});

const outDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets', 'td');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const [key, dataUrl] of Object.entries(renderedTextures)) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const filePath = path.join(outDir, `${key}.png`);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  console.log(`Saved ${key}.png to ${filePath} (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
}

await task.finish({ keep: "all" });
console.log("All 7 TD path textures rendered successfully!");
