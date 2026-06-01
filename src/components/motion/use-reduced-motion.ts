"use client"

import { useEffect, useState } from "react"

/**
 * Returns whether motion should be reduced, honoring BOTH:
 * - the OS `prefers-reduced-motion: reduce` setting, and
 * - the app's accessibility toggle (which adds `.reduced-motion` to <html>,
 *   see AccessibilityProvider).
 *
 * Reads the DOM directly rather than the accessibility context so it is safe to
 * call from any component (including ones rendered outside the provider, e.g.
 * marketing pages). SSR-safe: starts `false` and resolves on mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const root = document.documentElement

    const compute = () =>
      setReduced(media.matches || root.classList.contains("reduced-motion"))

    compute()

    media.addEventListener("change", compute)
    // React to the app's accessibility toggle flipping the class on <html>.
    const observer = new MutationObserver(compute)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => {
      media.removeEventListener("change", compute)
      observer.disconnect()
    }
  }, [])

  return reduced
}
