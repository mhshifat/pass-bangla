"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"

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
    if (error instanceof TRPCError) {
      throw new Error(error.message)
    }
    throw new Error("Failed to check password breach")
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
    if (error instanceof TRPCError) {
      throw new Error(error.message)
    }
    throw new Error("Failed to check all passwords for breaches")
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
    if (error instanceof TRPCError) {
      throw new Error(error.message)
    }
    throw new Error("Failed to resolve breach")
  }
}
