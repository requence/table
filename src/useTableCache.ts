import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { VirtualTableHandle } from './VirtualTable.tsx'

/* ── Types ──────────────────────────────────────────────────────── */

export interface UseTableCacheOptions<T> {
  /** Number of rows per page */
  pageSize: number
  /** Fixed height of each row in pixels. Used to compute scroll corrections. */
  rowHeight: number
  /** Gap between rows in pixels (default: 0). Must match VirtualTable's rowGap. */
  rowGap?: number
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
   * Called (debounced) when an upsert arrives for an unknown ID that
   * cannot be placed within a cached page (i.e. it sorts outside the
   * cached range), or after a within-page insert for drift correction.
   * If not provided, the cache falls back to incrementing totalCount
   * (which may drift when items on non-cached pages are updated).
   */
  fetchCount?: () => Promise<number>
}

export interface TableCache<T> {
  /** Ref to pass to VirtualTable for scroll correction */
  ref: React.RefObject<VirtualTableHandle | null>
  /** Fixed height of each row in pixels */
  rowHeight: number
  /** Gap between rows in pixels */
  rowGap: number
  /** Current total count (updated by fetch results and mutations) */
  totalCount: number
  /**
   * Read the live totalCount from the mutable cache state.
   * Unlike `totalCount` (which is a snapshot taken at render time),
   * this function always returns the latest value — including changes
   * made by `upsert()` / `remove()` calls that haven't triggered a
   * re-render yet. Useful when reading the count from a parent
   * component via a ref after an imperative mutation.
   */
  getTotalCount: () => number
  /** Get item at absolute index. Returns undefined if page not yet fetched. */
  getItem: (index: number) => T | undefined
  /**
   * Pass this to VirtualTable.onRangeChange (or spread the cache return
   * value onto VirtualTable) — triggers page fetches for visible pages.
   */
  onRangeChange: (range: { start: number; end: number }) => void
  /**
   * Upsert an item: if an item with the same ID already exists in a cached
   * page it is updated in-place (no position change, no totalCount change).
   * If the ID is known from a previous fetch but not on a cached page,
   * the item is ignored (it's an update to a non-visible item).
   * Otherwise the item is handled based on where it sorts relative to
   * cached pages — inserted surgically within, or deferred to the server
   * if it falls outside the cached range.
   */
  upsert: (item: T) => void
  /**
   * Remove item by ID. Decrements totalCount.
   * If the item is on a cached page, it is spliced out and subsequent
   * contiguous pages are surgically adjusted. If the item was above the
   * viewport, scroll position is corrected to prevent layout shift.
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
   * The value is the page index where the item was last seen. This
   * survives page eviction and is used by `upsert()` to distinguish
   * updates to non-cached items from genuinely new items, and by
   * `remove()` to determine if a removed item was above the viewport
   * for scroll correction.
   */
  knownIds: Map<string, number>
  /** Timer handle for the debounced fetchCount call */
  fetchCountTimer: ReturnType<typeof setTimeout> | null
  /** Last visible range reported by onRangeChange, used for scroll correction decisions */
  lastVisibleRange: { start: number; end: number } | null
  /**
   * Number of upsert events where the item sorted above all cached pages.
   * Reset when the debounced fetchCount response arrives and scroll
   * correction is applied.
   */
  pendingAboveCount: number
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
      knownIds: new Map(),
      fetchCountTimer: null,
      lastVisibleRange: null,
      pendingAboveCount: 0,
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
            s.knownIds.set(s.getItemId(item), 0)
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

/* ── Deferred cleanup timers (StrictMode-safe) ───────────────── */

const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

/* ── Hook ────────────────────────────────────────────────────── */

export type CacheKey = string | number | (string | number)[]

export function useTableCache<T>(
  key: CacheKey,
  options: UseTableCacheOptions<T>,
): TableCache<T> {
  const {
    pageSize,
    rowHeight,
    rowGap = 0,
    getItemId,
    compare,
    fetchItems,
    fetchCount,
  } = options
  const rowStride = rowHeight + rowGap

  // ── Stable wrappers for user-supplied option functions ────────
  // Use refs instead of useEffectEvent because these functions may be
  // called during the render phase (e.g. via urql's useState updater
  // in subscription handlers). useEffectEvent throws when called
  // during rendering.
  const getItemIdRef = useRef(getItemId)
  getItemIdRef.current = getItemId
  const stableGetItemId = useCallback((item: T) => getItemIdRef.current(item), [])
  const compareRef = useRef(compare)
  compareRef.current = compare
  const stableCompare = useCallback((a: T, b: T) => compareRef.current(a, b), [])

  const [, forceRender] = useState(0)
  const [iteration, setIteration] = useState(0)
  const rerender = useCallback(() => {
    forceRender((c) => c + 1)
  }, [])

  const normalizedKey = Array.isArray(key) ? key.join('-') : String(key)
  const activeKey = [normalizedKey, iteration].join('-')

  // ── Get or create cache ──────────────────────────────────────────
  // Uses the deferred key: urgent renders keep the old cache (with data),
  // deferred renders switch to the new cache (may suspend).
  const currentCache = resolveCache(
    activeKey,
    { fetchItems, fetchCount, compare, getItemId },
    pageSize,
  )

  // Keep a ref so mutation callbacks always access the current cache
  const cacheRef = useRef(currentCache)
  cacheRef.current = currentCache

  // Ref to the VirtualTable imperative handle (for scroll correction)
  const tableRef = useRef<VirtualTableHandle | null>(null)

  // ── Suspense: throw if initial fetch is pending ────────────────
  if (currentCache.promise) {
    throw currentCache.promise
  }

  // ── Cleanup all cache entries for this key on unmount ──────────
  // Deferred via setTimeout(0) so React StrictMode's simulated
  // unmount→remount cycle can cancel the timer before it fires.
  useEffect(() => {
    const pending = cleanupTimers.get(normalizedKey)
    if (pending != null) {
      clearTimeout(pending)
      cleanupTimers.delete(normalizedKey)
    }

    return () => {
      const timer = setTimeout(() => {
        cleanupTimers.delete(normalizedKey)
        for (const k of cacheMap.keys()) {
          if (k.startsWith(normalizedKey)) {
            cacheMap.delete(k)
          }
        }
      }, 0)
      cleanupTimers.set(normalizedKey, timer)
    }
  }, [normalizedKey])

  // ── Fetch a page (non-blocking, for scroll-triggered loads) ────
  const fetchPage = useCallback(
    (pageIndex: number) => {
      const c = cacheRef.current
      if (c.inflight.has(pageIndex)) {
        return
      }

      const existingPage = c.pages.get(pageIndex)
      if (existingPage) {
        // Full page — already fetched
        if (existingPage.length >= pageSize) {
          return
        }
        // Legitimate last page of the dataset — no more items to fetch
        if (pageIndex * pageSize + pageSize > c.totalCount) {
          return
        }
      }

      const offset = pageIndex * pageSize
      c.inflight.add(pageIndex)

      c.fetchItems(offset, pageSize).then((result) => {
        if (cacheRef.current === c) {
          c.pages.set(pageIndex, result.items)
          c.totalCount = result.total
          c.inflight.delete(pageIndex)
          for (const item of result.items) {
            c.knownIds.set(c.getItemId(item), pageIndex)
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

  // ── onRangeChange ─────────────────────────────────────────────
  const onRangeChange = useCallback(
    (range: { start: number; end: number }) => {
      const c = cacheRef.current
      c.lastVisibleRange = range
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

      const oldCount = current.totalCount
      const pending = current.pendingAboveCount

      current.fetchCount?.().then((total) => {
        if (cacheRef.current === current) {
          const countDelta = total - oldCount
          // Cap scroll correction at pendingAboveCount — some of
          // the delta may be from items inserted below the viewport.
          const aboveAdjustment = Math.min(pending, Math.max(0, countDelta))

          current.pendingAboveCount = 0
          current.totalCount = total

          if (aboveAdjustment > 0) {
            tableRef.current?.scrollBy(aboveAdjustment * rowStride)
          }

          rerender()
        }
      })
    }, 150)
  }, [rerender, rowStride])

  // ── upsert (sort-aware insert or in-place update) ──────────────
  const upsert = useCallback(
    (item: T) => {
      const c = cacheRef.current
      const id = stableGetItemId(item)

      // ── Case 1: existing item on cached page → update in-place
      for (const [, page] of c.pages) {
        const idx = page.findIndex((p) => stableGetItemId(p) === id)
        if (idx !== -1) {
          page[idx] = item
          rerender()
          return
        }
      }

      // ── Case 2: known ID on a non-cached page → skip
      if (c.knownIds.has(id)) {
        return
      }

      // ── Unknown ID → genuinely new to this result set ──────────
      c.knownIds.set(id, -1) // -1 = not placed on any page yet

      const sortedPageIndices = [...c.pages.keys()].sort((a, b) => a - b)

      if (sortedPageIndices.length === 0) {
        // No cached pages at all — just query count
        if (c.fetchCount) {
          debouncedFetchCount()
        } else {
          c.totalCount += 1
        }
        rerender()
        return
      }

      const firstPageIndex = sortedPageIndices[0]
      const lastPageIndex = sortedPageIndices[sortedPageIndices.length - 1]
      const firstPage = c.pages.get(firstPageIndex)!
      const lastPage = c.pages.get(lastPageIndex)!

      // ── Case 4: sorts before first cached item AND there are
      //    uncached pages before it → item is above viewport
      if (
        firstPageIndex > 0 &&
        firstPage.length > 0 &&
        stableCompare(item, firstPage[0]) < 0
      ) {
        c.pendingAboveCount++
        if (c.fetchCount) {
          debouncedFetchCount()
        } else {
          c.totalCount += 1
          // Without fetchCount, apply scroll correction immediately
          tableRef.current?.scrollBy(rowStride)
        }
        rerender()
        return
      }

      // ── Case 5: sorts after last cached item
      if (
        lastPage.length > 0 &&
        stableCompare(item, lastPage[lastPage.length - 1]) > 0
      ) {
        // Check if the last cached page is the terminal page of the
        // dataset. If so, append directly — there are no unseen items
        // between the last cached item and the new one.
        const isTerminalPage =
          lastPageIndex * pageSize + lastPage.length >= c.totalCount

        if (isTerminalPage) {
          lastPage.push(item)
          c.knownIds.set(id, lastPageIndex)
          surgicalShift(c, lastPageIndex, pageSize)
          c.totalCount += 1

          if (c.fetchCount) {
            debouncedFetchCount()
          }
        } else {
          // Not the terminal page → item is below viewport, defer
          if (c.fetchCount) {
            debouncedFetchCount()
          } else {
            c.totalCount += 1
          }
        }

        rerender()
        return
      }

      // ── Case 3 / 6: try to insert within a cached page ─────────
      let inserted = false
      let insertedAtIndex: number | null = null

      for (const pageIndex of sortedPageIndices) {
        const page = c.pages.get(pageIndex)!
        if (page.length === 0) {
          // Empty page (e.g. 0→1 transition) — insert directly
          page.push(item)
          c.knownIds.set(id, pageIndex)
          insertedAtIndex = pageIndex * pageSize
          inserted = true
          break
        }

        const firstItem = page[0]
        const lastItem = page[page.length - 1]

        // Item sorts before first item of this page
        if (stableCompare(item, firstItem) <= 0) {
          page.unshift(item)
          c.knownIds.set(id, pageIndex)
          surgicalShift(c, pageIndex, pageSize)
          insertedAtIndex = pageIndex * pageSize
          inserted = true
          break
        }

        // Item sorts within this page
        if (stableCompare(item, lastItem) <= 0) {
          // Binary search for insertion point
          let lo = 0
          let hi = page.length
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (stableCompare(item, page[mid]) <= 0) {
              hi = mid
            } else {
              lo = mid + 1
            }
          }
          page.splice(lo, 0, item)
          c.knownIds.set(id, pageIndex)
          surgicalShift(c, pageIndex, pageSize)
          insertedAtIndex = pageIndex * pageSize + lo
          inserted = true
          break
        }
      }

      if (inserted) {
        // ── Case 3: definitively new, increment immediately
        c.totalCount += 1

        // Scroll correction: if the insert is at or above the first
        // visible row, the visible content shifted down by 1 position.
        // Use scrollTop (not visibleRange which includes overscan).
        const scrollTop = tableRef.current?.scrollTop ?? 0
        const firstVisibleRow = Math.floor(scrollTop / rowStride)
        if (insertedAtIndex !== null && insertedAtIndex <= firstVisibleRow) {
          tableRef.current?.scrollBy(rowStride)
        }

        // Trigger debounced fetchCount for drift correction
        if (c.fetchCount) {
          debouncedFetchCount()
        }
      } else {
        // ── Case 6: falls in a gap between cached pages
        // Determine if above or below visible range for scroll correction
        const visibleStart = c.lastVisibleRange?.start ?? 0
        const firstVisiblePage = Math.floor(visibleStart / pageSize)

        // Check if the item would be above the visible range
        // by checking against the first visible page's first item
        const firstVisiblePageData = c.pages.get(firstVisiblePage)
        if (
          firstVisiblePageData &&
          firstVisiblePageData.length > 0 &&
          stableCompare(item, firstVisiblePageData[0]) < 0
        ) {
          c.pendingAboveCount++
        }

        if (c.fetchCount) {
          debouncedFetchCount()
        } else {
          c.totalCount += 1
        }
      }

      rerender()
    },
    [rerender, debouncedFetchCount, pageSize, rowStride],
  )

  // ── remove ─────────────────────────────────────────────────────
  const remove = useCallback(
    (id: string) => {
      const c = cacheRef.current
      const lastKnownPage = c.knownIds.get(id)

      c.knownIds.delete(id)

      let removedAbsoluteIndex: number | null = null

      for (const [pageIndex, page] of c.pages) {
        const idx = page.findIndex((item) => stableGetItemId(item) === id)
        if (idx !== -1) {
          removedAbsoluteIndex = pageIndex * pageSize + idx
          page.splice(idx, 1)
          surgicalPull(c, pageIndex, pageSize)
          break
        }
      }

      c.totalCount = Math.max(0, c.totalCount - 1)

      // ── Scroll correction: was the item at or above the viewport?
      // Use scrollTop (not visibleRange which includes overscan).
      const scrollTop = tableRef.current?.scrollTop ?? 0
      const firstVisibleRow = Math.floor(scrollTop / rowStride)

      if (removedAbsoluteIndex !== null) {
        // Item was on a cached page — use exact position
        if (removedAbsoluteIndex <= firstVisibleRow) {
          tableRef.current?.scrollBy(-rowStride)
        }
      } else if (lastKnownPage !== undefined && lastKnownPage >= 0) {
        // Item was known but not on a cached page — use last-known page
        const firstVisiblePage = Math.floor(firstVisibleRow / pageSize)
        if (lastKnownPage < firstVisiblePage) {
          tableRef.current?.scrollBy(-rowStride)
        }
      }

      rerender()
    },
    [rerender, pageSize, rowStride],
  )

  // ── reset ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const c = cacheRef.current
    if (c.fetchCountTimer) {
      clearTimeout(c.fetchCountTimer)
      c.fetchCountTimer = null
    }
    // Scroll back to top — the old offset is meaningless after a full reset
    tableRef.current?.scrollTo(0)
    setIteration((iteration) => iteration + 1)
    rerender()
  }, [rerender])

  const getTotalCount = useCallback(() => cacheRef.current.totalCount, [])

  const totalCount = currentCache.totalCount
  const loading = currentCache.inflight.size > 0

  return useMemo(
    () => ({
      ref: tableRef,
      rowHeight,
      rowGap,
      totalCount,
      getTotalCount,
      getItem,
      onRangeChange,
      upsert,
      remove,
      reset,
      loading,
    }),
    [
      tableRef,
      rowHeight,
      rowGap,
      totalCount,
      getTotalCount,
      getItem,
      onRangeChange,
      upsert,
      remove,
      reset,
      loading,
    ],
  )
}

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * After inserting an item into a page (which now has pageSize + 1 items),
 * cascade the overflow through subsequent contiguous cached pages.
 * Each page pops its last item and unshifts it onto the next page.
 * The last contiguous page is truncated to pageSize.
 *
 * If a gap is encountered (next page index not cached), all cached
 * pages after the gap are invalidated (they can't be surgically fixed).
 */
function surgicalShift<T>(
  cache: CacheState<T>,
  pageIndex: number,
  pageSize: number,
) {
  let currentPage = cache.pages.get(pageIndex)
  if (!currentPage || currentPage.length <= pageSize) {
    return
  }

  let nextIndex = pageIndex + 1
  while (currentPage.length > pageSize) {
    const overflow = currentPage.pop()!

    const nextPage = cache.pages.get(nextIndex)
    if (!nextPage) {
      // No next page cached — seed one with the overflow item so
      // getItem() can address it immediately (avoids skeleton flash).
      // fetchPage() will re-fetch the full page when scrolling reaches it.
      cache.pages.set(nextIndex, [overflow])
      cache.knownIds.set(cache.getItemId(overflow), nextIndex)
      // Invalidate any cached pages beyond the seeded page (they're shifted)
      for (const key of cache.pages.keys()) {
        if (key > nextIndex) {
          cache.pages.delete(key)
        }
      }
      return
    }

    nextPage.unshift(overflow)
    // Update the knownIds page index for the shifted item
    cache.knownIds.set(cache.getItemId(overflow), nextIndex)

    currentPage = nextPage
    nextIndex++
  }

  // The last contiguous page now has pageSize + 1 items if we
  // didn't hit a gap — truncate it
  if (currentPage.length > pageSize) {
    currentPage.pop()
  }
}

/**
 * After removing an item from a page (which now has pageSize - 1 items),
 * pull the first item from each subsequent contiguous cached page to
 * fill the gap. The last contiguous page shrinks by 1.
 *
 * If a gap is encountered (next page index not cached), all cached
 * pages after the gap are invalidated (they can't be surgically fixed).
 */
function surgicalPull<T>(
  cache: CacheState<T>,
  pageIndex: number,
  pageSize: number,
) {
  let currentPage = cache.pages.get(pageIndex)
  if (!currentPage) {
    return
  }

  let currentIndex = pageIndex
  while (currentPage.length < pageSize) {
    const nextIndex = currentIndex + 1
    const nextPage = cache.pages.get(nextIndex)
    if (!nextPage || nextPage.length === 0) {
      // Gap or empty page: invalidate all cached pages after this point
      for (const key of cache.pages.keys()) {
        if (key > currentIndex) {
          cache.pages.delete(key)
        }
      }
      return
    }

    const pulled = nextPage.shift()!
    currentPage.push(pulled)
    // Update the knownIds page index for the pulled item
    cache.knownIds.set(cache.getItemId(pulled), currentIndex)

    currentPage = nextPage
    currentIndex = nextIndex
  }
}
