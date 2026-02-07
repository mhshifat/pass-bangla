"use client"

import { trpc } from "@/trpc/client"

/**
 * Hook to get current logged-in user information
 * Works on the client side using tRPC
 * 
 * When used in layouts that prefetch user data (like admin layout),
 * this hook will use the prefetched data without making an API call.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, session, isLoading, error } = useCurrentUser()
 *   
 *   if (isLoading) return <div>Loading...</div>
 *   if (error) return <div>Not authenticated</div>
 *   
 *   return <div>Hello, {user.name}!</div>
 * }
 * ```
 */
export function useCurrentUser() {
  const { data, isLoading, error } = trpc.auth.getCurrentUser.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  })

  return {
    user: data?.user || null,
    session: data?.session || null,
    shouldVerifyMfa: data?.shouldVerifyMfa || false,
    isLoading,
    isAuthenticated: !!data?.user,
    error: error?.message || null,
    createdById: data?.user?.createdById || null,
  }
}

