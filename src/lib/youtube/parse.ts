// Turns whatever a creator pastes into something we can look up.
// Handles: @handle, channel URLs (/channel/UC.., /@handle, /c/name, /user/name),
// video URLs (watch?v=, youtu.be, /shorts/), and bare channel ids.

export type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "custom"; value: string }
  | { kind: "video"; value: string };

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const VIDEO_ID_RE = /^[\w-]{11}$/;

export function parseChannelInput(raw: string): ChannelRef | null {
  const input = raw.trim();
  if (!input) return null;

  if (CHANNEL_ID_RE.test(input)) return { kind: "id", value: input };
  if (input.startsWith("@") && input.length > 1) return { kind: "handle", value: stripHandle(input) };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID_RE.test(id) ? { kind: "video", value: id } : null;
  }
  if (host !== "youtube.com") {
    // A bare word like "madangowri" is most likely a handle
    if (/^[\w.-]{3,30}$/.test(input)) return { kind: "handle", value: input };
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const v = url.searchParams.get("v");
  if (parts[0] === "watch" && v && VIDEO_ID_RE.test(v)) return { kind: "video", value: v };
  if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && parts[1] && VIDEO_ID_RE.test(parts[1])) {
    return { kind: "video", value: parts[1] };
  }
  if (parts[0]?.startsWith("@")) return { kind: "handle", value: stripHandle(parts[0]) };
  if (parts[0] === "channel" && parts[1] && CHANNEL_ID_RE.test(parts[1])) return { kind: "id", value: parts[1] };
  if (parts[0] === "user" && parts[1]) return { kind: "username", value: parts[1] };
  if (parts[0] === "c" && parts[1]) return { kind: "custom", value: parts[1] };
  // youtube.com/SomeName (legacy custom URL)
  if (parts.length === 1 && !["feed", "results", "playlist"].includes(parts[0])) return { kind: "custom", value: parts[0] };
  return null;
}

function stripHandle(h: string) {
  return h.replace(/^@/, "").trim();
}

/** ISO-8601 duration (PT1H2M3S) to seconds */
export function parseDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/**
 * YouTube allows Shorts up to 3 minutes, and the API has no "is short" flag.
 * Anything ≤ 60s is treated as a Short; 61–180s only if it's tagged #shorts.
 */
export function looksLikeShort(durationSec: number, text: string): boolean {
  if (durationSec > 0 && durationSec <= 60) return true;
  if (durationSec > 0 && durationSec <= 180 && /#shorts?\b/i.test(text)) return true;
  return false;
}
