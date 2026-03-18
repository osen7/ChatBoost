# Release Notes

## v0.2.0 (2026-03-19)

### Highlights

1. Product UX simplified to two core capabilities:
   - `Boost` for performance and memory control
   - `Index` for direct Q&A navigation
2. Render policy moved to viewport-priority single-rule behavior.
3. Question-first index navigation aligned with real user recall patterns.

### Performance and Memory

1. Added dehydrate memory budget guardrail with LRU fallback.
2. Added latest-message protection to reduce accidental folding.
3. Improved collapsed/placeholder visual stability and reduced overlap issues.

### Navigation Experience

1. Click-to-jump for indexed entries.
2. Previous/next navigation across indexed entries.
3. Summary-card style index rows with compact readable previews.

### Engineering Notes

1. Added runtime metrics hooks for update latency, DOM size, and pressure signals.
2. Added project docs baseline:
   - `CONTRIBUTING.md`
   - `SECURITY.md`
   - `CHANGELOG.md`
