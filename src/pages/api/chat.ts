import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type UiMode } from "../../lib/stodkompassen";
import { detectCrisis, crisisDirective } from "../../lib/crisisDetect";

// On-demand server route (everything else on the site stays static).
export const prerender = false;

// ── Limits / guards ─────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 40_000; // whole request payload
const MAX_MESSAGES = 24; // turns in one conversation
const MAX_MESSAGE_CHARS = 4_000; // a single message
const MAX_OUTPUT_TOKENS = 768; // keeps replies short + caps cost

// Per-IP token bucket (in-memory; one Render instance). ~12 msgs burst,
// refilling at 12/min.
const BUCKET_CAPACITY = 12;
const REFILL_PER_SEC = 12 / 60;
const buckets = new Map<string, { tokens: number; ts: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > 5_000) buckets.clear(); // crude guard against unbounded growth
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, ts: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.ts) / 1000) * REFILL_PER_SEC);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

// Reject browser calls coming from another site. Non-browser callers (no
// Origin header) fall through to the rate limiter.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

const REFUSAL_TEXT =
  "Jag kan tyvärr inte hjälpa till med just det. Men om du mår dåligt eller behöver prata finns det stöd att få — vid akut fara för liv, ring 112, och du kan alltid ringa Självmordslinjen på 90 101, dygnet runt.";
const ERROR_TEXT =
  "Något gick fel på vägen och jag kunde inte svara just nu. Vid akut fara för liv, ring 112. Du kan alltid ringa Självmordslinjen på 90 101 (dygnet runt) eller bläddra bland stödlinjerna här på sidan.";

type Msg = { role: "user" | "assistant"; content: string };

function parseMessages(value: unknown): Msg[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  const out: Msg[] = [];
  for (const m of value) {
    if (!m || typeof m !== "object") return null;
    const role = (m as Msg).role;
    const content = (m as Msg).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_MESSAGE_CHARS)
      return null;
    out.push({ role, content });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: "chat_unavailable" });
  }
  if (!sameOrigin(request)) {
    return json(403, { error: "forbidden_origin" });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    clientAddress ||
    "unknown";
  if (!rateLimit(ip)) {
    return json(429, { error: "rate_limited" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  let parsed: { messages?: unknown; uiMode?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const messages = parseMessages(parsed?.messages);
  if (!messages) {
    return json(400, { error: "invalid_request" });
  }
  const uiMode: UiMode = parsed?.uiMode === "widget" ? "widget" : "page";

  // Pre-LLM safety gate. Doesn't replace the reply — prepends a high-priority
  // directive so the model leads, warmly, with the right safety step.
  const crisis = detectCrisis(messages);
  const directive = crisisDirective(crisis);

  const system = await buildSystemPrompt(uiMode);
  const model = process.env.STODKOMPASSEN_MODEL || "claude-opus-4-8";
  const client = new Anthropic();

  // System blocks: the (optional) crisis directive first as a small, NON-cached
  // block, then the stable catalog prompt as the cached block. Keeping the
  // directive separate preserves the ~0.1x cache read on the big block.
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];
  if (directive) {
    systemBlocks.push({ type: "text", text: directive });
  }
  systemBlocks.push({
    type: "text",
    text: system,
    cache_control: { type: "ephemeral" },
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        const stream = client.messages.stream({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // Crisis directive (if any) + stable, cached catalog block.
          system: systemBlocks,
          messages,
        });

        let stopReason: string | null = null;
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            send("delta", { text: ev.delta.text });
          } else if (ev.type === "message_delta") {
            stopReason = ev.delta.stop_reason ?? stopReason;
          }
        }

        if (stopReason === "refusal") send("notice", { text: REFUSAL_TEXT });
        send("done", {});
      } catch {
        // No message content is logged (privacy-first).
        send("error", { text: ERROR_TEXT });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
