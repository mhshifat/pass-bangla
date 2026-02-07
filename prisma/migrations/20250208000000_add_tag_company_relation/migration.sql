-- Add companyId column to Tag table (nullable first for existing data)
ALTER TABLE "Tag" ADD COLUMN "companyId" TEXT;

-- Create index for Tag.companyId
CREATE INDEX "Tag_companyId_idx" ON "Tag"("companyId");

-- Add foreign key constraint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique constraint on Tag.name (if exists)
DROP INDEX IF EXISTS "Tag_name_key";

-- Create new unique constraint on Tag.name + companyId
CREATE UNIQUE INDEX "Tag_name_companyId_key" ON "Tag"("name", "companyId");