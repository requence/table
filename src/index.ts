// NOTE: local bindings to work around a Bun bundler bug where
// pure `export { X } from './Y'` re-exports produce an index.js
// without actual import statements.
// See: https://github.com/oven-sh/bun/issues/27709
import {
  VirtualTable as _VirtualTable,
  createTableHeader as _createTableHeader,
  createTableColumn as _createTableColumn,
  createTableBody as _createTableBody,
  createTableSkeletonRow as _createTableSkeletonRow,
  createTableEmpty as _createTableEmpty,
  createTableFooter as _createTableFooter,
  createTableRow as _createTableRow,
} from './VirtualTable.tsx'
export type {
  SlotComponent,
  VirtualTableProps,
  VirtualTableHeaderProps,
  VirtualTableColumnProps,
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
