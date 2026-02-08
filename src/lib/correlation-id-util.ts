/**
 * Generates a new correlation ID (UUID v4).
 * Works both on server and client side.
 */
export function generateCorrelationId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (randomUUID) {
    return randomUUID.call(globalThis.crypto)
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Gets the correlation ID from a context or request, or generates a new one if not present.
 * @param ctx Any object that may have a correlationId property
 */
export function getOrCreateCorrelationId(ctx?: { correlationId?: string } | null): string {
  if (ctx && ctx.correlationId) return ctx.correlationId
  return generateCorrelationId()
}

/**
 * Format error message with correlation ID
 */
export function formatErrorWithCorrelationId(message: string, correlationId: string): string {
  return `${message} [Correlation ID: ${correlationId}]`
}

/**
 * Sanitize error messages for client display
 */
export function sanitizeClientErrorMessage(message: string, fallback: string): string {
  const normalized = message.toLowerCase()

  const isPrismaError =
    normalized.includes("prisma") ||
    normalized.includes("prismaclient") ||
    normalized.includes("invalid `prisma") ||
    normalized.includes("prisma.")

  if (isPrismaError) {
    return fallback
  }

  return message
}

/**
 * Extract correlation ID from error message
 */
export function extractCorrelationId(message: string): string | null {
  const match = message.match(/\[Correlation ID: ([a-f0-9-]{36})\]/i)
  return match ? match[1] : null
}

/**
 * Log error with correlation ID (server-side)
 */
export function logError(correlationId: string, error: unknown, context?: Record<string, unknown>): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const stackTrace = error instanceof Error ? error.stack : undefined
  
  const logData = {
    correlationId,
    message: errorMessage,
    timestamp: new Date().toISOString(),
    ...context,
  }
  
  // In production, this would go to a logging service like Sentry
  if (process.env.NODE_ENV === "production") {
    // TODO: Send to Sentry or other logging service
    // Log structured data + stack trace separately for readability
    console.error("[ERROR]", JSON.stringify(logData))
    if (stackTrace) {
      console.error("[STACK]", correlationId, "\n" + stackTrace)
    }
  } else {
    console.error("[ERROR]", { ...logData, stackTrace })
  }
}
