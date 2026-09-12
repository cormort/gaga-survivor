// Web Audio API 即時程序化音效與背景音樂合成引擎 (零外掛依賴)
//
// 這一版針對五件事做了強化：
//   1. 節拍穩定度 —— 改用「前瞻排程器」(look-ahead scheduler)：以 ctx.currentTime
//      為時基、提前 250ms 把音符排進音訊時鐘，每 50ms 醒來補排。原本是
//      setInterval(stepTime) 直接觸發，主執行緒一忙（後期 250 隻怪）節拍就會飄，
//      背景分頁還會被瀏覽器節流成 1Hz。
//   2. 混音 —— 兩條匯流排先過一顆限幅器 (DynamicsCompressor) 才到 destination。
//      後期同時命中＋爆炸的總和會超過 0 dBFS 破音，限幅器只在總和過門檻時動作，
//      單一音效幾乎不受影響。
//   3. 音效質感 —— 逐發微失諧與音量抖動（連續射擊不再像同一顆音重播）、
//      立體聲定位（依世界座標相對畫面中心）、4ms 起音（消除爆音 click）。
//   4. 音樂動態 —— setIntensity() 讓音樂跟著戰況走：張力高時補上 16 分音符琶音層、
//      lead 密度上升、ghost hat 出現；8 小節一樂句、樂句尾有過門。
//   5. 配置 —— 爆炸不再每次配置新 buffer（原本每次 ~11,000 次 Math.random），
//      共用一份快取噪音；所有節點在 stop 後主動斷開。

// 各關卡的 BGM 主題 (速度 + 資料化分層：bass 音階 / 和弦進行 / 鼓組樣式 / lead / 琶音)
// 關卡 id 沒對到就回 street 預設。chords 是「每小節根音」，8 個 = 8 小節一輪；
// 這裡的 8 小節都是把原本的根音重新排序延伸，不引入新和聲（避免改到既有調性）。
const BGM_THEMES = {
  street: {
    bpm: 128,
    bass: [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83],
    mode: 'maj',                              // 和弦性質 (三度)
    chords: [110, 87.31, 130.81, 87.31, 110, 87.31, 98, 130.81],   // A F C F | A F G C
    kick: 'floor',                            // 4-on-floor
    clap: [2, 6],                             // backbeat 拍手
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.045, dur: 0.16 },
    arp: { wave: 'triangle', level: 0.032 },
    pad: { level: 0.05, detune: 4, spread: false },
  },
  lab: {
    bpm: 118,
    bass: [87.31, 87.31, 98, 110, 87.31, 87.31, 123.47, 110],
    mode: 'min',
    chords: [87.31, 73.42, 65.41, 73.42, 87.31, 65.41, 73.42, 65.41],  // 陰沉下行 + 回繞
    kick: 'half',                             // 半拍感 (只有 1 & 3)
    clap: [],
    hat: 'sparse',
    drone: true,                              // 高八度微失諧長音 (實驗室不安感)
    lead: { density: 0.16, octave: 1, wave: 'sine', level: 0.04, dur: 0.3 },
    arp: { wave: 'sine', level: 0.026 },
    pad: { level: 0.05, detune: 10, spread: false },
  },
  frost: {
    bpm: 124,
    bass: [98, 98, 123.47, 146.83, 98, 98, 130.81, 123.47],
    mode: 'min',
    chords: [196, 174.61, 146.83, 196, 174.61, 196, 146.83, 174.61],  // 空靈高音區，重排
    kick: 'half',
    clap: [],
    hat: 'sparse',
    lead: { density: 0.2, octave: 2, wave: 'sine', level: 0.05, dur: 0.45 }, // 長尾鈴聲
    arp: { wave: 'sine', level: 0.028 },
    pad: { level: 0.045, detune: 6, spread: true },                         // 加 12 度的寬廣 pad
  },
  core: {
    bpm: 142,
    bass: [65.41, 65.41, 73.42, 98, 65.41, 65.41, 82.41, 73.42],
    mode: 'min',
    chords: [65.41, 65.41, 55, 49, 65.41, 55, 49, 55],           // C C A G | C A G A 低音重壓
    kick: 'floor',
    kickLevel: 0.62,
    clap: [2, 6],
    hat: 'eighth',
    ghost: true,                              // 16 分 ghost hat 推進感
    lead: { density: 0.34, octave: 2, wave: 'square', level: 0.05, dur: 0.13 },
    arp: { wave: 'square', level: 0.028 },
    pad: { level: 0.05, detune: 7, spread: false },
  },
  endless: {
    bpm: 138,
    bass: [73.42, 73.42, 87.31, 110, 73.42, 73.42, 98, 87.31],
    mode: 'maj',
    chords: [73.42, 73.42, 87.31, 98, 73.42, 98, 87.31, 110],     // D D F G | D G F A 揚升感
    kick: 'floor',
    clap: [2, 6],
    hat: 'eighth',
    lead: { density: 0.3, octave: 2, wave: 'square', level: 0.05, dur: 0.15 },
    arp: { wave: 'triangle', level: 0.032 },
    pad: { level: 0.05, detune: 5, spread: false },
  },
};

// 各武器家族的射擊音色。原本所有武器共用同一個 650→180Hz 的三角波，
// 六種武器聽起來完全一樣；現在由呼叫端帶入家族名（不認得就回退成苦無）。
const SHOOT_TIMBRES = {
  kunai:     { type: 'triangle', f0: 650, f1: 180, dur: 0.08, level: 0.30 },
  rocket:    { type: 'sawtooth', f0: 300, f1: 90,  dur: 0.15, level: 0.26 },
  molotov:   { type: 'triangle', f0: 430, f1: 140, dur: 0.12, level: 0.22 },
  lightning: { type: 'square',   f0: 900, f1: 260, dur: 0.09, level: 0.19 },
  soccer:    { type: 'sine',     f0: 520, f1: 300, dur: 0.07, level: 0.22 },
  guardian:  { type: 'sine',     f0: 780, f1: 640, dur: 0.06, level: 0.17 },
};

// 前瞻排程：提前 SCHEDULE_AHEAD 秒把音符排進音訊時鐘，每 SCHEDULER_MS 補排一次。
// 這兩個數字是「穩定度 vs 排程餘裕」的取捨：AHEAD 太小會來不及、太大則反應遲鈍。
const SCHEDULE_AHEAD = 0.25;
const SCHEDULER_MS = 50;

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;      // 限幅器 (兩條匯流排的出口)
    this.enabled = true;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmStep = 0;
    this.bgmMuted = false;   // 暫停時 BGM 靜音 (音效開關獨立)
    this.sfxVol = 1;         // 使用者音量 (0~1，主選單滑桿)
    this.bgmVol = 0.8;
    this._lastSfx = {};      // 各音效最近播放時間 (節流用)

    // BGM 排程狀態
    this._schedTimer = null;
    this._nextStepTime = 0;
    this._bgmStepTime = 0.23;
    this._bgmTheme = null;
    this._bgmDrone = false;
    this._bgmLastLead = 0;
    this._bgmLastStep = -1;
    this._arpIdx = 0;

    // 音樂張力 (0~1)：由主迴圈依戰況餵入，用來決定要不要疊琶音層、lead 多密
    this.intensity = 0;
    this._intensityTarget = 0;

    // 音效質感
    this.sfxJitter = 0.06;   // 逐發微失諧 (±6%)，連續射擊不會像同一顆音重播
    this._listenX = null;    // 聽者 (畫面中心) 的世界座標，供立體聲定位
    this._listenW = 1;
    this._offline = false;   // 注入 OfflineAudioContext 時為 true (供無頭測試)
    this._visBound = false;
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

  // 音樂張力 (0~1)。主迴圈每幀餵入（Boss 在場 / 血量低 / 連擊狂潮），
  // 排程器每步平滑逼近，所以不會有突兀的層數跳變。
  setIntensity(v) {
    this._intensityTarget = Math.max(0, Math.min(1, +v || 0));
  }

  // 聽者位置：主迴圈每幀餵入畫面中心的世界的 x 與視窗寬，用於音效的左右定位
  setListener(centerX, viewWidth) {
    this._listenX = centerX;
    this._listenW = Math.max(1, viewWidth || 1);
  }

  // 世界座標 → 立體聲位置 (-0.7 ~ 0.7；不做全開，避免單邊耳朵聽不到)
  _panFor(worldX) {
    if (worldX == null || this._listenX == null) return 0;
    const rel = (worldX - this._listenX) / (this._listenW * 0.5);
    return Math.max(-1, Math.min(1, rel)) * 0.7;
  }

  // ctxOverride：注入 OfflineAudioContext 供無頭測試（會跳過 resume 與計時器）
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

    // 兩條匯流排 → 限幅器 → 輸出。後期同時命中與爆炸的總和很容易超過 0 dBFS，
    // 沒有這一顆就是破音；單一音效幾乎不會碰到門檻，音色不受影響。
    this.master = this.ctx.createDynamicsCompressor();
    this.master.threshold.value = -8;
    this.master.knee.value = 5;
    this.master.ratio.value = 12;
    this.master.attack.value = 0.003;
    this.master.release.value = 0.18;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.25 * this.sfxVol;
    this.sfxGain.connect(this.master);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12 * this.bgmVol;
    this.bgmGain.connect(this.master);

    // 分頁切回前景時重新對時：手機背景會把 AudioContext 暫停，回來若讓排程器
    // 追趕落後的音符，聽起來會像快轉一整段。
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

  // 暫停/恢復 BGM (遊戲內暫停鍵用；與音效總開關互不干擾)
  pauseBGM() {
    this.bgmMuted = true;
    this._applyGains();
  }

  resumeBGM() {
    this.bgmMuted = false;
    this._applyGains();
  }

  // ── 音效發聲器 ────────────────────────────────────────────────
  // 一次把「振盪器 → 包絡 → (立體聲定位) → 匯流排」接好，並且在 stop 後主動斷開。
  // 逐發加入微失諧與音量抖動；起音固定留 4ms 斜坡，消除瞬間從 0 跳到峰值的爆音。
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

  // 快取噪音 buffer：爆炸原本每次自己建一份 0.25 秒的 buffer 並跑 ~11,000 次
  // Math.random()，後期一秒好幾顆＝每秒數萬次配置。BGM 的鼓件早已共用一份，這裡統一。
  _noiseBuffer() {
    if (!this._noiseBuf) {
      const len = Math.max(1, Math.ceil(this.ctx.sampleRate * 0.6));
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this._noiseBuf;
  }

  // 一段噪音 (爆炸層、鼓件共用)。offset 讓每次爆炸的噪音相位不同，聽起來不重複。
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

  // 射擊音效。kind 是武器家族 (kunai/rocket/molotov/lightning/soccer/guardian)，
  // worldX 選填：給了就依畫面中心做左右定位；不給就維持原本的中央單聲道。
  playShoot(kind = null, worldX = null) {
    if (!this.enabled || this._throttle('shoot', 35)) return;
    this.ensureContext();
    const cfg = SHOOT_TIMBRES[kind] || SHOOT_TIMBRES.kunai;
    this._sfxVoice({
      type: cfg.type, f0: cfg.f0, f1: cfg.f1, dur: cfg.dur, level: cfg.level,
      pan: this._panFor(worldX),
    });
  }

  // 戰術閃避翻滾音效 (呼嘯氣流聲)
  playDash() {
    if (!this.enabled || this._throttle('dash', 150)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'sine', f0: 340, f1: 80, dur: 0.18, level: 0.35, attack: 0.006 });
  }

  // 擊中怪物。worldX 選填 (後期幾百發同時命中時，左右定位讓打擊感有空間感)
  playHit(worldX = null) {
    if (!this.enabled || this._throttle('hit', 50)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'square', f0: 220, f1: 60, dur: 0.05, level: 0.18, pan: this._panFor(worldX) });
  }

  // 拾取經驗寶石 (清脆晶瑩水晶音)
  playGem(worldX = null) {
    if (!this.enabled || this._throttle('gem', 40)) return;
    this.ensureContext();
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    const f = freqs[Math.floor(Math.random() * freqs.length)];
    this._sfxVoice({
      type: 'sine', f0: f, f1: f * 1.5, dur: 0.09, level: 0.2,
      pan: this._panFor(worldX), jitter: 0.02,
    });
  }

  // 選取音效 (武器型態晶片等 UI 回饋)
  playSelect() {
    if (!this.enabled || this._throttle('select', 30)) return;
    this.ensureContext();
    this._sfxVoice({ type: 'triangle', f0: 660, f1: 990, dur: 0.1, level: 0.16, jitter: 0 });
  }

  // 爆炸音效 (火箭、地雷、手榴彈)：低頻衝擊波 + 噪音層
  playExplosion(worldX = null) {
    if (!this.enabled || this._throttle('explosion', 90)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const pan = this._panFor(worldX);
    // 低頻衝擊波
    this._sfxVoice({
      type: 'sawtooth', f0: 140, f1: 30, dur: 0.35, level: 0.4,
      attack: 0.003, pan, jitter: 0.10,
    });
    // 噪音層（共用快取 buffer，隨機相位）
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
    const notes = [440, 554.37, 659.25, 880]; // A - C# - E - A
    notes.forEach((freq, idx) => {
      this._sfxVoice({ type: 'triangle', f0: freq, dur: 0.25, level: 0.25, at: t + idx * 0.08, jitter: 0 });
    });
  }

  // 超武進化開箱音效 (華麗史詩大和弦)
  playEvoFanfare() {
    if (!this.enabled) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C Major Spread
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
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) { /* 已斷開 */ }
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

  // 小節起始的和弦 pad：mode maj/min 三度 + 可選 wide (多一顆高八度)
  _bgmPad(t, dur, root, mode, cfg) {
    const offsets = mode === 'maj' ? [0, 4, 7] : [0, 3, 7];
    for (const semi of offsets) {
      this._bgmTone(t, root * Math.pow(2, semi / 12), 'triangle', dur, cfg.level / 3, null, 0.5, 0.6);
    }
    if (cfg.spread) {
      this._bgmTone(t, root * 2, 'triangle', dur, cfg.level / 6, null, 0.5, 0.6);
    }
    // 高張力時補一層高八度微亮 pad（只在高強度出現，讓「打到後期」聽得出來）
    if (this.intensity > 0.7) {
      this._bgmTone(t, root * 4, 'sine', dur, cfg.level / 5, null, 0.8, 0.7);
    }
    // 高八度微失諧長音 (實驗室專用，拍頻製造不安感)
    if (this._bgmDrone) {
      this._bgmTone(t, root * 4 * 1.004, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
      this._bgmTone(t, root * 4 * 0.996, 'sine', dur * 2, 0.012, null, 1.2, 0.8);
    }
  }

  // 動態程序化 Synthwave 循環音樂 (BGM)：bass + 鼓組 + 和弦 pad + lead + 高張力琶音
  // 音色與和聲全部來自 BGM_THEMES；節拍由前瞻排程器驅動 (見 _schedulerTick)
  startBGM(levelId = 'street') {
    if (this._schedTimer) return;
    this.bgmMuted = false;
    this.ensureContext();
    if (!this.ctx) return;

    const theme = BGM_THEMES[levelId] || BGM_THEMES.street;
    this._bgmTheme = theme;
    this.bgmStep = 0;
    this._bgmLastLead = 0;
    this._bgmLastStep = -1;
    this._arpIdx = 0;
    this._bgmDrone = !!theme.drone;
    this._bgmStepTime = (60 / theme.bpm) / 2; // 8分音符
    this.intensity = 0;
    this._applyGains();

    this._nextStepTime = this.ctx.currentTime + 0.08;
    this._schedTimer = setInterval(() => this._schedulerTick(), SCHEDULER_MS);
    this._schedulerTick();
  }

  // 補排：把「下一個該響、且落在前瞻窗內」的 step 全部排進音訊時鐘。
  // guard 是防止長時間凍結後一次補排幾百個音符（聽起來像快轉）。
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

  // 暫停/背景回來後重新對時，避免追趕落後的音符
  _resyncBGM() {
    if (!this.ctx || !this._schedTimer) return;
    this._nextStepTime = Math.max(this._nextStepTime, this.ctx.currentTime + 0.08);
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

    // 音樂張力平滑逼近（每步 12%，約 8 步到位 → 約 1 秒，不會突兀）
    this.intensity += (this._intensityTarget - this.intensity) * 0.12;
    const it = this.intensity;

    // 樂句結構：8 小節一樂句。第 8 小節第 5 個 8 分音符加過門，
    // 樂句第一拍加大鼓刷，讓循環有「段落感」而不是無盡的 4 小節。
    const phraseBar = barIdx % 8;

    // 1. 鼓組
    if (kickSteps.includes(stepInBar)) this._bgmKick(now, theme.kickLevel || 0.55);
    if (theme.clap.includes(stepInBar)) this._bgmClap(now);
    if (theme.hat === 'eighth') {
      if (stepInBar % 2 === 1) this._bgmHat(now, stepInBar === 7, 0.055);
    } else if (theme.hat === 'sparse' && (stepInBar === 2 || stepInBar === 6)) {
      this._bgmHat(now, false, 0.035);
    }
    // ghost hat 只在有張力時出現（原本一直開著，等於沒有動態）
    if (theme.ghost && it > 0.2 && stepInBar % 2 === 0) {
      this._bgmHat(now, false, 0.02 + it * 0.012, now + stepTime * 0.5);
    }
    // 樂句過門：第 8 小節的後半拍連打三下小鼓/hat
    if (phraseBar === 7 && stepInBar >= 5 && stepInBar <= 7) {
      this._bgmHat(now, false, 0.03 + it * 0.02, now + stepTime * 0.5);
    }
    if (barIdx > 0 && phraseBar === 0 && stepInBar === 0) this._bgmCrash(now, 0.09 + it * 0.05);
    if (it > 0.6 && phraseBar === 4 && stepInBar === 0) this._bgmCrash(now, 0.05);

    // 2. Bass 脈衝 (8 分音符)
    this._bgmTone(now, bassNotes[this.bgmStep % bassNotes.length], 'triangle', stepTime * 0.85, 0.15);

    // 3. 和弦 pad (每小節第一拍換和弦，跨整小節)
    if (stepInBar === 0) this._bgmPad(now, stepTime * 8, chordRoot, theme.mode, padCfg);

    // 4. 高張力琶音層：16 分音符在和弦音之間跑，強度越高越大聲
    if (theme.arp && it > 0.45 && stepInBar % 2 === 1) {
      const tones = theme.mode === 'maj' ? [0, 4, 7, 12] : [0, 3, 7, 12];
      const semi = tones[this._arpIdx % tones.length];
      this._arpIdx++;
      // 提高兩個八度：琶音要當 pad 上方的亮層，跟低音同度會糊在一起（實測放 4 倍時
      // 幾乎量不到高頻增量，落在 200~500Hz 的低中頻）。
      const freq = chordRoot * Math.pow(2, semi / 12) * 8;
      if (freq <= 5000) {
        this._bgmTone(now, freq, theme.arp.wave || 'triangle', stepTime * 0.9,
          theme.arp.level * (0.4 + it * 0.9), null, 0.006);
      }
    }

    // 5. Lead 旋律 (機率式五聲音階短音；第一小節留白，避免單音重複)
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
