import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://www.stodlinjer.se",
  // Content pages stay statically prerendered (the default). Only the
  // Stödkompassen chat endpoint (src/pages/api/chat.ts) opts into on-demand
  // server rendering via `export const prerender = false`, which the Node
  // adapter serves. Deployed as a Node web service on Render
  // (build: `npm run build`, start: `node ./dist/server/entry.mjs`).
  output: "static",
  adapter: node({ mode: "standalone" }),
});
