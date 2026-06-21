// Display metadata for the 12 article collections (the folder taxonomy under
// src/content/articles/). This is a SEPARATE taxonomy from the 13 support-line
// `categories` — articles group by topic area, not by the support-line schema.
//
// `color` reuses the design-system colour names. Note the token layer only
// realises `red` distinctly (the emergency rose tint); every other name falls
// back to the periwinkle `--accent-soft` via `var(--cat-<color>, --accent-soft)`,
// exactly as SupportLineCard behaves. `icon` is a Nightingale `ni-*` name
// (see src/styles/icons.css), used through <Icon /> / <CategoryIcon />.

export interface ArticleCollectionMeta {
  slug: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

// Ordered for the landing grid: acute first, then roughly by how broadly the
// topic applies.
export const ARTICLE_COLLECTIONS: ArticleCollectionMeta[] = [
  {
    slug: "akut-och-kris",
    label: "Akut och kris",
    description:
      "När det är akut – stöd för de tyngsta stunderna och vägen genom en kris.",
    icon: "four-segment-lifebuoy",
    color: "red",
  },
  {
    slug: "forsta-ditt-maende",
    label: "Förstå ditt mående",
    description:
      "Sätt ord på ångest, nedstämdhet och tomhet – och förstå vad måendet försöker säga.",
    icon: "head-silhouette-with-question-mark-inside",
    color: "green",
  },
  {
    slug: "verktyg-och-sjalvhjalp",
    label: "Verktyg och självhjälp",
    description:
      "Konkreta sätt att varva ner, sätta gränser och orka vardagen – ett litet steg i taget.",
    icon: "toolbox-with-handle-and-center-latch",
    color: "lime",
  },
  {
    slug: "beroende-och-missbruk",
    label: "Beroende och missbruk",
    description:
      "Om beroende, återfall och vägen tillbaka – utan skam och utan pekpinnar.",
    icon: "two-horizontal-interlocking-chain-links",
    color: "amber",
  },
  {
    slug: "annorlunda-hjarnor",
    label: "Annorlunda hjärnor",
    description:
      "Adhd, autism och att fungera annorlunda – sent insett, missat eller nyss förstått.",
    icon: "brain-split-between-circuit-and-organic-hemispheres",
    color: "cyan",
  },
  {
    slug: "sorg-och-forandring",
    label: "Sorg och förändring",
    description:
      "Sorg, separationer och livsvändningar – när något tar slut och allt blir nytt.",
    icon: "heart-with-flowing-breath-lines",
    color: "violet",
  },
  {
    slug: "att-vara-anhorig",
    label: "Att vara anhörig",
    description:
      "När någon du älskar mår dåligt – din oro, din ork och din egen rätt till stöd.",
    icon: "central-person-surrounded-by-group-arcs",
    color: "teal",
  },
  {
    slug: "barn-och-unga",
    label: "Barn och unga",
    description:
      "Till dig som är ung – om oro, kompisar, kroppen och vem du kan prata med.",
    icon: "adult-and-child-standing-together",
    color: "sky",
  },
  {
    slug: "hbtqi-och-identitet",
    label: "Hbtqi och identitet",
    description:
      "Att vara den du är – identitet, utanförskap och minoritetsstress.",
    icon: "three-arc-rainbow",
    color: "pink",
  },
  {
    slug: "kvinnors-halsa",
    label: "Kvinnors hälsa",
    description:
      "Hormoner, moderskap och att bli trodd – om sådant som ofta tystas ner.",
    icon: "female-gender-symbol",
    color: "rose",
  },
  {
    slug: "mans-halsa",
    label: "Mäns hälsa",
    description:
      "Att få må dåligt som man – känslor, ensamhet och konsten att be om hjälp.",
    icon: "male-gender-symbol",
    color: "indigo",
  },
  {
    slug: "rattigheter-och-stod",
    label: "Rättigheter och stöd",
    description:
      "Dina rättigheter hos vård och myndigheter – och hur du driver din sak.",
    icon: "balanced-justice-scales",
    color: "blue",
  },
];

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
