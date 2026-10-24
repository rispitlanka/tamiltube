// AI features: topic ideas, titles, thumbnail critique, channel coach.
// Every prompt is grounded in real numbers from the database — the AI is told
// which videos over-performed and by how much, so its ideas follow evidence.
import { z } from "zod";
import { compact, multiplier, pct } from "./format";
import { cached, completeJSON, type ImageInput } from "./llm";
import { nicheLabel } from "./niches";
import { getChannelReport, getOutliers, getSimilarChannels, type ChannelReport } from "./report";

const SYSTEM = `You are a YouTube strategist who specialises in Tamil-language channels (Tamil Nadu, Sri Lanka, Malaysia, Singapore and the diaspora).
You know Tamil culture, Kollywood, festivals, food, politics-free everyday life, and how Tamil viewers search and click.
Rules:
- Base every suggestion on the data given. When you claim something works, point to the evidence (a video and its multiplier).
- Write titles the way THIS creator writes: match their mix of Tamil script, Tanglish and English. Tamil script must be natural, correctly spelled modern Tamil, not a word-by-word translation.
- No misleading clickbait. Curiosity is fine; lying about the video is not.
- Keep thumbnail text to 4 words or fewer.
- Be specific and practical. Avoid generic advice like "be consistent" unless the data shows a real problem.`;

function styleLine(mix: ChannelReport["stats"]["styleMix"]) {
  return `Title writing style mix: Tamil script ${pct(mix.tamil, 0)}, Tamil+English mixed ${pct(mix.mixed, 0)}, Tanglish ${pct(mix.tanglish, 0)}, English ${pct(mix.english, 0)}.`;
}

async function buildContext(channelId: string) {
  const report = await getChannelReport(channelId);
  if (!report) throw new Error("Channel not found. Analyse it first.");
  const similar = await getSimilarChannels(report.channel, 15);
  const nicheOutliers = await getOutliers({
    channelIds: similar.map((s) => s.id),
    days: 30,
    minScore: 2,
    limit: 25,
  });

  const c = report.channel;
  const lines = [
    `CHANNEL: ${c.title}${c.handle ? ` (@${c.handle})` : ""}`,
    `Niche: ${nicheLabel(c.niche)}. Subscribers: ${compact(c.subscribers)}. Median views — long videos: ${compact(c.medianViewsLong)}, Shorts: ${compact(c.medianViewsShort)}.`,
    `Uploads per week (last 90 days): ${report.stats.uploadsPerWeek}. Long videos: ${report.stats.longCount}, Shorts: ${report.stats.shortCount} (of last ${report.videos.length}).`,
    styleLine(report.stats.styleMix),
    "",
    "THIS CHANNEL'S BEST RECENT VIDEOS (multiplier = views ÷ this channel's normal views):",
    ...report.ownOutliers.slice(0, 8).map((v) => `- ${multiplier(v.outlierScore)} | ${compact(v.views)} views | ${v.isShort ? "Short" : "Long"} | ${v.title}`),
    "",
    "THIS CHANNEL'S WEAKEST RECENT VIDEOS:",
    ...report.underperformers.map((v) => `- ${multiplier(v.outlierScore)} | ${v.title}`),
    "",
    "RECENT TITLES (newest first):",
    ...report.videos.slice(0, 15).map((v) => `- ${v.title}`),
    "",
    "OUTLIER VIDEOS FROM SIMILAR TAMIL CHANNELS (last 30 days):",
    ...(nicheOutliers.length
      ? nicheOutliers.map(
          (v) => `- ${multiplier(v.outlierScore)} | ${compact(v.views)} views | ${v.isShort ? "Short" : "Long"} | ${v.channelTitle} (${compact(v.channelSubs)} subs) | ${v.title}`,
        )
      : ["(none collected yet — rely more on this channel's own data)"]),
  ];
  return { report, similar, nicheOutliers, text: lines.join("\n") };
}

// ---------- Topic ideas ----------

const IdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        titleEnglish: z.string().describe("English meaning of the title"),
        format: z.enum(["long", "short"]),
        angle: z.string(),
        why: z.string(),
        evidence: z.string(),
        hook: z.string().describe("First 10 seconds of the video"),
        thumbnailText: z.string(),
      }),
    )
    .min(3),
});
export type Ideas = z.infer<typeof IdeasSchema>;

export async function topicIdeas(channelId: string, refresh = false) {
  const ctx = await buildContext(channelId);
  const day = new Date().toISOString().slice(0, 10);
  return cached("ideas", { channelId, day, n: ctx.nicheOutliers.length }, channelId, 24, async () => {
    return completeJSON({
      system: SYSTEM,
      schema: IdeasSchema,
      maxTokens: 4000,
      prompt: `${ctx.text}

TASK: Suggest 8 video ideas this creator should make next (mix of long videos and Shorts, matching what they already make).
Each idea must adapt a proven pattern from the outlier lists above to this creator's own style — do not copy titles.
Return JSON: {"ideas":[{"title","titleEnglish","format":"long"|"short","angle","why","evidence","hook","thumbnailText"}]}
- "evidence": name the outlier video(s) and multiplier this idea is based on.
- "why": one sentence on why Tamil viewers would click this now.`,
    });
  }, refresh);
}

// ---------- Title suggestions ----------

const TitlesSchema = z.object({
  titles: z
    .array(
      z.object({
        title: z.string(),
        titleEnglish: z.string(),
        style: z.enum(["tamil", "tanglish", "english", "mixed"]),
        reasoning: z.string(),
      }),
    )
    .min(3),
  keywords: z.array(z.string()).describe("search phrases Tamil viewers might type"),
  advice: z.string(),
});
export type Titles = z.infer<typeof TitlesSchema>;

export async function titleSuggestions(channelId: string, topic: string) {
  const ctx = await buildContext(channelId);
  return cached("titles", { channelId, topic: topic.trim().toLowerCase() }, channelId, 72, () =>
    completeJSON({
      system: SYSTEM,
      schema: TitlesSchema,
      prompt: `${ctx.text}

The creator's video topic or draft title: """${topic.slice(0, 500)}"""

TASK: Write 8 title options for this video. Most should match the creator's usual style mix; include 2 that try a different style if the data suggests it could do better.
Use patterns from the outlier titles above (structure, emotion, specificity, numbers), not their exact words. Keep each under 70 characters where possible.
Return JSON: {"titles":[{"title","titleEnglish","style":"tamil"|"tanglish"|"english"|"mixed","reasoning"}],"keywords":[...6 search phrases],"advice":"one short paragraph"}`,
    }),
  );
}

// ---------- Thumbnail critique ----------

const ThumbSchema = z.object({
  score: z.number().min(1).max(10),
  verdict: z.string(),
  strengths: z.array(z.string()),
  problems: z.array(z.string()),
  fixes: z.array(z.string()),
  textSuggestions: z.array(z.string()).describe("Thumbnail text options, 4 words max each"),
  mobileReadable: z.boolean(),
});
export type ThumbCritique = z.infer<typeof ThumbSchema>;

export async function critiqueThumbnail(channelId: string, image: ImageInput, title: string) {
  const ctx = await buildContext(channelId);
  const topOutlierTitles = [...ctx.report.ownOutliers, ...ctx.nicheOutliers].slice(0, 8).map((v) => `- ${v.title}`);
  const run = () =>
    completeJSON({
      system: SYSTEM,
      schema: ThumbSchema,
      image,
      prompt: `Channel: ${ctx.report.channel.title} — niche: ${nicheLabel(ctx.report.channel.niche)}.
Video title: """${title.slice(0, 200)}"""
Titles of top-performing videos in this niche:
${topOutlierTitles.join("\n")}

TASK: Critique this YouTube thumbnail for Tamil viewers, mostly on phones.
Check: readability at small size, Tamil text rendering and spelling (if any), face/emotion, contrast, clutter, whether it creates curiosity WITH the title rather than repeating it, and whether it would stand out next to typical thumbnails in this niche.
Return JSON: {"score":1-10,"verdict":"one sentence","strengths":[...],"problems":[...],"fixes":[...specific actions],"textSuggestions":[...3 options, ≤4 words, in the creator's style],"mobileReadable":true|false}`,
    });
  // Only cache critiques of public thumbnails; uploads are one-off
  if ("url" in image) return cached("thumb", { channelId, url: image.url, title }, channelId, 168, run);
  return { data: await run(), cached: false };
}

// ---------- Channel coach ----------

const CoachSchema = z.object({
  summary: z.string(),
  working: z.array(z.object({ point: z.string(), evidence: z.string() })),
  notWorking: z.array(z.object({ point: z.string(), evidence: z.string() })),
  actions: z.array(z.object({ action: z.string(), why: z.string() })),
});
export type Coach = z.infer<typeof CoachSchema>;

export async function channelCoach(channelId: string, refresh = false) {
  const ctx = await buildContext(channelId);
  const s = ctx.report.stats;
  const extra = [
    `Best upload days (median multiplier, IST): ${s.bestDays.map((d) => `${d.day} ${multiplier(d.medianScore)} (${d.count} videos)`).join(", ") || "not enough data"}`,
    `Title style performance: ${s.titleStyles.map((t) => `${t.style} ${multiplier(t.medianScore)} (${t.count})`).join(", ") || "not enough data"}`,
    `Long video length performance: ${s.durations.map((d) => `${d.label} ${multiplier(d.medianScore)} (${d.count})`).join(", ") || "not enough data"}`,
    s.titleLength ? `Title length — outliers median ${s.titleLength.outlierMedianChars} chars vs others ${s.titleLength.otherMedianChars}` : "",
    `Median engagement (likes+comments ÷ views): ${pct(s.medianEngagement)}`,
    s.lastUploadDaysAgo !== null ? `Last upload: ${s.lastUploadDaysAgo} days ago` : "",
  ].filter(Boolean);
  const day = new Date().toISOString().slice(0, 10);
  return cached("coach", { channelId, day }, channelId, 24, () =>
    completeJSON({
      system: SYSTEM,
      schema: CoachSchema,
      prompt: `${ctx.text}

PATTERNS:
${extra.join("\n")}

TASK: Give this creator an honest, specific channel review.
Return JSON: {"summary":"2-3 sentences","working":[{"point","evidence"}] (3 items),"notWorking":[{"point","evidence"}] (2-3 items),"actions":[{"action","why"}] (3-5 concrete things to do in the next 2 weeks)}
Write in simple English that a Tamil creator reads easily. Only claim what the numbers support; if data is thin, say so.`,
    }),
  refresh);
}
