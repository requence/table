import {
  type CSSProperties,
  Children,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { twMerge } from 'tailwind-merge'

/* ── Types ──────────────────────────────────────────────────────── */

/** Imperative handle exposed by VirtualTable via ref. */
export interface VirtualTableHandle {
  /** Current scroll position in pixels. */
  readonly scrollTop: number
  /** Scroll to an absolute pixel offset. */
  scrollTo: (px: number) => void
  /** Adjust the scroll position by the given number of pixels. */
  scrollBy: (px: number) => void
}

export interface VirtualTableProps<
  TExtras extends Record<string, unknown> = {},
> {
  /** Total number of rows in the dataset */
  totalCount: number
  /** Fixed height of each row in pixels */
  rowHeight: number
  /** Gap between rows in pixels (default: 0) */
  rowGap?: number
  /** Number of extra rows rendered above/below viewport (default: 5) */
  overscan?: number
  /**
   * Whether the imperative `scrollBy` handle adjusts scroll position.
   * Set to `false` to disable automatic scroll correction from the cache.
   * Default: `true`.
   */
  adjustScrollPosition?: boolean

  /** Called when the visible row range changes (for triggering page fetches) */
  onRangeChange?: (range: { start: number; end: number }) => void
  /** Called on every scroll event with the current scroll position and total scrollable height */
  onScroll?: (scrollTop: number, scrollHeight: number) => void
  /**
   * Additional className for the outer container.
   * Can be a string or a callback that receives the parsed column definitions.
   */
  className?:
    | string
    | ((columns: ReadonlyArray<VirtualTableColumnDef<TExtras>>) => string)
  /** Accessible label for the table */
  'aria-label'?: string
  /**
   * Additional inline styles for the outer container.
   * Can be a CSSProperties object or a callback that receives the parsed column definitions.
   */
  style?:
    | CSSProperties
    | ((
        columns: ReadonlyArray<VirtualTableColumnDef<TExtras>>,
      ) => CSSProperties)
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

/* ── Column definition (public) ─────────────────────────────────── */

/** Parsed column definition exposed to className/style callbacks. */
export type VirtualTableColumnDef<
  TExtras extends Record<string, unknown> = {},
> = {
  width?: number | string
  header?: ReactNode
  className?: string
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
  onResizeStart?: () => void
  onResizeEnd?: (width: number, startWidth: number, frValue: number) => void
} & TExtras

/* ── Internal types ─────────────────────────────────────────────── */

interface Slots {
  header: { className?: string; columns: VirtualTableColumnDef[] } | null
  body: VirtualTableBodyProps | null
  skeletonRow: VirtualTableSkeletonRowProps | null
  empty: VirtualTableEmptyProps | null
  footer: VirtualTableFooterProps | null
}

/* ── Slot system ───────────────────────────────────────────────── */

export interface SlotComponent<P> {
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

export function createTableColumn<TExtras extends Record<string, unknown> = {}>(
  defaults?: Partial<VirtualTableColumnProps & TExtras>,
): SlotComponent<VirtualTableColumnProps & TExtras> {
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

function buildGridTemplate(columns: VirtualTableColumnDef[]): string {
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
      const columns: VirtualTableColumnDef[] = []
      Children.forEach(props.children, (col) => {
        if (isValidElement(col) && slotIs(col, 'column')) {
          const d = (col.type as any).slotDefaults ?? {}
          const {
            width,
            children: colChildren,
            className: colClassName,
            resizable,
            minWidth,
            maxWidth,
            onResizeStart,
            onResizeEnd,
            ...pExtras
          } = col.props as VirtualTableColumnProps & Record<string, unknown>
          const {
            width: dw,
            className: dc,
            resizable: dr,
            minWidth: dmin,
            maxWidth: dmax,
            onResizeStart: drs,
            onResizeEnd: dre,
            ...dExtras
          } = d
          columns.push({
            ...dExtras,
            ...pExtras,
            width: width ?? dw,
            header: colChildren,
            className: twMerge(dc as string, colClassName),
            resizable: resizable ?? dr,
            minWidth: minWidth ?? dmin,
            maxWidth: maxWidth ?? dmax,
            onResizeStart: onResizeStart ?? drs,
            onResizeEnd: onResizeEnd ?? dre,
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
  rowStride: number
  rowProps: ComponentProps<'div'>
  children: ReactNode
}

function DataRow({
  index,
  rowHeight,
  rowStride,
  rowProps,
  children,
}: DataRowProps) {
  const { className, style, ...restProps } = rowProps
  return (
    <div
      className="absolute w-full will-change-transform contain-[layout_style_paint]"
      style={{
        height: rowHeight,
        transform: `translateY(${index * rowStride}px)`,
      }}
    >
      <div
        role="row"
        aria-rowindex={index + 1}
        className={twMerge('group/row h-full grid items-center', className)}
        style={{
          gridTemplateColumns: GRID_VAR_REF,
          ...style,
        }}
        {...restProps}
      >
        {children}
      </div>
    </div>
  )
}

/* ── Skeleton → SVG background snapshot ────────────────────────── */

/**
 * CSS properties inlined into the SVG snapshot.  Kept minimal to
 * produce a small data-URL while still capturing all visual detail.
 */
const SNAPSHOT_CSS_PROPS: string[] = [
  // Box model & layout
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'margin',
  'padding',
  'box-sizing',
  // Grid
  'grid-template-columns',
  'grid-column',
  'align-items',
  'gap',
  // Visual
  'background',
  'background-color',
  'border',
  'border-radius',
  'opacity',
  'overflow',
  'z-index',
  // Text (in case skeleton cells contain text placeholders)
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
]

/**
 * Materialise a `::before` or `::after` pseudo-element as a real
 * `<div>` and insert it into `target`.  This is necessary because
 * `cloneNode` does not capture pseudo-elements.
 */
function materializePseudo(
  source: Element,
  target: HTMLElement,
  pseudo: '::before' | '::after',
): void {
  const ps = getComputedStyle(source, pseudo)
  const content = ps.getPropertyValue('content')
  // Skip if the pseudo doesn't exist
  if (content === 'none' || content === 'normal') {
    return
  }

  // Skip if it has no visible paint (transparent bg + no border)
  const bg = ps.getPropertyValue('background-color')
  const border = ps.getPropertyValue('border')
  const isTransparent = !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
  const noBorder = !border || border.startsWith('0px')
  if (isTransparent && noBorder) {
    return
  }

  const el = document.createElement('div')
  el.dataset.pseudo = pseudo // tag so child-filter can skip it
  for (const prop of SNAPSHOT_CSS_PROPS) {
    const v = ps.getPropertyValue(prop)
    if (v) {
      el.style.setProperty(prop, v)
    }
  }
  if (pseudo === '::before') {
    target.insertBefore(el, target.firstChild)
  } else {
    target.appendChild(el)
  }
}

/** Recursively inline computed styles from `source` onto `target`. */
function inlineComputedStyles(source: Element, target: Element): void {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
    return
  }

  const computed = getComputedStyle(source)
  target.removeAttribute('class') // classes won't resolve inside SVG
  target.removeAttribute('style')
  for (const prop of SNAPSHOT_CSS_PROPS) {
    const v = computed.getPropertyValue(prop)
    if (v) {
      target.style.setProperty(prop, v)
    }
  }

  // Pseudo-elements can't be cloned — materialise them as real nodes
  materializePseudo(source, target, '::before')
  materializePseudo(source, target, '::after')

  // Recurse into original children (skip any pseudo nodes we just added)
  const srcChildren = source.children
  const tgtChildren = Array.from(target.children).filter(
    (c) => !(c as HTMLElement).dataset?.pseudo,
  )
  for (let i = 0; i < srcChildren.length && i < tgtChildren.length; i++) {
    inlineComputedStyles(srcChildren[i]!, tgtChildren[i]!)
  }
}

/**
 * Capture an element as an SVG data-URL that can be used as a CSS
 * `background-image`.  External styles are inlined and pseudo-elements
 * are materialised so the snapshot is self-contained.
 */
function domToSvgDataUrl(
  source: Element,
  width: number,
  height: number,
): string {
  const clone = source.cloneNode(true) as HTMLElement
  inlineComputedStyles(source, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')

  const html = new XMLSerializer().serializeToString(clone)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">${html}</foreignObject>` +
    '</svg>'

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* ── VirtualTable ──────────────────────────────────────────────── */

function VirtualTableInner<TExtras extends Record<string, unknown> = {}>(
  {
    totalCount,
    rowHeight,
    rowGap = 0,
    overscan = 5,
    adjustScrollPosition = true,

    onRangeChange,
    onScroll: onScrollProp,
    className,
    style: styleProp,
    'aria-label': ariaLabel,
    children,
  }: VirtualTableProps<TExtras>,
  ref: React.ForwardedRef<VirtualTableHandle>,
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowgroupRef = useRef<HTMLDivElement>(null)
  const skeletonCaptureRef = useRef<HTMLDivElement>(null)

  // During a column-resize drag the grid template is manipulated via
  // direct DOM access (setProperty) for 60 fps updates.  If React
  // re-renders while the drag is in progress (e.g. from a subscription
  // or scroll event), the inline `style` prop would overwrite the
  // dragged value with the stale React-side template, causing jank.
  // This ref preserves the current drag template so React always
  // writes back the correct value.
  const resizeOverrideRef = useRef<string | null>(null)


  // Track the prop in a ref so the imperative handle (stable identity)
  // always reads the current value without being recreated.
  const adjustRef = useRef(adjustScrollPosition)
  adjustRef.current = adjustScrollPosition


  // ── Imperative handle ────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      get scrollTop() {
        return scrollRef.current?.scrollTop ?? 0
      },
      scrollTo: (px: number) => {
        scrollRef.current?.scrollTo({ top: px })
      },
      scrollBy: (px: number) => {
        if (adjustRef.current && scrollRef.current) {
          scrollRef.current.scrollTop += px
        }
      },
    }),
    [],
  )
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })
  const prevRangeRef = useRef({ start: 0, end: 0 })

  const { header, body, skeletonRow, empty, footer } = extractSlots(children)
  const columns = header?.columns ?? []
  const gridTemplate = buildGridTemplate(columns)
  const renderRow = body?.children ?? (() => null)

  // Resolve callback-form className / style
  const typedColumns = columns as unknown as ReadonlyArray<
    VirtualTableColumnDef<TExtras>
  >
  const resolvedClassName =
    typeof className === 'function' ? className(typedColumns) : className
  const resolvedStyle =
    typeof styleProp === 'function' ? styleProp(typedColumns) : styleProp

  // ── Range computation (pure, no state updates) ─────────────────
  const computeRange = useCallback(() => {
    const el = scrollRef.current
    if (!el || totalCount === 0) {
      return null
    }

    const scrollTop = el.scrollTop
    const viewportHeight = el.clientHeight

    const stride = rowHeight + rowGap
    const rawStart = Math.floor(scrollTop / stride)
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / stride)

    const start = Math.max(0, rawStart - overscan)
    const end = Math.min(totalCount, rawEnd + overscan)

    const prev = prevRangeRef.current
    if (prev.start !== start || prev.end !== end) {
      prevRangeRef.current = { start, end }
      return { start, end }
    }
    return null
  }, [totalCount, rowHeight, rowGap, overscan])

  // ── Scroll handler (synchronous for flicker-free scrolling) ────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      onScrollProp?.(el.scrollTop, el.scrollHeight)
    }
    const range = computeRange()
    if (range) {
      flushSync(() => setVisibleRange(range))
    }
  }, [computeRange, onScrollProp])

  // ── Skeleton background snapshot ───────────────────────────────
  const hasSkeletonSlot = !!skeletonRow
  useLayoutEffect(() => {
    const rowgroup = rowgroupRef.current
    const capture = skeletonCaptureRef.current
    if (!rowgroup || !capture || !hasSkeletonSlot) {
      return
    }

    const applyBackground = () => {
      const source = capture.firstElementChild
      if (!source) {
        return
      }
      const width = capture.clientWidth
      if (width === 0) {
        return
      }

      const stride = rowHeight + rowGap
      const url = domToSvgDataUrl(source, width, stride)
      rowgroup.style.backgroundImage = `url("${url}")`
      rowgroup.style.backgroundSize = `100% ${stride}px`
      rowgroup.style.backgroundRepeat = 'repeat-y'
    }

    // Initial capture (runs before first paint via useLayoutEffect)
    applyBackground()

    // Re-capture when container width changes (window resize).
    // Height changes (from totalCount) are ignored via width guard.
    let lastWidth = rowgroup.clientWidth
    const resizeObs = new ResizeObserver(() => {
      const w = rowgroup.clientWidth
      if (w !== lastWidth) {
        lastWidth = w
        applyBackground()
      }
    })
    resizeObs.observe(rowgroup)

    return () => {
      resizeObs.disconnect()
      rowgroup.style.backgroundImage = ''
      rowgroup.style.backgroundSize = ''
      rowgroup.style.backgroundRepeat = ''
    }
    // gridTemplate changes after column resize (mouseup), not during drag
  }, [rowHeight, rowGap, hasSkeletonSlot, gridTemplate])

  // Recalculate on totalCount/rowHeight changes
  useEffect(() => {
    const range = computeRange()
    if (range) {
      setVisibleRange(range)
    }
  }, [computeRange])

  // Recalculate when the scroll container is resized (e.g. browser
  // height change).  A resize doesn't fire a scroll event, so the
  // visible range would go stale without this.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      const range = computeRange()
      if (range) {
        setVisibleRange(range)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [computeRange])

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
        resizeOverrideRef.current = template
        container.style.setProperty(GRID_VAR, template)
      }

      const handleMouseUp = () => {
        resizeOverrideRef.current = null
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
        className={twMerge('flex flex-col overflow-hidden', resolvedClassName)}
        style={{ [GRID_VAR]: gridTemplate, ...resolvedStyle } as CSSProperties}
      >
        {/* Header */}
        <div
          role="rowgroup"
          className={twMerge('sticky top-0 z-10', header?.className)}
        >
          <div
            role="row"
            className="grid items-center"
            style={{
              gridTemplateColumns: GRID_VAR_REF,
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
            rowStride={rowHeight + rowGap}
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
          rowStride={rowHeight + rowGap}
          rowProps={rowProps}
        >
          {cellContent}
        </DataRow>,
      )
    }
  }

  const totalHeight =
    totalCount > 0 ? totalCount * (rowHeight + rowGap) - rowGap : 0

  return (
    <>
      <div
        role="table"
        aria-label={ariaLabel}
        aria-rowcount={totalCount}
        ref={scrollRef}
        onScroll={handleScroll}
        className={twMerge('relative overflow-auto', resolvedClassName)}
        style={{ [GRID_VAR]: resizeOverrideRef.current ?? gridTemplate, ...resolvedStyle } as CSSProperties}
      >
        {/* Header */}
        <div
          role="rowgroup"
          className={twMerge('sticky top-0 z-10', header?.className)}
        >
          <div
            role="row"
            className="grid items-center"
            style={{
              gridTemplateColumns: GRID_VAR_REF,
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
          ref={rowgroupRef}
          role="rowgroup"
          className="relative"
          style={{ height: totalHeight }}
        >
          {/* Hidden skeleton row used as capture source for the
              repeating SVG background (visibility: hidden still
              participates in layout so getComputedStyle works). */}
          {skeletonRow && (
            <div
              ref={skeletonCaptureRef}
              aria-hidden
              className="absolute top-0 left-0 w-full invisible pointer-events-none"
            >
              <div
                className={twMerge('grid items-center', skeletonRow.className)}
                style={{
                  height: rowHeight,
                  gridTemplateColumns: GRID_VAR_REF,
                }}
              >
                {skeletonRow.children}
              </div>
            </div>
          )}

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

export const VirtualTable = Object.assign(
  forwardRef(VirtualTableInner) as <
    TExtras extends Record<string, unknown> = {},
  >(
    props: VirtualTableProps<TExtras> & {
      ref?: React.Ref<VirtualTableHandle>
    },
  ) => ReactElement | null,
  {
    Header: VirtualTableHeader,
    Column: VirtualTableColumn,
    Body: VirtualTableBody,
    SkeletonRow: VirtualTableSkeletonRow,
    Row: VirtualTableRow,
    Cell: VirtualTableCell,
    Empty: VirtualTableEmpty,
    Footer: VirtualTableFooter,
  },
)
