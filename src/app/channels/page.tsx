import type { Metadata } from "next";
import { FilterLinks } from "@/components/FilterLinks";
import { ChannelRow, Empty } from "@/components/ui";
import { NICHES } from "@/lib/niches";
import { getDirectory } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tamil channels" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const NICHE_OPTIONS = [{ value: "all", label: "All niches" }, ...Object.entries(NICHES).map(([value, n]) => ({ value, label: n.label }))];

export default async function ChannelsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const niche = sp.niche ?? "all";
  const rows = await getDirectory(niche, 90).catch(() => []);

  return (
    <div className="pt-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Tamil channels</h1>
      <p className="mt-2 text-ink-soft">Every Tamil channel we track, biggest first. Click one for its full analysis.</p>
      <div className="mt-6">
        <FilterLinks base="/channels" param="niche" current={niche} options={NICHE_OPTIONS} params={{ niche }} />
      </div>
      <div className="mt-6">
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <ChannelRow key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <Empty>No channels here yet. Run the seed script, or analyse a channel from the home page.</Empty>
        )}
      </div>
    </div>
  );
}
