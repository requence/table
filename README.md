# @requence/table

Headless virtualized table with compound component API, Suspense-compatible data caching, and column width persistence for React.

📖 **[Documentation](https://table.docs.requence.cloud)**

## Installation

```bash
npm install @requence/table
```

## Prerequisites

This package uses [Tailwind CSS](https://tailwindcss.com/) utility classes internally (via `tailwind-merge`). Your project must have Tailwind CSS configured for the component to render correctly.

## Quick Start

### VirtualTable

A compound component for rendering large datasets with virtual scrolling.

```tsx
import { VirtualTable } from '@requence/table'

function MyTable({ cache }) {
  return (
    <VirtualTable
      totalCount={cache.totalCount}
      rowHeight={32}
      onRangeChange={cache.handleRangeChange}
    >
      <VirtualTable.Header>
        <VirtualTable.Column width="2fr" resizable>Name</VirtualTable.Column>
        <VirtualTable.Column width="1fr">Email</VirtualTable.Column>
        <VirtualTable.Column width={100}>Status</VirtualTable.Column>
      </VirtualTable.Header>

      <VirtualTable.Body>
        {(index) => {
          const item = cache.getItem(index)
          if (!item) return null

          return (
            <VirtualTable.Row>
              <VirtualTable.Cell>{item.name}</VirtualTable.Cell>
              <VirtualTable.Cell>{item.email}</VirtualTable.Cell>
              <VirtualTable.Cell>{item.status}</VirtualTable.Cell>
            </VirtualTable.Row>
          )
        }}
      </VirtualTable.Body>

      <VirtualTable.Empty>No data found.</VirtualTable.Empty>

      <VirtualTable.Footer>
        {({ start, end }) => `Showing rows ${start}–${end}`}
      </VirtualTable.Footer>
    </VirtualTable>
  )
}
```

### useTableCache

Suspense-compatible paginated data cache. The first fetch suspends the component; subsequent page fetches are non-blocking.

```tsx
import { useTableCache } from '@requence/table'

const cache = useTableCache('users', {
  pageSize: 50,
  getItemId: (item) => item.id,
  compare: (a, b) => a.name.localeCompare(b.name),
  fetchItems: async (offset, limit) => {
    const res = await fetch(`/api/users?offset=${offset}&limit=${limit}`)
    const { items, total } = await res.json()
    return { items, total }
  },
})
```

### useTableColumnWidths

Persist user-resized column widths to localStorage.

```tsx
import { useTableColumnWidths } from '@requence/table'

const { register, reset } = useTableColumnWidths({ persist: 'my-table' })

<VirtualTable.Column {...register('name', { defaultValue: '2fr', relative: true })}>
  Name
</VirtualTable.Column>
```

## Exports

All exports are available from the package root:

| Export | Type | Description |
| --- | --- | --- |
| `VirtualTable` | Component | Compound component (`.Header`, `.Column`, `.Body`, `.Row`, `.Cell`, `.SkeletonRow`, `.Empty`, `.Footer`) |
| `createTable*` | Functions | Factory functions for creating pre-configured sub-components with baked-in defaults |
| `useTableCache` | Hook | Suspense-compatible paginated data cache |
| `useTableColumnWidths` | Hook | Column width persistence with localStorage |

## License

MIT
