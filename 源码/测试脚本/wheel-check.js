/* ============================================================
   转盘玩法检查（Playwright 片段，由 DSH 浏览器工具以 filename 载入）
   页面：http://127.0.0.1:4173/src/index.html
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
    if (/favicon/i.test(s) || /Failed to load resource/i.test(s)) return;
    errs.push('console: ' + s);
  });
  page.on('response', r => {
    if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) badRes.push(r.status() + ' ' + r.url());
  });

  const t = (name, ok, detail) => R.push({ s: ok ? 'PASS' : 'FAIL', name, detail: detail === undefined ? '' : String(detail) });
  const n = async sel => { try { return await page.locator(sel).count(); } catch (e) { return -1; } };
  const vis = async sel => { try { return (await n(sel)) > 0 && await page.locator(sel).first().isVisible(); } catch (e) { return false; } };
  const hid = async sel => { try { return (await n(sel)) === 0 || !(await page.locator(sel).first().isVisible()); } catch (e) { return true; } };
  const txt = async sel => {
    try { if ((await n(sel)) === 0) return '<missing>'; return ((await page.locator(sel).first().textContent({ timeout: 500 })) || '').trim(); }
    catch (e) { return '<missing>'; }
  };
  const click = async sel => { try { if ((await n(sel)) === 0) return false; await page.locator(sel).first().click({ timeout: 900 }); return true; } catch (e) { return false; } };
  const disabled = async sel => { try { if ((await n(sel)) === 0) return true; return await page.locator(sel).first().isDisabled({ timeout: 500 }); } catch (e) { return true; } };
  const attr = async (sel, name) => { try { if ((await n(sel)) === 0) return '<missing>'; return await page.locator(sel).first().getAttribute(name, { timeout: 500 }); } catch (e) { return '<missing>'; } };
  const paths = async () => n('#wheelRot path');
  const punish = async () => txt('#wheelPunish');
  const sectorText = async () => txt('#sectorChipVal');
  const activeSector = async () => attr('#sectorOpts .opt.active', 'data-sectors');

  const reset = async () => {
    await page.evaluate(() => {
      localStorage.removeItem('number-bomb-punishments-v1');
      localStorage.removeItem('number-bomb-wheel-sectors-v1');
      localStorage.removeItem('number-bomb-tts-v1');
      localStorage.removeItem('number-bomb-players-v1');
      localStorage.removeItem('number-bomb-players-count-v1');
    });
    await page.reload();
    await page.waitForTimeout(400);
  };

  /* 进转盘模式：先选人数、点「确认」才出转盘 */
  const enterWheel = async (count) => {
    await click('#modeSwitch .mode-btn[data-game="wheel"]');
    await page.waitForTimeout(250);
    if (await vis('#confirmPlayersBtn')) {
      if (count) {
        await click('#playersChip');
        await page.waitForTimeout(150);
        await click('#playerOpts .opt[data-players="' + count + '"]');
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
      }
      await click('#confirmPlayersBtn');
      await page.waitForTimeout(340);
    }
  };

  const pickSectors = async (v) => {
    await click('#sectorChip');
    await page.waitForTimeout(200);
    await click('#sectorOpts .opt[data-sectors="' + v + '"]');
    await page.waitForTimeout(280);
  };

  await page.setViewportSize({ width: 460, height: 780 });
  await page.goto(APP);
  await reset();

  /* ---------- W1 默认数字炸弹 ---------- */
  t('W1 默认数字炸弹：转盘面板隐藏、开始游戏可见、行内不再有齿轮',
    (await hid('#wheelPanel')) && (await vis('#modeChip')) && (await vis('#rangeChip')) &&
    (await vis('#startBtn')) && (await hid('#confirmPlayersBtn')) && (await txt('#gameTitle')) === '数字炸弹' &&
    (await n('#punishBtn')) === 0);
  t('W1b 顶栏有一个全局设置按钮，设置页里就能点',
    (await vis('#settingsBtn')) && (await page.evaluate(() => {
      const b = document.getElementById('settingsBtn');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest('#settingsBtn');
    })));

  /* ---------- W2 切到转盘：先选人数，点确认，才出转盘 ---------- */
  await click('#modeSwitch .mode-btn[data-game="wheel"]');
  await page.waitForTimeout(280);
  t('W2 切到转盘先拦一步：显示「先选人数」、转盘还没出来、底下是「确认」',
    (await vis('#wheelGate')) && (await hid('#wheelBody')) && (await vis('#confirmPlayersBtn')) &&
    (await hid('#startBtn')) && (await txt('#gameTitle')) === '惩罚转盘');
  t('W2b 转盘模式下「人数」胶囊仍在，「炸弹 / 范围」隐藏',
    (await vis('#playersChip')) && (await hid('#modeChip')) && (await hid('#rangeChip')));

  await click('#playersChip');
  await page.waitForTimeout(220);
  t('W2c 转盘模式下能点开人数面板填名字',
    (await vis('#playerOpts')) && (await n('#nameRows .name-row')) === 4,
    '名字行=' + (await n('#nameRows .name-row')));
  await page.locator('#nameRows .name-row:nth-child(1) .name-input').fill('张三');
  await page.locator('#nameRows .name-row:nth-child(2) .name-input').fill('李四');
  await page.locator('#nameRows .name-row:nth-child(2) .name-input').blur();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);

  await click('#confirmPlayersBtn');
  await page.waitForTimeout(350);
  t('W2d 点「确认」后转盘才出现，「确认」按钮收起、底部按钮行整行收起',
    (await hid('#wheelGate')) && (await vis('#wheelBody')) && (await hid('#confirmPlayersBtn')) &&
    (await vis('#wheelSpinBtn')) && (await hid('#actionRow')));
  t('W2e 圆盘上显示「轮到 张三」', (await txt('#wheelWho')) === '轮到 张三', 'who="' + (await txt('#wheelWho')) + '"');
  t('W2f 圆盘中心是启动按钮', (await txt('#wheelSpinBtn')) === '开始' && (await n('#spinBtn')) === 0);

  const total = await page.evaluate(() => window.Punishments.list().length);
  t('W3 扇区默认 24（74 条惩罚 → 24 个扇区）',
    (await paths()) === 24 && (await n('#wheelRot text')) === 24 && (await sectorText()) === '24',
    'path=' + (await paths()) + ' 胶囊="' + (await sectorText()) + '"');
  t('W4 每个扇区都写了惩罚文字', (await n('#wheelRot text')) === 24);
  t('W5 说明行给出条数与扇区数', /共\s*\d+\s*条惩罚/.test(await txt('#wheelMeta')), await txt('#wheelMeta'));
  t('W5b 扇区是下拉：选项默认收在面板里（面板隐藏、选中 24）',
    (await hid('#sectorOpts')) && (await activeSector()) === '24' && (await n('#sectorOpts .opt')) === 4);
  const ovf = await page.evaluate(() => {
    const c = document.querySelector('#setupOverlay .card');
    return c.scrollHeight - c.clientHeight;
  });
  t('W5c 转盘模式下设置卡片不需要滚动', ovf <= 1, 'overflow=' + ovf + 'px');

  /* ---------- W6~W8 点中心开转（第一位是张三） ---------- */
  await page.evaluate(() => {
    window.__spoken = [];
    const s = window.speechSynthesis;
    if (s && !s.__spied) {
      const orig = s.speak.bind(s);
      s.speak = u => { window.__spoken.push(u.text); try { return orig(u); } catch (e) {} };
      s.__spied = true;
    }
  });

  await click('#wheelSpinBtn');
  await page.waitForTimeout(300);
  t('W6 点中心按钮：按钮变「转动中」并禁用、结果区提示转动中',
    (await disabled('#wheelSpinBtn')) && (await txt('#wheelSpinBtn')) === '转动中' && (await punish()).includes('转动'),
    'btn="' + (await txt('#wheelSpinBtn')) + '" 结果="' + (await punish()) + '"');

  await page.waitForTimeout(4300);
  const res1 = await punish();
  const who1 = await txt('#wheelWho');
  const ok1 = await page.evaluate(s => window.Punishments.list().indexOf(s) !== -1, res1);
  const deg1 = await page.evaluate(() => {
    const m = /rotate\(([-\d.]+)deg\)/.exec(document.getElementById('wheelRot').style.transform || '');
    return m ? parseFloat(m[1]) : 0;
  });
  t('W7 停稳后：按钮恢复成「开始」、结果显示一条真实存在的惩罚',
    !(await disabled('#wheelSpinBtn')) && (await txt('#wheelSpinBtn')) === '开始' && ok1 && res1.length > 0,
    'result="' + res1 + '" 在列表中=' + ok1);
  t('W7c 结果带上玩家：第一位是张三', who1 === '张三 抽到', 'who="' + who1 + '"');

  const pointerText = await page.evaluate(() => {
    const i = window.Wheel.getLastIndex();
    const ts = [...document.querySelectorAll('#wheelRot text')];
    return i >= 0 && ts[i] ? (ts[i].textContent || '').trim() : '<none>';
  });
  t('W7b 指针停的扇区文字 = 抽中的惩罚', pointerText === res1 || res1.indexOf(pointerText.replace('…', '')) === 0,
    '扇区="' + pointerText + '" 结果="' + res1 + '"');
  t('W8 圆盘确实转了（累计角度 > 360°）', deg1 > 360, 'rotate=' + deg1 + 'deg');

  const spoken = await page.evaluate(() => window.__spoken || []);
  t('W8c 朗读带上玩家名（张三，惩罚）',
    spoken.length > 0 && spoken[spoken.length - 1] === ('张三，' + res1), JSON.stringify(spoken));

  /* ---------- W9 扇区下拉：切换 48 / 全部 ---------- */
  await click('#sectorChip');
  await page.waitForTimeout(220);
  t('W9 点扇区胶囊展开下拉、选中项高亮',
    (await vis('#sectorOpts')) && (await activeSector()) === '24');
  await click('#sectorOpts .opt[data-sectors="48"]');
  await page.waitForTimeout(300);
  t('W9b 选 48 → 圆盘 48 扇区、胶囊显示 48、面板收起',
    (await paths()) === 48 && (await sectorText()) === '48' && (await hid('#sectorOpts')),
    'path=' + (await paths()) + ' 胶囊="' + (await sectorText()) + '"');

  await pickSectors('all');
  t('W10 选「全部」→ 一条一个扇区、胶囊显示「全部」',
    (await paths()) === total && (await sectorText()) === '全部' && /一条一个扇区/.test(await txt('#wheelMeta')),
    'path=' + (await paths()) + ' 胶囊="' + (await sectorText()) + '"');

  /* 第二次转动：应该轮到李四 */
  await click('#wheelSpinBtn');
  await page.waitForTimeout(4500);
  const res3 = await punish();
  const who3 = await txt('#wheelWho');
  const ok3 = await page.evaluate(s => window.Punishments.list().indexOf(s) !== -1, res3);
  t('W11 全部扇区下转动结果正确', ok3, 'result="' + res3 + '"');
  t('W11b 轮流生效：第二次轮到李四', who3 === '李四 抽到', 'who="' + who3 + '"');

  /* 扇区选择会记住 */
  await page.reload();
  await page.waitForTimeout(400);
  t('W12 扇区选择会被记住（刷新后仍是「全部」）', (await sectorText()) === '全部', '胶囊="' + (await sectorText()) + '"');

  /* ---------- W13 切回数字炸弹 + 全局设置按钮 ---------- */
  await click('#modeSwitch .mode-btn[data-game="bomb"]');
  await page.waitForTimeout(250);
  t('W13 切回数字炸弹：猜数字设置与开始游戏恢复、圆盘隐藏',
    (await hid('#wheelPanel')) && (await vis('#modeChip')) && (await vis('#rangeChip')) &&
    (await vis('#startBtn')) && (await txt('#gameTitle')) === '数字炸弹');
  t('W13b 转盘模式下设置按钮也在（不再各加一个齿轮）',
    (await vis('#settingsBtn')) && (await n('#punishBtn')) === 0);

  /* ---------- W14 设置里的朗读：声音可选 ---------- */
  await click('#settingsBtn');
  await page.waitForTimeout(400);
  const voices = await page.evaluate(() => [...document.querySelectorAll('#voiceOpts .opt')].map(b => b.textContent.trim()));
  t('W14 设置里列出可用中文语音（慧慧 / 康康 / 瑶瑶 之类）',
    (await vis('#punishOverlay')) && voices.length >= 1,
    voices.join(' / '));
  t('W14b 语音可切换（点一下就换）',
    await (async () => {
      const before = await page.evaluate(() => window.Speech.getVoice());
      await page.locator('#voiceOpts .opt').nth(voices.length > 1 ? 1 : 0).click();
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => window.Speech.getVoice());
      return !!after && after.length > 0 && (voices.length < 2 || after !== before);
    })(), await page.evaluate(() => window.Speech.getVoice()));
  t('W14c 语速可选（慢 / 正常 / 快，默认正常）',
    (await n('#rateOpts .opt')) === 3 && (await txt('#rateOpts .opt.active')) === '正常');
  await click('#punishCloseBtn');
  await page.waitForTimeout(250);

  /* ---------- W15 惩罚 ≤12 条 ---------- */
  await page.evaluate(() => {
    localStorage.setItem('number-bomb-punishments-v1',
      JSON.stringify(['深蹲 10 个', '俯卧撑 15 个', '开合跳 20 个', '唱一首儿歌', '学猫叫 3 声', '罚站 20 秒']));
    localStorage.setItem('number-bomb-wheel-sectors-v1', '24');
  });
  await page.reload();
  await page.waitForTimeout(400);
  await enterWheel(4);
  const labels6 = await page.evaluate(() => [...document.querySelectorAll('#wheelRot text')].map(t => (t.textContent || '').trim()));
  t('W15 6 条惩罚 → 6 个扇区、一条一个扇区、文字完整',
    (await paths()) === 6 && labels6.length === 6 &&
    ['深蹲 10 个', '俯卧撑 15 个', '开合跳 20 个', '唱一首儿歌', '学猫叫 3 声', '罚站 20 秒'].every(s => labels6.indexOf(s) !== -1),
    labels6.join(' / '));

  await click('#wheelSpinBtn');
  await page.waitForTimeout(4400);
  const res4 = await punish();
  t('W16 6 条时转动停位结果正确',
    await page.evaluate(s => ['深蹲 10 个', '俯卧撑 15 个', '开合跳 20 个', '唱一首儿歌', '学猫叫 3 声', '罚站 20 秒'].indexOf(s) !== -1, res4),
    'result="' + res4 + '"');

  /* ---------- W17 空惩罚列表 ---------- */
  await page.evaluate(() => localStorage.setItem('number-bomb-punishments-v1', JSON.stringify([])));
  await page.reload();
  await page.waitForTimeout(400);
  await enterWheel(4);
  t('W17 惩罚为空：给出提示、中心按钮禁用、不报错',
    (await paths()) === 0 && (await disabled('#wheelSpinBtn')) && (await punish()).length > 0,
    'result="' + (await punish()) + '"');

  await page.evaluate(() => {
    localStorage.removeItem('number-bomb-punishments-v1');
    localStorage.removeItem('number-bomb-wheel-sectors-v1');
    localStorage.removeItem('number-bomb-tts-v1');
    localStorage.removeItem('number-bomb-players-v1');
    localStorage.removeItem('number-bomb-players-count-v1');
  });

  t('W18 无 JS 报错、无 4xx/5xx 资源', errs.length === 0 && badRes.length === 0, [...errs, ...badRes].join(' | '));

  const fails = R.filter(x => x.s === 'FAIL');
  return {
    summary: (R.length - fails.length) + '/' + R.length + ' PASS',
    fails: fails.map(f => f.name + (f.detail ? ' → ' + f.detail : '')),
    all: R.map(x => x.s + '  ' + x.name + (x.detail ? '  [' + x.detail + ']' : ''))
  };
}
