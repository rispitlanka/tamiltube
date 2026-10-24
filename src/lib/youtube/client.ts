// Thin YouTube Data API v3 client with quota accounting.
// Costs (units): channels/videos/playlistItems/channelSections list = 1, search.list = 100.
// Default project quota is 10,000 units/day; it resets at midnight Pacific time.
import { sql as rawSql } from "drizzle-orm";
import { db, quotaLog } from "@/db";

const BASE = "https://www.googleapis.com/youtube/v3";

export class QuotaExceededError extends Error {}
export class YouTubeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

const DAILY_LIMIT = Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10_000);
// Background jobs stop at this many units so creators pasting channels never get blocked
const BACKGROUND_CEILING = Math.floor(DAILY_LIMIT * 0.8);

export async function quotaUsedToday(): Promise<number> {
  const rows = await db.select().from(quotaLog).where(rawSql`${quotaLog.day} = ${quotaDay()}`);
  return rows[0]?.units ?? 0;
}

async function chargeQuota(units: number, background: boolean) {
  const day = quotaDay();
  const [row] = await db
    .insert(quotaLog)
    .values({ day, units })
    .onConflictDoUpdate({ target: quotaLog.day, set: { units: rawSql`${quotaLog.units} + ${units}` } })
    .returning();
  const ceiling = background ? BACKGROUND_CEILING : DAILY_LIMIT;
  if (row.units > ceiling) {
    throw new QuotaExceededError(
      background
        ? `Background quota ceiling reached (${row.units}/${ceiling} units today).`
        : "YouTube API daily quota is used up. It resets at midnight Pacific time.",
    );
  }
}

type Params = Record<string, string | number | undefined>;

async function call<T>(endpoint: string, params: Params, cost: number, background: boolean): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set.");
  await chargeQuota(cost, background);

  const qs = new URLSearchParams({ key });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, { cache: "no-store" });
  if (!res.ok) {
    let msg = `YouTube API ${endpoint} failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      const reason = body.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded") throw new QuotaExceededError("YouTube API daily quota is used up.");
      if (body.error?.message) msg += `: ${body.error.message}`;
    } catch (e) {
      if (e instanceof QuotaExceededError) throw e;
    }
    throw new YouTubeError(msg, res.status);
  }
  return (await res.json()) as T;
}

// ---- Response shapes (only the fields we use) ----

export type YTChannel = {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    publishedAt: string;
    country?: string;
    defaultLanguage?: string;
    thumbnails?: Record<string, { url: string }>;
  };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  brandingSettings?: { channel?: { keywords?: string; defaultLanguage?: string } };
};

export type YTVideo = {
  id: string;
  snippet: {
    channelId: string;
    title: string;
    description: string;
    publishedAt: string;
    tags?: string[];
    categoryId?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Record<string, { url: string }>;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

type ListResponse<T> = { items?: T[]; nextPageToken?: string };

const CHANNEL_PARTS = "snippet,statistics,contentDetails,brandingSettings";

export async function getChannels(
  by: { id?: string[]; forHandle?: string; forUsername?: string },
  background = false,
): Promise<YTChannel[]> {
  const out: YTChannel[] = [];
  if (by.id?.length) {
    for (let i = 0; i < by.id.length; i += 50) {
      const r = await call<ListResponse<YTChannel>>("channels", { part: CHANNEL_PARTS, id: by.id.slice(i, i + 50).join(","), maxResults: 50 }, 1, background);
      out.push(...(r.items ?? []));
    }
    return out;
  }
  const r = await call<ListResponse<YTChannel>>(
    "channels",
    { part: CHANNEL_PARTS, forHandle: by.forHandle ? `@${by.forHandle}` : undefined, forUsername: by.forUsername },
    1,
    background,
  );
  return r.items ?? [];
}

export async function getUploadIds(playlistId: string, max = 100, background = false): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    const r = await call<ListResponse<{ contentDetails: { videoId: string } }>>(
      "playlistItems",
      { part: "contentDetails", playlistId, maxResults: 50, pageToken },
      1,
      background,
    );
    ids.push(...(r.items ?? []).map((i) => i.contentDetails.videoId));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return ids.slice(0, max);
}

export async function getVideos(ids: string[], background = false): Promise<YTVideo[]> {
  const out: YTVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call<ListResponse<YTVideo>>(
      "videos",
      { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), maxResults: 50 },
      1,
      background,
    );
    out.push(...(r.items ?? []));
  }
  return out;
}

/** Channels a creator features on their own channel page — cheap, high-quality discovery */
export async function getFeaturedChannelIds(channelId: string, background = true): Promise<string[]> {
  const r = await call<ListResponse<{ contentDetails?: { channels?: string[] } }>>(
    "channelSections",
    { part: "contentDetails", channelId },
    1,
    background,
  );
  return [...new Set((r.items ?? []).flatMap((s) => s.contentDetails?.channels ?? []))];
}

/** Trending chart for a region — 1 unit for up to 50 videos */
export async function getMostPopular(regionCode: string, categoryId?: string, background = true): Promise<YTVideo[]> {
  const r = await call<ListResponse<YTVideo>>(
    "videos",
    { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode, videoCategoryId: categoryId, maxResults: 50 },
    1,
    background,
  );
  return r.items ?? [];
}

/** search.list costs 100 units — only used for seeding and as a last resort for /c/ URLs */
export async function searchChannels(q: string, opts: { regionCode?: string; background?: boolean } = {}): Promise<string[]> {
  const r = await call<ListResponse<{ id: { channelId?: string }; snippet: { channelId: string } }>>(
    "search",
    { part: "snippet", type: "channel", q, maxResults: 50, relevanceLanguage: "ta", regionCode: opts.regionCode },
    100,
    opts.background ?? true,
  );
  return [...new Set((r.items ?? []).map((i) => i.id.channelId ?? i.snippet.channelId))];
}

export async function searchRecentVideosChannels(q: string, days = 14, background = true): Promise<string[]> {
  const publishedAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = await call<ListResponse<{ snippet: { channelId: string } }>>(
    "search",
    { part: "snippet", type: "video", q, order: "viewCount", maxResults: 50, relevanceLanguage: "ta", publishedAfter },
    100,
    background,
  );
  return [...new Set((r.items ?? []).map((i) => i.snippet.channelId))];
}

export function bestThumb(thumbs?: Record<string, { url: string }>): string | undefined {
  if (!thumbs) return undefined;
  return (thumbs.maxres ?? thumbs.standard ?? thumbs.high ?? thumbs.medium ?? thumbs.default)?.url;
}
