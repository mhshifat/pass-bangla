"use client"

import * as React from "react"
import { motion, AnimatePresence, type HTMLMotionProps } from "motion/react"
import { DURATION, EASE, SPRING, STAGGER } from "./constants"

/**
 * Reusable motion primitives shared across the app. All of them respect reduced
 * motion automatically via the app-level {@link MotionProvider} (MotionConfig),
 * which collapses transform/position animations to opacity-only — so callers
 * never need to special-case accessibility.
 */

type DivMotionProps = HTMLMotionProps<"div">

/** Fade + small rise on mount. Use for sections, cards, panels. */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  ...props
}: DivMotionProps & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE.out, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Container that staggers its {@link StaggerItem} children into view. Pair the
 * two for dashboards, stat-card rows, and lists.
 */
export function Stagger({
  children,
  stagger = STAGGER,
  ...props
}: DivMotionProps & { stagger?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, y = 10, ...props }: DivMotionProps & { y?: number }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
      }}
      {...props}
    >
      {children}
    </motion.div>
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
 * re-trigger on navigation.
 */
export function PageTransition({ children, ...props }: DivMotionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export { motion, AnimatePresence }
