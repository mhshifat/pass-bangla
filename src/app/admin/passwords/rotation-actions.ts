"use server"

import { revalidatePath } from "next/cache"
import { serverTrpc } from "@/trpc/server-caller"
import { TRPCError } from "@trpc/server"
import { generateCorrelationId, logError } from "@/lib/correlation-id-util"
import { isRedirectError } from "next/dist/client/components/redirect-error"

type ServerActionResult = {
  error?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
} | { success: true };


export async function createRotationPolicyAction(data: {
  name: string
  description?: string
  rotationDays: number
  reminderDays: number
  autoRotate?: boolean
  requireApproval?: boolean
  isActive?: boolean
}) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.createPolicy(data)
    revalidatePath("/admin/passwords/rotation")
    return { success: true, policy: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "createRotationPolicyAction", data })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to create rotation policy", correlationId }
  }
}

export async function updateRotationPolicyAction(
  id: string,
  data: {
    name?: string
    description?: string
    rotationDays?: number
    reminderDays?: number
    autoRotate?: boolean
    requireApproval?: boolean
    isActive?: boolean
  }
) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.updatePolicy({ id, ...data })
    revalidatePath("/admin/passwords/rotation")
    return { success: true, policy: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "updateRotationPolicyAction", id, data })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to update rotation policy", correlationId }
  }
}

export async function deleteRotationPolicyAction(id: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    await trpc.passwordRotation.deletePolicy({ id })
    revalidatePath("/admin/passwords/rotation")
    return { success: true, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "deleteRotationPolicyAction", id })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to delete rotation policy", correlationId }
  }
}

export async function assignPolicyToPasswordAction(passwordId: string, policyId: string | null) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.assignPolicy({ passwordId, policyId })
    revalidatePath("/admin/passwords")
    return { success: true, password: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "assignPolicyToPasswordAction", passwordId, policyId })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to assign policy", correlationId }
  }
}

export async function scheduleRotationAction(passwordId: string, scheduledFor: string, notes?: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.scheduleRotation({ passwordId, scheduledFor, notes })
    revalidatePath("/admin/passwords/rotation")
    return { success: true, rotation: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "scheduleRotationAction", passwordId, scheduledFor })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to schedule rotation", correlationId }
  }
}

export async function completeRotationAction(rotationId: string, newPassword: string, notes?: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.completeRotation({ rotationId, newPassword, notes })
    revalidatePath("/admin/passwords/rotation")
    revalidatePath("/admin/passwords")
    return { success: true, rotation: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "completeRotationAction", rotationId })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to complete rotation", correlationId }
  }
}

export async function cancelRotationAction(rotationId: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.cancelRotation({ rotationId })
    revalidatePath("/admin/passwords/rotation")
    return { success: true, rotation: result, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "cancelRotationAction", rotationId })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to cancel rotation", correlationId }
  }
}

export async function autoRotatePasswordAction(passwordId: string, notes?: string) {
  const correlationId = generateCorrelationId()
  try {
    const trpc = await serverTrpc()
    const result = await trpc.passwordRotation.autoRotatePassword({ passwordId, notes })
    revalidatePath("/admin/passwords/rotation")
    revalidatePath("/admin/passwords")
    return { success: true, rotation: result.rotation, newPassword: result.newPassword, correlationId }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    logError(correlationId, error, { action: "autoRotatePasswordAction", passwordId })
    if (error instanceof TRPCError) {
      return { success: false, error: error.message, correlationId }
    }
    return { success: false, error: "Failed to auto-rotate password", correlationId }
  }
}

