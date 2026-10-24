import { compact, multiplier } from "@/lib/format";

type Point = { id: string; title: string; views: number; outlierScore: number; publishedAt: Date };

/** Bars = views per video (oldest → newest). Dashed line = this channel's normal. Orange = 2×+ outliers. */
export function ViewsChart({ videos, baseline, label }: { videos: Point[]; baseline: number; label: string }) {
  const data = [...videos].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()).slice(-30);
  if (data.length < 3) return null;

  const W = 720;
  const H = 220;
  const padL = 44;
  const padB = 8;
  const padT = 12;
  const max = Math.max(...data.map((d) => d.views), baseline) * 1.08;
  const step = (W - padL) / data.length;
  const barW = Math.max(4, step * 0.68);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max].map((t) => Math.round(t));

  return (
    <figure className="card p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-4 text-xs text-ink-mute">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-kolam" /> 2× or more
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-ink-soft" /> Normal ({compact(baseline)})
          </span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label}. Dashed line marks this channel's typical views.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e8e0d2" strokeWidth={1} />
            <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="#857d70">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * step + (step - barW) / 2;
          const top = y(d.views);
          const hot = d.outlierScore >= 2;
          return (
            <a key={d.id} href={`https://www.youtube.com/watch?v=${d.id}`} target="_blank" rel="noreferrer">
              <rect x={x} y={top} width={barW} height={Math.max(1, H - padB - top)} rx={2} fill={hot ? "#c2410c" : "#d6cbb8"}>
                <title>{`${d.title}\n${compact(d.views)} views · ${multiplier(d.outlierScore)} normal`}</title>
              </rect>
            </a>
          );
        })}
        <line x1={padL} x2={W} y1={y(baseline)} y2={y(baseline)} stroke="#4a443b" strokeWidth={1.5} strokeDasharray="5 4" />
      </svg>
    </figure>
  );
}
