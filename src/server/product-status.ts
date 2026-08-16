export const productStatuses = [
  "awaiting_affiliate_link",
  "pending",
  "approved",
  "queued",
  "published",
  "rejected",
  "expired",
  "failed",
] as const;

export type ProductStatus = (typeof productStatuses)[number];

const transitions: Record<ProductStatus, readonly ProductStatus[]> = {
  awaiting_affiliate_link: ["pending", "rejected", "expired", "failed"],
  pending: ["approved", "rejected", "expired", "failed"],
  approved: ["pending", "queued", "rejected", "expired", "failed"],
  queued: ["approved", "published", "expired", "failed"],
  published: ["expired", "failed"],
  rejected: ["awaiting_affiliate_link", "pending", "approved"],
  expired: ["pending", "failed"],
  failed: ["pending", "approved", "rejected"],
};

export function canonicalProductStatus(status: string): ProductStatus {
  if (status === "suspicious") return "failed";
  if (status === "sent" || status === "manual_complete") return "published";
  if (status === "scheduled" || status === "sending" || status === "paused") return "queued";
  return productStatuses.includes(status as ProductStatus) ? status as ProductStatus : "failed";
}

export function canTransitionProduct(from: string, to: ProductStatus) {
  const current = canonicalProductStatus(from);
  return current === to || transitions[current].includes(to);
}
