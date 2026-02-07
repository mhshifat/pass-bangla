"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export interface DuplicateResolutionOptions {
  action: "delete" | "merge"
  passwordIds: string[]
  keepPasswordId?: string
}


export async function findDuplicatesAction(threshold?: number) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    return await trpc.passwords.findDuplicates({ threshold })
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "findDuplicatesAction", threshold })
    const fallbackMessage = "Failed to find duplicates"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function findReusedAction() {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    return await trpc.passwords.findReused()
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "findReusedAction" })
    const fallbackMessage = "Failed to find reused passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function findSimilarAction(threshold?: number) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    return await trpc.passwords.findSimilar({ threshold })
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "findSimilarAction", threshold })
    const fallbackMessage = "Failed to find similar passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkResolveDuplicatesAction(
  options: DuplicateResolutionOptions
): Promise<{ success: boolean; deleted?: number; merged?: number; keptPasswordId?: string; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkResolveDuplicates(options)
    return Object.assign(result, { correlationId })
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkResolveDuplicatesAction", options })
    const fallbackMessage = "Failed to resolve duplicates"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}
