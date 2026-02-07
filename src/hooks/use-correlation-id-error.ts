import { useMemo } from "react";
import { extractCorrelationId } from "@/lib/correlation-id-util";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getStringProp = (value: unknown, key: string): string | undefined =>
  isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;

const getRecordProp = (value: unknown, key: string): Record<string, unknown> | undefined =>
  isRecord(value) && isRecord(value[key]) ? value[key] : undefined;

/**
 * Extracts correlation ID and user-friendly message from a tRPC error or any error object.
 */
export function useCorrelationIdError(error: unknown): {
  message: string;
  correlationId?: string;
} {
  return useMemo(() => {
    if (!error) return { message: "An unexpected error occurred" };
    
    // Handle string errors
    if (typeof error === "string") {
      const correlationId = extractCorrelationId(error);
      const message = error.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();
      return { message, correlationId: correlationId || undefined };
    }
    
    // Handle error objects
    if (typeof error === "object") {
      const err = isRecord(error) ? error : {};
      let message = getStringProp(err, "message") || "An unexpected error occurred";
      let correlationId: string | undefined = undefined;
      
      // Try to get correlation ID from different sources
      const cause = getRecordProp(err, "cause");
      const data = getRecordProp(err, "data");
      if (cause) {
        correlationId = getStringProp(cause, "correlationId");
      }
      if (!correlationId) {
        correlationId = getStringProp(err, "correlationId");
      }
      if (!correlationId && data) {
        correlationId = getStringProp(data, "correlationId");
      } else {
        // Try to extract from message
        correlationId = extractCorrelationId(message) || undefined;
      }
      
      // Remove correlation ID from message for user display
      message = message.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();
      
      return { message, correlationId };
    }
    
    return { message: "An unexpected error occurred" };
  }, [error]);
}

/**
 * Helper function to extract error details for server actions
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
} {
  if (!error) {
    return { message: "An unexpected error occurred" };
  }

  if (typeof error === "string") {
    const correlationId = extractCorrelationId(error);
    const message = error.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();
    return { message, correlationId: correlationId || undefined };
  }

  if (typeof error === "object") {
    const err = isRecord(error) ? error : {};
    let message = getStringProp(err, "message") || "An unexpected error occurred";
    let correlationId: string | undefined = undefined;
    let fieldErrors: Record<string, string> | undefined = undefined;

    // Extract correlation ID
    const cause = getRecordProp(err, "cause");
    const data = getRecordProp(err, "data");
    correlationId = getStringProp(cause, "correlationId")
      || getStringProp(err, "correlationId")
      || getStringProp(data, "correlationId")
      || extractCorrelationId(message)
      || undefined;

    // Extract field errors (for validation errors)
    const causeFieldErrors = getRecordProp(cause, "fieldErrors");
    const dataFieldErrors = getRecordProp(data, "fieldErrors");
    if (causeFieldErrors) {
      fieldErrors = causeFieldErrors as Record<string, string>;
    } else if (dataFieldErrors) {
      fieldErrors = dataFieldErrors as Record<string, string>;
    }

    // Clean message
    message = message.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();

    return { message, correlationId, fieldErrors };
  }

  return { message: "An unexpected error occurred" };
}
