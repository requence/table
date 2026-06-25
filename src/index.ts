// NOTE: local bindings to work around a Bun bundler bug where
// pure `export { X } from './Y'` re-exports produce an index.js
// without actual import statements.
// See: https://github.com/oven-sh/bun/issues/27709
import {
  VirtualTable as _VirtualTable,
  createTableBody as _createTableBody,
  createTableColumn as _createTableColumn,
  createTableEmpty as _createTableEmpty,
  createTableFooter as _createTableFooter,
  createTableHeader as _createTableHeader,
  createTableRow as _createTableRow,
  createTableSkeletonRow as _createTableSkeletonRow,
} from './VirtualTable.tsx'
export type {
  SlotComponent,
  VirtualTableHandle,
  VirtualTableProps,
  VirtualTableHeaderProps,
  VirtualTableColumnProps,
  VirtualTableColumnDef,
  VirtualTableBodyProps,
  VirtualTableSkeletonRowProps,
  VirtualTableRowProps,
  VirtualTableCellProps,
  VirtualTableEmptyProps,
  VirtualTableFooterProps,
} from './VirtualTable.tsx'

import { useTableCache as _useTableCache } from './useTableCache.ts'
export type { UseTableCacheOptions, TableCache } from './useTableCache.ts'


import { useTableColumnWidths as _useTableColumnWidths } from './useTableColumnWidths.ts'

const VirtualTable = _VirtualTable
const createTableHeader = _createTableHeader
const createTableColumn = _createTableColumn
const createTableBody = _createTableBody
const createTableSkeletonRow = _createTableSkeletonRow
const createTableEmpty = _createTableEmpty
const createTableFooter = _createTableFooter
const createTableRow = _createTableRow
const useTableCache = _useTableCache
const useTableColumnWidths = _useTableColumnWidths

export {
  VirtualTable,
  createTableHeader,
  createTableColumn,
  createTableBody,
  createTableSkeletonRow,
  createTableEmpty,
  createTableFooter,
  createTableRow,
  useTableCache,
  useTableColumnWidths,
}
