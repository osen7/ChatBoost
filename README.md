# ChatBoost

Browser extension for reducing rendering and memory pressure in long AI chat threads, without changing message content, server history, or model context.

## 当前功能（可直接体验）

已实现（ChatGPT）：

1. 页面级优化引擎（每个 tab 独立）
2. 三态渲染决策：`full / collapsed / placeholder`
3. 单条消息 `Expand / Collapse`
4. 悬浮按钮 + 可展开控制面板（Shadow DOM 隔离）
5. 性能模式：`Lite / Balanced / Aggressive`
6. 悬浮窗位置：`Auto / Left / Right`（含自动避让、拖动吸边）
7. `Restore All`、`Pause Page`、`Enable/Disable`
8. SPA 会话切换自动 `engine.reset()`（路由事件 + 轮询兜底）
9. 快捷键显示/隐藏悬浮控件：`Ctrl + Shift + S`

## 本地运行

### 1) 安装依赖

```bash
npm install
```

### 2) 构建扩展

```bash
npm run build
```

构建产物在 `dist/`。

### 3) Chrome 加载扩展

1. 打开 `chrome://extensions/`
2. 打开“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择项目目录下的 `dist/`

### 4) 打开站点验证

- `https://chatgpt.com/`
- 或 `https://chat.openai.com/`

进入长对话页面后，右下角会看到悬浮按钮 `⚡ ON/OFF`。

## 可验证清单

1. 点击悬浮按钮可展开面板
2. `Mode` 可循环切换三档
3. `Place` 可切 `Auto/Right/Left`
4. `Pause Page` 后停止优化，再点恢复
5. `Restore All` 可恢复所有消息到完整显示
6. 切换到另一个 ChatGPT 会话（同 tab）会自动重建线程状态
7. `Ctrl + Shift + S` 可隐藏/唤出悬浮控件

## 项目结构

```text
src/
  content/
  core/
  adapters/
  features/
  ui/
  shared/
```

## 下一步

1. 新增 Claude adapter，复用 `getThreadId()` 与 reset 机制
2. 增加性能压力量化指示（Normal/Busy/High）
3. 引入基准脚本，对照 `roadmap.md` 的验收指标做回归
