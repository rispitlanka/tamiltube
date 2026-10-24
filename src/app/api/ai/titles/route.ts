import { NextResponse } from "next/server";
import { z } from "zod";
import { titleSuggestions } from "@/lib/ai";
import { errorResponse, limitAi } from "@/lib/api";

export const maxDuration = 60;
const Body = z.object({ channelId: z.string().min(10), topic: z.string().min(3).max(500) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your video in a few words first." }, { status: 400 });
  const limited = limitAi(req);
  if (limited) return limited;
  try {
    return NextResponse.json(await titleSuggestions(parsed.data.channelId, parsed.data.topic));
  } catch (e) {
    return errorResponse(e);
  }
}
