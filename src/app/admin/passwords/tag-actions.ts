"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function createTagAction(data: {
  name: string
  color?: string | null
  icon?: string | null
}) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.createTag(data)
    revalidatePath("/admin/passwords/tags")
    revalidatePath("/admin/passwords")
    return { success: true, tag: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createTagAction", data })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to create tag", correlationId }
  }
}

export async function updateTagAction(
  id: string,
  data: {
    name?: string
    color?: string | null
    icon?: string | null
  }
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.updateTag({ id, ...data })
    revalidatePath("/admin/passwords/tags")
    revalidatePath("/admin/passwords")
    return { success: true, tag: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateTagAction", id, data })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to update tag", correlationId }
  }
}

export async function deleteTagAction(id: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.passwords.deleteTag({ id })
    revalidatePath("/admin/passwords/tags")
    revalidatePath("/admin/passwords")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deleteTagAction", id })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to delete tag", correlationId }
  }
}
