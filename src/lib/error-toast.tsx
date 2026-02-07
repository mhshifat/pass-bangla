import { toast } from "sonner";
import { AlertCircle, Copy, Check } from "lucide-react";
import { extractCorrelationId } from "./correlation-id-util";

interface ErrorToastOptions {
  message: string;
  correlationId?: string;
  duration?: number;
}

/**
 * Show an error toast with correlation ID support
 */
export function showErrorToast({ message, correlationId, duration = 8000 }: ErrorToastOptions) {
  let copied = false;

  const handleCopy = async () => {
    if (correlationId) {
      try {
        await navigator.clipboard.writeText(correlationId);
        copied = true;
        toast.success("Correlation ID copied to clipboard");
      } catch (error) {
        console.error("Failed to copy correlation ID:", error);
      }
    }
  };

  toast.error(
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">{message}</div>
          {correlationId && (
            <div className="mt-2 flex items-center gap-2 text-xs opacity-80">
              <span className="font-mono">
                ID: {correlationId.slice(0, 8)}...{correlationId.slice(-4)}
              </span>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 hover:opacity-100 transition-opacity"
                title="Copy correlation ID"
                type="button"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      {correlationId && (
        <div className="text-xs text-muted-foreground pl-6">
          Copy the correlation ID and share with support for troubleshooting.
        </div>
      )}
    </div>,
    { duration }
  );
}

/**
 * Show error toast from any error object
 */
export function showErrorFromException(error: unknown, defaultMessage = "An unexpected error occurred") {
  if (!error) {
    showErrorToast({ message: defaultMessage });
    return;
  }

  if (typeof error === "string") {
    const correlationId = extractCorrelationId(error);
    const message = error.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();
    showErrorToast({ message, correlationId: correlationId || undefined });
    return;
  }

  if (typeof error === "object") {
    const err = error as { message?: string; cause?: unknown; correlationId?: string; data?: unknown };
    let message = err?.message || defaultMessage;
    let correlationId: string | undefined = undefined;

    // Extract correlation ID from various sources
    if (err?.cause && typeof err.cause === "object" && "correlationId" in err.cause) {
      correlationId = (err.cause as { correlationId: string }).correlationId;
    } else if (err?.correlationId) {
      correlationId = err.correlationId;
    } else if (err?.data && typeof err.data === "object" && "correlationId" in err.data) {
      correlationId = (err.data as { correlationId: string }).correlationId;
    } else {
      correlationId = extractCorrelationId(message) || undefined;
    }

    // Clean message
    message = message.replace(/\s*\[Correlation ID: [a-f0-9-]{36}\]/i, "").trim();

    showErrorToast({ message, correlationId });
    return;
  }

  showErrorToast({ message: defaultMessage });
}
