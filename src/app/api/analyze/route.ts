import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { discoverFeatured, ingestChannel, resolveChannelId } from "@/lib/ingest";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

const Body = z.object({ input: z.string().min(1).max(300), refresh: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a YouTube channel link or @handle." }, { status: 400 });

  const limited = rateLimit(`analyze:${clientIp(req)}`, 30);
  if (!limited.ok) return NextResponse.json({ error: `Too many lookups. Try again in ${limited.retryInMin} min.` }, { status: 429 });

  try {
    const channelId = await resolveChannelId(parsed.data.input);
    const channel = await ingestChannel(channelId, { source: "user", maxVideos: 100, force: parsed.data.refresh });
    // Queue the channels this creator features, so "similar channels" grows over time
    if (!channel.exploredAt) await discoverFeatured(channelId, true);
    return NextResponse.json({ channelId, isTamil: channel.isTamil });
  } catch (e) {
    return errorResponse(e);
  }
}
