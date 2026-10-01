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
//   7. 豐富音樂主題 (BGM)：支援 street, lab, frost, core, endless，並新增 boss (首領戰高張力主題)、
//      menu (營地/主選單舒緩 groove) 與 td (塔防戰術律動)。支援 首領戰動態切換 (switchToBossTheme)。

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
    bpm: 128,
    bass: [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83],
    mode: 'maj',
    chords: [110, 87.31, 130.81, 87.31, 110, 87.31, 98, 130.81],   // A F C F | A F G C
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.045, dur: 0.16 },
    arp: { wave: 'triangle', level: 0.032 },
    pad: { level: 0.05, detune: 4, spread: false },
  },
  lab: {
    bpm: 118,
    bass: [87.31, 87.31, 98, 110, 87.31, 87.31, 123.47, 110],
    mode: 'min',
    chords: [87.31, 73.42, 65.41, 73.42, 87.31, 65.41, 73.42, 65.41],
    kick: 'half',
    clap: [],
    hat: 'sparse',
    drone: true,
    lead: { density: 0.16, octave: 1, wave: 'sine', level: 0.04, dur: 0.3 },
    arp: { wave: 'sine', level: 0.026 },
    pad: { level: 0.05, detune: 10, spread: false },
  },
  frost: {
    bpm: 124,
    bass: [98, 98, 123.47, 146.83, 98, 98, 130.81, 123.47],
    mode: 'min',
    chords: [196, 174.61, 146.83, 196, 174.61, 196, 146.83, 174.61],
    kick: 'half',
    clap: [],
    hat: 'sparse',
    lead: { density: 0.2, octave: 2, wave: 'sine', level: 0.05, dur: 0.45 },
    arp: { wave: 'sine', level: 0.028 },
    pad: { level: 0.045, detune: 6, spread: true },
  },
  core: {
    bpm: 142,
    bass: [65.41, 65.41, 73.42, 98, 65.41, 65.41, 82.41, 73.42],
    mode: 'min',
    chords: [65.41, 65.41, 55, 49, 65.41, 55, 49, 55],
    kick: 'floor',
    kickLevel: 0.62,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.34, octave: 2, wave: 'square', level: 0.05, dur: 0.13 },
    arp: { wave: 'square', level: 0.028 },
    pad: { level: 0.05, detune: 7, spread: false },
  },
  endless: {
    bpm: 138,
    bass: [73.42, 73.42, 87.31, 110, 73.42, 73.42, 98, 87.31],
    mode: 'maj',
    chords: [73.42, 73.42, 87.31, 98, 73.42, 98, 87.31, 110],
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.05, dur: 0.15 },
    arp: { wave: 'triangle', level: 0.032 },
    pad: { level: 0.05, detune: 5, spread: false },
  },
  // ── 新增 BGM 主題 ───────────────────────────────────────────
  boss: {
    bpm: 168,
    bass: [65.41, 65.41, 69.30, 77.78, 65.41, 65.41, 87.31, 82.41],
    mode: 'min',
    chords: [65.41, 69.30, 87.31, 82.41, 65.41, 69.30, 77.78, 61.74],
    kick: 'floor',
    kickLevel: 0.68,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.42, octave: 2, wave: 'square', level: 0.055, dur: 0.12 },
    arp: { wave: 'sawtooth', level: 0.035 },
    pad: { level: 0.055, detune: 8, spread: true },
  },
  menu: {
    bpm: 104,
    bass: [110, 110, 130.81, 146.83, 110, 110, 146.83, 130.81],
    mode: 'maj',
    chords: [110, 130.81, 146.83, 130.81, 110, 130.81, 146.83, 164.81],
    kick: 'half',
    clap: [4],
    hat: 'sparse',
    lead: { density: 0.22, octave: 2, wave: 'triangle', level: 0.038, dur: 0.20 },
    arp: { wave: 'sine', level: 0.024 },
    pad: { level: 0.04, detune: 3, spread: true },
  },
  td: {
    bpm: 132,
    bass: [98, 98, 116.54, 130.81, 98, 98, 146.83, 130.81],
    mode: 'min',
    chords: [98, 116.54, 130.81, 116.54, 98, 116.54, 146.83, 130.81],
    kick: 'floor',
    kickLevel: 0.58,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,
    lead: { density: 0.32, octave: 2, wave: 'square', level: 0.048, dur: 0.14 },
    arp: { wave: 'triangle', level: 0.030 },
    pad: { level: 0.045, detune: 5, spread: false },
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

const SCHEDULE_AHEAD = 0.25;
const SCHEDULER_MS = 50;

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
  }

  _throttle(name, gapMs) {
    const now = performance.now();
    if (now - (this._lastSfx[name] || -Infinity) < gapMs) return true;
    this._lastSfx[name] = now;
    return false;
  }

  _applyGains() {
    if (!this.ctx) return;
    if (this.sfxGain) this.sfxGain.gain.value = this.enabled ? 0.12 * this.sfxVol : 0;
    if (this.bgmGain) this.bgmGain.gain.value = this.enabled && !this.bgmMuted ? 0.3 * this.bgmVol : 0;
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

    // 兩條匯流排 → 限幅器 → 輸出
    this.master = this.ctx.createDynamicsCompressor();
    this.master.threshold.value = -8;
    this.master.knee.value = 5;
    this.master.ratio.value = 12;
    this.master.attack.value = 0.003;
    this.master.release.value = 0.18;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.12 * this.sfxVol;
    this.sfxGain.connect(this.master);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.3 * this.bgmVol;
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
  _bgmTone(t, freq, type, dur, level, glideTo = null, attack = 0.004, release = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
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
    osc.connect(gain);
    gain.connect(this.bgmGain);
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

  _bgmNoise(t, dur, level, filterType = 'highpass', filterFreq = 6000) {
    return this._noiseVoice(t, dur, level, filterType, filterFreq, this.bgmGain, 0, Math.random() * 0.4);
  }

  _bgmKick(t, level = 0.55) {
    this._bgmTone(t, 150, 'sine', 0.1, level, 44);
  }

  _bgmClap(t, level = 0.13) {
    this._bgmNoise(t, 0.12, level, 'bandpass', 1700);
  }

  _bgmHat(t, open = false, level = 0.05, at = null) {
    const st = at === null ? t : at;
    this._bgmNoise(st, open ? 0.11 : 0.035, open ? level * 0.85 : level, 'highpass', 7200);
  }

  _bgmCrash(t, level = 0.09) {
    this._bgmNoise(t, 0.65, level, 'lowpass', 6500);
  }

  _bgmPad(t, dur, root, mode, cfg) {
    const offsets = mode === 'maj' ? [0, 4, 7] : [0, 3, 7];
    for (const semi of offsets) {
      this._bgmTone(t, root * Math.pow(2, semi / 12), 'triangle', dur, cfg.level / 3, null, 0.5, 0.6);
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
    const kickSteps = theme.kick === 'floor' ? [0, 2, 4, 6] : [0, 4];
    const leadPool = theme.mode === 'maj'
      ? [0, 0, 0, 2, 4, 4, 7, 7, 7, 7, 9, 12, 12, 12]
      : [0, 0, 0, 3, 5, 5, 7, 7, 7, 7, 10, 12, 12, 12];

    this.intensity += (this._intensityTarget - this.intensity) * 0.12;
    const it = this.intensity;
    const phraseBar = barIdx % 8;

    // 1. 鼓組
    if (kickSteps.includes(stepInBar)) this._bgmKick(now, theme.kickLevel || 0.55);
    if (theme.clap.includes(stepInBar)) this._bgmClap(now);
    if (theme.hat === 'eighth') {
      if (stepInBar % 2 === 1) this._bgmHat(now, stepInBar === 7, 0.055);
    } else if (theme.hat === 'sparse' && (stepInBar === 2 || stepInBar === 6)) {
      this._bgmHat(now, false, 0.035);
    }
    if (theme.ghost && it > 0.2 && stepInBar % 2 === 0) {
      this._bgmHat(now, false, 0.02 + it * 0.012, now + stepTime * 0.5);
    }
    if (phraseBar === 7 && stepInBar >= 5 && stepInBar <= 7) {
      this._bgmHat(now, false, 0.03 + it * 0.02, now + stepTime * 0.5);
    }
    if (barIdx > 0 && phraseBar === 0 && stepInBar === 0) this._bgmCrash(now, 0.09 + it * 0.05);
    if (it > 0.6 && phraseBar === 4 && stepInBar === 0) this._bgmCrash(now, 0.05);

    // 2. Bass 脈衝
    this._bgmTone(now, bassNotes[this.bgmStep % bassNotes.length], 'triangle', stepTime * 0.85, 0.15);

    // 3. 和弦 pad
    if (stepInBar === 0) this._bgmPad(now, stepTime * 8, chordRoot, theme.mode, padCfg);

    // 4. 高張力琶音層
    if (theme.arp && it > 0.45 && stepInBar % 2 === 1) {
      const tones = theme.mode === 'maj' ? [0, 4, 7, 12] : [0, 3, 7, 12];
      const semi = tones[this._arpIdx % tones.length];
      this._arpIdx++;
      const freq = chordRoot * Math.pow(2, semi / 12) * 8;
      if (freq <= 5000) {
        this._bgmTone(now, freq, theme.arp.wave || 'triangle', stepTime * 0.9,
          theme.arp.level * (0.4 + it * 0.9), null, 0.006);
      }
    }

    // 5. Lead 旋律
    const leadChance = leadCfg.density * (0.75 + it * 0.6);
    if (barIdx >= 1 && Math.random() < leadChance && !(stepInBar === 0 && this._bgmLastStep >= 6)) {
      let semi = leadPool[Math.floor(Math.random() * leadPool.length)];
      if (this._bgmLastLead > 0 && Math.abs(this._bgmLastLead - semi) < 2 && Math.random() < 0.7) {
        semi = leadPool[Math.floor(Math.random() * leadPool.length)];
      }
      const freq = chordRoot * Math.pow(2, semi / 12) * Math.pow(2, leadCfg.octave);
      if (freq <= 4000) {
        this._bgmTone(now, freq, leadCfg.wave, leadCfg.dur, leadCfg.level);
        this._bgmLastLead = semi;
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
