import type { APIRoute } from "astro";
import { buildClientArticles } from "../lib/stodkompassen";

// Static (prerendered) JSON of every published article's display data, keyed
// by bare slug. The chat client fetches this lazily — only when someone chats —
// to render recommended-article cards from verified data rather than model text.
export const GET: APIRoute = async () => {
  const articles = await buildClientArticles();
  return new Response(JSON.stringify(articles), {
    headers: { "Content-Type": "application/json" },
  });
};
