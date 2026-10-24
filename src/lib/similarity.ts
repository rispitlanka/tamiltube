// "Similar channels" without needing an embeddings API: TF-IDF over each
// channel's recent titles + description, then cosine similarity, adjusted so
// channels of a similar size rank higher (a 5k channel learns more from a 20k
// channel than from a 5M one).

const STOP = new Set(
  ("the a an and or of to in on for with at by from is are was were be this that it its you your my our we i me " +
    "video videos new full part episode ep live official channel subscribe watch latest best top how what why " +
    "vs today day 2023 2024 2025 2026 shorts short trending viral hd 4k tamil" // "tamil" is everywhere here, so not useful
  ).split(" "),
);

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase().replace(/#\S+/g, " ");
  const tokens = lower.match(/[஀-௿]+|[a-z][a-z0-9']{2,}/g) ?? [];
  return tokens.filter((t) => !STOP.has(t) && !/^\d+$/.test(t));
}

/** Keep the top-N terms; stored on the channel row */
export function buildTerms(texts: string[], topN = 80): Record<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    // Count each term once per title so one spammy title can't dominate
    for (const t of new Set(tokenize(text))) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN));
}

export type SimilarCandidate = {
  id: string;
  terms: Record<string, number> | null;
  subscribers: number;
  niche: string;
};

export function rankSimilar(
  target: SimilarCandidate,
  candidates: SimilarCandidate[],
  limit = 12,
): { id: string; score: number }[] {
  const docs = [target, ...candidates].filter((c) => c.terms && Object.keys(c.terms).length);
  if (!target.terms || docs.length < 2) return [];

  const df = new Map<string, number>();
  for (const d of docs) for (const t of Object.keys(d.terms!)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const idf = (t: string) => Math.log(1 + N / (df.get(t) ?? 1));

  const vec = (terms: Record<string, number>) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of Object.entries(terms)) {
      const w = (1 + Math.log(c)) * idf(t);
      v.set(t, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) };
  };

  const tv = vec(target.terms);
  const results: { id: string; score: number }[] = [];
  for (const c of candidates) {
    if (c.id === target.id || !c.terms) continue;
    const cv = vec(c.terms);
    if (!cv.norm || !tv.norm) continue;
    let dot = 0;
    for (const [t, w] of tv.v) {
      const w2 = cv.v.get(t);
      if (w2) dot += w * w2;
    }
    const cosine = dot / (tv.norm * cv.norm);
    if (cosine <= 0.02) continue;
    const sizeGap = Math.abs(Math.log10(Math.max(c.subscribers, 100)) - Math.log10(Math.max(target.subscribers, 100)));
    const sizeAffinity = Math.exp(-sizeGap / 1.5); // 1.0 same size, ~0.5 at 10× gap
    const nicheBonus = c.niche === target.niche && c.niche !== "general" ? 0.08 : 0;
    results.push({ id: c.id, score: cosine * (0.6 + 0.4 * sizeAffinity) + nicheBonus });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
