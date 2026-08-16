import { describe, expect, it } from 'vitest';
import { quietHoursDecision } from './delivery-policy.js';

describe('janela silenciosa', () => {
  it('adia durante a madrugada e libera durante o dia', () => {
    expect(quietHoursDecision(new Date('2026-08-11T07:00:00Z')).allowed).toBe(false);
    expect(quietHoursDecision(new Date('2026-08-11T16:00:00Z')).allowed).toBe(true);
  });
});
