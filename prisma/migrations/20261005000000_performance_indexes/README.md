# performance_indexes

Adds composite indexes for the dashboard, audit-log, report and session queries and drops
eleven plain indexes that exactly duplicate a unique index on the same single column.

## Apply

From the `web` folder, with `DATABASE_URL` pointing at the target database:

    npx prisma migrate deploy

Every statement uses `CREATE INDEX IF NOT EXISTS` / `DROP INDEX IF EXISTS`, so it is safe to re-run.
On a large `AuditLog` table, index creation takes a write lock while it builds; run it in a quiet period.

## The application does not depend on it

No code reads or requires these indexes. The app behaves the same without them; queries are just
slower on big tables. `schema.prisma` already declares them (only `@@index` lines changed), so the
generated Prisma client is unaffected and does not need regenerating.

The tenant filters in the code still go through `User.companyId`. Switching them to
`AuditLog.companyId` (which these indexes are built for) needs the `companyId` backfill in
`prisma/migrations/manual_multi_tenant_columns.sql` to be complete first.
