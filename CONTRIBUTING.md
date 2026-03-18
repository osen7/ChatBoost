# Contributing to ChatBoost

Thanks for your interest in improving ChatBoost.

## Development Setup

```bash
npm install
npm run build
```

For type checks:

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

## Pull Request Guidelines

1. Explain the user-facing impact.
2. List risks and fallback behavior.
3. Include verification steps.
4. Keep UI changes minimal and purposeful.

## Performance-Sensitive Areas

Changes in these areas require extra care:

1. `src/core/engine.ts`
2. `src/features/placeholder.ts`
3. `src/ui/panel.ts`

For these files, include:

1. Why this change is needed.
2. How it affects scroll/render/memory behavior.
3. What regressions were checked.

## Product Direction

ChatBoost is intentionally minimal.

Current external surface should stay focused on:

1. `Boost` switch
2. `Index` navigation

Avoid adding user-facing complexity unless there is strong evidence.
