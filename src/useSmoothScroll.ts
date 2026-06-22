import { type RefObject, useCallback, useEffect, useRef } from 'react'

export interface SmoothScrollConfig {
  /** Lerp factor — higher = snappier, lower = smoother. Default: `0.08`. */
  lerp?: number
  /** Stop animating when within this many pixels of target. Default: `0.5`. */
  epsilon?: number
}

/**
 * Intercepts `wheel` events on `scrollRef` and applies rAF-based
 * lerp interpolation so scrolling with a mouse wheel feels smooth
 * in browsers that don't natively interpolate discrete wheel deltas
 * (e.g. Safari).
 *
 * Pass `false` to disable, `true` for defaults, or a config object
 * to customise the interpolation.
 *
 * Returns a `cancel` function that stops any in-flight animation
 * and syncs the internal target to the element's current scrollTop.
 * Call this before programmatic scroll changes (e.g. scrollTo) so the
 * lerp doesn't fight back.
 */
export function useSmoothScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  config: boolean | SmoothScrollConfig,
) {
  const enabled = config !== false
  const lerp = (typeof config === 'object' ? config.lerp : undefined) ?? 0.08
  const epsilon =
    (typeof config === 'object' ? config.epsilon : undefined) ?? 0.5

  // All mutable state lives in a single ref to avoid re-renders.
  const state = useRef({
    targetScrollTop: 0,
    animating: false,
    rafId: 0,
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el) {
      return
    }

    const animate = () => {
      const s = state.current
      const current = el.scrollTop
      const diff = s.targetScrollTop - current

      if (Math.abs(diff) < epsilon) {
        el.scrollTop = s.targetScrollTop
        s.animating = false
        return
      }

      el.scrollTop = current + diff * lerp
      s.rafId = requestAnimationFrame(animate)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()

      const s = state.current
      const maxScroll = el.scrollHeight - el.clientHeight

      if (!s.animating) {
        s.targetScrollTop = el.scrollTop
      }
      s.targetScrollTop = Math.max(
        0,
        Math.min(maxScroll, s.targetScrollTop + e.deltaY),
      )

      if (!s.animating) {
        s.animating = true
        s.rafId = requestAnimationFrame(animate)
      }
    }

    // Must be non-passive to allow preventDefault.
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(state.current.rafId)
      state.current.animating = false
    }
  }, [scrollRef, enabled, lerp, epsilon])

  /** Stop any in-flight lerp animation and sync the internal target. */
  const cancel = useCallback(() => {
    const s = state.current
    if (s.animating) {
      cancelAnimationFrame(s.rafId)
      s.animating = false
    }
    s.targetScrollTop = scrollRef.current?.scrollTop ?? 0
  }, [scrollRef])

  return cancel
}
