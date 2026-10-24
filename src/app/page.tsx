import Link from "next/link";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { ChannelRow, VideoCard } from "@/components/ui";
import { getDbCounts, getOutliers, getRecentChannels } from "@/lib/report";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function loadHome() {
  try {
    const [outliers, recent, counts] = await Promise.all([
      getOutliers({ days: 7, minScore: 3, limit: 8 }),
      getRecentChannels(6),
      getDbCounts(),
    ]);
    return { outliers, recent, counts, dbError: false };
  } catch (e) {
    console.error("Home data failed", e);
    return { outliers: [], recent: [], counts: { tamilChannels: 0, pending: 0 }, dbError: true };
  }
}

const FEATURES = [
  { title: "Channel health", body: "Views, upload rhythm, best days to post and which title style works for you — Tamil script, Tanglish or English." },
  { title: "Outlier videos", body: "Videos that got 3×, 5×, 10× their channel's normal views. The clearest signal of what Tamil viewers want right now." },
  { title: "Similar channels", body: "Tamil channels like yours, of a similar size, so you learn from peers rather than giants." },
  { title: "AI studio", body: "Topic ideas, titles in your own style, thumbnail reviews and an honest channel review — all based on real numbers." },
];

export default async function Home() {
  const { outliers, recent, counts, dbError } = await loadHome();

  return (
    <>
      <section className="relative -mx-4 overflow-hidden px-4 pb-14 pt-16 sm:pt-24">
        <div className="kolam-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="ta text-sm font-medium text-kolam" lang="ta">
            தமிழ் YouTube படைப்பாளர்களுக்காக
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{SITE.tagline}</h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-ink-soft sm:text-lg">
            Paste your channel. See what's working, which videos are breaking out in your niche, and what to make next.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <AnalyzeForm />
            <p className="mt-3 text-xs text-ink-mute">Works with @handles, channel links, or any video link from the channel.</p>
          </div>
          {counts.tamilChannels > 0 && (
            <p className="mt-6 text-xs text-ink-mute">Tracking {counts.tamilChannels.toLocaleString()} Tamil channels</p>
          )}
        </div>
      </section>

      {dbError && (
        <div className="card mb-8 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Can't reach the database. Check <code>DATABASE_URL</code> in your <code>.env</code> and run <code>npm run db:push</code>.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <h3 className="font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-ink-soft">{f.body}</p>
          </div>
        ))}
      </section>

      {outliers.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Breaking out this week</h2>
              <p className="mt-1 text-sm text-ink-soft">Tamil videos getting 3× or more their channel's normal views.</p>
            </div>
            <Link href="/outliers" className="text-sm font-medium text-kolam hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {outliers.map((v) => (
              <VideoCard key={v.id} {...v} channel={{ id: v.channelId, title: v.channelTitle, subs: v.channelSubs }} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-display text-2xl font-semibold">Recently analysed</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((c) => (
              <ChannelRow key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
