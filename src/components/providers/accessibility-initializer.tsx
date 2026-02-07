"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useAccessibility } from "./accessibility-provider"
import { trpc } from "@/trpc/client"

/**
 * Component to sync accessibility preferences from user settings
 * This ensures accessibility preferences from database are applied
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
  
  const { data: userProfile } = trpc.users.getProfile.useQuery(undefined, {
    enabled: mounted && !isAuthPage, // Only fetch on non-auth pages
    retry: false,
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Load accessibility preferences from user profile
  React.useEffect(() => {
    if (!mounted || isAuthPage || !userProfile) return
    
    const user = userProfile as unknown as { user?: { preferences?: unknown } }
    if (!user?.user?.preferences) return

    const preferences = user.user.preferences as Record<string, unknown>
    if (preferences?.accessibility) {
      updatePreferences(preferences.accessibility)
    }
  }, [mounted, isAuthPage, userProfile, updatePreferences])

  return null
}

