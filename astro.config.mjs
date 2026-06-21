import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://www.stodlinjer.se",
  // Phase 1 is fully static. The single server endpoint for the AI chat
  // (Phase 5) will switch this to output: "hybrid" with an adapter.
  output: "static",
});
