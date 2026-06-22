"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type FieldErrors = {
  [key: string]: string
}

export async function createUserAction(
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; conflict?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const role = (formData.get("role") as string) || "USER"
  const mfaEnabled = formData.get("mfaEnabled") === "true"
  const isActive = formData.get("isActive") === "true"
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.users.create({
      name,
      email,
      password,
      role,
      mfaEnabled,
      isActive,
    })

    revalidatePath("/admin/users")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createUserAction", email })
    const fallbackMessage = "Failed to create user"
    // Handle tRPC errors
    if (error instanceof TRPCError) {
      // Check if it's a validation error
      if (error.code === "BAD_REQUEST") {
        try {
          const zodErrors = JSON.parse(error.message)
          const fieldErrors: FieldErrors = {}

          for (const err of zodErrors) {
            if (err.path && err.path.length > 0) {
              const fieldName = err.path[0]
              fieldErrors[fieldName] = err.message
            }
          }

          if (Object.keys(fieldErrors).length > 0) {
            return { fieldErrors, correlationId }
          }
        } catch {
          // If parsing fails, return the message as a root error
          const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
          return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
        }
      }

      // Email already taken in this company — surface a clean, actionable message.
      if (error.code === "CONFLICT") {
        return {
          error: "A user with this email already exists in your company.",
          conflict: true,
          correlationId,
        }
      }

      // For other tRPC errors, return the message
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : fallbackMessage
    const safeMessage = sanitizeClientErrorMessage(message, fallbackMessage)
    return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
  }
}

export async function updateUserAction(
  userId: string,
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const role = formData.get("role") as string
  const mfaEnabled = formData.get("mfaEnabled") === "true"
  const isActive = formData.get("isActive") === "true"
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.users.update({
      id: userId,
      name,
      email,
      password: password || undefined,
      role,
      mfaEnabled,
      isActive,
    })

    revalidatePath("/admin/users")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateUserAction", userId })
    const fallbackMessage = "Failed to update user"
    // Handle tRPC errors
    if (error instanceof TRPCError) {
      // Check if it's a validation error
      if (error.code === "BAD_REQUEST") {
        try {
          const zodErrors = JSON.parse(error.message)
          const fieldErrors: FieldErrors = {}

          for (const err of zodErrors) {
            if (err.path && err.path.length > 0) {
              const fieldName = err.path[0]
              fieldErrors[fieldName] = err.message
            }
          }

          if (Object.keys(fieldErrors).length > 0) {
            return { fieldErrors, correlationId }
          }
        } catch {
          // If parsing fails, return the message as a root error
          const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
          return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
        }
      }

      // For other tRPC errors, return the message
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : fallbackMessage
    const safeMessage = sanitizeClientErrorMessage(message, fallbackMessage)
    return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
  }
}

export async function deleteUserAction(userId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.users.delete({ id: userId })

    revalidatePath("/admin/users")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deleteUserAction", userId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to delete user")
      return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to delete user"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to delete user")
    return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
  }
}

export async function resetPasswordAction(userId: string, newPassword: string) {
  try {
    const trpc = await serverTrpc()
    await trpc.users.resetPassword({ id: userId, newPassword })

    revalidatePath("/admin/users")
    return { success: true }
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to reset password")
      return { error: safeMessage }
    }

    const message = error instanceof Error ? error.message : "Failed to reset password"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to reset password")
    return { error: safeMessage }
  }
}
