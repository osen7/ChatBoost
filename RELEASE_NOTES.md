# Release Notes
发布说明

## v0.2.0 (2026-03-19)

### Highlights
核心更新

1. Product UX simplified to two core capabilities:
   - `Boost` for performance and memory control
   - `Index` for direct Q&A navigation
2. Render policy moved to viewport-priority single-rule behavior.
3. Question-first index navigation aligned with real user recall patterns.
1. 产品交互收敛为两个核心能力：`Boost` 与 `Index`。  
2. 渲染策略改为“视口优先单规则”。  
3. 问题优先索引更贴近用户记忆与回溯习惯。

### Performance and Memory
性能与内存

1. Added dehydrate memory budget guardrail with LRU fallback.
2. Added latest-message protection to reduce accidental folding.
3. Improved collapsed/placeholder visual stability and reduced overlap issues.

### Navigation Experience
导航体验

1. Click-to-jump for indexed entries.
2. Previous/next navigation across indexed entries.
3. Summary-card style index rows with compact readable previews.

### Engineering Notes
工程说明

1. Added runtime metrics hooks for update latency, DOM size, and pressure signals.
2. Added project docs baseline:
   - `CONTRIBUTING.md`
   - `SECURITY.md`
   - `CHANGELOG.md`
