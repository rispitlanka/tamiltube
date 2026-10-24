import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const channels = pgTable(
  "channels",
  {
    id: text("id").primaryKey(), // YouTube channel id (UC...)
    handle: text("handle"),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    country: text("country"),
    subscribers: integer("subscribers").notNull().default(0),
    hiddenSubs: boolean("hidden_subs").notNull().default(false),
    totalViews: bigint("total_views", { mode: "number" }).notNull().default(0),
    videoCount: integer("video_count").notNull().default(0),
    uploadsPlaylist: text("uploads_playlist"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    keywords: text("keywords").notNull().default(""),
    tamilScore: doublePrecision("tamil_score").notNull().default(0), // 0..1
    isTamil: boolean("is_tamil").notNull().default(false),
    niche: text("niche").notNull().default("general"),
    medianViewsLong: integer("median_views_long").notNull().default(0),
    medianViewsShort: integer("median_views_short").notNull().default(0),
    terms: jsonb("terms").$type<Record<string, number>>(), // keyword counts for similarity
    source: text("source").notNull().default("user"), // user | seed | related | trending
    status: text("status").notNull().default("active"), // pending | active
    exploredAt: timestamp("explored_at", { withTimezone: true }),
    lastVideosAt: timestamp("last_videos_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("channels_tamil_niche_idx").on(t.isTamil, t.niche),
    index("channels_status_idx").on(t.status),
    index("channels_handle_idx").on(t.handle),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").notNull().default(""),
    thumbnailUrl: text("thumbnail_url"),
    categoryId: text("category_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec").notNull().default(0),
    isShort: boolean("is_short").notNull().default(false),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    outlierScore: doublePrecision("outlier_score").notNull().default(0),
    lastStatsAt: timestamp("last_stats_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("videos_channel_published_idx").on(t.channelId, t.publishedAt),
    index("videos_published_outlier_idx").on(t.publishedAt, t.outlierScore),
  ],
);

export const videoSnapshots = pgTable(
  "video_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
  },
  (t) => [index("video_snapshots_video_idx").on(t.videoId, t.takenAt)],
);

export const channelSnapshots = pgTable(
  "channel_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    subscribers: integer("subscribers").notNull(),
    totalViews: bigint("total_views", { mode: "number" }).notNull(),
    videoCount: integer("video_count").notNull(),
  },
  (t) => [index("channel_snapshots_channel_idx").on(t.channelId, t.takenAt)],
);

// Cached AI results so the same request doesn't cost twice
export const aiResults = pgTable(
  "ai_results",
  {
    id: text("id").primaryKey(), // hash of kind + input
    kind: text("kind").notNull(),
    channelId: text("channel_id"),
    output: jsonb("output").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_results_channel_idx").on(t.channelId, t.kind)],
);

// Daily YouTube API quota usage, so background jobs leave room for real users
export const quotaLog = pgTable("quota_log", {
  day: text("day").primaryKey(), // YYYY-MM-DD in Pacific time (Google's reset)
  units: integer("units").notNull().default(0),
});

export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
