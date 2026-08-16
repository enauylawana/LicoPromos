import { describe, expect, it } from "vitest";
import { priceChange } from "./price-verifier.js";

describe("priceChange", () => {
  it("calcula queda e aumento percentual", () => {
    expect(priceChange(100, 85)).toBe(-15);
    expect(priceChange(100, 120)).toBe(20);
  });
  it("ignora base inválida", () => expect(priceChange(0, 10)).toBe(0));
});
