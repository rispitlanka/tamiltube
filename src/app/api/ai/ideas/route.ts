import { NextResponse } from "next/server";
import { z } from "zod";
import { topicIdeas } from "@/lib/ai";
import { errorResponse, limitAi } from "@/lib/api";

export const maxDuration = 60;
const Body = z.object({ channelId: z.string().min(10), refresh: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing channelId." }, { status: 400 });
  const limited = limitAi(req);
  if (limited) return limited;
  try {
    return NextResponse.json(await topicIdeas(parsed.data.channelId, parsed.data.refresh));
  } catch (e) {
    return errorResponse(e);
  }
}
