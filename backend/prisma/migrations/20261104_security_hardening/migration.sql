


ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionFingerprint" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionUserAgent" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionIp" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);



CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT,
  "targetEmail" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog" ("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");



CREATE TABLE IF NOT EXISTS "ProcessedWebhook" (
  "id" TEXT NOT NULL,
  "gateway" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedWebhook_gateway_eventId_key" ON "ProcessedWebhook" ("gateway", "eventId");
CREATE INDEX IF NOT EXISTS "ProcessedWebhook_createdAt_idx" ON "ProcessedWebhook" ("createdAt");
