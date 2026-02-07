"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export interface DuplicateResolutionOptions {
  action: "delete" | "merge"
  passwordIds: string[]
  keepPasswordId?: string
}

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function findDuplicatesAction(threshold?: number) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    return await trpc.passwords.findDuplicates({ threshold })
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "findDuplicatesAction", threshold })
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to find duplicates (ID: ${correlationId})`)
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
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to find reused passwords (ID: ${correlationId})`)
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
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to find similar passwords (ID: ${correlationId})`)
  }
}

export async function bulkResolveDuplicatesAction(
  options: DuplicateResolutionOptions
): Promise<{ success: boolean; deleted?: number; merged?: number; keptPasswordId?: string; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkResolveDuplicates(options)
    revalidatePath("/admin/passwords")
    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkResolveDuplicatesAction", options })
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to resolve duplicates (ID: ${correlationId})`)
  }
}
