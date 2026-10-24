import Link from "next/link";
import { compact, duration, multiplier, timeAgo } from "@/lib/format";
import { nicheLabel } from "@/lib/niches";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-mute">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 mt-12 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function OutlierBadge({ score }: { score: number }) {
  const tone =
    score >= 5 ? "bg-kolam text-white" : score >= 2 ? "bg-kolam-soft text-kolam-deep" : score >= 1 ? "bg-paper text-ink-soft" : "bg-paper text-ink-mute";
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>{multiplier(score)}</span>;
}

export function Avatar({ src, alt, size = 40 }: { src: string | null | undefined; alt: string; size?: number }) {
  if (!src) {
    return (
      <div className="grid shrink-0 place-items-center rounded-full bg-kolam-soft font-semibold text-kolam-deep" style={{ width: size, height: size }}>
        {alt.slice(0, 1)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className="shrink-0 overflow-hidden rounded-full bg-kolam-soft object-cover text-[0px]" style={{ width: size, height: size }} />;
}

type VideoCardProps = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  outlierScore: number;
  publishedAt: Date;
  isShort: boolean;
  durationSec: number;
  channel?: { id: string; title: string; subs: number };
};

export function VideoCard(v: VideoCardProps) {
  return (
    <div className="group fade-in">
      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="block">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-paper-line">
          {v.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {v.isShort ? "Short" : duration(v.durationSec)}
          </span>
          <span className="absolute left-1.5 top-1.5">
            <OutlierBadge score={v.outlierScore} />
          </span>
        </div>
        <h3 className="clamp-2 mt-2 text-sm font-medium leading-snug">{v.title}</h3>
      </a>
      <div className="mt-1 text-xs text-ink-mute">
        {v.channel && (
          <Link href={`/channel/${v.channel.id}`} className="font-medium text-ink-soft hover:text-kolam">
            {v.channel.title} · {compact(v.channel.subs)} subs
            <br />
          </Link>
        )}
        {compact(v.views)} views · {timeAgo(v.publishedAt)}
      </div>
    </div>
  );
}

export function ChannelRow({
  c,
  right,
}: {
  c: { id: string; title: string; handle: string | null; thumbnailUrl: string | null; subscribers: number; niche: string; medianViewsLong?: number };
  right?: React.ReactNode;
}) {
  return (
    <Link href={`/channel/${c.id}`} className="card flex items-center gap-3 p-3 transition hover:border-kolam/50">
      <Avatar src={c.thumbnailUrl} alt={c.title} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.title}</div>
        <div className="truncate text-xs text-ink-mute">
          {compact(c.subscribers)} subs · {nicheLabel(c.niche)}
          {c.medianViewsLong ? ` · ~${compact(c.medianViewsLong)} views/video` : ""}
        </div>
      </div>
      {right}
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card border-dashed p-6 text-sm text-ink-soft">{children}</div>;
}
