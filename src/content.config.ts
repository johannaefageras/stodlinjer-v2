import { defineCollection, reference, z } from "astro:content";
import { glob, file } from "astro/loaders";

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────

// The 13 category colour names actually used in the data. The token
// layer (tokens.css) maps each of these to an HSL value; the schema
// only guarantees the name is one the design system knows about.
const categoryColor = z.enum([
  "red",
  "green",
  "rose",
  "sky",
  "teal",
  "lime",
  "amber",
  "pink",
  "blue",
  "violet",
  "cyan",
  "indigo",
  "orange",
]);

const weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const openingHours = z.object({
  days: z.array(weekday).nonempty(),
  open: z.string(), // "00:00" — 24h. "24:00" used in data for end-of-day.
  close: z.string(),
  timezone: z.string().default("Europe/Stockholm"),
  note: z.string().optional(),
});

const contactMethod = z.object({
  id: z.string(),
  channel: z.enum(["phone", "chat", "sms", "email", "web"]),
  label: z.string(),
  value: z.string().optional(), // phone/sms/email have value; web/chat use url
  url: z.string().url().optional(),
  note: z.string().optional(),
  openingHours: z.array(openingHours).default([]),
});

// ─────────────────────────────────────────────────────────────
// Categories — one shared reference file (categories.json)
// A small, stable lookup table; not split per-entry.
// ─────────────────────────────────────────────────────────────

const categories = defineCollection({
  loader: file("src/content/categories.json"),
  schema: z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    icon: z.string(), // Nightingale icon name without the "ni-" prefix.
    color: categoryColor,
    priority: z.number().int(),
    keywords: z.array(z.string()).default([]),
  }),
});

// ─────────────────────────────────────────────────────────────
// Support lines — one file per line in src/content/support-lines/
// Schema mirrors the existing JSON shape exactly.
// ─────────────────────────────────────────────────────────────

const supportLines = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/support-lines" }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    organization: z.string(),
    type: z.enum([
      "direct_line",
      "support_organization",
      "organization_contact",
      "public_service",
    ]),
    status: z.enum(["active", "paused", "retired"]).default("active"),
    category: reference("categories"),

    shortDescription: z.string(),
    longDescription: z.string(),

    // Free-form, high-cardinality facets — kept as open string arrays,
    // not enums (194 / 71 distinct values in the data).
    helpsWith: z.array(z.string()).default([]),
    targetGroups: z.array(z.string()).default([]),

    contactMethods: z.array(contactMethod).nonempty(),

    accessibility: z.object({
      anonymous: z.boolean(),
      free: z.boolean(),
      languages: z.array(z.string()).default(["svenska"]),
      region: z.string().default("sweden"),
      notes: z.string().optional(),
    }),

    // Drives the unified crisis banner. See CRISIS_BANNER note below.
    urgency: z.object({
      level: z.enum(["emergency", "urgent", "standard"]),
      showEmergencyNotice: z.boolean().default(false),
      emergencyText: z.string().optional(),
    }),

    source: z.object({
      primaryUrl: z.string().url(),
      secondaryUrl: z.string().url().optional(),
      checkedAt: z.string(), // ISO date
      sourceUpdatedAt: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]),
    }),

    display: z.object({
      featured: z.boolean().default(false),
      priority: z.number().int().default(0),
      primaryLabel: z.string(),
      availabilityLabel: z.string(),
    }),

    metadata: z.object({
      lastVerified: z.string(),
      nextReview: z.string(),
      resourceKind: z.string().optional(),
      supportLine: z.boolean().optional(),
    }),
  }),
});

// ─────────────────────────────────────────────────────────────
// Articles & guides — ONE collection, distinguished by `type`.
// Markdown body + frontmatter mirroring the existing template.
// ─────────────────────────────────────────────────────────────

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    // Authored files omit this; they're all articles. Default keeps them valid
    // while still letting a piece opt into "guide".
    type: z.enum(["article", "guide"]).default("article"),
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string(),
    collection: z.string(), // topic area, e.g. "rattigheter-och-stod"
    tags: z.array(z.string()).default([]),
    readingTime: z.string().optional(),
    references: z.array(z.string()).default([]),

    // Article-to-article links authored in frontmatter ({ title, url }).
    relatedArticles: z
      .array(z.object({ title: z.string(), url: z.string() }))
      .default([]),

    // NEW: lets an article render live support-line cards inline.
    relatedSupportLines: z.array(reference("supportLines")).default([]),

    // NEW: part of the unified crisis-banner trigger (see below).
    crisisBanner: z.boolean().default(false),

    draft: z.boolean().default(false),
  }),
});

export const collections = { categories, supportLines, articles };

// ─────────────────────────────────────────────────────────────
// CRISIS_BANNER — one shared rule, two data sources.
// A piece of content shows the crisis banner when ANY of:
//   • support line:  urgency.level === "emergency" || urgency.showEmergencyNotice
//   • article/guide: crisisBanner === true || tags include an acute tag
// Centralise this in a helper (src/lib/crisis.ts) so the same
// <CrisisBanner /> component fires identically in both places.
// ─────────────────────────────────────────────────────────────
