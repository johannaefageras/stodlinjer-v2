import type { APIRoute } from "astro";
import { buildClientLines } from "../lib/stodkompassen";

// Static (prerendered) JSON of every active line's display data, keyed by slug.
// The chat client fetches this lazily — only when someone actually chats — to
// render recommended-line cards from verified data rather than model text.
export const GET: APIRoute = async () => {
  const lines = await buildClientLines();
  return new Response(JSON.stringify(lines), {
    headers: { "Content-Type": "application/json" },
  });
};
