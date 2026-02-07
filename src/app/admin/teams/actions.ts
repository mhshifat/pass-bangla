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


export async function createTeamAction(
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("name") as string
  const description = formData.get("description") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.teams.create({
      name,
      description: description || undefined,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createTeamAction", name })
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
          return { error: `${error.message} (ID: ${correlationId})`, correlationId }
        }
      }

      // For other tRPC errors, return the message
      return { error: `${error.message} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to create team"
    return { error: `${message} (ID: ${correlationId})`, correlationId }
  }
}

export async function updateTeamAction(
  teamId: string,
  prevState: { error?: string; fieldErrors?: FieldErrors; success?: boolean; correlationId?: string } | null,
  formData: FormData
) {
  const name = formData.get("name") as string
  const description = formData.get("description") as string
  const correlationId = generateCorrelationId()

  try {
    const trpc = await serverTrpc()
    await trpc.teams.update({
      id: teamId,
      name,
      description: description || undefined,
    })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTeamAction", teamId })
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
          return { error: `${error.message} (ID: ${correlationId})`, correlationId }
        }
      }

      // For other tRPC errors, return the message
      return { error: `${error.message} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to update team"
    return { error: `${message} (ID: ${correlationId})`, correlationId }
  }
}

export async function deleteTeamAction(teamId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.teams.delete({ id: teamId })

    revalidatePath("/admin/teams")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deleteTeamAction", teamId })
    if (error instanceof TRPCError) {
      return { error: `${error.message} (ID: ${correlationId})`, correlationId }
    }

    const message = error instanceof Error ? error.message : "Failed to delete team"
    return { error: `${message} (ID: ${correlationId})`, correlationId }
  }
}

