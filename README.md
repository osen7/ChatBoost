# ChatBoost

Browser extension for reducing rendering and memory pressure in long AI chat threads, without changing message content, server history, or model context.

## Current Status

P0 scaffold is in place:

1. Manifest V3 shell
2. Content script bootstrap
3. ChatGPT adapter interface + initial implementation
4. Thread model + render mode decision (`full/collapsed/placeholder`)
5. Basic scheduler and safety guard
6. Collapse and placeholder feature hooks

## Project Structure

```text
src/
  content/
  core/
  adapters/
  features/
  ui/
  shared/
```

## Next Implementation Steps

1. Harden ChatGPT message selectors and message id stability.
2. Add per-message expand/restore interactions.
3. Keep placeholder height stable across updates.
4. Add on-page toggle + restore all action.
5. Add benchmark script for acceptance metrics in `roadmap.md`.
