-- CreateTable
CREATE TABLE "TemporaryShareAccess" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "TemporaryShareAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemporaryShareAccess_shareId_idx" ON "TemporaryShareAccess"("shareId");

-- CreateIndex
CREATE INDEX "TemporaryShareAccess_accessedAt_idx" ON "TemporaryShareAccess"("accessedAt");

-- AddForeignKey
ALTER TABLE "TemporaryShareAccess" ADD CONSTRAINT "TemporaryShareAccess_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "TemporaryPasswordShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
