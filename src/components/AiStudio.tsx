"use client";

import { useState } from "react";
import type { Coach, Ideas, ThumbCritique, Titles } from "@/lib/ai";

type Tab = "ideas" | "titles" | "thumbnail" | "coach";
type VideoOption = { id: string; title: string; thumbnailUrl: string | null };

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "ideas", label: "Topic ideas", hint: "What to make next, based on outliers in your niche" },
  { id: "titles", label: "Titles", hint: "Title options in your own Tamil / Tanglish style" },
  { id: "thumbnail", label: "Thumbnail check", hint: "A score and fixes before you publish" },
  { id: "coach", label: "Channel review", hint: "What's working, what isn't, what to do next" },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

function useRequest<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function run(fn: () => Promise<{ data: T }>) {
    setLoading(true);
    setError(null);
    try {
      setData((await fn()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }
  return { data, error, loading, run };
}

export function AiStudio({ channelId, videos }: { channelId: string; videos: VideoOption[] }) {
  const [tab, setTab] = useState<Tab>("ideas");
  return (
    <div className="card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-paper-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-5 py-3 text-sm font-medium transition ${
              tab === t.id ? "border-b-2 border-kolam text-ink" : "text-ink-mute hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        <p className="mb-4 text-sm text-ink-soft">{TABS.find((t) => t.id === tab)!.hint}</p>
        {/* Keep every panel mounted so results survive tab switches */}
        <div hidden={tab !== "ideas"}>
          <IdeasPanel channelId={channelId} />
        </div>
        <div hidden={tab !== "titles"}>
          <TitlesPanel channelId={channelId} />
        </div>
        <div hidden={tab !== "thumbnail"}>
          <ThumbnailPanel channelId={channelId} videos={videos} />
        </div>
        <div hidden={tab !== "coach"}>
          <CoachPanel channelId={channelId} />
        </div>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="mt-3 text-sm text-red-700" role="alert">
      {error}
    </p>
  ) : null;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="shrink-0 rounded-md border border-paper-line px-2 py-0.5 text-xs text-ink-soft hover:border-ink-mute"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function IdeasPanel({ channelId }: { channelId: string }) {
  const r = useRequest<Ideas>();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={r.loading} onClick={() => r.run(() => post("/api/ai/ideas", { channelId }))}>
          {r.loading ? "Thinking…" : r.data ? "Show ideas" : "Generate ideas"}
        </button>
        {r.data && (
          <button className="btn-ghost" disabled={r.loading} onClick={() => r.run(() => post("/api/ai/ideas", { channelId, refresh: true }))}>
            New set
          </button>
        )}
      </div>
      <ErrorText error={r.error} />
      {r.data && (
        <ol className="mt-5 grid gap-3 md:grid-cols-2">
          {r.data.ideas.map((idea, i) => (
            <li key={i} className="rounded-xl border border-paper-line p-4 fade-in">
              <div className="flex items-start justify-between gap-3">
                <h4 className="ta font-medium" lang="ta">
                  {idea.title}
                </h4>
                <CopyButton text={idea.title} />
              </div>
              <p className="mt-0.5 text-xs text-ink-mute">{idea.titleEnglish}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-md bg-paper px-1.5 py-0.5 text-ink-soft">{idea.format === "short" ? "Short" : "Long video"}</span>
                <span className="ta rounded-md bg-kolam-soft px-1.5 py-0.5 text-kolam-deep" lang="ta">
                  Thumbnail: {idea.thumbnailText}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div>
                  <dt className="inline font-medium">Angle: </dt>
                  <dd className="inline text-ink-soft">{idea.angle}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Why now: </dt>
                  <dd className="inline text-ink-soft">{idea.why}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Opening hook: </dt>
                  <dd className="ta inline text-ink-soft">{idea.hook}</dd>
                </div>
                <div className="text-xs text-ink-mute">Based on: {idea.evidence}</div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TitlesPanel({ channelId }: { channelId: string }) {
  const [topic, setTopic] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const r = useRequest<Titles>();
  return (
    <div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim().length < 3) {
            setInputError("Describe your video in a few words first.");
            return;
          }
          r.run(() => post("/api/ai/titles", { channelId, topic }));
        }}
      >
        <input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setInputError(null);
          }}
          placeholder="e.g. Chettinad chicken in 15 minutes, or your draft title"
          className="ta min-w-0 flex-1 rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm outline-none focus:border-kolam"
        />
        <button className="btn-primary" disabled={r.loading}>
          {r.loading ? "Writing…" : "Suggest titles"}
        </button>
      </form>
      <ErrorText error={inputError ?? r.error} />
      {r.data && (
        <div className="mt-5 fade-in">
          <ul className="divide-y divide-paper-line rounded-xl border border-paper-line">
            {r.data.titles.map((t, i) => (
              <li key={i} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="ta font-medium" lang="ta">
                    {t.title}
                  </div>
                  <div className="text-xs text-ink-mute">
                    {t.titleEnglish} · <span className="capitalize">{t.style}</span>
                  </div>
                  <div className="mt-1 text-sm text-ink-soft">{t.reasoning}</div>
                </div>
                <CopyButton text={t.title} />
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <div className="label">Search phrases to use in description and tags</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.data.keywords.map((k) => (
                <span key={k} className="ta rounded-md bg-paper px-2 py-1 text-xs" lang="ta">
                  {k}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">{r.data.advice}</p>
        </div>
      )}
    </div>
  );
}

function ThumbnailPanel({ channelId, videos }: { channelId: string; videos: VideoOption[] }) {
  const [mode, setMode] = useState<"existing" | "upload">("upload");
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const r = useRequest<ThumbCritique>();

  function onFile(file: File | undefined) {
    setInputError(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return setInputError("Use a PNG, JPG or WebP image.");
    if (file.size > 4 * 1024 * 1024) return setInputError("Keep the image under 4 MB.");
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function submit() {
    if (mode === "upload" && !dataUrl) return setInputError("Choose a thumbnail image first.");
    if (mode === "existing" && !videoId) return setInputError("Pick a video.");
    r.run(() =>
      post("/api/ai/thumbnail", mode === "upload" ? { channelId, imageDataUrl: dataUrl, title } : { channelId, videoId, title: title || undefined }),
    );
  }

  const preview = mode === "upload" ? dataUrl : videos.find((v) => v.id === videoId)?.thumbnailUrl;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="inline-flex rounded-xl border border-paper-line p-1 text-sm">
          {(["upload", "existing"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setInputError(null);
              }}
              className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-ink text-white" : "text-ink-soft"}`}
            >
              {m === "upload" ? "Upload new" : "From my videos"}
            </button>
          ))}
        </div>
        {mode === "upload" ? (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
        ) : (
          <select value={videoId} onChange={(e) => setVideoId(e.target.value)} className="w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm">
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === "upload" ? "Video title (helps the review)" : "Optional: a new title to test"}
          className="ta w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm outline-none focus:border-kolam"
        />
        <button className="btn-primary" onClick={submit} disabled={r.loading}>
          {r.loading ? "Reviewing…" : "Review thumbnail"}
        </button>
        <ErrorText error={inputError ?? r.error} />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Thumbnail preview" className="aspect-video w-full rounded-xl border border-paper-line object-cover" />
        )}
      </div>
      <div>
        {r.data ? (
          <div className="fade-in space-y-4">
            <div className="flex items-center gap-3">
              <div className="font-display text-4xl font-semibold tabular-nums text-kolam">{r.data.score}/10</div>
              <div className="text-sm text-ink-soft">
                {r.data.verdict}
                <div className="text-xs text-ink-mute">{r.data.mobileReadable ? "Readable on phones" : "Hard to read on phones"}</div>
              </div>
            </div>
            <List title="Working" items={r.data.strengths} tone="text-leaf" />
            <List title="Problems" items={r.data.problems} tone="text-red-700" />
            <List title="Fix it" items={r.data.fixes} tone="text-kolam" />
            <div>
              <div className="label">Text to try</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.data.textSuggestions.map((t) => (
                  <span key={t} className="ta rounded-md bg-kolam-soft px-2 py-1 text-sm font-medium text-kolam-deep" lang="ta">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-mute">Upload a thumbnail before you publish, or check one that underperformed.</p>
        )}
      </div>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`label ${tone}`}>{title}</div>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function CoachPanel({ channelId }: { channelId: string }) {
  const r = useRequest<Coach>();
  return (
    <div>
      <button className="btn-primary" disabled={r.loading} onClick={() => r.run(() => post("/api/ai/coach", { channelId }))}>
        {r.loading ? "Reviewing your channel…" : "Review my channel"}
      </button>
      <ErrorText error={r.error} />
      {r.data && (
        <div className="mt-5 space-y-5 fade-in">
          <p className="text-base">{r.data.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-leaf-soft/60 p-4">
              <div className="label text-leaf">Working</div>
              <ul className="mt-2 space-y-2 text-sm">
                {r.data.working.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">{w.point}</span>
                    <div className="text-xs text-ink-soft">{w.evidence}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <div className="label text-red-700">Not working</div>
              <ul className="mt-2 space-y-2 text-sm">
                {r.data.notWorking.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">{w.point}</span>
                    <div className="text-xs text-ink-soft">{w.evidence}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <div className="label">Next two weeks</div>
            <ol className="mt-2 space-y-2">
              {r.data.actions.map((a, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-paper-line p-3 text-sm">
                  <span className="font-display text-lg font-semibold text-kolam">{i + 1}</span>
                  <div>
                    <div className="font-medium">{a.action}</div>
                    <div className="text-ink-soft">{a.why}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
