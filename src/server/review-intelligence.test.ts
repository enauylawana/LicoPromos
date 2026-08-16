import { describe, expect, it } from 'vitest';
import { analyzeReviews } from './review-intelligence.js';

describe('inteligência de avaliações', () => {
  it('rejeita recorrência negativa com amostra mínima', () => {
    const result = analyzeReviews([
      { content: 'Muito frágil, parou de funcionar.' }, { content: 'Veio com defeito.' },
      { content: 'Produto frágil.' }, { content: 'Regular.' }, { content: 'Não gostei.' },
    ]);
    expect(result.shouldReject).toBe(true);
    expect(result.score).toBeLessThan(0);
  });

  it('valoriza sinais positivos', () => {
    const result = analyzeReviews([{ content: 'Original, superou expectativas e chegou antes do prazo.' }]);
    expect(result.shouldReject).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });
});
