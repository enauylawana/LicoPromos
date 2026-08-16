ALTER TABLE "Offer" ADD COLUMN "reviewSentiment" REAL;
ALTER TABLE "Offer" ADD COLUMN "reviewsAnalyzed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Offer" ADD COLUMN "reviewSignals" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Offer" ADD COLUMN "promotionEndsAt" DATETIME;

CREATE TABLE "SalesHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offerId" TEXT NOT NULL,
  "soldQuantity" INTEGER NOT NULL,
  "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SalesHistory_offerId_collectedAt_idx" ON "SalesHistory"("offerId", "collectedAt");
