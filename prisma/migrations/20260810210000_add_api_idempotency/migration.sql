CREATE TABLE "ApiIdempotencyKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "state" TEXT NOT NULL DEFAULT 'processing',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ApiIdempotencyKey_operation_key_key"
  ON "ApiIdempotencyKey"("operation", "key");
CREATE INDEX "ApiIdempotencyKey_expiresAt_idx"
  ON "ApiIdempotencyKey"("expiresAt");
