"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import {
  generateCorrelationId,
  logError,
  sanitizeClientErrorMessage,
} from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function revokeTemporaryShareAction(shareId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.passwords.revokeTemporaryShare({ shareId })
    revalidatePath("/admin/passwords/shares")
    return { success: true as const, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "revokeTemporaryShareAction", shareId })
    const fallbackMessage = "Failed to revoke share link"
    if (error instanceof TRPCError) {
      return {
        error: sanitizeClientErrorMessage(error.message, fallbackMessage),
        correlationId,
      }
    }
    return { error: fallbackMessage, correlationId }
  }
}

export async function updateTemporaryShareAction(input: {
  shareId: string
  expiresAt: Date | null
  maxAccesses: number | null
}) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.passwords.updateTemporaryShare({
      shareId: input.shareId,
      expiresAt: input.expiresAt,
      maxAccesses: input.maxAccesses,
    })
    revalidatePath("/admin/passwords/shares")
    return { success: true as const, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTemporaryShareAction", shareId: input.shareId })
    const fallbackMessage = "Failed to update share link"
    if (error instanceof TRPCError) {
      return {
        error: sanitizeClientErrorMessage(error.message, fallbackMessage),
        correlationId,
      }
    }
    return { error: fallbackMessage, correlationId }
  }
}

export async function removeTeamShareAction(shareId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.removeTeamPasswordShare({ shareId })
    revalidatePath("/admin/passwords/shares")
    return { success: true as const, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "removeTeamShareAction", shareId })
    const fallbackMessage = "Failed to remove team share"
    if (error instanceof TRPCError) {
      return {
        error: sanitizeClientErrorMessage(error.message, fallbackMessage),
        correlationId,
      }
    }
    return { error: fallbackMessage, correlationId }
  }
}

export async function updateTeamShareAction(input: {
  shareId: string
  expiresAt: string | null
}) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.updateTeamPasswordShare({
      shareId: input.shareId,
      expiresAt: input.expiresAt,
    })
    revalidatePath("/admin/passwords/shares")
    return { success: true as const, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTeamShareAction", shareId: input.shareId })
    const fallbackMessage = "Failed to update team share"
    if (error instanceof TRPCError) {
      return {
        error: sanitizeClientErrorMessage(error.message, fallbackMessage),
        correlationId,
      }
    }
    return { error: fallbackMessage, correlationId }
  }
}
