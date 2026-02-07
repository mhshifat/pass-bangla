"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { revalidatePath } from "next/cache"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function setupMfaAction(_prevState: unknown, formData: FormData) {
  const correlationId = generateCorrelationId()
  const code = formData.get("code") as string
  try {
    const trpc = await serverTrpc()
    await trpc.auth.setupMfa({ code });
    revalidatePath("/admin");
    return { success: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    logError(correlationId, err, { action: "setupMfa" })
    const fallbackMessage = "MFA setup failed"
    const message = err instanceof Error ? err.message : fallbackMessage
    const safeMessage = sanitizeClientErrorMessage(message, fallbackMessage)
    return { success: false, error: safeMessage, correlationId }
  }
}
