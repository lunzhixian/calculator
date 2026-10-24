// 真实浏览器端到端测试：用 Chromium 打开 calculator.html，真实点击每个按键
// 依赖：npm i playwright && npx playwright install chromium
// 注意：部分容器/沙箱环境里 Chromium 无法启动（SIGTRAP），此时请在本机或 CI 上运行
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'file://' + path.join(__dirname, 'calculator.html');
const SHOT_DIR = path.join(__dirname, 'screenshots');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(FILE);
  await page.waitForFunction(() => !!window.Decimal && document.getElementById('result'));

  const result = () => page.textContent('#result');
  const smallText = () => page.textContent('#expression');

  // 真实鼠标点击按键（按显示文本定位）
  const key = async (label) => {
    await page.locator('button', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
  };
  const type = async (s) => {
    for (const ch of s) {
      if (/[0-9.]/.test(ch)) await key(ch);
      else if (ch === '+') await key('\\+');
      else if (ch === '-') await key('−');
      else if (ch === '*') await key('×');
      else if (ch === '/') await key('÷');
      else if (ch === '^') await key('xʸ');
      else if (ch === '(') await key('\\(');
      else if (ch === ')') await key('\\)');
    }
  };
  const clear = () => key('C');
  const calc = async (s) => { await clear(); await type(s); await key('='); return result(); };

  const rows = [];
  const check = (name, got, want) => {
    const ok = got === want;
    rows.push({ ok, name, got, want });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  check('页面标题', await page.title(), '图形化计算器');
  check('初始显示', await result(), '0');
  check('按钮数量', String(await page.locator('.buttons button').count()), '24');
  check('Decimal 引擎已加载', String(await page.evaluate(() => typeof window.Decimal)), 'function');

  // —— 运算 ——
  check('(2+3)×4', await calc('(2+3)*4'), '20');
  check('2(3+1) 隐式乘', await calc('2(3+1)'), '8');
  check('2^3^2 右结合', await calc('2^3^2'), '512');
  check('1-2-3 左结合', await calc('1-2-3'), '-4');
  check('0.1+0.2', await calc('0.1+0.2'), '0.3');
  check('1÷0 → ∞', await calc('1/0'), '∞');
  check('0÷0 → 错误', await calc('0/0'), '错误');
  check('括号不匹配 → 错误', await calc('(2+3'), '错误');
  check('2^100 科学计数', await calc('2^100'), '1.26765060022823×10³⁰');
  check('1234×1000 千分位', await calc('1234*1000'), '1,234,000');

  // 一元负号：先按 −，再 2^2
  await clear(); await key('−'); await type('2^2'); await key('=');
  check('−2^2 = -4', await result(), '-4');
  check('小字回显算式', (await smallText()).trim(), '−2^2 =');

  // —— 链式精度 ——
  await clear(); await type('1/3'); await key('=');
  check('1÷3 显示', await result(), '0.333333333333333');
  await key('×'); await key('3'); await key('=');
  check('1÷3×3 = 1', await result(), '1');

  // —— 复制按钮：确认没有被重复绑定 ——
  await page.evaluate(() => {
    const btn = document.getElementById('copyBtn');
    window.__copyBind = 0;
    const orig = btn.addEventListener.bind(btn);
    btn.addEventListener = (...a) => { window.__copyBind++; return orig(...a); };
  });
  for (const d of '12345678901234567890') await key(d);
  check('输入 20 位后复制按钮新增监听', String(await page.evaluate(() => window.__copyBind)), '0');

  // —— 复制内容正确（无千分位） ——
  await clear(); await type('1234*1000'); await key('=');
  await page.locator('#copyBtn').click();
  const toast = await page.textContent('#toast');
  check('点击复制有提示', toast.includes('复制'), true);
  const clip = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR:' + e.name; }
  });
  check('剪贴板内容（无千分位）', clip, '1234000');

  // —— 键盘 ——
  await clear();
  await page.keyboard.type('12+34');
  await page.keyboard.press('Enter');
  check('键盘 12+34 Enter', await result(), '46');
  await page.keyboard.press('Escape');
  check('Esc 清空', await result(), '0');
  await page.keyboard.type('(1+2)*3');
  await page.keyboard.press('=');
  check('键盘括号 (1+2)*3', await result(), '9');
  await page.keyboard.press('Backspace');

  // —— 退格 ——
  await clear(); await type('12'); await key('+'); await key('⌫');
  check('12+ 退格 → 12', await result(), '12');
  await key('⌫');
  check('再退格 → 1', await result(), '1');

  // —— 百分比 / 开方 / 平方 ——
  await clear(); await type('50'); await key('%');
  check('50%', await result(), '0.5');
  check('√2（清空后）', await (async () => { await clear(); await type('2'); await key('√'); return result(); })(), '1.4142135623731');
  check('3²', await (async () => { await clear(); await type('3'); await key('x²'); return result(); })(), '9');

  // —— 溢出与布局 ——
  const layout = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.buttons button')];
    const rowsY = [...new Set(btns.map(b => Math.round(b.getBoundingClientRect().top)))];
    return {
      rows: rowsY.length,
      perRow: rowsY.map(y => btns.filter(b => Math.round(b.getBoundingClientRect().top) === y).length).join(','),
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      okText: btns.every(b => b.textContent.trim().length > 0),
    };
  });
  check('按键排布 6 行 × 4 列', `${layout.rows}行/${layout.perRow}`, '6行/4,4,4,4,4,4');
  check('无横向溢出', layout.hOverflow, false);

  check('控制台无报错', errors.join(' | ') || '无', '无');

  // —— 截图（先建目录）——
  require('fs').mkdirSync(SHOT_DIR, { recursive: true });
  await clear(); await type('2^100'); await key('=');
  await page.screenshot({ path: path.join(SHOT_DIR, 'phone-dark.png'), fullPage: true });

  await page.setViewportSize({ width: 1100, height: 900 });
  await clear(); await type('(2+3)*4'); await key('=');
  await page.screenshot({ path: path.join(SHOT_DIR, 'wide-dark.png'), fullPage: true });

  await browser.close();

  const fail = rows.filter(r => !r.ok).length;
  console.log(`\n${rows.length - fail}/${rows.length} 通过${fail ? `，${fail} 项失败` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('RUN FAILED:', e.message); process.exit(2); });
