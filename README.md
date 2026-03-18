# ChatBoost

ChatBoost is a browser extension for long AI web chats.

It focuses on two user-facing capabilities only:

1. `Boost`  
Reduce UI rendering pressure and memory footprint in long conversations.
2. `Index`  
Jump directly to key Q&A locations with question-first navigation.

## Why ChatBoost

Long AI chats degrade in two ways:

1. The page becomes heavy and laggy.
2. Users lose navigation efficiency in long history.

ChatBoost addresses both without touching server-side data or model context.

## Product Principles

1. Local-only display optimization.
2. Reversible operations.
3. Minimal UI surface.
4. Predictable behavior over feature sprawl.

## Core Features

1. `Boost` switch  
Single entry to enable or disable runtime optimization.
2. Viewport-priority single-rule engine  
Messages outside the viewport are downgraded first; near-viewport messages are restored just-in-time.
3. Message render states  
`full / collapsed / placeholder`.
4. Dehydrate + restore  
Far messages can be dehydrated to reduce DOM load and restored on demand.
5. Memory guardrail  
Session-level budget with LRU fallback for dehydrated cache.
6. Question-first index  
Index is built from user questions first, with click-to-jump and previous/next navigation.
7. Latest-message protection  
Newest tail messages are protected from aggressive folding.
8. SPA conversation switch handling  
Route change triggers engine reset and rebuild.

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

Current site support:

1. ChatGPT

Explicit non-goals:

1. No server-side message deletion.
2. No message text mutation.
3. No model context rewrite.
4. No proxy middleware behavior.

## Local Development

```bash
npm install
npm run build
```

Then load `dist/` in `chrome://extensions/` or `edge://extensions/` with developer mode enabled.

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
2. Automated benchmark workflow and regression reports.
3. Claude / Gemini adapter parity.
4. Production hardening for host DOM changes.

## Project Docs

1. [Contributing](./CONTRIBUTING.md)
2. [Security](./SECURITY.md)
3. [Changelog](./CHANGELOG.md)
