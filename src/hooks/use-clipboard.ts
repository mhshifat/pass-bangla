"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { trpc } from "@/trpc/client"
import { showErrorFromException } from "@/lib/error-toast"

interface UseClipboardOptions {
  /**
   * Timeout in seconds before clearing the clipboard (0 = disabled)
   * Default: 30 seconds
   */
  timeout?: number
  /**
   * Whether to log the copy action to audit log
   * Default: true
   */
  logToAudit?: boolean
  /**
   * Resource ID for audit logging (e.g., password ID)
   */
  resourceId?: string
  /**
   * Resource type for audit logging (e.g., "password")
   */
  resourceType?: string
  /**
   * Action type for audit logging (e.g., "copy_password", "copy_username", "copy_url")
   */
  actionType?: string
  /**
   * Custom success message
   */
  successMessage?: string
  /**
   * Custom error message
   */
  errorMessage?: string
}

interface UseClipboardReturn {
  copy: (text: string, options?: UseClipboardOptions) => Promise<void>
  isCopying: boolean
  clearClipboard: () => Promise<void>
}

const DEFAULT_TIMEOUT = 30 // seconds
let clipboardTimeoutId: NodeJS.Timeout | null = null
let lastCopiedText: string | null = null

export function useClipboard(): UseClipboardReturn {
  const { t } = useTranslation()
  const [isCopying, setIsCopying] = React.useState(false)
  const logCopyMutation = trpc.auditLogs.logClipboardCopy.useMutation()

  const clearClipboard = React.useCallback(async () => {
    try {
      // Clear the clipboard by writing empty string
      await navigator.clipboard.writeText("")
      lastCopiedText = null
      if (clipboardTimeoutId) {
        clearTimeout(clipboardTimeoutId)
        clipboardTimeoutId = null
      }
    } catch (error) {
      // Silently fail - clearing clipboard is not critical
      console.warn("Failed to clear clipboard:", error)
    }
  }, [])

  const copy = React.useCallback(
    async (text: string, options: UseClipboardOptions = {}) => {
      const {
        timeout = DEFAULT_TIMEOUT,
        logToAudit = true,
        resourceId,
        resourceType = "password",
        actionType = "copy",
        successMessage,
        errorMessage,
      } = options

      if (!text) {
        showErrorFromException(new Error(errorMessage || t("clipboard.emptyText")), t("clipboard.emptyText"))
        return
      }

      try {
        setIsCopying(true)

        // Copy to clipboard
        await navigator.clipboard.writeText(text)
        lastCopiedText = text

        // Log to audit if enabled
        if (logToAudit && resourceId && actionType) {
          try {
            await logCopyMutation.mutateAsync({
              resourceId,
              resourceType,
              actionType,
            })
          } catch (auditError) {
            // Don't fail the copy operation if audit logging fails
            console.warn("Failed to log clipboard copy to audit:", auditError)
          }
        }

        // Show success message
        toast.success(successMessage || t("clipboard.copied"))

        // Set up auto-clear if timeout is enabled
        if (timeout > 0) {
          // Clear any existing timeout
          if (clipboardTimeoutId) {
            clearTimeout(clipboardTimeoutId)
          }

          // Set new timeout
          clipboardTimeoutId = setTimeout(async () => {
            await clearClipboard()
            toast.info(t("clipboard.cleared", { timeout }))
          }, timeout * 1000)
        }
      } catch (error) {
        console.error("Failed to copy to clipboard:", error)
        showErrorFromException(error, errorMessage || t("clipboard.copyFailed"))
      } finally {
        setIsCopying(false)
      }
    },
    [t, logCopyMutation, clearClipboard]
  )

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (clipboardTimeoutId) {
        clearTimeout(clipboardTimeoutId)
      }
    }
  }, [])

  return {
    copy,
    isCopying,
    clearClipboard,
  }
}

