// 橫幅尺寸/位置檢查：三種視窗尺寸下都不覆蓋搖桿與動作列，說明文字不被裁掉。
const pw = (await import(process.env.PW_MODULE)).default;
const b = await pw.chromium.launch();
let bad = 0;
for (const vp of [{ width: 390, height: 844 }, { width: 740, height: 360 }, { width: 1280, height: 720 }]) {
  const ctx = await b.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8899/index.html');
  await p.waitForFunction(() => window.game, null, { timeout: 20000 });
  const r = await p.evaluate(() => {
    const shown = window.gagaPWA.showInstallBanner();
    const el = document.getElementById('pwa-banner');
    el.style.animation = 'none';
    const bb = el.getBoundingClientRect();
    const joy = document.getElementById('joystick-zone').getBoundingClientRect();
    const act = document.getElementById('action-bar').getBoundingClientRect();
    const ov = (a, c) => !(a.right < c.left || a.left > c.right || a.bottom < c.top || a.top > c.bottom);
    const desc = el.querySelector('.pwa-desc');
    const title = el.querySelector('.pwa-title');
    return {
      shown, rect: [Math.round(bb.left), Math.round(bb.top), Math.round(bb.right), Math.round(bb.bottom)],
      w: Math.round(bb.width), h: Math.round(bb.height),
      joy: ov(bb, joy), act: ov(bb, act),
      descClipped: desc.scrollWidth > desc.clientWidth + 1 || desc.offsetParent === null ? 'hidden/clipped' : false,
      titleClipped: title.scrollWidth > title.clientWidth + 1,
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      inside: bb.left >= 0 && bb.right <= innerWidth && bb.top >= 0 && bb.bottom <= innerHeight,
    };
  });
  const pass = r.shown && !r.joy && !r.act && !r.titleClipped && r.inside && r.h < 70;
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${vp.width}x${vp.height}`, JSON.stringify(r));
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
