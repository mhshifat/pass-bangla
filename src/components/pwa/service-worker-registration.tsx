"use client"

import * as React from "react"

// The browser already re-checks /sw.js on navigation; this is only for long-lived tabs
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return

    let registration: ServiceWorkerRegistration | undefined
    let lastCheck = Date.now()

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !registration) return
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      registration.update().catch(() => {})
    }

    // Register after the page has settled so it never competes with first-load work
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registration = reg
          document.addEventListener("visibilitychange", onVisibilityChange)
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error)
        })
    }

    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register, { once: true })
    }

    return () => {
      window.removeEventListener("load", register)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return null
}
