# Thiral (திரள்) — YouTube insights for Tamil creators

A creator pastes their channel and gets:

- **Channel health**: normal views for long videos and Shorts, upload rhythm, subscriber growth, best day to post (IST), which title style works (Tamil script, Tanglish, English), and which video length works
- **Breakout videos**: their own videos that beat their normal views, plus the ones that missed
- **Similar Tamil channels**: matched on topics and titles, weighted toward channels of a similar size
- **Outliers among similar channels**: recent videos getting 2×–10× their channel's normal views
- **AI studio**: topic ideas, titles in the creator's own style, thumbnail review (upload or pick a video), and a channel review — all grounded in the real numbers
- **Outliers feed** (`/outliers`) and a **Tamil channel directory** (`/channels`), filterable by niche

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Postgres + Drizzle ORM · YouTube Data API v3 · Claude or OpenAI.

---

## 1. Setup (about 15 minutes)

You need Node.js 20+ and a Postgres database. The free tier of [Supabase](https://supabase.com) or [Neon](https://neon.tech) works.

```bash
npm install
cp .env.example .env      # then fill it in (see below)
npm run db:push           # creates the tables
npm run dev               # http://localhost:3000
```

### Fill in `.env`

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase: Project Settings → Database → Connection string (use the **pooler** URI). Neon: Dashboard → Connection string. |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → create a project → enable **YouTube Data API v3** → Credentials → Create API key. Restrict it to the YouTube Data API. |
| `LLM_PROVIDER` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | console.anthropic.com or platform.openai.com |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | Model to use. Must support images for the thumbnail review. |
| `CRON_SECRET` | Any long random string. Protects the collector endpoint. |

## 2. Fill the Tamil channel database

Similar channels and niche outliers need other Tamil channels in the database. Seed it once:

```bash
npm run seed          # ~30 searches + regional trending charts (~3,100 quota units)
npm run collect       # fetches the queued channels; run again until "pending" is 0
```

Each `collect` run fetches up to 300 channels. With the default 10,000 units/day you can add roughly 1,000–1,500 channels a day. After that, the daily cron keeps everything fresh and keeps discovering new channels on its own (featured channels + trending charts in IN, LK, MY, SG).

Every channel a creator analyses also queues the channels it features, so the database grows with usage.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel.
2. Add every variable from `.env` in **Project → Settings → Environment Variables**.
3. Deploy. `vercel.json` schedules the collector daily at 01:47 IST. Vercel sends `CRON_SECRET` automatically.
4. Hobby plan: functions stop at 60s, so the collector does ~50s of work per run (`COLLECTOR_MAX_SECONDS`). On Pro, set it to `280` and change the cron to run hourly. Or run `npm run collect` from your laptop whenever you like.

## How it works

- **Normal views** = median views of the channel's last 30 videos of the same format that are at least 7 days old. Long videos and Shorts are scored separately.
- **Outlier score** = video views ÷ normal views. 2× is notable, 5× is a hit.
- **Tamil detection** (`src/lib/tamil.ts`) = share of titles in Tamil script or with Tanglish words, plus description and language hints. 0.3+ counts as a Tamil channel.
- **Niche** (`src/lib/niches.ts`) = keyword matching in English and Tamil plus YouTube category ids. Edit the keyword lists to tune it.
- **Similar channels** (`src/lib/similarity.ts`) = TF-IDF over recent titles and description, cosine similarity, adjusted for channel size. No embeddings API needed.
- **Quota** (`src/lib/youtube/client.ts`) = every API call is logged in `quota_log`. Background jobs stop at 80% of the daily limit so creators pasting channels are never blocked.
- **AI** (`src/lib/ai.ts`) = each prompt includes the channel's real outliers and peers' outliers. Results are cached in `ai_results` (ideas and review for 24h). Each visitor is limited to `AI_RATE_LIMIT_PER_HOUR`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `start` | Production build / server |
| `npm test` | Unit tests for parsing, Tamil detection, niches, outlier maths, similarity |
| `npm run typecheck` | TypeScript check |
| `npm run db:push` | Create or update tables from `src/db/schema.ts` |
| `npm run db:studio` | Browse the database |
| `npm run seed` (`-- --deep`) | Queue Tamil channels from search (deep also searches recent popular videos) |
| `npm run collect` (`-- --minutes 5`) | Fetch queued channels, refresh stats, discover more |

## Before launching publicly

- **Privacy policy**: `/privacy` is a starting point. Add your contact email and have it reviewed. Google requires one for a quota increase.
- **Quota increase**: once you have users, apply via the YouTube API Services audit form. It's free.
- **Rate limiting** is in-memory per server instance. For real traffic, move it to Upstash Redis or the database.
- **Not built yet**: user accounts and saved channels, payments (Razorpay for INR, PayHere for LKR), "Connect YouTube" OAuth for private analytics (CTR, retention), email alerts when a peer video breaks out.

## Project layout

```
src/
  app/                  pages + API routes
    api/analyze         paste a channel → ingest
    api/ai/*            ideas, titles, thumbnail, coach
    api/cron/collect    background collector
    channel/[id]        the main report page
    outliers, channels  feed and directory
  components/           UI (AiStudio, ViewsChart, cards)
  db/                   Drizzle schema + connection
  lib/
    youtube/            API client (quota-aware) + URL parsing
    ingest.ts           fetch + store a channel and its videos
    collector.ts        background discovery and refresh
    report.ts           queries for pages and prompts
    stats.ts            medians, outliers, insights
    tamil.ts niches.ts similarity.ts
    ai.ts llm.ts        prompts and the Claude/OpenAI wrapper
scripts/                seed + collect CLIs
tests/                  unit tests
```
