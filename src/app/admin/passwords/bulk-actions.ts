"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export interface BulkDeleteOptions {
  passwordIds: string[]
}

export interface BulkMoveOptions {
  passwordIds: string[]
  folderId: string | null
}

export interface BulkTagOptions {
  passwordIds: string[]
  tagIds: string[]
}

export interface BulkShareOptions {
  passwordIds: string[]
  teamId: string
  expiresAt?: string
}

export interface BulkUnshareOptions {
  passwordIds: string[]
  teamId?: string
}

export interface BulkStrengthOptions {
  passwordIds: string[]
  strength: "WEAK" | "MEDIUM" | "STRONG"
}

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function bulkDeletePasswordsAction(
  options: BulkDeleteOptions
): Promise<{ success: boolean; deleted: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkDelete(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkDeletePasswordsAction", options })
    const fallbackMessage = "Failed to delete passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkMovePasswordsAction(
  options: BulkMoveOptions
): Promise<{ success: boolean; updated: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkMoveToFolder(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkMovePasswordsAction", options })
    const fallbackMessage = "Failed to move passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkAssignTagsAction(
  options: BulkTagOptions
): Promise<{ success: boolean; updated: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkAssignTags(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkAssignTagsAction", options })
    const fallbackMessage = "Failed to assign tags"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkRemoveTagsAction(
  options: BulkTagOptions
): Promise<{ success: boolean; removed: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkRemoveTags({
      passwordIds: options.passwordIds,
      tagIds: options.tagIds,
    })
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkRemoveTagsAction", options })
    const fallbackMessage = "Failed to remove tags"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkSharePasswordsAction(
  options: BulkShareOptions
): Promise<{ success: boolean; shared: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkShare(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkSharePasswordsAction", options })
    const fallbackMessage = "Failed to share passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkUnsharePasswordsAction(
  options: BulkUnshareOptions
): Promise<{ success: boolean; unshared: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkUnshare(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkUnsharePasswordsAction", options })
    const fallbackMessage = "Failed to unshare passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}

export async function bulkUpdateStrengthAction(
  options: BulkStrengthOptions
): Promise<{ success: boolean; updated: number; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.bulkUpdateStrength(options)
    revalidatePath("/admin/passwords")
    return { ...result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "bulkUpdateStrengthAction", options })
    const fallbackMessage = "Failed to update password strength"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}
