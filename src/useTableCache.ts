import { useCallback, useEffect, useRef, useState } from 'react'

/* ── Types ──────────────────────────────────────────────────────── */

export interface UseTableCacheOptions<T> {
  /** Number of rows per page */
  pageSize: number
  /** Extract unique ID from an item (for update/remove) */
  getItemId: (item: T) => string
  /**
   * Comparator for sort order. Used by `upsert()` to place subscription
   * items at the correct position within cached pages.
   * Return negative if a comes before b, positive if after, 0 if equal.
   */
  compare: (a: T, b: T) => number
  /**
   * Fetch a page of data. Called automatically when the visible range
   * enters an unfetched page. Must return the items and the total count.
   *
   * ── Suspense behavior ──
   * • First call (no cached pages): the returned promise is THROWN
   *   → component suspends → Suspense fallback is shown.
   * • Subsequent calls (at least one page cached): non-blocking
   *   → cache.loading becomes true → skeleton rows shown for missing indices.
   */
  fetchItems: (
    offset: number,
    limit: number,
  ) => Promise<{ items: T[]; total: number }>
  /**
   * Optional. Fetch just the total count from the server.
   * Called (debounced) when an upsert arrives for an unknown ID,
   * where the cache cannot determine if it's a new item or an
   * update to a never-fetched item.
   * If not provided, the cache falls back to incrementing totalCount
   * (which may drift when items on non-cached pages are updated).
   */
  fetchCount?: () => Promise<number>
}

export interface TableCache<T> {
  /** Current total count (updated by fetch results and mutations) */
  totalCount: number
  /** Get item at absolute index. Returns undefined if page not yet fetched. */
  getItem: (index: number) => T | undefined
  /** Pass this to VirtualTable.onRangeChange — triggers page fetches */
  handleRangeChange: (range: { start: number; end: number }) => void
  /**
   * Upsert an item: if an item with the same ID already exists in a cached
   * page it is updated in-place (no position change, no totalCount change).
   * If the ID is known from a previous fetch but not on a cached page,
   * the item is ignored (it's an update to a non-visible item).
   * Otherwise the item is inserted at its correct sorted position (using
   * `compare`) and — if `fetchCount` was provided — a debounced count
   * re-fetch is triggered to get the authoritative total from the server.
   */
  upsert: (item: T) => void
  /**
   * Remove item by ID. Decrements totalCount.
   * Removes from all cached pages. Invalidates pages after removal point.
   */
  remove: (id: string) => void
  /** Clear all cached pages. Next render will re-suspend. */
  reset: () => void
  /**
   * true when a scroll-triggered page fetch is in-flight.
   * false during the initial Suspense-suspended fetch (Suspense handles that).
   * Use this to show a small loading indicator in the header/footer.
   */
  loading: boolean
}

/* ── Cache state ─────────────────────────────────────────────── */

interface CacheState<T> {
  pages: Map<number, T[]>
  totalCount: number
  inflight: Set<number>
  compare: UseTableCacheOptions<T>['compare']
  fetchItems: UseTableCacheOptions<T>['fetchItems']
  fetchCount: UseTableCacheOptions<T>['fetchCount']
  getItemId: UseTableCacheOptions<T>['getItemId']
  promise: Promise<void> | null
  /**
   * Tracks every item ID the cache has ever seen in the current result set.
   * Survives page eviction. Used by `upsert()` to distinguish updates to
   * non-cached items (no count change) from genuinely new items.
   */
  knownIds: Set<string>
  /** Timer handle for the debounced fetchCount call */
  fetchCountTimer: ReturnType<typeof setTimeout> | null
}

/* ── Module-level cache keyed by useId() ─────────────────────── */
// useId() survives Suspense throws, so the map key is stable.
// The `deps` string on each entry tracks when the dataset parameters
// change (sort, filter, scope). A deps mismatch replaces the entry.

const cacheMap = new Map<string, CacheState<any>>()

function resolveCache<T>(
  id: string,
  options: Pick<
    UseTableCacheOptions<T>,
    'fetchItems' | 'fetchCount' | 'compare' | 'getItemId'
  >,
  pageSize: number,
): CacheState<T> {
  let state = cacheMap.get(id)
  if (!state) {
    state = {
      pages: new Map(),
      totalCount: 0,
      inflight: new Set(),
      compare: options.compare,
      fetchItems: options.fetchItems,
      fetchCount: options.fetchCount,
      getItemId: options.getItemId,
      promise: null,
      knownIds: new Set(),
      fetchCountTimer: null,
    }
    cacheMap.set(id, state)

    // Kick off initial fetch immediately
    const s = state
    s.promise = options
      .fetchItems(0, pageSize)
      .then((result) => {
        // Only apply if this entry is still current
        if (cacheMap.get(id) === s) {
          s.pages.set(0, result.items)
          s.totalCount = result.total
          for (const item of result.items) {
            s.knownIds.add(s.getItemId(item))
          }
        }
      })
      .then(() => {
        s.promise = null
      })
      .catch((error) => {
        console.error(error)
        throw error
      })
  }

  state.fetchItems = options.fetchItems
  state.fetchCount = options.fetchCount
  state.compare = options.compare
  state.getItemId = options.getItemId

  return state
}

/* ── Hook ────────────────────────────────────────────────────── */

export function useTableCache<T>(
  key: string,
  options: UseTableCacheOptions<T>,
): TableCache<T> {
  const { pageSize, getItemId, compare, fetchItems, fetchCount } = options

  const [, forceRender] = useState(0)
  const [iteration, setIteration] = useState(0)
  const rerender = useCallback(() => {
    forceRender((c) => c + 1)
  }, [])

  const activeKey = [key, iteration].join('-')
  // ── Get or create cache (useId() survives Suspense) ────────────
  const currentCache = resolveCache(
    activeKey,
    { fetchItems, fetchCount, compare, getItemId },
    pageSize,
  )

  // Keep a ref so mutation callbacks always access the current cache
  const cacheRef = useRef(currentCache)
  cacheRef.current = currentCache

  // ── Suspense: throw if initial fetch is pending ────────────────
  if (currentCache.promise) {
    throw currentCache.promise
  }

  // ── Cleanup all cache entries for this key on unmount ──────────
  useEffect(
    () => () => {
      for (const k of cacheMap.keys()) {
        if (k.startsWith(key)) {
          cacheMap.delete(k)
        }
      }
    },
    [key],
  )

  // ── Fetch a page (non-blocking, for scroll-triggered loads) ────
  const fetchPage = useCallback(
    (pageIndex: number) => {
      const c = cacheRef.current
      if (c.pages.has(pageIndex) || c.inflight.has(pageIndex)) {
        return
      }

      const offset = pageIndex * pageSize
      c.inflight.add(pageIndex)

      c.fetchItems(offset, pageSize).then((result) => {
        if (cacheRef.current === c) {
          c.pages.set(pageIndex, result.items)
          c.totalCount = result.total
          c.inflight.delete(pageIndex)
          for (const item of result.items) {
            c.knownIds.add(c.getItemId(item))
          }
          rerender()
        }
      })
    },
    [pageSize, rerender],
  )

  // ── getItem ────────────────────────────────────────────────────
  const getItem = useCallback(
    (index: number): T | undefined => {
      const c = cacheRef.current
      const pageIndex = Math.floor(index / pageSize)
      const page = c.pages.get(pageIndex)
      if (!page) {
        return undefined
      }
      const offsetInPage = index - pageIndex * pageSize
      return page[offsetInPage]
    },
    [pageSize],
  )

  // ── handleRangeChange ──────────────────────────────────────────
  const handleRangeChange = useCallback(
    (range: { start: number; end: number }) => {
      const c = cacheRef.current
      if (c.totalCount === 0) {
        return
      }

      const startPage = Math.floor(range.start / pageSize)
      const endPage = Math.floor(
        Math.min(range.end, c.totalCount - 1) / pageSize,
      )

      for (let p = startPage; p <= endPage; p++) {
        fetchPage(p)
      }
    },
    [pageSize, fetchPage],
  )

  // ── debounced fetchCount ────────────────────────────────────────
  const debouncedFetchCount = useCallback(() => {
    const c = cacheRef.current
    if (!c.fetchCount) {
      return
    }

    if (c.fetchCountTimer) {
      clearTimeout(c.fetchCountTimer)
    }

    c.fetchCountTimer = setTimeout(() => {
      const current = cacheRef.current
      current.fetchCountTimer = null
      current.fetchCount?.().then((total) => {
        if (cacheRef.current === current) {
          current.totalCount = total
          rerender()
        }
      })
    }, 150)
  }, [rerender])

  // ── upsert (sort-aware insert or in-place update) ──────────────
  const upsert = useCallback(
    (item: T) => {
      const c = cacheRef.current
      const id = getItemId(item)

      // ── Check for existing item on cached page → update in-place
      for (const [, page] of c.pages) {
        const idx = page.findIndex((p) => getItemId(p) === id)
        if (idx !== -1) {
          page[idx] = item
          rerender()
          return
        }
      }

      // ── Known ID on a non-cached page → skip (no count change)
      if (c.knownIds.has(id)) {
        return
      }

      // ── Unknown ID → genuinely new to this result set ──────────
      c.knownIds.add(id)

      let inserted = false

      const sortedPageIndices = [...c.pages.keys()].sort((a, b) => a - b)

      for (const pageIndex of sortedPageIndices) {
        const page = c.pages.get(pageIndex)!

        if (page.length > 0 && c.compare(item, page[0]) <= 0) {
          page.unshift(item)
          inserted = true
          invalidateAfter(c, pageIndex)
          break
        }

        if (page.length > 0) {
          const lastItem = page[page.length - 1]
          if (c.compare(item, lastItem) <= 0) {
            let lo = 0
            let hi = page.length
            while (lo < hi) {
              const mid = (lo + hi) >>> 1
              if (c.compare(item, page[mid]) <= 0) {
                hi = mid
              } else {
                lo = mid + 1
              }
            }
            page.splice(lo, 0, item)
            inserted = true
            invalidateAfter(c, pageIndex)
            break
          }
        }
      }

      if (!inserted) {
        if (sortedPageIndices.length > 0) {
          const firstPageIndex = sortedPageIndices[0]
          const firstPage = c.pages.get(firstPageIndex)!
          if (firstPage.length > 0 && c.compare(item, firstPage[0]) <= 0) {
            firstPage.unshift(item)
            invalidateAfter(c, firstPageIndex)
          }
        }
      }

      if (c.fetchCount) {
        // Ask the server for the authoritative count (debounced)
        debouncedFetchCount()
      } else {
        // Fallback: optimistic increment (may drift)
        c.totalCount += 1
      }

      rerender()
    },
    [getItemId, rerender, debouncedFetchCount],
  )

  // ── remove ─────────────────────────────────────────────────────
  const remove = useCallback(
    (id: string) => {
      const c = cacheRef.current
      let removedFromPage: number | null = null

      c.knownIds.delete(id)

      for (const [pageIndex, page] of c.pages) {
        const idx = page.findIndex((item) => getItemId(item) === id)
        if (idx !== -1) {
          page.splice(idx, 1)
          removedFromPage = pageIndex
          break
        }
      }

      c.totalCount = Math.max(0, c.totalCount - 1)

      if (removedFromPage !== null) {
        invalidateAfter(c, removedFromPage)
      }

      rerender()
    },
    [getItemId, rerender],
  )

  // ── reset ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const c = cacheRef.current
    if (c.fetchCountTimer) {
      clearTimeout(c.fetchCountTimer)
      c.fetchCountTimer = null
    }
    setIteration((iteration) => iteration + 1)
    rerender()
  }, [rerender])

  return {
    totalCount: currentCache.totalCount,
    getItem,
    handleRangeChange,
    upsert,
    remove,
    reset,
    loading: currentCache.inflight.size > 0,
  }
}

/* ── Helpers ──────────────────────────────────────────────────── */

function invalidateAfter<T>(cache: CacheState<T>, afterPageIndex: number) {
  for (const key of cache.pages.keys()) {
    if (key > afterPageIndex) {
      cache.pages.delete(key)
    }
  }
}
