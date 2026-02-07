"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function addTeamMemberAction(teamId: string, userId: string, role: "MANAGER" | "MEMBER") {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.addMember({
      teamId,
      userId,
      role,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "addTeamMemberAction", teamId, userId })
    if (error instanceof TRPCError) {
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to add team member"
    return { error: message, correlationId }
  }
}

export async function removeTeamMemberAction(teamId: string, userId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.removeMember({
      teamId,
      userId,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "removeTeamMemberAction", teamId, userId })
    if (error instanceof TRPCError) {
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to remove team member"
    return { error: message, correlationId }
  }
}

export async function updateTeamMemberRoleAction(
  teamId: string,
  userId: string,
  role: "MANAGER" | "MEMBER"
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.updateMemberRole({
      teamId,
      userId,
      role,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTeamMemberRoleAction", teamId, userId })
    if (error instanceof TRPCError) {
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update member role"
    return { error: message, correlationId }
  }
}

