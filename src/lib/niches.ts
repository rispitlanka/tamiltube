// Classifies a channel into a niche from its titles, description and the
// YouTube category ids of its videos. English keywords match whole words;
// Tamil-script keywords match as substrings (Tamil words take suffixes).

export const NICHES = {
  cinema: { label: "Cinema & reviews", ta: "சினிமா" },
  cooking: { label: "Cooking", ta: "சமையல்" },
  food: { label: "Food reviews", ta: "உணவு" },
  tech: { label: "Tech", ta: "தொழில்நுட்பம்" },
  gaming: { label: "Gaming", ta: "கேமிங்" },
  comedy: { label: "Comedy", ta: "காமெடி" },
  vlog: { label: "Vlogs & travel", ta: "வ்லாக்" },
  education: { label: "Education", ta: "கல்வி" },
  finance: { label: "Finance & business", ta: "பணம்" },
  devotional: { label: "Devotional", ta: "ஆன்மீகம்" },
  news: { label: "News & politics", ta: "செய்திகள்" },
  music: { label: "Music", ta: "இசை" },
  beauty: { label: "Beauty & fashion", ta: "அழகு" },
  health: { label: "Health & fitness", ta: "ஆரோக்கியம்" },
  kids: { label: "Kids", ta: "குழந்தைகள்" },
  farming: { label: "Farming & village", ta: "விவசாயம்" },
  general: { label: "General", ta: "பொது" },
} as const;

export type Niche = keyof typeof NICHES;

const KEYWORDS: Record<Exclude<Niche, "general">, string[]> = {
  cinema: ["movie", "review", "trailer", "teaser", "cinema", "kollywood", "box office", "thalapathy", "vijay", "ajith", "rajini", "rajinikanth", "kamal", "dhanush", "sivakarthikeyan", "padam", "படம்", "சினிமா", "விமர்சனம்", "ott", "bigg boss", "serial"],
  cooking: ["recipe", "recipes", "cooking", "samayal", "kitchen", "biryani", "kuzhambu", "kulambu", "rasam", "chutney", "sambar", "poriyal", "சமையல்", "குழம்பு", "ரெசிபி", "செய்வது எப்படி"],
  food: ["food review", "street food", "food vlog", "restaurant", "hotel review", "mukbang", "eating challenge", "unlimited meals", "சாப்பாடு", "உணவு"],
  tech: ["tech", "mobile", "smartphone", "unboxing", "laptop", "gadget", "gadgets", "iphone", "samsung", "android", "camera review", "coding", "programming", "chatgpt", "ai tools", "டெக்", "மொபைல்"],
  gaming: ["gaming", "gameplay", "gamer", "gta", "minecraft", "free fire", "freefire", "bgmi", "pubg", "valorant", "live stream", "walkthrough", "கேம்"],
  comedy: ["comedy", "prank", "funny", "sketch", "spoof", "fun", "troll", "memes", "காமெடி", "நகைச்சுவை"],
  vlog: ["vlog", "travel", "trip", "tour", "day in my life", "village life", "abroad", "dubai", "london", "canada", "பயணம்", "வ்லாக்"],
  education: ["tnpsc", "upsc", "neet", "exam", "class", "tutorial", "lesson", "learn", "maths", "science", "english speaking", "spoken english", "gk", "history", "கல்வி", "பாடம்", "தேர்வு"],
  finance: ["stock", "stocks", "share market", "trading", "investment", "invest", "mutual fund", "money", "finance", "crypto", "business", "loan", "tax", "பணம்", "முதலீடு", "பங்குச்சந்தை"],
  devotional: ["temple", "murugan", "amman", "perumal", "shiva", "god", "bhakti", "devotional", "pooja", "kovil", "koil", "astrology", "rasi palan", "கோவில்", "முருகன்", "பக்தி", "ராசி"],
  news: ["news", "breaking", "politics", "election", "minister", "dmk", "admk", "bjp", "tvk", "parliament", "செய்தி", "செய்திகள்", "அரசியல்"],
  music: ["song", "songs", "cover", "music", "karaoke", "bgm", "lyrics", "singing", "instrumental", "பாடல்", "இசை"],
  beauty: ["makeup", "beauty", "skincare", "skin care", "saree", "fashion", "hair care", "hairstyle", "mehndi", "அழகு"],
  health: ["fitness", "workout", "gym", "health", "diet", "weight loss", "yoga", "siddha", "ayurveda", "doctor", "ஆரோக்கியம்", "உடல்"],
  kids: ["kids", "rhymes", "cartoon", "baby", "children", "nursery", "குழந்தை", "பாப்பா"],
  farming: ["farming", "agriculture", "farm", "organic", "village", "cow", "goat", "poultry", "விவசாயம்", "கிராமம்"],
};

// YouTube category ids → niche nudges
const CATEGORY_HINTS: Record<string, Niche> = {
  "1": "cinema",
  "10": "music",
  "20": "gaming",
  "23": "comedy",
  "25": "news",
  "26": "beauty",
  "27": "education",
  "28": "tech",
  "19": "vlog",
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS = Object.fromEntries(
  Object.entries(KEYWORDS).map(([niche, words]) => {
    const latin = words.filter((w) => /^[\x00-\x7F]+$/.test(w));
    const tamil = words.filter((w) => !/^[\x00-\x7F]+$/.test(w));
    return [
      niche,
      {
        latin: latin.length ? new RegExp(`\\b(${latin.map(escapeRe).join("|")})\\b`, "gi") : null,
        tamil,
      },
    ];
  }),
) as Record<Exclude<Niche, "general">, { latin: RegExp | null; tamil: string[] }>;

export function nicheScores(texts: string[], categoryIds: (string | null | undefined)[] = []) {
  const scores: Partial<Record<Niche, number>> = {};
  for (const text of texts) {
    for (const [niche, m] of Object.entries(MATCHERS) as [Exclude<Niche, "general">, (typeof MATCHERS)[keyof typeof MATCHERS]][]) {
      let hit = 0;
      if (m.latin) hit += (text.match(m.latin)?.length ?? 0) > 0 ? 1 : 0;
      if (m.tamil.some((w) => text.includes(w))) hit += 1;
      if (hit) scores[niche] = (scores[niche] ?? 0) + Math.min(hit, 1);
    }
  }
  const catCounts: Record<string, number> = {};
  for (const c of categoryIds) if (c) catCounts[c] = (catCounts[c] ?? 0) + 1;
  for (const [cat, count] of Object.entries(catCounts)) {
    const niche = CATEGORY_HINTS[cat];
    if (niche) scores[niche] = (scores[niche] ?? 0) + count * 0.5;
  }
  return scores;
}

export function classifyNiche(texts: string[], categoryIds: (string | null | undefined)[] = []): Niche {
  const scores = nicheScores(texts, categoryIds);
  let best: Niche = "general";
  let bestScore = 0;
  for (const [niche, score] of Object.entries(scores) as [Niche, number][]) {
    if (score > bestScore) {
      best = niche;
      bestScore = score;
    }
  }
  // Need a real signal: at least ~15% of items, or 3 hits, before committing
  const needed = Math.max(2, Math.min(3, texts.length * 0.15));
  return bestScore >= needed ? best : "general";
}

export function nicheLabel(n: string) {
  return (NICHES as Record<string, { label: string }>)[n]?.label ?? "General";
}
