"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton({ input }: { input: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, refresh: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button onClick={refresh} disabled={loading} className="btn-ghost">
        {loading ? "Refreshing…" : "Refresh data"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
