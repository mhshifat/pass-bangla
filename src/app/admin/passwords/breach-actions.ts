"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function checkPasswordBreachAction(passwordId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    return await trpc.passwords.checkPasswordBreach({ passwordId })
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "checkPasswordBreach", passwordId })
    const fallbackMessage = "Failed to check password breach"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(safeMessage)
    }
    throw new Error(fallbackMessage)
  }
}

export async function checkAllPasswordsBreachAction() {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.checkAllPasswordsBreach()
    revalidatePath("/admin/passwords")
    revalidatePath("/admin/passwords/breaches")
    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "checkAllPasswordsBreach" })
    const fallbackMessage = "Failed to check all passwords for breaches"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(safeMessage)
    }
    throw new Error(fallbackMessage)
  }
}

export async function resolveBreachAction(breachId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.resolveBreach({ breachId })
    revalidatePath("/admin/passwords/breaches")
    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "resolveBreach", breachId })
    const fallbackMessage = "Failed to resolve breach"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(safeMessage)
    }
    throw new Error(fallbackMessage)
  }
}
