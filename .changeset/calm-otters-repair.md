---
'@requence/table': patch
---

Fix `useTableCache` leaving a visible page permanently short in static
viewports. `remove()` relies on `fetchPage` to refill a page when
`surgicalPull` hits an uncached neighbor, but that refill was only triggered
by `onRangeChange` — which never re-fires when the visible range doesn't
change (no scroll/resize, e.g. top-N previews). `upsert()`/`remove()` now
re-run the fetches for the last visible range themselves; `fetchPage`'s
guards keep this a no-op when nothing needs repair.
