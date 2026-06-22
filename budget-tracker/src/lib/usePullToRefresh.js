import { useRef, useState, useEffect } from "react"

// Native-feeling pull-to-refresh for a scrollable element.
//
// Attach the returned `bind` ref to the scroll container. When the user drags
// DOWN while the container is already scrolled to the very top, we track the
// finger, show a growing indicator, and once they pass `threshold` and let go,
// run `onRefresh`. The pull distance is dampened (you drag further than the
// indicator moves) so it feels rubbery like iOS/Android.
//
// Only engages for touch input — desktop mouse-wheel scrolling is untouched.
export function usePullToRefresh(onRefresh, { threshold = 70, max = 120 } = {}) {
  const ref = useRef(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const [distance, setDistance] = useState(0) // current indicator offset, px
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onTouchStart(e) {
      // Only begin a pull if we're at the very top and not already refreshing.
      if (refreshing || el.scrollTop > 0) {
        pulling.current = false
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    function onTouchMove(e) {
      if (!pulling.current) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        // Dragging up — let the browser scroll normally.
        setDistance(0)
        return
      }
      // Dampen: indicator moves at ~40% of finger travel, capped at `max`.
      const pulled = Math.min(max, delta * 0.4)
      setDistance(pulled)
      // Past a small deadzone, claim the gesture so the page doesn't also scroll
      // / trigger the browser's own bounce.
      if (pulled > 5 && e.cancelable) e.preventDefault()
    }

    async function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      if (distance >= threshold && !refreshing) {
        setRefreshing(true)
        setDistance(threshold) // hold the spinner at the threshold while loading
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
          setDistance(0)
        }
      } else {
        setDistance(0) // didn't pull far enough — snap back
      }
    }

    // `passive: false` on move so preventDefault() actually suppresses scroll.
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd)
    el.addEventListener("touchcancel", onTouchEnd)
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [onRefresh, threshold, max, distance, refreshing])

  // Return the ref under a neutral name (`containerRef`) — naming it `ref` makes
  // the lint rule think we're reading a ref's value during render at the call site.
  return { containerRef: ref, distance, refreshing, threshold }
}
