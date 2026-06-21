# PagesCMS setup — design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)

## Goal

Let a **non-technical editor** manage the site's content through [Pages CMS](https://pagescms.org/) — a Git-based CMS that reads a `.pages.yml` config, presents a web admin UI, and commits edits back to GitHub. Astro rebuilds from the committed files. No server runtime, no secrets in the repo; the CMS edits the existing content files in place.

The editor profile is "non-technical, polished forms": every field gets a friendly control (labelled inputs, dropdowns, date pickers, nested/collapsible forms), and structural data should be picked from constrained lists rather than typed freely.

## Current state

- Astro 5 static site (`output: "static"`), GitHub remote `johannaefageras/stodlinjer-v2`.
- `.pages.yml` exists but is **empty** (the prior "Create .pages.yml (via Pages CMS)" commit created a blank file).
- Content is read by `src/content.config.ts` from three sources:
  1. **Support lines** — 53 JSON files in `src/content/support-lines/`, one per line. Rich schema with nested `contactMethods[]` (each containing `openingHours[]`), plus `accessibility`, `urgency`, `source`, `display`, `metadata` objects, and a `category` field that is an Astro `reference("categories")`.
  2. **Categories** — single `src/content/categories.json` (13 entries under a top-level `categories:` array).
  3. **Articles** — markdown + frontmatter in `src/content/articles/**/*.md`, organized into topic subfolders.
- The **12 article topic areas are hardcoded in TypeScript** (`src/lib/articleCollections.ts`, exporting `ARTICLE_COLLECTIONS` and `getArticleCollection`), not in data.

### Consumer scope (informs risk)

- `categories.json` is imported **directly as a JSON module** in `src/components/SupportLineDetail.astro`, `src/pages/index.astro`, and `src/components/mockups/sample.ts`, in addition to the Astro `reference("categories")` resolution. Splitting it into a folder would touch all of these → higher risk.
- Article `collection` is used as a **string** in 5 places (`src/pages/artiklar/[collection]/index.astro` ×2, `src/pages/artiklar/index.astro`, `src/pages/artiklar/[collection]/[slug].astro` ×2). `articleCollections.ts` is consumed in 4 files. Article grouping/routing is driven by the **frontmatter `collection` field**, not the folder name (the URL slug is the filename via `entry.id.split("/").pop()`).

## Design decisions

### Taxonomy modeling (the key fork — decided)

- **Article topics → data files + reference field.** Move the 12 topics from `src/lib/articleCollections.ts` into `src/content/article-topics/*.json` (one file per topic). The article `collection` field becomes a PagesCMS **reference dropdown** whose stored `value` is the plain slug string, so Astro's schema stays `z.string()` and **no downstream `data.collection` usage changes**. Adding a topic becomes a pure CMS action (no developer).
- **Categories → keep single `categories.json` + `select` field.** Because `categories.json` is imported directly in 3 components and is coupled to design tokens (`color`/`icon` must be valid), it is **not** split. The support-line `category` field is a PagesCMS **`select`** of the 13 categories (Swedish label → stored id). `categories.json` remains editable in the CMS as a single-file list. Trade-off accepted: adding a 14th category is rare and requires a one-line `.pages.yml` edit.

### Why no Astro `articleTopics` content collection

The PagesCMS reference only needs the folder of files to exist on disk; it does not require an Astro content collection. Keeping article `collection` as `z.string()` (not an Astro `reference`) avoids rippling into the 5 string usages. `articleCollections.ts` is rewritten to read the JSON files and expose the same public API (`ARTICLE_COLLECTIONS`, `getArticleCollection`), so its 4 consumers are untouched.

## Deliverables

### A. Code refactor (article topics → data)

1. Create `src/content/article-topics/<slug>.json` for each of the 12 topics, mirroring the current TS objects: `slug`, `label`, `description`, `icon`, `color`, plus a new **`order`** number field to preserve the curated landing-grid ordering (the TS array was explicitly ordered).
2. Rewrite `src/lib/articleCollections.ts` to build `ARTICLE_COLLECTIONS` from those JSON files (e.g. via `import.meta.glob('../content/article-topics/*.json', { eager: true })`), sorted by `order`. Keep the exported types and `getArticleCollection(slug)` fallback behavior identical so consumers are unchanged.
3. Leave `articles.collection` as `z.string()` in `src/content.config.ts`. No change to the 5 string usages.
4. Verify the article landing, topic listing, and detail pages still render with correct ordering and counts.

### B. `.pages.yml` configuration

Top-level `media` + `content` (four entries). Structure:

**media**
- `input: public/uploads`, `output: /uploads` (Astro serves `public/` at root, so `/uploads/...` resolves), `categories: [image]`, `rename: safe`.

**content[] — support-lines** (`type: collection`, `path: src/content/support-lines`, `format: json`, `filename: "{fields.slug}.json"`, list view primary = `name`):
- Basics: `name`, `organization`, `slug`, `id`, `type` (select ×4 with labels), `status` (select ×3, default `active`), `category` (**select** ×13, label→id), `shortDescription` (text), `longDescription` (text).
- `helpsWith`, `targetGroups`: string fields with `list: true` (open vocabulary — not enumerated; editor reuses existing slugs).
- `contactMethods`: object `list: true` (collapsible, summary from `label`/`channel`), `min: 1`. Subfields: `id`, `channel` (select: phone/chat/sms/email/web), `label`, `value`, `url`, `note`, and `openingHours` as a nested object `list: true` with `days` (select `multiple` mon–sun), `open`, `close`, `timezone` (default `Europe/Stockholm`), `note`.
- `accessibility` (object): `anonymous` (boolean), `free` (boolean), `languages` (string list, default `[svenska]`), `region` (string, default `sweden`), `notes` (text).
- `urgency` (object): `level` (select emergency/urgent/standard), `showEmergencyNotice` (boolean), `emergencyText` (text).
- `source` (object): `primaryUrl`, `secondaryUrl`, `checkedAt` (date), `confidence` (select high/medium/low). Note `sourceUpdatedAt` is optional in schema.
- `display` (object): `featured` (boolean), `priority` (number), `primaryLabel`, `availabilityLabel`.
- `metadata` (object): `lastVerified` (date), `nextReview` (date), `resourceKind` (string), `supportLine` (boolean).

**content[] — articles** (`type: collection`, `path: src/content/articles`, `format: yaml-frontmatter`, `subfolders: true`, list view primary = `title`):
- `filename`: attempt `"{fields.collection}/{primary}.md"` to auto-file into the topic folder. **Verify** during implementation that PagesCMS creates the subfolder from the template; if not, fall back to plain `"{primary}.md"` + `subfolders: true` and rely on the frontmatter `collection` as the source of truth (the site is unaffected either way).
- Frontmatter fields: `type` (select article/guide, default article), `title`, `description` (text), `date` (date), `updated` (date, optional), `author` (string, default "Johanna Fagerås"), `collection` (**reference** → `article-topics`, `value` = slug string, single, required), `tags` (string list), `readingTime` (string), `references` (text field `list: true`), `relatedArticles` (object list: `title`, `url`), `relatedSupportLines` (**reference** → `support-lines`, `multiple: true`), `crisisBanner` (boolean), `draft` (boolean).
- Body: markdown body mapped to a `rich-text` field (uses the configured media for image insertion).

**content[] — article-topics** (`type: collection`, `path: src/content/article-topics`, `format: json`, `filename: "{fields.slug}.json"`, list view primary = `label`):
- Fields: `slug`, `label`, `description` (text), `icon` (string, with guidance — must be a Nightingale `ni-*` name from `icons.css`), `color` (select of the 13 token color names), `order` (number).

**content[] — categories** (`type: file`, `path: src/content/categories.json`, `format: json`, `list: true` for the top-level array):
- Per-item fields: `id`, `label`, `description` (text), `icon` (string, guidance as above), `color` (select ×13 token names), `priority` (number), `keywords` (string list).
- Note: the file's array lives under a top-level `categories:` key, while `list: true` models a file whose **root** is the array. Verify during implementation whether PagesCMS can target the nested `categories` array directly; if it can only model a root-level array, either (a) point `list` at the root and adjust the parser in `content.config.ts`, or (b) keep `categories` as a select-only taxonomy and drop CMS editing of the category file. Decision recorded at implementation time; default preference is (a) only if it's a clean change, otherwise (b).

### C. One-time activation (manual, by the repo owner)

Sign in at app.pagescms.org with GitHub → install the Pages CMS GitHub App on `stodlinjer-v2` → it auto-detects `.pages.yml`. No repo secrets required.

## Field-type / format compatibility notes

- Dates in the JSON/frontmatter are ISO date strings (`"2026-06-04"`); PagesCMS `date` fields serialize the same form, compatible with the `z.string()` / `z.coerce.date()` schemas.
- PagesCMS serializes YAML frontmatter itself, which removes the manual single-quote pitfall on `references:` (the editor never hand-writes YAML).
- `helpsWith` / `targetGroups` stay free string lists (194 / 71 distinct values) rather than enums, matching the schema's intent.

## Out of scope (YAGNI)

- Splitting `categories.json` into a folder collection / making `category` a reference (only revisit if categories start changing often).
- Converting `helpsWith` / `targetGroups` into a managed tag collection.
- The `/chatt/` route and any Phase 5 server/adapter changes.
- Editing the article topic taxonomy's *code consumers* beyond what's needed to read from data.

## Verification

- `npm run build` and `npm run check` pass after the refactor.
- Article landing counts, topic listing order, and detail-page back-links render identically to before.
- `.pages.yml` is valid against the Pages CMS schema (loads without error in the app, all four collections + media appear).
- A test edit through the CMS round-trips: create/edit a support line, an article (with an image and a related support line), a topic, and a category, and confirm the committed files match the schemas and the site rebuilds.
