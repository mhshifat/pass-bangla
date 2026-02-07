"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function updateEmailConfigAction(
  _prevState: unknown,
  formData: FormData
): Promise<{
  success?: boolean
  error?: string
  correlationId?: string
}> {
  const correlationId = generateCorrelationId()
  try {
    const smtp_host = formData.get("smtp_host") as string
    const smtp_port = formData.get("smtp_port") as string
    const smtp_secure = formData.get("smtp_secure") === "true"
    const smtp_user = (formData.get("smtp_user") as string) || undefined
    const smtp_password = (formData.get("smtp_password") as string) || undefined
    const smtp_from_email = formData.get("smtp_from_email") as string
    const smtp_from_name = formData.get("smtp_from_name") as string

    if (!smtp_host || !smtp_port || !smtp_from_email) {
      return { error: "Host, port, and from email are required", correlationId }
    }

    const caller = await serverTrpc()
    await caller.settings.updateEmailConfig({
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
    })

    revalidatePath("/admin/settings")
    return { success: true, correlationId }
  } catch (error) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateEmailConfigAction" })
    const fallbackMessage = "Failed to update email configuration"
    const message = error instanceof Error ? error.message : fallbackMessage
    return {
      error: sanitizeClientErrorMessage(message, fallbackMessage),
      correlationId,
    }
  }
}

export async function testEmailConfigAction(
  testEmail: string
): Promise<{
  success?: boolean
  error?: string
  correlationId?: string
}> {
  const correlationId = generateCorrelationId()
  try {
    if (!testEmail) {
      return { error: "Email address is required", correlationId }
    }

    const caller = await serverTrpc()
    await caller.settings.testEmailConfig({ testEmail })

    return { success: true, correlationId }
  } catch (error) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "testEmailConfigAction", testEmail })
    const fallbackMessage = "Failed to send test email"
    const message = error instanceof Error ? error.message : fallbackMessage
    return {
      error: sanitizeClientErrorMessage(message, fallbackMessage),
      correlationId,
    }
  }
}
