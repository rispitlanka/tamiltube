// Detects whether a channel makes Tamil content, and in which writing style.
// Tamil creators write titles three ways: Tamil script, Tanglish (Tamil in
// English letters) and English. All three count as a Tamil channel.

const TAMIL_CHAR = /[஀-௿]/g;
// Tamil vowel signs (ா ி ு ெ …) are Unicode marks, not letters, so count both
const LETTER = /[\p{L}\p{M}]/gu;

// Common Tanglish / Tamil-context words. Kept specific to avoid false hits on English.
export const TANGLISH_WORDS = [
  "tamil", "tamizh", "thamizh", "chennai", "madurai", "coimbatore", "kovai", "trichy", "jaffna", "kollywood",
  "samayal", "kuzhambu", "kulambu", "rasam", "poriyal", "kootu", "paniyaram", "kozhukattai", "sambar",
  "machi", "machan", "macha", "nanba", "nanban", "thalaivar", "thalapathy", "thala", "kalakkal", "semma",
  "vera level", "akka", "thambi", "paati", "thatha", "veedu", "ooru",
  "padam", "paattu", "kadhai", "kathai", "kalyanam", "pongal", "deepavali", "karthigai",
  "murugan", "amman", "perumal", "kovil", "koil", "aadi masam",
  "eppadi", "epdi", "romba", "konjam", "sapadu", "saapadu", "virunthu", "kirukkan",
];

const TANGLISH_RE = new RegExp(
  `\\b(${TANGLISH_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export type ScriptStyle = "tamil" | "tanglish" | "english" | "mixed";

export function tamilScriptRatio(text: string): number {
  const letters = text.match(LETTER)?.length ?? 0;
  if (!letters) return 0;
  const tamil = text.match(TAMIL_CHAR)?.length ?? 0;
  return tamil / letters;
}

export function hasTanglish(text: string): boolean {
  return TANGLISH_RE.test(text);
}

/** How a single title is written */
export function titleStyle(title: string): ScriptStyle {
  const ratio = tamilScriptRatio(title);
  if (ratio >= 0.6) return "tamil";
  if (ratio >= 0.15) return "mixed";
  if (hasTanglish(title)) return "tanglish";
  return "english";
}

export function isTamilText(text: string): boolean {
  return tamilScriptRatio(text) >= 0.15 || hasTanglish(text);
}

/**
 * Score 0..1 for how Tamil a channel is, from its video titles plus
 * channel description/keywords. Threshold for "Tamil channel" is 0.3.
 */
export function scoreChannelTamil(input: {
  titles: string[];
  description?: string;
  keywords?: string;
  country?: string | null;
  defaultLanguage?: string | null;
}): number {
  const titles = input.titles.filter(Boolean);
  const titleShare = titles.length ? titles.filter(isTamilText).length / titles.length : 0;

  const meta = `${input.description ?? ""} ${input.keywords ?? ""}`;
  let boost = 0;
  if (tamilScriptRatio(meta) >= 0.1) boost += 0.2;
  if (/\btamil\b|தமிழ்/i.test(meta)) boost += 0.15;
  if (input.defaultLanguage?.toLowerCase().startsWith("ta")) boost += 0.3;
  // Country alone means little (most Indian/Sri Lankan channels aren't Tamil) — tiny nudge only
  if (input.country && ["IN", "LK", "MY", "SG"].includes(input.country)) boost += 0.03;

  return Math.min(1, titleShare + boost);
}

export const TAMIL_THRESHOLD = 0.3;

/** Share of titles in each style — tells the AI how this creator writes titles */
export function styleMix(titles: string[]): Record<ScriptStyle, number> {
  const mix: Record<ScriptStyle, number> = { tamil: 0, tanglish: 0, english: 0, mixed: 0 };
  if (!titles.length) return mix;
  for (const t of titles) mix[titleStyle(t)] += 1;
  for (const k of Object.keys(mix) as ScriptStyle[]) mix[k] = mix[k] / titles.length;
  return mix;
}
