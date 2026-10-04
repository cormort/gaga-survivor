// Verification of Ground PNG Textures and Terrain Rendering with ego-browser
// 測試產物輸出目錄：不再寫死原作者機器上的絕對路徑（可用 EGO_OUT_DIR 覆寫）
const EGO_OUT_DIR = process.env.EGO_OUT_DIR || `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/gaga-ego-artifacts`;
(await import('fs')).default.mkdirSync(EGO_OUT_DIR, { recursive: true });
const task = await taskSpace("verify-ground-png-" + Date.now());
const page = task.page("p1");

console.log("Navigating to dev server...");
await page.goto("http://127.0.0.1:8899/index.html?t=" + Date.now());
await page.waitForLoadState("load");
await page.waitForTimeout(1000);

const testResult = await page.evaluate(async () => {
  const ts = Date.now();
  const { GroundRenderer } = await import(`./js/systems/Ground.js?t=${ts}`);
  const { LEVELS } = await import(`./js/levels.js?t=${ts}`);

  const gr = new GroundRenderer();

  // Wait for PNGs to load
  const maxWait = 4000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    let allReady = true;
    for (const [id, loaded] of gr._pngLoaded.entries()) {
      if (!loaded) { allReady = false; break; }
    }
    if (gr._pngLoaded.size >= 12 && allReady) break;
    await new Promise(r => setTimeout(r, 100));
  }

  const loadedReport = {};
  for (const [id, img] of gr._pngImages.entries()) {
    loadedReport[id] = {
      loaded: gr._pngLoaded.get(id),
      width: img ? img.naturalWidth : 0,
      height: img ? img.naturalHeight : 0,
    };
  }

  // Render 4 key levels side-by-side onto a comparison montage canvas
  // Levels: street (cyberpunk asphalt), lab (titanium decking), core (molten basalt), inkmount (Shan-Shui xuan paper)
  const targetLevels = ['street', 'lab', 'core', 'inkmount'];
  const viewW = 480;
  const viewH = 320;
  const cols = 2;
  const rows = 2;

  const canvas = document.createElement('canvas');
  canvas.width = cols * viewW;
  canvas.height = rows * viewH;
  const ctx = canvas.getContext('2d');

  for (let idx = 0; idx < targetLevels.length; idx++) {
    const lvlId = targetLevels[idx];
    const lvl = LEVELS[lvlId];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const ox = col * viewW;
    const oy = row * viewH;

    // Create a sub-canvas for this level's camera view
    const subCanvas = document.createElement('canvas');
    subCanvas.width = viewW;
    subCanvas.height = viewH;
    const sctx = subCanvas.getContext('2d');

    const camera = { x: 400, y: 300 };
    gr.drawFloorGrid(sctx, lvl, camera, viewW, viewH, 15.0);
    gr.drawColorGrade(sctx, viewW, viewH, lvl);
    gr.drawVignette(sctx, viewW, viewH, lvl);

    // Blit onto montage
    ctx.drawImage(subCanvas, ox, oy);

    // Overlay level title banner
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 26, 0.78)';
    ctx.fillRect(ox + 12, oy + 12, 220, 32);
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 12, oy + 12, 220, 32);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${lvl.name || lvlId} (PNG: ${loadedReport[lvlId]?.width}px)`, ox + 22, oy + 33);
    ctx.restore();
  }

  return {
    loadedReport,
    dataUrl: canvas.toDataURL('image/png')
  };
});

console.log("Loaded Report:", JSON.stringify(testResult.loadedReport, null, 2));

// Save montage to artifact directory and tmp
const fs = await import('node:fs');
const base64Data = testResult.dataUrl.replace(/^data:image\/png;base64,/, "");
const artifactPath = `${EGO_OUT_DIR}/ground_png_montage.png`;
fs.writeFileSync(artifactPath, Buffer.from(base64Data, 'base64'));
fs.writeFileSync("/tmp/ground_png_montage.png", Buffer.from(base64Data, 'base64'));
console.log("Saved showcase montage to", artifactPath);

await task.finish({ keep: "all" });
