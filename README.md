# ChatBoost

Browser extension for making long AI chat threads smoother and easier to navigate, without changing message content, server history, or model context.

## Why

长对话线程在浏览器侧常见问题：

1. DOM 节点持续增长导致渲染和滚动变慢
2. 输入延迟上升
3. 旧消息阅读体验变差

ChatBoost 只做显示层优化，不改内容和上下文。

它现在解决两类问题：

1. 长对话卡顿、滚动和输入不流畅
2. 被折叠/轻量化后，用户不知道哪些内容被处理了、也不容易快速回跳

## Product Boundary

ChatBoost 的承诺：

1. 只优化浏览器端渲染、内存压力与会话内导航体验
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
4. 所有轻量化内容都可解释、可定位、可恢复

## Current Implementation

当前已实现（ChatGPT）：

1. 三态渲染决策：`full / collapsed / placeholder`
2. 消息级 `Expand / Collapse`
3. 右侧固定悬浮按钮 + hover 工具条（Shadow DOM 隔离）
4. 性能模式：`Lite / Balanced / Aggressive`
5. 右侧贴边 + 上下拖动，不遮挡左侧历史会话区
6. `Enable/Disable`、`Pause Page`、`Restore All`
7. `已轻量化内容` 检查面板
8. 点击轻量化列表项：自动恢复 + 平滑滚动 + 高亮定位
9. SPA 会话切换检测（路由事件 + 轮询兜底）
10. 快捷键显示/隐藏：`Ctrl + Shift + S`

## Key UX

ChatBoost 不是一个常驻控制台，而是一个页内增强层：

1. 默认是右侧小锚点
2. hover 展开竖向工具条
3. hover 图标显示中文提示
4. 点击 `已轻量化内容` 可查看当前被折叠/占位的消息
5. 点击列表项即可跳转到对应消息，并自动恢复显示

这让优化过程从“黑盒”变成“可解释、可恢复、可回跳”。

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
2. 会话导航目录（问题目录 / assistant 回答导航）
3. 压力量化指标与回归基准
