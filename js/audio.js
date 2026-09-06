// Web Audio API 即時程序化音效與背景音樂合成引擎 (零外掛依賴)

// 各關卡的 BGM 主題 (bass 音階 + 速度)；關卡 id 沒對到就回 street 預設
const BGM_THEMES = {
  street:  { bpm: 128, bass: [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83] },
  lab:     { bpm: 118, bass: [87.31, 87.31, 98, 110, 87.31, 87.31, 123.47, 110] },
  frost:   { bpm: 124, bass: [98, 98, 123.47, 146.83, 98, 98, 130.81, 123.47] },
  core:    { bpm: 142, bass: [65.41, 65.41, 73.42, 98, 65.41, 65.41, 82.41, 73.42] },
  endless: { bpm: 138, bass: [73.42, 73.42, 87.31, 110, 73.42, 73.42, 98, 87.31] },
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

  // 動態程序化 Synthwave 循環音樂 (BGM)：不同關卡不同音階與速度
  startBGM(levelId = 'street') {
    if (this.bgmInterval) return;
    this.bgmMuted = false;
    this.ensureContext();

    const theme = BGM_THEMES[levelId] || BGM_THEMES.street;
    const bassNotes = theme.bass;
    const bpm = theme.bpm;
    const stepTime = (60 / bpm) / 2; // 8分音符
    this._applyGains();

    this.bgmInterval = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const noteFreq = bassNotes[this.bgmStep % bassNotes.length];

      // Bass 脈衝
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, t);

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + stepTime * 0.85);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + stepTime * 0.9);

      // 偶數拍輕敲高音
      if (this.bgmStep % 2 === 1) {
        const hihat = this.ctx.createOscillator();
        const hiGain = this.ctx.createGain();
        hihat.type = 'sine';
        hihat.frequency.setValueAtTime(3200, t);
        hiGain.gain.setValueAtTime(0.03, t);
        hiGain.gain.linearRampToValueAtTime(0.001, t + 0.04);
        hihat.connect(hiGain);
        hiGain.connect(this.bgmGain);
        hihat.start(t);
        hihat.stop(t + 0.04);
      }

      this.bgmStep++;
    }, stepTime * 1000);
  }

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

export const sound = new SoundEngine();
