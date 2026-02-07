"use client"

import React from "react";
import { useCorrelationIdError } from "@/hooks/use-correlation-id-error";
import { ErrorWithCorrelationId } from "@/components/shared/ErrorWithCorrelationId";

interface FormErrorDisplayProps {
  error: unknown;
  className?: string;
  correlationId?: string;
}

/**
 * Display form errors with correlation ID support
 * Use this component to display server-side errors in forms
 */
export function FormErrorDisplay({ error, className, correlationId }: FormErrorDisplayProps) {
  const errorDetails = useCorrelationIdError(error);

  if (!errorDetails.message && !correlationId) {
    return null;
  }

  return (
    <ErrorWithCorrelationId
      message={errorDetails.message}
      correlationId={correlationId || errorDetails.correlationId}
      className={className}
    />
  );
}
