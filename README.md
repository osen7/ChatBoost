# ChatBoost

Browser extension for reducing rendering and memory pressure in long AI chat threads, without changing message content, server history, or model context.

## Why

长对话线程在浏览器侧常见问题：

1. DOM 节点持续增长导致渲染和滚动变慢
2. 输入延迟上升
3. 旧消息阅读体验变差

ChatBoost 只做显示层优化，不改内容和上下文。

## Product Boundary

ChatBoost 的承诺：

1. 只优化浏览器端渲染与内存压力
2. 不修改消息文本
3. 不修改服务端历史
4. 不替换模型上下文
5. 所有优化可逆（可恢复）

## Architecture

```text
content script
  ├─ site adapter
  ├─ optimization engine
  │   ├─ thread model
  │   ├─ scheduler
  │   ├─ render state
  │   └─ safety guard
  └─ floating UI (Shadow DOM)
```

核心原则：

1. 每个 tab 独立实例（per-page engine）
2. 不跨页面共享运行时 DOM 状态
3. SPA 会话切换时 `engine.reset()` 重建模型

## Current Implementation

当前已实现（ChatGPT）：

1. 三态渲染决策：`full / collapsed / placeholder`
2. 消息级 `Expand / Collapse`
3. 悬浮按钮 + 展开面板（Shadow DOM 隔离）
4. 性能模式：`Lite / Balanced / Aggressive`
5. 面板位置：`Auto / Left / Right`（含自动避让、拖拽吸边）
6. `Enable/Disable`、`Pause Page`、`Restore All`
7. SPA 会话切换检测（路由事件 + 轮询兜底）
8. 快捷键显示/隐藏：`Ctrl + Shift + S`

## Development

```text
src/
  content/
  core/
  adapters/
  features/
  ui/
  shared/
```

## Run Locally

```bash
npm install
npm run build
```

在 Chrome 打开 `chrome://extensions/`，加载 `dist/` 目录。

## Roadmap

1. Claude / Gemini adapters
2. 压力量化指标与回归基准
3. 更完善的安全停用与恢复策略
