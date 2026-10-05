"use client"

import { useEffect, type RefObject } from "react"

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.classList.contains("reduced-motion")

/**
 * Scroll-reveal without GSAP.
 *
 * Elements matching `selector` inside `ref` are visible by default (no JS needed). After
 * mount, those still below the viewport get `data-reveal="pending"` (hidden via CSS) and
 * switch to `data-reveal="in"` when they scroll into view, which plays the keyframes chosen
 * by their `data-reveal-from` attribute. Once the animation ends the attribute is removed so
 * hover transforms work again (keep it with `data-reveal-keep` for looping animations).
 * Siblings are staggered by `staggerMs`.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, selector: string, staggerMs = 100) {
  useEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return

    const targets = Array.from(root.querySelectorAll<HTMLElement>(selector))
    const pending = targets.filter((el) => el.getBoundingClientRect().top > window.innerHeight)
    if (pending.length === 0) return

    const cleanups: Array<() => void> = []
    pending.forEach((el) => {
      const parent = el.parentElement
      const index = parent ? Array.from(parent.children).filter((c) => pending.includes(c as HTMLElement)).indexOf(el) : 0
      el.style.setProperty("--reveal-delay", `${Math.max(index, 0) * staggerMs}ms`)
      el.setAttribute("data-reveal", "pending")

      if (!el.hasAttribute("data-reveal-keep")) {
        const onEnd = (event: AnimationEvent) => {
          if (event.target !== el) return
          el.removeAttribute("data-reveal")
          el.style.removeProperty("--reveal-delay")
          el.removeEventListener("animationend", onEnd)
        }
        el.addEventListener("animationend", onEnd)
        cleanups.push(() => el.removeEventListener("animationend", onEnd))
      }
    })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (entry.target.getAttribute("data-reveal") === "pending") {
            entry.target.setAttribute("data-reveal", "in")
          }
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    )
    pending.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      cleanups.forEach((fn) => fn())
      pending.forEach((el) => {
        el.removeAttribute("data-reveal")
        el.style.removeProperty("--reveal-delay")
      })
    }
  }, [ref, selector, staggerMs])
}
