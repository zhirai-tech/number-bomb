/* ============================================================
   惩罚转盘：把惩罚画成圆盘，点中间的开转，停下显示抽中的那条
   扇区数可选：12 / 24 / 48 / 全部（全部 = 一条一个扇区）
   对外暴露 window.Wheel
   ============================================================ */
window.Wheel = (function () {
  const NS = 'http://www.w3.org/2000/svg';

  /* 圆盘几何：viewBox 320×344，圆心 (160,184)，半径 150 */
  const CX = 160, CY = 184, R = 150;
  const SECTOR_KEY = 'number-bomb-wheel-sectors-v1';
  const DEFAULT_LIMIT = 24;   /* 默认 24 个扇区 */
  const SPIN_MS = 3600;       /* 转动时长，与 CSS 里的 transition 保持一致 */
  const FILLS = ['#0e7d5c', '#13a87b', '#0b6a4e', '#16b98b'];

  let limit = readLimit();   /* 12 / 24 / 48 / Infinity（全部） */
  let groups = [];           /* 每个扇区对应的惩罚数组 */
  let textEls = [];          /* 每个扇区的文字节点 */
  let currentDeg = 0;        /* 当前累计旋转角度 */
  let lastIndex = -1;        /* 上一次停下的扇区 */
  let spinning = false;
  let playerCount = 1;       /* 人数：>1 时转盘按玩家轮流 */
  let playerIndex = 1;       /* 轮到第几个玩家 */

  const $ = id => document.getElementById(id);

  /* 玩家名字：填过就用名字，没填回退「玩家 N」 */
  function whoIs(n) {
    return window.Names ? window.Names.display(n) : ('玩家 ' + n);
  }

  function hasCustomName(n) {
    return !!(window.Names && window.Names.isCustom && window.Names.isCustom(n));
  }

  /* 单人且没起名字时不显示「轮到谁」 */
  function showWho() {
    return playerCount > 1 || hasCustomName(playerIndex);
  }

  function setWho(text) {
    const el = $('wheelWho');
    if (!el) return;
    if (!text) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = text;
  }

  function refreshWho() {
    if (spinning) return;
    setWho(showWho() ? ('轮到 ' + whoIs(playerIndex)) : '');
  }

  /* 人数变了：重排轮流顺序 */
  function setPlayers(n) {
    playerCount = Math.max(1, n || 1);
    playerIndex = 1;
    refreshWho();
  }

  function getPlayerIndex() { return playerIndex; }
  const rad = deg => deg * Math.PI / 180;
  const px = (ang, r) => CX + r * Math.cos(rad(ang));
  const py = (ang, r) => CY + r * Math.sin(rad(ang));

  function readLimit() {
    try {
      const raw = localStorage.getItem(SECTOR_KEY);
      if (raw === 'all') return Infinity;
      const n = parseInt(raw, 10);
      if (n === 12 || n === 24 || n === 48) return n;
    } catch (e) {}
    return DEFAULT_LIMIT;
  }

  function node(name, attrs, text) {
    const el = document.createElementNS(NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }

  function shorten(s, max) {
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function list() {
    return window.Punishments ? window.Punishments.list() : [];
  }

  /* 扇区多了就缩小字号、把文字往外挪，免得挤在圆心糊成一团 */
  function styleFor(n) {
    if (n <= 12) return { font: 9.5, r: 54, max: 9 };
    if (n <= 24) return { font: 7.5, r: 66, max: 6 };
    if (n <= 48) return { font: 6, r: 86, max: 4 };
    return { font: 5.2, r: 106, max: 4 };
  }

  /* 把惩罚轮流分到 n 个扇区里（保证没有空扇区） */
  function splitGroups(arr, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push([]);
    arr.forEach((item, i) => out[i % n].push(item));
    return out;
  }

  function setSpinBtn(state) {
    const b = $('wheelSpinBtn');
    if (!b) return;
    if (state === 'spinning') {
      b.disabled = true; b.textContent = '转动中'; b.classList.add('busy');
    } else if (state === 'empty') {
      b.disabled = true; b.textContent = '开始'; b.classList.remove('busy');
    } else {
      b.disabled = false; b.textContent = '开始'; b.classList.remove('busy');
    }
  }

  /* ---------- 画圆盘 ---------- */
  function build() {
    const rot = $('wheelRot');
    const meta = $('wheelMeta');
    const box = $('wheelResult');
    if (!rot || spinning) return;

    const arr = list();
    const n = Math.max(1, Math.min(arr.length, limit));
    groups = arr.length ? splitGroups(arr, n) : [];
    textEls = [];
    lastIndex = -1;

    rot.innerHTML = '';
    /* 重建时不要出现回转动画 */
    rot.style.transition = 'none';
    rot.style.transform = 'rotate(0deg)';
    currentDeg = 0;
    void rot.getBoundingClientRect();
    rot.style.transition = '';

    if (!arr.length) {
      if (meta) meta.textContent = '还没有惩罚';
      const pun = $('wheelPunish');
      if (pun) pun.textContent = '先去「惩罚设置」里加几条惩罚';
      setWho('');
      setSpinBtn('empty');
      return;
    }
    setSpinBtn('ready');

    const st = styleFor(n);
    const step = 360 / n;

    for (let i = 0; i < n; i++) {
      const a0 = -90 + i * step;
      const a1 = a0 + step;
      const large = step > 180 ? 1 : 0;
      rot.appendChild(node('path', {
        d: `M ${CX} ${CY} L ${px(a0, R).toFixed(2)} ${py(a0, R).toFixed(2)} ` +
           `A ${R} ${R} 0 ${large} 1 ${px(a1, R).toFixed(2)} ${py(a1, R).toFixed(2)} Z`,
        fill: FILLS[i % FILLS.length],
        stroke: 'rgba(215,255,235,.55)',
        'stroke-width': n > 48 ? 0.5 : 1
      }));

      /* 文字沿半径方向排版；左半边翻转 180° 才不会倒着念 */
      const ang = a0 + step / 2;
      const flip = Math.cos(rad(ang)) < 0;
      const tx = px(ang, st.r);
      const ty = py(ang, st.r);
      const te = node('text', {
        x: tx.toFixed(2),
        y: ty.toFixed(2),
        'font-size': st.font,
        'font-weight': 700,
        fill: '#eafff5',
        'text-anchor': flip ? 'end' : 'start',
        'dominant-baseline': 'middle',
        transform: `rotate(${(flip ? ang + 180 : ang).toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`
      }, shorten(groups[i][0], st.max));
      textEls.push(te);
      rot.appendChild(te);
    }

    const per = Math.max(...groups.map(g => g.length));
    const min = Math.min(...groups.map(g => g.length));
    if (meta) {
      meta.textContent = arr.length <= n
        ? `共 ${arr.length} 条惩罚 · 一条一个扇区`
        : `共 ${arr.length} 条惩罚 · ${n} 个扇区，每扇区 ${min === per ? per : min + '~' + per} 条`;
    }
    const pun = $('wheelPunish');
    if (pun && !box.dataset.keep) pun.textContent = '点中间的开始按钮开转';
    refreshWho();
  }

  /* ---------- 扇区数：12 / 24 / 48 / 全部 ---------- */
  function setSectorCount(v) {
    if (spinning) return;
    limit = (v === 'all') ? Infinity : (parseInt(v, 10) || DEFAULT_LIMIT);
    try { localStorage.setItem(SECTOR_KEY, limit === Infinity ? 'all' : String(limit)); } catch (e) {}
    build();
  }

  function getSectorCount() { return limit === Infinity ? 'all' : String(limit); }

  /* 扇区文字 = 该组第一条（预览用）；停下后把中奖那条写到指针所在的扇区上，
     这样「指针指着的文字」和「结果」永远对得上 */
  function setSectorText(i, s) {
    if (textEls[i]) textEls[i].textContent = shorten(s, styleFor(groups.length).max);
  }

  function resetLabels() {
    for (let i = 0; i < groups.length; i++) setSectorText(i, groups[i][0]);
  }

  /* ---------- 转 ---------- */
  function spin() {
    if (spinning || !groups.length) return;

    const arr = list();
    if (!arr.length) return;

    const rot = $('wheelRot');
    const box = $('wheelResult');
    if (!rot) return;

    spinning = true;
    setSpinBtn('spinning');
    resetLabels();

    /* 这一轮归谁：按下按钮时锁定，转完再轮到下一个 */
    const turnPlayer = playerIndex;
    if (showWho()) setWho('轮到 ' + whoIs(turnPlayer));

    /* 先等概率抽一条惩罚，再找它所在的扇区——保证每条惩罚机会均等 */
    const target = arr[Math.floor(Math.random() * arr.length)];
    let k = 0;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].indexOf(target) !== -1) { k = i; break; }
    }

    const n = groups.length;
    const step = 360 / n;
    const sectorCenter = -90 + (k + 0.5) * step;           /* 该扇区中心当前所在角度 */
    const jitter = (Math.random() - 0.5) * step * 0.62;     /* 落点在扇区内随机偏移一点 */
    const wantMod = (((-90 - sectorCenter - jitter) % 360) + 360) % 360;  /* 让扇区中心对准正上方 */
    const curMod = ((currentDeg % 360) + 360) % 360;
    const delta = ((wantMod - curMod) % 360 + 360) % 360;
    const turns = 5 + Math.floor(Math.random() * 3);        /* 5~7 圈 */

    currentDeg += turns * 360 + delta;
    rot.style.transform = `rotate(${currentDeg.toFixed(2)}deg)`;

    if (box) {
      const pun = $('wheelPunish');
      if (pun) pun.textContent = '转动中…';
      box.classList.remove('show');
      delete box.dataset.keep;
    }
    if (window.AudioEngine) { window.AudioEngine.init(); window.AudioEngine.click(); }

    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      rot.removeEventListener('transitionend', finish);
      spinning = false;
      setSpinBtn('ready');
      lastIndex = k;
      setSectorText(k, target);      /* 指针停的扇区直接显示抽中的那条 */
      const who = showWho() ? whoIs(turnPlayer) : '';
      setWho(who ? (who + ' 抽到') : '');
      if (box) {
        const pun = $('wheelPunish');
        if (pun) pun.textContent = target;
        box.classList.add('show');
        box.dataset.keep = '1';
      }
      if (window.AudioEngine) window.AudioEngine.start();
      /* 念结果：多人（或起了名字）就连玩家一起念 */
      if (window.Speech) window.Speech.speak(who ? (who + '，' + target) : target);
      /* 轮到下一个人 */
      if (playerCount > 1) playerIndex = playerIndex % playerCount + 1;
    };
    rot.addEventListener('transitionend', finish);
    timer = setTimeout(finish, SPIN_MS + 500);   /* 兜底：万一 transitionend 没触发 */
  }

  /* 人数确认前先不显示转盘，只显示「先选人数」提示 */
  function setReady(ready) {
    const gate = $('wheelGate');
    const body = $('wheelBody');
    if (gate) gate.hidden = !!ready;
    if (body) body.hidden = !ready;
    if (ready) build();
  }

  function isReady() {
    const body = $('wheelBody');
    return !!body && !body.hidden;
  }

  function isSpinning() { return spinning; }
  function getLastIndex() { return lastIndex; }

  return {
    build, spin, isSpinning, getLastIndex,
    setSectorCount, getSectorCount, setPlayers, getPlayerIndex,
    refreshWho, setReady, isReady
  };
})();
