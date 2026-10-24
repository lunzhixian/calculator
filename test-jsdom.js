// 用 jsdom（真实 DOM 实现）跑 calculator.html，真实的点击事件 / 键盘事件 / classList / dataset
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = '/root/Documents/deepseek-harness/default-workspace/calc-fix/calculator.html';
const html = fs.readFileSync(FILE, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'file://' + FILE,
  virtualConsole: new (require('jsdom').VirtualConsole)(),
});
const { window } = dom;
const doc = window.document;

const result = () => doc.getElementById('result').textContent;
const small = () => doc.getElementById('expression').textContent;

// 按可见文本找按键，模拟真实点击（走 DOM 事件，不是直接调函数）
function btn(label) {
  const all = [...doc.querySelectorAll('.pad button')];
  const hit = all.find(b => b.textContent.trim() === label);
  if (!hit) throw new Error('找不到按键: ' + label);
  return hit;
}
const key = (label) => btn(label).click();
const type = (s) => {
  for (const ch of s) {
    if (/[0-9.]/.test(ch)) key(ch);
    else if (ch === '+') key('+');
    else if (ch === '-') key('−');
    else if (ch === '*') key('×');
    else if (ch === '/') key('÷');
    else if (ch === '^') key('xʸ');
    else if (ch === '(') key('(');
    else if (ch === ')') key(')');
  }
};
const clear = () => key('AC');
const calc = (s) => { clear(); type(s); key('='); return result(); };

function pressKey(k, opts = {}) {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  doc.dispatchEvent(ev);
}

const rows = [];
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  rows.push({ ok, name, got, want });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

// ---------- 基础 ----------
check('初始显示', result(), '0');
check('按键总数', doc.querySelectorAll('.pad button').length, 24);
check('Decimal 已加载', typeof window.Decimal, 'function');
check('复制按钮存在', !!doc.getElementById('copyBtn'), true);

// ---------- 运算 ----------
check('(2+3)×4', calc('(2+3)*4'), '20');
check('2(3+1) 隐式乘', calc('2(3+1)'), '8');
check('2^3^2 右结合', calc('2^3^2'), '512');
check('1-2-3 左结合', calc('1-2-3'), '-4');
check('0.1+0.2', calc('0.1+0.2'), '0.3');
check('1÷0 → ∞', calc('1/0'), '∞');
check('0÷0 → 错误', calc('0/0'), '错误');
check('括号不匹配 → 错误', calc('(2+3'), '错误');
check('2^100 科学计数', calc('2^100'), '1.26765060022823×10³⁰');
check('1234×1000 千分位', calc('1234*1000'), '1,234,000');
check('小数输入 0.5+0.25', calc('0.5+0.25'), '0.75');

// 一元负号：先按 − 再 2^2
clear(); key('−'); type('2^2'); key('=');
check('−2^2 = -4', result(), '-4');
check('小字回显', small().trim(), '−2^2 =');

// 链式精度
clear(); type('1/3'); key('=');
check('1÷3', result(), '0.333333333333333');
key('×'); key('3'); key('=');
check('1÷3×3 = 1', result(), '1');

// ---------- 复制按钮：只绑定一次（原 bug 会随输入位数累加） ----------
const copyBtn = doc.getElementById('copyBtn');
let bindCount = 0;
const origAdd = copyBtn.addEventListener.bind(copyBtn);
copyBtn.addEventListener = (...a) => { bindCount++; return origAdd(...a); };
for (const d of '12345678901234567890') key(d);
check('输入 20 位后新增监听数', bindCount, 0);

// ---------- 复制内容 ----------
clear(); type('1234*1000'); key('=');
let copied = null;
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: (t) => { copied = t; return Promise.resolve(); } },
  configurable: true,
});
copyBtn.click();
check('复制到剪贴板的内容', copied, '1234000');
setImmediate(() => {
  check('复制按钮出现 copied 状态', copyBtn.classList.contains('copied'), true);
  check('提示文案', doc.getElementById('toast').textContent.includes('已复制'), true);
  check('提示 toast 显示中', doc.getElementById('toast').classList.contains('show'), true);
  finish();
});

// ---------- 键盘 ----------
clear();
pressKey('1'); pressKey('2'); pressKey('+'); pressKey('3'); pressKey('4');
pressKey('Enter');
check('键盘 12+34 Enter', result(), '46');
pressKey('Escape');
check('Esc 清空', result(), '0');
['(', '1', '+', '2', ')', '*', '3'].forEach(k => pressKey(k));
pressKey('=');
check('键盘括号 (1+2)*3', result(), '9');
clear();
['7', '/', '0'].forEach(k => pressKey(k));
pressKey('=');
check('键盘 7÷0', result(), '∞');

// Ctrl+C 不应被吞成清空
clear(); type('123');
pressKey('c', { ctrlKey: true });
check('Ctrl+C 不清空', result(), '123');
pressKey('Delete');
check('Delete 清空', result(), '0');

// ---------- 退格 ----------
clear(); type('12'); key('+'); key('⌫');
check('12+ 退格 → 12', result(), '12');
key('⌫');
check('再退格 → 1', result(), '1');
key('⌫');
check('再退格 → 0', result(), '0');

// ---------- 百分比 / 开方 / 平方 ----------
clear(); type('50'); key('%');
check('50%', result(), '0.5');
clear(); type('2'); key('√');
check('√2', result(), '1.4142135623731');
clear(); type('3'); key('x²');
check('3²', result(), '9');
clear(); type('9'); key('√');
check('√9 精确', result(), '3');

// ---------- 错误后恢复 ----------
clear(); type('5/0'); key('=');
check('5÷0 显示 ∞', result(), '∞');
key('+'); key('1'); key('=');
check('∞+1 仍为 ∞', result(), '∞');
clear(); type('9'); key('=');
check('清空后可继续算', result(), '9');

// ---------- DOM / 结构 ----------
const btns = [...doc.querySelectorAll('.pad button')];
check('所有按键都有文本', btns.every(b => b.textContent.trim().length > 0), true);
check('括号键已存在', btns.filter(b => ['(', ')'].includes(b.textContent.trim())).length, 2);
check('无重复按键文本', new Set(btns.map(b => b.textContent.trim())).size, 24);
check('等号键不跨行（无 .zero 双宽）', doc.querySelectorAll('.zero').length, 0);
check('显示区字号自适应', /px$/.test(doc.getElementById('result').style.fontSize), true);

function finish() {
  const fail = rows.filter(r => !r.ok).length;
  console.log(`\n${rows.length - fail}/${rows.length} 通过${fail ? `，${fail} 项失败` : ''}`);
  process.exit(fail ? 1 : 0);
}
