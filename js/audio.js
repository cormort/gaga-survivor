// Web Audio API 即時程序化音效與背景音樂合成引擎 (零外掛依賴)

// 各關卡的 BGM 主題 (速度 + 資料化分層：bass 音階 / 和弦進行 / 鼓組樣式 / lead 密度)
// 關卡 id 沒對到就回 street 預設
const BGM_THEMES = {
  street: {
    bpm: 128,
    bass: [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83],
    mode: 'maj',                              // 和弦性質 (三度)
    chords: [110, 87.31, 130.81, 87.31],      // 每小節根音進行 (A F C F，活潑流行感)
    kick: 'floor',                            // 4-on-floor
    clap: [2, 6],                             // backbeat 拍手
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.045, dur: 0.16 },
    pad: { level: 0.05, detune: 4, spread: false },
  },
  lab: {
    bpm: 118,
    bass: [87.31, 87.31, 98, 110, 87.31, 87.31, 123.47, 110],
    mode: 'min',
    chords: [87.31, 73.42, 65.41, 73.42],     // Fm Dm Cm Dm，陰沉下行
    kick: 'half',                             // 半拍感 (只有 1 & 3)
    clap: [],
    hat: 'sparse',
    drone: true,                              // 高八度微失諧長音 (實驗室不安感)
    lead: { density: 0.16, octave: 1, wave: 'sine', level: 0.04, dur: 0.3 },
    pad: { level: 0.05, detune: 10, spread: false },
  },
  frost: {
    bpm: 124,
    bass: [98, 98, 123.47, 146.83, 98, 98, 130.81, 123.47],
    mode: 'min',
    chords: [196, 174.61, 146.83, 196],       // 高音區 G F D G，空靈
    kick: 'half',
    clap: [],
    hat: 'sparse',
    lead: { density: 0.2, octave: 2, wave: 'sine', level: 0.05, dur: 0.45 }, // 長尾鈴聲
    pad: { level: 0.045, detune: 6, spread: true },                         // 加 12 度的寬廣 pad
  },
  core: {
    bpm: 142,
    bass: [65.41, 65.41, 73.42, 98, 65.41, 65.41, 82.41, 73.42],
    mode: 'min',
    chords: [65.41, 65.41, 55, 49],           // C C A G 低音重壓
    kick: 'floor',
    kickLevel: 0.62,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,                              // 16 分 ghost hat 推進感
    lead: { density: 0.34, octave: 2, wave: 'square', level: 0.05, dur: 0.13 },
    pad: { level: 0.05, detune: 7, spread: false },
  },
  endless: {
    bpm: 138,
    bass: [73.42, 73.42, 87.31, 110, 73.42, 73.42, 98, 87.31],
    mode: 'maj',
    chords: [73.42, 73.42, 87.31, 98],        // D D F G 揚升感
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.05, dur: 0.15 },
    pad: { level: 0.05, detune: 5, spread: false },
  },
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmInterval = null;
    this.bgmStep = 0;
    this.bgmMuted = false;   // 暫停時 BGM 靜音 (音效開關獨立)
    this.sfxVol = 1;         // 使用者音量 (0~1，主選單滑桿)
    this.bgmVol = 0.8;
    this._lastSfx = {};      // 各音效最近播放時間 (節流用)
  }

  // 同一音效在 gapMs 內只播第一次；尾聲大量同時命中時避免破音與 CPU 暴衝
  _throttle(name, gapMs) {
    const now = performance.now();
    if (now - (this._lastSfx[name] || -Infinity) < gapMs) return true;
    this._lastSfx[name] = now;
    return false;
  }

  // 把「開關 × 音量 × 暫停靜音」一次算成實際 gain；任何一項改變都走這裡
  _applyGains() {
    if (!this.ctx) return;
    if (this.sfxGain) this.sfxGain.gain.value = this.enabled ? 0.25 * this.sfxVol : 0;
    if (this.bgmGain) this.bgmGain.gain.value = this.enabled && !this.bgmMuted ? 0.12 * this.bgmVol : 0;
  }

  setVolumes(sfxVol, bgmVol) {
    this.sfxVol = Math.max(0, Math.min(1, +sfxVol || 0));
    this.bgmVol = Math.max(0, Math.min(1, +bgmVol || 0));
    this._applyGains();
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.25 * this.sfxVol;
    this.sfxGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12 * this.bgmVol;
    this.bgmGain.connect(this.ctx.destination);
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    this._applyGains();
    return this.enabled;
  }

  // 暫停/恢復 BGM (遊戲內暫停鍵用；與音效總開關互不干擾)
  pauseBGM() {
    this.bgmMuted = true;
    this._applyGains();
  }

  resumeBGM() {
    this.bgmMuted = false;
    this._applyGains();
  }

  // 射擊音效 (苦無、飛刀)
  playShoot() {
    if (!this.enabled || this._throttle('shoot', 35)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  // 戰術閃避翻滾音效 (呼嘯氣流聲)
  playDash() {
    if (!this.enabled || this._throttle('dash', 150)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  // 擊中怪物
  playHit() {
    if (!this.enabled || this._throttle('hit', 50)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  // 拾取經驗寶石 (清脆晶瑩水晶音)
  playGem() {
    if (!this.enabled || this._throttle('gem', 40)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freqs = [523.25, 659.25, 783.99, 1046.50];
    const f = freqs[Math.floor(Math.random() * freqs.length)];

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.09);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 爆炸音效 (火箭、地雷、手榴彈)
  playExplosion() {
    if (!this.enabled || this._throttle('explosion', 90)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;

    // 低頻衝擊波
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.35);

    // 噪聲層
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    noise.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    noise.start(t);
  }

  // 雷擊電弧
  playLightning() {
    if (!this.enabled || this._throttle('lightning', 60)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.15);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  // 升級音效 (大三和弦號角)
  playLevelUp() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A - C# - E - A

    notes.forEach((freq, idx) => {
      const start = t + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.005, start + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  // 超武進化開箱音效 (華麗史詩大和弦)
  playEvoFanfare() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C Major Spread

    chords.forEach((freq, idx) => {
      const start = t + idx * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.6);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  // 玩家受傷
  playHurt() {
    if (!this.enabled || this._throttle('hurt', 150)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.12);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 遊戲結束
  playGameOver() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const freqs = [330, 311, 293, 277];

    freqs.forEach((f, idx) => {
      const start = t + idx * 0.16;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.25);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  // ── BGM 合成小工具 (全部餵 bgmGain，受主開關 × 音量 × 暫停靜音統一控管) ──
  _bgmTone(t, freq, type, dur, level, glideTo = null, attack = 0.004, release = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
    if (release === null) {
      // 預設：attack 後自然指數衰減到尾 (短音/打擊)
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    } else {
      // 指定 release：attack 後保持音量，小節尾才淡出 (pad/長音用)
      gain.gain.setValueAtTime(level, t + Math.max(attack, dur - release));
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    }
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 白噪音 (快取同一份 buffer，各鼓件重複用)
  _bgmNoise(t, dur, level, filterType = 'highpass', filterFreq = 6000) {
    if (!this._noiseBuf) {
      const len = Math.max(1, Math.ceil(this.ctx.sampleRate * 0.3));
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(t);
    src.stop(t + dur + 0.02);
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

  // 小節起始的和弦 pad：mode maj/min 三度 + 可選 wide (多一顆高八度)
  _bgmPad(t, dur, root, mode, cfg) {
    const offsets = mode === 'maj' ? [0, 4, 7] : [0, 3, 7];
    for (const semi of offsets) {
      this._bgmTone(t, root * Math.pow(2, semi / 12), 'triangle', dur, cfg.level / 3, null, 0.5, 0.6);
    }
    if (cfg.spread) {
      this._bgmTone(t, root * 2, 'triangle', dur, cfg.level / 6, null, 0.5, 0.6);
    }
    // 高八度微失諧長音 (實驗室專用，拍頻製造不安感)
    if (this._bgmDrone) {
      this._bgmTone(t, root * 4 * 1.004, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
      this._bgmTone(t, root * 4 * 0.996, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
    }
  }

  // 動態程序化 Synthwave 循環音樂 (BGM)：bass + 鼓組 + 和弦 pad + lead 四層
  // 所有層都由 8 分音符 step 驅動，關卡資料在 BGM_THEMES
  startBGM(levelId = 'street') {
    if (this.bgmInterval) return;
    this.bgmMuted = false;
    this.ensureContext();

    const theme = BGM_THEMES[levelId] || BGM_THEMES.street;
    this._bgmTheme = theme;
    this.bgmStep = 0;
    this._bgmLastLead = 0;
    this._bgmLastStep = -1;
    this._bgmDrone = !!theme.drone;
    this._bgmStepTime = (60 / theme.bpm) / 2; // 8分音符
    this._applyGains();

    this.bgmInterval = setInterval(() => {
      this._bgmStep();
    }, this._bgmStepTime * 1000);
  }

  // 單個 8 分音符 step 的完整排程 (抽成方法以便無頭測試直接驅動)
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

    // 1. 鼓組
    if (kickSteps.includes(stepInBar)) this._bgmKick(now, theme.kickLevel || 0.55);
    if (theme.clap.includes(stepInBar)) this._bgmClap(now);
    if (theme.hat === 'eighth') {
      if (stepInBar % 2 === 1) this._bgmHat(now, stepInBar === 7, 0.055);
    } else if (theme.hat === 'sparse' && (stepInBar === 2 || stepInBar === 6)) {
      this._bgmHat(now, false, 0.035);
    }
    if (theme.ghost && stepInBar % 2 === 0) {
      this._bgmHat(now, false, 0.02, now + stepTime * 0.5);
    }
    // 每 4 小節加過門 crash
    if (barIdx > 0 && barIdx % 4 === 0 && stepInBar === 0) this._bgmCrash(now);

    // 2. Bass 脈衝 (8 分音符)
    this._bgmTone(now, bassNotes[this.bgmStep % bassNotes.length], 'triangle', stepTime * 0.85, 0.15);

    // 3. 和弦 pad (每小節第一拍換和弦，跨整小節)
    if (stepInBar === 0) this._bgmPad(now, stepTime * 8, chordRoot, theme.mode, padCfg);

    // 4. Lead 旋律 (機率式五聲音階短音；第一小節留白，避免單音重複)
    if (barIdx >= 1 && Math.random() < leadCfg.density && !(stepInBar === 0 && this._bgmLastStep >= 6)) {
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
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

export const sound = new SoundEngine();
