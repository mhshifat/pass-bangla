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
    return {
      error: error instanceof Error ? error.message : "Failed to send email",
      correlationId,
    }
  }
}
