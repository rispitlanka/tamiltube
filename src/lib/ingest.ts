// Pulls a channel and its recent videos from YouTube into our database,
// then recomputes everything derived from them (Tamil score, niche,
// medians, outlier scores, keyword terms).
import { and, desc, eq, sql } from "drizzle-orm";
import { channels, channelSnapshots, db, pg, videos, videoSnapshots, type Channel } from "@/db";
import { classifyNiche } from "./niches";
import { buildTerms } from "./similarity";
import { baselineViews, outlierScores } from "./stats";
import { scoreChannelTamil, TAMIL_THRESHOLD } from "./tamil";
import {
  bestThumb,
  getChannels,
  getFeaturedChannelIds,
  getUploadIds,
  getVideos,
  searchChannels,
  type YTChannel,
  type YTVideo,
} from "./youtube/client";
import { looksLikeShort, parseChannelInput, parseDuration } from "./youtube/parse";

export class NotFoundError extends Error {}

/** Whatever the creator pasted → a channel id (UC...) */
export async function resolveChannelId(input: string): Promise<string> {
  const ref = parseChannelInput(input);
  if (!ref) throw new NotFoundError("That doesn't look like a YouTube channel or video link.");

  switch (ref.kind) {
    case "id":
      return ref.value;
    case "handle": {
      const known = await db.query.channels.findFirst({ where: eq(sql`lower(${channels.handle})`, ref.value.toLowerCase()) });
      if (known) return known.id;
      const [c] = await getChannels({ forHandle: ref.value });
      if (!c) throw new NotFoundError(`No channel found for @${ref.value}.`);
      return c.id;
    }
    case "username": {
      const [c] = await getChannels({ forUsername: ref.value });
      if (!c) throw new NotFoundError(`No channel found for ${ref.value}.`);
      return c.id;
    }
    case "custom": {
      // Most old /c/ names are also the handle today; try that first (1 unit) before search (100 units)
      const [byHandle] = await getChannels({ forHandle: ref.value });
      if (byHandle) return byHandle.id;
      const [first] = await searchChannels(ref.value, { background: false });
      if (!first) throw new NotFoundError(`No channel found for ${ref.value}.`);
      return first;
    }
    case "video": {
      const [v] = await getVideos([ref.value]);
      if (!v) throw new NotFoundError("That video wasn't found (it may be private or removed).");
      return v.snippet.channelId;
    }
  }
}

function channelRow(c: YTChannel, source: string) {
  const handle = c.snippet.customUrl?.replace(/^@/, "") ?? null;
  return {
    id: c.id,
    handle,
    title: c.snippet.title,
    description: c.snippet.description ?? "",
    thumbnailUrl: bestThumb(c.snippet.thumbnails) ?? null,
    country: c.snippet.country ?? null,
    subscribers: Number(c.statistics?.subscriberCount ?? 0),
    hiddenSubs: Boolean(c.statistics?.hiddenSubscriberCount),
    totalViews: Number(c.statistics?.viewCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    publishedAt: c.snippet.publishedAt ? new Date(c.snippet.publishedAt) : null,
    keywords: [c.brandingSettings?.channel?.keywords ?? "", c.snippet.defaultLanguage ? `lang:${c.snippet.defaultLanguage}` : ""]
      .join(" ")
      .trim(),
    source,
    status: "active",
  };
}

function videoRow(v: YTVideo) {
  const durationSec = parseDuration(v.contentDetails?.duration);
  const tags = (v.snippet.tags ?? []).join(", ");
  return {
    id: v.id,
    channelId: v.snippet.channelId,
    title: v.snippet.title,
    description: (v.snippet.description ?? "").slice(0, 2000),
    tags: tags.slice(0, 1000),
    thumbnailUrl: bestThumb(v.snippet.thumbnails) ?? null,
    categoryId: v.snippet.categoryId ?? null,
    publishedAt: new Date(v.snippet.publishedAt),
    durationSec,
    isShort: looksLikeShort(durationSec, `${v.snippet.title} ${v.snippet.description ?? ""} ${tags}`),
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
    lastStatsAt: new Date(),
  };
}

export async function upsertChannels(list: YTChannel[], source: string) {
  if (!list.length) return;
  const rows = list.map((c) => channelRow(c, source));
  await db
    .insert(channels)
    .values(rows)
    .onConflictDoUpdate({
      target: channels.id,
      set: {
        handle: sql`excluded.handle`,
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        thumbnailUrl: sql`excluded.thumbnail_url`,
        country: sql`excluded.country`,
        subscribers: sql`excluded.subscribers`,
        hiddenSubs: sql`excluded.hidden_subs`,
        totalViews: sql`excluded.total_views`,
        videoCount: sql`excluded.video_count`,
        uploadsPlaylist: sql`excluded.uploads_playlist`,
        publishedAt: sql`excluded.published_at`,
        keywords: sql`excluded.keywords`,
        status: sql`'active'`,
        updatedAt: sql`now()`,
      },
    });
  await db.insert(channelSnapshots).values(
    rows.map((r) => ({ channelId: r.id, subscribers: r.subscribers, totalViews: r.totalViews, videoCount: r.videoCount })),
  );
}

/** Saves videos (inserting or updating stats) and records a stats snapshot for each */
export async function upsertVideos(list: YTVideo[]) {
  if (!list.length) return;
  const rows = list.map(videoRow);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await db
      .insert(videos)
      .values(chunk)
      .onConflictDoUpdate({
        target: videos.id,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          tags: sql`excluded.tags`,
          thumbnailUrl: sql`excluded.thumbnail_url`,
          categoryId: sql`excluded.category_id`,
          durationSec: sql`excluded.duration_sec`,
          isShort: sql`excluded.is_short`,
          views: sql`excluded.views`,
          likes: sql`excluded.likes`,
          comments: sql`excluded.comments`,
          lastStatsAt: sql`excluded.last_stats_at`,
        },
      });
    await db
      .insert(videoSnapshots)
      .values(chunk.map((r) => ({ videoId: r.id, views: r.views, likes: r.likes, comments: r.comments })));
  }
}

/** Recompute everything we derive for a channel from the videos we have stored */
export async function recomputeChannel(channelId: string): Promise<Channel | undefined> {
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!channel) return undefined;
  const vids = await db.query.videos.findMany({
    where: eq(videos.channelId, channelId),
    orderBy: desc(videos.publishedAt),
    limit: 150,
  });

  const now = new Date();
  const scores = outlierScores(vids, now);
  if (vids.length) {
    const ids = vids.map((v) => v.id);
    const vals = vids.map((v) => scores.get(v.id) ?? 0);
    await pg`
      update videos as v set outlier_score = d.score
      from (select unnest(${ids}::text[]) as id, unnest(${vals}::float8[]) as score) as d
      where v.id = d.id`;
  }

  const titles = vids.slice(0, 50).map((v) => v.title);
  const lang = /lang:(\S+)/.exec(channel.keywords)?.[1] ?? null;
  const tamilScore = scoreChannelTamil({
    titles,
    description: channel.description,
    keywords: channel.keywords,
    country: channel.country,
    defaultLanguage: lang,
  });
  const nicheTexts = [...vids.slice(0, 50).map((v) => `${v.title} ${v.tags}`), channel.description];
  const niche = classifyNiche(nicheTexts, vids.map((v) => v.categoryId));
  const terms = buildTerms([...titles, channel.description, channel.keywords]);

  const [updated] = await db
    .update(channels)
    .set({
      tamilScore,
      isTamil: tamilScore >= TAMIL_THRESHOLD,
      niche,
      terms,
      medianViewsLong: baselineViews(vids, false, now),
      medianViewsShort: baselineViews(vids, true, now),
      lastVideosAt: now,
      updatedAt: now,
    })
    .where(eq(channels.id, channelId))
    .returning();
  return updated;
}

export type IngestOptions = {
  maxVideos?: number;
  source?: string;
  background?: boolean;
  force?: boolean;
  freshHours?: number;
};

/** Full fetch of one channel. Skips the API if we refreshed it recently. */
export async function ingestChannel(channelId: string, opts: IngestOptions = {}): Promise<Channel> {
  const { maxVideos = 100, source = "user", background = false, force = false, freshHours = 12 } = opts;

  const existing = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (
    !force &&
    existing?.status === "active" &&
    existing.lastVideosAt &&
    Date.now() - existing.lastVideosAt.getTime() < freshHours * 3_600_000
  ) {
    return existing;
  }

  const [yt] = await getChannels({ id: [channelId] }, background);
  if (!yt) {
    if (existing?.status === "pending") await db.delete(channels).where(eq(channels.id, channelId));
    throw new NotFoundError("Channel not found on YouTube.");
  }
  await upsertChannels([yt], existing?.source ?? source);

  const uploads = yt.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    const ids = await getUploadIds(uploads, maxVideos, background);
    const vids = await getVideos(ids, background);
    await upsertVideos(vids);
  }
  const updated = await recomputeChannel(channelId);
  return updated!;
}

/** Remember channels to fetch later (collector picks these up) */
export async function addPendingChannels(ids: string[], source: string) {
  const unique = [...new Set(ids)].filter((id) => /^UC[\w-]{22}$/.test(id));
  if (!unique.length) return 0;
  const inserted = await db
    .insert(channels)
    .values(unique.map((id) => ({ id, source, status: "pending" })))
    .onConflictDoNothing()
    .returning({ id: channels.id });
  return inserted.length;
}

/** Queue the channels this creator features on their page (1 unit) */
export async function discoverFeatured(channelId: string, background = true) {
  try {
    const ids = await getFeaturedChannelIds(channelId, background);
    const added = await addPendingChannels(ids, "related");
    await db.update(channels).set({ exploredAt: new Date() }).where(eq(channels.id, channelId));
    return added;
  } catch (e) {
    console.warn("discoverFeatured failed", channelId, e);
    return 0;
  }
}

/** Refresh view counts for a set of videos (50 per unit) */
export async function refreshVideoStats(videoIds: string[], background = true) {
  if (!videoIds.length) return [];
  const fresh = await getVideos(videoIds, background);
  await upsertVideos(fresh);
  return [...new Set(fresh.map((v) => v.snippet.channelId))];
}

export async function getStoredChannel(id: string) {
  return db.query.channels.findFirst({ where: and(eq(channels.id, id), eq(channels.status, "active")) });
}
