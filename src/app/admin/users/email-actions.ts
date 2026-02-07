"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function sendEmailAction(
  _prevState: unknown,
  formData: FormData
): Promise<{
  success?: boolean
  error?: string
  correlationId?: string
}> {
  const correlationId = generateCorrelationId()
  try {
    const userId = formData.get("userId") as string
    const subject = formData.get("subject") as string
    const message = formData.get("message") as string

    if (!userId || !subject || !message) {
      return { error: "Missing required fields", correlationId }
    }

    const caller = await serverTrpc()
    await caller.users.sendEmail({
      userId,
      subject,
      message,
    })

    revalidatePath("/admin/users")
    return { success: true, correlationId }
  } catch (error) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "sendEmailAction" })
    const fallbackMessage = "Failed to send email"
    const message = error instanceof Error ? error.message : fallbackMessage
    return {
      error: sanitizeClientErrorMessage(message, fallbackMessage),
      correlationId,
    }
  }
}
