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
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update permissions"
    return { error: message, correlationId }
  }
}

