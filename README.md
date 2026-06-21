# Stödlinjer

A Swedish-language directory of support lines (*stödlinjer*) and crisis resources,
plus a library of articles on mental health, addiction, grief, rights, and being a
next of kin. An Astro rebuild of [stodlinjer.se](https://www.stodlinjer.se).

The goal is simple: help someone find the right help quickly — anonymously, for
free, and around the clock where it exists.

## Tech stack

- **[Astro 5](https://astro.build)** — static site output (`output: "static"`), no UI framework. Components are plain `.astro` files with scoped CSS and small inline `<script>` islands.
- **TypeScript** (strict) for the helper modules and content schema.
- **[Astro content collections](https://docs.astro.build/en/guides/content-collections/)** with Zod schemas for typed, validated content.
- **[Pages CMS](https://pagescms.org)** for editing content in the browser — see [Editing content](#editing-content).
- Fonts (GT Alpina, Söhne, Söhne Mono) load from a jsdelivr CDN; the Nightingale icon font is self-hosted in `public/fonts/`.

## Getting started

Requires Node 20.3+ (or 18.20.8+).

```bash
npm install
npm run dev      # dev server at http://localhost:4321
npm run build    # static build → dist/
npm run preview  # serve the production build locally
npm run check    # astro check — TypeScript + content-schema validation
```

`npm run check` validates every content file against the schemas in
[`src/content.config.ts`](src/content.config.ts). Run it before committing — a
malformed support line or article frontmatter will fail the build.

## Routes

| Route | Source | What it is |
| --- | --- | --- |
| `/` | [`src/pages/index.astro`](src/pages/index.astro) | Homepage. Hero, category filter pills, and the support-line card grid with client-side search (⌘K / Ctrl+K) and category filtering. |
| `/stodlinjer/<slug>/` | [`src/pages/stodlinjer/[slug].astro`](src/pages/stodlinjer/%5Bslug%5D.astro) | One static page per active support line. |
| `/artiklar/` | [`src/pages/artiklar/index.astro`](src/pages/artiklar/index.astro) | Article section landing — one card per topic. |
| `/artiklar/<topic>/` | [`src/pages/artiklar/[collection]/index.astro`](src/pages/artiklar/%5Bcollection%5D/index.astro) | Articles within a topic, newest first. |
| `/artiklar/<topic>/<slug>/` | [`src/pages/artiklar/[collection]/[slug].astro`](src/pages/artiklar/%5Bcollection%5D/%5Bslug%5D.astro) | A single article. |
| `/chatt/` | — | **Not built yet.** Reserved for the planned "Fråga Stödkompassen" AI chat (see [Status](#status)); currently linked in the nav as a placeholder. |

On the homepage, each card keeps a real link to `/stodlinjer/<slug>/`. JavaScript
intercepts the click to open the line in a modal instead and mirrors the URL via
the History API, so back/forward, deep links, and sharing all work. With JS off
(or for crawlers) the link falls through to the static detail page.

## Content model

All content lives in [`src/content/`](src/content/) and is loaded through Astro
content collections defined in [`src/content.config.ts`](src/content.config.ts).

- **Support lines** — `src/content/support-lines/*.json`, one file per line (53 lines). Each carries contact methods (phone / chat / SMS / email / web), per-method opening hours, accessibility flags, urgency level, source provenance, and display metadata.
- **Articles** — `src/content/articles/<topic>/*.md` (152 articles). Markdown body with frontmatter (title, description, date, author, `collection`, tags, references, related articles/support lines). Articles can opt into the crisis banner and embed live support-line cards via `relatedSupportLines`.
- **Categories** — `src/content/categories.json`, a single 13-entry lookup table that classifies support lines and drives the homepage filter pills.
- **Article topics** — `src/content/article-topics/*.json` (12 topics). The taxonomy folders under `articles/`. This is **plain data** read via `import.meta.glob` in [`src/lib/articleCollections.ts`](src/lib/articleCollections.ts), *not* an Astro content collection; an article's `collection` frontmatter field is the topic slug as a plain string.

> **YAML gotcha:** in article frontmatter, `references:` entries must be
> single-quoted — citation strings contain colons (`https://`, `Author:`), which
> YAML otherwise reads as key/value pairs.

### Shared logic

A few cross-cutting rules live in [`src/lib/`](src/lib/) so the same behaviour
fires everywhere:

- [`crisis.ts`](src/lib/crisis.ts) — one rule for when the crisis banner shows. A support line triggers it when `urgency.level === "emergency"` or `showEmergencyNotice` is set; an article triggers it via `crisisBanner: true` or an acute tag (`akut`, `självmord`, `suicid`, `kris`, `nödsituation`).
- [`hours.ts`](src/lib/hours.ts) — formats opening hours and computes live "open now" / "opens at…" status, evaluated in `Europe/Stockholm`. Recognises round-the-clock lines as *Dygnet runt*.

## Editing content

Content is editable in the browser through **[Pages CMS](https://pagescms.org)**,
configured in [`.pages.yml`](.pages.yml) with Swedish field labels. Edits made in
the CMS are committed straight back to this repository, which triggers an Astro
rebuild — the files in `src/content/` remain the single source of truth, so you
can edit by hand or via the CMS interchangeably.

Image uploads go to `public/uploads/` (served from `/uploads`).

## Project structure

```text
src/
  components/        UI components (cards, detail views, header, icons, search,
                     theme toggle); mockups/ holds card-design experiments
  content/           support-lines/, articles/, article-topics/, categories.json
  content.config.ts  Zod schemas + collection definitions
  layouts/           BaseLayout.astro (html shell, fonts, theme-before-paint)
  lib/               crisis.ts, hours.ts, articleCollections.ts
  pages/             routes (see table above)
  styles/            tokens.css (design tokens, light/dark), icons.css, global.css
public/
  fonts/             self-hosted Nightingale icon font
  uploads/           CMS image uploads
.pages.yml           Pages CMS configuration
astro.config.mjs     site URL + static output
```

## Notes

- **Theme:** light/dark is set before first paint from `localStorage` (falling back to the OS preference) to avoid a flash, and toggled via the header control.
- **Localization:** the site is entirely in Swedish (`<html lang="sv">`), including CMS labels.
- **Status field:** only support lines with `status: "active"` are rendered; `paused` / `retired` lines stay in the repo but are excluded from the grid and from generated detail pages.

## Status

The directory and article sections are live. The remaining planned work is the
`/chatt/` AI assistant ("Fråga Stödkompassen"). That feature will need a server
endpoint, so it will switch `astro.config.mjs` from static to an on-demand
(`hybrid`) output with an adapter — see the note in
[`astro.config.mjs`](astro.config.mjs).

This is a private project. © Johanna Fagerås.
