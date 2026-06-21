import {
  type CSSProperties,
  Children,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { twMerge } from 'tailwind-merge'

/* ── Types ──────────────────────────────────────────────────────── */

export interface VirtualTableProps {
  /** Total number of rows in the dataset */
  totalCount: number
  /** Fixed height of each row in pixels */
  rowHeight: number
  /** Number of extra rows rendered above/below viewport (default: 5) */
  overscan?: number
  /** Called when the visible row range changes (for triggering page fetches) */
  onRangeChange?: (range: { start: number; end: number }) => void
  /** Additional className for the outer container */
  className?: string
  /** Accessible label for the table */
  'aria-label'?: string
  /** Additional inline styles for the outer container */
  style?: CSSProperties
  children: ReactNode
}

export interface VirtualTableHeaderProps {
  className?: string
  children: ReactNode
}

export interface VirtualTableColumnProps {
  /** Column width. Number for pixels, string for CSS grid values (e.g. '1fr'). Defaults to '1fr'. */
  width?: number | string
  /** Optional className for the header cell */
  className?: string
  /** Whether this column can be resized by dragging. Default: false */
  resizable?: boolean
  /** Minimum width in pixels during resize. Default: 50 */
  minWidth?: number
  /** Maximum width in pixels during resize */
  maxWidth?: number
  /** Mark this column as transparent — the row background will not extend behind it. */
  transparent?: boolean
  /** Called when a resize drag starts */
  onResizeStart?: () => void
  /** Called when a resize drag ends with the final pixel width, original width, and equivalent fr value */
  onResizeEnd?: (width: number, startWidth: number, frValue: number) => void
  children?: ReactNode
}

export interface VirtualTableBodyProps {
  children: (index: number) => ReactNode | null
}

export interface VirtualTableRowProps extends ComponentProps<'div'> {}

export interface VirtualTableSkeletonRowProps extends ComponentProps<'div'> {}

export interface VirtualTableCellProps extends ComponentProps<'div'> {
  /** Show cell content only on row hover */
  showOnHover?: boolean
  /** Number of columns this cell spans */
  colSpan?: number
}

export interface VirtualTableEmptyProps {
  className?: string
  children: ReactNode
}

export interface VirtualTableFooterProps {
  className?: string
  children: (range: { start: number; end: number }) => ReactNode
}

/* ── Internal types ─────────────────────────────────────────────── */

interface ColumnDef {
  width?: number | string
  header?: ReactNode
  className?: string
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
  transparent?: boolean
  onResizeStart?: () => void
  onResizeEnd?: (width: number, startWidth: number, frValue: number) => void
}

interface Slots {
  header: { className?: string; columns: ColumnDef[] } | null
  body: VirtualTableBodyProps | null
  skeletonRow: VirtualTableSkeletonRowProps | null
  empty: VirtualTableEmptyProps | null
  footer: VirtualTableFooterProps | null
}

/* ── Slot system ───────────────────────────────────────────────── */

interface SlotComponent<P> {
  (props: P): ReactNode
  slot: string
  slotDefaults: Partial<P>
}

function asSlot<P>(slot: string, defaults?: Partial<P>): SlotComponent<P> {
  const Component = (() => null) as unknown as SlotComponent<P>
  Component.slot = slot
  Component.slotDefaults = defaults ?? ({} as Partial<P>)
  return Component
}

export function createTableHeader(
  defaults?: Partial<VirtualTableHeaderProps>,
): SlotComponent<VirtualTableHeaderProps> {
  return asSlot('header', defaults)
}

export function createTableColumn(
  defaults?: Partial<VirtualTableColumnProps>,
): SlotComponent<VirtualTableColumnProps> {
  return asSlot('column', defaults)
}

export function createTableBody(
  defaults?: Partial<VirtualTableBodyProps>,
): SlotComponent<VirtualTableBodyProps> {
  return asSlot('body', defaults)
}

export function createTableSkeletonRow(
  defaults?: Partial<VirtualTableSkeletonRowProps>,
): SlotComponent<VirtualTableSkeletonRowProps> {
  return asSlot('skeletonRow', defaults)
}

export function createTableEmpty(
  defaults?: Partial<VirtualTableEmptyProps>,
): SlotComponent<VirtualTableEmptyProps> {
  return asSlot('empty', defaults)
}

export function createTableFooter(
  defaults?: Partial<VirtualTableFooterProps>,
): SlotComponent<VirtualTableFooterProps> {
  return asSlot('footer', defaults)
}

export function createTableRow(
  defaults?: Partial<VirtualTableRowProps>,
): SlotComponent<VirtualTableRowProps> {
  return asSlot('row', defaults)
}

/* ── Constants ──────────────────────────────────────────────────── */

const GRID_VAR = '--vtable-grid-cols'
const GRID_VAR_REF = `var(${GRID_VAR})`

/* ── Helpers ────────────────────────────────────────────────────── */

function buildGridTemplate(columns: ColumnDef[]): string {
  return columns
    .map((col) => {
      if (typeof col.width === 'number') {
        return `${col.width}px`
      }
      const min = col.minWidth ? `${col.minWidth}px` : '0'
      if (typeof col.width === 'string') {
        return `minmax(${min}, ${col.width})`
      }
      return `minmax(${min}, 1fr)`
    })
    .join(' ')
}

/* ── Slot Components (render nothing — used as config markers) ── */

const VirtualTableHeader = asSlot<VirtualTableHeaderProps>('header')
const VirtualTableColumn = asSlot<VirtualTableColumnProps>('column')
const VirtualTableBody = asSlot<VirtualTableBodyProps>('body')
const VirtualTableRow = asSlot<VirtualTableRowProps>('row')
const VirtualTableSkeletonRow =
  asSlot<VirtualTableSkeletonRowProps>('skeletonRow')
const VirtualTableEmpty = asSlot<VirtualTableEmptyProps>('empty')
const VirtualTableFooter = asSlot<VirtualTableFooterProps>('footer')

function slotIs(child: React.ReactElement, slot: string): boolean {
  return (child.type as any)?.slot === slot
}

function extractSlots(children: ReactNode): Slots {
  let header: Slots['header'] = null
  let body: Slots['body'] = null
  let skeletonRow: Slots['skeletonRow'] = null
  let empty: Slots['empty'] = null
  let footer: Slots['footer'] = null

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return
    }

    if (slotIs(child, 'header')) {
      const defaults = (child.type as any).slotDefaults ?? {}
      const props = child.props as VirtualTableHeaderProps
      const columns: ColumnDef[] = []
      Children.forEach(props.children, (col) => {
        if (isValidElement(col) && slotIs(col, 'column')) {
          const d = (col.type as any).slotDefaults ?? {}
          const p = col.props as VirtualTableColumnProps
          columns.push({
            width: p.width ?? d.width,
            header: p.children,
            className: twMerge(d.className as string, p.className),
            resizable: p.resizable ?? d.resizable,
            minWidth: p.minWidth ?? d.minWidth,
            maxWidth: p.maxWidth ?? d.maxWidth,
            transparent: p.transparent ?? d.transparent,
            onResizeStart: p.onResizeStart ?? d.onResizeStart,
            onResizeEnd: p.onResizeEnd ?? d.onResizeEnd,
          })
        }
      })
      header = {
        className: twMerge(defaults.className as string, props.className),
        columns,
      }
    } else if (slotIs(child, 'body')) {
      body = child.props as VirtualTableBodyProps
    } else if (slotIs(child, 'skeletonRow')) {
      const defaults = (child.type as any).slotDefaults ?? {}
      const props = child.props as VirtualTableSkeletonRowProps
      skeletonRow = {
        ...defaults,
        ...props,
        className: twMerge(defaults.className as string, props.className),
      }
    } else if (slotIs(child, 'empty')) {
      const defaults = (child.type as any).slotDefaults ?? {}
      const props = child.props as VirtualTableEmptyProps
      empty = {
        ...defaults,
        ...props,
        className: twMerge(defaults.className as string, props.className),
      }
    } else if (slotIs(child, 'footer')) {
      const defaults = (child.type as any).slotDefaults ?? {}
      const props = child.props as VirtualTableFooterProps
      footer = {
        ...defaults,
        ...props,
        className: twMerge(defaults.className as string, props.className),
      }
    }
  })

  return { header, body, skeletonRow, empty, footer }
}

/* ── Resize Handle ─────────────────────────────────────────────── */

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void
}

function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="resizer absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize"
      onMouseDown={onMouseDown}
    />
  )
}

/* ── Cell ───────────────────────────────────────────────────────── */

function VirtualTableCell({
  className,
  style,
  showOnHover,
  colSpan,
  ...rest
}: VirtualTableCellProps) {
  return (
    <div
      role="cell"
      className={twMerge(
        'overflow-hidden text-ellipsis whitespace-nowrap',
        showOnHover &&
          'not-group-hover/row:*:delay-200 *:opacity-10 *:transition-opacity *:duration-300 *:ease-in-out group-hover/row:*:opacity-100',
        className,
      )}
      style={colSpan ? { gridColumn: `span ${colSpan}`, ...style } : style}
      {...rest}
    />
  )
}

/* ── Data Row ──────────────────────────────────────────────────── */

interface DataRowProps {
  index: number
  rowHeight: number
  rowProps: ComponentProps<'div'>
  children: ReactNode
}

function DataRow({ index, rowHeight, rowProps, children }: DataRowProps) {
  const { className, style, ...restProps } = rowProps
  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      className={twMerge('group/row absolute w-full', className)}
      style={{
        height: rowHeight,
        transform: `translateY(${index * rowHeight}px)`,
        display: 'grid',
        gridTemplateColumns: GRID_VAR_REF,
        alignItems: 'center',
        willChange: 'transform',
        contain: 'layout style paint',
        ...style,
      }}
      {...restProps}
    >
      {children}
    </div>
  )
}

/* ── VirtualTable ──────────────────────────────────────────────── */

function VirtualTableRoot({
  totalCount,
  rowHeight,
  overscan = 5,
  onRangeChange,
  className,
  style: styleProp,
  'aria-label': ariaLabel,
  children,
}: VirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })
  const prevRangeRef = useRef({ start: 0, end: 0 })

  const { header, body, skeletonRow, empty, footer } = extractSlots(children)
  const columns = header?.columns ?? []
  const gridTemplate = buildGridTemplate(columns)
  const renderRow = body?.children ?? (() => null)

  // ── Scroll handler (synchronous for flicker-free scrolling) ────
  const calculateRange = useCallback(() => {
    const el = scrollRef.current
    if (!el || totalCount === 0) {
      return
    }

    const scrollTop = el.scrollTop
    const viewportHeight = el.clientHeight

    const rawStart = Math.floor(scrollTop / rowHeight)
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight)

    const start = Math.max(0, rawStart - overscan)
    const end = Math.min(totalCount, rawEnd + overscan)

    const prev = prevRangeRef.current
    if (prev.start !== start || prev.end !== end) {
      prevRangeRef.current = { start, end }
      flushSync(() => setVisibleRange({ start, end }))
    }
  }, [totalCount, rowHeight, overscan])

  const handleScroll = useCallback(() => {
    calculateRange()
  }, [calculateRange])

  // Recalculate on totalCount/rowHeight changes
  useEffect(() => {
    calculateRange()
  }, [calculateRange])

  // Notify consumer when visible range changes
  useEffect(() => {
    onRangeChange?.(visibleRange)
  }, [visibleRange, onRangeChange])

  // ── Column resize ──────────────────────────────────────────────
  const handleResizeMouseDown = useCallback(
    (columnIndex: number, e: React.MouseEvent) => {
      e.preventDefault()

      const container = scrollRef.current
      if (!container) {
        return
      }

      const col = columns[columnIndex]
      const headerCells = container.querySelectorAll('[role="columnheader"]')

      // Resolve current pixel width (handles fr columns)
      const startWidth =
        headerCells[columnIndex]?.getBoundingClientRect().width ??
        (typeof col.width === 'number' ? col.width : 100)
      const startX = e.clientX

      const minW = col.minWidth ?? 50
      const maxW = col.maxWidth ?? Infinity

      // Prevent the resized column from pushing the table beyond the container
      const otherColumnsMinWidth = columns.reduce((sum, c, i) => {
        if (i === columnIndex) {
          return sum
        }
        if (typeof c.width === 'number') {
          return sum + c.width
        }
        return sum + (c.minWidth ?? 0)
      }, 0)
      const maxAllowedWidth = container.clientWidth - otherColumnsMinWidth

      let currentWidth = startWidth

      col.onResizeStart?.()

      const prevCursor = document.body.style.cursor
      document.body.style.cursor = 'col-resize'

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX
        currentWidth = Math.min(
          maxW,
          maxAllowedWidth,
          Math.max(minW, startWidth + delta),
        )

        // Only override the dragged column — preserve original values for others
        const template = columns
          .map((c, i) => {
            if (i === columnIndex) {
              return `${currentWidth}px`
            }
            return buildGridTemplate([c])
          })
          .join(' ')
        container.style.setProperty(GRID_VAR, template)
      }

      const handleMouseUp = () => {
        document.body.style.cursor = prevCursor
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)

        // Compute equivalent fr value from other fr columns' pixel widths
        const allCells = container.querySelectorAll('[role="columnheader"]')
        let otherFrPx = 0
        let otherFrUnits = 0
        columns.forEach((c, i) => {
          if (i === columnIndex) {
            return
          }
          if (typeof c.width !== 'number') {
            otherFrPx += allCells[i]?.getBoundingClientRect().width ?? 0
            otherFrUnits +=
              typeof c.width === 'string' ? parseFloat(c.width) || 1 : 1
          }
        })
        const frValue =
          otherFrPx > 0 ? (currentWidth / otherFrPx) * otherFrUnits : 1

        col.onResizeEnd?.(currentWidth, startWidth, frValue)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [columns],
  )

  // ── Empty state ────────────────────────────────────────────────
  if (totalCount === 0 && empty) {
    return (
      <div
        role="table"
        aria-label={ariaLabel}
        className={twMerge('flex flex-col overflow-hidden', className)}
        style={{ [GRID_VAR]: gridTemplate, ...styleProp } as CSSProperties}
      >
        {/* Header */}
        <div
          role="rowgroup"
          className={twMerge('sticky top-0 z-10', header?.className)}
        >
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_VAR_REF,
              alignItems: 'center',
              height: rowHeight,
            }}
          >
            {columns.map((col, i) => (
              <div
                key={i}
                role="columnheader"
                className={twMerge(
                  'whitespace-nowrap',
                  col.resizable && 'relative',
                  col.className,
                )}
              >
                {col.header}
                {col.resizable && (
                  <ResizeHandle
                    onMouseDown={(e) => handleResizeMouseDown(i, e)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Empty */}
        <div
          className={twMerge(
            'flex items-center justify-center',
            empty.className,
          )}
        >
          {empty.children}
        </div>
      </div>
    )
  }

  // ── Build visible rows ─────────────────────────────────────────
  const rows: ReactNode[] = []
  for (let i = visibleRange.start; i < visibleRange.end; i++) {
    const content = renderRow(i)
    if (content === null) {
      if (skeletonRow) {
        const { children: skeletonContent, ...skeletonProps } = skeletonRow
        rows.push(
          <DataRow
            key={`row-${i}`}
            index={i}
            rowHeight={rowHeight}
            rowProps={skeletonProps}
          >
            {skeletonContent}
          </DataRow>,
        )
      }
    } else {
      const rowElement = content as ReactElement
      const rowDefaults = (rowElement.type as any)?.slotDefaults ?? {}
      const rawProps = rowElement.props as VirtualTableRowProps
      const { children: cellContent, ...userRowProps } = rawProps
      const rowProps = {
        ...rowDefaults,
        ...userRowProps,
        className: twMerge(
          rowDefaults.className as string,
          userRowProps.className,
        ),
      }

      rows.push(
        <DataRow
          key={`row-${i}`}
          index={i}
          rowHeight={rowHeight}
          rowProps={rowProps}
        >
          {cellContent}
        </DataRow>,
      )
    }
  }

  const totalHeight = totalCount * rowHeight

  return (
    <>
      <div
        role="table"
        aria-label={ariaLabel}
        aria-rowcount={totalCount}
        ref={scrollRef}
        onScroll={handleScroll}
        className={twMerge('relative overflow-auto', className)}
        style={{ [GRID_VAR]: gridTemplate, ...styleProp } as CSSProperties}
      >
        {/* Header */}
        <div
          role="rowgroup"
          className={twMerge('sticky top-0 z-10', header?.className)}
        >
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_VAR_REF,
              alignItems: 'center',
            }}
          >
            {columns.map((col, i) => (
              <div
                key={i}
                role="columnheader"
                className={twMerge(
                  'whitespace-nowrap',
                  col.resizable && 'relative',
                  col.className,
                )}
              >
                {col.header}
                {col.resizable && (
                  <ResizeHandle
                    onMouseDown={(e) => handleResizeMouseDown(i, e)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body sentinel + visible rows */}
        <div
          role="rowgroup"
          className="relative"
          style={{ height: totalHeight }}
        >
          {rows}
        </div>
      </div>

      {/* Footer */}
      {footer && totalCount > 0 && (
        <div className={footer.className}>{footer.children(visibleRange)}</div>
      )}
    </>
  )
}

/* ── Compound export ───────────────────────────────────────────── */

export const VirtualTable = Object.assign(VirtualTableRoot, {
  Header: VirtualTableHeader,
  Column: VirtualTableColumn,
  Body: VirtualTableBody,
  SkeletonRow: VirtualTableSkeletonRow,
  Row: VirtualTableRow,
  Cell: VirtualTableCell,
  Empty: VirtualTableEmpty,
  Footer: VirtualTableFooter,
})
