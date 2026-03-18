# ChatBoost

ChatBoost 是一个面向 AI 长对话场景的浏览器扩展。

它解决两个长期被混在一起的问题：

1. 对话越来越长，页面越来越卡
2. 内容被折叠或轻量化以后，用户很难知道哪些内容被处理了，也很难快速跳回去

ChatBoost 的目标不是替换聊天产品本身，而是在当前页面之上提供一层稳定、可解释、可恢复的体验增强层。

## What It Does

ChatBoost 只做浏览器本地显示层优化，不修改消息内容，不修改服务端历史，不干预模型上下文。

它当前聚焦三件事：

1. 降低长线程渲染压力，改善滚动、输入和阅读流畅度
2. 把被折叠或轻量化的内容透明地展示出来，而不是黑盒处理
3. 让用户可以在当前会话里快速恢复、定位和回跳这些内容

## Product Shape

当前交互形态不是“大面板控制台”，而是右侧贴边的小型工具条：

1. 默认只显示一个右侧悬浮锚点
2. hover 后展开竖向快捷工具列
3. hover 图标显示中文功能说明
4. 点击工具项再打开状态或已轻量化内容面板

这样做的原因很直接：

1. 不打断阅读
2. 不遮挡左侧历史会话区
3. 适合高频小操作
4. 更符合“页内增强层”而不是“后台控制台”的产品定位

## Current Features

当前已实现并可运行的能力如下：

1. 三态渲染决策：`full / collapsed / placeholder`
2. 消息级 `Expand / Collapse`
3. 右侧固定悬浮锚点 + hover 工具条
4. 右侧贴边，上下拖动，不再允许左侧停靠
5. 性能模式：`Lite / Balanced / Aggressive`
6. `开启/关闭加速`、`暂停本页优化`、`恢复全部消息`
7. `已轻量化内容` 面板
8. 点击轻量化列表项可直接：
   `恢复完整显示 -> 平滑滚动 -> 高亮定位`
9. SPA 会话切换检测：
   `history route events + polling fallback`
10. 快捷键显示/隐藏控件：
   `Ctrl + Shift + S`

## Why This Matters

长对话体验问题不只是性能问题，也是信息结构问题。

大多数方案只解决其中一边：

1. 要么只是做 DOM 清理或渲染优化
2. 要么只是做问题目录和跳转

ChatBoost 的价值在于把这两件事接起来：

1. 既让页面不卡
2. 又让被优化过的内容仍然可见、可解释、可恢复、可跳转

这比单纯“删 DOM”更稳，也更容易建立用户信任。

## Architecture

```text
content script
  ├─ site adapter
  ├─ optimization engine
  │   ├─ thread model
  │   ├─ scheduler
  │   ├─ render state controller
  │   └─ safety guard
  └─ floating widget UI (Shadow DOM)
```

核心原则：

1. 每个 tab 是独立实例
2. 不跨页面共享运行时 DOM 状态
3. 单页面会话切换时执行 `engine.reset()`
4. 所有轻量化内容都必须可解释、可恢复、可定位

## Current Scope

当前主站点支持：

1. ChatGPT

当前明确不做：

1. 不修改消息文本
2. 不修改服务端历史
3. 不替换模型上下文
4. 不做代理层
5. 不做摘要替代原始对话

## Local Run

```bash
npm install
npm run build
```

构建完成后，在 Chrome 或 Edge 中打开扩展管理页，加载 `dist/` 目录即可。

## Code Layout

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

下一阶段优先级：

1. Claude / Gemini adapters
2. 会话导航目录：问题导航 / assistant 回复导航
3. 更强的轻量化原因解释与筛选
4. 压力量化指标与回归基准
5. 更完整的安全停用与恢复策略
