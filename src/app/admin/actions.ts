"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { serverTrpc } from "@/trpc/server-caller"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function logoutAction() {
  try {
    const trpc = await serverTrpc()
    await trpc.auth.logout()
    
    // Get subdomain and host from headers to construct correct redirect URL
    const headersList = await headers()
    const subdomain = headersList.get("x-subdomain")
    const host = headersList.get("host") || "localhost:3000"
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
    
    // Redirect based on subdomain:
    // - If subdomain exists → redirect to subdomain login URL (use absolute URL to preserve subdomain)
    // - If no subdomain (main domain) → redirect to /register (middleware blocks /login on main domain)
    if (subdomain) {
      // Construct absolute URL using the current host (which already includes subdomain)
      // This ensures the redirect preserves the subdomain context
      const loginUrl = `${protocol}://${host}/login`
      setImmediate(() => {
        redirect(loginUrl)
      })
    } else {
      setImmediate(() => {
        redirect("/register")
      })
    }
  } catch (error: unknown) {
    // Re-throw redirect errors
    if (isRedirectError(error)) {
      throw error
    }
    
    // For logout, we still redirect even on error
    // Try to get subdomain for correct redirect
    try {
      const headersList = await headers()
      const subdomain = headersList.get("x-subdomain")
      const host = headersList.get("host") || "localhost:3000"
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
      
      if (subdomain) {
        const loginUrl = `${protocol}://${host}/login`
        setImmediate(() => {
          redirect(loginUrl)
        })
      } else {
        setImmediate(() => {
          redirect("/register")
        })
      }
    } catch {
      // Fallback to register if we can't determine subdomain
      setImmediate(() => {
        redirect("/register")
      })
    }
  }
}

/**
 * @deprecated Use getCurrentUser from @/lib/current-user instead
 * This function is kept for backward compatibility
 */
export async function getUserData() {
  try {
    const trpc = await serverTrpc();
    const { user, session, shouldVerifyMfa } = await trpc.auth.getCurrentUser();
    
    if (shouldVerifyMfa === true) {
      redirect("/mfa-verify");
    }

    // Company validation is handled in tRPC context and login procedure
    // No additional checks needed here as user is already validated

    return {
      ...user,
      ...session,
      mfaSecret: undefined, // Hide MFA secret
    }
  } catch (error: unknown) {
    // Re-throw redirect errors
    if (isRedirectError(error)) {
      throw error
    }

    // If not authenticated or user not found, redirect to login
    redirect("/login")
  }
}
