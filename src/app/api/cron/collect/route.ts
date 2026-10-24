import { NextResponse } from "next/server";
import { errorResponse, isAuthorizedCron } from "@/lib/api";
import { runCollector } from "@/lib/collector";

// Vercel Pro allows up to 300s (Hobby: 60s). The collector stops itself in time either way.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limitSec = Number(process.env.COLLECTOR_MAX_SECONDS ?? 50);
  try {
    const report = await runCollector({ maxMs: limitSec * 1000 });
    return NextResponse.json(report);
  } catch (e) {
    return errorResponse(e);
  }
}
