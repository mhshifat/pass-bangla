"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

export interface ExportOptions {
  format: "csv" | "json" | "bitwarden" | "lastpass" | "encrypted"
  folderId?: string
  tagIds?: string[]
  dateFrom?: string
  dateTo?: string
  includeShared?: boolean
  encryptionKey?: string
}

export interface ExportResult {
  content: string
  mimeType: string
  fileExtension: string
  count: number
}

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function exportPasswordsAction(
  options: ExportOptions
): Promise<ExportResult & { correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.export(options)

    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "exportPasswordsAction" })
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to export passwords (ID: ${correlationId})`)
  }
}

export async function getExportFiltersAction() {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwords.getExportFilters()

    return result
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "getExportFiltersAction" })
    if (error instanceof TRPCError) {
      throw new Error(`${error.message} (ID: ${correlationId})`)
    }
    throw new Error(`Failed to get export filters (ID: ${correlationId})`)
  }
}
