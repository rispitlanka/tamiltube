import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, videos } from "@/db";
import { critiqueThumbnail } from "@/lib/ai";
import { errorResponse, limitAi } from "@/lib/api";

export const maxDuration = 60;

const Body = z
  .object({
    channelId: z.string().min(10),
    videoId: z.string().optional(),
    imageDataUrl: z
      .string()
      .startsWith("data:image/")
      .max(6_000_000, "Image is too large — keep it under about 4 MB.")
      .optional(),
    title: z.string().max(200).optional(),
  })
  .refine((b) => b.videoId || b.imageDataUrl, "Pick one of your videos or upload a thumbnail.");

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const limited = limitAi(req);
  if (limited) return limited;

  const { channelId, videoId, imageDataUrl } = parsed.data;
  try {
    if (videoId) {
      const video = await db.query.videos.findFirst({ where: and(eq(videos.id, videoId), eq(videos.channelId, channelId)) });
      if (!video?.thumbnailUrl) return NextResponse.json({ error: "Video not found on this channel." }, { status: 404 });
      return NextResponse.json(await critiqueThumbnail(channelId, { url: video.thumbnailUrl }, parsed.data.title || video.title));
    }
    return NextResponse.json(await critiqueThumbnail(channelId, { dataUrl: imageDataUrl! }, parsed.data.title ?? ""));
  } catch (e) {
    return errorResponse(e);
  }
}
