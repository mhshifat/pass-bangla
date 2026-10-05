"use client"

import { useEffect, useState, type RefObject } from "react"

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean }
  deviceMemory?: number
}

/**
 * Decides whether a purely decorative WebGL canvas is worth loading.
 *
 * Resolves to `true` only after mount (so three.js is never part of first paint), only on
 * devices that can afford it, and only once `ref` is close to the viewport. Returns `false`
 * forever for reduced-motion users, small screens, data-saver mode and low-end hardware.
 */
export function useDecorativeWebGL(ref: RefObject<HTMLElement | null>): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const nav = navigator as NavigatorHints
    const blocked =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("reduced-motion") ||
      window.matchMedia("(max-width: 767px)").matches ||
      nav.connection?.saveData === true ||
      (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency < 4) ||
      (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4)
    if (blocked) return

    const target = ref.current
    if (!target) return

    let cancelled = false
    let idleHandle: number | undefined
    // Safari has no requestIdleCallback
    const hasIdleCallback = typeof window.requestIdleCallback === "function"
    const schedule = () => {
      const run = () => {
        if (!cancelled) setEnabled(true)
      }
      // Give the main thread a breather after hydration before pulling in three.js
      idleHandle = hasIdleCallback
        ? window.requestIdleCallback(run, { timeout: 2000 })
        : window.setTimeout(run, 300)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          schedule()
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(target)

    return () => {
      cancelled = true
      observer.disconnect()
      if (idleHandle !== undefined) {
        if (hasIdleCallback) window.cancelIdleCallback(idleHandle)
        else window.clearTimeout(idleHandle)
      }
    }
  }, [ref])

  return enabled
}
