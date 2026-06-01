"use client"

import { MotionConfig } from "motion/react"
import { useReducedMotion } from "./use-reduced-motion"

/**
 * App-wide motion configuration.
 *
 * Wraps the tree in Framer Motion's {@link MotionConfig}. When the user has
 * reduced motion enabled (OS setting or the in-app accessibility toggle), we set
 * `reducedMotion="always"` so every `motion` component drops transform/position
 * animations and keeps only opacity — matching the global `.reduced-motion` CSS
 * rule. Otherwise we defer to the user's OS setting.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      {children}
    </MotionConfig>
  )
}
