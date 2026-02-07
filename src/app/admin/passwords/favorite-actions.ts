"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function toggleFavoriteAction(passwordId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.toggleFavorite({ passwordId })
    revalidatePath("/admin/passwords")
    revalidatePath("/admin/passwords/favorites")
    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "toggleFavoriteAction", passwordId })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to toggle favorite", correlationId }
  }
}
