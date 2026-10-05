-- Performance indexes. Idempotent: safe to run on a database where parts already exist.

-- Plain indexes that exactly duplicate a unique index on the same single column
DROP INDEX IF EXISTS "Company_subdomain_idx";
DROP INDEX IF EXISTS "TemporaryPasswordShare_shareToken_idx";
DROP INDEX IF EXISTS "Settings_key_idx";
DROP INDEX IF EXISTS "Permission_key_idx";
DROP INDEX IF EXISTS "MfaCredential_credentialId_idx";
DROP INDEX IF EXISTS "PasskeyCredential_credentialId_idx";
DROP INDEX IF EXISTS "EmailVerificationToken_token_idx";
DROP INDEX IF EXISTS "PasswordResetToken_token_idx";
DROP INDEX IF EXISTS "PasswordPolicy_companyId_idx";
DROP INDEX IF EXISTS "DataRetentionPolicy_companyId_idx";
DROP INDEX IF EXISTS "DataDeletionRequest_confirmationToken_idx";

-- AuditLog: tenant + newest first, tenant + action + time, user + action + time, resource + action + time
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_action_createdAt_idx" ON "AuditLog"("companyId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_action_createdAt_idx" ON "AuditLog"("userId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceId_action_createdAt_idx" ON "AuditLog"("resourceId", "action", "createdAt");

-- Password: owner's default list order
CREATE INDEX IF NOT EXISTS "Password_ownerId_createdAt_idx" ON "Password"("ownerId", "createdAt" DESC);

-- PasswordShare: team shares joined back to passwords
CREATE INDEX IF NOT EXISTS "PasswordShare_teamId_passwordId_idx" ON "PasswordShare"("teamId", "passwordId");

-- Session: active sessions per user / per company
CREATE INDEX IF NOT EXISTS "Session_userId_expires_idx" ON "Session"("userId", "expires");
CREATE INDEX IF NOT EXISTS "Session_companyId_expires_idx" ON "Session"("companyId", "expires");

-- PasswordHistory: latest entries per password
CREATE INDEX IF NOT EXISTS "PasswordHistory_passwordId_createdAt_idx" ON "PasswordHistory"("passwordId", "createdAt" DESC);

-- ThreatEvent: tenant + time
CREATE INDEX IF NOT EXISTS "ThreatEvent_companyId_createdAt_idx" ON "ThreatEvent"("companyId", "createdAt" DESC);

-- User: login / uniqueness lookups by company + email
CREATE INDEX IF NOT EXISTS "User_companyId_email_idx" ON "User"("companyId", "email");
