import {
  useState,
  useEffect,
  useRef,
  useTransition,
  Suspense,
} from 'react'
import { twMerge } from 'tailwind-merge'
import {
  VirtualTable,
  createTableHeader,
  createTableColumn,
  createTableBody,
  createTableSkeletonRow,
  createTableEmpty,
  createTableFooter,
  createTableRow,
  useTableCache,
} from '@requence/table'
import {
  Check,
  Clock,
  Loader2,
  AlertTriangle,
  Square,
  Pause,
  ArrowUp,
  Timer,
  LoaderCircle,

} from 'lucide-react'

/* ── Types ──────────────────────────────────────────────────────── */

interface TaskItem {
  id: string
  name: string
  status: 'PENDING' | 'RUNNING' | 'SUCCESSFUL' | 'FAILED' | 'STOPPED'
  mode: 'LINEAR' | 'CONTINUOUS'
  template: { name: string }
  hasInput: boolean
  hasResult: boolean
  createdAt: string
  statusText: string
  protected: boolean
  hasUserInteractions: boolean
  branchId: string
  createdBy: {
    __typename: 'User' | 'AccessToken' | 'TaskTemplateWebhook'
    username?: string
    name?: string
  } | null
}

interface SortState {
  field: string
  direction: 'ASC' | 'DESC'
}

interface CacheRefObj {
  upsert: (item: TaskItem) => void
  remove: (id: string) => void
  getTotalCount: () => number
}

/* ── Fake database ─────────────────────────────────────────────── */

const TOTAL_ROWS = 20_000

/** Pre-generate the fake database at module scope to avoid blocking renders. */
const INITIAL_TASKS = generateInitialTasks()

function generateInitialTasks(): TaskItem[] {
  const templates = [
    'Sync Salesforce Contacts',
    'Export PostgreSQL Billing',
    'Process Raw S3 Logs',
    'Ingest Shopify Orders',
    'Audit User Permissions',
    'Archive Old Messages',
    'Warm Redis Cache',
  ]
  const statuses: TaskItem['status'][] = [
    'SUCCESSFUL',
    'FAILED',
    'RUNNING',
    'PENDING',
    'STOPPED',
  ]
  const modes: TaskItem['mode'][] = ['LINEAR', 'CONTINUOUS']
  const creators = [
    { __typename: 'User' as const, username: 'john_doe' },
    { __typename: 'AccessToken' as const, name: 'ci-token' },
    { __typename: 'TaskTemplateWebhook' as const, name: 'github-webhook' },
  ]

  const arr: TaskItem[] = []
  const baseTime = Date.now()

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const templateName = templates[i % templates.length]!
    const status = statuses[i % statuses.length]!
    const mode = modes[i % modes.length]!
    const creator = creators[i % creators.length]!
    const date = new Date(baseTime - i * 60_000) // space out tasks by 1 minute

    arr.push({
      id: `task-${i + 1}`,
      name: `${templateName.split(' ').slice(-1)[0]} Runner #${i + 1}`,
      status,
      mode,
      template: { name: templateName },
      hasInput: i % 3 !== 0,
      hasResult: status === 'SUCCESSFUL' && i % 2 === 0,
      createdAt: date.toISOString(),
      statusText:
        status === 'FAILED'
          ? 'Connection timeout after 30s'
          : status === 'STOPPED'
            ? 'Stopped by user request'
            : '',
      protected: i % 11 === 0,
      hasUserInteractions: i % 7 === 0,
      branchId: i % 19 === 0 ? 'branch-123' : 'root',
      createdBy: creator,
    })
  }
  return arr
}

function compareTasks(
  a: TaskItem,
  b: TaskItem,
  field: string,
  direction: 'ASC' | 'DESC',
): number {
  let valA: any = a[field as keyof TaskItem]
  let valB: any = b[field as keyof TaskItem]

  if (field === 'template') {
    valA = a.template?.name ?? ''
    valB = b.template?.name ?? ''
  } else if (field === 'createdBy') {
    valA =
      a.createdBy?.__typename === 'User'
        ? a.createdBy.username
        : (a.createdBy?.name ?? '')
    valB =
      b.createdBy?.__typename === 'User'
        ? b.createdBy.username
        : (b.createdBy?.name ?? '')
  }

  if (typeof valA === 'string') {
    valA = valA.toLowerCase()
    valB = valB.toLowerCase()
  }

  if (valA < valB) return direction === 'ASC' ? -1 : 1
  if (valA > valB) return direction === 'ASC' ? 1 : -1
  return 0
}

/* ── Helper Components ─────────────────────────────────────────── */

function Badge({
  severity,
  children,
}: {
  severity?: 'success' | 'highlight' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  const severityClasses: Record<string, string> = {
    success: 'bg-green-500/20 text-green-400',
    highlight: 'bg-orange-500/20 text-orange-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    danger: 'bg-red-700/20 text-red-400',
  }

  return (
    <div
      className={twMerge(
        'inline-block rounded-[3px] px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap select-none bg-zinc-500/20 text-zinc-400',
        severity && severityClasses[severity],
      )}
    >
      {children}
    </div>
  )
}

const statusIcons = {
  IDLE: <Pause className="size-4 text-zinc-300" />,
  PENDING: <Clock className="size-4 text-zinc-300" />,
  RUNNING: <Loader2 className="size-4 animate-spin text-orange-500" />,
  FAILED: <AlertTriangle className="size-4 text-red-500" />,
  SUCCESSFUL: <Check className="size-4 text-green-500" />,
  STOPPED: <Square className="size-4 text-yellow-500" />,
}

function StatusIcon({ status }: { status: keyof typeof statusIcons }) {
  return (
    <div className="flex size-8 items-center justify-center rounded-sm bg-zinc-700/50 backdrop-blur-[1px]">
      {statusIcons[status]}
    </div>
  )
}

function Button({
  children,
  severity,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  severity?: 'success' | 'warning' | 'danger' | 'highlight'
  onClick?: (e: React.MouseEvent) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={twMerge(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded border px-2.5 text-xs font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-30 border-zinc-400/30 bg-zinc-800/30 text-zinc-200 hover:border-zinc-400/60',
        severity === 'highlight' &&
          'border-orange-400/50 bg-orange-950/30 text-orange-400 hover:border-orange-400/80',
        severity === 'success' &&
          'border-green-400/50 bg-green-950/30 text-green-200 hover:border-green-400/80',
        severity === 'warning' &&
          'border-yellow-400/50 bg-yellow-950/30 text-yellow-400 hover:border-yellow-400/80',
        severity === 'danger' &&
          'border-red-400/50 bg-red-950/30 text-red-300 hover:border-red-400/80',
      )}
    >
      {children}
    </button>
  )
}

function formatDate(isoString: string) {
  const d = new Date(isoString)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/* ── Styled slot components ────────────────────────────────────── */

const Header = createTableHeader({
  className:
    'sticky pt-1.5 top-0 z-10 mb-2 h-8 shrink-0 text-xs text-zinc-500 border-b border-zinc-800/80 backdrop-blur-sm bg-zinc-950/80',
})

const Column = createTableColumn({
  className:
    'px-3 text-left font-semibold uppercase tracking-wider text-zinc-400 select-none',
})

const Body = createTableBody()

const SkeletonRow = createTableSkeletonRow({
  className:
    'animate-pulse relative before:absolute before:-z-10 before:inset-y-0 before:left-0 before:right-[var(--row-bg-inset)] before:rounded-lg before:bg-zinc-800',
  children: (
    <>
      <VirtualTable.Cell className="px-3 py-4">
        <div className="h-4 rounded bg-zinc-700/50 animate-pulse" />
      </VirtualTable.Cell>
      <VirtualTable.Cell className="px-3 py-4">
        <div className="h-4 rounded bg-zinc-700/50 animate-pulse" />
      </VirtualTable.Cell>
      <VirtualTable.Cell className="px-3 py-4">
        <div className="h-4 rounded bg-zinc-700/50 animate-pulse" />
      </VirtualTable.Cell>
      <VirtualTable.Cell className="px-3 py-4">
        <div className="h-4 rounded bg-zinc-700/50 animate-pulse" />
      </VirtualTable.Cell>
      <VirtualTable.Cell className="px-3 py-4">
        <div className="h-4 rounded bg-zinc-700/50 animate-pulse" />
      </VirtualTable.Cell>
    </>
  ),
})

const Row = createTableRow({
  className:
    'cursor-pointer relative before:absolute before:inset-y-0 before:left-0 before:right-0 before:-z-10 before:rounded-lg before:bg-zinc-800 hover:before:bg-zinc-700 transition-colors',
})

const Empty = createTableEmpty({
  className: 'bg-zinc-800 rounded-xl p-10 text-sm italic text-zinc-500',
})

const Footer = createTableFooter({
  className:
    '-mt-8 pt-2.5 shrink-0 flex h-8 justify-end pr-3 border-t border-zinc-800 relative z-10 backdrop-blur-sm bg-zinc-950/80',
})

/* ── Inner Table Component (handles Suspense boundary correctly) ── */

function TaskTableInner({
  inputValue,
  tasksDatabaseRef,
  cacheRef,
  stallLoadingRef,
  adjustScrollPosition,

  addLog,
}: {
  inputValue: string
  tasksDatabaseRef: React.RefObject<TaskItem[]>
  cacheRef: React.RefObject<CacheRefObj | null>
  stallLoadingRef: React.RefObject<boolean>
  adjustScrollPosition: boolean

  addLog: (msg: string, type: string) => void
}) {
  const [sort, setSort] = useState<SortState>({
    field: 'createdAt',
    direction: 'DESC',
  })
  const [filterText, setFilterText] = useState(inputValue)
  const [isPending, startTransition] = useTransition()

  const cache = useTableCache<TaskItem>('tasks', {
    pageSize: 50,
    rowHeight: 56,
    rowGap: 8,
    getItemId: (t) => t.id,
    compare: (a, b) => compareTasks(a, b, sort.field, sort.direction),
    fetchItems: async (offset, limit) => {
      // Simulate network delay, then stall indefinitely if debugging skeletons
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 60))
      while (stallLoadingRef.current) {
        await new Promise((r) => setTimeout(r, 100))
      }

      const sorted = [...tasksDatabaseRef.current].sort((a, b) =>
        compareTasks(a, b, sort.field, sort.direction),
      )

      const filtered = filterText
        ? sorted.filter((t) =>
            t.name.toLowerCase().includes(filterText.toLowerCase()),
          )
        : sorted

      return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
      }
    },
  })

  const handleSortChange = (field: string) => {
    startTransition(() => {
      setSort((prev) => {
        const nextDir =
          prev.field === field && prev.direction === 'ASC' ? 'DESC' : 'ASC'
        return { field, direction: nextDir }
      })
      cache.reset()
    })
  }

  // Defer filter text updates so typing stays responsive
  const prevInputValue = useRef(inputValue)
  useEffect(() => {
    if (prevInputValue.current === inputValue) return
    prevInputValue.current = inputValue
    startTransition(() => {
      setFilterText(inputValue)
      cache.reset()
    })
  }, [inputValue])

  // Expose cache controls to parent component for updates.
  // Uses getTotalCount() instead of a snapshot so the parent can
  // read the live count immediately after imperative mutations.
  cacheRef.current = {
    upsert: cache.upsert,
    remove: cache.remove,
    getTotalCount: cache.getTotalCount,
  }

  return (
    <div
      className={twMerge(
        'grow min-h-0 flex flex-col overflow-hidden border border-zinc-800 bg-zinc-950 p-2',
        isPending && 'pointer-events-none',
      )}
    >
      <VirtualTable
        {...cache}
        overscan={10}
        adjustScrollPosition={adjustScrollPosition}

        className="text-sm grow scrollbar scrollbar-zinc-500 [&_.resizer]:before:block [&_.resizer]:before:h-full [&_.resizer]:before:w-0.5 [&_.resizer]:before:-translate-x-0.5 [&_.resizer]:before:transition-colors [&_.resizer]:before:duration-200"
        aria-label="Tasks list"
      >
        <Header className="hover:[&_.resizer]:before:bg-orange-500">
          <Column width={70}>
            <span
              className={twMerge(
                'cursor-pointer flex items-center gap-1',
                sort.field === 'status' && 'text-white',
              )}
              onClick={() => handleSortChange('status')}
            >
              Status
              {sort.field === 'status' && (
                <ArrowUp
                  className={twMerge(
                    'size-3 transition-transform',
                    sort.direction === 'DESC' && 'rotate-180',
                  )}
                />
              )}
            </span>
          </Column>
          <Column width={104}>
            <span
              className={twMerge(
                'cursor-pointer flex items-center gap-1',
                sort.field === 'mode' && 'text-white',
              )}
              onClick={() => handleSortChange('mode')}
            >
              Mode
              {sort.field === 'mode' && (
                <ArrowUp
                  className={twMerge(
                    'size-3 transition-transform',
                    sort.direction === 'DESC' && 'rotate-180',
                  )}
                />
              )}
            </span>
          </Column>
          <Column width="1.5fr" minWidth={200} resizable>
            <span
              className={twMerge(
                'cursor-pointer flex items-center gap-1',
                sort.field === 'name' && 'text-white',
              )}
              onClick={() => handleSortChange('name')}
            >
              Name
              {sort.field === 'name' && (
                <ArrowUp
                  className={twMerge(
                    'size-3 transition-transform',
                    sort.direction === 'DESC' && 'rotate-180',
                  )}
                />
              )}
            </span>
          </Column>
          <Column width="1fr" minWidth={200} resizable>
            <span
              className={twMerge(
                'cursor-pointer flex items-center gap-1',
                sort.field === 'template' && 'text-white',
              )}
              onClick={() => handleSortChange('template')}
            >
              Base Template
              {sort.field === 'template' && (
                <ArrowUp
                  className={twMerge(
                    'size-3 transition-transform',
                    sort.direction === 'DESC' && 'rotate-180',
                  )}
                />
              )}
            </span>
          </Column>
          <Column width={180}>Data</Column>
          <Column width={170}>
            <span
              className={twMerge(
                'cursor-pointer flex items-center gap-1',
                sort.field === 'createdAt' && 'text-white',
              )}
              onClick={() => handleSortChange('createdAt')}
            >
              Created At
              {sort.field === 'createdAt' && (
                <ArrowUp
                  className={twMerge(
                    'size-3 transition-transform',
                    sort.direction === 'DESC' && 'rotate-180',
                  )}
                />
              )}
            </span>
          </Column>
          <Column width={50} className="flex justify-end">
            <LoaderCircle
              className={twMerge(
                'text-orange-500 animate-spin size-4 transition-opacity opacity-0 duration-200 ease-in-out',
                isPending && 'opacity-100',
              )}
            />
          </Column>
        </Header>

        <Body>
          {(index) => {
            const task = cache.getItem(index)
            if (!task) return null

            return (
              <Row>
                {/* Column 1: Status */}
                <VirtualTable.Cell className="px-3">
                  <StatusIcon status={task.status} />
                </VirtualTable.Cell>

                {/* Column 2: Mode */}
                <VirtualTable.Cell className="px-3">
                  {task.mode === 'CONTINUOUS' ? (
                    <Badge severity="highlight">Continuous</Badge>
                  ) : (
                    <Badge>Linear</Badge>
                  )}
                </VirtualTable.Cell>

                {/* Column 3: Name */}
                <VirtualTable.Cell className="px-3 font-semibold text-zinc-200">
                  <div className="flex items-center gap-1.5">
                    {task.branchId !== 'root' ? (
                      <>
                        <Badge severity="success">
                          <span className="flex items-center gap-0.5 text-[9px] px-0.5">
                            U <ArrowUp className="size-3" />
                          </span>
                        </Badge>
                        <span className="text-green-400 font-bold">
                          {task.name}
                        </span>
                      </>
                    ) : (
                      <span>{task.name}</span>
                    )}
                  </div>
                </VirtualTable.Cell>

                {/* Column 4: Base Template */}
                <VirtualTable.Cell className="px-3 text-zinc-400">
                  {task.template?.name}
                </VirtualTable.Cell>

                {/* Column 5: Data */}
                <VirtualTable.Cell className="px-3">
                  <div className="flex gap-1.5 items-center">
                    {task.hasInput && <Badge severity="highlight">Input</Badge>}
                    {task.status === 'FAILED' && (
                      <Badge severity="danger">Error</Badge>
                    )}

                    {task.status !== 'FAILED' &&
                      task.status !== 'STOPPED' &&
                      task.hasResult && (
                        <Badge severity="success">Result</Badge>
                      )}
                  </div>
                </VirtualTable.Cell>

                {/* Column 6: Created At */}
                <VirtualTable.Cell className="px-3 text-zinc-400">
                  <div className="flex flex-col leading-tight">
                    <span>{formatDate(task.createdAt)}</span>
                    <span className="text-[10px] text-zinc-500">
                      by{' '}
                      {task.createdBy?.__typename === 'User'
                        ? task.createdBy.username
                        : (task.createdBy?.name ?? 'system')}
                    </span>
                  </div>
                </VirtualTable.Cell>

                {/* Column 7: Spacer for loader */}
                <VirtualTable.Cell />
              </Row>
            )
          }}
        </Body>

        <SkeletonRow />

        <Empty>No tasks found</Empty>

        <Footer>
          {({ start, end }) => (
            <span className="text-xs text-zinc-500">
              {Math.max(1, start + 1)}–{Math.min(end, cache.totalCount)} /{' '}
              {cache.totalCount.toLocaleString()}
              {cache.loading && ' · Loading…'}
            </span>
          )}
        </Footer>
      </VirtualTable>
    </div>
  )
}

/* ── Outer Demo Component ──────────────────────────────────────── */

export function TableDemo() {
  const [inputValue, setInputValue] = useState('')

  const [isSimulating, setIsSimulating] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1000)
  const [stallLoading, setStallLoading] = useState(false)
  const stallLoadingRef = useRef(false)
  const [adjustScrollPosition, setAdjustScrollPosition] = useState(true)

  const [simLogs, setSimLogs] = useState<
    { id: number; msg: string; type: string }[]
  >([])
  const logIdRef = useRef(0)

  // In-memory fake database (initialised from module-scope constant)
  const tasksDatabaseRef = useRef<TaskItem[]>(INITIAL_TASKS)

  // Ref exposing inner table cache operations to the simulation loop
  const cacheRef = useRef<CacheRefObj | null>(null)

  const addLog = (msg: string, type: string) => {
    setSimLogs((prev) => [
      { id: ++logIdRef.current, msg, type },
      ...prev.slice(0, 19),
    ])
  }

  // Simulation loop
  useEffect(() => {
    if (!isSimulating) return

    const interval = setInterval(() => {
      const db = tasksDatabaseRef.current
      if (db.length === 0) return

      const actionRand = Math.random()

      if (actionRand < 0.15) {
        // DELETE a random task
        const unprotected = db.filter((t) => !t.protected)
        if (unprotected.length > 0) {
          const target =
            unprotected[Math.floor(Math.random() * unprotected.length)]!
          tasksDatabaseRef.current = db.filter((t) => t.id !== target.id)
          cacheRef.current?.remove(target.id)
          addLog(`Removed task "${target.name}"`, 'delete')
        }
      } else if (actionRand < 0.85) {
        // UPDATE status of a random task
        const idx = Math.floor(Math.random() * db.length)
        const task = db[idx]!
        const nextStatusMap: Record<TaskItem['status'], TaskItem['status']> = {
          PENDING: 'RUNNING',
          RUNNING: Math.random() > 0.15 ? 'SUCCESSFUL' : 'FAILED',
          SUCCESSFUL: 'PENDING',
          FAILED: 'PENDING',
          STOPPED: 'PENDING',
        }
        const nextStatus = nextStatusMap[task.status]
        const updated = {
          ...task,
          status: nextStatus,
          statusText:
            nextStatus === 'FAILED'
              ? 'Simulated pipeline connection error'
              : '',
          hasResult:
            nextStatus === 'SUCCESSFUL' ? Math.random() > 0.5 : task.hasResult,
        }
        db[idx] = updated
        cacheRef.current?.upsert(updated)
        addLog(
          `Transitioned "${task.name}": ${task.status} -> ${nextStatus}`,
          'update',
        )
      } else {
        // CREATE a new task
        const newId = `task_sim_${Date.now()}`
        const newIndex = db.length + 1
        const newNames = [
          'Validate Database Integrity',
          'Clean Stale Sessions',
          'Back up Transaction Logs',
          'Fetch Remote Analytics',
          'Reindex Elasticsearch',
        ]
        const name =
          newNames[Math.floor(Math.random() * newNames.length)] +
          ` #${newIndex}`
        const newTask: TaskItem = {
          id: newId,
          name,
          status: 'PENDING',
          mode: Math.random() > 0.5 ? 'LINEAR' : 'CONTINUOUS',
          template: { name: name.split('#')[0]!.trim() },
          hasInput: Math.random() > 0.3,
          hasResult: false,
          createdAt: new Date().toISOString(),
          statusText: '',
          protected: Math.random() > 0.9,
          hasUserInteractions: Math.random() > 0.8,
          branchId: Math.random() > 0.9 ? 'branch-123' : 'root',
          createdBy: {
            __typename: 'User' as const,
            username: 'sim_worker',
          },
        }

        db.push(newTask)
        cacheRef.current?.upsert(newTask)
        addLog(`Created new task "${newTask.name}"`, 'create')
      }
    }, simSpeed)

    return () => clearInterval(interval)
  }, [isSimulating, simSpeed])

  const displayCount =
    cacheRef.current?.getTotalCount() ?? tasksDatabaseRef.current.length

  return (
    <div className="flex flex-col gap-4 grow min-h-0">
      {/* Simulation & Filter Controls */}
      <div className="shrink-0 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-zinc-900 p-4 border border-zinc-800">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-xl font-bold">
            Tasks ({displayCount.toLocaleString()})
          </h2>
          <input
            type="text"
            placeholder="Filter by name..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="bg-zinc-850 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500 text-zinc-100 placeholder-zinc-500 w-52"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
            <span className="text-xs text-zinc-400">Live Updates:</span>
            <Button
              severity={isSimulating ? 'success' : undefined}
              onClick={() => setIsSimulating(!isSimulating)}
            >
              {isSimulating ? 'Active' : 'Paused'}
            </Button>
            <select
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="h-8 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded px-2 text-xs focus:outline-none"
            >
              <option value={500}>Fast (0.5s)</option>
              <option value={1000}>Normal (1.0s)</option>
              <option value={3000}>Slow (3.0s)</option>
            </select>
          </div>

          <Button
            severity="highlight"
            onClick={() => {
              const newId = `task_man_${Date.now()}`
              const name = `Manual Run Task #${tasksDatabaseRef.current.length + 1}`
              const newTask: TaskItem = {
                id: newId,
                name,
                status: 'PENDING',
                mode: 'LINEAR',
                template: { name: 'Manual Task Template' },
                hasInput: true,
                hasResult: false,
                createdAt: new Date().toISOString(),
                statusText: '',
                protected: false,
                hasUserInteractions: false,
                branchId: 'root',
                createdBy: {
                  __typename: 'User' as const,
                  username: 'admin_user',
                },
              }
              tasksDatabaseRef.current.push(newTask)
              cacheRef.current?.upsert(newTask)
              addLog(`Manually created "${name}"`, 'create')
            }}
          >
            New Task
          </Button>

          <Button
            severity={stallLoading ? 'warning' : undefined}
            onClick={() => {
              setStallLoading((prev) => {
                const next = !prev
                stallLoadingRef.current = next
                addLog(
                  next
                    ? 'Stalling enabled – loading paused indefinitely'
                    : 'Stalling disabled – pending fetches resuming',
                  'update',
                )
                return next
              })
            }}
          >
            <Timer className="size-3.5" />
            {stallLoading ? 'Stalling' : 'Stall Loading'}
          </Button>

          <Button
            severity={!adjustScrollPosition ? 'warning' : undefined}
            onClick={() => {
              setAdjustScrollPosition((prev) => {
                const next = !prev
                addLog(
                  next
                    ? 'Scroll adjustment enabled'
                    : 'Scroll adjustment disabled',
                  'update',
                )
                return next
              })
            }}
          >
            <ArrowUp className="size-3.5" />
            {adjustScrollPosition ? 'Scroll Adjust' : 'No Adjust'}
          </Button>


        </div>
      </div>

      {/* Virtual Table with Suspense wrapping only the table viewport */}
      <Suspense
        fallback={
          <div className="grow min-h-0 flex flex-col items-center justify-center text-zinc-500 animate-pulse bg-zinc-950 gap-2 border border-zinc-800 p-2">
            <Loader2 className="size-6 animate-spin text-orange-500" />
            <span>Fetching matching tasks...</span>
          </div>
        }
      >
        <TaskTableInner
          inputValue={inputValue}
          tasksDatabaseRef={tasksDatabaseRef}
          cacheRef={cacheRef}
          stallLoadingRef={stallLoadingRef}
          adjustScrollPosition={adjustScrollPosition}

          addLog={addLog}
        />
      </Suspense>

      {/* Logs Window */}
      <div className="shrink-0 p-4 border border-zinc-800 bg-zinc-900">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Simulation Logs
        </h3>
        <div className="h-15 overflow-y-auto font-mono text-[11px] text-zinc-500 space-y-1 scrollbar scrollbar-zinc-500">
          {simLogs.length === 0 ? (
            <div className="italic text-zinc-600">
              No events logged yet. Enable simulation to see live updates.
            </div>
          ) : (
            simLogs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-zinc-600">
                  [{new Date().toLocaleTimeString()}]
                </span>
                <span
                  className={twMerge(
                    log.type === 'create' && 'text-green-500',
                    log.type === 'delete' && 'text-red-500',
                    log.type === 'update' && 'text-orange-400',
                  )}
                >
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
