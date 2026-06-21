---
"@requence/table": major
---

Initial release of `@requence/table` — a headless virtualized table for React.

- `VirtualTable` compound component with slot-based API (Header, Column, Body, Row, Cell, SkeletonRow, Empty, Footer)
- CSS Grid layout with resizable columns (drag handles, min/max width, fr value tracking)
- Virtual scrolling with configurable overscan and `flushSync` for flicker-free rendering
- `useTableCache` — Suspense-compatible paginated data cache with sort-aware upsert/remove mutations
- `useTableColumnWidths` — column width persistence via localStorage
- Factory functions (`createTableHeader`, `createTableColumn`, etc.) for baking in default props
