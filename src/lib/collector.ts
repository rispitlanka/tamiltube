// Background jobs that grow and refresh the Tamil channel database.
// Every step is budgeted by time and quota so it fits a serverless run.
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { channels, db, videos } from "@/db";
import { addPendingChannels, discoverFeatured, ingestChannel, NotFoundError, recomputeChannel, refreshVideoStats } from "./ingest";
import { isTamilText } from "./tamil";
import { getMostPopular, QuotaExceededError, quotaUsedToday, searchChannels, searchRecentVideosChannels } from "./youtube/client";

const DAY = 86_400_000;

export type CollectReport = {
  ingested: number;
  failed: number;
  statsRefreshed: number;
  channelsRefreshed: number;
  discovered: number;
  quotaUsedToday: number;
  stoppedBecause?: string;
  ms: number;
};

/**
 * One collector run:
 *  1. Fetch channels discovered earlier (pending)
 *  2. Refresh view counts of recent videos (cheap: 50 videos per unit)
 *  3. Check active Tamil channels for new uploads
 *  4. Discover more channels (featured channels + regional trending charts)
 */
export async function runCollector(opts: { maxMs?: number; maxPending?: number; maxRefresh?: number } = {}): Promise<CollectReport> {
  const started = Date.now();
  const { maxMs = 240_000, maxPending = 40, maxRefresh = 40 } = opts;
  const timeLeft = () => maxMs - (Date.now() - started);
  const report: CollectReport = { ingested: 0, failed: 0, statsRefreshed: 0, channelsRefreshed: 0, discovered: 0, quotaUsedToday: 0, ms: 0 };

  try {
    // 1. Pending channels
    const pending = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.status, "pending"))
      .orderBy(asc(channels.createdAt))
      .limit(maxPending);
    for (const { id } of pending) {
      if (timeLeft() < 20_000) break;
      try {
        const c = await ingestChannel(id, { background: true, source: "related", maxVideos: 50, force: true });
        report.ingested++;
        // Not Tamil? keep the row (so we don't rediscover it) but drop its videos to save space
        if (!c.isTamil) await db.delete(videos).where(eq(videos.channelId, id));
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        if (e instanceof NotFoundError) await db.delete(channels).where(eq(channels.id, id));
        report.failed++;
      }
    }

    // 2. Refresh stats for videos from the last 30 days on Tamil channels
    if (timeLeft() > 30_000) {
      const recent = await db
        .select({ id: videos.id })
        .from(videos)
        .innerJoin(channels, eq(videos.channelId, channels.id))
        .where(
          and(
            eq(channels.isTamil, true),
            gte(videos.publishedAt, new Date(Date.now() - 30 * DAY)),
            lt(videos.lastStatsAt, new Date(Date.now() - 20 * 3_600_000)),
          ),
        )
        .orderBy(asc(videos.lastStatsAt))
        .limit(2500);
      const touched = new Set<string>();
      for (let i = 0; i < recent.length && timeLeft() > 20_000; i += 50) {
        const chunk = recent.slice(i, i + 50).map((r) => r.id);
        for (const ch of await refreshVideoStats(chunk, true)) touched.add(ch);
        report.statsRefreshed += chunk.length;
      }
      for (const ch of touched) await recomputeChannel(ch);
    }

    // 3. New uploads: refresh Tamil channels not checked in 24h
    if (timeLeft() > 30_000) {
      const stale = await db
        .select({ id: channels.id })
        .from(channels)
        .where(
          and(
            eq(channels.status, "active"),
            or(eq(channels.isTamil, true), eq(channels.source, "user")),
            or(isNull(channels.lastVideosAt), lt(channels.lastVideosAt, new Date(Date.now() - DAY))),
          ),
        )
        .orderBy(asc(channels.lastVideosAt))
        .limit(maxRefresh);
      for (const { id } of stale) {
        if (timeLeft() < 20_000) break;
        try {
          await ingestChannel(id, { background: true, maxVideos: 50, force: true });
          report.channelsRefreshed++;
        } catch (e) {
          if (e instanceof QuotaExceededError) throw e;
          report.failed++;
        }
      }
    }

    // 4. Discovery
    if (timeLeft() > 20_000) report.discovered += await discoverFromTrending();
    if (timeLeft() > 20_000) {
      const unexplored = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.isTamil, true), eq(channels.status, "active"), isNull(channels.exploredAt)))
        .orderBy(desc(channels.subscribers))
        .limit(30);
      for (const { id } of unexplored) {
        if (timeLeft() < 10_000) break;
        report.discovered += await discoverFeatured(id, true);
      }
    }
  } catch (e) {
    if (e instanceof QuotaExceededError) report.stoppedBecause = e.message;
    else throw e;
  }

  report.quotaUsedToday = await quotaUsedToday().catch(() => -1);
  report.ms = Date.now() - started;
  return report;
}

/** Trending charts in Tamil-speaking regions — 1 unit per chart, filtered to Tamil titles */
export async function discoverFromTrending(): Promise<number> {
  const regions = ["IN", "LK", "MY", "SG"];
  const categories: (string | undefined)[] = [undefined, "24", "10", "1", "23", "20", "22", "26", "28"];
  let added = 0;
  for (const region of regions) {
    for (const cat of categories) {
      try {
        const vids = await getMostPopular(region, cat, true);
        const tamilChannels = vids.filter((v) => isTamilText(`${v.snippet.title} ${(v.snippet.tags ?? []).join(" ")}`) || v.snippet.defaultAudioLanguage?.startsWith("ta"));
        added += await addPendingChannels(tamilChannels.map((v) => v.snippet.channelId), "trending");
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        // Some region/category combos aren't available — skip quietly
      }
    }
  }
  return added;
}

// Search queries for the one-time seed. Each costs 100 units, so ~30 queries ≈ 3,000 units.
export const SEED_QUERIES = [
  "tamil cooking channel", "samayal tamil", "tamil food review", "tamil street food vlog",
  "tamil tech review", "tamil mobile unboxing", "tamil gaming", "tamil movie review",
  "tamil comedy", "tamil prank", "tamil vlog", "tamil travel vlog", "village vlog tamil",
  "tamil education tnpsc", "spoken english in tamil", "share market tamil", "tamil business ideas",
  "tamil devotional", "tamil news", "tamil cover song", "tamil beauty tips", "tamil fitness",
  "tamil kids rhymes", "tamil farming", "jaffna tamil vlog", "sri lanka tamil youtube",
  "malaysia tamil vlog", "canada tamil vlog", "tamil podcast", "tamil motivation",
];

export async function seedDiscovery(opts: { queries?: string[]; includeRecentVideos?: boolean } = {}) {
  const queries = opts.queries ?? SEED_QUERIES;
  let added = 0;
  for (const q of queries) {
    try {
      added += await addPendingChannels(await searchChannels(q, { background: true }), "seed");
      if (opts.includeRecentVideos) added += await addPendingChannels(await searchRecentVideosChannels(q, 14, true), "seed");
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        console.warn("Seed stopped:", e.message);
        break;
      }
      console.warn("Seed query failed", q, e);
    }
  }
  return added;
}

export async function pendingCount() {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(channels).where(eq(channels.status, "pending"));
  return r?.n ?? 0;
}
