---
'@requence/table': minor
---

VirtualTable: expose imperative ref handle (`scrollTop`, `scrollBy`), add `onScroll` and `adjustScrollPosition` props, support callback-form `className`/`style` receiving parsed column definitions, export `VirtualTableColumnDef` type, allow extra column props via `TExtras` generic, render skeleton rows as tiled SVG background image.

useTableCache: rename `handleRangeChange` to `onRangeChange`, require `rowHeight` option for scroll correction, return `ref` and `getTotalCount`, correct scroll position on insert/remove above viewport, replace page invalidation with surgical shift/pull, defer cleanup for StrictMode compatibility.
