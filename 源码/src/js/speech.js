/* ============================================================
   朗读
   - 桌面版（Tauri）：走 WinRT 语音合成，康康 / 瑶瑶 / 慧慧 才是真的三种声音
     （WebView 自带的 speechSynthesis 走 SAPI，中文只有慧慧一个，
       康康 / 瑶瑶 会静默回落成同一个声音）
   - 浏览器里：回落到 Web Speech API
   对外暴露 window.Speech
   ============================================================ */
window.Speech = (function () {
  const KEY = 'number-bomb-tts-v2';
  const OLD_KEY = 'number-bomb-tts-v1';
  const tauri = window.__TAURI__ && window.__TAURI__.core;
  const invoke = tauri && tauri.invoke ? tauri.invoke.bind(tauri) : null;

  const synth = window.speechSynthesis || null;
  let enabled = true;
  let wantVoice = '';     /* 挑的语音显示名，空 = 自动挑中文的 */
  let rate = 0.85;        /* 默认慢一点，听着更自然 */
  let voice = null;       /* 浏览器回退路径用 */
  let voiceList = [];     /* [{name, lang}] */
  let voicesLoaded = false;
  let onVoices = null;
  let player = null;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw === '0') enabled = false;            /* 旧版格式 */
    else if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') {
        if (cfg.enabled === false) enabled = false;
        if (typeof cfg.voice === 'string') wantVoice = cfg.voice;
        if (typeof cfg.rate === 'number') rate = cfg.rate;
      }
    } else {
      /* 从旧版迁移：开关和声音沿用，语速用新的默认值（慢） */
      const old = localStorage.getItem(OLD_KEY);
      if (old === '0') enabled = false;
      else if (old) {
        const cfg = JSON.parse(old);
        if (cfg && typeof cfg === 'object') {
          if (cfg.enabled === false) enabled = false;
          if (typeof cfg.voice === 'string' && cfg.voice) wantVoice = cfg.voice;
        }
      }
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ enabled, voice: wantVoice, rate })); } catch (e) {}
  }

  /* ---------- 语音列表 ---------- */
  function fallbackVoices() {
    if (!synth) return [];
    let vs = [];
    try { vs = synth.getVoices() || []; } catch (e) { vs = []; }
    const zh = vs.filter(v => /^zh/i.test(v.lang) || /Chinese|中文/i.test(v.name));
    const list = (zh.length ? zh : vs).slice(0, 6);
    voice = list.find(v => /Huihui/i.test(v.name)) || list[0] || null;
    return list.map(v => ({ name: v.name, lang: v.lang }));
  }

  function shortName(name) {
    const m = /(?:Microsoft\s+)?([A-Za-z]+)/.exec(name || '');
    return m ? m[1] : (name || '').replace(/\s*-\s*.*$/, '');
  }

  /* 语音的中文名（界面上别显示拼音） */
  const CN_NAME = {
    Huihui: '慧慧', Kangkang: '康康', Yaoyao: '瑶瑶',
    Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Yunxi: '云希', Yunjian: '云健',
    Yunyang: '云扬', Xiaochen: '晓辰', Xiaohan: '晓涵',
    David: '大卫', Zira: 'Zira', Mark: '马克'
  };

  function voiceLabel(name) {
    const en = shortName(name);
    return CN_NAME[en] || en;
  }

  function pickBrowserVoice() {
    if (!synth) { voice = null; return null; }
    const vs = synth.getVoices() || [];
    if (wantVoice) {
      const hit = vs.find(v => v.name === wantVoice);
      if (hit) { voice = hit; return voice; }
    }
    const zh = vs.filter(v => /^zh/i.test(v.lang) || /Chinese|中文/i.test(v.name));
    voice = zh.find(v => /Huihui/i.test(v.name)) || zh[0] || vs[0] || null;
    return voice;
  }

  function loadVoices() {
    if (invoke) {
      invoke('list_voices')
        .then(lines => {
          const all = (lines || []).map(l => {
            const [name, lang] = String(l).split('|');
            return { name: (name || '').trim(), lang: (lang || '').trim() };
          }).filter(v => v.name);
          /* 只留中文语音（慧慧 / 康康 / 瑶瑶），没有中文才退回全部 */
          const zh = all.filter(v => /^zh/i.test(v.lang));
          voiceList = zh.length ? zh : all;
          if (!wantVoice && voiceList.length) wantVoice = voiceList[0].name;
          voicesLoaded = true;
          if (onVoices) onVoices();
        })
        .catch(() => {
          voiceList = fallbackVoices();
          voicesLoaded = true;
          if (onVoices) onVoices();
        });
      return;
    }
    const tryLoad = () => {
      voiceList = fallbackVoices();
      if (!wantVoice && voiceList.length) wantVoice = voiceList[0].name;
      if (voiceList.length) voicesLoaded = true;
      if (onVoices) onVoices();
    };
    tryLoad();
    if (synth && typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', tryLoad);
    setTimeout(tryLoad, 300);
    setTimeout(tryLoad, 1200);
  }

  function listVoices() { return voiceList.slice(); }
  function setVoicesListener(fn) { onVoices = fn; if (voicesLoaded && fn) fn(); }

  function available() {
    if (invoke) return voiceList.length > 0 || !voicesLoaded;   /* 还在加载时先当作可用 */
    if (!synth) return false;
    if (!voice) pickBrowserVoice();
    return !!voice;
  }

  function getEnabled() { return enabled; }
  function setEnabled(v) {
    enabled = !!v;
    save();
    if (!enabled) {
      if (synth) { try { synth.cancel(); } catch (e) {} }
      if (player) { try { player.pause(); } catch (e) {} }
    }
  }

  function getVoice() { return wantVoice; }
  function setVoice(name) {
    wantVoice = name || '';
    voice = null;
    if (!invoke) pickBrowserVoice();
    save();
  }

  function getRate() { return rate; }
  function setRate(r) {
    const n = Number(r);
    if (n >= 0.5 && n <= 2) rate = n;
    save();
  }

  function speak(text) {
    if (!enabled || !text) return false;

    /* 桌面版：WinRT 合成 WAV 再播 */
    if (invoke) {
      const voiceName = wantVoice;
      invoke('speak_text', { text: String(text), voice: voiceName || '', rate })
        .then(url => {
          if (!url || !enabled) return;
          if (!player) player = new Audio();
          player.pause();
          player.src = url;
          /* 跟着小喇叭里的「语音」音轨走（总音量 × 语音，再换算成振幅） */
          try {
            player.volume = window.AudioEngine && window.AudioEngine.getVoiceAmp
              ? window.AudioEngine.getVoiceAmp() : 1;
          } catch (e) {}
          player.play().catch(() => {});
        })
        .catch(() => {});
      return true;
    }

    /* 浏览器：Web Speech API */
    if (!synth) return false;
    if (!voice && !pickBrowserVoice()) return false;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.voice = voice;
      u.lang = voice.lang || 'zh-CN';
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  function voiceName() {
    if (invoke) return shortName(wantVoice);
    return voice ? voice.name : '';
  }

  loadVoices();

  return {
    available, speak, getEnabled, setEnabled, voiceName,
    listVoices, setVoicesListener, getVoice, setVoice, getRate, setRate,
    shortName, voiceLabel, isDesktop: () => !!invoke
  };
})();
