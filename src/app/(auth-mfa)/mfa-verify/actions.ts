"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function verifyMfaAction(
  _prevState: unknown,
  formData: FormData
): Promise<ServerActionResult> {
  const correlationId = generateCorrelationId()
  const code = formData.get("code") as string
  const useRecoveryCode = formData.get("useRecoveryCode") === "true"

  try {
    const trpc = await serverTrpc()

    if (useRecoveryCode) {
      await trpc.auth.verifyRecoveryCode({ code })
    } else {
      await trpc.auth.verifyMfa({ code })
    }

    revalidatePath("/admin")
    return { success: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    logError(correlationId, err, { action: "verifyMfa" })
    const fallbackMessage = "MFA verification failed"
    const message = err instanceof Error ? err.message : fallbackMessage
    const safeMessage = sanitizeClientErrorMessage(message, fallbackMessage)
    return { success: false, error: safeMessage, correlationId }
  }
}
