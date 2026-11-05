
CREATE SCHEMA IF NOT EXISTS "public";


CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'client',
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "tempPasswordHash" TEXT,
    "tempPasswordExpiry" TIMESTAMP(3),
    "tempPasswordAttempts" INTEGER NOT NULL DEFAULT 0,
    "sessionToken" TEXT,
    "sessionTokenExpiry" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "resetOtpHash" TEXT,
    "resetOtpExpiry" TIMESTAMP(3),
    "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "ClientProject" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT,
    "clientEmail" TEXT NOT NULL,
    "clientName" TEXT,
    "projectTitle" TEXT,
    "serviceName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'Pending',
    "status" TEXT NOT NULL DEFAULT 'Pending Verification',
    "progress" INTEGER NOT NULL DEFAULT 10,
    "deliveryDate" TEXT,
    "notes" TEXT,
    "isPaymentVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProject_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'contact',
    "transactionId" TEXT,
    "reference" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "email" TEXT,
    "name" TEXT,
    "projectId" TEXT,
    "userId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);


CREATE UNIQUE INDEX "User_email_key" ON "User"("email");


CREATE UNIQUE INDEX "User_sessionToken_key" ON "User"("sessionToken");


CREATE INDEX "ClientProject_clientEmail_idx" ON "ClientProject"("clientEmail");


CREATE INDEX "ClientProject_clientUserId_idx" ON "ClientProject"("clientUserId");


CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");


CREATE INDEX "Message_senderType_isRead_idx" ON "Message"("senderType", "isRead");


CREATE INDEX "Payment_email_idx" ON "Payment"("email");


CREATE UNIQUE INDEX "Payment_gateway_transactionId_key" ON "Payment"("gateway", "transactionId");


CREATE INDEX "AdminAlert_type_createdAt_idx" ON "AdminAlert"("type", "createdAt");


ALTER TABLE "ClientProject" ADD CONSTRAINT "ClientProject_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ClientProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ClientProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
