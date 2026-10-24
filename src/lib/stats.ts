// Core numbers: medians, outlier scores, upload rhythm, best days, title insights.
import { titleStyle, type ScriptStyle } from "./tamil";

export type VideoLike = {
  id: string;
  title: string;
  publishedAt: Date;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
  isShort: boolean;
};

const DAY = 86_400_000;

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Baseline = median views of the channel's last 30 videos of the same format
 * that are at least `minAgeDays` old (fresh videos haven't finished growing).
 * Falls back to all recent videos if there aren't enough mature ones.
 */
export function baselineViews(videos: VideoLike[], isShort: boolean, now = new Date(), minAgeDays = 7): number {
  const sameFormat = videos
    .filter((v) => v.isShort === isShort)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const mature = sameFormat.filter((v) => now.getTime() - v.publishedAt.getTime() >= minAgeDays * DAY).slice(0, 30);
  const pool = mature.length >= 5 ? mature : sameFormat.slice(0, 30);
  return Math.round(median(pool.map((v) => v.views)));
}

/** views ÷ channel baseline for that format. 3+ is a strong outlier. */
export function outlierScores(videos: VideoLike[], now = new Date()): Map<string, number> {
  const base = { long: baselineViews(videos, false, now), short: baselineViews(videos, true, now) };
  const out = new Map<string, number>();
  for (const v of videos) {
    const b = v.isShort ? base.short : base.long;
    out.set(v.id, b > 0 ? round2(v.views / b) : 0);
  }
  return out;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function uploadsPerWeek(videos: VideoLike[], now = new Date(), windowDays = 90): number {
  const recent = videos.filter((v) => now.getTime() - v.publishedAt.getTime() <= windowDays * DAY);
  return round2(recent.length / (windowDays / 7));
}

export function engagementRate(v: Pick<VideoLike, "views" | "likes" | "comments">): number {
  return v.views > 0 ? (v.likes + v.comments) / v.views : 0;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Which weekday's uploads perform best, measured by median outlier score.
 * Uses IST/SLST (UTC+5:30), where most Tamil viewers are.
 */
export function bestUploadDays(videos: VideoLike[], scores: Map<string, number>) {
  const byDay: number[][] = Array.from({ length: 7 }, () => []);
  for (const v of videos) {
    const local = new Date(v.publishedAt.getTime() + 5.5 * 3_600_000);
    byDay[local.getUTCDay()].push(scores.get(v.id) ?? 0);
  }
  return byDay
    .map((arr, i) => ({ day: WEEKDAYS[i], count: arr.length, medianScore: round2(median(arr)) }))
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.medianScore - a.medianScore);
}

/** Do Tamil-script, Tanglish or English titles do better on this channel? */
export function titleStyleInsight(videos: VideoLike[], scores: Map<string, number>) {
  const groups: Record<ScriptStyle, number[]> = { tamil: [], tanglish: [], english: [], mixed: [] };
  for (const v of videos) groups[titleStyle(v.title)].push(scores.get(v.id) ?? 0);
  return (Object.keys(groups) as ScriptStyle[])
    .map((style) => ({ style, count: groups[style].length, medianScore: round2(median(groups[style])) }))
    .filter((g) => g.count >= 3)
    .sort((a, b) => b.medianScore - a.medianScore);
}

/** Title length sweet spot: compares outliers (≥2×) against the rest */
export function titleLengthInsight(videos: VideoLike[], scores: Map<string, number>) {
  const top = videos.filter((v) => (scores.get(v.id) ?? 0) >= 2).map((v) => [...v.title].length);
  const rest = videos.filter((v) => (scores.get(v.id) ?? 0) < 2).map((v) => [...v.title].length);
  if (top.length < 2 || rest.length < 3) return null;
  return { outlierMedianChars: median(top), otherMedianChars: median(rest) };
}

export function durationBuckets(videos: VideoLike[], scores: Map<string, number>) {
  const buckets = [
    { label: "Under 5 min", min: 61, max: 300 },
    { label: "5–10 min", min: 301, max: 600 },
    { label: "10–20 min", min: 601, max: 1200 },
    { label: "20+ min", min: 1201, max: Infinity },
  ];
  return buckets
    .map((b) => {
      const s = videos
        .filter((v) => !v.isShort && v.durationSec >= b.min && v.durationSec <= b.max)
        .map((v) => scores.get(v.id) ?? 0);
      return { label: b.label, count: s.length, medianScore: round2(median(s)) };
    })
    .filter((b) => b.count >= 2);
}
