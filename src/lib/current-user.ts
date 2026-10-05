import { cache } from "react"
import { getCurrentUserData } from "@/trpc/server-caller"

/**
 * Server-side utility to get current logged-in user information
 * Uses SSR with React cache for optimal performance
 * 
 * @example
 * ```tsx
 * // In a Server Component
 * export default async function MyPage() {
 *   const { user, session } = await getCurrentUser()
 *   
 *   if (!user) {
 *     redirect("/login")
 *   }
 *   
 *   return <div>Hello, {user.name}!</div>
 * }
 * ```
 */
export const getCurrentUser = cache(async () => {
  try {
    // Shared with prefetchCurrentUser(), so the procedure runs once per request
    const data = await getCurrentUserData()
    return {
      user: data.user,
      session: data.session,
      shouldVerifyMfa: data.shouldVerifyMfa,
      isAuthenticated: true,
    }
  } catch (error) {
    return {
      user: null,
      session: null,
      shouldVerifyMfa: false,
      isAuthenticated: false,
    }
  }
})

/**
 * Server-side utility to get current user or redirect to login
 * Throws redirect if user is not authenticated
 * 
 * @example
 * ```tsx
 * // In a Server Component
 * export default async function ProtectedPage() {
 *   const { user, session } = await requireCurrentUser()
 *   
 *   // User is guaranteed to be authenticated here
 *   return <div>Hello, {user.name}!</div>
 * }
 * ```
 */
export async function requireCurrentUser() {
  const data = await getCurrentUser()
  
  if (!data.isAuthenticated || !data.user) {
    const { redirect } = await import("next/navigation")
    redirect("/login")
  }
  
  return {
    user: data.user,
    session: data.session!,
    shouldVerifyMfa: data.shouldVerifyMfa,
  }
}

