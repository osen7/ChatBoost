# Contributing to ChatBoost

Thanks for your interest in improving ChatBoost.  
感谢你参与改进 ChatBoost。

## Development Setup

```bash
npm install
npm run build
```

For type checks:
类型检查：

```bash
npm run typecheck
```

## Branch and Commit

1. Create a focused branch from `main`.
2. Keep each pull request scoped to one concern.
3. Use clear commit messages with a prefix:
   - `feat:`
   - `fix:`
   - `refactor:`
   - `docs:`
1. 从 `main` 创建聚焦分支。
2. 每个 PR 只解决一个核心问题。
3. 使用清晰的提交前缀（`feat/fix/refactor/docs`）。

## Pull Request Guidelines

1. Explain the user-facing impact.
2. List risks and fallback behavior.
3. Include verification steps.
4. Keep UI changes minimal and purposeful.
1. 说明用户侧影响。
2. 列出风险与回退策略。
3. 附上验证步骤。
4. UI 改动保持必要且克制。

## Performance-Sensitive Areas

Changes in these areas require extra care:
以下目录属于性能敏感区，改动需额外谨慎：

1. `src/core/engine.ts`
2. `src/features/placeholder.ts`
3. `src/ui/panel.ts`

For these files, include:
提交说明中请补充：

1. Why this change is needed.
2. How it affects scroll/render/memory behavior.
3. What regressions were checked.
1. 改动动机。
2. 对滚动/渲染/内存的影响。
3. 回归检查范围。

## Product Direction

ChatBoost is intentionally minimal.
ChatBoost 的产品方向是“极简而可靠”。

Current external surface should stay focused on:
用户可见能力聚焦于：

1. `Boost` switch
2. `Index` navigation
1. `Boost` 开关
2. `Index` 索引导航

Avoid adding user-facing complexity unless there is strong evidence.
除非有明确证据，否则不要增加用户侧复杂度。
