"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export interface ImportPreviewResult {
  passwords: Array<{
    name: string
    username: string
    password: string
    url?: string | null
    notes?: string | null
    folderId?: string | null
    totpSecret?: string | null
    errors?: string[]
    warnings?: string[]
  }>
  errors: string[]
  warnings: string[]
  totalRows: number
  validRows: number
  invalidRows: number
}

export interface ImportCommitResult {
  success: boolean
  created: number
  errors: number
  createdIds: string[]
  errorMessages: string[]
}

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function previewImportAction(
  content: string,
  format?: "csv" | "json" | "1password" | "lastpass" | "bitwarden" | "keepass"
): Promise<ImportPreviewResult & { correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.importPreview({
      content,
      format,
    })

    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "previewImportAction" })
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to preview import (ID: ${correlationId})`)
  }
}

export async function commitImportAction(
  passwords: Array<{
    name: string
    username: string
    password: string
    url?: string | null
    notes?: string | null
    folderId?: string | null
    totpSecret?: string | null
  }>,
  skipInvalid: boolean = true
): Promise<ImportCommitResult & { correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.importCommit({
      passwords,
      skipInvalid,
    })

    revalidatePath("/admin/passwords")
    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "commitImportAction" })
    const fallbackMessage = "Failed to import passwords"
    if (error instanceof TRPCError) {
      const safeMessage = sanitizeClientErrorMessage(error.message, fallbackMessage)
      throw new Error(`${safeMessage} (ID: ${correlationId})`)
    }
    throw new Error(`${fallbackMessage} (ID: ${correlationId})`)
  }
}
