// Stödkompassen — shared data + prompt builder for the AI chat.
//
// Two consumers:
//   • src/pages/api/chat.ts   → buildSystemPrompt() (the model's grounding)
//   • Stodkompassen.astro      → buildClientLines() (display data the browser
//                                 uses to render real line cards from markers)
//
// Grounding is belt-and-suspenders: the model only ever picks WHICH line to
// recommend (by slug, from the catalog below) and emits a `[[line:slug]]`
// marker. The browser renders the card — name, number, hours, link — from the
// verified dataset, so contact details never come from model-generated text.

import { getCollection, type CollectionEntry } from "astro:content";
import categoriesData from "../content/categories.json";
import { detailHours, closedDays, type Hours } from "./hours";
import { getArticleCollection } from "./articleCollections";

type Line = CollectionEntry<"supportLines">;
type Article = CollectionEntry<"articles">;

const catById = Object.fromEntries(categoriesData.map((c) => [c.id, c]));

const CHANNEL_LABEL: Record<string, string> = {
  phone: "telefon",
  chat: "chatt",
  sms: "sms",
  email: "e-post",
  web: "webb",
};

// Active lines, sorted the same way the homepage grid sorts them
// (featured first, then priority, then Swedish-collated name) so the model
// sees the most prominent resources first.
async function activeLines(): Promise<Line[]> {
  const lines = await getCollection(
    "supportLines",
    (e) => e.data.status === "active",
  );
  return lines.sort((a, b) => {
    const f = Number(b.data.display.featured) - Number(a.data.display.featured);
    if (f !== 0) return f;
    const p = b.data.display.priority - a.data.display.priority;
    if (p !== 0) return p;
    return a.data.name.localeCompare(b.data.name, "sv");
  });
}

// The headline contact (phone first, else first actionable method) — shared
// logic with the homepage card, kept identical so the chat card matches.
function headlineOf(line: Line) {
  const cm = line.data.contactMethods;
  return (
    cm.find((c) => c.channel === "phone" && c.value) ??
    cm.find((c) => c.value || c.url) ??
    cm[0]
  );
}

// ── Model-facing catalog ───────────────────────────────────────────────────

function contactSummary(line: Line): string {
  return line.data.contactMethods
    .map((c) => {
      const label = CHANNEL_LABEL[c.channel] ?? c.channel;
      return c.value ? `${label} ${c.value}` : label;
    })
    .join(", ");
}

function catalogEntry(line: Line): string {
  const d = line.data;
  const cat = catById[d.category.id];
  const yesno = (b: boolean) => (b ? "ja" : "nej");
  const lines = [
    `[${d.slug}] ${d.name} (${d.organization}) — ${cat?.label ?? d.category.id}`,
    `  ${d.shortDescription}`,
    d.helpsWith.length ? `  hjälper med: ${d.helpsWith.join(", ")}` : null,
    d.targetGroups.length ? `  för: ${d.targetGroups.join(", ")}` : null,
    `  kontakt: ${contactSummary(line)} · ${d.display.availabilityLabel}`,
    `  anonymt: ${yesno(d.accessibility.anonymous)} · gratis: ${yesno(
      d.accessibility.free,
    )} · språk: ${d.accessibility.languages.join(", ")} · brådska: ${d.urgency.level}`,
  ];
  return lines.filter(Boolean).join("\n");
}

// ── Prompt = shared CORE + per-surface PROFILE + live catalog ────────────────
//
// The CORE holds everything safety- and grounding-critical: tone, the
// slug-marker contract, the not-a-therapist boundary, the acute baseline.
// It is identical on every surface, so the model behaves consistently no
// matter where it's embedded.
//
// The PROFILE is a thin per-surface layer. The widget (launcher panel) stays
// terse and single-step; the full page (/chatt/) may explain a little more and
// offer a couple more options. Same safety, different verbosity — far more
// robust than one identical block pretending both surfaces are the same.

const CORE = `Du är **Stödkompassen**, en varm och omtänksam vägledare på stodlinjer.se — en svensk sajt som samlar stödlinjer och krisresurser. Din uppgift är att lyssna, förstå personens situation och hjälpa hen vidare till rätt riktigt stöd: rätt stödlinje, rätt artikel, rätt akutnivå.

# Språk och ton
- Svara alltid på svenska, i du-form, om inte personen tydligt föredrar annat språk. Förstår du en engelsk fråga får du svara kort på engelska och ändå rekommendera svenska resurser.
- Var varm, vardaglig och mänsklig — aldrig klinisk eller byråkratisk.
- Validera känslor genuint och kortfattat innan du vägleder ("Det låter tungt", "Tack för att du berättar").

# Så här samtalar du
- Ställ som mest en eller två korta följdfrågor för att förstå: vad handlar det om, vem gäller det (du själv eller någon annan), hur akut det är, och om personen helst vill ringa, chatta eller vara anonym. Tvinga inte fram frågor om situationen redan är tydlig.
- Rekommendera sedan den eller de resurser som passar bäst, utifrån katalogen längre ner.

# Hur du rekommenderar (VIKTIGT — grunden för att inget hittas på)
- Stödlinje: skriv markören [[line:slug]] på egen rad, t.ex. [[line:sjalvmordslinjen]].
- Artikel: skriv markören [[article:ämne/slug]] på egen rad, t.ex. [[article:akut-och-kris/att-overleva-natten]]. Använd exakt den slug inom hakparenteser som står före titeln i artikelkatalogen.
- Personens skärm renderar då ett klickbart kort med RIKTIGT telefonnummer, öppettider och länk — hämtat från vår verifierade data. Du behöver därför ALDRIG skriva ut telefonnummer, öppettider, åldersgränser eller länkar själv, och får ALDRIG hitta på dem.
- Använd bara slugs som finns i katalogerna nedan. Hittar du ingen passande artikel: hänvisa allmänt till /artiklar/ utan markör. Hitta aldrig på en slug.
- Nämn resursen vid namn i texten och lägg till markören på egen rad.

# Lite stöd på vägen — men inte vård
- Du får erbjuda enkel, väletablerad egenhjälp i stunden (t.ex. ett andnings- eller grundningstips).
- Men du är INTE terapeut. Ställ aldrig diagnos, ge inte medicinska eller kliniska råd, och bedriv ingen behandling. Led alltid vidare till riktigt mänskligt stöd.

# Akut läge (baslinje — gäller alltid)
- Om någon uttrycker självmordstankar, planer på att skada sig själv eller andra, eller en akut nödsituation: sätt säkerheten först.
- Lyft då OMEDELBART fram [[line:sjalvmordslinjen]] (öppen dygnet runt) och påminn om 112 vid akut fara för liv — innan du utforskar vidare.

# Avgränsning
- Du finns för att hjälpa människor hitta rätt stöd. Om någon ber om annat (allmänt småprat, diagnoser, uppgifter som inte rör stöd), led vänligt tillbaka till det du kan hjälpa med.`;

const WIDGET_PROFILE = `# Den här ytan: kompakt chattruta
- Var extra kortfattad. Några meningar, ett tydligt nästa steg i taget.
- Ställ högst EN följdfråga åt gången.
- Visa högst två stödlinjekort, och högst en artikel — bara när den verkligen avlastar (t.ex. "är det här akut?"). Tänk kompassnål, inte uppsats.`;

const PAGE_PROFILE = `# Den här ytan: hela chattsidan
- Du får förklara något mer och ge tydliga nästa steg, men håll fortfarande styckena korta.
- Du får visa upp till tre stödlinjer och upp till två artiklar när det hjälper, och kort motivera varför de valts.
- Du får spegla det personen sagt ("Du nämnde att det gäller din dotter och att ni vill vara anonyma") för att visa att du lyssnat.`;

const CATALOG_INTRO = `# Katalog över stödlinjer (en av två källor du får rekommendera ur)
Formatet är: [slug] Namn (Organisation) — Kategori, följt av beskrivning och fakta.
`;

const ARTICLE_INTRO = `# Katalog över artiklar (den andra källan — använd [[article:ämne/slug]])
Rekommendera en artikel när personen vill förstå, läsa eller orientera sig, eller som komplement till en stödlinje. Välj bara slugs härifrån.
Formatet är: [ämne/slug] Titel — ämnesområde :: kort beskrivning.
Vissa artiklar har raden "passande stödlinjer" — det är förslag på linjer som ofta hör ihop med ämnet. Du får gärna rekommendera en sådan linje tillsammans med artikeln när det passar, men det är inget krav, och du väljer alltid det som stämmer bäst med personens situation.
`;

export type UiMode = "widget" | "page";

// Cache per surface — the catalog is identical, only the thin profile differs.
const cachedPrompt: Partial<Record<UiMode, string>> = {};

/**
 * The full system prompt for a surface: shared CORE + surface PROFILE + the
 * live line catalog + the article catalog. Built once per surface and reused
 * (the catalog blocks are also what the API prompt-caches).
 */
export async function buildSystemPrompt(uiMode: UiMode = "page"): Promise<string> {
  const hit = cachedPrompt[uiMode];
  if (hit) return hit;
  const [lines, articles] = await Promise.all([activeLines(), publishedArticles()]);
  const lineCatalog = lines.map(catalogEntry).join("\n\n");
  const articleCatalog = articles.map((a) => articleCatalogEntry(a, lines)).join("\n");
  const profile = uiMode === "widget" ? WIDGET_PROFILE : PAGE_PROFILE;
  const prompt =
    `${CORE}\n\n${profile}\n\n` +
    `${CATALOG_INTRO}\n${lineCatalog}\n\n` +
    `${ARTICLE_INTRO}\n${articleCatalog}\n`;
  cachedPrompt[uiMode] = prompt;
  return prompt;
}

// ── Articles: model-facing catalog + slug resolution ─────────────────────
//
// Articles are globbed as `**/*.md`, so entry.id looks like
// "akut-och-kris/att-overleva-natten" — which is already "collection/slug" and
// is globally unique (bare filenames are NOT: e.g. "tankar-du-skams-over"
// exists in both forsta-ditt-maende and barn-och-unga). So the chat marker is
// [[article:collection/slug]] and that composite id is the key everywhere:
// model catalog, client card map, and the URL /artiklar/{collection}/{slug}/.

/** The composite "collection/slug" id used in markers and as the card-map key. */
function articleKeyOf(entry: Article): string {
  return entry.id; // glob id is already "collection/slug"
}

// ── Tag-based article→line association ───────────────────────────────────────
//
// relatedSupportLines is defined in the CMS but unused across the corpus (the
// relevant lines are written into each article's prose instead). So instead of
// reading an empty field, we INFER companion lines at build time from an
// article's tags + collection against each line's helpsWith / category keywords
// / targetGroups. These are surfaced in the catalog as *suggested* lines — a
// ranked hint the model may use when recommending an article, never a mandate.
//
// The scoring is deliberately simple and transparent: token overlap with light
// Swedish suffix-stripping, generic emotional tokens discounted (they match
// everything), and a strong bonus when the article's collection aligns with the
// line's category. A minimum threshold suppresses weak single-token flukes.

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
}
function stemToken(w: string): string {
  for (const suf of ["andet", "ande", "arna", "erna", "orna", "tankar", "tanke", "else", "ning", "ade", "are", "or", "er", "ar", "en", "et", "na"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}
function toTokens(s: string): string[] {
  return normToken(s).split(/[\s-]+/).filter(Boolean).map(stemToken);
}

// Emotionally generic tokens present on many lines/articles; a match here is
// weak evidence, so it's discounted rather than counted at full weight.
const GENERIC_TOKENS = new Set(
  ["oro", "angst", "angest", "ensam", "ensamh", "skam", "stod", "sok", "soka", "hjalp", "sjalvhjalp", "mae", "maen", "daligt", "kris", "samtalsstod", "vard", "trygg", "vuxen"].map(stemToken),
);

// Article collection → the line category it most aligns with. Used for a strong
// topical bonus. Collections without a clean 1:1 line category map to
// mental_health, the broadest support category.
const COLLECTION_TO_CATEGORY: Record<string, string> = {
  "akut-och-kris": "mental_health",
  "beroende-och-missbruk": "substance_use",
  "hbtqi-och-identitet": "identity_inclusion",
  "sorg-och-forandring": "grief_loss",
  "barn-och-unga": "children_youth",
  "att-vara-anhorig": "family_parenting",
  "kvinnors-halsa": "mental_health",
  "mans-halsa": "mental_health",
  "forsta-ditt-maende": "mental_health",
  "annorlunda-hjarnor": "mental_health",
  "rattigheter-och-stod": "rights_public_authority",
  "verktyg-och-sjalvhjalp": "mental_health",
};

const ASSOC_MIN_SCORE = 2.5;
const ASSOC_MAX_LINES = 3;

// Weighted token set for a line (helpsWith/keywords = 2, group/category = 1;
// generic tokens capped at 1 regardless of source).
function lineTokenWeights(line: Line): Map<string, number> {
  const m = new Map<string, number>();
  const cat = catById[line.data.category.id];
  const add = (arr: string[], w: number) => {
    for (const x of arr)
      for (const t of toTokens(x)) {
        const weight = GENERIC_TOKENS.has(t) ? Math.min(w, 1) : w;
        m.set(t, Math.max(m.get(t) ?? 0, weight));
      }
  };
  add(line.data.helpsWith, 2);
  add(cat?.keywords ?? [], 2);
  add(line.data.targetGroups, 1);
  add([line.data.category.id], 1);
  return m;
}

function associationScore(entry: Article, line: Line, lw: Map<string, number>): number {
  const at = new Set<string>();
  for (const tag of entry.data.tags ?? []) toTokens(tag).forEach((t) => at.add(t));
  let s = 0;
  for (const t of at) {
    const w = lw.get(t);
    if (w) s += GENERIC_TOKENS.has(t) ? 0.5 : w;
  }
  if (COLLECTION_TO_CATEGORY[entry.data.collection] === line.data.category.id) s += 3;
  return s;
}

/** Top companion-line slugs for an article, ranked, above the score threshold. */
function suggestedLineSlugs(entry: Article, lines: Line[]): string[] {
  return lines
    .map((line) => ({ slug: line.data.slug, score: associationScore(entry, line, lineTokenWeights(line)) }))
    .filter((r) => r.score >= ASSOC_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, ASSOC_MAX_LINES)
    .map((r) => r.slug);
}

// Published (non-draft) articles, newest first, so the model sees current
// material at the top. Small corpus (~150) — fine to inject wholesale.
async function publishedArticles(): Promise<Article[]> {
  const articles = await getCollection("articles", (e) => !e.data.draft);
  return articles.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

function articleCatalogEntry(entry: Article, lines: Line[]): string {
  const d = entry.data;
  const topic = getArticleCollection(d.collection).label || d.collection;
  const suggested = suggestedLineSlugs(entry, lines);
  const companion = suggested.length ? `\n  passande stödlinjer: ${suggested.join(", ")}` : "";
  return `[${articleKeyOf(entry)}] ${d.title} — ${topic} :: ${d.description}${companion}`;
}

// ── Client-facing display data (for rendering recommended-line cards) ───────

export interface ClientLine {
  slug: string;
  name: string;
  shortDescription: string;
  categoryColor: string;
  categoryIcon: string;
  categoryLabel: string;
  primaryValue: string;
  primaryChannel: "phone" | "chat" | "sms" | "email" | "web";
  primaryHref: string | null;
  hoursDetail: { dayRange: string; time: string }[];
  hoursClosed: string | null;
  website: string | null;
  href: string;
}

function clientLineOf(line: Line): ClientLine {
  const d = line.data;
  const cat = catById[d.category.id];
  const headline = headlineOf(line);
  const isPhone = headline.channel === "phone";

  const primaryValue = isPhone
    ? (headline.value ?? d.display.primaryLabel)
    : (headline.label ?? d.display.primaryLabel);

  const primaryHref = isPhone
    ? headline.value
      ? `tel:${headline.value.replace(/\D/g, "")}`
      : null
    : (headline.url ?? null);

  const entries = (headline.openingHours ?? []) as Hours[];

  return {
    slug: d.slug,
    name: d.name,
    shortDescription: d.shortDescription,
    categoryColor: cat?.color ?? "violet",
    categoryIcon: cat?.icon ?? "compass",
    categoryLabel: cat?.label ?? d.category.id,
    primaryValue,
    primaryChannel: headline.channel,
    primaryHref,
    hoursDetail: detailHours(entries),
    hoursClosed: closedDays(entries),
    website: d.source.primaryUrl ?? null,
    href: `/stodlinjer/${d.slug}/`,
  };
}

/** Display data for every active line, keyed by slug, for client card rendering. */
export async function buildClientLines(): Promise<Record<string, ClientLine>> {
  const lines = await activeLines();
  return Object.fromEntries(lines.map((l) => [l.data.slug, clientLineOf(l)]));
}

// ── Client-facing article display data (for rendering recommended-article cards) ─

export interface ClientArticle {
  slug: string;
  title: string;
  description: string;
  collectionLabel: string;
  categoryColor: string;
  categoryIcon: string;
  readingTime: string | null;
  href: string;
}

function clientArticleOf(entry: Article): ClientArticle {
  const d = entry.data;
  const meta = getArticleCollection(d.collection);
  const slug = entry.id.slice(entry.id.lastIndexOf("/") + 1);
  return {
    slug,
    title: d.title,
    description: d.description,
    collectionLabel: meta.label || d.collection,
    categoryColor: meta.color || "violet",
    categoryIcon: meta.icon || "open-book-with-bookmark-ribbon",
    readingTime: d.readingTime ?? null,
    href: `/artiklar/${d.collection}/${slug}/`,
  };
}

/**
 * Display data for every published article, keyed by composite "collection/slug"
 * id (matching the [[article:collection/slug]] marker), for client card
 * rendering. Mirrors buildClientLines(): the model emits the marker, the client
 * renders a verified card from this map (never from model text).
 */
export async function buildClientArticles(): Promise<Record<string, ClientArticle>> {
  const articles = await publishedArticles();
  return Object.fromEntries(articles.map((a) => [articleKeyOf(a), clientArticleOf(a)]));
}
