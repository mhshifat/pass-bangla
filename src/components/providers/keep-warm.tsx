"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

// The database suspends after ~5 minutes without queries; stay comfortably under that
const PING_INTERVAL_MS = 4 * 60 * 1000

// Only the signed-in app and the auth flow need a warm backend; marketing pages never call it
const WARM_PATH_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/mfa-",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/recover-via-questions",
]

/**
 * Keeps the serverless function and database awake while someone has the app open.
 *
 * Pings once as soon as the page loads (so the backend wakes up while the user is
 * still typing their password) and then every few minutes while the tab is visible.
 * Nothing runs when nobody is using the app, so idle time costs no compute.
 */
export function KeepWarm() {
  const pathname = usePathname()
  const enabled = WARM_PATH_PREFIXES.some((prefix) => pathname?.startsWith(prefix))

  useEffect(() => {
    if (!enabled) return

    let lastPing = 0
    const ping = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - lastPing < PING_INTERVAL_MS / 2) return
      lastPing = Date.now()
      fetch("/api/trpc/health.ping", { credentials: "omit", cache: "no-store" }).catch(() => {})
    }

    ping()
    const interval = setInterval(ping, PING_INTERVAL_MS)
    // Coming back to a tab that sat in the background: wake things up right away
    document.addEventListener("visibilitychange", ping)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", ping)
    }
  }, [enabled])

  return null
}
