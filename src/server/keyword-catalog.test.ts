import { describe, expect, it } from 'vitest';
import { catalogKeywords, chooseSearchKeyword, expandKeyword, keywordCatalog, seasonalTerms } from './keyword-catalog.js';

describe('catálogo e expansão de palavras-chave', () => {
  it('mantém os nove nichos e um catálogo amplo sem duplicatas', () => {
    expect(keywordCatalog).toHaveLength(9);
    expect(catalogKeywords().length).toBeGreaterThan(70);
    expect(new Set(catalogKeywords()).size).toBe(catalogKeywords().length);
  });

  it('expande intenção, sinônimos e sazonalidade brasileira', () => {
    const terms = expandKeyword('tenis corrida', new Date('2026-08-20T12:00:00-04:00'));
    expect(terms).toContain('tenis corrida em promocao');
    expect(terms.some((term) => term.includes('tenis de corrida'))).toBe(true);
    expect(terms.some((term) => term.includes('dia das criancas'))).toBe(true);
    expect(seasonalTerms(new Date('2026-11-20T12:00:00-04:00'))).toContain('black friday');
  });

  it('evita repetir o termo mais usado quando há alternativa nova', () => {
    const selected = chooseSearchKeyword(['fone bluetooth', 'ssd nvme'], [{
      term: 'fone bluetooth', searches: 10, lastResultCount: 2, lastSearchedAt: '2026-08-11T10:00:00Z',
    }], new Date('2026-08-11T12:00:00Z'));
    expect(selected).toBe('ssd nvme');
  });
});
