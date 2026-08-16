export type ReviewText = { title?: string; content?: string; rate?: number; dateCreated?: string };

const negativePatterns = [
  /\bfr[aá]gil\b/i, /\bdefeito\b/i, /parou de funcionar/i, /n[aã]o funciona/i,
  /veio quebrad[oa]/i, /baixa qualidade/i, /atrasou muito/i,
];
const positivePatterns = [
  /superou (minhas )?expectativas/i, /produto original/i, /chegou antes/i,
  /excelente qualidade/i, /recomendo muito/i,
];
const negatedNegative = /\b(n[aã]o|nunca|nem)\b.{0,18}\b(fr[aá]gil|defeito|quebrad[oa])\b/i;

export function analyzeReviews(reviews: ReviewText[]) {
  let negativeMentions = 0;
  let positiveMentions = 0;
  const negativeSignals = new Set<string>();
  const positiveSignals = new Set<string>();
  for (const review of reviews) {
    const text = `${review.title ?? ''} ${review.content ?? ''}`.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    for (const pattern of negativePatterns) {
      if (pattern.test(text) && !negatedNegative.test(text)) {
        negativeMentions++;
        negativeSignals.add(pattern.source.replaceAll('\\b', ''));
      }
    }
    for (const pattern of positivePatterns) {
      if (pattern.test(text)) {
        positiveMentions++;
        positiveSignals.add(pattern.source);
      }
    }
  }
  const analyzed = reviews.filter((review) => Boolean(review.title?.trim() || review.content?.trim())).length;
  const negativeRatio = analyzed ? negativeMentions / analyzed : 0;
  const positiveRatio = analyzed ? positiveMentions / analyzed : 0;
  const score = Math.round(Math.max(-100, Math.min(100, (positiveRatio - negativeRatio) * 100)));
  // Uma palavra isolada não reprova. Exigimos recorrência em pelo menos duas
  // avaliações e presença em 20% da amostra analisada.
  const shouldReject = analyzed >= 5 && negativeMentions >= 2 && negativeRatio >= 0.2;
  return { analyzed, score, shouldReject, negativeMentions, positiveMentions, negativeSignals: [...negativeSignals], positiveSignals: [...positiveSignals] };
}
