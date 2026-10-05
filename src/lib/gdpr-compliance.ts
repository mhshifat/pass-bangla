import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { createAuditLog } from "@/lib/audit-log"

export interface DataRetentionPolicyConfig {
  auditLogRetentionDays: number | null
  passwordHistoryRetentionDays: number | null
  sessionRetentionDays: number | null
  deletedDataRetentionDays: number | null
  autoDeleteEnabled: boolean
  isActive: boolean
}

/**
 * Get data retention policy for a company
 */
export async function getDataRetentionPolicy(
  companyId: string | null
): Promise<DataRetentionPolicyConfig | null> {
  if (!companyId) return null

  const policy = await prisma.dataRetentionPolicy.findUnique({
    where: { companyId },
  })

  if (!policy || !policy.isActive) {
    // Return default policy if none exists
    return {
      auditLogRetentionDays: null, // Keep forever by default
      passwordHistoryRetentionDays: 365, // 1 year
      sessionRetentionDays: 90, // 90 days
      deletedDataRetentionDays: 30, // 30 days
      autoDeleteEnabled: false,
      isActive: true,
    }
  }

  return {
    auditLogRetentionDays: policy.auditLogRetentionDays,
    passwordHistoryRetentionDays: policy.passwordHistoryRetentionDays,
    sessionRetentionDays: policy.sessionRetentionDays,
    deletedDataRetentionDays: policy.deletedDataRetentionDays,
    autoDeleteEnabled: policy.autoDeleteEnabled,
    isActive: policy.isActive,
  }
}

/**
 * Export user data in JSON format
 */
export async function exportUserData(
  userId: string,
  companyId: string | null,
  exportType: "FULL" | "PASSWORDS" | "AUDIT_LOGS" | "PROFILE"
): Promise<{
  exportId: string
  data: Record<string, unknown>
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: true,
    },
  })

  if (!user) {
    throw new Error("User not found")
  }

  // Verify company access
  if (user.companyId !== companyId) {
    throw new Error("Unauthorized access")
  }

  const data: Record<string, unknown> = {}

  // Export profile data
  if (exportType === "FULL" || exportType === "PROFILE") {
    data.profile = {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      recoveryEmail: user.recoveryEmail,
      recoveryEmailVerified: user.recoveryEmailVerified,
      phoneNumber: user.phoneNumber,
      bio: user.bio,
      role: user.role,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      mfaMethod: user.mfaMethod,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            subdomain: user.company.subdomain,
          }
        : null,
    }
  }

  // Export passwords
  if (exportType === "FULL" || exportType === "PASSWORDS") {
    const passwords = await prisma.password.findMany({
      where: { ownerId: userId },
      include: {
        folder: true,
        tags: {
          include: {
            tag: true,
          },
        },
        sharedWith: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    data.passwords = passwords.map((pwd) => ({
      id: pwd.id,
      name: pwd.name,
      username: pwd.username,
      password: decrypt(pwd.password), // Decrypt for export
      url: pwd.url,
      notes: pwd.notes,
      folderId: pwd.folderId,
      folder: pwd.folder
        ? {
            id: pwd.folder.id,
            name: pwd.folder.name,
          }
        : null,
      strength: pwd.strength,
      hasTotp: pwd.hasTotp,
      expiresAt: pwd.expiresAt,
      isFavorite: pwd.isFavorite,
      tags: pwd.tags.map((pt) => ({
        id: pt.tag.id,
        name: pt.tag.name,
        color: pt.tag.color,
        icon: pt.tag.icon,
      })),
      sharedWith: pwd.sharedWith.map((share) => ({
        userId: share.userId,
        userName: share.user?.name,
        userEmail: share.user?.email,
        teamId: share.teamId,
        teamName: share.team?.name,
        permission: share.permission,
        expiresAt: share.expiresAt,
      })),
      createdAt: pwd.createdAt,
      updatedAt: pwd.updatedAt,
    }))
  }

  // Export audit logs
  if (exportType === "FULL" || exportType === "AUDIT_LOGS") {
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    data.auditLogs = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      details: log.details,
      status: log.status,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    }))
  }

  // Export sessions
  if (exportType === "FULL") {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    data.sessions = sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isTrusted: session.isTrusted,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      expires: session.expires,
    }))
  }

  // Create export record
  const exportRecord = await prisma.dataExport.create({
    data: {
      userId,
      companyId: user.companyId,
      exportType,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  })

  // Create audit log
  await createAuditLog({
    action: "DATA_EXPORT",
    resource: "DataExport",
    resourceId: exportRecord.id,
    details: { exportType },
    userId,
    companyId: user.companyId,
  })

  return {
    exportId: exportRecord.id,
    data,
  }
}

/**
 * Delete user data (Right to be forgotten)
 */
export async function deleteUserData(
  userId: string,
  companyId: string | null,
  deletionScope?: {
    deletePasswords?: boolean
    deleteAuditLogs?: boolean
    deleteSessions?: boolean
    deleteProfile?: boolean
  }
): Promise<{ success: boolean; deletedItems: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new Error("User not found")
  }

  // Verify company access
  if (user.companyId !== companyId) {
    throw new Error("Unauthorized access")
  }

  const deletedItems: string[] = []

  // Default: delete everything if no scope specified
  const scope = deletionScope || {
    deletePasswords: true,
    deleteAuditLogs: true,
    deleteSessions: true,
    deleteProfile: false, // Don't delete profile by default, just anonymize
  }

  // Delete passwords
  if (scope.deletePasswords) {
    const deletedPasswords = await prisma.password.deleteMany({
      where: { ownerId: userId },
    })
    deletedItems.push(`Passwords: ${deletedPasswords.count}`)
  }

  // Delete audit logs
  if (scope.deleteAuditLogs) {
    const deletedLogs = await prisma.auditLog.deleteMany({
      where: { userId },
    })
    deletedItems.push(`Audit Logs: ${deletedLogs.count}`)
  }

  // Delete sessions
  if (scope.deleteSessions) {
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId },
    })
    deletedItems.push(`Sessions: ${deletedSessions.count}`)
  }

  // Anonymize or delete profile
  if (scope.deleteProfile) {
    await prisma.user.delete({
      where: { id: userId },
    })
    deletedItems.push("User Profile")
  } else {
    // Anonymize profile
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: "Deleted User",
        email: `deleted-${userId}@deleted.local`,
        recoveryEmail: null,
        phoneNumber: null,
        bio: null,
        image: null,
        password: null,
        isActive: false,
      },
    })
    deletedItems.push("User Profile (Anonymized)")
  }

  // Create audit log
  await createAuditLog({
    action: "DATA_DELETION",
    resource: "User",
    resourceId: userId,
    details: { deletionScope: scope, deletedItems },
    userId,
    companyId: user.companyId,
  })

  return {
    success: true,
    deletedItems,
  }
}

// Retention deletes run in bounded batches so one large backlog cannot hold a
// long lock or run past the function time limit; the next run continues.
const CLEANUP_BATCH_SIZE = 1000
const CLEANUP_MAX_BATCHES = 20

async function deleteInBatches(
  findIds: (take: number) => Promise<{ id: string }[]>,
  deleteByIds: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
    const rows = await findIds(CLEANUP_BATCH_SIZE)
    if (rows.length === 0) break
    const result = await deleteByIds(rows.map((row) => row.id))
    total += result.count
    if (rows.length < CLEANUP_BATCH_SIZE) break
  }
  return total
}

/**
 * Clean up expired data based on retention policy.
 * Every delete is scoped to the given company; nothing runs without one.
 */
export async function cleanupExpiredData(
  companyId: string | null
): Promise<{ cleaned: string[]; errors: string[] }> {
  // A retention policy belongs to exactly one company. Without a company there
  // is no tenant to scope the deletes to, so do nothing.
  if (!companyId) {
    return { cleaned: [], errors: [] }
  }

  const policy = await getDataRetentionPolicy(companyId)
  if (!policy || !policy.autoDeleteEnabled) {
    return { cleaned: [], errors: [] }
  }

  const cleaned: string[] = []
  const errors: string[] = []
  const now = new Date()

  try {
    // Clean up old audit logs
    if (policy.auditLogRetentionDays) {
      const cutoffDate = new Date(now)
      cutoffDate.setDate(cutoffDate.getDate() - policy.auditLogRetentionDays)

      const where = {
        createdAt: { lt: cutoffDate },
        user: { companyId },
      }
      const deletedLogs = await deleteInBatches(
        (take) => prisma.auditLog.findMany({ where, select: { id: true }, take }),
        (ids) => prisma.auditLog.deleteMany({ where: { ...where, id: { in: ids } } })
      )
      cleaned.push(`Audit Logs: ${deletedLogs}`)
    }

    // Clean up old password history
    if (policy.passwordHistoryRetentionDays) {
      const cutoffDate = new Date(now)
      cutoffDate.setDate(
        cutoffDate.getDate() - policy.passwordHistoryRetentionDays
      )

      // PasswordHistory has no companyId: scope through the password's owner,
      // and skip any password stamped with a different company.
      const where = {
        createdAt: { lt: cutoffDate },
        passwordEntry: {
          owner: { companyId },
          OR: [{ companyId }, { companyId: null }],
        },
      }
      const deletedHistory = await deleteInBatches(
        (take) => prisma.passwordHistory.findMany({ where, select: { id: true }, take }),
        (ids) => prisma.passwordHistory.deleteMany({ where: { ...where, id: { in: ids } } })
      )
      cleaned.push(`Password History: ${deletedHistory}`)
    }

    // Clean up expired sessions
    if (policy.sessionRetentionDays) {
      const cutoffDate = new Date(now)
      cutoffDate.setDate(cutoffDate.getDate() - policy.sessionRetentionDays)

      // Scoped through the session's user: Session.companyId is nullable and
      // was added after the table existed, so it cannot be relied on alone.
      const where = {
        user: { companyId },
        OR: [
          { expires: { lt: now } },
          { lastActiveAt: { lt: cutoffDate } },
        ],
      }
      const deletedSessions = await deleteInBatches(
        (take) => prisma.session.findMany({ where, select: { id: true }, take }),
        (ids) => prisma.session.deleteMany({ where: { ...where, id: { in: ids } } })
      )
      cleaned.push(`Sessions: ${deletedSessions}`)
    }

    // Update last cleanup time
    await prisma.dataRetentionPolicy.updateMany({
      where: { companyId },
      data: { lastCleanupAt: now },
    })
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "Unknown error during cleanup"
    )
  }

  return { cleaned, errors }
}
