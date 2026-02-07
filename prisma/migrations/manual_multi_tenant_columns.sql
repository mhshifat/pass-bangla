-- Multi-tenant isolation: Add companyId to core models
-- Run this SQL directly on your production database

-- ================================================
-- 1. Add companyId to Password table
-- ================================================
ALTER TABLE "Password" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "Password_companyId_idx" ON "Password"("companyId");

ALTER TABLE "Password" DROP CONSTRAINT IF EXISTS "Password_companyId_fkey";
ALTER TABLE "Password" ADD CONSTRAINT "Password_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 2. Add companyId to AuditLog table
-- ================================================
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_companyId_idx" ON "AuditLog"("companyId");

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_companyId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 3. Add companyId to Role table and update unique constraint
-- ================================================
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Drop old unique constraint on name
DROP INDEX IF EXISTS "Role_name_key";

-- Create new compound unique index (name + companyId)
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_companyId_key" ON "Role"("name", "companyId");

CREATE INDEX IF NOT EXISTS "Role_companyId_idx" ON "Role"("companyId");

ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_companyId_fkey";
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 4. Add companyId to PasswordRotationPolicy table
-- ================================================
ALTER TABLE "PasswordRotationPolicy" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "PasswordRotationPolicy_companyId_idx" ON "PasswordRotationPolicy"("companyId");

ALTER TABLE "PasswordRotationPolicy" DROP CONSTRAINT IF EXISTS "PasswordRotationPolicy_companyId_fkey";
ALTER TABLE "PasswordRotationPolicy" ADD CONSTRAINT "PasswordRotationPolicy_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 5. Add companyId to Session table
-- ================================================
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "Session_companyId_idx" ON "Session"("companyId");

ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_companyId_fkey";
ALTER TABLE "Session" ADD CONSTRAINT "Session_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 6. Add companyId to Tag table (if not already done)
-- ================================================
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Drop old unique constraint on name if exists
DROP INDEX IF EXISTS "Tag_name_key";

-- Create new compound unique index (name + companyId)
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_companyId_key" ON "Tag"("name", "companyId");

CREATE INDEX IF NOT EXISTS "Tag_companyId_idx" ON "Tag"("companyId");

ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_companyId_fkey";
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 7. Add companyId to Folder table (if not already done)
-- ================================================
ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "Folder_companyId_idx" ON "Folder"("companyId");

ALTER TABLE "Folder" DROP CONSTRAINT IF EXISTS "Folder_companyId_fkey";
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- 8. Add companyId to Team table (if not already done)
-- ================================================
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "Team_companyId_idx" ON "Team"("companyId");

ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_companyId_fkey";
ALTER TABLE "Team" ADD CONSTRAINT "Team_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ================================================
-- BACKFILL: Set companyId from owner/creator relationships
-- ================================================

-- Backfill Password.companyId from owner
UPDATE "Password" p
SET "companyId" = u."companyId"
FROM "User" u
WHERE p."ownerId" = u.id
  AND p."companyId" IS NULL
  AND u."companyId" IS NOT NULL;

-- Backfill AuditLog.companyId from user
UPDATE "AuditLog" a
SET "companyId" = u."companyId"
FROM "User" u
WHERE a."userId" = u.id
  AND a."companyId" IS NULL
  AND u."companyId" IS NOT NULL;

-- Backfill Role.companyId from createdBy
UPDATE "Role" r
SET "companyId" = u."companyId"
FROM "User" u
WHERE r."createdById" = u.id
  AND r."companyId" IS NULL
  AND r."isSystem" = false
  AND u."companyId" IS NOT NULL;

-- Backfill PasswordRotationPolicy.companyId from owner
UPDATE "PasswordRotationPolicy" p
SET "companyId" = u."companyId"
FROM "User" u
WHERE p."ownerId" = u.id
  AND p."companyId" IS NULL
  AND u."companyId" IS NOT NULL;

-- Backfill Session.companyId from user
UPDATE "Session" s
SET "companyId" = u."companyId"
FROM "User" u
WHERE s."userId" = u.id
  AND s."companyId" IS NULL
  AND u."companyId" IS NOT NULL;

-- Note: Tag and Folder companyId should be set when creating new records
-- For existing records, you may need to run a manual backfill based on your data

SELECT 'Migration completed successfully!' AS status;
