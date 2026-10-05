"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useAccessibility } from "./accessibility-provider"
import { trpc } from "@/trpc/client"

/**
 * Component to sync accessibility preferences from user settings
 * Uses a lightweight API endpoint to fetch only accessibility preferences
 * Only runs inside the signed-in app; everywhere else AccessibilityProvider already
 * applies the preferences stored in localStorage, so anonymous visitors never hit the API.
 */
export function AccessibilityInitializer() {
  const { updatePreferences } = useAccessibility()
  const pathname = usePathname()
  const [mounted, setMounted] = React.useState(false)

  const isAppPage = pathname?.startsWith("/admin") ?? false

  const { data: accessibilityData } = trpc.users.getAccessibilityPreferences.useQuery(undefined, {
    enabled: mounted && isAppPage,
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Load accessibility preferences from user profile
  React.useEffect(() => {
    if (!mounted || !isAppPage || !accessibilityData) return

    if (accessibilityData.accessibility) {
      updatePreferences(accessibilityData.accessibility)
    }
  }, [mounted, isAppPage, accessibilityData, updatePreferences])

  return null
}
