"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"

type FieldErrors = {
  [key: string]: string
}

type ActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: FieldErrors;
  success?: boolean;
} | { success: true };

export async function createPasswordAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const correlationId = generateCorrelationId()
  const name = formData.get("name") as string
  const username = formData.get("username") as string
  const password = formData.get("password") as string
  const url = formData.get("url") as string
  const folderId = formData.get("folderId") as string
  const notes = formData.get("notes") as string
  const totpSecret = formData.get("totpSecret") as string
  const tagIds = formData.getAll("tagIds") as string[]

  try {
    const trpc = await serverTrpc()
    await trpc.passwords.create({
      name,
      username,
      password,
      url: url || null,
      folderId: folderId || null,
      notes: notes || null,
      totpSecret: totpSecret || null,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
    })

    revalidatePath("/admin/passwords")
    return { success: true }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createPassword" })
    
    if (error instanceof TRPCError) {
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
          return { error: error.message, correlationId }
        }
      }

      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to create password"
    return { error: message, correlationId }
  }
}

export async function updatePasswordAction(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const correlationId = generateCorrelationId()
  const passwordId = formData.get("passwordId") as string
  const name = formData.get("name") as string
  const username = formData.get("username") as string
  const password = formData.get("password") as string
  const url = formData.get("url") as string
  const folderId = formData.get("folderId") as string
  const notes = formData.get("notes") as string
  const totpSecret = formData.get("totpSecret") as string
  const tagIds = formData.getAll("tagIds") as string[]

  try {
    const trpc = await serverTrpc()
    await trpc.passwords.update({
      id: passwordId,
      name,
      username,
      password,
      url: url || null,
      folderId: folderId || null,
      notes: notes || null,
      totpSecret: totpSecret || null,
      tagIds: tagIds.length > 0 ? tagIds : [],
    })

    revalidatePath("/admin/passwords")
    return { success: true }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updatePassword" })
    
    if (error instanceof TRPCError) {
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
          return { error: error.message, correlationId }
        }
      }

      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update password"
    return { error: message, correlationId }
  }
}

export async function deletePasswordAction(passwordId: string): Promise<ActionResult> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.passwords.delete({ id: passwordId })

    revalidatePath("/admin/passwords")
    return { success: true }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deletePassword" })
    
    if (error instanceof TRPCError) {
      return { error: error.message, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to delete password"
    return { error: message, correlationId }
  }
}

