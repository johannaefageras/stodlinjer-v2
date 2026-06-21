# Stödlinjer v2

Astro rebuild of stodlinjer.se. See the project plan for the phased roadmap.

## Status: Phase 1 — static skeleton (Notion style, verified building, 0 errors)

- Notion-style cool neutral base with one lavender accent (#6c5ce0).
- Design tokens in `src/styles/tokens.css` (cool neutrals + 13 category icon-tile accents, light + dark).
- Content schema in `src/content.config.ts` (validated against all 53 lines).
- Support-line data in `src/content/support-lines/` (one file per line) + `categories.json`.
- Homepage: narrow document column, page icon, support lines as Notion hover-rows.

## Run

    npm install
    npm run dev      # http://localhost:4321
    npm run build    # static output to dist/
    npm run check    # type + schema check

## Next: Phase 2

Replace placeholder rows in `src/pages/index.astro` with
getCollection("supportLines"), add filter + client-side search, and
use the Nightingale icon font through the shared Icon component.
