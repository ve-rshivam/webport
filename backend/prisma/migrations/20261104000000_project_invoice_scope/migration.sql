ALTER TABLE "ClientProject"
  ADD COLUMN "projectType" TEXT,
  ADD COLUMN "estimatedDays" INTEGER,
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "invoiceIssuedAt" TIMESTAMP(3),
  ADD COLUMN "transactionRef" TEXT;

CREATE UNIQUE INDEX "ClientProject_invoiceNumber_key" ON "ClientProject"("invoiceNumber");
