import { TRPCError } from "@trpc/server";
import { generateCorrelationId, logError, formatErrorWithCorrelationId } from "./correlation-id-util";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export interface ActionErrorResult {
  error: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
}

export interface ActionSuccessResult<T = unknown> {
  success: true;
  data?: T;
}

export type ActionResult<T = unknown> = ActionErrorResult | ActionSuccessResult<T>;

/**
 * Wrapper for server actions that adds correlation ID error handling
 */
export async function withErrorHandling<T>(
  action: (correlationId: string) => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const correlationId = generateCorrelationId();

  try {
    return await action(correlationId);
  } catch (error: unknown) {
    // Re-throw redirect errors
    if (isRedirectError(error)) {
      throw error;
    }

    // Log the error with correlation ID
    logError(correlationId, error, context);

    // Handle tRPC errors
    if (error instanceof TRPCError) {
      const existingCause = typeof error.cause === "object" && error.cause !== null 
        ? error.cause as unknown as Record<string, unknown>
        : {};
        
      throw new TRPCError({
        ...error,
        message: formatErrorWithCorrelationId(error.message, correlationId),
        cause: {
          ...existingCause,
          correlationId,
        },
      });
    }

    // Handle other errors
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    const enhancedError = new Error(formatErrorWithCorrelationId(message, correlationId)) as Error & { correlationId: string };
    enhancedError.correlationId = correlationId;
    throw enhancedError;
  }
}

/**
 * Handle server action errors and return a formatted error result
 */
export function handleActionError(error: unknown, correlationId: string): ActionErrorResult {
  // Handle tRPC errors
  if (error instanceof TRPCError) {
    // Check if it's a validation error
    if (error.code === "BAD_REQUEST") {
      try {
        const zodErrors = JSON.parse(error.message);
        const fieldErrors: Record<string, string> = {};

        for (const err of zodErrors) {
          if (err.path && err.path.length > 0) {
            const fieldName = err.path[0];
            fieldErrors[fieldName] = err.message;
          }
        }

        if (Object.keys(fieldErrors).length > 0) {
          return { 
            error: "Validation failed", 
            fieldErrors, 
            correlationId 
          };
        }
      } catch {
        // If parsing fails, return the message as a root error
        return { 
          error: error.message, 
          correlationId 
        };
      }
    }

    // For other tRPC errors, return the message
    const causeCorrelationId = error.cause && typeof error.cause === "object" && "correlationId" in error.cause 
      ? (error.cause as { correlationId: string }).correlationId 
      : undefined;
    return { 
      error: error.message, 
      correlationId: causeCorrelationId || correlationId 
    };
  }

  // Handle regular errors
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return { 
    error: message, 
    correlationId 
  };
}

/**
 * Create a safe server action with automatic error handling
 */
export function createSafeAction<TInput, TOutput>(
  handler: (input: TInput, correlationId: string) => Promise<TOutput>
) {
  return async (
    prevState: ActionResult<TOutput> | null,
    input: TInput
  ): Promise<ActionResult<TOutput>> => {
    const correlationId = generateCorrelationId();

    try {
      const data = await handler(input, correlationId);
      return { success: true, data };
    } catch (error: unknown) {
      // Re-throw redirect errors
      if (isRedirectError(error)) {
        throw error;
      }

      // Log the error
      logError(correlationId, error, { input });

      // Return error result
      return handleActionError(error, correlationId);
    }
  };
}
