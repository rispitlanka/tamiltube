// Simple per-IP limiter for the AI endpoints, so one visitor can't run up your API bill.
// In-memory: on serverless each instance keeps its own count, which is fine as a
// first guard. Swap for Upstash Redis or a DB counter when traffic grows.

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 20), windowMs = 3_600_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const retryInMin = Math.ceil((windowMs - (now - recent[0])) / 60_000);
    hits.set(key, recent);
    return { ok: false as const, retryInMin };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear(); // keep memory bounded
  return { ok: true as const };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
