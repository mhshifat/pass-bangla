"use server"

import { redirect } from "next/navigation"
import { serverTrpc } from "@/trpc/server-caller"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, formatErrorWithCorrelationId, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { headers } from "next/headers"

type FieldErrors = {
  [key: string]: string
}

type ErrorWithCause = Error & {
  cause?: {
    correlationId?: string
  } & Record<string, unknown>
}

type LoginActionResult = {
  error?: string
  correlationId?: string
  fieldErrors?: FieldErrors
  requiresCaptcha?: boolean
  captchaToken?: string
  captchaQuestion?: string
} | null

type CompanyVerifyResult = {
  error?: string
  correlationId?: string
  fieldErrors?: FieldErrors
} | null

/**
 * Action for main domain - verify company exists and redirect to subdomain login
 */
export async function verifyCompanyAction(
  prevState: CompanyVerifyResult,
  formData: FormData
): Promise<CompanyVerifyResult> {
  const correlationId = generateCorrelationId()
  const company = formData.get("company") as string | null

  if (!company || company.trim() === "") {
    return {
      error: "Please enter your company name",
      correlationId,
      fieldErrors: { company: "Company name is required" },
    }
  }

  try {
    const trpc = await serverTrpc()
    const result = await trpc.auth.verifyCompany({ company: company.trim() })

    if (!result.exists || !result.subdomain) {
      return {
        error: "Company not found. Please check your company name and try again.",
        correlationId,
        fieldErrors: { company: "Company not found" },
      }
    }

    // Get current host to construct subdomain URL
    const headersList = await headers()
    const host = headersList.get("host") || "localhost:3000"
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http"

    // Extract base domain
    const hostWithoutPort = host.split(":")[0]
    const port = host.includes(":") ? `:${host.split(":")[1]}` : ""

    let baseDomain: string
    if (hostWithoutPort.includes("localhost")) {
      baseDomain = "localhost"
    } else {
      const parts = hostWithoutPort.split(".")
      baseDomain = parts.length > 2 ? parts.slice(-2).join(".") : hostWithoutPort
    }

    // Redirect to subdomain login
    const subdomainLoginUrl = `${protocol}://${result.subdomain}.${baseDomain}${port}/login`
    redirect(subdomainLoginUrl)
  } catch (error: unknown) {
    if (isRedirectError(error)) {
      throw error
    }

    logError(correlationId, error, {
      action: "verifyCompany",
      company: company || "none",
    })

    if (error instanceof TRPCError) {
      const fallbackMessage = "Company not found"
      const safeErrorMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      return {
        error: safeErrorMessage,
        correlationId,
      }
    }

    return {
      error: "Unable to verify company. Please try again.",
      correlationId,
    }
  }
}

/**
 * Action for subdomain - login with email/password
 */

export async function loginAction(
  prevState: LoginActionResult,
  formData: FormData
): Promise<LoginActionResult> {
  const correlationId = generateCorrelationId();
  const company = formData.get("company") as string | null
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const captchaToken = formData.get("captchaToken") as string | null
  const captchaAnswer = formData.get("captchaAnswer") ? parseInt(formData.get("captchaAnswer") as string, 10) : undefined

  try {
    const trpc = await serverTrpc()
    const { mfaRequired, mfaSetupRequired } = await trpc.auth.login({
      company: company || undefined,
      email, 
      password,
      captchaToken: captchaToken || undefined,
      captchaAnswer,
    })
    if (mfaSetupRequired) {
      redirect("/mfa-setup")
    } else if (mfaRequired) {
      redirect("/mfa-verify")
    } else {
      redirect("/admin")
    }
  } catch (error: unknown) {
    // Re-throw redirect errors
    if (isRedirectError(error)) {
      throw error
    }
    
    // Log error with correlation ID
    logError(correlationId, error, {
      action: "login",
      company: company || "none",
      email,
    });
    
    // Handle tRPC errors
    if (error instanceof TRPCError) {
      const fallbackMessage = "Invalid email or password"
      const safeErrorMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      // Handle CAPTCHA requirement
      if (error.code === "PRECONDITION_FAILED" && error.cause && typeof error.cause === "object" && "requiresCaptcha" in error.cause) {
        const cause = error.cause as { requiresCaptcha: boolean; captchaToken?: string; captchaQuestion?: string; correlationId?: string }
        return {
          error: safeErrorMessage,
          correlationId: cause.correlationId || correlationId,
          requiresCaptcha: true,
          captchaToken: cause.captchaToken,
          captchaQuestion: cause.captchaQuestion,
        }
      }
      
      // Check if it's a validation error
      if (error.code === "BAD_REQUEST") {
        try {
          const zodErrors = JSON.parse(error.message)
          const fieldErrors: FieldErrors = {}
          
          for (const err of zodErrors) {
            if (err.path && err.path.length > 0) {
              const fieldName = err.path[0]
              fieldErrors[fieldName] = err.message
            }
          }
          
          if (Object.keys(fieldErrors).length > 0) {
            return { fieldErrors, correlationId }
          }
        } catch {
          // If parsing fails, return the message as a root error
          return {
            error: safeErrorMessage,
            correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId,
          }
        }
      }

      // For other tRPC errors, return the message with correlation ID
      return {
        error: safeErrorMessage,
        correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId,
      }
    }
    
    const fallbackMessage = "Invalid email or password"
    const message = error instanceof Error ? error.message : fallbackMessage
    const safeMessage = sanitizeClientErrorMessage(message, fallbackMessage)
    return { 
      error: formatErrorWithCorrelationId(safeMessage, correlationId), 
      correlationId,
    }
  }
}
