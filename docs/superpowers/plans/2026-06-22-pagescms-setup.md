# PagesCMS Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Pages CMS into the Astro site so a non-technical editor can manage support lines, articles, article topics, and categories through a web admin that commits to GitHub.

**Architecture:** Pages CMS reads `.pages.yml` from the repo root and edits the existing content files in place; Astro rebuilds from those files. Two small refactors precede the config: (1) restructure `categories.json` to a root-level array so it can be edited as a single-file list, and (2) move the 12 article topics out of TypeScript into `src/content/article-topics/*.json` so they're CMS-managed. The article `collection` frontmatter field stays a plain string — Pages CMS presents it as a reference dropdown but stores the slug — so no downstream Astro code changes.

**Tech Stack:** Astro 5 (content collections, `glob`/`file` loaders), TypeScript, Pages CMS (`.pages.yml`), GitHub.

## Global Constraints

- Keep `articles.collection` as `z.string()` in `src/content.config.ts` — do **not** convert it to an Astro `reference`. (Five call sites use it as a string.)
- Preserve the existing Astro `reference("categories")` (on support lines) and `reference("supportLines")` (on articles) — their stored values are plain id/slug strings and must stay that way.
- No new npm dependencies. No test runner exists; **verification gates are `npm run check` (astro check / type check) and `npm run build`.**
- Support-line and support-line-reference values are the entry **slug** (= filename, = the `slug`/`id` field). Category values are the category **id**. Topic values are the topic **slug**.
- All Pages CMS UI labels are in Swedish (matches site language).
- Pages CMS `select` options use `name`/`label` pairs (the stored value is `name`). Pages CMS `reference` options use `value`/`label` **templates** like `"{fields.slug}"`.

---

### Task 1: Restructure `categories.json` to a root array

Pages CMS models a single-file list (`type: file`, `list: true`) as a file whose **root** is the array. Today `categories.json` wraps the array in a `{ "categories": [...] }` object, so we flatten it and drop the loader's custom parser. Three direct importers and the loader change accordingly. Astro's `file()` loader accepts a top-level array as long as each item has an `id` (ours do).

**Files:**
- Modify: `src/content/categories.json` (remove the `{ "categories": ... }` wrapper)
- Modify: `src/content.config.ts:53-55` (drop the parser)
- Modify: `src/components/SupportLineDetail.astro:19`
- Modify: `src/pages/index.astro:12`
- Modify: `src/components/mockups/sample.ts:8`

**Interfaces:**
- Produces: `categories.json` is now a top-level JSON array of 13 category objects (each with `id`, `label`, `description`, `icon`, `color`, `priority`, `keywords`). Direct importers now receive the array itself (not `.categories`).

- [ ] **Step 1: Flatten the JSON — opening**

In `src/content/categories.json`, replace the opening wrapper:

```
{
  "categories": [
```

with:

```
[
```

- [ ] **Step 2: Flatten the JSON — closing**

In `src/content/categories.json`, replace the closing two lines:

```
  ]
}
```

with:

```
]
```

(The 13 inner objects are unchanged. The result is valid JSON; inner indentation is cosmetic.)

- [ ] **Step 3: Drop the loader parser**

In `src/content.config.ts`, change:

```ts
  loader: file("src/content/categories.json", {
    parser: (text) => JSON.parse(text).categories,
  }),
```

to:

```ts
  loader: file("src/content/categories.json"),
```

- [ ] **Step 4: Update the three direct importers**

`src/components/SupportLineDetail.astro:19` — change:

```ts
const catById = Object.fromEntries(categoriesData.categories.map((c) => [c.id, c]));
```

to:

```ts
const catById = Object.fromEntries(categoriesData.map((c) => [c.id, c]));
```

`src/pages/index.astro:12` — change:

```ts
const categories = categoriesData.categories;
```

to:

```ts
const categories = categoriesData;
```

`src/components/mockups/sample.ts:8` — change:

```ts
const categories = categoriesData.categories;
```

to:

```ts
const categories = categoriesData;
```

- [ ] **Step 5: Verify type-check and build pass**

Run: `npm run check && npm run build`
Expected: both succeed with no errors. (A failure here means a missed `.categories` reference or malformed JSON.)

- [ ] **Step 6: Spot-check the homepage rendered categories**

Run: `grep -c '"id"' src/content/categories.json`
Expected: `13` (still 13 categories after the edit).

- [ ] **Step 7: Commit**

```bash
git add src/content/categories.json src/content.config.ts src/components/SupportLineDetail.astro src/pages/index.astro src/components/mockups/sample.ts
git commit -m "Flatten categories.json to a root array for CMS editing"
```

---

### Task 2: Move article topics from TypeScript into data files

The 12 topic definitions live in `src/lib/articleCollections.ts`. Move them into `src/content/article-topics/<slug>.json` (one file per topic, each gaining an `order` field to preserve the landing-grid order), and rewrite `articleCollections.ts` to load and order them via `import.meta.glob`. The exported API (`ARTICLE_COLLECTIONS`, `getArticleCollection`, `ArticleCollectionMeta`) is unchanged, so the four consumers keep working. These JSON files are plain data — **not** an Astro content collection.

**Files:**
- Create: `src/content/article-topics/akut-och-kris.json` … `rattigheter-och-stod.json` (12 files)
- Modify: `src/lib/articleCollections.ts` (replace the hardcoded array with a glob loader)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ARTICLE_COLLECTIONS: ArticleCollectionMeta[]` (ordered) and `getArticleCollection(slug: string): ArticleCollectionMeta`, identical signatures to today. Each topic file has shape `{ slug, label, description, icon, color, order }`.

- [ ] **Step 1: Create the 12 topic files**

Create each file under `src/content/article-topics/` with exactly this content:

`akut-och-kris.json`:
```json
{
  "slug": "akut-och-kris",
  "label": "Akut och kris",
  "description": "När det är akut – stöd för de tyngsta stunderna och vägen genom en kris.",
  "icon": "four-segment-lifebuoy",
  "color": "red",
  "order": 1
}
```

`forsta-ditt-maende.json`:
```json
{
  "slug": "forsta-ditt-maende",
  "label": "Förstå ditt mående",
  "description": "Sätt ord på ångest, nedstämdhet och tomhet – och förstå vad måendet försöker säga.",
  "icon": "head-silhouette-with-question-mark-inside",
  "color": "green",
  "order": 2
}
```

`verktyg-och-sjalvhjalp.json`:
```json
{
  "slug": "verktyg-och-sjalvhjalp",
  "label": "Verktyg och självhjälp",
  "description": "Konkreta sätt att varva ner, sätta gränser och orka vardagen – ett litet steg i taget.",
  "icon": "toolbox-with-handle-and-center-latch",
  "color": "lime",
  "order": 3
}
```

`beroende-och-missbruk.json`:
```json
{
  "slug": "beroende-och-missbruk",
  "label": "Beroende och missbruk",
  "description": "Om beroende, återfall och vägen tillbaka – utan skam och utan pekpinnar.",
  "icon": "two-horizontal-interlocking-chain-links",
  "color": "amber",
  "order": 4
}
```

`annorlunda-hjarnor.json`:
```json
{
  "slug": "annorlunda-hjarnor",
  "label": "Annorlunda hjärnor",
  "description": "Adhd, autism och att fungera annorlunda – sent insett, missat eller nyss förstått.",
  "icon": "brain-split-between-circuit-and-organic-hemispheres",
  "color": "cyan",
  "order": 5
}
```

`sorg-och-forandring.json`:
```json
{
  "slug": "sorg-och-forandring",
  "label": "Sorg och förändring",
  "description": "Sorg, separationer och livsvändningar – när något tar slut och allt blir nytt.",
  "icon": "heart-with-flowing-breath-lines",
  "color": "violet",
  "order": 6
}
```

`att-vara-anhorig.json`:
```json
{
  "slug": "att-vara-anhorig",
  "label": "Att vara anhörig",
  "description": "När någon du älskar mår dåligt – din oro, din ork och din egen rätt till stöd.",
  "icon": "central-person-surrounded-by-group-arcs",
  "color": "teal",
  "order": 7
}
```

`barn-och-unga.json`:
```json
{
  "slug": "barn-och-unga",
  "label": "Barn och unga",
  "description": "Till dig som är ung – om oro, kompisar, kroppen och vem du kan prata med.",
  "icon": "adult-and-child-standing-together",
  "color": "sky",
  "order": 8
}
```

`hbtqi-och-identitet.json`:
```json
{
  "slug": "hbtqi-och-identitet",
  "label": "Hbtqi och identitet",
  "description": "Att vara den du är – identitet, utanförskap och minoritetsstress.",
  "icon": "three-arc-rainbow",
  "color": "pink",
  "order": 9
}
```

`kvinnors-halsa.json`:
```json
{
  "slug": "kvinnors-halsa",
  "label": "Kvinnors hälsa",
  "description": "Hormoner, moderskap och att bli trodd – om sådant som ofta tystas ner.",
  "icon": "female-gender-symbol",
  "color": "rose",
  "order": 10
}
```

`mans-halsa.json`:
```json
{
  "slug": "mans-halsa",
  "label": "Mäns hälsa",
  "description": "Att få må dåligt som man – känslor, ensamhet och konsten att be om hjälp.",
  "icon": "male-gender-symbol",
  "color": "indigo",
  "order": 11
}
```

`rattigheter-och-stod.json`:
```json
{
  "slug": "rattigheter-och-stod",
  "label": "Rättigheter och stöd",
  "description": "Dina rättigheter hos vård och myndigheter – och hur du driver din sak.",
  "icon": "balanced-justice-scales",
  "color": "blue",
  "order": 12
}
```

- [ ] **Step 2: Rewrite `src/lib/articleCollections.ts`**

Replace the entire file contents with:

```ts
// Display metadata for the article topic areas (the folder taxonomy under
// src/content/articles/). The data now lives in src/content/article-topics/*.json
// so it can be managed in Pages CMS; this module loads and orders it.
//
// NOTE: src/content/article-topics/*.json is plain data read via import.meta.glob,
// NOT an Astro content collection. The article `collection` frontmatter field
// stays a plain string (see content.config.ts); Pages CMS shows it as a reference
// dropdown but stores the slug string.
//
// `color` reuses the design-system colour names. The token layer only realises
// `red` distinctly; every other name falls back to the periwinkle `--accent-soft`
// via `var(--cat-<color>, --accent-soft)`. `icon` is a Nightingale `ni-*` name
// (see src/styles/icons.css), used through <Icon /> / <CategoryIcon />.

export interface ArticleCollectionMeta {
  slug: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

interface ArticleTopicFile extends ArticleCollectionMeta {
  order: number;
}

const modules = import.meta.glob<ArticleTopicFile>(
  "../content/article-topics/*.json",
  { eager: true, import: "default" },
);

// Ordered for the landing grid via each topic's `order` field.
export const ARTICLE_COLLECTIONS: ArticleCollectionMeta[] = Object.values(modules)
  .sort((a, b) => a.order - b.order)
  .map(({ slug, label, description, icon, color }) => ({
    slug,
    label,
    description,
    icon,
    color,
  }));

const BY_SLUG = new Map(ARTICLE_COLLECTIONS.map((c) => [c.slug, c]));

/** Metadata for a collection slug, with a graceful slug-derived fallback. */
export function getArticleCollection(slug: string): ArticleCollectionMeta {
  const found = BY_SLUG.get(slug);
  if (found) return found;
  return {
    slug,
    label: slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
    description: "",
    icon: "open-book-with-bookmark-ribbon",
    color: "accent",
  };
}
```

- [ ] **Step 3: Verify type-check and build pass**

Run: `npm run check && npm run build`
Expected: both succeed. (A failure means a malformed topic JSON or a glob path typo.)

- [ ] **Step 4: Verify all 12 topics render on the landing page in order**

Run: `grep -o 'Akut och kris\|Förstå ditt mående\|Rättigheter och stöd' dist/artiklar/index.html | head -3`
Expected first match: `Akut och kris` (confirms order-1 topic renders first; the landing maps `ARTICLE_COLLECTIONS` in order).

Run: `ls src/content/article-topics/*.json | wc -l`
Expected: `12`

- [ ] **Step 5: Commit**

```bash
git add src/content/article-topics src/lib/articleCollections.ts
git commit -m "Move article topics from TS into CMS-managed data files"
```

---

### Task 3: Author `.pages.yml`

Overwrite the empty `.pages.yml` with the full configuration: a media source plus four content entries (support-lines, articles, article-topics, categories). Also create the media upload folder so image inserts have a home.

**Files:**
- Modify: `.pages.yml` (currently empty)
- Create: `public/uploads/.gitkeep`

**Interfaces:**
- Consumes: the `src/content/article-topics/` folder (Task 2) and the flattened `categories.json` (Task 1) must exist for the `article-topics` and `categories` entries to resolve.
- Produces: a valid Pages CMS config exposing four collections + media.

- [ ] **Step 1: Create the media upload folder**

```bash
mkdir -p public/uploads && touch public/uploads/.gitkeep
```

- [ ] **Step 2: Write `.pages.yml`**

Overwrite `.pages.yml` with exactly:

```yaml
# Pages CMS configuration — https://pagescms.org/docs/
# Edits made in the CMS are committed to this repo; Astro rebuilds from the files.

media:
  - name: images
    label: Bilder
    input: public/uploads
    output: /uploads
    categories: [image]
    extensions: [png, jpg, jpeg, webp, svg, avif, gif]
    rename: safe

content:
  # ── Stödlinjer ───────────────────────────────────────────────
  - name: support-lines
    label: Stödlinjer
    type: collection
    path: src/content/support-lines
    format: json
    filename: "{fields.slug}.json"
    view:
      fields: [name, organization, status]
      primary: name
      sort: [name, organization]
      search: [name, organization]
      default:
        sort: name
        order: asc
    fields:
      - { name: name, label: Namn, type: string, required: true }
      - { name: organization, label: Organisation, type: string, required: true }
      - { name: slug, label: Slug (filnamn och URL), type: string, required: true }
      - { name: id, label: ID (oftast samma som slug), type: string, required: true }
      - name: type
        label: Typ
        type: select
        required: true
        options:
          values:
            - { name: direct_line, label: Direkt stödlinje }
            - { name: support_organization, label: Stödorganisation }
            - { name: organization_contact, label: Organisationskontakt }
            - { name: public_service, label: Offentlig samhällstjänst }
      - name: status
        label: Status
        type: select
        default: active
        options:
          values:
            - { name: active, label: Aktiv }
            - { name: paused, label: Pausad }
            - { name: retired, label: Avvecklad }
      - name: category
        label: Kategori
        type: select
        required: true
        options:
          values:
            - { name: acute_emergency, label: "Akut / Nödsituation" }
            - { name: mental_health, label: "Psykisk hälsa" }
            - { name: violence_abuse, label: "Våld och övergrepp" }
            - { name: children_youth, label: "Barn och unga" }
            - { name: family_parenting, label: "Familj och anhöriga" }
            - { name: substance_use, label: "Beroende och missbruk" }
            - { name: gambling, label: "Spelberoende" }
            - { name: eating_disorders, label: "Ätstörningar" }
            - { name: grief_loss, label: "Sorg och förlust" }
            - { name: identity_inclusion, label: "Identitet och inkludering" }
            - { name: care_guidance, label: "Vård och rådgivning" }
            - { name: rights_public_authority, label: "Rättigheter och myndigheter" }
            - { name: community_social_support, label: "Gemenskap och socialt stöd" }
      - { name: shortDescription, label: Kort beskrivning, type: text, required: true }
      - { name: longDescription, label: Lång beskrivning, type: text, required: true }
      - name: helpsWith
        label: Hjälper med (taggar)
        type: string
        list: true
        description: "Återanvänd befintliga slug-taggar, t.ex. angest, ensamhet."
      - { name: targetGroups, label: Målgrupper (taggar), type: string, list: true }
      - name: contactMethods
        label: Kontaktvägar
        type: object
        list:
          min: 1
          collapsible:
            collapsed: true
            summary: "{fields.label} ({fields.channel})"
        fields:
          - { name: id, label: ID, type: string, required: true }
          - name: channel
            label: Kanal
            type: select
            required: true
            options:
              values:
                - { name: phone, label: Telefon }
                - { name: chat, label: Chatt }
                - { name: sms, label: SMS }
                - { name: email, label: Mejl }
                - { name: web, label: Webb }
          - { name: label, label: Etikett, type: string, required: true }
          - { name: value, label: "Värde (nummer/adress)", type: string }
          - { name: url, label: URL, type: string }
          - { name: note, label: Notis, type: string }
          - name: openingHours
            label: Öppettider
            type: object
            list:
              collapsible:
                collapsed: true
                summary: "{fields.open}–{fields.close}"
            fields:
              - name: days
                label: Dagar
                type: select
                options:
                  multiple: true
                  values: [mon, tue, wed, thu, fri, sat, sun]
              - { name: open, label: Öppnar, type: string, default: "00:00" }
              - { name: close, label: Stänger, type: string, default: "24:00" }
              - { name: timezone, label: Tidszon, type: string, default: "Europe/Stockholm" }
              - { name: note, label: Notis, type: string }
      - name: accessibility
        label: Tillgänglighet
        type: object
        fields:
          - { name: anonymous, label: Anonymt, type: boolean, default: true }
          - { name: free, label: Kostnadsfritt, type: boolean, default: true }
          - { name: languages, label: Språk, type: string, list: true, default: [svenska] }
          - { name: region, label: Region, type: string, default: sweden }
          - { name: notes, label: Notiser, type: text }
      - name: urgency
        label: Brådska
        type: object
        fields:
          - name: level
            label: Nivå
            type: select
            required: true
            options:
              values:
                - { name: emergency, label: Nödsituation }
                - { name: urgent, label: Brådskande }
                - { name: standard, label: Standard }
          - { name: showEmergencyNotice, label: Visa nödruta, type: boolean, default: false }
          - { name: emergencyText, label: Nödtext, type: text }
      - name: source
        label: Källa
        type: object
        fields:
          - { name: primaryUrl, label: Primär URL, type: string, required: true }
          - { name: secondaryUrl, label: Sekundär URL, type: string }
          - { name: checkedAt, label: Kontrollerad, type: date, options: { format: "yyyy-MM-dd", time: false } }
          - { name: sourceUpdatedAt, label: "Källa uppdaterad", type: date, options: { format: "yyyy-MM-dd", time: false } }
          - name: confidence
            label: Tillförlitlighet
            type: select
            options:
              values:
                - { name: high, label: Hög }
                - { name: medium, label: Medel }
                - { name: low, label: Låg }
      - name: display
        label: Visning
        type: object
        fields:
          - { name: featured, label: Utvald, type: boolean, default: false }
          - { name: priority, label: Prioritet, type: number, default: 0 }
          - { name: primaryLabel, label: Primär etikett, type: string, required: true }
          - { name: availabilityLabel, label: Tillgänglighetsetikett, type: string, required: true }
      - name: metadata
        label: Metadata
        type: object
        fields:
          - { name: lastVerified, label: Senast verifierad, type: date, options: { format: "yyyy-MM-dd", time: false } }
          - { name: nextReview, label: Nästa översyn, type: date, options: { format: "yyyy-MM-dd", time: false } }
          - { name: resourceKind, label: Resurstyp, type: string }
          - { name: supportLine, label: Är stödlinje, type: boolean }

  # ── Artiklar ─────────────────────────────────────────────────
  - name: articles
    label: Artiklar
    type: collection
    path: src/content/articles
    format: yaml-frontmatter
    subfolders: true
    filename: "{fields.collection}/{primary}.md"
    view:
      fields: [title, date, draft]
      primary: title
      sort: [date, title]
      search: [title, description]
      default:
        sort: date
        order: desc
    fields:
      - name: type
        label: Typ
        type: select
        default: article
        options:
          values:
            - { name: article, label: Artikel }
            - { name: guide, label: Guide }
      - { name: title, label: Titel, type: string, required: true }
      - { name: description, label: Beskrivning, type: text, required: true }
      - { name: date, label: Datum, type: date, required: true, options: { format: "yyyy-MM-dd", time: false } }
      - { name: updated, label: Uppdaterad, type: date, options: { format: "yyyy-MM-dd", time: false } }
      - { name: author, label: Författare, type: string, required: true, default: "Johanna Fagerås" }
      - name: collection
        label: Ämne
        type: reference
        required: true
        options:
          collection: article-topics
          value: "{fields.slug}"
          label: "{fields.label}"
          search: [label, slug]
      - { name: tags, label: Taggar, type: string, list: true }
      - { name: readingTime, label: Lästid, type: string }
      - { name: references, label: Källor, type: text, list: true }
      - name: relatedArticles
        label: Relaterade artiklar
        type: object
        list:
          collapsible:
            collapsed: true
            summary: "{fields.title}"
        fields:
          - { name: title, label: Titel, type: string }
          - { name: url, label: URL, type: string }
      - name: relatedSupportLines
        label: Relaterade stödlinjer
        type: reference
        options:
          collection: support-lines
          multiple: true
          value: "{fields.slug}"
          label: "{fields.name}"
          search: [name, organization]
      - { name: crisisBanner, label: Visa krisbanner, type: boolean, default: false }
      - { name: draft, label: Utkast, type: boolean, default: false }
      - { name: body, label: Innehåll, type: rich-text }

  # ── Artikelämnen ─────────────────────────────────────────────
  - name: article-topics
    label: Artikelämnen
    type: collection
    path: src/content/article-topics
    format: json
    filename: "{fields.slug}.json"
    view:
      fields: [label, slug, order]
      primary: label
      sort: [order, label]
      default:
        sort: order
        order: asc
    fields:
      - { name: slug, label: Slug, type: string, required: true }
      - { name: label, label: Etikett, type: string, required: true }
      - { name: description, label: Beskrivning, type: text, required: true }
      - name: icon
        label: "Ikon (Nightingale-namn)"
        type: string
        required: true
        description: "Ett ikonnamn som finns i src/styles/icons.css, utan ni-prefix."
      - name: color
        label: Färg
        type: select
        options:
          values: [red, green, rose, sky, teal, lime, amber, pink, blue, violet, cyan, indigo, orange]
      - { name: order, label: Ordning, type: number, required: true }

  # ── Kategorier ───────────────────────────────────────────────
  - name: categories
    label: Kategorier
    type: file
    path: src/content/categories.json
    format: json
    list: true
    fields:
      - { name: id, label: ID, type: string, required: true }
      - { name: label, label: Etikett, type: string, required: true }
      - { name: description, label: Beskrivning, type: text, required: true }
      - name: icon
        label: "Ikon (Nightingale-namn)"
        type: string
        required: true
        description: "Ett ikonnamn som finns i src/styles/icons.css, utan ni-prefix."
      - name: color
        label: Färg
        type: select
        options:
          values: [red, green, rose, sky, teal, lime, amber, pink, blue, violet, cyan, indigo, orange]
      - { name: priority, label: Prioritet, type: number, required: true }
      - { name: keywords, label: Nyckelord, type: string, list: true }
```

- [ ] **Step 3: Verify `.pages.yml` is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.pages.yml')); print('valid YAML')"`
Expected: `valid YAML`.
If `python3`/PyYAML is unavailable, paste the file into https://www.yamllint.com/ instead, or run `npx -y js-yaml .pages.yml >/dev/null && echo ok`.

- [ ] **Step 4: Verify the Astro build still passes with the new files present**

Run: `npm run check && npm run build`
Expected: both succeed (the `.gitkeep` and `.pages.yml` don't affect Astro, but this confirms nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add .pages.yml public/uploads/.gitkeep
git commit -m "Add Pages CMS configuration for all content collections"
```

---

### Task 4: Activate Pages CMS and smoke-test end to end (manual, by repo owner)

This task connects the repo to the hosted CMS and validates behavior that can only be checked against the live app (form rendering, filename templating, the nested-array category file). No code; it is a verification checklist with two documented fallbacks.

**Files:** none (may produce a follow-up edit to `.pages.yml` if a fallback is needed).

- [ ] **Step 1: Merge/push the branch so the config is on the default branch Pages CMS reads**

Push `pagescms-setup` and open a PR (or merge to `main`), per the repo's normal flow. Pages CMS reads `.pages.yml` from the connected branch.

- [ ] **Step 2: Connect the repository**

At https://app.pagescms.org sign in with GitHub → install the Pages CMS GitHub App on the `johannaefageras/stodlinjer-v2` repo → open the repo in Pages CMS. Confirm it loads without a config error and shows all four collections (Stödlinjer, Artiklar, Artikelämnen, Kategorier) plus the Bilder media source.

- [ ] **Step 3: Verify the Kategorier file loads as a 13-item list**

Open **Kategorier**. Expected: 13 editable entries with id/label/description/icon/color/priority/keywords.
Fallback if it does **not** load (Pages CMS can't model the root array): in `.pages.yml`, remove the `categories` content entry and instead keep categories editable only via the support-line `category` select (categories then become read-only in the CMS). Commit that change. Record the outcome in the design doc.

- [ ] **Step 4: Verify a new article files into the right topic folder**

In **Artiklar**, create a draft article, pick an Ämne (e.g. "Förstå ditt mående"), save. Expected: the new file is committed to `src/content/articles/forsta-ditt-maende/<slug>.md` with `collection: forsta-ditt-maende` in the frontmatter.
Fallback if the subfolder is **not** created from the `{fields.collection}/...` template: change the articles `filename` to `"{primary}.md"` and keep `subfolders: true` (the editor then picks the folder manually; the frontmatter `collection` remains the source of truth, so the site is unaffected). Commit that change.

- [ ] **Step 5: Verify references and media round-trip**

In the same draft: add a Relaterad stödlinje (confirm the dropdown searches the 53 support lines and stores the slug), insert an image in Innehåll (confirm it uploads to `public/uploads/` and the body uses a `/uploads/...` URL), then save. Delete the test article afterward.

- [ ] **Step 6: Confirm the site rebuilds**

Run locally: `npm run check && npm run build`
Expected: both pass with the CMS-created/edited files in place. Confirm the test support-line/article/topic edits match their schemas.

---

## Self-Review

**Spec coverage:**
- Non-technical polished forms → Tasks 3 (all four forms, Swedish labels, selects/date pickers/nested collapsible objects). ✓
- Support-lines full nested schema (contactMethods → openingHours, accessibility, urgency, source, display, metadata) → Task 3 support-lines fields. ✓
- Articles frontmatter + rich-text body + multi-reference relatedSupportLines + topic reference → Task 3 articles. ✓
- Article topics refactored from TS to data + reference picker → Tasks 2 & 3. ✓
- Categories kept single-file + select picker, editable as file-list → Tasks 1 & 3 (with Task 4 fallback if the nested array can't be modeled). ✓
- Media for article images → Task 3 media + `public/uploads`. ✓
- Activation steps → Task 4. ✓
- Verification (build/check, valid YAML, round-trip) → Task 1.5, 2.3-4, 3.3-4, 4.6. ✓

**Placeholder scan:** No TBD/TODO/"appropriate handling". Every code/config step shows full content. Task 4 fallbacks are concrete, conditional actions (not placeholders).

**Type consistency:** `ArticleCollectionMeta`/`getArticleCollection`/`ARTICLE_COLLECTIONS` names match across Task 2 and existing consumers. Select stored values (`name`) match the data (category ids, channel/level/confidence/status/type enums). Reference `value` templates (`{fields.slug}`) match the entry filenames and the plain-string values Astro's `reference()` expects. Date `format: yyyy-MM-dd` matches the ISO date strings in the JSON/frontmatter.
