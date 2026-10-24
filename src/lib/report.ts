// Read-side queries used by the pages and the AI prompts.
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { channels, channelSnapshots, db, videos, type Channel, type Video } from "@/db";
import { rankSimilar } from "./similarity";
import {
  bestUploadDays,
  durationBuckets,
  engagementRate,
  median,
  titleLengthInsight,
  titleStyleInsight,
  uploadsPerWeek,
} from "./stats";
import { styleMix } from "./tamil";

const DAY = 86_400_000;

export async function getChannelReport(channelId: string) {
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!channel || channel.status !== "active") return null;

  const vids = await db.query.videos.findMany({
    where: eq(videos.channelId, channelId),
    orderBy: desc(videos.publishedAt),
    limit: 100,
  });
  const scores = new Map(vids.map((v) => [v.id, v.outlierScore]));
  const now = new Date();

  const longs = vids.filter((v) => !v.isShort);
  const shorts = vids.filter((v) => v.isShort);

  const growth = await subscriberGrowth(channelId, 30);

  return {
    channel,
    videos: vids,
    stats: {
      uploadsPerWeek: uploadsPerWeek(vids, now),
      longCount: longs.length,
      shortCount: shorts.length,
      medianEngagement: median(vids.filter((v) => v.views > 100).map(engagementRate)),
      bestDays: bestUploadDays(vids, scores),
      titleStyles: titleStyleInsight(vids, scores),
      titleLength: titleLengthInsight(vids, scores),
      durations: durationBuckets(vids, scores),
      styleMix: styleMix(vids.slice(0, 40).map((v) => v.title)),
      subscriberGrowth30d: growth,
      lastUploadDaysAgo: vids[0] ? Math.floor((now.getTime() - vids[0].publishedAt.getTime()) / DAY) : null,
    },
    ownOutliers: [...vids].filter((v) => v.outlierScore >= 1.5).sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 8),
    underperformers: vids
      .filter((v) => now.getTime() - v.publishedAt.getTime() > 7 * DAY && v.outlierScore > 0 && v.outlierScore < 0.5)
      .sort((a, b) => a.outlierScore - b.outlierScore)
      .slice(0, 5),
  };
}

export type ChannelReport = NonNullable<Awaited<ReturnType<typeof getChannelReport>>>;

async function subscriberGrowth(channelId: string, days: number) {
  const since = new Date(Date.now() - days * DAY);
  const snaps = await db
    .select({ subs: channelSnapshots.subscribers, at: channelSnapshots.takenAt })
    .from(channelSnapshots)
    .where(and(eq(channelSnapshots.channelId, channelId), gte(channelSnapshots.takenAt, since)))
    .orderBy(asc(channelSnapshots.takenAt));
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const spanDays = (last.at.getTime() - first.at.getTime()) / DAY;
  if (spanDays < 3) return null;
  return { gained: last.subs - first.subs, overDays: Math.round(spanDays) };
}

type ChannelCard = Pick<Channel, "id" | "title" | "handle" | "thumbnailUrl" | "subscribers" | "niche" | "medianViewsLong" | "videoCount">;

export async function getSimilarChannels(channel: Channel, limit = 12): Promise<(ChannelCard & { score: number })[]> {
  // Fine up to a few thousand channels. Past ~20k, precompute neighbours in the collector instead.
  const candidates = await db
    .select({
      id: channels.id,
      terms: channels.terms,
      subscribers: channels.subscribers,
      niche: channels.niche,
    })
    .from(channels)
    .where(and(eq(channels.isTamil, true), eq(channels.status, "active"), ne(channels.id, channel.id)))
    .limit(5000);

  const ranked = rankSimilar(
    { id: channel.id, terms: channel.terms ?? null, subscribers: channel.subscribers, niche: channel.niche },
    candidates,
    limit,
  );
  if (!ranked.length) return [];

  const rows = await db
    .select({
      id: channels.id,
      title: channels.title,
      handle: channels.handle,
      thumbnailUrl: channels.thumbnailUrl,
      subscribers: channels.subscribers,
      niche: channels.niche,
      medianViewsLong: channels.medianViewsLong,
      videoCount: channels.videoCount,
    })
    .from(channels)
    .where(inArray(channels.id, ranked.map((r) => r.id)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked.flatMap((r) => (byId.has(r.id) ? [{ ...byId.get(r.id)!, score: r.score }] : []));
}

export type OutlierRow = Pick<Video, "id" | "title" | "thumbnailUrl" | "publishedAt" | "views" | "outlierScore" | "isShort" | "durationSec"> & {
  channelId: string;
  channelTitle: string;
  channelThumb: string | null;
  channelSubs: number;
  niche: string;
};

export async function getOutliers(opts: {
  channelIds?: string[];
  niche?: string;
  days?: number;
  format?: "long" | "short" | "all";
  minScore?: number;
  minViews?: number;
  limit?: number;
}): Promise<OutlierRow[]> {
  const { days = 14, format = "all", minScore = 2, minViews = 1000, limit = 30 } = opts;
  const since = new Date(Date.now() - days * DAY);
  const conds = [
    gte(videos.publishedAt, since),
    gte(videos.outlierScore, minScore),
    gte(videos.views, minViews),
    eq(channels.isTamil, true),
  ];
  if (opts.channelIds) {
    if (!opts.channelIds.length) return [];
    conds.push(inArray(videos.channelId, opts.channelIds));
  }
  if (opts.niche && opts.niche !== "all") conds.push(eq(channels.niche, opts.niche));
  if (format !== "all") conds.push(eq(videos.isShort, format === "short"));

  return db
    .select({
      id: videos.id,
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      publishedAt: videos.publishedAt,
      views: videos.views,
      outlierScore: videos.outlierScore,
      isShort: videos.isShort,
      durationSec: videos.durationSec,
      channelId: videos.channelId,
      channelTitle: channels.title,
      channelThumb: channels.thumbnailUrl,
      channelSubs: channels.subscribers,
      niche: channels.niche,
    })
    .from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(and(...conds))
    .orderBy(desc(videos.outlierScore))
    .limit(limit);
}

export async function getRecentChannels(limit = 8) {
  return db
    .select({
      id: channels.id,
      title: channels.title,
      handle: channels.handle,
      thumbnailUrl: channels.thumbnailUrl,
      subscribers: channels.subscribers,
      niche: channels.niche,
    })
    .from(channels)
    .where(and(eq(channels.source, "user"), eq(channels.status, "active")))
    .orderBy(desc(channels.updatedAt))
    .limit(limit);
}

export async function getDirectory(niche?: string, limit = 60) {
  const conds = [eq(channels.isTamil, true), eq(channels.status, "active")];
  if (niche && niche !== "all") conds.push(eq(channels.niche, niche));
  return db
    .select({
      id: channels.id,
      title: channels.title,
      handle: channels.handle,
      thumbnailUrl: channels.thumbnailUrl,
      subscribers: channels.subscribers,
      niche: channels.niche,
      medianViewsLong: channels.medianViewsLong,
      videoCount: channels.videoCount,
    })
    .from(channels)
    .where(and(...conds))
    .orderBy(desc(channels.subscribers))
    .limit(limit);
}

export async function getDbCounts() {
  const [row] = await db
    .select({
      tamilChannels: sql<number>`count(*) filter (where ${channels.isTamil} and ${channels.status} = 'active')`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${channels.status} = 'pending')`.mapWith(Number),
    })
    .from(channels);
  return row ?? { tamilChannels: 0, pending: 0 };
}
