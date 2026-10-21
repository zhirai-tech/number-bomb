/* ============================================================
   游戏逻辑：棋盘、状态、判定
   对外暴露 window.Game
   ============================================================ */
window.Game = (function () {
  const A = window.AudioEngine;
  const $ = id => document.getElementById(id);

  const board = $('board');
  const boardWrap = $('boardWrap');
  const cells = {};
  let state = null;
  let bombMode = 'random';
  let maxN = 100;       /* 数字范围上限：1 ~ maxN */
  let playerCount = 4;  /* 玩家人数 */
  let boardCols = 5;    /* 当前棋盘列数 */
  let boardRows = 10;   /* 当前棋盘行数 */

  /* 每行固定 10 个：100 → 10×10，50 → 10×5，30 → 10×3 */
  const COLS = 10;

  /* ---------- 动态计算格子尺寸 ----------
     格子永远是同样大小的小正方形：取「按列算」和「按行算」里更小的那个，
     两个方向用同一个尺寸，不会一会儿拉长一会儿压扁 */
  function fitBoard() {
    const wrapW = boardWrap.clientWidth;
    const wrapH = boardWrap.clientHeight;
    if (wrapW <= 0 || wrapH <= 0) return;
    const gap = Math.max(2, Math.min(6, Math.min(wrapW, wrapH) * 0.008));
    const byW = (wrapW - gap * (boardCols - 1)) / boardCols;
    const byH = (wrapH - gap * (boardRows - 1)) / boardRows;
    const cell = Math.max(16, Math.floor(Math.min(byW, byH)));
    const root = document.documentElement.style;
    root.setProperty('--cell', cell + 'px');
    root.setProperty('--gap', gap + 'px');
    root.setProperty('--cols', String(boardCols));
    root.setProperty('--rows', String(boardRows));
  }

  /* ---------- 按当前范围重建棋盘 ---------- */
  function buildBoard(n) {
    board.innerHTML = '';
    for (const k in cells) delete cells[k];
    boardCols = COLS;
    boardRows = Math.ceil(n / boardCols);
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.textContent = i;
      b.addEventListener('click', () => guess(i));
      frag.appendChild(b);
      cells[i] = b;
    }
    board.appendChild(frag);
    fitBoard();
  }

  function setMode(mode) { bombMode = mode; }
  function getMode() { return bombMode; }

  function setMax(n) {
    maxN = n;
    $('rangeText').textContent = '1 – ' + n;
    $('leftText').textContent = n + ' 个数字';
    const bi = $('bombInput');
    if (bi) bi.placeholder = '1 ~ ' + n;
  }

  function setPlayers(n) { playerCount = n; }

  /* 更新顶栏轮次显示：多人时显示当前玩家（有名字就显示名字），单人时隐藏 */
  function updateTurn() {
    const chip = $('turnChip');
    if (!chip) return;
    if (!state || playerCount <= 1) { chip.hidden = true; return; }
    chip.hidden = false;
    $('turnText').textContent = whoIs(state.turn);
  }

  /* 玩家名字：填过就用名字，没填回退「玩家 N」 */
  function whoIs(n) {
    return window.Names ? window.Names.display(n) : ('玩家 ' + n);
  }

  /* 念惩罚时要不要带玩家名：多人一定带；单人只有自己起了名字才带 */
  function speechWho(n) {
    if (playerCount > 1) return whoIs(n);
    return (window.Names && window.Names.isCustom && window.Names.isCustom(n)) ? whoIs(n) : '';
  }

  /* ---------- 开始游戏 ---------- */
  function start() {
    A.init();
    let bomb;
    if (bombMode === 'random') {
      bomb = 1 + Math.floor(Math.random() * maxN);
    } else {
      bomb = parseInt($('bombInput').value, 10);
      /* 输入框已限制当前范围，这里静默兜底：非法值不弹提示，自动恢复为空 */
      if (!Number.isInteger(bomb) || bomb < 1 || bomb > maxN) {
        $('bombInput').value = '';
        return;
      }
    }
    state = { bomb, low: 1, high: maxN, tries: 0, over: false, turn: 1 };
    for (let i = 1; i <= maxN; i++) cells[i].className = 'cell';
    updateTurn();
    fitBoard();
    layout();
    A.start();
    $('setupOverlay').hidden = true;
    $('boomOverlay').hidden = true;
  }

  /* ---------- 回到设置页 ---------- */
  function resetToSetup() {
    $('boomOverlay').hidden = true;
    $('setupOverlay').hidden = false;
  }

  /* 猜掉的数字只在原地消失（留空位），位置固定不动：
     每个数字永远待在它最初的那一格，不会重排、不会乱窜 */
  function layout() {
    for (let i = 1; i <= maxN; i++) {
      const el = cells[i];
      if (i >= state.low && i <= state.high) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    boardRows = Math.max(1, Math.ceil(maxN / boardCols));   /* 行数按总数固定，不再随剩下多少变 */
    fitBoard();
    $('rangeText').textContent = state.low + ' – ' + state.high;
    $('leftText').textContent = (state.high - state.low + 1) + ' 个数字';
    $('tryCount').textContent = state.tries;
  }

  function guess(n) {
    A.init();
    if (!state || state.over) return;
    if (n < state.low || n > state.high) return;
    state.tries++;

    if (n === state.bomb) {
      state.over = true;
      const c = cells[n];
      c.classList.remove('hidden');
      c.classList.add('boom');
      A.gameOver();
      $('boomNum').textContent = n;
      $('boomTries').textContent = state.tries;
      let comment = '';
      if (state.tries <= 5)       comment = '运气不错，差点躲过';
      else if (state.tries <= 10) comment = '判断得还行';
      else if (state.tries <= 20) comment = '中规中矩';
      else                        comment = '这运气……有点背';
      $('boomComment').textContent = comment;
      const bp = $('boomPlayer');
      if (playerCount > 1) {
        bp.textContent = whoIs(state.turn) + ' 踩中炸弹';
        bp.hidden = false;
      } else {
        bp.hidden = true;
      }
      const p = window.Punishments ? window.Punishments.random() : '';
      $('boomPunish').textContent = p || '暂无惩罚';
      /* 念这条惩罚（带上玩家名）：稍等一下，免得和爆炸音效撞在一起 */
      if (p && window.Speech) {
        const who = speechWho(state.turn);
        setTimeout(() => {
          if (!$('boomOverlay').hidden) window.Speech.speak(who ? (who + '，' + p) : p);
        }, 700);
      }
      $('boomOverlay').hidden = false;
      const app = document.querySelector('#app');
      app.classList.remove('shake');
      void app.offsetWidth;
      app.classList.add('shake');
      setTimeout(() => app.classList.remove('shake'), 600);
      return;
    }

    let removedCount = 0;
    if (n < state.bomb) {
      removedCount = n - state.low + 1;
      state.low = n + 1;
    } else {
      removedCount = state.high - n + 1;
      state.high = n - 1;
    }
    A.click();
    A.disappear(removedCount);
    if (playerCount > 1) {
      state.turn = state.turn % playerCount + 1;
      updateTurn();
    }
    layout();
  }

  return { buildBoard, fitBoard, setMode, getMode, setMax, setPlayers, getPlayers: () => playerCount, start, resetToSetup };
})();
