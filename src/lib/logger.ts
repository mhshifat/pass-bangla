/**
 * Minimal structured logger.
 *
 * Thin wrapper around `console.*` that emits a single-line, timestamped,
 * JSON-friendly record so logs are greppable in production while staying
 * trivial in development. Intentionally dependency-free.
 */
type LogContext = Record<string, unknown>

function emit(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext
): void {
  const record = {
    level,
    message,
    ...(context ?? {}),
    time: new Date().toISOString(),
  }
  const line = JSON.stringify(record)
  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
}
