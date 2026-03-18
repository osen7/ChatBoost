# ChatBoost

ChatBoost is a browser extension for long AI web chats.  
ChatBoost 是一个面向 AI 长对话场景的浏览器扩展。

It focuses on two user-facing capabilities only.  
它只保留两个用户可见核心能力。

1. `Boost`  
Reduce UI rendering pressure and memory footprint in long conversations.  
降低长对话中的渲染压力和内存占用。

2. `Index`  
Jump directly to key Q&A locations with question-first navigation.  
以“问题优先”方式快速定位到关键问答位置。

## Why ChatBoost

Long AI chats degrade in two ways.  
AI 长对话通常会在两方面退化。

1. The page becomes heavy and laggy.  
页面越来越重、越来越卡。

2. Users lose navigation efficiency in long history.  
历史变长后，定位效率显著下降。

ChatBoost addresses both without touching server-side data or model context.  
ChatBoost 同时解决这两点，并且不修改服务端数据或模型上下文。

## Product Principles

1. Local-only display optimization.  
仅做本地显示层优化。

2. Reversible operations.  
所有优化可逆。

3. Minimal UI surface.  
UI 面保持最小化。

4. Predictable behavior over feature sprawl.  
优先可预测行为，避免功能膨胀。

## Core Features

1. `Boost` switch  
Single entry to enable or disable runtime optimization.  
单入口启停优化。

2. Viewport-priority single-rule engine  
Messages outside the viewport are downgraded first; near-viewport messages are restored just-in-time.  
视口外优先降级，视口附近按需恢复。

3. Message render states  
`full / collapsed / placeholder`.  
渲染三态：`full / collapsed / placeholder`。

4. Dehydrate + restore  
Far messages can be dehydrated to reduce DOM load and restored on demand.  
远距消息可脱水，按需恢复。

5. Memory guardrail  
Session-level budget with LRU fallback for dehydrated cache.  
会话级预算 + LRU 回退。

6. Question-first index  
Index is built from user questions first, with click-to-jump and previous/next navigation.  
问题优先索引，支持点击跳转和上下导航。

7. Latest-message protection  
Newest tail messages are protected from aggressive folding.  
最新尾部消息会被保护，降低误折叠概率。

8. SPA conversation switch handling  
Route change triggers engine reset and rebuild.  
路由变化会触发引擎重置与重建。

## Architecture

```text
content script
  ├─ site adapter
  ├─ optimization engine
  │   ├─ thread model
  │   ├─ scheduler
  │   ├─ render state controller
  │   └─ safety guard
  └─ floating widget (Shadow DOM)
```

## Scope

Current site support: ChatGPT.  
当前支持站点：ChatGPT。

Explicit non-goals:  
明确不做：

1. No server-side message deletion.  
不删除服务端历史消息。

2. No message text mutation.  
不篡改消息文本。

3. No model context rewrite.  
不重写模型上下文。

4. No proxy middleware behavior.  
不做代理层行为。

## Local Development

```bash
npm install
npm run build
```

Then load `dist/` in `chrome://extensions/` or `edge://extensions/` with developer mode enabled.  
构建后在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式并加载 `dist/`。

## Repository Layout

```text
src/
  adapters/   site adapters and thread id resolution
  content/    bootstrap and page lifecycle
  core/       engine, model, scheduler, viewport, safety
  features/   collapse, placeholder, message controls
  shared/     types and config
  ui/         floating widget
```

## Roadmap

1. Panic mode for extreme long sessions.  
极长会话应急模式（Panic mode）。

2. Automated benchmark workflow and regression reports.  
自动化基准与回归报告。

3. Claude / Gemini adapter parity.  
Claude / Gemini 适配对齐。

4. Production hardening for host DOM changes.  
宿主 DOM 变更下的稳定性加固。

## Project Docs

1. [Contributing](./CONTRIBUTING.md)
2. [Security](./SECURITY.md)
3. [Changelog](./CHANGELOG.md)
4. [Release Notes](./RELEASE_NOTES.md)
