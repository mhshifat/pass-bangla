-- Per-company Settings. Idempotent and non-destructive: existing rows keep companyId NULL
-- and become the platform-wide defaults.

ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Old global uniqueness on key (created as an index in 20260207231137_initial_commit)
DROP INDEX IF EXISTS "Settings_key_key";

-- One row per (key, company)
CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_companyId_key" ON "Settings"("key", "companyId");

-- NULLs are distinct in a unique index, so global rows need their own partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_global_key" ON "Settings"("key") WHERE "companyId" IS NULL;

CREATE INDEX IF NOT EXISTS "Settings_companyId_idx" ON "Settings"("companyId");
