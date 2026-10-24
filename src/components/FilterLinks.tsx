import Link from "next/link";

/** Pill links that update one query param while keeping the others */
export function FilterLinks({
  base,
  param,
  current,
  options,
  params,
}: {
  base: string;
  param: string;
  current: string;
  options: { value: string; label: string }[];
  params: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries({ ...params, [param]: o.value })) if (v) qs.set(k, v);
        const active = current === o.value;
        return (
          <Link
            key={o.value}
            href={`${base}?${qs}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active ? "border-ink bg-ink text-white" : "border-paper-line bg-white text-ink-soft hover:border-ink-mute"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
