"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STEPS = ["Finding the channel…", "Reading the last 100 videos…", "Scoring outliers…", "Matching similar Tamil channels…"];

export function AnalyzeForm({ compact = false, initial = "" }: { compact?: boolean; initial?: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) {
      setError("Paste a channel link, @handle or any video link from the channel.");
      return;
    }
    setError(null);
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/channel/${data.channelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    } finally {
      clearInterval(timer);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row"}`}>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          placeholder="youtube.com/@yourchannel"
          aria-label="YouTube channel link or handle"
          className="min-w-0 flex-1 rounded-xl border border-paper-line bg-white px-4 py-3 text-base outline-none ring-kolam/30 placeholder:text-ink-mute focus:border-kolam focus:ring-4"
          disabled={loading}
        />
        <button type="submit" className="btn-primary px-6 py-3 text-base" disabled={loading}>
          {loading ? "Analysing…" : "Analyse channel"}
        </button>
      </div>
      {loading && <p className="mt-3 text-sm text-ink-soft fade-in">{STEPS[step]}</p>}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
