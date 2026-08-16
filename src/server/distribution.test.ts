import { describe, expect, it } from "vitest";
import { distributionInputSchema } from "./distribution.js";

const input = (amount: number) => ({
  offerIds: Array.from({ length: amount }, (_, index) => `offer-${index}`),
  channelIds: ["channel-1"],
  intervalMinutes: 5,
});

describe("distributionInputSchema", () => {
  it("aceita intervalo de um minuto", () => {
    expect(distributionInputSchema.safeParse({ ...input(1), intervalMinutes: 1 }).success).toBe(true);
  });

  it("aceita campanhas com até 200 produtos", () => {
    expect(distributionInputSchema.safeParse(input(200)).success).toBe(true);
  });

  it("recusa campanhas acima do limite", () => {
    expect(distributionInputSchema.safeParse(input(201)).success).toBe(false);
  });
});
