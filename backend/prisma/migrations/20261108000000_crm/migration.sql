-- CreateEnum
CREATE TYPE "CrmRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'TEAM', 'CLIENT');

-- CreateEnum
CREATE TYPE "CrmPermission" AS ENUM ('CUSTOMERS_READ', 'CUSTOMERS_WRITE', 'PIPELINE_WRITE', 'PROJECTS_READ', 'PROJECTS_WRITE', 'INVOICES_READ', 'INVOICES_WRITE', 'PAYMENTS_READ', 'PAYMENTS_WRITE', 'PAYMENTS_VERIFY', 'ACTIVITY_READ', 'ACTIVITY_WRITE', 'TEAM_MANAGE', 'AUDIT_READ', 'EXPORT_DATA', 'PORTAL_READ');

-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'WEBSITE', 'ORGANIC', 'SOCIAL', 'OUTBOUND', 'RETURNING', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DISCOVERY', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DELIVERED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('RAZORPAY', 'PAYPAL', 'UPI_QR', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AWAITING_VERIFICATION', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('NONE', 'ACTIVE', 'RECYCLED', 'PURGED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL_OUT', 'EMAIL_IN', 'PORTAL_MESSAGE', 'STAGE_CHANGED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'INVOICE_ISSUED', 'INVOICE_VOIDED', 'PROJECT_UPDATED', 'FILE_UPLOADED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityDirection" AS ENUM ('INTERNAL', 'OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "ActivityVisibility" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CLIENT', 'SYSTEM', 'GATEWAY');

-- CreateEnum
CREATE TYPE "InjectionRisk" AS ENUM ('NONE', 'LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "CustomerAccess" AS ENUM ('OWNER', 'VIEWER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "crmActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "crmRole" "CrmRole";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "CrmSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "CrmPermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" "CustomerAccess" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "stage" "CustomerStage" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "ownerId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxId" TEXT,
    "billingAddress" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "notesRisk" "InjectionRisk" NOT NULL DEFAULT 'NONE',
    "firstContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "serviceType" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DISCOVERY',
    "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "previewUrl" TEXT,
    "repoUrl" TEXT,
    "ownerId" TEXT,
    "clientSummary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "customerSnapshot" JSONB,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPayment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "projectId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "baseAmountInr" DECIMAL(14,2) NOT NULL,
    "fxRate" DECIMAL(12,6),
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "proof" BYTEA,
    "proofMime" TEXT,
    "proofFilename" TEXT,
    "proofSha256" TEXT,
    "proofStatus" "ProofStatus" NOT NULL DEFAULT 'NONE',
    "proofRecycledAt" TIMESTAMP(3),
    "proofPurgeAfter" TIMESTAMP(3),
    "proofPurgedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "gatewayRefundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "type" "ActivityType" NOT NULL,
    "direction" "ActivityDirection" NOT NULL DEFAULT 'INTERNAL',
    "visibility" "ActivityVisibility" NOT NULL DEFAULT 'INTERNAL',
    "subject" TEXT,
    "body" TEXT,
    "fromStage" "CustomerStage",
    "toStage" "CustomerStage",
    "sourceTrust" TEXT NOT NULL DEFAULT 'UNTRUSTED',
    "injectionRisk" "InjectionRisk" NOT NULL DEFAULT 'NONE',
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmSession_tokenHash_key" ON "CrmSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CrmSession_userId_revokedAt_idx" ON "CrmSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "CrmSession_expiresAt_idx" ON "CrmSession"("expiresAt");

-- CreateIndex
CREATE INDEX "TeamPermission_permission_idx" ON "TeamPermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPermission_userId_permission_key" ON "TeamPermission"("userId", "permission");

-- CreateIndex
CREATE INDEX "CustomerUser_userId_idx" ON "CustomerUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_customerId_userId_key" ON "CustomerUser"("customerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_stage_updatedAt_idx" ON "Customer"("stage", "updatedAt");

-- CreateIndex
CREATE INDEX "Customer_ownerId_stage_idx" ON "Customer"("ownerId", "stage");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_customerId_status_idx" ON "Project"("customerId", "status");

-- CreateIndex
CREATE INDEX "Project_dueDate_idx" ON "Project"("dueDate");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_status_idx" ON "Invoice"("dueDate", "status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_sortOrder_idx" ON "InvoiceLine"("invoiceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPayment_idempotencyKey_key" ON "CrmPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CrmPayment_customerId_status_idx" ON "CrmPayment"("customerId", "status");

-- CreateIndex
CREATE INDEX "CrmPayment_invoiceId_idx" ON "CrmPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "CrmPayment_status_proofPurgeAfter_idx" ON "CrmPayment"("status", "proofPurgeAfter");

-- CreateIndex
CREATE INDEX "CrmPayment_createdAt_idx" ON "CrmPayment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPayment_method_gatewayPaymentId_key" ON "CrmPayment"("method", "gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_gatewayRefundId_key" ON "Refund"("gatewayRefundId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_createdAt_idx" ON "Refund"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_customerId_occurredAt_idx" ON "Activity"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_projectId_occurredAt_idx" ON "Activity"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_type_createdAt_idx" ON "Activity"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "CrmSession" ADD CONSTRAINT "CrmSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPermission" ADD CONSTRAINT "TeamPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPayment" ADD CONSTRAINT "CrmPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPayment" ADD CONSTRAINT "CrmPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPayment" ADD CONSTRAINT "CrmPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPayment" ADD CONSTRAINT "CrmPayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CrmPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

