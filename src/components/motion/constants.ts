/**
 * Centralized motion tokens.
 *
 * Durations and easings live in one place so every animated surface feels like
 * the same product. Kept within the perf budget: UI feedback is <= ~250ms and
 * uses transform/opacity only. See the design plan's "fast beats flashy".
 */

/** Durations in seconds (Framer Motion uses seconds). */
export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const

/** Shared easing curves. */
export const EASE = {
  /** Standard ease-out for entrances. */
  out: [0.16, 1, 0.3, 1] as const,
  /** Symmetric ease for moves. */
  inOut: [0.65, 0, 0.35, 1] as const,
}

/** A gentle spring for layout/press interactions. */
export const SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
}

/** Default stagger between children in a list/section reveal. */
export const STAGGER = 0.05
