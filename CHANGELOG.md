# @requence/table

## 1.1.3

### Patch Changes

- 8062947: Allow `useTableCache` key to be a `string`, `number`, or an array of both. Array keys are joined with `'-'` internally, avoiding manual string concatenation when combining dynamic parameters like sort field, direction, and filters. The `CacheKey` type is now exported.

## 1.1.2

### Patch Changes

- [`2cdb14a`](https://github.com/requence/table/commit/2cdb14a37712605b31900766b5957fce3c249488) Thanks [@Torsten85](https://github.com/Torsten85)! - code cleanup

## 1.1.1

### Patch Changes

- [`12b22f7`](https://github.com/requence/table/commit/12b22f7300ec4cbc28bd85dea71478f812919d99) Thanks [@Torsten85](https://github.com/Torsten85)! - Fix header row inheriting data row height in empty state

- [`6e2d6c7`](https://github.com/requence/table/commit/6e2d6c77b5d3dec0f05865fd8ecf6ef19345704b) Thanks [@Torsten85](https://github.com/Torsten85)! - Fix laggy column resizing when React re-renders during drag

## 1.1.0

### Minor Changes

- [`6348596`](https://github.com/requence/table/commit/6348596e66058f3e9f23e6fbcecc96baf9254ded) Thanks [@Torsten85](https://github.com/Torsten85)! - VirtualTable: expose imperative ref handle (`scrollTop`, `scrollBy`), add `onScroll` and `adjustScrollPosition` props, support callback-form `className`/`style` receiving parsed column definitions, export `VirtualTableColumnDef` type, allow extra column props via `TExtras` generic, render skeleton rows as tiled SVG background image.

  useTableCache: rename `handleRangeChange` to `onRangeChange`, require `rowHeight` option for scroll correction, return `ref` and `getTotalCount`, correct scroll position on insert/remove above viewport, replace page invalidation with surgical shift/pull, defer cleanup for StrictMode compatibility.

- [`1d3ee15`](https://github.com/requence/table/commit/1d3ee15d0b9bf0ae824c3457d567c7c437b0150c) Thanks [@Torsten85](https://github.com/Torsten85)! - Add `safariOnly` option to smooth scrolling config (default `true`), so the rAF lerp only activates in Safari where it is needed.

## 1.0.1

### Patch Changes

- [`2896633`](https://github.com/requence/table/commit/289663366ef0bf8a24c192a763afd68c1104e3d1) Thanks [@Torsten85](https://github.com/Torsten85)! - Fix broken bundle output caused by Bun bundler barrel re-export bug

## 1.0.0

### Major Changes

- [`9cd60f0`](https://github.com/requence/table/commit/9cd60f045ac8a0332a283f70e0962250c8502264) Thanks [@Torsten85](https://github.com/Torsten85)! - Initial release of `@requence/table` — a headless virtualized table for React.

  - `VirtualTable` compound component with slot-based API (Header, Column, Body, Row, Cell, SkeletonRow, Empty, Footer)
  - CSS Grid layout with resizable columns (drag handles, min/max width, fr value tracking)
  - Virtual scrolling with configurable overscan and `flushSync` for flicker-free rendering
  - `useTableCache` — Suspense-compatible paginated data cache with sort-aware upsert/remove mutations
  - `useTableColumnWidths` — column width persistence via localStorage
  - Factory functions (`createTableHeader`, `createTableColumn`, etc.) for baking in default props
