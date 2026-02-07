"use server"

import { redirect } from "next/navigation"
import { serverTrpc } from "@/trpc/server-caller"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, formatErrorWithCorrelationId } from "@/lib/correlation-id-util"

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

export async function loginAction(
  prevState: LoginActionResult,
  formData: FormData
): Promise<LoginActionResult> {
  const correlationId = generateCorrelationId();
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const captchaToken = formData.get("captchaToken") as string | null
  const captchaAnswer = formData.get("captchaAnswer") ? parseInt(formData.get("captchaAnswer") as string, 10) : undefined

  try {
    const trpc = await serverTrpc()
    const { mfaRequired, mfaSetupRequired } = await trpc.auth.login({ 
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
      email,
    });
    
    // Handle tRPC errors
    if (error instanceof TRPCError) {
      // Handle CAPTCHA requirement
      if (error.code === "PRECONDITION_FAILED" && error.cause && typeof error.cause === "object" && "requiresCaptcha" in error.cause) {
        const cause = error.cause as { requiresCaptcha: boolean; captchaToken?: string; captchaQuestion?: string; correlationId?: string }
        return {
          error: error.message,
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
            error: error.message,
            correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId,
          }
        }
      }

      // For other tRPC errors, return the message with correlation ID
      return {
        error: error.message,
        correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId,
      }
    }
    
    const message = error instanceof Error ? error.message : "Invalid email or password"
    return { 
      error: formatErrorWithCorrelationId(message, correlationId), 
      correlationId 
    }
  }
}
