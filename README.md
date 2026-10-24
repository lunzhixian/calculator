# 图形化计算器 (Graphical Calculator)

一个简洁、美观的图形化计算器网页应用，支持鼠标点击和键盘输入，并可直接打包为 Android APK。

## 功能特性

- 🎨 深色/浅色自适应界面：玻璃拟态卡片、单一强调色、扁平圆角按键、42px+ 触控区
- 📱 手机优先布局，适配安全区与矮屏，超长结果可横向滚动并自动停在最右端
- ⌨️ 完整键盘支持（数字、运算符、括号、回车、退格、Esc 清空）
- ➗ 高精度计算（基于 decimal.js，内部 120 位精度，避免浮点误差）
- 🧮 支持运算：加、减、乘、除、幂、平方、开方、百分比
- 🔢 括号与隐式乘法（`2(3+1)` = 8），一元负号优先级正确（`-2^2` = -4）
- ∞ 除零得 ∞ 而不是报错，可继续参与运算
- 🔁 链式运算保留 34 位有效数字，屏幕显示 15 位（避免 `1÷3×3` 出现 0.999…）
- 📋 一键复制结果（无千分位、无 ×10ⁿ 符号）
- 🖱️ 按钮动画与操作符高亮

## 在线预览

<https://lunzhixian.github.io/calculator/calculator.html>

## 使用方法

直接用浏览器打开 `calculator.html` 即可，无需安装任何依赖。

Android 版即把同一个 `calculator.html` 放进 WebView 壳（`android/`），由 GitHub Actions 自动构建 APK。

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| `0-9` / `.` | 输入数字 / 小数点 |
| `+ - * / ^` | 运算符 |
| `(` `)` | 左右括号 |
| `Enter` / `=` | 计算结果 |
| `Backspace` | 退格删除 |
| `Esc` / `Delete` | 清空 |
| `%` | 百分比 |

## 精度说明

| 环节 | 位数 |
|------|------|
| 内部运算 | 120 位有效数字 |
| 按 `=` 后存回算式 | 34 位有效数字 |
| 屏幕显示 / 复制 | 15 位有效数字（整数 ≤ 21 位时完整显示） |

## 测试

```bash
node test-calculator.js   # 25 项：无依赖，用极简假 DOM 跑页面脚本
node test-jsdom.js        # 45 项：需要 npm i jsdom，用真实 DOM 事件驱动（点击/键盘/剪贴板）
```

两套用例覆盖优先级与结合性（`-2^2`、`2^3^2`、`1-2-3`）、括号与隐式乘、除零与 ∞ 续算、
链式精度、千分位与复制内容、退格、百分比/开方/平方、复制按钮监听器数量、Ctrl+C 不被劫持等。
运行 `test-jsdom.js` 前先装依赖：

```bash
npm i jsdom && node test-jsdom.js
```

另有一个可选的浏览器端用例 `e2e-browser.js`（真实点击 + 截图），需要本机装有 Playwright 的 Chromium：

```bash
npm i playwright && npx playwright install chromium && node e2e-browser.js
```

## 许可证

[MIT](LICENSE)
