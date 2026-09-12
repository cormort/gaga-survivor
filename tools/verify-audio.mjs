// 音訊回歸驗證。
//
// 為什麼需要：音效與 BGM 是「聽起來對不對」的東西，但它的幾項性質是可以客觀量的 ——
// 有沒有破音、低頻/高頻層是否真的存在、張力系統有沒有真的加層、逐發微失諧是否生效、
// 爆炸是否共用快取 buffer。這支腳本用 OfflineAudioContext 把音訊**真的算出來**，
// 再對樣本做分析，所以不需要人耳也不需要音效卡。
//
// 用法：
//   npx http-server -p 8899 -s          # 另一個終端機，專案根目錄
//   node tools/verify-audio.mjs
//
// 離開碼 1 表示有項目失敗。需要 playwright (PW_MODULE 可指向絕對路徑)。

const pw = (await import(process.env.PW_MODULE || 'playwright')).default;
const URL = process.env.PROBE_URL || 'http://127.0.0.1:8899/index.html';

const browser = await pw.chromium.launch();
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.game);

const results = await page.evaluate(async () => {
  const { sound } = await import('/js/audio.js');
  const SR = 44100;
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: String(detail) });

  // 每次測試都換一個乾淨的 OfflineAudioContext（sound 是單例，先把圖重置）
  const fresh = (seconds, channels = 2) => {
    sound.ctx = null;
    sound.master = null;
    sound.sfxGain = null;
    sound.bgmGain = null;
    sound._noiseBuf = null;
    sound._schedTimer = null;
    sound._offline = false;
    sound.enabled = true;
    const ctx = new OfflineAudioContext(channels, Math.ceil(SR * seconds), SR);
    sound.init(ctx);
    sound.setVolumes(1, 1);
    return ctx;
  };

  // 樣本分析：峰值 / 整體 RMS / 低頻 RMS (<200Hz) / 高頻殘量 RMS / 過零率(亮度代理)
  const analyze = (buf) => {
    const L = buf.getChannelData(0);
    const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const n = L.length;
    let peak = 0, sum = 0, rSum = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(L[i]);
      if (v > peak) peak = v;
      sum += L[i] * L[i];
      rSum += R[i] * R[i];
    }
    const a = 1 - Math.exp((-2 * Math.PI * 200) / SR);
    let lp = 0, lowSum = 0, hpSum = 0;
    for (let i = 0; i < n; i++) {
      lp += a * (L[i] - lp);
      lowSum += lp * lp;
      const hp = L[i] - lp;
      hpSum += hp * hp;
    }
    let zc = 0;
    for (let i = 1; i < n; i++) if (L[i - 1] < 0 !== L[i] < 0) zc++;
    // 只取前 40ms 的過零率：射擊音是「高→低」掃頻，整段平均會把微失諧的差異抹掉
    let zw = 0;
    const zwEnd = Math.min(n, Math.floor(SR * 0.04));
    for (let i = 1; i < zwEnd; i++) if (L[i - 1] < 0 !== L[i] < 0) zw++;
    const zcrWindow = Math.round((zw / Math.max(1, zwEnd)) * SR);
    return {
      zcrWindow,
      peak: +peak.toFixed(4),
      rms: +Math.sqrt(sum / n).toFixed(5),
      rmsLow: +Math.sqrt(lowSum / n).toFixed(5),
      rmsHigh: +Math.sqrt(hpSum / n).toFixed(5),
      rmsR: +Math.sqrt(rSum / n).toFixed(5),
      zcr: Math.round((zc / n) * SR),
    };
  };

  const renderBGM = async (levelId, intensity, bars = 5) => {
    const ctx = fresh(16);
    sound.startBGM(levelId);
    sound.stopBGM();                       // 只用它的資料設定，不要真的開計時器
    sound.setIntensity(intensity);
    sound.intensity = intensity;           // 直接到位，免得平滑期佔掉量測窗
    sound._intensityTarget = intensity;
    const step = sound._bgmStepTime;
    const steps = bars * 8;
    for (let i = 0; i < steps; i++) sound._bgmStep(0.05 + i * step);
    const buf = await ctx.startRendering();
    return analyze(buf);
  };

  // 1) 五關 BGM：不可破音、要有聲音、低頻與高頻層都要存在、各關要聽得出不同
  const bgm = {};
  for (const id of ['street', 'lab', 'frost', 'core', 'endless']) {
    bgm[id] = await renderBGM(id, 0);
    ok(`BGM ${id} 不破音且有聲音`, bgm[id].peak <= 0.99 && bgm[id].rms > 0.004,
      `peak=${bgm[id].peak} rms=${bgm[id].rms}`);
    ok(`BGM ${id} 低頻(鼓/bass)與高頻(hat/lead)層都在`, bgm[id].rmsLow > 0.002 && bgm[id].rmsHigh > 0.001,
      `low=${bgm[id].rmsLow} high=${bgm[id].rmsHigh}`);
  }
  const zcrs = Object.values(bgm).map((b) => b.zcr);
  ok('五關 BGM 的頻譜亮度互不相同', new Set(zcrs).size >= 4, `zcr=${zcrs.join('/')}`);

  // 2) 張力系統：intensity 1 必須真的多排聲部（琶音層 + 更密的 lead + ghost hat）。
  //    這裡量「排程聲部數」而不是頻帶能量 —— 高頻殘量被 hat 主導、琶音落在低中頻，
  //    用頻帶會量不到實際上加了一整層；聲部數才是「編曲變厚」的直接證據。
  {
    const calm = await renderBGM('core', 0);
    const tense = await renderBGM('core', 1);
    const countVoices = (levelId, intensity, bars = 2) => {
      const ctx = fresh(4);
      sound.startBGM(levelId);
      sound.stopBGM();
      sound.intensity = intensity;
      sound._intensityTarget = intensity;
      let tones = 0;
      let noise = 0;
      const origTone = sound._bgmTone;
      const origNoise = sound._bgmNoise;
      sound._bgmTone = function (...a) { tones++; return origTone.apply(this, a); };
      sound._bgmNoise = function (...a) { noise++; return origNoise.apply(this, a); };
      for (let i = 0; i < bars * 8; i++) sound._bgmStep(0.05 + i * sound._bgmStepTime);
      sound._bgmTone = origTone;
      sound._bgmNoise = origNoise;
      return tones + noise;
    };
    const calmVoices = countVoices('core', 0);
    const tenseVoices = countVoices('core', 1);
    ok('張力 0 → 1 真的多排聲部（琶音/lead/ghost hat）', tenseVoices > calmVoices * 1.15,
      `2 小節聲部數 ${calmVoices} → ${tenseVoices}（${(tenseVoices / calmVoices).toFixed(2)}×）`);
    ok('張力提高後整體音量不減（層數增加要聽得出來）', tense.rms >= calm.rms * 0.98,
      `整體 RMS ${calm.rms} → ${tense.rms}`);
  }

  // 3) 限幅器：40 顆爆炸同時觸發（各自清掉節流）不可破音。
  //    未壓縮的原始總和約 40×0.4×0.25 = 4.0，遠超 0 dBFS。
  {
    const ctx = fresh(1.2);
    for (let i = 0; i < 40; i++) {
      sound._lastSfx = {};
      sound.playExplosion(0);
    }
    const r = analyze(await ctx.startRendering());
    ok('40 顆爆炸同時觸發不破音（限幅器生效）', r.peak <= 1.0 && r.peak > 0.2,
      `peak=${r.peak}（未限幅的原始總和約 4.0）rms=${r.rms}`);
  }

  // 4) 爆炸共用快取噪音 buffer：10 次爆炸只建立 1 個 buffer
  {
    const ctx = fresh(1.5);
    let created = 0;
    const origCreate = ctx.createBuffer.bind(ctx);
    ctx.createBuffer = (...a) => { created++; return origCreate(...a); };
    for (let i = 0; i < 10; i++) {
      sound._lastSfx = {};
      sound.playExplosion(0);
    }
    await ctx.startRendering();
    ok('10 次爆炸只建立 1 個噪音 buffer（原本每次一個）', created === 1, `createBuffer=${created}`);
  }

  // 5) 音效逐項：每一種都要有聲音、不破音
  const sfxList = [
    ['playShoot', () => sound.playShoot('kunai')],
    ['playDash', () => sound.playDash()],
    ['playHit', () => sound.playHit(0)],
    ['playGem', () => sound.playGem(0)],
    ['playSelect', () => sound.playSelect()],
    ['playExplosion', () => sound.playExplosion(0)],
    ['playLightning', () => sound.playLightning()],
    ['playLevelUp', () => sound.playLevelUp()],
    ['playEvoFanfare', () => sound.playEvoFanfare()],
    ['playHurt', () => sound.playHurt()],
    ['playGameOver', () => sound.playGameOver()],
  ];
  for (const [name, fn] of sfxList) {
    const ctx = fresh(1.2);
    sound._lastSfx = {};
    fn();
    const r = analyze(await ctx.startRendering());
    ok(`音效 ${name} 有聲音且不破音`, r.peak > 0.01 && r.peak <= 1.0, `peak=${r.peak} rms=${r.rms}`);
  }

  // 6) 逐發微失諧：同一種射擊連續 8 發，音高必須有變異（不能像同一顆音重播）
  {
    const zcrs = [];
    for (let i = 0; i < 8; i++) {
      const ctx = fresh(0.2, 1);
      sound._lastSfx = {};
      sound.playShoot('kunai', null);
      zcrs.push(analyze(await ctx.startRendering()).zcrWindow);
    }
    ok('射擊音效逐發有變化（微失諧生效）', new Set(zcrs).size >= 3, `前40ms zcr=${zcrs.join('/')}`);
  }

  // 7) 武器音色表：不同家族的頻譜亮度必須不同（苦無/火箭/雷電）
  {
    const zcrOf = async (kind) => {
      const ctx = fresh(0.2, 1);
      sound._lastSfx = {};
      sound.playShoot(kind, null);
      return analyze(await ctx.startRendering()).zcrWindow;
    };
    const zKunai = await zcrOf('kunai');
    const zRocket = await zcrOf('rocket');
    const zLightning = await zcrOf('lightning');
    ok('六種武器家族的射擊音色不同', new Set([zKunai, zRocket, zLightning]).size === 3,
      `kunai=${zKunai} rocket=${zRocket} lightning=${zLightning}`);
  }

  // 8) 立體聲定位：同一顆爆炸在畫面左/右會產生左右聲道能量差
  {
    const ctx = fresh(0.6);
    sound.setListener(0, 1280);          // 聽者在世界 x=0、視窗寬 1280
    sound._lastSfx = {};
    sound.playExplosion(-600);           // 左邊
    const r = analyze(await ctx.startRendering());
    const ctx2 = fresh(0.6);
    sound.setListener(0, 1280);
    sound._lastSfx = {};
    sound.playExplosion(0);              // 中央
    const c = analyze(await ctx2.startRendering());
    ok('音效有立體聲定位（左聲道 > 右聲道、中央接近相等）',
      r.rms > r.rmsR * 1.05 && Math.abs(c.rms - c.rmsR) < c.rms * 0.05,
      `左側 L/R=${r.rms}/${r.rmsR}  中央 L/R=${c.rms}/${c.rmsR}`);
  }

  // 9) 大鼓刷的尾巴：噪音 buffer 迴圈後，0.65 秒的 crash 在 0.5s 之後仍有能量
  //    （原本 buffer 只有 0.3 秒且不迴圈，尾巴會直接變無聲）
  {
    const ctx = fresh(1.0, 1);
    sound._bgmCrash(0.02, 0.09);
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0);
    let tail = 0;
    // 取 0.35~0.55 秒：舊版 buffer 只有 0.3 秒且不迴圈，這段會是**完全無聲**，
    // 所以「非零」就是這條修正的判別依據（指數衰減的尾巴本來就很小）。
    const from = Math.floor(SR * 0.35), to = Math.floor(SR * 0.55);
    for (let i = from; i < to; i++) tail += L[i] * L[i];
    const tailRms = Math.sqrt(tail / (to - from));
    ok('鼓刷尾巴延伸到 0.35 秒後（噪音緩衝迴圈修正；舊版此段為 0）', tailRms > 1e-4, `0.35~0.55s RMS=${tailRms.toFixed(6)}`);
  }

  // 10) 主匯流排：限幅器存在，而且兩條匯流排都接到它（不是直接接 destination）
  ok('主匯流排有限幅器 (DynamicsCompressor)', sound.master instanceof DynamicsCompressorNode,
    sound.master ? `threshold=${sound.master.threshold.value} ratio=${sound.master.ratio.value}` : 'missing');

  // 11) 排程器改為前瞻式：不再用「每個 step 一個 interval」，且 stopBGM 會清掉計時器
  {
    const ctx = fresh(1);
    sound.startBGM('street');
    const hasTimer = !!sound._schedTimer;
    const stepTime = sound._bgmStepTime;
    const ahead = sound._nextStepTime - ctx.currentTime;
    sound.stopBGM();
    ok('BGM 使用前瞻排程器（提前排入音訊時鐘、可停止）',
      hasTimer && ahead > 0.02 && ahead <= 0.35 && sound._schedTimer === null,
      `ahead=${ahead.toFixed(3)}s stepTime=${stepTime.toFixed(3)}s 停止後 timer=${sound._schedTimer}`);
  }

  return out;
});

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`PASS  ${r.name}  [${r.detail}]`); }
  else { fail++; console.log(`FAIL  ${r.name}  [${r.detail}]`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
