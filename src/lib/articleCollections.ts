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
