import type { Metadata } from "next";
import { FilterLinks } from "@/components/FilterLinks";
import { Empty, VideoCard } from "@/components/ui";
import { NICHES } from "@/lib/niches";
import { getOutliers } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outlier videos" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const NICHE_OPTIONS = [{ value: "all", label: "All niches" }, ...Object.entries(NICHES).filter(([k]) => k !== "general").map(([value, n]) => ({ value, label: n.label }))];
const FORMAT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "long", label: "Long videos" },
  { value: "short", label: "Shorts" },
];
const DAY_OPTIONS = [
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

export default async function OutliersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const niche = sp.niche ?? "all";
  const format = (["long", "short"].includes(sp.format ?? "") ? sp.format : "all") as "all" | "long" | "short";
  const days = ["3", "7", "14", "30"].includes(sp.days ?? "") ? sp.days! : "7";
  const params = { niche, format, days };

  const rows = await getOutliers({ niche, format, days: Number(days), minScore: 2, limit: 48 }).catch(() => []);

  return (
    <div className="pt-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Outlier videos</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Tamil videos that got far more views than their channel normally gets. A 5× video from a 20k channel tells you more about what
        viewers want than a big channel's average upload.
      </p>

      <div className="mt-6 space-y-3">
        <FilterLinks base="/outliers" param="niche" current={niche} options={NICHE_OPTIONS} params={params} />
        <div className="flex flex-wrap gap-6">
          <FilterLinks base="/outliers" param="format" current={format} options={FORMAT_OPTIONS} params={params} />
          <FilterLinks base="/outliers" param="days" current={days} options={DAY_OPTIONS} params={params} />
        </div>
      </div>

      <div className="mt-8">
        {rows.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
            {rows.map((v) => (
              <VideoCard key={v.id} {...v} channel={{ id: v.channelId, title: v.channelTitle, subs: v.channelSubs }} />
            ))}
          </div>
        ) : (
          <Empty>No outliers match these filters yet. Try a longer time range, or let the collector gather more channels.</Empty>
        )}
      </div>
    </div>
  );
}
