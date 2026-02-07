"use client"

import React, { useState } from "react";
import { AlertCircle, Copy, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ErrorWithCorrelationIdProps {
  message: string;
  correlationId?: string;
  supportNote?: string;
  className?: string;
  variant?: "default" | "destructive";
}

export const ErrorWithCorrelationId: React.FC<ErrorWithCorrelationIdProps> = ({
  message,
  correlationId,
  supportNote = "Copy this correlation ID and share it with customer support for troubleshooting.",
  className = "",
  variant = "destructive",
}) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (correlationId) {
      try {
        await navigator.clipboard.writeText(correlationId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy correlation ID:", error);
      }
    }
  };

  return (
    <Alert variant={variant} className={cn("mb-5", className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-col gap-2">
        <div>{message}</div>
        {correlationId && (
          <div className="flex items-center gap-2 text-xs">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <span className="font-mono opacity-80">
                      ID: {correlationId.slice(0, 8)}...{correlationId.slice(-4)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-mono text-xs break-all">{correlationId}</p>
                    <p className="text-xs text-muted-foreground">{supportNote}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
