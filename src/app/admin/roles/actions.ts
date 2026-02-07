"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type FieldErrors = {
  [key: string]: string
}

export async function createRoleAction(
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("role-name") as string
  const description = formData.get("role-description") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.roles.create({
      name,
      description: description || undefined,
    })

    revalidatePath("/admin/roles")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createRoleAction", name })
    const fallbackMessage = "Failed to create role"
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

export async function updateRoleAction(
  roleId: string,
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("role-name") as string
  const description = formData.get("role-description") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.roles.update({
      id: roleId,
      name,
      // Always pass description (even if empty string) so we can clear it
      description: description,
    })

    revalidatePath("/admin/roles")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateRoleAction", roleId })
    const fallbackMessage = "Failed to update role"
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

export async function deleteRoleAction(roleId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.roles.delete({ id: roleId })

    revalidatePath("/admin/roles")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deleteRoleAction", roleId })
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, "Failed to delete role")
      return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to delete role"
    const safeMessage = sanitizeClientErrorMessage(message, "Failed to delete role")
    return { error: `${safeMessage} (ID: ${correlationId})`, correlationId }
  }
}

