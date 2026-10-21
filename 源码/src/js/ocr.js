/* ============================================================
   从屏幕框选识别玩家名字
   - 调 Rust 侧：截屏 → 全屏框选 → 裁剪 → 系统 OCR
   - 识别结果先给你勾选确认，再按顺序填进玩家名字
   对外暴露 window.OcrNames
   ============================================================ */
window.OcrNames = (function () {
  const tauri = window.__TAURI__ && window.__TAURI__.core;
  const invoke = tauri && tauri.invoke ? tauri.invoke.bind(tauri.core || tauri) : null;

  let busy = false;
  let onFill = null;
  let els = {};

  /* OCR 原始行 → 候选名字 */
  /* Windows OCR 会在汉字之间插空格（「设 置」），先拼回去 */
  function cleanLine(raw) {
    let s = String(raw == null ? '' : raw).trim();
    s = s.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1');
    /* 拉丁字母被逐字空格隔开时也拼回去：A l i c e → Alice */
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 2 && parts.every(p => p.length === 1)) s = parts.join('');
    else s = s.replace(/\s{2,}/g, ' ').trim();
    s = s.replace(/^[^\w\u4e00-\u9fa5]+/, '');           /* 去掉行首图标、序号符号 */
    s = s.replace(/[^\w\u4e00-\u9fa5]+$/, '');           /* 去掉行尾符号 */
    return s.trim();
  }

  /* 明显不是人名的：按钮、标题、人数统计、界面短语 */
  const NOISE = /^(成员|群成员|主持人|全体成员|参会人|参会成员|与会人员|更多|搜索|取消|确定|确认|关闭|邀请|聊天|会议|文档|共享|共享屏幕|屏幕共享|静音|解除静音|离开|话筒|麦克风|摄像头|视频|设置|消息|通讯录|发现|我|全部|管理|返回|收起|展开|成员列表|正在发言|等待中|已入会|未入会|\d+\s*人|\d+)$/;
  /* 界面短语里常见的词：4 个字以上又带这些词的，基本不是名字 */
  const PHRASE = /(点击|邀请|加入|正在|共享|切换|开启|关闭|设置|搜索|聊天|通讯录|摄像头|麦克风|静音|离开|返回|展开|收起|更多|管理|确定|取消|请|会议号|设备|网络|画面|声音|录制|直播|参会|入会|成员|列表|申请|等待)/;

  function extractNames(lines) {
    const out = [];
    (lines || []).forEach(raw => {
      const s = cleanLine(raw);
      if (!s) return;
      if (s.length < 1 || s.length > 12) return;          /* 太长基本是句子/提示语 */
      if (NOISE.test(s)) return;
      if (s.length >= 4 && PHRASE.test(s)) return;        /* 界面短语 */
      if (/^[\d\s.,:;()（）【】\[\]]+$/.test(s)) return;    /* 纯数字/括号 */
      if (out.indexOf(s) !== -1) return;                  /* 去重 */
      out.push(s);
    });
    return out;
  }

  function available() { return !!invoke; }

  /* ---------- 框选界面 ---------- */
  function showSelectOverlay(shot) {
    return new Promise(resolve => {
      const ov = els.pickOverlay;
      const cv = els.pickCanvas;
      const mask = els.pickMask;
      const box = els.pickBox;
      const tip = els.pickTip;
      const actions = els.pickActions;

      cv.width = shot.width;
      cv.height = shot.height;
      const ctx = cv.getContext('2d');
      mask.width = shot.width;
      mask.height = shot.height;
      const mctx = mask.getContext('2d');
      mctx.clearRect(0, 0, mask.width, mask.height);

      let mode = 'rect';       /* rect = 框选，brush = 画笔涂 */
      let start = null;
      let last = null;
      let rect = null;         /* 框选区域（图片像素） */
      let brushBox = null;     /* 涂过的范围（图片像素） */

      box.hidden = true;
      actions.hidden = true;
      ov.hidden = false;
      setMode('rect');

      function setMode(m) {
        mode = m;
        document.querySelectorAll('#pickBar .pick-mode').forEach(b =>
          b.classList.toggle('active', b.dataset.pickmode === m));
        ov.classList.toggle('brush-mode', m === 'brush');
        box.hidden = true;
        actions.hidden = true;
        tip.textContent = m === 'brush'
          ? '按住左键，用画笔把要识别的名字涂一遍（只识别涂过的地方，Esc 取消）'
          : '按住鼠标左键，框住要识别的名字区域（Esc 取消）';
      }

      function toImage(e) {
        const r = cv.getBoundingClientRect();
        const sx = shot.width / r.width;
        const sy = shot.height / r.height;
        const x = Math.min(Math.max(0, (e.clientX - r.left) * sx), shot.width);
        const y = Math.min(Math.max(0, (e.clientY - r.top) * sy), shot.height);
        return { x, y };
      }

      function grow(p) {
        const pad = 14;
        const x1 = p.x - pad, y1 = p.y - pad, x2 = p.x + pad, y2 = p.y + pad;
        if (!brushBox) brushBox = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        else {
          const nx1 = Math.min(brushBox.x, x1), ny1 = Math.min(brushBox.y, y1);
          const nx2 = Math.max(brushBox.x + brushBox.w, x2), ny2 = Math.max(brushBox.y + brushBox.h, y2);
          brushBox = { x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 };
        }
      }

      function paint(p) {
        mctx.strokeStyle = 'rgba(52,211,153,.75)';
        mctx.fillStyle = 'rgba(52,211,153,.75)';
        mctx.lineWidth = 22;
        mctx.lineCap = 'round';
        mctx.lineJoin = 'round';
        if (last) {
          mctx.beginPath(); mctx.moveTo(last.x, last.y); mctx.lineTo(p.x, p.y); mctx.stroke();
        } else {
          mctx.beginPath(); mctx.arc(p.x, p.y, 11, 0, Math.PI * 2); mctx.fill();
        }
        last = p;
        grow(p);
      }

      function drawBox() {
        if (!rect) { box.hidden = true; return; }
        const r = cv.getBoundingClientRect();
        const kx = r.width / shot.width;
        const ky = r.height / shot.height;
        box.hidden = false;
        box.style.left = (r.left + rect.x * kx) + 'px';
        box.style.top = (r.top + rect.y * ky) + 'px';
        box.style.width = (rect.w * kx) + 'px';
        box.style.height = (rect.h * ky) + 'px';
        tip.textContent = Math.round(rect.w) + ' × ' + Math.round(rect.h) + ' 像素';
      }

      function onDown(e) {
        if (e.button !== 0) return;
        if (mode === 'brush') {
          painting = true;
          last = null;
          paint(toImage(e));
          e.preventDefault();
          return;
        }
        start = toImage(e);
        rect = { x: start.x, y: start.y, w: 0, h: 0 };
        drawBox();
        e.preventDefault();
      }
      let painting = false;
      function onMove(e) {
        if (painting) { paint(toImage(e)); return; }
        if (!start) return;
        const p = toImage(e);
        rect = {
          x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
          w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y)
        };
        drawBox();
      }
      function onUp() {
        if (painting) {
          painting = false;
          last = null;
          if (brushBox && brushBox.w > 12 && brushBox.h > 12) {
            actions.hidden = false;
            tip.textContent = '涂好了就点「识别这一块」，重涂请再画一次（Esc 取消）';
          }
          return;
        }
        if (!start) return;
        start = null;
        if (rect && rect.w > 8 && rect.h > 8) {
          actions.hidden = false;
          tip.textContent = '框好了就点「识别这一块」，重框请再拖一次（Esc 取消）';
        } else {
          rect = null;
          box.hidden = true;
          actions.hidden = true;
          tip.textContent = '框太小了，重新拖一个大一点的框（Esc 取消）';
        }
      }
      function current() {
        if (mode === 'brush') return brushBox ? Object.assign({}, brushBox) : null;
        return rect ? Object.assign({}, rect) : null;
      }
      function finish(val) {
        ov.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.removeEventListener('keydown', onKey);
        els.pickOkBtn.removeEventListener('click', onOk);
        els.pickCancelBtn.removeEventListener('click', onCancel);
        barBtns.forEach(b => b.removeEventListener('click', b.__h));
        ov.hidden = true;
        box.hidden = true;
        resolve(val);
      }
      function onOk() { const c = current(); finish(c ? { mode: mode, rect: c } : null); }
      function onCancel() { finish(null); }
      function onKey(e) {
        if (e.key === 'Escape') { finish(null); return; }
        if (e.key === 'Enter') { const c = current(); if (c && c.w > 8 && c.h > 8) finish({ mode: mode, rect: c }); }
      }

      const barBtns = Array.prototype.slice.call(document.querySelectorAll('#pickBar .pick-mode'));
      barBtns.forEach(b => {
        b.__h = () => {
          if (b.dataset.pickmode === mode) return;
          setMode(b.dataset.pickmode);
        };
        b.addEventListener('click', b.__h);
      });

      /* 把截图铺到画布上（画布尺寸 = 图片原始像素，显示时按窗口缩放） */
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        ov.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        document.addEventListener('keydown', onKey);
        els.pickOkBtn.addEventListener('click', onOk);
        els.pickCancelBtn.addEventListener('click', onCancel);
      };
      img.onerror = () => finish(null);
      img.src = shot.dataUrl;
    });
  }

  /* 画笔模式：只保留涂过的地方，其余垫白底 */
  function cropMasked(shot, rect, maskCanvas) {
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    const img = new Image();
    return new Promise(resolve => {
      img.onload = () => {
        sctx.drawImage(img, Math.round(rect.x), Math.round(rect.y), w, h, 0, 0, w, h);
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(maskCanvas, Math.round(rect.x), Math.round(rect.y), w, h, 0, 0, w, h);
        const out = document.createElement('canvas');
        out.width = w; out.height = h;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, w, h);
        octx.drawImage(src, 0, 0);
        resolve(out.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = shot.dataUrl;
    });
  }

  /* 按框裁出图片（PNG data URL） */
  function cropRegion(shot, rect) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(rect.w));
    cv.height = Math.max(1, Math.round(rect.h));
    const ctx = cv.getContext('2d');
    const img = new Image();
    return new Promise(resolve => {
      img.onload = () => {
        ctx.drawImage(img, Math.round(rect.x), Math.round(rect.y), cv.width, cv.height,
                      0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = shot.dataUrl;
    });
  }

  /* ---------- 结果确认面板 ---------- */
  function showResultPanel(names) {
    return new Promise(resolve => {
      const list = els.ocrList;
      const tip = els.ocrTip;
      const chosen = new Set(names.map((_, i) => i));

      function render() {
        list.innerHTML = '';
        names.forEach((name, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ocr-chip' + (chosen.has(i) ? ' on' : '');
          b.textContent = name;
          b.addEventListener('click', () => {
            if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
            b.classList.toggle('on', chosen.has(i));
            tip.textContent = '已选 ' + chosen.size + ' 个';
          });
          list.appendChild(b);
        });
        tip.textContent = '已选 ' + chosen.size + ' 个（点一下可以去掉）';
      }
      render();

      els.ocrOverlay.hidden = false;

      function close(val) {
        els.ocrOkBtn.removeEventListener('click', onOk);
        els.ocrCancelBtn.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        els.ocrOverlay.hidden = true;
        resolve(val);
      }
      function onOk() {
        close(names.filter((_, i) => chosen.has(i)));
      }
      function onCancel() { close(null); }
      function onKey(e) { if (e.key === 'Escape') onCancel(); }

      els.ocrOkBtn.addEventListener('click', onOk);
      els.ocrCancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
    });
  }

  /* ---------- 总流程 ---------- */
  async function pick() {
    if (!invoke || busy) return;
    if (!els.ocrTip) return null;
    busy = true;

    /* 先抢一下鼠标事件，保证 Esc 也能退出 */
    const fail = msg => {
      busy = false;
      els.ocrOverlay.hidden = true;
      els.pickOverlay.hidden = true;
      const tip = els.ocrBtnTip;
      if (tip) {
        tip.textContent = msg;
        tip.hidden = false;
      }
      return null;
    };

    try {
      const shot = await invoke('capture_screen');
      if (!shot || !shot.dataUrl) return fail('截屏失败，再试一次');

      try { await invoke('set_select_mode', { on: true }); } catch (e) {}
      const sel = await showSelectOverlay(shot);
      try { await invoke('set_select_mode', { on: false }); } catch (e) {}
      if (!sel || !sel.rect) { busy = false; return null; }

      const cropped = sel.mode === 'brush'
        ? await cropMasked(shot, sel.rect, els.pickMask)
        : await cropRegion(shot, sel.rect);
      if (!cropped) return fail('裁剪失败，再试一次');

      const lines = await invoke('ocr_png', { dataUrl: cropped });
      const names = extractNames(lines);
      if (!names.length) return fail('这一块没认出名字，换个框再试试');

      const picked = await showResultPanel(names);
      busy = false;
      if (!picked || !picked.length) return null;
      if (onFill) onFill(picked);
      return picked;
    } catch (e) {
      return fail('识别失败：' + (e && e.message ? e.message : e));
    }
  }

  function init(opts) {
    els = {
      pickOverlay: document.getElementById('pickOverlay'),
      pickCanvas: document.getElementById('pickCanvas'),
      pickMask: document.getElementById('pickMask'),
      pickBox: document.getElementById('pickBox'),
      pickTip: document.getElementById('pickTip'),
      pickActions: document.getElementById('pickActions'),
      pickOkBtn: document.getElementById('pickOkBtn'),
      pickCancelBtn: document.getElementById('pickCancelBtn'),
      ocrOverlay: document.getElementById('ocrOverlay'),
      ocrList: document.getElementById('ocrList'),
      ocrTip: document.getElementById('ocrTip'),
      ocrOkBtn: document.getElementById('ocrOkBtn'),
      ocrCancelBtn: document.getElementById('ocrCancelBtn'),
      ocrBtn: document.getElementById('ocrBtn'),
      ocrBtnTip: document.getElementById('ocrBtnTip')
    };
    onFill = opts && opts.onFill;

    /* 不在 Tauri 里（普通浏览器）就藏掉这个按钮 */
    if (!available()) {
      if (els.ocrBtn) els.ocrBtn.hidden = true;
      if (els.ocrBtnTip) els.ocrBtnTip.hidden = true;
      return;
    }
    if (els.ocrBtn) {
      els.ocrBtn.addEventListener('click', () => {
        if (els.ocrBtnTip) els.ocrBtnTip.hidden = true;
        pick();
      });
    }
  }

  return { available, extractNames, cleanLine, pick, init };
})();
