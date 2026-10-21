/* ============================================================
   入口：DOM 事件绑定与初始化
   ============================================================ */
(function () {
  const A = window.AudioEngine;
  const G = window.Game;
  const $ = id => document.getElementById(id);

  let curMax = 100;   /* 当前数字范围上限 */

  /* 依据设置页当前选中项初始化范围与人数 */
  const activeRange = document.querySelector('#rangeOpts .opt.active');
  const activePlayers = document.querySelector('#playerOpts .opt.active');
  curMax = activeRange ? parseInt(activeRange.dataset.max, 10) : 100;
  G.setMax(curMax);
  G.setPlayers(activePlayers ? parseInt(activePlayers.dataset.players, 10) : 4);
  G.buildBoard(curMax);
  G.fitBoard();
  setTimeout(G.fitBoard, 60);

  window.addEventListener('resize', G.fitBoard);
  window.addEventListener('orientationchange', () => setTimeout(G.fitBoard, 150));
  if (window.visualViewport)
    window.visualViewport.addEventListener('resize', G.fitBoard);

  /* 通用：小眼睛 + 星号遮罩（主输入框和「再来一局」的自定义输入框共用一套）
     - 隐藏时固定显示两个星号：不管 1 / 2 / 3 位都只显示 **，连位数都不暴露
     - 「没睁眼」就一直保持透明，且颜色不参与过渡，否则打第一个数字会闪一下 */
  function makeEye(rowId, inputId, maskId, btnId) {
    const row = $(rowId), input = $(inputId), mask = $(maskId), btn = $(btnId);
    if (!row || !input || !mask || !btn) return null;
    let open = false;

    function sync() {
      const masked = !open;
      mask.textContent = (masked && input.value.length > 0) ? '**' : '';
      row.classList.toggle('masked', masked);
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      A.init(); A.click();
      open = !open;
      btn.classList.toggle('open', open);
      sync();
      input.focus();
    });
    input.addEventListener('input', sync);
    sync();

    return {
      sync,
      setOpen(v) { open = !!v; btn.classList.toggle('open', open); sync(); }
    };
  }

  const eyeMain = makeEye('customRow', 'bombInput', 'eyeMask', 'eyeBtn');
  const eyeAgain = makeEye('againCustomRow', 'againInput', 'againEyeMask', 'againEyeBtn');

  const customRow = $('customRow');

  function updateEyeMask() { if (eyeMain) eyeMain.sync(); }
  function setEye(open) { if (eyeMain) eyeMain.setOpen(open); }

  /* ---------- 一行三胶囊：点击展开对应的小面板 ---------- */
  const modeChipVal = $('modeChipVal');
  const rangeChipVal = $('rangeChipVal');
  const playersChipVal = $('playersChipVal');
  const POP_PAIRS = [
    { chip: $('modeChip'), pop: $('modeOpts') },
    { chip: $('rangeChip'), pop: $('rangeOpts') },
    { chip: $('playersChip'), pop: $('playerOpts') },
    { chip: $('sectorChip'), pop: $('sectorOpts') },
    { chip: $('voiceChip'), pop: $('voiceOpts') },
    { chip: $('rateChip'), pop: $('rateOpts') },
    { chip: $('muteBtn'), pop: $('soundPop') }
  ];

  /* 同一时间只开一个面板 */
  function closePops(except) {
    POP_PAIRS.forEach(p => {
      if (p.pop === except) return;
      p.pop.hidden = true;
      p.chip.classList.remove('open');
      p.chip.setAttribute('aria-expanded', 'false');
    });
  }

  function togglePop(chip, pop) {
    const openIt = pop.hidden;
    closePops(openIt ? pop : null);
    pop.hidden = !openIt;
    chip.classList.toggle('open', openIt);
    chip.setAttribute('aria-expanded', String(openIt));
  }

  POP_PAIRS.forEach(p => {
    p.chip.addEventListener('click', () => {
      A.init();
      if (p.pop.hidden) A.click();   /* 只在展开时响一声 */
      togglePop(p.chip, p.pop);
    });
  });

  /* 点面板内部保持展开；点别处或按 Esc 收起。
     用 composedPath 判断：点击时若元素被自己的处理函数重建（比如常用名字点一下就重排），
     closest 会因为元素已脱离文档而认不出它在面板里，从而误关面板。 */
  document.addEventListener('click', e => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const inside = path.some(el => el && el.classList &&
      (el.classList.contains('pop') || el.classList.contains('chip') ||
       el.classList.contains('icon-btn') ||
       el.classList.contains('pick-overlay') || el.id === 'ocrOverlay'));
    if (inside) return;
    closePops(null);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePops(null);
  });

  /* 首屏让胶囊文字与当前选中项对齐 */
  function syncChips() {
    const r = document.querySelector('#rangeOpts .opt.active');
    const p = document.querySelector('#playerOpts .opt.active');
    const mo = document.querySelector('#modeOpts .seg-btn.active');
    if (r) rangeChipVal.textContent = r.textContent.trim();
    if (p) playersChipVal.textContent = p.textContent.trim();
    if (mo) modeChipVal.textContent = mo.textContent.trim();
  }
  syncChips();

  /* 小眼睛的点击已经由 makeEye() 统一接管 */

  /* 仅允许输入 1 ~ curMax 的整数：过滤非数字、位数不超过上限、超过上限即回退 */
  function sanitizeBombInput() {
    const el = $('bombInput');
    let v = el.value.replace(/\D/g, '');
    v = v.replace(/^0+/, '');
    const digits = String(curMax).length;
    if (v.length > digits) v = v.slice(0, digits);
    if (v !== '' && Number(v) > curMax) v = v.slice(0, -1);
    if (el.value !== v) el.value = v;
  }

  $('bombInput').addEventListener('input', () => {
    sanitizeBombInput();
    updateEyeMask();
  });

  setEye(false);   /* 默认就是隐藏状态，一开始就把输入框设成透明 */

  /* 模式切换：随机生成 / 自定义（自定义才显示输入行） */
  function applyBombMode(mode, focusInput) {
    const custom = mode === 'custom';
    document.querySelectorAll('#modeOpts .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    G.setMode(mode);
    const bi = $('bombInput');
    bi.disabled = !custom;
    customRow.hidden = !custom;
    modeChipVal.textContent = custom ? '自定义' : '随机生成';
    if (custom) { if (focusInput) bi.focus(); }
    else { bi.value = ''; setEye(false); }
  }

  document.querySelectorAll('#modeOpts .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      applyBombMode(btn.dataset.mode, true);
      closePops(null);
    });
  });

  /* 数字范围选择：切换上限并重建棋盘 */
  const rangeOpts = $('rangeOpts');
  rangeOpts.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      rangeOpts.querySelectorAll('.opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      curMax = parseInt(btn.dataset.max, 10);
      G.setMax(curMax);
      G.buildBoard(curMax);
      const bi = $('bombInput');
      if (bi.value !== '' && Number(bi.value) > curMax) bi.value = '';
      sanitizeBombInput();
      updateEyeMask();
      rangeChipVal.textContent = btn.textContent.trim();
      closePops(null);
    });
  });

  /* 玩家人数选择 */
  const playerOpts = $('playerOpts');
  playerOpts.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      playerOpts.querySelectorAll('.opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cnt = parseInt(btn.dataset.players, 10);
      G.setPlayers(cnt);
      if (window.Wheel) window.Wheel.setPlayers(cnt);   /* 转盘也按这个人数轮流 */
      playersChipVal.textContent = btn.textContent.trim();
      saveCount(cnt);
      renderNameRows(cnt);          /* 名字行跟着人数增减，已填的名字不丢 */
      renderPool();
    });
  });

  /* ---------- 玩家名字：自定义输入 + 本地记忆 ---------- */
  const N = window.Names;
  const nameRows = $('nameRows');
  const namePool = $('namePool');

  function renderNameRows(count) {
    nameRows.innerHTML = '';
    const total = Math.min(count, N.MAX_SLOTS);
    for (let i = 1; i <= total; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';

      const idx = document.createElement('span');
      idx.className = 'name-idx';
      idx.textContent = String(i);

      const input = document.createElement('input');
      input.className = 'name-input';
      input.type = 'text';
      input.maxLength = N.MAX_LEN;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.slot = String(i);
      input.value = N.raw(i - 1);      /* 上次填过的自动带出来 */
      input.placeholder = '玩家 ' + i;

      row.appendChild(idx);
      row.appendChild(input);
      nameRows.appendChild(row);
    }
  }

  /* 常用名字池：点一下就填到第一个空位 */
  function renderPool() {
    const list = N.getPool();
    namePool.innerHTML = '';
    namePool.hidden = list.length === 0;
    list.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'name-chip';
      b.textContent = name;
      b.addEventListener('click', () => {
        A.init(); A.click();
        const inputs = Array.prototype.slice.call(nameRows.querySelectorAll('.name-input'));
        const target = inputs.filter(x => !x.value.trim())[0] || inputs[inputs.length - 1];
        if (!target) return;
        const slot = parseInt(target.dataset.slot, 10);
        target.value = name;
        N.set(slot, name);
        N.addPool(name);
        renderPool();
      });
      namePool.appendChild(b);
    });
  }

  nameRows.addEventListener('input', e => {
    const el = e.target.closest('.name-input');
    if (!el) return;
    N.set(parseInt(el.dataset.slot, 10), el.value);
    if (window.Wheel) window.Wheel.refreshWho();   /* 改名后「轮到 X」跟着变 */
  });

  /* 填完（失焦或回车）才进常用池，免得「张」「张三」这种中间状态也被记下来 */
  nameRows.addEventListener('change', e => {
    const el = e.target.closest('.name-input');
    if (!el) return;
    N.remember(parseInt(el.dataset.slot, 10));
    renderPool();
    if (window.Wheel) window.Wheel.refreshWho();
  });

  const firstPlayers = document.querySelector('#playerOpts .opt.active');
  const firstCount = firstPlayers ? parseInt(firstPlayers.dataset.players, 10) : 4;
  renderNameRows(firstCount);
  renderPool();
  if (window.Wheel) window.Wheel.setPlayers(firstCount);

  /* 从屏幕框选识别的名字，按顺序填进玩家位 */
  function fillPlayerNames(list) {
    const inputs = Array.prototype.slice.call(nameRows.querySelectorAll('.name-input'));
    list.slice(0, inputs.length).forEach((name, i) => {
      const slot = parseInt(inputs[i].dataset.slot, 10);
      inputs[i].value = name;
      N.set(slot, name);
      N.addPool(name);
    });
    renderPool();
  }

  if (window.OcrNames) window.OcrNames.init({ onFill: fillPlayerNames });

  /* 人数也跟着记住：下次打开还是上次那几个人 */
  const COUNT_KEY = 'number-bomb-players-count-v1';

  function saveCount(n) {
    try { localStorage.setItem(COUNT_KEY, String(n)); } catch (e) {}
  }

  (function restoreCount() {
    let n = 0;
    try { n = parseInt(localStorage.getItem(COUNT_KEY), 10) || 0; } catch (e) {}
    if (!n) return;
    const btn = playerOpts.querySelector('.opt[data-players="' + n + '"]');
    if (!btn) return;
    playerOpts.querySelectorAll('.opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    G.setPlayers(n);
    if (window.Wheel) window.Wheel.setPlayers(n);
    playersChipVal.textContent = btn.textContent.trim();
    renderNameRows(n);
  })();

  /* ---------- 玩法切换：数字炸弹 / 转盘 ---------- */
  const W = window.Wheel;
  const gameTitle = $('gameTitle');
  const gameSub = $('gameSub');
  const bombPanel = $('bombPanel');
  const wheelPanel = $('wheelPanel');
  const startBtn = $('startBtn');
  const wheelSpinBtn = $('wheelSpinBtn');
  const confirmBtn = $('confirmPlayersBtn');
  const actionRow = $('actionRow');
  let gameMode = 'bomb';
  let playersConfirmed = false;      /* 转盘模式：这次启动里人数确认过没有 */

  /* 转盘模式：没确认人数就只显示「先选人数」提示，确认后才出转盘 */
  function refreshWheelGate() {
    const needConfirm = gameMode === 'wheel' && !playersConfirmed;
    confirmBtn.hidden = !needConfirm;
    actionRow.hidden = gameMode === 'wheel' && !needConfirm;   /* 转盘确认后这行就没按钮了 */
    document.body.classList.toggle('wheel-ready', gameMode === 'wheel' && !needConfirm);
    if (W) W.setReady(!needConfirm);
  }

  function setGameMode(mode) {
    gameMode = mode;
    const wheel = mode === 'wheel';
    document.querySelectorAll('#modeSwitch .mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.game === mode));
    document.body.classList.toggle('wheel-mode', wheel);  /* 藏起「炸弹 / 范围」两个胶囊 */
    bombPanel.hidden = wheel;          /* 炸弹数字 / 范围 / 自定义输入 只在数字炸弹出现 */
    wheelPanel.hidden = !wheel;
    startBtn.hidden = wheel;           /* 转盘模式下由圆盘中心按钮开转 */
    gameTitle.textContent = wheel ? '惩罚转盘' : '数字炸弹';
    gameSub.textContent = wheel ? '转到哪条就做哪条' : '猜错的数字会消失 · 踩中炸弹者受罚';
    closePops(null);
    refreshWheelGate();
  }

  document.querySelectorAll('#modeSwitch .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.game === gameMode) return;
      A.init(); A.click();
      setGameMode(btn.dataset.game);
    });
  });

  wheelSpinBtn.addEventListener('click', () => { A.init(); W.spin(); });

  /* 「确认」：人数和名字都定好了，放行转盘 */
  confirmBtn.addEventListener('click', () => {
    A.init(); A.click();
    playersConfirmed = true;
    closePops(null);
    refreshWheelGate();
  });

  /* 扇区数：下拉选（12 / 24 / 48 / 全部），默认 24 */
  const sectorChipVal = $('sectorChipVal');
  const sectorOpts = $('sectorOpts');

  function syncSectorUI() {
    const cur = W.getSectorCount();
    sectorChipVal.textContent = (cur === 'all' ? '全部' : cur);
    sectorOpts.querySelectorAll('.opt').forEach(b =>
      b.classList.toggle('active', b.dataset.sectors === cur));
  }

  sectorOpts.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      W.setSectorCount(btn.dataset.sectors);
      syncSectorUI();
      closePops(null);
    });
  });
  syncSectorUI();

  /* ---------- 设置里的「朗读」：开关 / 声音 / 语速 ---------- */
  const ttsToggleBtn = $('ttsToggleBtn');
  const ttsHint = $('ttsHint');
  const voiceOpts = $('voiceOpts');
  const rateOpts = $('rateOpts');

  function shortVoiceName(name) {
    /* 桌面版走 WinRT，名字换成中文（慧慧 / 康康 / 瑶瑶） */
    if (window.Speech && window.Speech.voiceLabel) return window.Speech.voiceLabel(name);
    const m = /Microsoft\s+(\S+)/i.exec(name || '');
    return m ? m[1] : (name || '').replace(/\s*-\s*.*$/, '');
  }

  function renderVoiceOpts() {
    const S = window.Speech;
    const list = S ? S.listVoices() : [];
    voiceOpts.innerHTML = '';
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'set-hint';
      d.style.textAlign = 'left';
      d.textContent = '这台机器上没有检测到可用语音';
      voiceOpts.appendChild(d);
      return;
    }
    const cur = S.getVoice();
    list.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (v.name === cur ? ' active' : '');
      b.textContent = shortVoiceName(v.name);
      b.title = v.name;
      b.addEventListener('click', () => {
        A.init();
        S.setVoice(v.name);
        renderVoiceOpts();
        syncSpeechUI();
        S.speak('你好，我是' + shortVoiceName(v.name));
        A.click();
        closePops(null);
      });
      voiceOpts.appendChild(b);
    });
  }

  function syncSpeechUI() {
    const S = window.Speech;
    const ok = !!(S && S.available());
    /* 朗读开关已经搬到右上角小喇叭那边了（这里不再重复放一个） */
    if (ttsToggleBtn) {
      const on = ok && S.getEnabled();
      ttsToggleBtn.textContent = on ? '已开启' : '已关闭';
      ttsToggleBtn.classList.toggle('off', !on);
      ttsToggleBtn.disabled = !ok;
    }
    if (ttsHint) ttsHint.textContent = ok ? shortVoiceName(S.getVoice()) : '没有可用语音';
    rateOpts.querySelectorAll('.opt').forEach(b =>
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.rate) - (S ? S.getRate() : 1.05)) < 0.001));
    /* 两个下拉胶囊上显示当前选择 */
    const vc = $('voiceChipVal');
    if (vc) vc.textContent = ok ? shortVoiceName(S.getVoice()) : '无语音';
    const rc = $('rateChipVal');
    const rateActive = rateOpts.querySelector('.opt.active');
    if (rc) rc.textContent = rateActive ? rateActive.textContent.trim() : '正常';
  }

  if (ttsToggleBtn) ttsToggleBtn.addEventListener('click', () => {
    A.init(); A.click();
    const S = window.Speech;
    if (!S || !S.available()) return;
    const on = !S.getEnabled();
    S.setEnabled(on);
    syncSpeechUI();
    if (on) S.speak('已开启朗读');
  });

  rateOpts.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      window.Speech.setRate(parseFloat(btn.dataset.rate));
      syncSpeechUI();
      window.Speech.speak('这个语速可以吗');
      closePops(null);
    });
  });

  renderVoiceOpts();
  syncSpeechUI();
  /* 语音列表是异步拿的（桌面版走 WinRT，能拿到慧慧/瑶瑶/康康），拿到后重画一次 */
  if (window.Speech.setVoicesListener) {
    window.Speech.setVoicesListener(() => { renderVoiceOpts(); syncSpeechUI(); });
  }
  setTimeout(() => { renderVoiceOpts(); syncSpeechUI(); }, 500);
  setTimeout(() => { renderVoiceOpts(); syncSpeechUI(); }, 1500);

  $('startBtn').addEventListener('click', () => G.start());

  /* 「再来一局」：随机就直接开下一局；自定义才弹出来问一下 */
  let againMode = 'random';

  function setAgainMode(mode, focusInput) {
    againMode = mode;
    document.querySelectorAll('#againMode .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    $('againCustomRow').hidden = mode !== 'custom';
    $('againTip').textContent = '';
    if (mode === 'custom' && focusInput) setTimeout(() => $('againInput').focus(), 50);
  }

  $('againBtn').addEventListener('click', () => {
    A.init(); A.click();
    if (G.getMode() === 'random') { G.start(); return; }   /* 随机：直接下一局 */
    $('againInput').value = '';
    $('againInput').placeholder = '1 ~ ' + curMax;
    setAgainMode('custom', true);
    $('againOverlay').hidden = false;
  });

  $('againBackBtn').addEventListener('click', () => {
    A.init(); A.click();
    $('againOverlay').hidden = true;
    G.resetToSetup();
  });

  document.querySelectorAll('#againMode .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      A.init(); A.click();
      setAgainMode(btn.dataset.mode, true);
    });
  });

  $('againInput').addEventListener('input', () => {
    const el = $('againInput');
    let v = el.value.replace(/\D/g, '').replace(/^0+/, '');
    const digits = String(curMax).length;
    if (v.length > digits) v = v.slice(0, digits);
    if (v !== '' && Number(v) > curMax) v = v.slice(0, -1);
    if (el.value !== v) el.value = v;
  });

  $('againStartBtn').addEventListener('click', () => {
    A.init(); A.click();
    if (againMode === 'random') {
      applyBombMode('random', false);
      $('againOverlay').hidden = true;
      G.start();
      return;
    }
    const v = $('againInput').value;
    if (!v) { $('againTip').textContent = '请输入 1 ~ ' + curMax + ' 的数字'; return; }
    applyBombMode('custom', false);
    $('bombInput').value = v;
    updateEyeMask();               /* 把值同步过去之后，星号也要跟着刷新 */
    $('againOverlay').hidden = true;
    G.start();
  });

  $('restartBtn').addEventListener('click', () => {
    A.init(); A.click();
    G.resetToSetup();
  });

  /* ---------- 小喇叭：三条音轨（总音量 / 音效 / 语音） ---------- */
  const TRACKS = [
    { kind: 'master', range: 'volMaster', label: 'volMasterVal' },
    { kind: 'sfx', range: 'volSfx', label: 'volSfxVal' },
    { kind: 'voice', range: 'volVoice', label: 'volVoiceVal' }
  ];

  function syncSoundUI() {
    TRACKS.forEach(t => {
      const pct = Math.round(A.getVolume(t.kind) * 100);
      const r = $(t.range);
      if (r && Number(r.value) !== pct) r.value = String(pct);
      const lb = $(t.label);
      if (lb) lb.textContent = pct + '%';
    });
    /* 三条都为 0（或有音轨被拉到 0 到底）时，喇叭打斜杠 */
    const silent = A.getSfxAmp() <= 0 && A.getVoiceAmp() <= 0;
    $('muteBtn').classList.toggle('off', silent);
    syncSpeechUI();
  }

  let lastVolTick = 0;
  TRACKS.forEach(t => {
    const r = $(t.range);
    if (!r) return;
    r.addEventListener('input', () => {
      A.init();
      A.setVolume(t.kind, Number(r.value) / 100);
      const lb = $(t.label);
      if (lb) lb.textContent = Math.round(A.getVolume(t.kind) * 100) + '%';
      const silent = A.getSfxAmp() <= 0 && A.getVoiceAmp() <= 0;
      $('muteBtn').classList.toggle('off', silent);

      /* 边拉边响：像系统调音量那样给个「咚」，能直接听出当前大小 */
      if (t.kind === 'voice') return;
      const now = Date.now();
      if (now - lastVolTick > 170) {
        lastVolTick = now;
        A.volumeTick();
      }
    });
    r.addEventListener('change', () => {
      syncSoundUI();
      /* 语音轨松手时用当前音量念一句，好确认声音大小 */
      if (t.kind === 'voice') window.Speech.speak('这个音量可以吗');
      else A.volumeTick();
    });
  });

  $('muteAllBtn').addEventListener('click', () => {
    A.init(); A.click();
    A.setVolume({ master: 0, sfx: 0, voice: 0 });
    syncSoundUI();
  });

  syncSoundUI();

  /* ---------- 惩罚设置 ---------- */
  const P = window.Punishments;

  function renderPunishList() {
    const box = $('punishList');
    const arr = P.list();
    box.innerHTML = '';
    /* 惩罚变了，圆盘跟着重建（转动中先不动，免得半路回转） */
    if (!W.isSpinning()) W.build();
    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'punish-empty';
      empty.textContent = '还没有惩罚，添加一条吧';
      box.appendChild(empty);
      return;
    }
    arr.forEach((text, i) => {
      const item = document.createElement('div');
      item.className = 'punish-item';
      const span = document.createElement('span');
      span.className = 'punish-text';
      span.textContent = text;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'punish-del';
      del.dataset.index = i;
      del.setAttribute('aria-label', '删除');
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
      item.appendChild(span);
      item.appendChild(del);
      box.appendChild(item);
    });
  }

  function punishTip(msg, ok) {
    const el = $('punishTip');
    el.textContent = msg || '';
    el.classList.toggle('ok', !!ok);
  }

  function doAdd() {
    A.init();
    const input = $('punishInput');
    const res = P.add(input.value);
    if (!res.ok) { punishTip(res.msg, false); return; }
    input.value = '';
    input.focus();
    renderPunishList();
    punishTip('已添加', true);
    A.click();
  }

  /* 顶栏那个齿轮是全局设置：什么时候都能点开（设置页 / 游戏中都行） */
  $('settingsBtn').addEventListener('click', () => {
    A.init(); A.click();
    punishTip('');
    renderPunishList();
    syncSpeechUI();
    $('punishOverlay').hidden = false;
  });

  $('punishCloseBtn').addEventListener('click', () => {
    A.init(); A.click();
    punishTip('');
    $('punishOverlay').hidden = true;
  });

  $('punishAddBtn').addEventListener('click', doAdd);

  $('punishInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
  });

  $('punishList').addEventListener('click', e => {
    const btn = e.target.closest('.punish-del');
    if (!btn) return;
    A.init(); A.click();
    P.remove(parseInt(btn.dataset.index, 10));
    renderPunishList();
    punishTip('');
  });

  $('punishResetBtn').addEventListener('click', () => {
    A.init(); A.click();
    P.reset();
    renderPunishList();
    punishTip('已恢复默认', true);
  });

  /* 抽惩罚现在归转盘玩法管，数字炸弹这边不再放「随机抽一条惩罚」 */

  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
})();
