# @requence/table

## 1.1.8

### Patch Changes

- b7a1b50: Fix `useTableCache` leaving a visible page permanently short in static
  viewports. `remove()` relies on `fetchPage` to refill a page when
  `surgicalPull` hits an uncached neighbor, but that refill was only triggered
  by `onRangeChange` — which never re-fires when the visible range doesn't
  change (no scroll/resize, e.g. top-N previews). `upsert()`/`remove()` now
  re-run the fetches for the last visible range themselves; `fetchPage`'s
  guards keep this a no-op when nothing needs repair.

## 1.1.7

### Patch Changes

- ef18681: Fix upsert into an empty cache (0→1 item transition). When the initial fetch
  returned zero items, subsequent subscription upserts skipped the empty page and
  never stored the item, causing the table to render an empty row.

## 1.1.6

### Patch Changes

- 3b20f1f: Replace useEffectEvent with useRef+useCallback for stableGetItemId and
  stableCompare in useTableCache. useEffectEvent-wrapped functions throw
  when called during the React render phase, which happens when urql's
  useSubscription invokes the handler inside a useState updater.

## 1.1.5

### Patch Changes

- affa832: Fix upsert not rendering items that sort after the last cached page when it is
  the terminal page. Previously, new items appended at the end always deferred to
  fetchCount — incrementing totalCount (creating empty space) without placing the
  item on any page. Now the item is inserted directly when the last cached page
  covers the tail of the dataset. Also stabilise callback identities with
  useEffectEvent and memoise the returned cache object.

## 1.1.4

### Patch Changes

- 2c091ec: Fix DOM element reuse in VirtualTable empty state which could leak background skeleton rows. Enable vertical and horizontal centering of empty state contents by adding the `grow` style to its flex wrapper.

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
