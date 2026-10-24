// 用极简假 DOM 跑 calculator.html 里真实的 IIFE，做端到端行为验证
const fs = require('fs');
const vm = require('vm');

function makeHarness(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 取出若干 <script> 块（跳过外链）
  const blocks = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);

  const el = () => {
    const e = {
      textContent: '',
      value: '',
      style: {},
      offsetWidth: 1,
      dataset: {},
      classes: new Set(),
      listeners: 0,
      addEventListener(_t, fn) { this.listeners++; this.handlers = this.handlers || []; this.handlers.push(fn); },
      removeEventListener() {},
      classList: {
        add(c) { e.classes.add(c); },
        remove(c) { e.classes.delete(c); },
        contains(c) { return e.classes.has(c); },
      },
      focus() {}, select() {}, click() { (e.handlers || []).forEach(f => f()); },
    };
    return e;
  };

  const nodes = {};
  ['expression', 'result', 'display', 'copyBtn', 'toast'].forEach(id => { nodes[id] = el(); });

  const document = {
    getElementById: id => nodes[id] || el(),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: el,
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => true,
  };

  const sandbox = {
    document,
    navigator: {},
    window: {},
    setTimeout, clearTimeout, console, Decimal: undefined,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  // decimal.js 块
  vm.runInContext(blocks[0], sandbox, { filename: 'decimal.js' });

  // 应用块：把内部函数暴露出来
  let app = blocks[1];
  const idx = app.lastIndexOf('})();');
  if (idx < 0) throw new Error('unexpected IIFE tail');
  app = app.slice(0, idx) +
    'globalThis.__api = { inputDigit, pressOp, pressEquals, pressClear, pressBackspace, pressPercent, pressParen, pressSqrt, pressSquare, evaluateExpr, spaced, format, plain, raw, getCopyText, state: () => ({ expr, current, justEvaluated }) };\n' +
    app.slice(idx);
  vm.runInContext(app, sandbox, { filename: 'app.js' });

  return { api: sandbox.__api, nodes };
}

function run() {
  const { api, nodes } = makeHarness(
    '/root/Documents/deepseek-harness/default-workspace/calc-fix/calculator.html'
  );
  const show = () => nodes.result.textContent;

  const keys = s => {
    for (const ch of s) {
      if (/\d/.test(ch) || ch === '.') api.inputDigit(ch);
      else if (ch === '(' || ch === ')') api.pressParen(ch);
      else if ('+-*/^'.includes(ch)) api.pressOp(ch);
    }
  };
  const calc = s => { api.pressClear(); keys(s); api.pressEquals(); return show(); };

  const results = [];
  const check = (name, got, want) => {
    const ok = got === want;
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(26)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  // —— 运算正确性 ——
  check('2^2', calc('2^2'), '4');
  check('(2)^2（括号）', calc('(2)^2'), '4');
  // 一元负号：-2^2 应为 -(2^2) = -4
  api.pressClear(); api.pressOp('-'); keys('2^2'); api.pressEquals();
  check('-2^2（负号低于 ^）', show(), '-4');
  check('-2^-3（嵌套一元负号）', calc('-2^-3'), '-0.125');
  check('2^3^2（^ 右结合）', calc('2^3^2'), '512');
  check('1-2-3（左结合）', calc('1-2-3'), '-4');
  check('2*-3', calc('2*-3'), '-6');
  check('(2+3)*4（括号）', calc('(2+3)*4'), '20');
  check('2(3+1)（隐式乘）', calc('2(3+1)'), '8');
  check('0.1+0.2', calc('0.1+0.2'), '0.3');
  check('2^100（>21 位转科学计数）', calc('2^100'), '1.26765060022823×10³⁰');
  // 内部仍是完整精度：2^100 再减去 2^100 应为 0
  api.pressOp('-'); keys('2'); api.pressOp('^'); keys('100'); api.pressEquals();
  check('2^100 - 2^100（内部精度）', show(), '0');
  check('小数量级 1/1e7', calc('1/10000000'), '0.0000001');
  check('1/0 → ∞', calc('1/0'), '∞');
  check('0/0 → 错误', calc('0/0'), '错误');
  check('括号不匹配 → 错误', calc('(2+3'), '错误');

  // —— 链式精度 ——
  api.pressClear(); keys('1'); api.pressOp('/'); keys('3'); api.pressEquals();
  check('1/3 显示', show(), '0.333333333333333');
  api.pressOp('*'); keys('3'); api.pressEquals();
  check('1/3 再 ×3（链式精度）', show(), '1');

  // 内部保留位数
  const st = api.state();
  console.log('   内部 expr 长度 =', st.expr.length);

  // —— 复制监听器只绑定一次（原 bug：每次 inputDigit 都重绑） ——
  const before = nodes.copyBtn.listeners;
  for (let i = 0; i < 20; i++) api.inputDigit(String(i % 10));
  const after = nodes.copyBtn.listeners;
  check('复制按钮监听器数量（20 次输入后）', after, before);

  // —— 复制内容无千分位 ——
  api.pressClear(); keys('1234'); api.pressOp('*'); keys('1000'); api.pressEquals();
  check('结果带千分位显示', show(), '1,234,000');
  check('复制内容无千分位', api.getCopyText(), '1234000');

  // —— 百分比 ——
  api.pressClear(); keys('50'); api.pressPercent();
  check('50 %', show(), '0.5');

  // —— 退格 ——
  api.pressClear(); keys('12'); api.pressOp('+'); api.pressBackspace();
  check('“12+”退格 → 12', show(), '12');
  api.pressBackspace();
  check('再退格 → 1', show(), '1');

  // —— ∞ 续算 ——
  api.pressClear(); keys('1'); api.pressOp('/'); keys('0'); api.pressEquals();
  api.pressOp('+'); keys('1'); api.pressEquals();
  check('∞+1', show(), '∞');

  const fail = results.filter(r => !r).length;
  console.log(`\n${results.length - fail}/${results.length} 通过${fail ? `，${fail} 项失败` : ''}`);
  process.exit(fail ? 1 : 0);
}

run();
