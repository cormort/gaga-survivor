// Web Audio API 即時程序化音效與背景音樂合成引擎 (零外掛依賴)
//
// 整合 https://cormort.github.io/chiptune-audio/ 的 chiptune 合成架構與預設參數：
//   1. 參數化合成核心 (Parametric Chiptune Synthesis)：支援方波 (脈寬 0.05~0.95 與脈寬掃動)、
//      鋸齒波、三角波、種子雜訊、滑音 (slide)、顫音 (vibrato 查表 LFO)、琶音 (arpeggio)、
//      數位破音 (bit-crush 4-bit/3-bit 等)、泛音與齊奏微失諧。
//   2. 豐富預設庫 (24 種 SFX_PRESETS)：包含 coin, jump, laser, hit, explosion, powerup,
//      select, gameover, win, shoot, blip, click, hurt, pickup, heal, levelup, door, step,
//      bounce, alarm, teleport, charge, error, splash 及所有武器專屬音色。
//   3. 高效 AudioBuffer 快取 (LRU Cache)：以參數簽章快取已渲染 PCM，配合 AudioBufferSourceNode
//      極致零負擔即時回放，支援任意世界座標立體聲定位與 playbackRate 音高縮放。
//   4. 寶石連擊音高爬升 (Gem Combo Pitch Scaling)：連續吸寶時音調階梯上揚，製造極具爽快感的打擊回饋。
//   5. 節拍穩定度 —— 前瞻排程器 (look-ahead scheduler)：以 ctx.currentTime 為時基、提前 250ms 排程。
//   6. 混音限幅器 (DynamicsCompressor)：防止大量子彈、命中與爆炸疊加時過載破音。
//   7. 豐富音樂主題 (BGM)：12 關＋無盡／首領戰／選單／守塔共 16 首，每關一種風格（樂器 BGM_VOICES、
//      鼓組 BGM_KITS、音階 scale 都由主題資料決定）。支援首領戰動態切換 (switchToBossTheme)。

// ── 基礎工具與 PRNG (Mulberry32) ─────────────────────────────
export const SAMPLE_RATE = 44100;
export const WAVE = { SQUARE: 0, SAW: 1, TRIANGLE: 2, NOISE: 3 };
export const MAX_SFX_SECONDS = 30;

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2048 點正弦波查表 (顫音 LFO 查表，避免每採樣呼叫 Math.sin)
const SINE_BITS = 11;
const SINE_SIZE = 1 << SINE_BITS;
const SINE = new Float32Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_SIZE);

// ── 音效預設值與限制 ─────────────────────────────────────────
export const SFX_DEFAULTS = {
  wave: WAVE.SQUARE,
  freq: 440,
  slide: 0,
  duty: 0.5,
  dutySweep: 0,
  vibDepth: 0,
  vibRate: 0,
  arpMult: 1,
  arpTime: 0,
  bits: 0,
  h2: 0,
  h3: 0,
  h4: 0,
  h5: 0,
  unison: 0,
  detune: 10,
  cutoff: 0,
  chiff: 0,
  attack: 0.005,
  sustain: 0.1,
  decay: 0.1,
  vol: 0.5,
  seed: 1,
};

const LIMITS = {
  wave: [0, 3],
  freq: [0, 20000],
  slide: [-64, 64],
  duty: [0.05, 0.95],
  dutySweep: [-256, 256],
  vibDepth: [0, 1],
  vibRate: [0, 4000],
  arpMult: [0.01, 64],
  arpTime: [0, MAX_SFX_SECONDS],
  bits: [0, 16],
  h2: [0, 1],
  h3: [0, 1],
  h4: [0, 1],
  h5: [0, 1],
  unison: [0, 2],
  detune: [0, 50],
  cutoff: [0, 20000],
  chiff: [0, 1],
  attack: [0, MAX_SFX_SECONDS],
  sustain: [0, MAX_SFX_SECONDS],
  decay: [0, MAX_SFX_SECONDS],
  vol: [0, 1],
};

const TIMBRE_KEYS = ['h2', 'h3', 'h4', 'h5', 'unison', 'detune', 'cutoff', 'chiff'];

export function normalizeSfx(params = {}) {
  const src = params && typeof params === 'object' ? params : {};
  const p = {};
  for (const k in SFX_DEFAULTS) {
    if (TIMBRE_KEYS.includes(k)) continue;
    const raw = src[k];
    let v = typeof raw === 'number' && Number.isFinite(raw) ? raw : SFX_DEFAULTS[k];
    const lim = LIMITS[k];
    if (lim !== undefined) {
      if (v < lim[0]) v = lim[0];
      else if (v > lim[1]) v = lim[1];
    }
    p[k] = v;
  }
  p.wave = Math.round(p.wave);
  p.bits = Math.round(p.bits);
  p.seed = p.seed >>> 0;
  for (const k of TIMBRE_KEYS) {
    const raw = src[k];
    let v = typeof raw === 'number' && Number.isFinite(raw) ? raw : SFX_DEFAULTS[k];
    const lim = LIMITS[k];
    if (v < lim[0]) v = lim[0];
    else if (v > lim[1]) v = lim[1];
    if (k === 'unison') v = Math.round(v);
    if (v !== SFX_DEFAULTS[k] || (k === 'detune' && p.unison !== undefined)) p[k] = v;
  }
  return p;
}

// ── 經典 24 種 Chiptune 預設 (來自 chiptune-audio) ───────────
export const SFX_PRESETS = {
  coin:     { wave: WAVE.SQUARE, freq: 988, arpMult: 1.5, arpTime: 0.07, sustain: 0.1, decay: 0.15, duty: 0.25, vol: 0.45 },
  jump:     { wave: WAVE.SQUARE, freq: 260, slide: 2.2, sustain: 0.08, decay: 0.15, duty: 0.4, vol: 0.4 },
  laser:    { wave: WAVE.SQUARE, freq: 1400, slide: -4, sustain: 0.05, decay: 0.15, duty: 0.3, dutySweep: -1, vol: 0.4 },
  hit:      { wave: WAVE.NOISE, freq: 6000, slide: -1.5, sustain: 0.03, decay: 0.12, bits: 4, vol: 0.4 },
  explosion:{ wave: WAVE.NOISE, freq: 2500, slide: -2.5, attack: 0.01, sustain: 0.15, decay: 0.55, vol: 0.7 },
  powerup:  { wave: WAVE.SQUARE, freq: 330, slide: 3, vibDepth: 0.03, vibRate: 30, sustain: 0.2, decay: 0.2, duty: 0.5, vol: 0.5 },
  select:   { wave: WAVE.TRIANGLE, freq: 660, sustain: 0.04, decay: 0.06, duty: 0.5, vol: 0.4 },
  gameover: { wave: WAVE.TRIANGLE, freq: 400, slide: -1, attack: 0.01, sustain: 0.4, decay: 0.6, vol: 0.6 },
  win:      { wave: WAVE.SQUARE, freq: 523, arpMult: 1.5, arpTime: 0.12, sustain: 0.3, decay: 0.4, duty: 0.25, vibDepth: 0.01, vibRate: 8, vol: 0.5 },
  shoot:    { wave: WAVE.SQUARE, freq: 900, slide: -6, sustain: 0.02, decay: 0.08, duty: 0.5, vol: 0.4 },
  blip:     { wave: WAVE.SQUARE, freq: 1200, sustain: 0.01, decay: 0.03, duty: 0.25, vol: 0.3 },
  click:    { wave: WAVE.TRIANGLE, freq: 2000, attack: 0, sustain: 0.003, decay: 0.012, vol: 0.35 },
  hurt:     { wave: WAVE.SAW, freq: 320, slide: -3, sustain: 0.05, decay: 0.15, bits: 4, vol: 0.5 },
  pickup:   { wave: WAVE.SQUARE, freq: 700, arpMult: 2, arpTime: 0.05, sustain: 0.06, decay: 0.1, duty: 0.125, vol: 0.45 },
  heal:     { wave: WAVE.TRIANGLE, freq: 400, slide: 1.5, vibDepth: 0.02, vibRate: 12, sustain: 0.25, decay: 0.3, vol: 0.6 },
  levelup:  { wave: WAVE.SQUARE, freq: 440, slide: 0.5, arpMult: 2, arpTime: 0.1, sustain: 0.25, decay: 0.3, duty: 0.125, vibDepth: 0.01, vibRate: 10, vol: 0.55 },
  door:     { wave: WAVE.NOISE, freq: 300, slide: -1, attack: 0.01, sustain: 0.1, decay: 0.2, bits: 3, vol: 0.6 },
  step:     { wave: WAVE.NOISE, freq: 1500, sustain: 0.01, decay: 0.04, vol: 0.3 },
  bounce:   { wave: WAVE.TRIANGLE, freq: 180, slide: 4, sustain: 0.03, decay: 0.1, vol: 0.6 },
  alarm:    { wave: WAVE.SQUARE, freq: 880, vibDepth: 0.2, vibRate: 6, sustain: 0.6, decay: 0.1, duty: 0.35, vol: 0.35 },
  teleport: { wave: WAVE.SQUARE, freq: 200, slide: 6, vibDepth: 0.08, vibRate: 40, sustain: 0.25, decay: 0.15, duty: 0.3, dutySweep: 2, vol: 0.45 },
  charge:   { wave: WAVE.SAW, freq: 110, slide: 3, attack: 0.05, sustain: 0.6, decay: 0.05, vol: 0.35 },
  error:    { wave: WAVE.SQUARE, freq: 220, arpMult: 0.75, arpTime: 0.08, sustain: 0.12, decay: 0.08, duty: 0.5, vol: 0.4 },
  splash:   { wave: WAVE.NOISE, freq: 4000, slide: -1, attack: 0.02, sustain: 0.1, decay: 0.35, vol: 0.5 },
  // 遊戲擴充預設
  shield:   { wave: WAVE.TRIANGLE, freq: 320, slide: 3.5, sustain: 0.05, decay: 0.18, vol: 0.4 },
  chest:    { wave: WAVE.SQUARE, freq: 523, arpMult: 1.5, arpTime: 0.08, sustain: 0.2, decay: 0.35, duty: 0.25, vibDepth: 0.01, vibRate: 8, vol: 0.5 },
};

// ── 核心 PCM 合成器 (Float32Array 離線/快速渲染) ─────────────
export function renderSfxInto(out, offset, params, sampleRate = SAMPLE_RATE) {
  const p = normalizeSfx(params);
  const invSR = 1 / sampleRate;
  const seconds = p.attack + p.sustain + p.decay;
  let n = Math.ceil(seconds * sampleRate);
  const maxN = Math.ceil(MAX_SFX_SECONDS * sampleRate);
  if (n > maxN) n = maxN;
  const room = out.length - offset;
  if (n > room) n = room;
  if (n <= 0 || p.freq <= 0) return 0;

  const wave = p.wave;
  const vol = p.vol;
  const levels = p.bits > 0 ? 2 ** p.bits : 0;
  const invLevels = levels ? 1 / levels : 0;

  const aEnd = p.attack * sampleRate;
  const sEnd = aEnd + p.sustain * sampleRate;
  const aStep = aEnd > 0 ? invSR / p.attack : 0;
  const dStep = p.decay > 0 ? invSR / p.decay : Infinity;
  let env = 0;

  const slideRatio = p.slide === 0 ? 1 : Math.pow(2, p.slide * invSR);
  let f = p.freq;
  const arpAt = p.arpTime > 0 ? Math.ceil(p.arpTime * sampleRate) : -1;

  const hasVib = p.vibDepth !== 0 && p.vibRate !== 0;
  const vibStep = p.vibRate * SINE_SIZE * invSR;
  let vibPos = 0;

  const hasDutySweep = p.dutySweep !== 0;
  const dutyStep = p.dutySweep * invSR;
  let dutyCur = p.duty;

  const noise = mulberry32(p.seed);
  let nv = noise() * 2 - 1;
  let phase = 0;
  let wrapped = false;

  for (let i = 0, idx = offset; i < n; i++, idx++) {
    if (i < aEnd) env += aStep;
    else if (i < sEnd) env = 1;
    else { env -= dStep; if (env < 0) env = 0; }

    if (i === arpAt) f *= p.arpMult;

    let fi = f;
    if (hasVib) {
      vibPos += vibStep;
      if (vibPos >= SINE_SIZE) vibPos -= SINE_SIZE * Math.floor(vibPos / SINE_SIZE);
      const si = vibPos | 0;
      const s0 = SINE[si];
      fi *= 1 + p.vibDepth * (s0 + (SINE[si + 1] - s0) * (vibPos - si));
    }
    phase += fi * invSR;
    f *= slideRatio;

    if (phase >= 1) { phase -= Math.floor(phase); wrapped = true; } else wrapped = false;

    let v;
    switch (wave) {
      case WAVE.SAW: v = 2 * phase - 1; break;
      case WAVE.TRIANGLE: v = 4 * Math.abs(phase - 0.5) - 1; break;
      case WAVE.NOISE:
        if (wrapped) nv = noise() * 2 - 1;
        v = nv;
        break;
      default:
        if (hasDutySweep) {
          dutyCur += dutyStep;
          if (dutyCur < 0.05) dutyCur = 0.05;
          else if (dutyCur > 0.95) dutyCur = 0.95;
        }
        v = phase < dutyCur ? 1 : -1;
    }
    if (levels) v = Math.round(v * levels) * invLevels;
    out[idx] += v * env * vol;
  }
  return n;
}

export function renderSfx(params, { sampleRate = SAMPLE_RATE } = {}) {
  const p = normalizeSfx(params);
  const seconds = p.attack + p.sustain + p.decay;
  let n = Math.ceil(seconds * sampleRate);
  const maxN = Math.ceil(MAX_SFX_SECONDS * sampleRate);
  if (n > maxN) n = maxN;
  const out = new Float32Array(n);
  renderSfxInto(out, 0, p, sampleRate);
  return out;
}

// ── 各關卡與情境的 BGM 主題 ──────────────────────────────────
export const BGM_THEMES = {
  street: {
    // 合成器浪潮 (Synthwave)：霓虹商業街
    bpm: 118,
    kit: 'electro',
    bassWave: 'sawbass',
    bassLevel: 0.12,
    keyRoot: 110,
    bass: [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83],
    bassGroove: [0, 0, 12, 0, 7, 0, 12, 7],
    mode: 'maj',
    chords: [110, 87.31, 130.81, 98, 110, 87.31, 73.42, 82.41],   // Am F C G | Am F Dm Em
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'supersaw', level: 0.04, dur: 0.18 },
    arp: { wave: 'pluck', level: 0.05 },
    pad: { level: 0.05, detune: 4, spread: false, voice: 'warm' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, 10, 7, 5, null, 7, null],
      [10, null, 10, 12, 14, null, 12, 10],
      [7, null, 5, 3, 2, null, 3, 5],
      [7, null, 7, 10, 12, null, 14, 15],
      [17, null, 15, 12, 10, null, 7, null],
      [8, null, 12, 15, 14, null, 12, 10],
      [12, null, 10, null, 7, null, 5, null],
    ],
    melodyB: [
      [12, 14, 15, 17, 19, null, 17, 15],
      [17, null, 15, 12, 10, null, 12, null],
      [14, null, 15, 17, 19, null, 17, 15],
      [12, null, 10, null, 7, null, 10, 12],
      [15, null, 17, 19, 20, null, 19, 17],
      [19, null, 17, 15, 14, null, 12, null],
      [14, null, 15, 17, 19, null, 17, 14],
      [12, null, null, null, 7, null, 5, null],
    ],
  },
  lab: {
    // 工業電子 (Industrial)：金屬敲擊與 FM 冷光
    bpm: 112,
    kit: 'industrial',
    bassWave: 'reese',
    bassLevel: 0.14,
    keyRoot: 87.31,
    bass: [87.31, 87.31, 98, 110, 87.31, 87.31, 123.47, 110],
    bassGroove: [0, 0, 7, 0, 0, 12, 7, 0],
    mode: 'min',
    chords: [87.31, 69.30, 116.54, 65.41, 87.31, 69.30, 77.78, 65.41],
    kick: 'half',
    clap: [],
    hat: 'sparse',
    drone: true,
    lead: { density: 0.16, octave: 1, wave: 'fm', level: 0.04, dur: 0.24 },
    arp: { wave: 'bell', level: 0.03 },
    pad: { level: 0.05, detune: 10, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [8, null, 7, null, 3, null, null, null],
      [5, null, 8, null, 12, null, 10, null],
      [7, null, 6, null, 3, null, 2, null],
      [12, null, 15, null, 14, null, 12, null],
      [8, null, 10, null, 7, null, 5, null],
      [10, null, 12, null, 14, null, 15, null],
      [12, null, 11, null, 7, null, 4, null],
    ],
  },
  frost: {
    // 冰原氛圍 (Ambient)：鐘聲與合唱，鼓點很輕
    bpm: 96,
    kit: 'soft',
    bassWave: 'subsine',
    bassLevel: 0.12,
    keyRoot: 98,
    bass: [98, 98, 123.47, 146.83, 98, 98, 130.81, 123.47],
    bassGroove: [0, 12, 0, 12, 7, 12, 10, 12],
    mode: 'min',
    chords: [196, 174.61, 146.83, 196, 174.61, 196, 146.83, 174.61],
    kick: 'half',
    clap: [],
    hat: 'sparse',
    lead: { density: 0.18, octave: 2, wave: 'bell', level: 0.05, dur: 0.6 },
    arp: { wave: 'bell', level: 0.03 },
    pad: { level: 0.06, detune: 6, spread: true, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [15, null, 12, null, 10, null, null, null],
      [14, null, 15, 17, 19, null, 17, 15],
      [17, null, 14, null, 12, null, 10, null],
      [19, null, 17, 15, 14, null, 15, 17],
      [15, null, 14, 12, 10, null, 8, null],
      [12, null, 15, 19, 17, null, 15, 14],
      [12, null, null, null, 14, null, 15, null],
    ],
  },
  core: {
    // 金屬 (Metal)：破音吉他強力和弦
    bpm: 150,
    kit: 'rock',
    bassWave: 'sawbass',
    bassLevel: 0.13,
    keyRoot: 65.41,
    bass: [65.41, 65.41, 73.42, 98, 65.41, 65.41, 82.41, 73.42],
    bassGroove: [0, 0, 12, 0, 7, 0, 12, 0],
    mode: 'min',
    chords: [65.41, 51.91, 58.27, 49, 65.41, 51.91, 43.65, 49],
    kick: 'floor',
    kickLevel: 0.62,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.3, octave: 1, wave: 'distgtr', level: 0.03, dur: 0.16 },
    arp: { wave: 'harpsi', level: 0.03 },
    pad: { level: 0.04, detune: 6, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [7, 7, null, 10, 12, null, 10, 7],
      [8, 8, null, 10, 12, null, 14, 15],
      [10, 10, null, 12, 14, null, 12, 10],
      [7, 7, null, 10, 8, null, 7, 5],
      [12, 12, null, 15, 14, null, 12, 10],
      [8, 8, null, 12, 15, null, 17, 19],
      [7, null, 10, 14, 12, null, 10, 7],
    ],
  },
  endless: {
    // 暗黑合成器 (Darksynth)：深淵無盡
    bpm: 138,
    kit: 'industrial',
    bassWave: 'reese',
    bassLevel: 0.14,
    keyRoot: 73.42,
    bass: [73.42, 73.42, 87.31, 110, 73.42, 73.42, 98, 87.31],
    bassGroove: [0, 0, 12, 7, 0, 12, 7, 10],
    mode: 'maj',
    chords: [73.42, 58.27, 87.31, 65.41, 73.42, 58.27, 49, 55],
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'supersaw', level: 0.04, dur: 0.15 },
    arp: { wave: 'fm', level: 0.03 },
    pad: { level: 0.05, detune: 5, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, 14, 15, 17, null, 15, 14],
      [15, null, 14, 12, 10, null, 12, null],
      [14, null, 15, 17, 19, null, 17, 15],
      [17, null, 19, 21, 22, null, 21, 19],
      [19, null, 17, 15, 14, null, 12, null],
      [15, null, 17, 19, 21, null, 19, 17],
      [14, null, 12, null, 10, null, 7, null],
    ],
  },
  boss: {
    // 史詩戰鬥 (Epic)：銅管＋太鼓＋大鍵琴頑固音型
    bpm: 150,
    kit: 'taiko',
    bassWave: 'sawbass',
    bassLevel: 0.13,
    keyRoot: 65.41,
    bass: [65.41, 65.41, 69.30, 77.78, 65.41, 65.41, 87.31, 82.41],
    bassGroove: [0, 0, 12, 0, 0, 7, 12, 7],
    mode: 'min',
    chords: [65.41, 69.30, 61.74, 65.41, 65.41, 69.30, 77.78, 49],
    kick: 'floor',
    kickLevel: 0.68,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.42, octave: 2, wave: 'brass', level: 0.05, dur: 0.16 },
    arp: { wave: 'harpsi', level: 0.035 },
    pad: { level: 0.055, detune: 8, spread: true, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [13, 13, null, 12, 8, null, 7, null],
      [11, 11, null, 12, 13, null, 12, 11],
      [12, null, null, null, 7, null, 8, null],
      [12, 12, 13, 15, 16, null, 15, 13],
      [17, null, 16, 13, 12, null, 8, null],
      [15, 15, 16, 17, 19, null, 17, 15],
      [16, null, 15, null, 12, null, 11, null],
    ],
  },
  menu: {
    // Lo-fi：撥弦與鐘聲，放鬆的基地
    bpm: 88,
    kit: 'soft',
    bassWave: 'subsine',
    bassLevel: 0.12,
    keyRoot: 110,
    bass: [110, 110, 130.81, 146.83, 110, 110, 146.83, 130.81],
    bassGroove: [0, null, 7, null, 12, null, 7, null],
    mode: 'maj',
    chords: [110, 146.83, 138.59, 92.50, 123.47, 82.41, 110, 110],
    kick: 'half',
    clap: [4],
    hat: 'sparse',
    lead: { density: 0.22, octave: 2, wave: 'pluck', level: 0.05, dur: 0.3 },
    arp: { wave: 'bell', level: 0.024 },
    pad: { level: 0.045, detune: 3, spread: true, voice: 'warm' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [9, null, 7, null, 4, null, 2, null],
      [4, null, 7, 9, 11, null, 9, 7],
      [9, null, 7, null, 4, null, null, null],
      [7, null, 9, 11, 12, null, 11, 9],
      [11, null, 9, null, 7, null, 4, null],
      [2, null, 4, 7, 9, null, 7, 4],
      [7, null, null, null, 4, null, 2, null],
    ],
  },
  td: {
    // 軍樂進行曲 (March)：銅管與小鼓滾奏
    bpm: 120,
    kit: 'march',
    bassWave: 'sawbass',
    bassLevel: 0.12,
    keyRoot: 98,
    bass: [98, 98, 116.54, 130.81, 98, 98, 146.83, 130.81],
    bassGroove: [0, 0, 7, 0, 12, 0, 7, 0],
    mode: 'min',
    chords: [98, 87.31, 77.78, 73.42, 98, 116.54, 65.41, 73.42],
    kick: 'floor',
    kickLevel: 0.58,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.32, octave: 2, wave: 'brass', level: 0.045, dur: 0.16 },
    arp: { wave: 'pluck', level: 0.035 },
    pad: { level: 0.045, detune: 5, spread: false, voice: 'warm' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [10, null, 8, null, 5, null, 7, null],
      [8, null, 10, 12, 13, null, 12, 10],
      [7, null, 5, null, 3, null, 2, null],
      [5, null, 7, 10, 12, null, 14, 15],
      [15, null, 14, 12, 10, null, 7, null],
      [8, null, 10, 12, 14, null, 12, 10],
      [12, null, null, null, 10, null, 7, null],
    ],
  },
  // ── 以下 8 關原本沒有自己的主題、全部播商業街的音樂 ──
  subway: {
    // 碎拍鼓打貝斯 (Breakbeat / D&B)：地鐵隧道的高速碎拍
    bpm: 164,
    kit: 'breakbeat',
    bassWave: 'reese',
    bassLevel: 0.14,
    keyRoot: 73.42,
    bass: [73.42, 58.27, 87.31, 65.41, 73.42, 58.27, 98.0, 65.41],
    bassGroove: [0, 12, 0, 7, 0, 12, 10, 7],
    mode: 'min',
    chords: [73.42, 58.27, 87.31, 65.41, 73.42, 58.27, 98.0, 65.41],
    kick: [0, 5],
    clap: [2, 6],
    hat: 'sixteenth',
    lead: { density: 0.3, octave: 2, wave: 'fm', level: 0.04, dur: 0.12 },
    arp: { wave: 'fm', level: 0.028 },
    pad: { level: 0.045, detune: 6, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, 10, 12, 15, null, 12, null],
      [8, null, 7, null, 3, null, 5, 7],
      [7, null, 5, 3, 2, null, 0, null],
      [12, null, 15, 17, 19, null, 17, 15],
      [17, null, 15, 12, 10, null, 8, null],
      [10, 12, 15, 12, 10, null, 7, null],
      [12, null, null, null, 7, null, null, null],
    ],
  },
  swamp: {
    // 黑暗部落 (Dark Tribal)：低鳴長笛、合唱與部落低鼓
    bpm: 100,
    kit: 'taiko',
    bassWave: 'subsine',
    bassLevel: 0.13,
    keyRoot: 82.41,
    bass: [82.41, 87.31, 82.41, 73.42, 82.41, 87.31, 98.0, 87.31],
    bassGroove: [0, null, 7, null, 0, null, 12, null],
    mode: 'min',
    scale: [0, 1, 3, 5, 7, 8, 10, 12],
    chords: [82.41, 87.31, 82.41, 73.42, 82.41, 87.31, 98.0, 87.31],
    kick: [0, 3, 6],
    clap: [4],
    hat: 'sparse',
    drone: true,
    lead: { density: 0.15, octave: 2, wave: 'flute', level: 0.05, dur: 0.42 },
    arp: { wave: 'pluck', level: 0.04 },
    pad: { level: 0.055, detune: 8, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [7, null, null, 8, 7, null, 5, null],
      [3, null, 1, null, 0, null, null, null],
      [null, null, 12, null, 10, null, 8, 7],
      [8, null, null, null, 7, null, 5, null],
      [7, null, 8, 10, 12, null, 10, 8],
      [7, null, 5, null, 3, null, 1, null],
      [0, null, null, null, null, null, null, null],
    ],
  },
  storm: {
    // 沙漠風 (Desert)：烏德琴撥弦、弗里吉亞屬音階與手鼓
    bpm: 116,
    kit: 'hand',
    bassWave: 'sawbass',
    bassLevel: 0.11,
    keyRoot: 110,
    bass: [110.0, 116.54, 110.0, 98.0, 110.0, 116.54, 98.0, 110.0],
    bassGroove: [0, 0, 12, 0, 7, 0, 12, 0],
    mode: 'maj',
    scale: [0, 1, 4, 5, 7, 8, 10, 12],
    chords: [110.0, 116.54, 110.0, 98.0, 110.0, 116.54, 98.0, 110.0],
    kick: [0, 3, 4],
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'oud', level: 0.05, dur: 0.18 },
    arp: { wave: 'pluck', level: 0.035 },
    pad: { level: 0.04, detune: 4, spread: false, voice: 'warm' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, 13, 12, null, 8, null, 7, null],
      [8, null, 7, 5, 4, null, 5, null],
      [4, 5, 4, 1, 0, null, null, null],
      [7, null, 8, null, 10, null, 12, 13],
      [12, null, 10, 8, 7, null, 8, null],
      [5, null, 4, null, 1, null, 4, 5],
      [4, null, 1, null, 0, null, null, null],
    ],
  },
  foundry: {
    // 工業金屬 (Industrial Metal)：破音吉他與鐵砧敲擊
    bpm: 132,
    kit: 'industrial',
    bassWave: 'sawbass',
    bassLevel: 0.13,
    keyRoot: 65.41,
    bass: [65.41, 65.41, 51.92, 58.27, 65.41, 65.41, 77.79, 58.27],
    bassGroove: [0, 0, 0, 12, 0, 0, 7, 0],
    mode: 'min',
    chords: [65.41, 65.41, 51.92, 58.27, 65.41, 65.41, 77.79, 58.27],
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.3, octave: 2, wave: 'distgtr', level: 0.03, dur: 0.14 },
    arp: { wave: 'fm', level: 0.03 },
    pad: { level: 0.04, detune: 6, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, 12, null, 15, null, 12, null],
      [10, null, 8, null, 7, null, null, null],
      [8, 8, 7, null, 3, null, 5, null],
      [12, null, 15, null, 17, null, 19, null],
      [20, null, 19, 17, 15, null, 12, null],
      [15, null, 14, null, 12, null, 10, null],
      [12, null, null, null, null, null, null, null],
    ],
  },
  frostvoid: {
    // 空靈 (Ethereal)：利底亞音階的鐘聲與合唱
    bpm: 84,
    kit: 'soft',
    bassWave: 'subsine',
    bassLevel: 0.12,
    keyRoot: 87.31,
    bass: [87.31, 98.0, 87.31, 98.0, 73.42, 98.0, 87.31, 87.31],
    bassGroove: [0, null, null, null, 7, null, null, null],
    mode: 'maj',
    scale: [0, 2, 4, 6, 7, 9, 11, 12],
    chords: [87.31, 98.0, 87.31, 98.0, 73.42, 98.0, 87.31, 87.31],
    kick: [0],
    clap: [4],
    hat: 'sparse',
    drone: true,
    lead: { density: 0.12, octave: 2, wave: 'bell', level: 0.05, dur: 0.8 },
    arp: { wave: 'bell', level: 0.03 },
    pad: { level: 0.06, detune: 6, spread: true, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, null, null, 11, null, null, null],
      [9, null, null, null, 6, null, 7, null],
      [4, null, null, null, null, null, null, null],
      [11, null, null, 12, 14, null, null, null],
      [16, null, null, null, 14, null, 11, null],
      [9, null, null, null, 7, null, 6, null],
      [7, null, null, null, null, null, null, null],
    ],
  },
  voidroad: {
    // 賽博故障 (Cyber Glitch)：FM 琶音與碎拍
    bpm: 150,
    kit: 'breakbeat',
    bassWave: 'reese',
    bassLevel: 0.14,
    keyRoot: 61.74,
    bass: [61.74, 49.0, 73.42, 55.0, 61.74, 49.0, 82.41, 55.0],
    bassGroove: [0, 12, 0, 12, 0, 12, 7, 12],
    mode: 'min',
    chords: [61.74, 49.0, 73.42, 55.0, 61.74, 49.0, 82.41, 55.0],
    kick: [0, 3, 5],
    clap: [2, 6],
    hat: 'sixteenth',
    lead: { density: 0.35, octave: 2, wave: 'fm', level: 0.04, dur: 0.1 },
    arp: { wave: 'fm', level: 0.03 },
    pad: { level: 0.045, detune: 7, spread: false, voice: 'choir' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, 12, null, 15, null, 12, null, 10],
      [12, null, 7, null, 10, null, 12, null],
      [15, 14, 12, null, 10, null, 7, null],
      [19, null, 17, null, 15, null, 14, 12],
      [14, null, 15, null, 17, 19, null, 17],
      [15, null, 12, null, 10, null, 7, null],
      [12, null, null, 7, null, null, 12, null],
    ],
  },
  inkmount: {
    // 國風 (Chinese)：笛子主奏、古箏琶音、五聲音階與太鼓
    bpm: 96,
    kit: 'taiko',
    bassWave: 'subsine',
    bassLevel: 0.12,
    keyRoot: 73.42,
    bass: [73.42, 98.0, 73.42, 110.01, 73.42, 98.0, 110.01, 73.42],
    bassGroove: [0, null, 7, null, 12, null, 7, null],
    mode: 'maj',
    scale: [0, 2, 4, 7, 9, 12],
    arpTones: [0, 2, 4, 7, 9],
    chords: [73.42, 98.0, 73.42, 110.01, 73.42, 98.0, 110.01, 73.42],
    kick: [0, 4],
    clap: [6],
    hat: 'sparse',
    lead: { density: 0.2, octave: 2, wave: 'flute', level: 0.05, dur: 0.35 },
    arp: { wave: 'pluck', level: 0.05 },
    pad: { level: 0.04, detune: 4, spread: true, voice: 'warm' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [9, null, 7, null, 9, 12, null, null],
      [14, null, 12, 9, 7, null, null, null],
      [4, null, 7, null, 9, null, 7, 4],
      [2, null, null, null, 0, null, null, null],
      [12, null, 14, null, 16, null, 14, 12],
      [9, null, 12, 9, 7, null, 4, null],
      [7, null, 4, 2, 0, null, null, null],
    ],
  },
  makaimura: {
    // 哥德 (Gothic)：管風琴、大鍵琴、和聲小調與行進小鼓
    bpm: 132,
    kit: 'march',
    bassWave: 'sawbass',
    bassLevel: 0.11,
    keyRoot: 110,
    bass: [110.0, 73.42, 82.41, 110.0, 87.31, 73.42, 82.41, 82.41],
    bassGroove: [0, 0, 12, 0, 7, 0, 12, 0],
    mode: 'min',
    scale: [0, 2, 3, 5, 7, 8, 11, 12],
    chords: [110.0, 73.42, 82.41, 110.0, 87.31, 73.42, 82.41, 82.41],
    kick: [0, 4],
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'harpsi', level: 0.04, dur: 0.14 },
    arp: { wave: 'harpsi', level: 0.03 },
    pad: { level: 0.05, detune: 4, spread: false, voice: 'organ' },
    melody: [
      [null, null, null, null, null, null, null, null],
      [12, null, 11, 12, 14, null, 12, 11],
      [8, null, 7, null, 5, null, 3, null],
      [2, null, 3, 5, 7, null, 8, null],
      [11, null, null, 12, null, null, null, null],
      [12, null, 14, 15, 17, null, 15, 14],
      [12, null, 11, null, 8, null, 7, null],
      [5, null, 3, null, 2, null, -1, null],
    ],
  },
};

// ── 全武器射擊音色表 ─────────────────────────────────────────
export const SHOOT_TIMBRES = {
  kunai:       { type: 'triangle', f0: 650, f1: 180, dur: 0.08, level: 0.30 },
  rocket:      { type: 'sawtooth', f0: 300, f1: 90,  dur: 0.15, level: 0.26 },
  molotov:     { type: 'triangle', f0: 430, f1: 140, dur: 0.12, level: 0.22 },
  lightning:   { type: 'square',   f0: 900, f1: 260, dur: 0.09, level: 0.19 },
  soccer:      { type: 'sine',     f0: 520, f1: 300, dur: 0.07, level: 0.22 },
  guardian:    { type: 'sine',     f0: 780, f1: 640, dur: 0.06, level: 0.17 },
  boomerang:   { type: 'triangle', f0: 420, f1: 980, dur: 0.18, level: 0.24 },
  railgun:     { type: 'square',   f0: 1400, f1: 180, dur: 0.22, level: 0.30 },
  frost_nova:  { type: 'sine',     f0: 1800, f1: 600, dur: 0.20, level: 0.20 },
  shotgun:     { type: 'sawtooth', f0: 220,  f1: 60,  dur: 0.12, level: 0.32 },
  bolter:      { type: 'sawtooth', f0: 340,  f1: 70,  dur: 0.14, level: 0.32 },
  storm_bolter:{ type: 'square',   f0: 440,  f1: 85,  dur: 0.11, level: 0.30 },
  chainsword:  { type: 'sawtooth', f0: 200,  f1: 280, dur: 0.13, level: 0.26 },
  power_sword: { type: 'sawtooth', f0: 520,  f1: 160, dur: 0.18, level: 0.32 },
  phase_blade: { type: 'square',   f0: 820,  f1: 340, dur: 0.08, level: 0.22 },
  orbit_saw:   { type: 'sawtooth', f0: 260,  f1: 320, dur: 0.10, level: 0.20 },
};

// ── BGM 樂器音色（每關風格不同的基礎）────────────────────────────
// 每個音色＝幾個振盪器層（波形、相對頻率 mul、微分音 cents、音量 gain）→ 選配破音 → 濾波器 → 音量包絡。
// 主題資料的 wave / bassWave / pad.voice 寫這裡的名字就換樂器；寫 'square'、'pulse25' 這類原生波形則照舊（晶片風）。
//   filter.env：濾波器截止頻率在 envTime 秒內從 from 滑到 to（撥弦的「亮→暗」、銅管的「暗→亮」）
//   sustain：true = 音符持續到尾端再收（風琴、合唱、長笛），false = 一下就衰減（撥弦、鐘）
const BGM_VOICES = {
  supersaw: { layers: [['sawtooth', 1, -14, 0.4], ['sawtooth', 1, 0, 0.4], ['sawtooth', 1, 14, 0.4]], filter: ['lowpass', 2800, 1], attack: 0.01, sustain: true },
  sawbass:  { layers: [['sawtooth', 1, 0, 0.7], ['square', 0.5, 0, 0.5]], filter: ['lowpass', 700, 2] },
  reese:    { layers: [['sawtooth', 1, -22, 0.6], ['sawtooth', 1, 22, 0.6]], filter: ['lowpass', 520, 3], sustain: true },
  subsine:  { layers: [['sine', 1, 0, 1], ['triangle', 2, 0, 0.15]] },
  distgtr:  { layers: [['sawtooth', 1, 0, 0.6], ['sawtooth', 1.4983, 0, 0.45], ['sawtooth', 0.5, 0, 0.35]], drive: 6, filter: ['lowpass', 3000, 1], sustain: true },
  pluck:    { layers: [['triangle', 1, 0, 0.8], ['sawtooth', 1, 4, 0.25]], filter: ['lowpass', 600, 2, 5200, 0.18] },
  oud:      { layers: [['sawtooth', 1, 0, 0.6], ['triangle', 2, 0, 0.2]], filter: ['lowpass', 900, 4, 4200, 0.12] },
  harpsi:   { layers: [['square', 1, 0, 0.45], ['sawtooth', 2, 0, 0.25]], filter: ['lowpass', 1600, 1, 7000, 0.1] },
  bell:     { layers: [['sine', 1, 0, 0.8], ['sine', 2.76, 0, 0.32], ['sine', 5.4, 0, 0.12]] },
  organ:    { layers: [['sine', 1, 0, 0.6], ['square', 2, 0, 0.12], ['sine', 3, 0, 0.3], ['sine', 4, 0, 0.15]], filter: ['lowpass', 3200, 0.7], attack: 0.02, sustain: true },
  brass:    { layers: [['sawtooth', 1, -6, 0.5], ['sawtooth', 1, 6, 0.5]], filter: ['lowpass', 2600, 2, 500, 0.06], attack: 0.04, sustain: true },
  flute:    { layers: [['sine', 1, 0, 0.9], ['triangle', 2, 0, 0.12]], attack: 0.05, sustain: true, vib: { depth: 0.012, rate: 5.5, delay: 0.12 } },
  choir:    { layers: [['sawtooth', 1, -16, 0.3], ['sawtooth', 1, 0, 0.3], ['sawtooth', 1, 16, 0.3]], filter: ['lowpass', 1100, 0.6], attack: 0.35, sustain: true },
  fm:       { layers: [['square', 1, 0, 0.45], ['square', 3.01, 0, 0.2], ['sine', 0.5, 0, 0.3]], filter: ['lowpass', 4200, 2] },
  warm:     { layers: [['triangle', 1, -5, 0.5], ['triangle', 1, 5, 0.5]], attack: 0.3, sustain: true },
};

// 破音曲線（電吉他）：tanh 軟削波，依 drive 快取，不要每個音符都重算 1024 點
const _driveCurves = {};
function driveCurve(drive) {
  if (_driveCurves[drive]) return _driveCurves[drive];
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return (_driveCurves[drive] = c);
}

// ── 鼓組：每種 kit 換掉大鼓／小鼓（clap）／hat 的音色 ─────────────────
//   kick: [起始頻率, 結束頻率, 長度]   snare: [噪音濾波頻率, 長度, 鼓身音高(0=無), 鼓身波形]   hat: 高通頻率
const BGM_KITS = {
  electro:    { kick: [220, 38, 0.09], snare: [1900, 0.11, 0], hat: 7200 },
  rock:       { kick: [160, 45, 0.14], snare: [2600, 0.16, 190, 'triangle'], hat: 8200 },
  taiko:      { kick: [105, 48, 0.38], snare: [900, 0.07, 330, 'triangle'], hat: 5200 },
  industrial: { kick: [190, 40, 0.12], snare: [3400, 0.09, 820, 'square'], hat: 9200 },
  hand:       { kick: [300, 120, 0.09], snare: [2400, 0.05, 620, 'sine'], hat: 6400 },
  breakbeat:  { kick: [200, 42, 0.1], snare: [2100, 0.13, 220, 'triangle'], hat: 8600 },
  march:      { kick: [130, 55, 0.18], snare: [3000, 0.12, 240, 'triangle'], hat: 7600 },
  soft:       { kick: [120, 50, 0.2], snare: [1300, 0.06, 0], hat: 9600 },
};

const SCHEDULE_AHEAD = 0.25;
const SCHEDULER_MS = 50;

// ── 兩條匯流排的混音基準 (trim) ──────────────────────────────
// 玩家回報「局內音樂太小、音效太吵」，所以把 BGM 匯流排拉高、SFX 匯流排維持在原本的
// 上限（要再小由預設音量與局內滑桿處理，見 js/save.js 的 settings 與 v115 遷移）。
// 這兩個常數是**唯一的混音比例來源**：玩家滑桿 (0~1) 是乘在上面的係數，
// 改這裡等於整體改比例，不會動到任何單一音效的相對大小。
const BGM_BASE = 0.45;   // 舊值 0.30
const SFX_BASE = 0.12;

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmStep = 0;
    this.bgmMuted = false;
    this.sfxVol = 1;
    this.bgmVol = 0.8;
    this._lastSfx = {};

    // BGM 排程狀態
    this._schedTimer = null;
    this._nextStepTime = 0;
    this._bgmStepTime = 0.23;
    this._bgmTheme = null;
    this._bgmDrone = false;
    this._bgmLastLead = 0;
    this._bgmLastStep = -1;
    this._arpIdx = 0;
    this._activeLevelId = 'street';
    this._isBossBGM = false;

    // 音樂張力 (0~1)
    this.intensity = 0;
    this._intensityTarget = 0;

    // 音效質感
    this.sfxJitter = 0.06;
    this._listenX = null;
    this._listenW = 1;
    this._offline = false;
    this._visBound = false;

    // Chiptune AudioBuffer LRU 快取
    this.sfxCache = new Map();
    this.maxCachedSfx = 128;

    // 寶石連擊音調追蹤
    this._gemCombo = 0;
    this._lastGemTime = 0;

    // 晶片脈衝波 (NES Pulse PeriodicWaves)
    this._periodicWaves = null;
  }

  _initPeriodicWaves() {
    if (!this.ctx || this._periodicWaves) return;
    this._periodicWaves = {};
    try {
      const n = 64;
      const makePulse = (duty) => {
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
        return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      };
      this._periodicWaves.pulse12 = makePulse(0.125);
      this._periodicWaves.pulse25 = makePulse(0.25);
      this._periodicWaves.pulse75 = makePulse(0.75);
    } catch (e) {
      // 離線模擬環境或不支援 PeriodicWave 時靜默降級
    }
  }

  _throttle(name, gapMs) {
    const now = performance.now();
    if (now - (this._lastSfx[name] || -Infinity) < gapMs) return true;
    this._lastSfx[name] = now;
    return false;
  }

  _applyGains() {
    if (!this.ctx) return;
    if (this.sfxGain) this.sfxGain.gain.value = this.enabled ? SFX_BASE * this.sfxVol : 0;
    if (this.bgmGain) this.bgmGain.gain.value = this.enabled && !this.bgmMuted ? BGM_BASE * this.bgmVol : 0;
  }

  setVolumes(sfxVol, bgmVol) {
    this.sfxVol = Math.max(0, Math.min(1, +sfxVol || 0));
    this.bgmVol = Math.max(0, Math.min(1, +bgmVol || 0));
    this._applyGains();
  }

  setIntensity(v) {
    this._intensityTarget = Math.max(0, Math.min(1, +v || 0));
  }

  setListener(centerX, viewWidth) {
    this._listenX = centerX;
    this._listenW = Math.max(1, viewWidth || 1);
  }

  _panFor(worldX) {
    if (worldX == null || this._listenX == null) return 0;
    const rel = (worldX - this._listenX) / (this._listenW * 0.5);
    return Math.max(-1, Math.min(1, rel)) * 0.7;
  }

  init(ctxOverride = null) {
    if (this.ctx) return;
    if (ctxOverride) {
      this.ctx = ctxOverride;
      this._offline = true;
    } else {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.enabled = false;
        return;
      }
      this.ctx = new AudioContext();
    }

    this._initPeriodicWaves();

    // 兩條匯流排 → 限幅器 → 輸出
    this.master = this.ctx.createDynamicsCompressor();
    this.master.threshold.value = -8;
    this.master.knee.value = 5;
    this.master.ratio.value = 12;
    this.master.attack.value = 0.003;
    this.master.release.value = 0.18;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = SFX_BASE * this.sfxVol;
    this.sfxGain.connect(this.master);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = BGM_BASE * this.bgmVol;
    this.bgmGain.connect(this.master);

    if (!this._visBound && typeof document !== 'undefined' && document.addEventListener) {
      this._visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.ensureContext();
          this._resyncBGM();
        }
      });
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (!this._periodicWaves) this._initPeriodicWaves();
    if (!this._offline && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().then(() => this._resyncBGM()).catch(() => {});
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    this._applyGains();
    return this.enabled;
  }

  pauseBGM() {
    this.bgmMuted = true;
    this._applyGains();
  }

  resumeBGM() {
    this.bgmMuted = false;
    this._applyGains();
  }

  // ── 即時 Oscillator 音效發聲器 ──────────────────────────────
  _sfxVoice(o) {
    const ctx = this.ctx;
    const t = o.at != null ? o.at : ctx.currentTime;
    const dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type || 'triangle';
    const det = 1 + (Math.random() - 0.5) * 2 * (o.jitter != null ? o.jitter : this.sfxJitter);
    const f0 = (o.f0 || 440) * det;
    osc.frequency.setValueAtTime(f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * det), t + dur);

    const level = Math.max(0.0001, (o.level != null ? o.level : 0.25) * (1 + (Math.random() - 0.5) * 0.16));
    const attack = o.attack != null ? o.attack : 0.004;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
    if (o.hold) gain.gain.setValueAtTime(level, t + Math.max(attack, dur - (o.release || 0.05)));
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    let tail = gain;
    let panner = null;
    if (o.pan && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, o.pan));
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(o.bus || this.sfxGain);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
        if (panner) panner.disconnect();
      } catch (e) { /* 已斷開 */ }
    };
    return osc;
  }

  _noiseBuffer() {
    if (!this._noiseBuf) {
      const len = Math.max(1, Math.ceil(this.ctx.sampleRate * 0.6));
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this._noiseBuf;
  }

  _noiseVoice(t, dur, level, filterType = 'highpass', filterFreq = 6000, bus = null, pan = 0, offset = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let tail = gain;
    let panner = null;
    if (pan && this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      tail = panner;
    }
    src.connect(filter);
    filter.connect(gain);
    tail.connect(bus || this.sfxGain);
    src.start(t, offset);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
        if (panner) panner.disconnect();
      } catch (e) { /* 已斷開 */ }
    };
    return src;
  }

  // ── Chiptune AudioBuffer 快取回放引擎 ─────────────────────────
  _getSfxBuffer(name, params) {
    const rate = this.ctx ? this.ctx.sampleRate : SAMPLE_RATE;
    const key = typeof name === 'string'
      ? `${rate}|n:${name}`
      : `${rate}|p:${JSON.stringify(normalizeSfx(params))}`;

    const hit = this.sfxCache.get(key);
    if (hit) {
      this.sfxCache.delete(key);
      this.sfxCache.set(key, hit);
      return hit;
    }

    const samples = renderSfx(params, { sampleRate: rate });
    if (!samples || samples.length === 0) return null;
    const buf = this.ctx.createBuffer(1, samples.length, rate);
    buf.getChannelData(0).set(samples);

    this.sfxCache.set(key, buf);
    while (this.sfxCache.size > this.maxCachedSfx) {
      this.sfxCache.delete(this.sfxCache.keys().next().value);
    }
    return buf;
  }

  /**
   * 播放 Chiptune 音效 (可傳入預設名如 'coin'，或自訂參數物件)
   * opts.rate: 音高倍率 (預設 1.0)
   * opts.pan: 立體聲定位 (-1 ~ 1)
   * opts.worldX: 自動轉換為 pan 的世界座標
   * opts.gain: 音量倍率 (預設 1.0)
   */
  playSfx(nameOrParams, opts = {}) {
    if (!this.enabled) return null;
    this.ensureContext();
    if (!this.ctx) return null;

    let params;
    let name = null;
    if (typeof nameOrParams === 'string') {
      name = nameOrParams;
      params = SFX_PRESETS[name];
      if (!params) return null;
    } else if (nameOrParams && typeof nameOrParams === 'object') {
      params = nameOrParams;
    } else {
      return null;
    }

    const buf = this._getSfxBuffer(name, params);
    if (!buf) return null;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const rate = Number(opts.rate);
    if (Number.isFinite(rate) && rate > 0) {
      src.playbackRate.value = rate;
    }

    let node = src;
    let pan = opts.pan != null ? Number(opts.pan) : (opts.worldX != null ? this._panFor(opts.worldX) : 0);
    let panner = null;
    if (Number.isFinite(pan) && pan !== 0 && this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(panner);
      node = panner;
    }

    const g0 = Number(opts.gain);
    const gainVal = Number.isFinite(g0) ? g0 : 1;
    let gainNode = null;
    if (gainVal !== 1) {
      gainNode = this.ctx.createGain();
      gainNode.gain.value = Math.max(0, gainVal);
      node.connect(gainNode);
      node = gainNode;
    }

    node.connect(this.sfxGain);
    src.start();
    src.onended = () => {
      try {
        src.disconnect();
        if (panner) panner.disconnect();
        if (gainNode) gainNode.disconnect();
      } catch (e) { /* ignore */ }
    };
    return src;
  }

  // ── 音效介面 ────────────────────────────────────────────────
  playShoot(kind = null, worldX = null) {
    if (!this.enabled || this._throttle('shoot', 35)) return;
    this.ensureContext();
    const cfg = SHOOT_TIMBRES[kind] || SHOOT_TIMBRES.kunai;
    this._sfxVoice({
      type: cfg.type, f0: cfg.f0, f1: cfg.f1, dur: cfg.dur, level: cfg.level,
      pan: this._panFor(worldX),
    });
  }

  playDash() {
    if (!this.enabled || this._throttle('dash', 150)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'sine', f0: 340, f1: 80, dur: 0.18, level: 0.35, attack: 0.006 });
  }

  playHit(worldX = null) {
    if (!this.enabled || this._throttle('hit', 50)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'square', f0: 220, f1: 60, dur: 0.05, level: 0.18, pan: this._panFor(worldX) });
  }

  // 拾取經驗寶石：支援連續吸寶時階梯式音調上揚 (Combo Pitch Ramp)
  playGem(worldX = null) {
    if (!this.enabled || this._throttle('gem', 40)) return;
    this.ensureContext();
    const now = performance.now();
    if (now - this._lastGemTime < 1200) {
      this._gemCombo = Math.min(12, this._gemCombo + 1);
    } else {
      this._gemCombo = 0;
    }
    this._lastGemTime = now;

    // 基礎音符池
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    const baseF = freqs[Math.floor(Math.random() * freqs.length)];
    // 連擊音高乘數 (1.0 ~ 1.55)
    const comboMult = 1 + this._gemCombo * 0.045;
    const f = baseF * comboMult;

    this._sfxVoice({
      type: 'sine', f0: f, f1: f * 1.5, dur: 0.09, level: 0.2,
      pan: this._panFor(worldX), jitter: 0.02,
    });
  }

  // 金幣拾取音效 (清脆雙音琶音)
  playCoin(worldX = null) {
    if (!this.enabled || this._throttle('coin', 40)) return;
    this.playSfx('coin', { worldX, gain: 0.85 });
  }

  // 回血拾取音效 (溫潤上揚琶音)
  playHeal() {
    if (!this.enabled || this._throttle('heal', 100)) return;
    this.playSfx('heal', { gain: 0.8 });
  }

  // 道具/能力強化拾取 (Powerup)
  playPowerup() {
    if (!this.enabled || this._throttle('powerup', 100)) return;
    this.playSfx('powerup', { gain: 0.8 });
  }

  // 拾取道具箱 / 背包耗材
  playPickup() {
    if (!this.enabled || this._throttle('pickup', 60)) return;
    this.playSfx('pickup', { gain: 0.8 });
  }

  // UI 點擊音效
  playClick() {
    if (!this.enabled || this._throttle('click', 30)) return;
    this.playSfx('click', { gain: 0.7 });
  }

  // 選取音效
  playSelect() {
    if (!this.enabled || this._throttle('select', 30)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'triangle', f0: 660, f1: 990, dur: 0.1, level: 0.16, jitter: 0 });
  }

  // 錯誤 / 金幣不足警示音 (低音下沉拒絕聲)
  playError() {
    if (!this.enabled || this._throttle('error', 120)) return;
    this.playSfx('error', { gain: 0.85 });
  }

  // 首領降臨 / 警報音效 (顫音警報)
  playAlarm() {
    if (!this.enabled || this._throttle('alarm', 300)) return;
    this.playSfx('alarm', { gain: 0.9 });
  }

  // 忍者龍劍傳風格過場音效：首領登場強烈重音與緊張減和弦琶音
  playBossCinematicSting() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    // 震撼低音打擊
    this._sfxVoice({ type: 'sawtooth', f0: 95, f1: 28, dur: 0.65, level: 0.55, attack: 0.005 });
    this._noiseVoice(t, 0.45, 0.38, 'lowpass', 1500, null, 0, 0.25);
    // 8-bit NES 緊張感三連音琶音 (連續快速上升)
    const notes = [164.81, 196.00, 246.94, 311.13, 392.00, 493.88];
    notes.forEach((f, i) => {
      setTimeout(() => {
        if (!this.enabled || !this.ctx) return;
        this._sfxVoice({ type: 'square', f0: f, f1: f * 0.99, dur: 0.12, level: 0.22, attack: 0.003, jitter: 0.04 });
      }, i * 42);
    });
  }

  // 刀劍橫切 / 眼神特寫掠過音效
  playSwordSlash() {
    if (!this.enabled || this._throttle('slash', 60)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'sawtooth', f0: 1100, f1: 180, dur: 0.16, level: 0.35, attack: 0.002, jitter: 0.08 });
    this._noiseVoice(this.ctx.currentTime, 0.12, 0.25, 'bandpass', 2800, null, 0, 0.12);
  }

  // 電影字卡打字音
  playTextBleep() {
    if (!this.enabled || this._throttle('bleep', 50)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'square', f0: 880, f1: 820, dur: 0.025, level: 0.07, attack: 0.001 });
  }

  // 關卡勝利號角 (大調輝煌終曲)
  playWin() {
    if (!this.enabled) return;
    this.playSfx('win', { gain: 0.9 });
  }

  // 護盾吸收 / 充能
  playShield() {
    if (!this.enabled || this._throttle('shield', 80)) return;
    this.playSfx('shield', { gain: 0.8 });
  }

  // 爆炸音效 (低頻衝擊波 + 噪音層)
  playExplosion(worldX = null) {
    if (!this.enabled || this._throttle('explosion', 90)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const pan = this._panFor(worldX);
    this._sfxVoice({
      type: 'sawtooth', f0: 140, f1: 30, dur: 0.35, level: 0.4,
      attack: 0.003, pan, jitter: 0.10,
    });
    this._noiseVoice(t, 0.25, 0.25, 'lowpass', 3200, null, pan, Math.random() * 0.3);
  }

  // 雷擊電弧
  playLightning() {
    if (!this.enabled || this._throttle('lightning', 60)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'sawtooth', f0: 800, f1: 120, dur: 0.15, level: 0.3, attack: 0.003, jitter: 0.12 });
  }

  // 升級音效 (大三和弦號角)
  playLevelUp() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      this._sfxVoice({ type: 'triangle', f0: freq, dur: 0.25, level: 0.25, at: t + idx * 0.08, jitter: 0 });
    });
  }

  // 超武進化開箱音效 (華麗史詩大和弦)
  playEvoFanfare() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chords.forEach((freq, idx) => {
      this._sfxVoice({ type: 'sine', f0: freq, dur: 0.6, level: 0.3, at: t + idx * 0.05, jitter: 0 });
    });
  }

  // 玩家受傷
  playHurt() {
    if (!this.enabled || this._throttle('hurt', 150)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'sawtooth', f0: 160, f1: 80, dur: 0.12, level: 0.35, attack: 0.003, jitter: 0.08 });
  }

  // 遊戲結束
  playGameOver() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const freqs = [330, 311, 293, 277];
    freqs.forEach((f, idx) => {
      this._sfxVoice({ type: 'sawtooth', f0: f, dur: 0.25, level: 0.25, at: t + idx * 0.16, jitter: 0 });
    });
  }

  // ── BGM 合成工具 ─────────────────────────────────────────────
  _bgmTone(t, freq, type, dur, level, glideTo = null, attack = 0.004, release = null, vib = null, dest = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (this._periodicWaves && this._periodicWaves[type]) {
      osc.setPeriodicWave(this._periodicWaves[type]);
    } else {
      osc.type = (type === 'pulse12' || type === 'pulse25' || type === 'pulse75') ? 'square' : (type || 'triangle');
    }

    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
    if (release === null) {
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    } else {
      gain.gain.setValueAtTime(level, t + Math.max(attack, dur - release));
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    }

    // 晶片風格主奏長音顫音 (Chiptune Pitch Vibrato)
    if (vib && vib.depth > 0) {
      try {
        const vStart = t + (vib.delay || 0.08);
        if (vStart < t + dur) {
          const vOsc = this.ctx.createOscillator();
          const vGain = this.ctx.createGain();
          vOsc.frequency.setValueAtTime(vib.rate || 6, vStart);
          vGain.gain.setValueAtTime(0, vStart);
          vGain.gain.linearRampToValueAtTime(freq * vib.depth, Math.min(t + dur, vStart + 0.08));
          vOsc.connect(vGain);
          vGain.connect(osc.frequency);
          vOsc.start(vStart);
          vOsc.stop(t + dur + 0.02);
          vOsc.onended = () => {
            try { vOsc.disconnect(); vGain.disconnect(); } catch (e) {}
          };
        }
      } catch (e) {}
    }

    osc.connect(gain);
    gain.connect(dest || this.bgmGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) { /* ignore */ }
    };
    return osc;
  }

  // 用 BGM_VOICES 的樂器演奏一個音；名字不在表裡就退回單一原生波形（晶片風的 pulse25 等）
  _bgmVoice(t, freq, voice, dur, level, vib = null) {
    const v = BGM_VOICES[voice];
    if (!v) return this._bgmTone(t, freq, voice, dur, level, null, 0.004, null, vib);
    let input = this.bgmGain;
    let filter = null;
    let shaper = null;
    if (v.filter) {
      const [type, f, q, envFrom, envTime] = v.filter;
      filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(envFrom || f, t);
      if (envFrom) filter.frequency.exponentialRampToValueAtTime(f, t + Math.min(dur, envTime));
      filter.connect(this.bgmGain);
      input = filter;
    }
    if (v.drive) {
      shaper = this.ctx.createWaveShaper();
      shaper.curve = driveCurve(v.drive);
      shaper.connect(input);
      input = shaper;
    }
    const attack = v.attack || 0.004;
    const release = v.sustain ? Math.min(0.12, dur * 0.4) : null;
    let last = null;
    for (const [type, mul, cents, gain] of v.layers) {
      const f = freq * mul * Math.pow(2, cents / 1200);
      if (f > 6000) continue;
      last = this._bgmTone(t, f, type, dur, level * gain, null, attack, release, vib || v.vib || null, input);
    }
    if (last && (filter || shaper)) {
      last.addEventListener('ended', () => {
        try { if (shaper) shaper.disconnect(); if (filter) filter.disconnect(); } catch (e) { /* ignore */ }
      });
    }
    return last;
  }

  _bgmNoise(t, dur, level, filterType = 'highpass', filterFreq = 6000) {
    return this._noiseVoice(t, dur, level, filterType, filterFreq, this.bgmGain, 0, Math.random() * 0.4);
  }

  _bgmKick(t, level = 0.55, kit = BGM_KITS.electro) {
    // 大鼓：起始頻率疾速下潛（電子鼓 220→38Hz；太鼓 105→48Hz 長尾）
    const [f0, f1, dur] = kit.kick;
    this._bgmTone(t, f0, 'sine', dur, level, f1, 0.002);
  }

  _bgmClap(t, level = 0.13, kit = BGM_KITS.electro) {
    const [freq, dur, body, bodyWave] = kit.snare;
    this._bgmNoise(t, dur, level, 'bandpass', freq);
    if (body) this._bgmTone(t, body, bodyWave || 'triangle', dur * 0.8, level * 0.9, body * 0.7, 0.002);   // 鼓身
  }

  _bgmHat(t, open = false, level = 0.05, at = null, kit = BGM_KITS.electro) {
    const st = at === null ? t : at;
    this._bgmNoise(st, open ? 0.10 : 0.03, open ? level * 0.85 : level, 'highpass', kit.hat);
  }

  _bgmCrash(t, level = 0.09) {
    this._bgmNoise(t, 0.65, level, 'lowpass', 6500);
  }

  _bgmPad(t, dur, root, mode, cfg) {
    const offsets = mode === 'maj' ? [0, 4, 7] : [0, 3, 7];
    for (const semi of offsets) {
      if (cfg.voice) this._bgmVoice(t, root * Math.pow(2, semi / 12), cfg.voice, dur, cfg.level / 3);
      else this._bgmTone(t, root * Math.pow(2, semi / 12), 'triangle', dur, cfg.level / 3, null, 0.5, 0.6);
    }
    if (cfg.spread) {
      this._bgmTone(t, root * 2, 'triangle', dur, cfg.level / 6, null, 0.5, 0.6);
    }
    if (this.intensity > 0.7) {
      this._bgmTone(t, root * 4, 'sine', dur, cfg.level / 5, null, 0.8, 0.7);
    }
    if (this._bgmDrone) {
      this._bgmTone(t, root * 4 * 1.004, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
      this._bgmTone(t, root * 4 * 0.996, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
    }
  }

  // ── 動態 BGM 播放與切換 ──────────────────────────────────────
  startBGM(levelId = 'street') {
    if (this._schedTimer) {
      if (this._activeLevelId === levelId && !this._isBossBGM) return;
      this.stopBGM();
    }
    this.bgmMuted = false;
    this.ensureContext();
    if (!this.ctx) return;

    this._activeLevelId = levelId;
    this._isBossBGM = (levelId === 'boss');
    const theme = BGM_THEMES[levelId] || BGM_THEMES.street;
    this._bgmTheme = theme;
    this.bgmStep = 0;
    this._bgmLastLead = 0;
    this._bgmLastStep = -1;
    this._arpIdx = 0;
    this._bgmDrone = !!theme.drone;
    this._bgmStepTime = (60 / theme.bpm) / 2;
    this.intensity = 0;
    this._applyGains();

    this._nextStepTime = this.ctx.currentTime + 0.08;
    this._schedTimer = setInterval(() => this._schedulerTick(), SCHEDULER_MS);
    this._schedulerTick();
  }

  // 首領降臨：動態切換到熱血首領 BGM
  switchToBossTheme() {
    if (this._isBossBGM) return;
    const bossTheme = BGM_THEMES.boss || BGM_THEMES.core;
    this._bgmTheme = bossTheme;
    this._bgmStepTime = (60 / bossTheme.bpm) / 2;
    this._isBossBGM = true;
    this.setIntensity(1.0);
  }

  // 首領討伐成功：平滑切回關卡原 BGM
  restoreLevelTheme() {
    if (!this._isBossBGM) return;
    const theme = BGM_THEMES[this._activeLevelId] || BGM_THEMES.street;
    this._bgmTheme = theme;
    this._bgmStepTime = (60 / theme.bpm) / 2;
    this._isBossBGM = false;
    this.setIntensity(0.2);
  }

  _schedulerTick() {
    if (!this.ctx || !this.enabled || this._offline) return;
    const until = this.ctx.currentTime + SCHEDULE_AHEAD;
    let guard = 0;
    while (this._nextStepTime < until && guard < 64) {
      this._bgmStep(this._nextStepTime);
      this._nextStepTime += this._bgmStepTime;
      guard++;
    }
    if (guard >= 64) this._nextStepTime = until;
  }

  _resyncBGM() {
    if (!this.ctx || !this._schedTimer) return;
    this._nextStepTime = Math.max(this._nextStepTime, this.ctx.currentTime + 0.08);
  }

  _bgmStep(t = null) {
    if (!this.enabled || !this.ctx) return;
    const now = t === null ? this.ctx.currentTime : t;
    const theme = this._bgmTheme || BGM_THEMES.street;
    const bassNotes = theme.bass;
    const stepTime = this._bgmStepTime;
    const stepInBar = this.bgmStep % 8;
    const barIdx = Math.floor(this.bgmStep / 8);
    const chordRoot = theme.chords[barIdx % theme.chords.length];
    const padCfg = theme.pad || { level: 0.045, detune: 4, spread: false };
    const leadCfg = theme.lead || { density: 0.25, octave: 2, wave: 'square', level: 0.045, dur: 0.15 };
    const kickSteps = Array.isArray(theme.kick) ? theme.kick : theme.kick === 'floor' ? [0, 2, 4, 6] : [0, 4];
    const kit = BGM_KITS[theme.kit] || BGM_KITS.electro;
    // 音階：主題可以指定（五聲、弗里吉亞屬音、和聲小調…），即興填音與琶音都從這裡挑
    const scale = theme.scale || (theme.mode === 'maj' ? [0, 2, 4, 7, 9, 12] : [0, 3, 5, 7, 10, 12]);
    const leadPool = [0, 0, 0, ...scale, ...scale.filter((x) => x === 7 || x === 12)];

    this.intensity += (this._intensityTarget - this.intensity) * 0.12;
    const it = this.intensity;
    const phraseBar = barIdx % 8;

    // 1. 鼓組 (節拍律動與過門 Drum Fills)
    if (kickSteps.includes(stepInBar)) this._bgmKick(now, theme.kickLevel || 0.55, kit);
    if (theme.clap.includes(stepInBar)) this._bgmClap(now, theme.clapLevel || 0.13, kit);
    if (theme.hat === 'eighth') {
      if (stepInBar % 2 === 1) this._bgmHat(now, stepInBar === 7, 0.055, null, kit);
    } else if (theme.hat === 'sixteenth') {
      this._bgmHat(now, stepInBar === 7, 0.045, null, kit);
      this._bgmHat(now, false, 0.025, now + stepTime * 0.5, kit);
    } else if (theme.hat === 'sparse' && (stepInBar === 2 || stepInBar === 6)) {
      this._bgmHat(now, false, 0.035, null, kit);
    }
    if (theme.ghost && it > 0.2 && stepInBar % 2 === 0) {
      this._bgmHat(now, false, 0.02 + it * 0.012, now + stepTime * 0.5, kit);
    }
    if (phraseBar === 7 && stepInBar >= 5 && stepInBar <= 7) {
      // 樂句尾的過門：行進鼓組用小鼓滾奏，其餘用 hat
      if (theme.kit === 'march' || theme.kit === 'taiko') this._bgmClap(now + stepTime * 0.5, 0.08 + it * 0.04, kit);
      else this._bgmHat(now, false, 0.03 + it * 0.02, now + stepTime * 0.5, kit);
    }
    if (barIdx > 0 && phraseBar === 0 && stepInBar === 0) this._bgmCrash(now, 0.09 + it * 0.05);
    if (it > 0.6 && phraseBar === 4 && stepInBar === 0) this._bgmCrash(now, 0.05);

    // 2. Bass 脈衝 (和弦根音即時動態對齊，杜絕離調衝突)
    let bassFreq = bassNotes ? bassNotes[this.bgmStep % bassNotes.length] : 110;
    if (theme.bassGroove) {
      const g = theme.bassGroove[stepInBar % theme.bassGroove.length];
      if (g !== null && Number.isFinite(g)) {
        bassFreq = chordRoot * Math.pow(2, g / 12) * (theme.bassMul || 1);
      }
    }
    this._bgmVoice(now, bassFreq, theme.bassWave || 'triangle', stepTime * 0.85, theme.bassLevel || 0.15);

    // 3. 和弦 pad (立體聲包圍氛圍層)
    if (stepInBar === 0) this._bgmPad(now, stepTime * 8, chordRoot, theme.mode, padCfg);

    // 4. 高張力琶音層 (16分音符快速跑動)
    if (theme.arp && it > 0.45 && stepInBar % 2 === 1) {
      const tones = theme.arpTones || (theme.mode === 'maj' ? [0, 4, 7, 12] : [0, 3, 7, 12]);
      const semi = tones[this._arpIdx % tones.length];
      this._arpIdx++;
      const freq = chordRoot * Math.pow(2, semi / 12) * 8;
      if (freq <= 5000) {
        this._bgmVoice(now, freq, theme.arp.wave || 'triangle', stepTime * 0.9,
          theme.arp.level * (0.4 + it * 0.9));
      }
    }

    // 5. Lead 主奏旋律 (結構化主題樂句 + 即興有機填音 + 虛擬回音)
    const melodyPhrase = theme.melody;
    if (barIdx >= 1) {
      let playedNote = false;
      const mBar = barIdx % (melodyPhrase ? melodyPhrase.length : 8);
      const isAltSection = Math.floor(barIdx / 8) % 2 === 1 && theme.melodyB;
      const activeMelody = isAltSection ? theme.melodyB : melodyPhrase;

      if (activeMelody && activeMelody[mBar]) {
        const noteDef = activeMelody[mBar][stepInBar];
        if (noteDef !== null && noteDef !== undefined) {
          const semi = typeof noteDef === 'object' ? noteDef.semi : noteDef;
          const dur = (typeof noteDef === 'object' && noteDef.dur) || leadCfg.dur || 0.16;
          const keyRoot = theme.keyRoot || theme.chords[0] || 110;
          const freq = keyRoot * Math.pow(2, semi / 12) * Math.pow(2, leadCfg.octave || 2);
          if (freq > 20 && freq <= 4000) {
            const vib = dur > 0.2 ? { depth: 0.02, rate: 7, delay: 0.08 } : null;
            this._bgmVoice(now, freq, leadCfg.wave, dur, leadCfg.level * (0.85 + it * 0.3), vib);
            playedNote = true;
            this._bgmLastLead = semi;

            // 晶片音樂虛擬回音 (Tracker Pseudo-Echo)
            if (theme.echo !== false && it > 0.25 && stepInBar + 2 < 8) {
              const echoTime = now + stepTime * 2;
              this._bgmVoice(echoTime, freq, leadCfg.wave, dur * 0.65, leadCfg.level * 0.22);
            }
          }
        }
      }

      // 若旋律槽位無指定音符，依張力機率有機填音 (Improvisational accents)
      if (!playedNote) {
        const leadChance = leadCfg.density * (0.6 + it * 0.5);
        if (Math.random() < leadChance && !(stepInBar === 0 && this._bgmLastStep >= 6)) {
          let semi = leadPool[Math.floor(Math.random() * leadPool.length)];
          if (this._bgmLastLead > 0 && Math.abs(this._bgmLastLead - semi) < 2 && Math.random() < 0.7) {
            semi = leadPool[Math.floor(Math.random() * leadPool.length)];
          }
          const freq = chordRoot * Math.pow(2, semi / 12) * Math.pow(2, leadCfg.octave);
          if (freq <= 4000) {
            this._bgmVoice(now, freq, leadCfg.wave, leadCfg.dur, leadCfg.level);
            this._bgmLastLead = semi;
          }
        }
      }
    }
    this._bgmLastStep = stepInBar;
    this.bgmStep++;
  }

  stopBGM() {
    if (this._schedTimer) {
      clearInterval(this._schedTimer);
      this._schedTimer = null;
    }
  }
}

export const sound = new SoundEngine();
