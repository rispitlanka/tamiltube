import type { Metadata } from "next";
import Link from "next/link";
import { AiStudio } from "@/components/AiStudio";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { RefreshButton } from "@/components/RefreshButton";
import { Avatar, ChannelRow, Empty, OutlierBadge, SectionTitle, Stat, VideoCard } from "@/components/ui";
import { ViewsChart } from "@/components/ViewsChart";
import { compact, multiplier, pct, timeAgo } from "@/lib/format";
import { nicheLabel } from "@/lib/niches";
import { getChannelReport, getOutliers, getSimilarChannels } from "@/lib/report";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const report = await getChannelReport(id).catch(() => null);
  return { title: report ? `${report.channel.title} — channel insights` : "Channel" };
}

const STYLE_LABEL: Record<string, string> = { tamil: "Tamil script", tanglish: "Tanglish", english: "English", mixed: "Tamil + English" };

export default async function ChannelPage({ params }: Props) {
  const { id } = await params;
  const report = await getChannelReport(id);

  if (!report) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">We haven't analysed this channel yet</h1>
        <p className="mt-2 text-ink-soft">Paste its link to run the analysis.</p>
        <div className="mt-6">
          <AnalyzeForm initial={id} />
        </div>
      </div>
    );
  }

  const { channel: c, stats, videos } = report;
  const similar = await getSimilarChannels(c, 12);
  // Peers = the 12 shown plus a wider ring of 30, so the outlier feed isn't empty for small niches
  const peerPool = similar.length < 12 ? similar : await getSimilarChannels(c, 30);
  const peerOutliers = await getOutliers({ channelIds: peerPool.map((s) => s.id), days: 21, minScore: 2, limit: 12 });

  const longs = videos.filter((v) => !v.isShort);
  const shorts = videos.filter((v) => v.isShort);
  const bestDay = stats.bestDays[0];
  const bestStyle = stats.titleStyles[0];

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={c.thumbnailUrl} alt={c.title} size={72} />
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="ta break-words font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl" lang="ta">
            {c.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            {c.handle && (
              <a href={`https://www.youtube.com/@${c.handle}`} target="_blank" rel="noreferrer" className="hover:text-kolam">
                @{c.handle}
              </a>
            )}
            <span>{nicheLabel(c.niche)}</span>
            {c.country && <span>{c.country}</span>}
            <span className="text-ink-mute">Updated {timeAgo(c.lastVideosAt ?? c.updatedAt)}</span>
          </div>
        </div>
        <RefreshButton input={c.id} />
      </div>

      {!c.isTamil && (
        <div className="card mt-6 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This channel doesn't look like a Tamil channel, so similar channels and niche outliers may be thin. Everything else still works.
        </div>
      )}

      {/* Key numbers */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Subscribers"
          value={c.hiddenSubs ? "Hidden" : compact(c.subscribers)}
          hint={stats.subscriberGrowth30d ? `${stats.subscriberGrowth30d.gained >= 0 ? "+" : ""}${compact(stats.subscriberGrowth30d.gained)} in ${stats.subscriberGrowth30d.overDays} days` : undefined}
        />
        <Stat label="Normal views · long" value={compact(c.medianViewsLong)} hint={`median of recent long videos`} />
        <Stat label="Normal views · Shorts" value={shorts.length ? compact(c.medianViewsShort) : "—"} hint={`${shorts.length} Shorts in last ${videos.length}`} />
        <Stat
          label="Uploads / week"
          value={String(stats.uploadsPerWeek)}
          hint={stats.lastUploadDaysAgo !== null ? `last upload ${stats.lastUploadDaysAgo === 0 ? "today" : `${stats.lastUploadDaysAgo}d ago`}` : undefined}
        />
      </div>

      {/* Quick insights */}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Insight
          label="Best day to post"
          value={bestDay ? bestDay.day : "Not enough data"}
          detail={bestDay ? `Videos posted on ${bestDay.day} do ${multiplier(bestDay.medianScore)} normal (IST).` : "Needs more uploads."}
        />
        <Insight
          label="Title style that wins"
          value={bestStyle ? STYLE_LABEL[bestStyle.style] : "Not enough data"}
          detail={
            stats.titleStyles.length > 1
              ? stats.titleStyles.map((s) => `${STYLE_LABEL[s.style]} ${multiplier(s.medianScore)}`).join(" · ")
              : "Try mixing title styles to learn what your viewers prefer."
          }
        />
        <Insight
          label="Engagement"
          value={pct(stats.medianEngagement)}
          detail={
            stats.titleLength
              ? `Your breakout titles run ~${stats.titleLength.outlierMedianChars} characters vs ${stats.titleLength.otherMedianChars} for the rest.`
              : "Likes + comments ÷ views, median per video."
          }
        />
      </div>

      {/* Chart */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ViewsChart videos={longs} baseline={c.medianViewsLong} label="Long videos — views per video" />
        {shorts.length >= 3 ? (
          <ViewsChart videos={shorts} baseline={c.medianViewsShort} label="Shorts — views per Short" />
        ) : (
          stats.durations.length > 0 && (
            <div className="card p-4">
              <div className="mb-3 text-sm font-medium">Which video length works</div>
              <ul className="space-y-2">
                {stats.durations.map((d) => (
                  <li key={d.label} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-ink-soft">{d.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                      <span className="block h-full rounded-full bg-kolam" style={{ width: `${Math.min(100, d.medianScore * 50)}%` }} />
                    </span>
                    <span className="w-12 text-right tabular-nums">{multiplier(d.medianScore)}</span>
                    <span className="w-16 text-right text-xs text-ink-mute">{d.count} videos</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>

      {/* AI */}
      <SectionTitle title="AI studio" subtitle="Ideas and feedback grounded in your numbers and what's breaking out among similar Tamil channels." />
      <AiStudio channelId={c.id} videos={videos.slice(0, 30).map((v) => ({ id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl }))} />

      {/* Own outliers */}
      <SectionTitle title="Your breakout videos" subtitle="Your recent videos that beat your normal views by 1.5× or more. Make more of what these have in common." />
      {report.ownOutliers.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {report.ownOutliers.map((v) => (
            <VideoCard key={v.id} {...v} />
          ))}
        </div>
      ) : (
        <Empty>No clear breakouts in your recent uploads yet — your views are fairly steady.</Empty>
      )}

      {/* Peer outliers */}
      <SectionTitle
        title="Breaking out among similar channels"
        subtitle="Last 3 weeks, from Tamil channels like yours. Topics that are proven to work right now."
        right={
          <Link href={`/outliers?niche=${c.niche}`} className="text-sm font-medium text-kolam hover:underline">
            All {nicheLabel(c.niche).toLowerCase()} outliers →
          </Link>
        }
      />
      {peerOutliers.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {peerOutliers.map((v) => (
            <VideoCard key={v.id} {...v} channel={{ id: v.channelId, title: v.channelTitle, subs: v.channelSubs }} />
          ))}
        </div>
      ) : (
        <Empty>
          Not enough data on similar channels yet. The background collector adds more Tamil channels every day — check back soon.
        </Empty>
      )}

      {/* Similar channels */}
      <SectionTitle title="Similar Tamil channels" subtitle="Matched on topics and titles, weighted toward channels near your size." />
      {similar.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {similar.map((s) => (
            <ChannelRow key={s.id} c={s} right={<span className="text-xs text-ink-mute">{Math.round(s.score * 100)}% match</span>} />
          ))}
        </div>
      ) : (
        <Empty>We're still building the Tamil channel database for this niche. Similar channels appear as it grows.</Empty>
      )}

      {/* Underperformers */}
      {report.underperformers.length > 0 && (
        <>
          <SectionTitle title="Videos that missed" subtitle="Below half your normal views. Compare their titles and thumbnails with your breakouts." />
          <ul className="card divide-y divide-paper-line">
            {report.underperformers.map((v) => (
              <li key={v.id} className="flex items-center gap-3 p-3 text-sm">
                <OutlierBadge score={v.outlierScore} />
                <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="ta min-w-0 flex-1 truncate hover:text-kolam" lang="ta">
                  {v.title}
                </a>
                <span className="shrink-0 text-xs text-ink-mute">
                  {compact(v.views)} views · {timeAgo(v.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Insight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-ink-soft">{detail}</div>
    </div>
  );
}
