// One function for both Claude and OpenAI, returning validated JSON.
import { createHash } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import { aiResults, db } from "@/db";

export type ImageInput = { url: string } | { dataUrl: string };

type Req<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  image?: ImageInput;
  maxTokens?: number;
};

export class LlmError extends Error {}

export async function completeJSON<T>(req: Req<T>): Promise<T> {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  const raw = provider === "openai" ? await callOpenAI(req) : await callAnthropic(req);
  const parsed = extractJson(raw);
  const result = req.schema.safeParse(parsed);
  if (!result.success) {
    console.error("LLM JSON failed validation", result.error.issues.slice(0, 3), raw.slice(0, 500));
    throw new LlmError("The AI response came back in an unexpected shape. Please try again.");
  }
  return result.data;
}

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new LlmError("The AI didn't return JSON.");
  return JSON.parse(body.slice(start, end + 1));
}

function splitDataUrl(dataUrl: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new LlmError("Unsupported image. Use a PNG, JPG or WebP.");
  return { mediaType: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] };
}

async function callAnthropic<T>(req: Req<T>): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new LlmError("ANTHROPIC_API_KEY is not set.");
  const content: unknown[] = [];
  if (req.image) {
    if ("url" in req.image) content.push({ type: "image", source: { type: "url", url: req.image.url } });
    else {
      const { mediaType, data } = splitDataUrl(req.image.dataUrl);
      content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    }
  }
  content.push({ type: "text", text: `${req.prompt}\n\nRespond with JSON only, no other text.` });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: req.maxTokens ?? 3000,
      system: req.system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new LlmError(`Claude API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  return json.content.filter((c) => c.type === "text").map((c) => c.text).join("");
}

async function callOpenAI<T>(req: Req<T>): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new LlmError("OPENAI_API_KEY is not set.");
  const userContent: unknown[] = [{ type: "text", text: req.prompt }];
  if (req.image) {
    const url = "url" in req.image ? req.image.url : req.image.dataUrl;
    userContent.push({ type: "image_url", image_url: { url } });
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      max_tokens: req.maxTokens ?? 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${req.system}\nAlways respond with a single JSON object.` },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new LlmError(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message.content ?? "";
}

// ---- Cache: identical requests within the TTL reuse the stored answer ----

export function cacheKey(kind: string, input: unknown) {
  return createHash("sha256").update(kind).update(JSON.stringify(input)).digest("hex").slice(0, 40);
}

export async function cached<T>(
  kind: string,
  input: unknown,
  channelId: string | null,
  ttlHours: number,
  fn: () => Promise<T>,
  refresh = false,
): Promise<{ data: T; cached: boolean }> {
  const id = cacheKey(kind, input);
  if (!refresh) {
    const since = new Date(Date.now() - ttlHours * 3_600_000);
    const hit = await db.query.aiResults.findFirst({ where: and(eq(aiResults.id, id), gte(aiResults.createdAt, since)) });
    if (hit) return { data: hit.output as T, cached: true };
  }
  const data = await fn();
  await db
    .insert(aiResults)
    .values({ id, kind, channelId, output: data as object })
    .onConflictDoUpdate({ target: aiResults.id, set: { output: data as object, createdAt: new Date() } });
  return { data, cached: false };
}
