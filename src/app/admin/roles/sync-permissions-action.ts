"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function syncPermissionsAction(): Promise<{
  success?: boolean
  error?: string
  correlationId?: string
}> {
  const correlationId = generateCorrelationId()
  try {
    const caller = await serverTrpc()
    await caller.settings.syncPermissions()

    revalidatePath("/admin/roles")
    return { success: true, correlationId }
  } catch (error) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "syncPermissionsAction" })
    return {
      error: error instanceof Error ? error.message : "Failed to sync permissions",
      correlationId,
    }
  }
}



