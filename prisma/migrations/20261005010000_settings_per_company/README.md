# Settings per company

Adds `Settings.companyId` (nullable). Existing rows keep `companyId = NULL` and act as
platform defaults; tenant-owned keys (SMTP, SMS, MFA, session/login/password limits, IP
security, threat detection) are written per company by the new code. Replaces the global
unique index on `key` with unique `(key, companyId)` plus a partial unique index for the
global (`companyId IS NULL`) rows.

## Deploy order (important)

Apply this migration BEFORE the new application code runs. The new code reads and writes
the `companyId` column; running it against the old schema fails every settings read
(login included).

    npx prisma migrate deploy

The migration is idempotent (`IF NOT EXISTS` / `IF EXISTS`) and safe to re-run. Old code
running against the migrated schema cannot upsert settings (its `where: { key }` no longer
matches a unique index), so deploy the new code promptly after migrating.

## Rollback

Only safe before any company has saved its own settings (otherwise duplicate keys exist):

    DELETE FROM "Settings" WHERE "companyId" IS NOT NULL;  -- discards all per-company values
    DROP INDEX IF EXISTS "Settings_key_global_key";
    DROP INDEX IF EXISTS "Settings_key_companyId_key";
    DROP INDEX IF EXISTS "Settings_companyId_idx";
    ALTER TABLE "Settings" DROP COLUMN IF EXISTS "companyId";
    CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_key" ON "Settings"("key");

Note: the partial index is not expressible in `schema.prisma`; `prisma migrate dev` may
report it as drift. Do not remove it.
