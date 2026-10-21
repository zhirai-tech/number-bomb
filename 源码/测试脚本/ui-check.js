/* ============================================================
   设置页 UI 检查（Playwright 片段，由 DSH 浏览器工具以 filename 载入）
   页面：http://127.0.0.1:4173/src/index.html（临时静态服务器）
   设计为改前/改后都能跑：旧结构下胶囊找不到 → 相关断言 FAIL，其余照跑
   ============================================================ */
async (page) => {
  const APP = 'http://127.0.0.1:4173/src/index.html';
  const R = [];
  const errs = [];
  const badRes = [];

  page.on('pageerror', e => errs.push('pageerror: ' + (e && e.message)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const s = m.text();
    /* 资源加载失败改由下面的 response 监听按 URL 判定（console 文本里没有 URL） */
    if (/favicon/i.test(s) || /Failed to load resource/i.test(s)) return;
    errs.push('console: ' + s);
  });
  /* 带 URL 的失败请求（favicon 不算） */
  page.on('response', r => {
    if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) badRes.push(r.status() + ' ' + r.url());
  });

  /* 注意：textContent/boundingBox/isDisabled 对不存在的元素默认会等 30s，
     这里一律先用 count() 判断（count 不等待），再带短超时取值。 */
  const t = (name, ok, detail) => R.push({ s: ok ? 'PASS' : 'FAIL', name, detail: detail === undefined ? '' : String(detail) });
  const n = async sel => { try { return await page.locator(sel).count(); } catch (e) { return -1; } };
  const vis = async sel => { try { return (await n(sel)) > 0 && await page.locator(sel).first().isVisible(); } catch (e) { return false; } };
  const hid = async sel => { try { return (await n(sel)) === 0 || !(await page.locator(sel).first().isVisible()); } catch (e) { return true; } };
  const txt = async sel => {
    try { if ((await n(sel)) === 0) return '<missing>'; return ((await page.locator(sel).first().textContent({ timeout: 500 })) || '').trim(); }
    catch (e) { return '<missing>'; }
  };
  const click = async sel => { try { if ((await n(sel)) === 0) return false; await page.locator(sel).first().click({ timeout: 900 }); return true; } catch (e) { return false; } };
  const box = async sel => { try { if ((await n(sel)) === 0) return null; return await page.locator(sel).first().boundingBox({ timeout: 500 }); } catch (e) { return null; } };
  const val = async sel => { try { if ((await n(sel)) === 0) return '<missing>'; return await page.locator(sel).first().inputValue({ timeout: 500 }); } catch (e) { return '<missing>'; } };
  const fill = async (sel, v) => { try { if ((await n(sel)) === 0) return false; await page.locator(sel).first().fill(v, { timeout: 900 }); return true; } catch (e) { return false; } };
  const disabled = async sel => { try { if ((await n(sel)) === 0) return true; return await page.locator(sel).first().isDisabled({ timeout: 500 }); } catch (e) { return true; } };
  /* 兼容新旧结构：新结构需要先点胶囊展开面板，旧结构选项本来就平铺可见 */
  const openPanel = async (chip, pop) => { if ((await n(chip)) > 0) await click(chip); else await page.waitForTimeout(0); return pop; };

  await page.setViewportSize({ width: 460, height: 780 });
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.removeItem('number-bomb-players-v1');
    localStorage.removeItem('number-bomb-players-count-v1');
    /* 朗读/音量也要归零，不然上一次手动点过「全部禁止」会污染这一轮 */
    localStorage.removeItem('number-bomb-tts-v1');
    localStorage.removeItem('number-bomb-tts-v2');
    localStorage.removeItem('number-bomb-volume-v1');
    localStorage.removeItem('number-bomb-volume-v2');
    localStorage.removeItem('number-bomb-volume-v3');
  });
  await page.reload();
  await page.waitForTimeout(300);

  /* ---------------- A. 布局：三组选择应已收成一行胶囊 ---------------- */
  const m = await page.evaluate(() => {
    const card = document.querySelector('#setupOverlay .card');
    const row = document.getElementById('chipRow');
    const anchor = document.getElementById('startBtn');
    const rect = el => (el ? el.getBoundingClientRect() : null);
    const rr = rect(row), ar = rect(anchor), cr = rect(card);
    return {
      chips: document.querySelectorAll('#chipRow .chip').length,
      topBlockH: rr && ar ? Math.round(ar.top - rr.top) : -1,
      chipRowH: rr ? Math.round(rr.height) : -1,
      cardH: cr ? Math.round(cr.height) : -1,
      cardScroll: card ? card.scrollHeight : -1,
      cardClient: card ? card.clientHeight : -1,
      oldLabels: card ? /数字范围|玩家人数/.test(card.innerText) : null
    };
  });

  t('A1 一行三个胶囊', m.chips === 3, 'chips=' + m.chips);
  const b0 = await box('#chipRow .chip:nth-child(1)');
  const b1 = await box('#chipRow .chip:nth-child(2)');
  const b2 = await box('#chipRow .chip:nth-child(3)');
  const sameRow = b0 && b1 && b2 && Math.max(b0.y, b1.y, b2.y) - Math.min(b0.y, b1.y, b2.y) <= 2;
  t('A2 三个胶囊在同一行', !!sameRow, b0 && b1 && b2 ? `y=${Math.round(b0.y)}/${Math.round(b1.y)}/${Math.round(b2.y)}` : 'bounds missing');
  t('A3 顶部区块高度 ≤100px、胶囊行高 ≤54px（改前≈190）',
    m.topBlockH >= 0 && m.topBlockH <= 100 && m.chipRowH > 0 && m.chipRowH <= 54,
    `topBlockH=${m.topBlockH} chipRowH=${m.chipRowH}`);
  /* 文字必须完整显示，不能被省略号截断（改前踩过：胶囊太窄 → 「随机...」） */
  const trunc = await page.evaluate(() =>
    [...document.querySelectorAll('#chipRow .chip-v b')]
      .filter(b => b.scrollWidth > b.clientWidth + 1)
      .map(b => b.textContent.trim() + `(${b.scrollWidth}>${b.clientWidth})`));
  t('A3b 胶囊文字未被截断（460px）', trunc.length === 0, trunc.join(',') || 'ok');
  t('A3c 窄窗口 340px 下也不截断', await (async () => {
    await page.setViewportSize({ width: 340, height: 780 });
    await page.waitForTimeout(150);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('#chipRow .chip-v b')]
        .filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()));
    await page.setViewportSize({ width: 460, height: 780 });
    await page.waitForTimeout(150);
    return bad.length === 0;
  })(), '340px 检查');
  t('A4 设置卡片不再需要滚动', m.cardScroll <= m.cardClient + 1, `scroll=${m.cardScroll} client=${m.cardClient} cardH=${m.cardH}`);
  t('A5 旧的「数字范围 / 玩家人数」标签已移除', m.oldLabels === false, 'oldLabels=' + m.oldLabels);
  t('A5b 数字炸弹模式不再有「随机抽一条惩罚」（归转盘管）',
    (await n('#randPunishBtn')) === 0 && (await n('#randPunishResult')) === 0);
  t('A5c 数字炸弹模式下不显示转盘的「确认」按钮', await hid('#confirmPlayersBtn'));
  t('A6 胶囊是 button 且带 aria-expanded', (await n('#chipRow .chip')) === 3 && await page.evaluate(() =>
    [...document.querySelectorAll('#chipRow .chip')].every(c => c.tagName === 'BUTTON' && c.hasAttribute('aria-expanded'))));

  /* 旧结构下元素全不存在，逐条点会拖到工具超时：直接短路，只报告 A 段结果 */
  const NEW_UI = m.chips === 3;
  if (!NEW_UI) {
    t('B0 一行三胶囊（改前基线）', false, '胶囊/面板尚未实现，B–E 交互断言整体跳过');
    const bad = R.filter(x => x.s === 'FAIL');
    return {
      summary: `RED 基线：${R.length - bad.length}/${R.length} PASS（胶囊未实现，符合预期）`,
      metrics: m,
      fails: bad.map(f => f.name + (f.detail ? ' → ' + f.detail : '')),
      all: R.map(x => `${x.s}  ${x.name}${x.detail ? '  [' + x.detail + ']' : ''}`)
    };
  }

  /* ---------------- B. 面板开合与互斥 ---------------- */
  t('B1 初始三个弹出面板全部隐藏',
    (await hid('#modeOpts')) && (await hid('#rangeOpts')) && (await hid('#playerOpts')));

  await click('#rangeChip');
  t('B2 点范围胶囊 → 面板展开、其它面板关闭、胶囊高亮',
    (await vis('#rangeOpts')) && (await hid('#modeOpts')) && (await hid('#playerOpts')) &&
    (await page.locator('#rangeChip.open').count()) === 1);
  t('B3 范围面板 3 个选项', (await n('#rangeOpts .opt')) === 3, 'opts=' + (await n('#rangeOpts .opt')));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  t('B4 Esc 收起面板', await hid('#rangeOpts'));

  await click('#rangeChip');
  await click('.card-head');
  await page.waitForTimeout(80);
  t('B5 点空白处收起面板', await hid('#rangeOpts'));

  await click('#playersChip');
  t('B6 点人数胶囊 → 人数面板展开、范围面板关闭',
    (await vis('#playerOpts')) && (await hid('#rangeOpts')) && (await page.locator('#playersChip.open').count()) === 1);
  t('B7 人数面板 6 个选项', (await n('#playerOpts .opt')) === 6, 'opts=' + (await n('#playerOpts .opt')));

  /* ---------------- C. 选择是否真正生效 ---------------- */
  await openPanel('#rangeChip', '#rangeOpts');
  await click('#rangeOpts .opt[data-max="50"]');
  await page.waitForTimeout(120);
  t('C1 选 1~50 → 胶囊显示 50、面板收起、棋盘重建为 50 格',
    (await txt('#rangeChipVal')).includes('50') && (await hid('#rangeOpts')) && (await n('#board .cell')) === 50,
    `chip="${await txt('#rangeChipVal')}" cells=${await n('#board .cell')}`);

  await openPanel('#playersChip', '#playerOpts');
  await click('#playerOpts .opt[data-players="6"]');
  await page.waitForTimeout(150);
  t('C2 选 6 人 → 胶囊显示 6 人、面板保持展开、名字行变 6 行',
    (await txt('#playersChipVal')).includes('6') && (await vis('#playerOpts')) && (await n('#nameRows .name-row')) === 6,
    `chip="${await txt('#playersChipVal')}" 名字行=${await n('#nameRows .name-row')}`);

  /* ---------------- C2b. 玩家名字：输入、回退、常用池 ---------------- */
  const nameInput = i => `#nameRows .name-row:nth-child(${i}) .name-input`;
  await fill(nameInput(1), '张三');
  await fill(nameInput(2), '李四');
  await fill(nameInput(3), '王五');
  await page.locator(nameInput(3)).blur();          /* 失焦触发 change → 进常用池 */
  await page.waitForTimeout(200);
  t('C2b 三个名字都写进了存储', await page.evaluate(() =>
    window.Names.raw(0) === '张三' && window.Names.raw(1) === '李四' && window.Names.raw(2) === '王五'));
  t('C2c 没填的玩家自动回退「玩家 N」',
    (await page.evaluate(() => window.Names.display(4))) === '玩家 4' &&
    (await page.evaluate(() => window.Names.display(6))) === '玩家 6',
    '第 4 位=' + await page.evaluate(() => window.Names.display(4)));
  t('C2d 输过的名字进了常用名字池',
    (await n('#namePool .name-chip')) >= 3 && (await vis('#namePool')),
    '池里有 ' + (await n('#namePool .name-chip')) + ' 个（' + (await txt('#namePool')) + '）');

  /* 常用池点一下能填到空位（第 4 位） */
  await click('#namePool .name-chip');
  await page.waitForTimeout(150);
  t('C2e 点常用名字能填进空位',
    (await val(nameInput(4))).length > 0 && (await val(nameInput(4))) !== '<missing>',
    `第 4 位="${await val(nameInput(4))}"`);

  /* 切人数：名字不丢 */
  await click('#playerOpts .opt[data-players="3"]');
  await page.waitForTimeout(220);
  const c2f = { rows: await n('#nameRows .name-row'), v1: await val(nameInput(1)), v3: await val(nameInput(3)) };
  t('C2f 人数改 3 → 名字行变 3 行且已填名字保留',
    c2f.rows === 3 && c2f.v1 === '张三' && c2f.v3 === '王五',
    `行数=${c2f.rows} 第1位="${c2f.v1}" 第3位="${c2f.v3}"`);
  await click('#playerOpts .opt[data-players="6"]');
  await page.waitForTimeout(150);
  await click('.card-head');                          /* 点空白处收起面板 */
  await page.waitForTimeout(100);
  t('C2g 点空白处收起人数面板', await hid('#playerOpts'));

  /* ---------------- C2x. 从屏幕框选识别名字（模块级检查） ---------------- */
  const ocrSample = ['成 员 ( 5 )', '主 持 人', '张 三', 'A l i c e', '123', '点 击 邀 请 成 员 加 入', '赵 六 @', '陈 七', '陈 七'];
  const extracted = await page.evaluate(s => window.OcrNames.extractNames(s), ocrSample);
  t('C2x 识别结果会清理并过滤（去空格/去重/去界面短语）',
    JSON.stringify(extracted) === JSON.stringify(['张三', 'Alice', '赵六', '陈七']),
    JSON.stringify(extracted));
  t('C2y 人数面板里有「从屏幕框选识别名字」按钮，且框选/结果层都在',
    (await n('#ocrBtn')) === 1 && (await n('#pickOverlay')) === 1 && (await n('#ocrOverlay')) === 1 &&
    (await hid('#pickOverlay')) && (await hid('#ocrOverlay')));
  t('C2z 普通浏览器里（非 Tauri）这个按钮自动藏起来，不会点了没反应',
    (await hid('#ocrBtn')) && (await page.evaluate(() => window.OcrNames.available() === false)));

  /* 名字面板展开时卡片也不该出现滚动条 */
  await click('#playersChip');
  await page.waitForTimeout(250);
  const ovfNames = await page.evaluate(() => {
    const c = document.querySelector('#setupOverlay .card');
    return c.scrollHeight - c.clientHeight;
  });
  t('C2h 名字面板展开时卡片不需要滚动（6 人）', ovfNames <= 1, 'overflow=' + ovfNames + 'px');
  await click('#playerOpts .opt[data-players="8"]');
  await page.waitForTimeout(250);
  const ovf8 = await page.evaluate(() => {
    const c = document.querySelector('#setupOverlay .card');
    return c.scrollHeight - c.clientHeight;
  });
  t('C2i 8 人时也不需要滚动（名字列表内部滚动）', ovf8 <= 1, 'overflow=' + ovf8 + 'px');
  await click('#playerOpts .opt[data-players="6"]');
  await page.waitForTimeout(200);
  await click('.card-head');
  await page.waitForTimeout(100);

  /* ---------------- C3. 每行固定 10 个正方格，大小不随屏幕变 ---------------- */
  const cellSizes = [];
  for (const mx of [30, 50, 100]) {
    await openPanel('#rangeChip', '#rangeOpts');
    await click(`#rangeOpts .opt[data-max="${mx}"]`);
    await click('#startBtn');
    await page.waitForTimeout(230);
    const g = await page.evaluate(() => {
      const wrap = document.getElementById('boardWrap').getBoundingClientRect();
      const b = document.getElementById('board').getBoundingClientRect();
      const rects = [...document.querySelectorAll('#board .cell')]
        .filter(c => c.offsetParent !== null).map(c => c.getBoundingClientRect());
      return {
        visible: rects.length,
        cols: new Set(rects.map(x => Math.round(x.left))).size,
        rows: new Set(rects.map(x => Math.round(x.top))).size,
        cw: Math.round(rects[0].width), ch: Math.round(rects[0].height),
        fits: b.left >= wrap.left - 1 && b.right <= wrap.right + 1 &&
              b.top >= wrap.top - 1 && b.bottom <= wrap.bottom + 1
      };
    });
    cellSizes.push(g.cw);
    t(`C3 1~${mx}：每行 10 个、共 ${Math.ceil(mx / 10)} 排、格子是正方形`,
      g.visible === mx && g.cols === 10 && g.rows === Math.ceil(mx / 10) && g.cw === g.ch && g.fits,
      `格子 ${g.cw}×${g.ch} | 布局 ${g.cols}×${g.rows} | 未超出游戏区=${g.fits}`);
    await click('#restartBtn');
    await page.waitForTimeout(180);
  }
  t('C3b 30 / 50 / 100 三种范围下格子大小完全一样（不会一会变长一会变短）',
    new Set(cellSizes).size === 1, cellSizes.join(' / ') + ' px');
  /* 后面流程依赖 1~50 */
  await openPanel('#rangeChip', '#rangeOpts');
  await click('#rangeOpts .opt[data-max="50"]');
  await page.waitForTimeout(120);

  /* ---------------- D. 炸弹数字模式 + 自定义输入 ---------------- */
  t('D0 随机模式下不显示自定义输入行', await hid('#customRow'));
  await openPanel('#modeChip', '#modeOpts');
  t('D1 点炸弹胶囊 → 模式面板 2 个选项', (await vis('#modeOpts')) && (await n('#modeOpts .seg-btn')) === 2);
  await click('#modeOpts .seg-btn[data-mode="custom"]');
  await page.waitForTimeout(120);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  t('D2 选自定义 → 输入行出现并自动聚焦',
    (await vis('#customRow')) && !(await disabled('#bombInput')) && focused === 'bombInput',
    'focused=' + focused);

  await fill('#bombInput', '42');
  await page.waitForTimeout(80);
  t('D3 默认星号隐藏：输入 42 → 遮罩显示 **', (await txt('#eyeMask')) === '**', `mask="${await txt('#eyeMask')}"`);
  /* 一位 / 三位都只显示两个星号，连位数都不暴露 */
  await fill('#bombInput', '5');
  await page.waitForTimeout(80);
  t('D3b 只输 1 位数字 → 星号仍然是两个（不暴露位数）',
    (await txt('#eyeMask')) === '**', `mask="${await txt('#eyeMask')}"`);
  await fill('#bombInput', '100');
  await page.waitForTimeout(80);
  t('D3c 输满 3 位（100）→ 星号还是两个', (await txt('#eyeMask')) === '**', `mask="${await txt('#eyeMask')}"`);
  /* 关键：打第一个数字的瞬间文字就必须是透明的，否则会闪一下数字 */
  const flashChk = await page.evaluate(() => {
    const el = document.getElementById('bombInput');
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = '7';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const cs = getComputedStyle(el);
    return {
      fill: cs.webkitTextFillColor, color: cs.color,
      transition: cs.transitionProperty,
      masked: document.getElementById('customRow').classList.contains('masked')
    };
  });
  t('D3d 打第一个数字的瞬间已透明、color 不参与过渡（不会闪数字）',
    /rgba\(0, 0, 0, 0\)/.test(flashChk.fill) && /rgba\(0, 0, 0, 0\)/.test(flashChk.color) &&
    !/color/.test(flashChk.transition) && flashChk.masked,
    `fill=${flashChk.fill} color=${flashChk.color} transition=${flashChk.transition}`);
  await fill('#bombInput', '42');
  await page.waitForTimeout(60);
  await click('#eyeBtn');
  t('D4 点小眼睛 → 明文显示', (await txt('#eyeMask')) === '');
  await click('#eyeBtn');
  t('D5 再点小眼睛 → 恢复星号', (await txt('#eyeMask')) === '**');

  /* ---------------- E. 完整一局（确定性：炸弹 42、范围 1~50、6 人） ---------------- */
  t('E1 音效文件已接入（src/sfx/boom.mp3）',
    await page.evaluate(() => {
      const el = document.getElementById('boomSfx');
      return !!el && /sfx\/boom\.mp3$/.test(el.getAttribute('src') || '');
    }));
  /* 等音频元数据，确认文件真的能解码（不是只有个 <audio> 标签） */
  const audioReady = await page.evaluate(async () => {
    const el = document.getElementById('boomSfx');
    if (!el) return { ok: false, why: 'no element' };
    for (let i = 0; i < 40 && !(el.duration > 0); i++) await new Promise(r => setTimeout(r, 100));
    return { ok: el.duration > 0, why: 'readyState=' + el.readyState + ' duration=' + el.duration };
  });
  t('E1b 音效文件可解码（duration>0）', audioReady.ok, audioReady.why);

  await page.evaluate(() => {
    window.__boomPlayed = 0;
    window.__spoken = [];
    const el = document.getElementById('boomSfx');
    if (el) { const orig = el.play.bind(el); el.play = () => { window.__boomPlayed++; const p = orig(); if (p && p.catch) p.catch(() => {}); return p; }; }
    const s = window.speechSynthesis;
    if (s && !s.__spied) {
      const origSpeak = s.speak.bind(s);
      s.speak = u => { window.__spoken.push(u.text); try { return origSpeak(u); } catch (e) {} };
      s.__spied = true;
    }
  });

  await click('#startBtn');
  await page.waitForTimeout(200);
  t('E2 开始游戏 → 设置页隐藏、棋盘可见', (await hid('#setupOverlay')) && (await vis('#board')));

  await click('#board .cell:nth-child(10)');
  await page.waitForTimeout(200);
  t('E3 猜 10 → 区间 11 – 50、已猜 1 次、轮到「李四」（用玩家名字）',
    (await txt('#rangeText')).replace(/\s/g, '') === '11–50' && (await txt('#tryCount')) === '1' && (await txt('#turnText')) === '李四',
    `range="${await txt('#rangeText')}" tries=${await txt('#tryCount')} turn="${await txt('#turnText')}"`);

  /* 猜掉的数字只在原地消失（留空位），其它数字一动不动、不重排 */
  const rf = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#board .cell')];
    const shown = all.filter(c => getComputedStyle(c).visibility !== 'hidden');
    const rects = shown.map(c => c.getBoundingClientRect());
    /* 每个可见格子的坐标必须和它「原始序号」对应的格子位置一致 */
    let moved = 0;
    shown.forEach(c => {
      c.dataset.__x = String(Math.round(c.getBoundingClientRect().left));
    });
    const gridCols = new Set(rects.map(x => Math.round(x.left))).size;
    const gridRows = new Set(rects.map(x => Math.round(x.top))).size;
    const boardRowsCss = getComputedStyle(document.getElementById('board')).gridTemplateRows.split(' ').length;
    /* 校验位置固定：11/20 仍同在第 2 行，30 仍在第 3 行（没有被重排上来） */
    const c11 = all[10].getBoundingClientRect();
    const c20 = all[19].getBoundingClientRect();
    const c30 = all[29].getBoundingClientRect();
    const fixedPositions = Math.abs(c20.top - c11.top) < 1.5 &&
      c20.left > c11.left && c30.top > c20.top + 1;
    return {
      visible: shown.length, cols: gridCols, rows: gridRows, boardRowsCss,
      cw: Math.round(rects[0].width), ch: Math.round(rects[0].height),
      moved, fixedPositions
    };
  });
  t('E3b 猜掉 1~10 后：数字原地不动（留空位），不再重排乱窜',
    rf.visible === 40 && rf.cols === 10 && rf.rows === 4 && rf.boardRowsCss === 5 &&
    rf.cw === rf.ch && rf.cw === cellSizes[2] && rf.fixedPositions,
    `剩 ${rf.visible} 个 → 网格仍是 ${rf.cols}×${rf.boardRowsCss}（第1排空着），可见 ${
      rf.rows} 排，格子 ${rf.cw}×${rf.ch}（原来 ${cellSizes[2]}），位置固定=${rf.fixedPositions}`);

  await click('#board .cell:nth-child(45)');
  await page.waitForTimeout(120);
  t('E4 猜 45 → 区间 11 – 44', (await txt('#rangeText')).replace(/\s/g, '') === '11–44', `range="${await txt('#rangeText')}"`);

  await click('#board .cell:nth-child(42)');
  await page.waitForTimeout(1300);
  const played = await page.evaluate(() => window.__boomPlayed || 0);
  t('E5 踩中 42 → 结算页显示炸弹号与踩雷玩家（用名字）',
    (await vis('#boomOverlay')) && (await txt('#boomNum')) === '42' && (await txt('#boomPlayer')) === '王五 踩中炸弹',
    `num=${await txt('#boomNum')} player="${await txt('#boomPlayer')}"`);
  t('E6 踩雷时播放了 mp3 音效', played > 0, 'play() calls=' + played);
  const boomPunish = await txt('#boomPunish');
  const spoken = await page.evaluate(() => window.__spoken || []);
  t('E6b 结算朗读带上玩家名（王五，惩罚）',
    spoken.length > 0 && spoken[spoken.length - 1] === ('王五，' + boomPunish),
    `惩罚="${boomPunish}" 朗读=${JSON.stringify(spoken)}`);

  t('E7 无 JS 报错、无 4xx/5xx 资源', errs.length === 0 && badRes.length === 0,
    [...errs, ...badRes].join(' | '));

  /* ---------------- F. 名字本地记忆：重开之后还在 ---------------- */
  await page.reload();
  await page.waitForTimeout(350);
  await click('#playersChip');
  await page.waitForTimeout(200);
  t('F1 刷新后名字与人数自动带出来（本地记忆生效）',
    (await val(nameInput(1))) === '张三' &&
    (await val(nameInput(3))) === '王五' &&
    (await n('#nameRows .name-row')) === 6 &&
    (await txt('#playersChipVal')).includes('6'),
    `第1位="${await val(nameInput(1))}" 第3位="${await val(nameInput(3))}" 行数=${await n('#nameRows .name-row')} 胶囊="${await txt('#playersChipVal')}"`);
  t('F2 刷新后常用名字池还在', (await n('#namePool .name-chip')) >= 3, '池里 ' + (await n('#namePool .name-chip')) + ' 个');

  const fails = R.filter(x => x.s === 'FAIL');
  return {
    summary: `${R.length - fails.length}/${R.length} PASS`,
    metrics: m,
    fails: fails.map(f => f.name + (f.detail ? ' → ' + f.detail : '')),
    all: R.map(x => `${x.s}  ${x.name}${x.detail ? '  [' + x.detail + ']' : ''}`)
  };
}
