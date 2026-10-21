/* ============================================================
   音效引擎（Web Audio API）
   对外暴露 window.AudioEngine
   ============================================================ */
window.AudioEngine = (function () {
  let audioCtx = null;
  let masterGain = null;
  /* 三条音轨：总音量 / 音效 / 语音，都是 0~1 的推子
     默认全部 50%：不会太大声，踩雷时也不会吓人一跳 */
  const KEY = 'number-bomb-volume-v4';
  let vol = { master: 0.5, sfx: 0.5, voice: 0.5 };
  const BASE = 1.0;            /* 满音量时的基准增益 */
  const BOOM_TRIM = 0.75;      /* 踩雷那一下单独压一点，避免吓人 */

  /* 人耳对响度的感知不是线性的：推子 50% 要听起来「一半响」，
     振幅就得按平方衰减。直接把推子值当 volume 用，
     就会出现「拉到 50% 还很响、拉到 10% 才有效」。 */
  function amp(l) {
    const v = Math.max(0, Math.min(1, Number(l) || 0));
    return v * v;
  }

  /* 实际响度：总音量走感知曲线（平方），音轨做线性微调 */
  function eff(kind) {
    const m = Math.max(0, Math.min(1, vol.master));
    const c = Math.max(0, Math.min(1, kind === 'voice' ? vol.voice : vol.sfx));
    return amp(m) * c;
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') {
        ['master', 'sfx', 'voice'].forEach(k => {
          const n = Number(cfg[k]);
          if (!isNaN(n) && n >= 0 && n <= 1) vol[k] = n;
        });
      }
    } else {
      /* 旧版只有一个音量，迁移成总音量 */
      const old = parseFloat(localStorage.getItem('number-bomb-volume-v1'));
      if (!isNaN(old) && old >= 0 && old <= 1) vol.master = old;
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(vol)); } catch (e) {}
  }

  function sfxEl() { return document.getElementById('boomSfx'); }

  function applyGain() {
    const a = BASE * eff('sfx');
    if (masterGain) masterGain.gain.value = a;
    const el = sfxEl();
    if (el) { try { el.volume = Math.min(1, a * BOOM_TRIM); } catch (e) {} }
  }

  function init() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      applyGain();
      return;
    }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      applyGain();
    } catch (e) { audioCtx = null; }
  }

  function playTone({ type = 'sine', startFreq = 440, endFreq = null,
                      duration = 0.12, volume = 0.12, delay = 0, attack = 0.008 }) {
    if (!audioCtx || eff('sfx') <= 0) return;
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t0);
    if (endFreq != null)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function playNoise({ duration = 0.5, volume = 0.3, delay = 0, filterFreq = 2000,
                       filterType = 'lowpass', q = 1 }) {
    if (!audioCtx || eff('sfx') <= 0) return;
    const t0 = audioCtx.currentTime + delay;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const flt = audioCtx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(filterFreq, t0);
    if (filterType === 'lowpass')
      flt.frequency.exponentialRampToValueAtTime(100, t0 + duration);
    flt.Q.value = q;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(flt).connect(gain).connect(masterGain);
    src.start(t0);
    src.stop(t0 + duration + 0.03);
  }

  function click() {
    /* 柔和轻触声：单一正弦短音，去掉刺耳的高频噪声 */
    playTone({ type: 'sine', startFreq: 480, endFreq: 400,
               duration: 0.06, volume: 0.05, attack: 0.008 });
  }

  function disappear(count) {
    if (!audioCtx || eff('sfx') <= 0 || count <= 0) return;
    /* 木琴/风铃：固定音高、不扫频，音色圆润悦耳 */
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00];
    const maxSounds = Math.min(count, 8);
    const step = 0.075;
    for (let i = 0; i < maxSounds; i++) {
      playTone({ type: 'sine', startFreq: scale[i % scale.length], endFreq: null,
                 duration: 0.28, volume: 0.032, attack: 0.008, delay: i * step });
    }
  }

  /* 踩雷音效文件（sfx/boom.mp3）：有就用它 */
  function playBoomFile() {    const el = document.getElementById('boomSfx');
    if (!el) return false;
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 兜底：没有音效文件 / 播放失败时用合成音
     柔和低闷响 + 温和下行提示，音量压低，听感软、不吓人 */
  function gameOverSynth() {
    if (!audioCtx) return;
    playTone({ type: 'sine', startFreq: 170, endFreq: 72, duration: 0.60,
               volume: 0.055, attack: 0.05, delay: 0 });
    playNoise({ duration: 0.45, volume: 0.028, filterFreq: 380,
                filterType: 'lowpass', q: 0.6, delay: 0.01 });
    playTone({ type: 'sine', startFreq: 466, endFreq: 440, duration: 0.28,
               volume: 0.05, attack: 0.04, delay: 0.12 });
    playTone({ type: 'sine', startFreq: 392, endFreq: 370, duration: 0.34,
               volume: 0.045, attack: 0.04, delay: 0.36 });
    playTone({ type: 'sine', startFreq: 311, endFreq: 294, duration: 0.60,
               volume: 0.04, attack: 0.05, delay: 0.62 });
  }

  function gameOver() {
    if (eff('sfx') <= 0) return;
    if (playBoomFile()) return;
    gameOverSynth();
  }

  function start() {
    playTone({ type: 'sine', startFreq: 587, endFreq: 784,
               duration: 0.12, volume: 0.07, attack: 0.012 });
    playTone({ type: 'sine', startFreq: 784, endFreq: 988,
               duration: 0.16, volume: 0.05, attack: 0.012, delay: 0.09 });
  }

  /* 调音量时的提示音：音量给得足，整条滑轨都能听出来 */
  function volumeTick() {
    if (!audioCtx || eff('sfx') <= 0) return;
    playTone({ type: 'sine', startFreq: 660, endFreq: 440,
               duration: 0.13, volume: 0.85, attack: 0.005 });
    playTone({ type: 'sine', startFreq: 330, endFreq: 220,
               duration: 0.15, volume: 0.45, attack: 0.005, delay: 0.02 });
  }

  function getMuted() { return eff('sfx') <= 0; }

  function setMuted(v) {
    /* 兼容旧调用：静音 = 总音量拉到 0，取消 = 回到默认 */
    vol.master = v ? 0 : 1;
    save();
    applyGain();
    if (masterGain && audioCtx)
      masterGain.gain.setTargetAtTime(BASE * eff('sfx'), audioCtx.currentTime, 0.01);
  }

  /* 三条音轨：0~1 的推子值 */
  function getVolume(kind) { return vol[kind] === undefined ? vol.master : vol[kind]; }
  function setVolume(kind, v) {
    if (typeof kind === 'object' && kind) {           /* setVolume({master,sfx,voice}) */
      ['master', 'sfx', 'voice'].forEach(k => {
        const n = Number(kind[k]);
        if (!isNaN(n)) vol[k] = Math.max(0, Math.min(1, n));
      });
    } else {
      const n = Number(v);
      if (vol[kind] !== undefined && !isNaN(n)) vol[kind] = Math.max(0, Math.min(1, n));
    }
    save();
    applyGain();
  }
  /* 实际播放增益：必须和 applyGain()/播放时用的是同一个值，
     否则朗读会被多算一次平方，音量只剩 1/8（50% 时几乎听不见） */
  function getSfxAmp() { return BASE * eff('sfx'); }
  function getVoiceAmp() { return eff('voice'); }
  /* 兼容旧的单值调用（等于音效实际增益） */
  function getAmp() { return getSfxAmp(); }

  return {
    init, click, disappear, gameOver, start, volumeTick,
    getMuted, setMuted, getVolume, setVolume,
    getAmp, getSfxAmp, getVoiceAmp, amp
  };
})();
