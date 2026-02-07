"use client"

import { useCurrentUser } from "./use-current-user"

/**
 * Hook to get current user's permissions
 * Uses the useCurrentUser hook to avoid making a separate API call
 * Permissions are already included in the getCurrentUser response
 */
export function usePermissions() {
  const { permissions, isLoading } = useCurrentUser()

  const hasPermission = (permissionKey: string) => {
    return permissions.includes(permissionKey)
  }

  const hasAnyPermission = (permissionKeys: string[]) => {
    return permissionKeys.some((key) => permissions.includes(key))
  }

  const hasAllPermissions = (permissionKeys: string[]) => {
    return permissionKeys.every((key) => permissions.includes(key))
  }

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
  }
}

