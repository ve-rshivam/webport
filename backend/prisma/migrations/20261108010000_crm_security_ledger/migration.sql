-- Additive hardening for CRM sessions, password/onboarding tokens, and refunds.

ALTER TABLE "CrmSession" ADD COLUMN "ipSubnetHash" TEXT;

ALTER TABLE "Refund" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Refund" ADD COLUMN "baseAmountInr" DECIMAL(14,2);

CREATE TABLE "PasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "lockedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordToken_tokenHash_key" ON "PasswordToken"("tokenHash");
CREATE INDEX "PasswordToken_userId_purpose_createdAt_idx" ON "PasswordToken"("userId", "purpose", "createdAt");
CREATE INDEX "PasswordToken_expiresAt_idx" ON "PasswordToken"("expiresAt");

ALTER TABLE "PasswordToken"
    ADD CONSTRAINT "PasswordToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
