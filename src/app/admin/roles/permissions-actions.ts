"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[]
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.roles.updatePermissions({
      roleId,
      permissionIds,
    })

    revalidatePath("/admin/roles")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateRolePermissionsAction", roleId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to update permissions")
      return { error: safeMessage, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update permissions"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to update permissions")
    return { error: safeMessage, correlationId }
  }
}

