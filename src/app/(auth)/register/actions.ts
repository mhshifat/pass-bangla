"use server"

import { redirect } from "next/navigation"
import { serverTrpc } from "@/trpc/server-caller"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, formatErrorWithCorrelationId } from "@/lib/correlation-id-util"

type FieldErrors = {
  [key: string]: string
}

type RegisterActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: FieldErrors;
} | null;

export async function registerAction(
  prevState: RegisterActionResult,
  formData: FormData
): Promise<RegisterActionResult> {
  const correlationId = generateCorrelationId();
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const companyName = formData.get("companyName") as string

  try {
    const trpc = await serverTrpc()
    const result = await trpc.auth.register({ name, email, password, companyName })
    
    // Redirect to subdomain after successful registration
    if (result.company?.subdomain) {
      // Get the current request host to determine the base domain
      const { headers } = await import("next/headers")
      const headersList = await headers()
      const host = headersList.get("host") || "localhost:3000"
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
      
      // Extract base domain
      // For localhost:3000, keep as is
      // For production, extract domain.tld from host
      let baseDomain = "localhost:3000"
      if (!host.includes("localhost")) {
        const parts = host.split(".")
        if (parts.length >= 2) {
          baseDomain = parts.slice(-2).join(".")
        } else {
          baseDomain = host
        }
      }
      
      const subdomainUrl = `${protocol}://${result.company.subdomain}.${baseDomain}/admin`
      redirect(subdomainUrl)
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
      action: "register",
      email,
      companyName,
    });
    
    // Handle tRPC errors
    if (error instanceof TRPCError) {
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
            correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId 
          }
        }
      }
      
      // For other tRPC errors, return the message with correlation ID
      return {
        error: error.message,
        correlationId: (error as ErrorWithCause).cause?.correlationId || correlationId,
      }
    }
    
    const message = error instanceof Error ? error.message : "Registration failed"
    return { 
      error: formatErrorWithCorrelationId(message, correlationId), 
      correlationId 
    }
  }
}
