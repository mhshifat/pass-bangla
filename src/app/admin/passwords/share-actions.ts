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


export async function sharePasswordWithTeamAction(
  passwordId: string,
  prevState: { error?: string; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const teamId = formData.get("teamId") as string
  const expiresAt = formData.get("expiresAt") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.teams.sharePasswordWithTeam({
      passwordId,
      teamId,
      expiresAt: expiresAt || undefined,
    })

    revalidatePath("/admin/passwords")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "sharePasswordWithTeamAction", passwordId, teamId })
    if (error instanceof TRPCError) {
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to share password with team"
    return { error: message, correlationId }
  }
}

