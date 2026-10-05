"use server"

import { redirect } from "next/navigation"
import { TRPCError } from "@trpc/server"
import { serverTrpc } from "@/trpc/server-caller"
import { sanitizeClientErrorMessage } from "@/lib/correlation-id-util"

type OAuthSignupActionResult = { error?: string } | null

export async function completeOAuthSignupAction(
  prevState: OAuthSignupActionResult,
  formData: FormData
): Promise<OAuthSignupActionResult> {
  const name = ((formData.get("name") as string) || "").trim()
  const companyName = ((formData.get("companyName") as string) || "").trim()

  let redirectUrl: string
  try {
    const trpc = await serverTrpc()
    const result = await trpc.auth.completeOAuthSignup({ name, companyName })
    redirectUrl = result.redirectUrl
  } catch (error: unknown) {
    const fallback = "Could not create your account. Please try again."
    if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
      // Input validation errors arrive as a JSON list of issues
      try {
        const issues = JSON.parse(error.message) as Array<{ message?: string }>
        if (Array.isArray(issues) && issues[0]?.message) return { error: issues[0].message }
      } catch {
        // Not a validation list — fall through to the plain message
      }
    }
    const message = error instanceof Error ? error.message : fallback
    return { error: sanitizeClientErrorMessage(message, fallback) }
  }

  // The account exists; the session starts on the company's own address
  redirect(redirectUrl)
}
