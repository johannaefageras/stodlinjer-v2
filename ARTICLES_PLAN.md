# Implement the Articles section

## Context

The site (Astro 5, static) is already **prepped** for articles — `src/content.config.ts` defines an
`articles` collection (glob `**/*.md` over `src/content/articles/`) and the homepage nav already links
`/artiklar/` as a placeholder — but the content folder is empty and **no article routes, layout, or
list pages exist yet**. 152 hand-written Swedish articles currently sit in `./artiklar/<collection>/*.md`
at the repo root.

Goal: import the 152 articles into the content collection and build the **full browsable article
section** so the existing `/artiklar/` link, every per-collection page, and all article-to-article
cross-links work end to end — visually consistent with the existing support-line UI.

Two frontmatter/schema mismatches must be reconciled first: the schema *requires* a `type` field the
files don't have, and the files carry a `relatedArticles` array the schema doesn't declare (so Astro
would silently drop it).

The articles are clean and uniform: all-ASCII kebab-case filenames, identical frontmatter shape
(`title, description, date, updated, author, collection, tags, readingTime, references[], relatedArticles[]`),
body uses `##`/`###` headings + `-` lists + `**bold**`, no images/HTML. The 12 folder names
(`akut-och-kris`, `barn-och-unga`, …) form their own taxonomy, **separate** from the 13 support-line
`categories`.

## 1. Move the content into the collection

Move `./artiklar/<collection>/*.md` → `src/content/articles/<collection>/*.md` (keep the
subfolder-per-collection structure; the glob loader recurses, so an entry's `id` becomes
`akut-och-kris/att-overleva-natten`). Delete the now-empty root `./artiklar/` and stray `.DS_Store`s.

## 2. Reconcile the schema (`src/content.config.ts`)

Edit the `articles` collection schema (the file at repo root, `content.config.ts`, is a redundant
duplicate — Astro 5 reads `src/content.config.ts`; delete the root copy to avoid drift):

- `type`: make it default rather than required — `z.enum(["article","guide"]).default("article")` — so
  the 152 files validate without editing each one (they're all articles).
- **Add** the field the files actually use:
  `relatedArticles: z.array(z.object({ title: z.string(), url: z.string() })).default([])`.
- Leave `references: z.array(z.string())` as-is (matches the files), and `relatedSupportLines`,
  `crisisBanner`, `draft` as-is (all have defaults; files omit them harmlessly).

## 3. Article-collection metadata (own identity, reuse category visuals)

Create `src/lib/articleCollections.ts` — a typed lookup, array of the 12 collections, each
`{ slug, label, description, icon, color }`. `color` is one of the design-system color names; the token
layer only realises `red` distinctly (the emergency rose tint), every other name falls back to the
periwinkle `--accent-soft` — exactly how `SupportLineCard` behaves. `icon` is a Nightingale `ni-*` name.
Export a `getArticleCollection(slug)` helper and an ordered list for the landing grid.

## 4. Routes (full section)

Mirror the existing `src/pages/stodlinjer/[slug].astro` patterns (topbar with brand + `ThemeToggle`,
`back` link, `getStaticPaths` + `getCollection`).

- `src/pages/artiklar/index.astro` — landing. Grid of 12 collection cards (label, description, icon,
  color, article count), linking to `/artiklar/<slug>/`.
- `src/pages/artiklar/[collection]/index.astro` — one page per collection. `getStaticPaths` over the 12
  collection slugs; header + grid of `ArticleCard`s, sorted by `date` desc, `draft` filtered out.
- `src/pages/artiklar/[collection]/[slug].astro` — one page per article, params
  `{ collection: e.data.collection, slug: <filename from e.id> }`. This is the URL the `relatedArticles`
  links point at (`/artiklar/<collection>/<slug>/`).

## 5. Components & rendering

- `src/components/ArticleCard.astro` — title, description, readingTime, collection color accent; reuses
  `CategoryIcon`/`Icon` and the `--c`/`--c-fg` chip pattern.
- `src/components/CrisisBanner.astro` — the shared banner the schema/comment anticipates. Driven by
  `articleNeedsCrisisBanner({ crisisBanner, tags })` from `src/lib/crisis.ts`; `DEFAULT_EMERGENCY_TEXT`
  fallback copy, styled with the emergency/rose token. Reusable later in `SupportLineDetail`.
- `src/components/ArticleDetail.astro` — `<CrisisBanner>` (when triggered) → `<h1>` + meta (author, date,
  readingTime, collection link) → markdown body via Astro `render(entry)` → References (ordered list of
  `references[]`) → Relaterade artiklar (links from `relatedArticles[]`).
- Prose styling: a scoped `.prose` block on existing tokens (`--font-serif` headings, `--space-*`,
  `--border`, ~65ch measure). No markdown plugins needed.

## 6. Navigation wiring

The homepage nav already links `/artiklar/`, so it works once the landing exists. New article pages get
the same topbar/nav as the homepage (brand + nav links + `ThemeToggle`).

## Verification

`npm run build` (validates all 152 files against the schema) then `npm run dev` and check:

1. Build passes with no Zod/content errors.
2. `/artiklar/` shows 12 collection cards.
3. `/artiklar/akut-och-kris/` lists that collection's 12 articles.
4. `/artiklar/akut-och-kris/att-overleva-natten/` renders H1 + meta + body + References + Relaterade
   artiklar — and **shows the CrisisBanner** (acute tags).
5. A non-acute article (e.g. `/artiklar/verktyg-och-sjalvhjalp/att-skriva-av-sig/`) shows **no** banner.
6. `relatedArticles` links on a few articles all resolve (no 404).
7. Light/dark themes both render correctly.
