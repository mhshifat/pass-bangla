"use server"

import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { revalidatePath } from "next/cache"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type FieldErrors = {
  [key: string]: string
}

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function sharePasswordWithTeamFormAction(
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const passwordId = formData.get("passwordId") as string
  const teamId = formData.get("teamId") as string
  const expiresAt = formData.get("expiresAt") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.teams.sharePasswordWithTeam({
      passwordId,
      teamId,
      expiresAt: expiresAt || undefined,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "sharePasswordWithTeamFormAction", passwordId, teamId })
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
          return { error: `${error.message} (ID: ${correlationId})`, correlationId }
        }
      }

      return { error: `${error.message} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to share password with team"
    return { error: `${message} (ID: ${correlationId})`, correlationId }
  }
}

export async function createPasswordAndShareAction(
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; passwordId?: string; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("name") as string
  const username = formData.get("username") as string
  const password = formData.get("password") as string
  const url = formData.get("url") as string
  const folderId = formData.get("folderId") as string
  const notes = formData.get("notes") as string
  const totpSecret = formData.get("totpSecret") as string
  const teamId = formData.get("teamId") as string
  const expiresAt = formData.get("expiresAt") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    
    // Create password
    const { password: newPassword } = await trpc.passwords.create({
      name,
      username,
      password,
      url: url || null,
      folderId: folderId || null,
      notes: notes || null,
      totpSecret: totpSecret || null,
    })

    // Share with team
    await trpc.teams.sharePasswordWithTeam({
      passwordId: newPassword.id,
      teamId,
      expiresAt: expiresAt || undefined,
    })

    revalidatePath("/admin/teams")
    return { success: true, passwordId: newPassword.id, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createPasswordAndShareAction", teamId })
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
          return { error: `${error.message} (ID: ${correlationId})`, correlationId }
        }
      }

      return { error: `${error.message} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to create and share password"
    return { error: `${message} (ID: ${correlationId})`, correlationId }
  }
}

