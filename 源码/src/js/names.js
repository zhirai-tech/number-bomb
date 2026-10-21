/* ============================================================
   玩家名字：自定义输入 + 本地记忆
   - 留空则回退成「玩家 N」
   - 输过的名字进「常用名字池」，下次点一下就能填
   对外暴露 window.Names
   ============================================================ */
window.Names = (function () {
  const KEY = 'number-bomb-players-v1';
  const MAX_SLOTS = 8;    /* 最多 8 个玩家位 */
  const MAX_LEN = 6;      /* 名字最长 6 个字，顶栏和结算页才放得下 */
  const POOL_MAX = 20;

  let names = new Array(MAX_SLOTS).fill('');
  let pool = [];

  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.names)) {
      names = names.map((_, i) =>
        typeof raw.names[i] === 'string' ? raw.names[i].slice(0, MAX_LEN) : '');
    }
    if (raw && Array.isArray(raw.pool)) {
      pool = raw.pool.filter(s => typeof s === 'string' && s.trim()).slice(0, POOL_MAX);
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ names, pool })); } catch (e) {}
  }

  /* i 从 0 开始（存储下标） */
  function raw(i) { return names[i] || ''; }

  /* n 从 1 开始（玩家序号），给界面用 */
  function display(n) {
    const v = (names[n - 1] || '').trim();
    return v || ('玩家 ' + n);
  }

  function set(n, v) {
    if (n < 1 || n > MAX_SLOTS) return;
    names[n - 1] = String(v == null ? '' : v).replace(/\s+/g, ' ').slice(0, MAX_LEN);
    save();
  }

  /* 名字填完（失焦 / 回车）再进常用池，免得把「张」「张三」这种中间状态也记进去 */
  function remember(n) {
    const v = (names[n - 1] || '').trim();
    if (!v) return;
    pool = [v].concat(pool.filter(x => x !== v)).slice(0, POOL_MAX);
    save();
  }

  function addPool(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return;
    pool = [v].concat(pool.filter(x => x !== v)).slice(0, POOL_MAX);
    save();
  }

  function getPool() { return pool.slice(); }

  /* 这位玩家是不是起了自己的名字（没填就是默认「玩家 N」） */
  function isCustom(n) {
    return !!(names[n - 1] || '').trim();
  }

  function clear() {
    names = new Array(MAX_SLOTS).fill('');
    save();
  }

  return { MAX_SLOTS, MAX_LEN, raw, display, set, remember, addPool, getPool, clear, isCustom };
})();
