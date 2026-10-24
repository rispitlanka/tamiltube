import { NextResponse } from "next/server";
import { NotFoundError } from "./ingest";
import { LlmError } from "./llm";
import { clientIp, rateLimit } from "./ratelimit";
import { QuotaExceededError, YouTubeError } from "./youtube/client";

export function errorResponse(e: unknown) {
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof QuotaExceededError) return NextResponse.json({ error: e.message }, { status: 429 });
  if (e instanceof LlmError) return NextResponse.json({ error: e.message }, { status: 502 });
  if (e instanceof YouTubeError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error(e);
  const message = e instanceof Error ? e.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function limitAi(req: Request) {
  const r = rateLimit(`ai:${clientIp(req)}`);
  if (!r.ok) {
    return NextResponse.json(
      { error: `You've used your AI requests for this hour. Try again in ${r.retryInMin} min.` },
      { status: 429 },
    );
  }
  return null;
}

export function isAuthorizedCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}
