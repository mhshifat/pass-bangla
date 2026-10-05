"use client"

import * as React from "react"
import { motion, AnimatePresence, type HTMLMotionProps } from "motion/react"
import { cn } from "@/lib/utils"
import { DURATION, EASE, SPRING, STAGGER } from "./constants"
import "./motion.css"

/**
 * Reusable motion primitives shared across the app.
 *
 * Entrance primitives (FadeIn, Stagger, PageTransition) are plain CSS animations: the
 * server-rendered markup is visible immediately and fades in without waiting for
 * hydration. They honour `prefers-reduced-motion` and the app's `.reduced-motion` toggle
 * through the stylesheet. Interaction primitives (Pressable, AnimatedList) still use
 * Framer Motion and expect the app-level {@link MotionProvider} above them.
 */

type DivMotionProps = HTMLMotionProps<"div">
type DivProps = React.ComponentProps<"div">

/** Fade + small rise on mount. Use for sections, cards, panels. `delay` is in seconds. */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
  style,
  ...props
}: DivProps & { delay?: number; y?: number }) {
  return (
    <div
      className={cn("pb-fade-in", className)}
      style={{
        ...style,
        ["--pb-y" as string]: `${y}px`,
        animationDelay: delay ? `${delay * 1000}ms` : undefined,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Container that staggers its {@link StaggerItem} children into view. Pair the
 * two for dashboards, stat-card rows, and lists. `stagger` is in seconds.
 */
export function Stagger({
  children,
  stagger = STAGGER,
  className,
  style,
  ...props
}: DivProps & { stagger?: number }) {
  return (
    <div
      className={cn("pb-stagger", className)}
      style={{ ...style, ["--pb-stagger" as string]: `${stagger * 1000}ms` }}
      {...props}
    >
      {children}
    </div>
  )
}

export function StaggerItem({ children, y = 10, className, style, ...props }: DivProps & { y?: number }) {
  return (
    <div
      className={cn("pb-stagger-item", className)}
      style={{ ...style, ["--pb-y" as string]: `${y}px` }}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Wraps a list so items animate in/out and smoothly reflow when reordered or
 * removed. Children MUST be {@link AnimatedListItem}s (or any element with a
 * stable `key` + `layout`). Great for tables/lists with optimistic mutations.
 */
export function AnimatedList({ children, ...props }: React.ComponentProps<"div">) {
  return (
    <div {...props}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  )
}

export function AnimatedListItem({ children, ...props }: DivMotionProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Tactile press wrapper: subtle scale on hover/tap. Render as a different
 * element with `as` when wrapping buttons/cards.
 */
export function Pressable({
  children,
  className,
  ...props
}: DivMotionProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={SPRING}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Route-level enter transition. Wrap a page's content; combine with the global
 * NProgress bar for navigation feedback. Keyed by pathname at the call site to
 * re-trigger on navigation. CSS-only, so the page is visible before hydration.
 */
export function PageTransition({ children, className, ...props }: DivProps) {
  return (
    <div className={cn("pb-page-enter", className)} {...props}>
      {children}
    </div>
  )
}

export { motion, AnimatePresence }
