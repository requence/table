# @requence/table

## 1.0.0

### Major Changes

- [`9cd60f0`](https://github.com/requence/table/commit/9cd60f045ac8a0332a283f70e0962250c8502264) Thanks [@Torsten85](https://github.com/Torsten85)! - Initial release of `@requence/table` — a headless virtualized table for React.

  - `VirtualTable` compound component with slot-based API (Header, Column, Body, Row, Cell, SkeletonRow, Empty, Footer)
  - CSS Grid layout with resizable columns (drag handles, min/max width, fr value tracking)
  - Virtual scrolling with configurable overscan and `flushSync` for flicker-free rendering
  - `useTableCache` — Suspense-compatible paginated data cache with sort-aware upsert/remove mutations
  - `useTableColumnWidths` — column width persistence via localStorage
  - Factory functions (`createTableHeader`, `createTableColumn`, etc.) for baking in default props
