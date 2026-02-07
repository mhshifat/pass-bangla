"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useAccessibility } from "./accessibility-provider"
import { trpc } from "@/trpc/client"

/**
 * Component to sync accessibility preferences from user settings
 * Uses a lightweight API endpoint to fetch only accessibility preferences
 * Only runs on authenticated pages (not on auth pages like /register, /login)
 */
export function AccessibilityInitializer() {
  const { updatePreferences } = useAccessibility()
  const pathname = usePathname()
  const [mounted, setMounted] = React.useState(false)
  
  // Check if we're on an auth page - don't fetch user profile on these pages
  const isAuthPage = pathname?.startsWith("/login") || 
                     pathname?.startsWith("/register") || 
                     pathname?.startsWith("/verify-email") ||
                     pathname?.startsWith("/mfa-setup") ||
                     pathname?.startsWith("/mfa-verify")
  
  const { data: accessibilityData } = trpc.users.getAccessibilityPreferences.useQuery(undefined, {
    enabled: mounted && !isAuthPage, // Only fetch on non-auth pages
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Load accessibility preferences from user profile
  React.useEffect(() => {
    if (!mounted || isAuthPage || !accessibilityData) return
    
    if (accessibilityData.accessibility) {
      updatePreferences(accessibilityData.accessibility)
    }
  }, [mounted, isAuthPage, accessibilityData, updatePreferences])

  return null
}

