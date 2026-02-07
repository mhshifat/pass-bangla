"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function sharePasswordWithTeamAction(
  passwordId: string,
  teamId: string,
  expiresAt?: string
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.sharePasswordWithTeam({
      passwordId,
      teamId,
      expiresAt,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "sharePasswordWithTeamAction", passwordId, teamId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to share password with team")
      return { error: safeMessage, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to share password with team"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to share password with team")
    return { error: safeMessage, correlationId }
  }
}

export async function updateTeamPasswordShareAction(
  shareId: string,
  expiresAt?: string | null
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.updateTeamPasswordShare({
      shareId,
      expiresAt,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTeamPasswordShareAction", shareId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to update password share")
      return { error: safeMessage, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update password share"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to update password share")
    return { error: safeMessage, correlationId }
  }
}

export async function removeTeamPasswordShareAction(shareId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.removeTeamPasswordShare({
      shareId,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "removeTeamPasswordShareAction", shareId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to remove password share")
      return { error: safeMessage, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to remove password share"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to remove password share")
    return { error: safeMessage, correlationId }
  }
}

