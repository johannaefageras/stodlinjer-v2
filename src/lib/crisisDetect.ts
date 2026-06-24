// Pre-LLM crisis detection for Stödkompassen.
//
// This is the conversational safety gate the chat route runs BEFORE calling
// the model. It does not replace the model's reply — it returns a directive
// that gets prepended to the system prompt so the model leads, immediately
// and warmly, with the right safety step (112 + Självmordslinjen) before
// anything else.
//
// Design principles:
//   • Conservative. We match expressed risk, not ordinary sadness. A false
//     "acute" that shoves 112 at someone who's just having a hard day erodes
//     trust; we'd rather under-trigger "acute" and let the model handle the
//     warmth. ("concern" is the gentle middle tier for exactly that reason.)
//   • Latest turn first. Risk lives in what the person just said. Earlier
//     turns only nudge, they don't decide.
//   • Bilingual (sv + en). The site is Swedish but people in distress write
//     in whatever language reaches first.
//   • No logging. Consistent with the route's privacy-first stance — this
//     module never persists or emits message content.
//
// Slugs referenced here MUST exist in src/content/support-lines/ and render
// as cards client-side: sjalvmordslinjen, 112-sos-alarm.

export type CrisisTier = "none" | "concern" | "acute";

export interface CrisisResult {
  tier: CrisisTier;
  /** Coarse signal label for internal reasoning/tests. Never user-facing. */
  signal: string | null;
}

// ── Normalisation ────────────────────────────────────────────────────────
// Lowercase, drop apostrophes (so "can't" → "cant" stays one token), strip
// remaining punctuation to spaces, collapse whitespace. We keep Swedish
// letters. "Vill INTE leva!!!" and "vill inte leva" then match identically.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── ACUTE patterns ─────────────────────────────────────────────────────────
// Explicit suicidal intent/plan, active self-harm, or stated method. These are
// phrase-level patterns, not lone keywords, to avoid matching discussion *about*
// suicide ("min bror dog i självmord", "artikel om självmord") as personal risk.
const ACUTE_PATTERNS: { re: RegExp; signal: string }[] = [
  // Swedish — wanting to die / take one's life, first person.
  // Two arms: (a) "inte leva" requires the negation (so "vill leva" stays
  // positive and does NOT match); (b) die/method phrases, optionally "bara".
  // End anchor is a Unicode lookahead, not \b: JS \b is ASCII-only, so "dö"
  // followed by end-of-string has no \b boundary and would never match.
  { re: /\bvill (inte (leva längre|leva|finnas( längre| till)?)|(bara )?(dö|ta (mitt|mitt eget) liv|ta livet av mig))(?![\p{L}\p{N}])/u, signal: "sv_intent_die" },
  { re: /\b(tänker|planerar|kommer|ska|tänkte) (ta livet av mig|ta mitt liv|döda mig|göra slut på (allt|mig)|avsluta allt)\b/u, signal: "sv_plan" },
  { re: /\b(jag )?(orkar inte (leva|mer av detta)|vill bara (dö|försvinna för alltid))(?![\p{L}\p{N}])/u, signal: "sv_cant_go_on_die" },
  { re: /\b(ta(r)? livet av mig|ta mitt eget liv|begå självmord|ta självmord|suicid(era)?)\b/u, signal: "sv_suicide_act" },
  { re: /\bvet inte om jag (vågar|vill|kan) (leva|fortsätta leva|vara kvar)\b/u, signal: "sv_doubt_living" },
  { re: /\b(jag )?(har en plan|vet hur jag ska göra det|har bestämt mig för att (dö|sluta leva))(?![\p{L}\p{N}])/u, signal: "sv_has_plan" },
  // Swedish — active / imminent self-harm
  { re: /\b(skär mig|skadar mig|tagit (en )?överdos|tagit för många tabletter|håller på att skada mig)\b/u, signal: "sv_active_selfharm" },
  // English — direct intent / plan / method
  { re: /\b(want to|going to|gonna|plan to|about to) (die|kill myself|end (it all|my life)|end it)\b/u, signal: "en_intent" },
  { re: /\b(kill myself|killing myself|suicidal|commit suicide|take my (own )?life|end my life)\b/u, signal: "en_suicide" },
  { re: /\b(i (don'?t|do not) want to (live|be here|exist)( anymore)?|can'?t go on living|no reason to live)\b/u, signal: "en_dont_want_live" },
  { re: /\b(overdosed|taken an overdose|cutting myself|harming myself right now)\b/u, signal: "en_active_selfharm" },
];

// ── CONCERN patterns ───────────────────────────────────────────────────────
// Heavy hopelessness / passive ideation without an explicit plan or method.
// The model is told to surface the acute line early but may still explore gently.
const CONCERN_PATTERNS: { re: RegExp; signal: string }[] = [
  { re: /\b(orkar inte( längre| mer)?|pallar inte( längre| mer)?|klarar inte (det här|mer|längre))\b/u, signal: "sv_exhausted" },
  { re: /\b(vill (bara )?(försvinna|slippa( allt| vakna| leva)?)|ingen mening( med (allt|livet))?|allt (är|känns) (svart|kolsvart|hopplöst|meningslöst))\b/u, signal: "sv_hopeless" },
  { re: /\b(finns ingen (väg ut|utväg|mening)|ser ingen (framtid|utväg)|orkar inte vakna)\b/u, signal: "sv_no_way_out" },
  { re: /\b(mår (väldigt|jätte|extremt) (dåligt|illa)|har det jättesvårt|bottenkänsla)\b/u, signal: "sv_very_low" },
  { re: /\b(want to disappear|what'?s the point|no point( anymore)?|everything is (dark|hopeless|pointless)|hopeless)\b/u, signal: "en_hopeless" },
  { re: /\b(can'?t (cope|take it|do this)( anymore)?|too much to bear)\b/u, signal: "en_cant_cope" },
];

// Concern about ANOTHER person at acute risk also matters, but should bias the
// model toward anhörig/youth resources rather than treating the writer as the
// one at risk. We surface this as "concern" with a distinct signal so the
// directive can be phrased for a worried relative.
const CONCERN_FOR_OTHER: { re: RegExp; signal: string }[] = [
  // Present-risk verbs only. Deliberately NOT bare "självmord" — a past loss
  // ("min bror dog i självmord") mentions the word but is grief, not current
  // risk, and must not trigger. "vill ta livet" / "vill inte leva" / "skär sig"
  // / "tagit en överdos" are about someone in danger now.
  { re: /\b(min|mitt|min son|min dotter|mitt barn|en (vän|kompis)|min (partner|mamma|pappa|bror|syster)).{0,40}\b(vill (inte leva|dö|ta livet)|försökt ta (sitt|livet)|skär sig|skadar sig|mår (livsfarligt|akut dåligt)|tagit (en )?överdos|håller på att skada sig)\b/u, signal: "sv_other_at_risk" },
  { re: /\b(my (son|daughter|child|friend|partner|mum|mom|dad|brother|sister)).{0,40}\b(wants to die|is suicidal|trying to kill (themsel(f|ves)|himself|herself)|self.?harming|overdosed)\b/u, signal: "en_other_at_risk" },
];

function anyMatch(text: string, patterns: { re: RegExp; signal: string }[]): string | null {
  for (const p of patterns) if (p.re.test(text)) return p.signal;
  return null;
}

/**
 * Inspect a conversation and classify crisis risk. Only `user` turns are read;
 * the latest turn is weighted most heavily, with earlier user turns considered
 * at the lower "concern" tier so a plan stated two messages ago isn't lost.
 */
export function detectCrisis(
  messages: { role: "user" | "assistant"; content: string }[],
): CrisisResult {
  const userTurns = messages.filter((m) => m.role === "user");
  if (userTurns.length === 0) return { tier: "none", signal: null };

  const latest = normalize(userTurns[userTurns.length - 1].content);

  // Concern-for-other is checked before first-person acute so that
  // "min son vill inte leva" is read as a worried parent, not the writer.
  const other = anyMatch(latest, CONCERN_FOR_OTHER);
  if (other) return { tier: "concern", signal: other };

  // Latest turn: full acute check.
  const acute = anyMatch(latest, ACUTE_PATTERNS);
  if (acute) return { tier: "acute", signal: acute };

  const concern = anyMatch(latest, CONCERN_PATTERNS);
  if (concern) return { tier: "concern", signal: concern };

  // Recent prior turns (last 3, excluding latest): an acute statement there
  // keeps us in "concern" even if the latest message looks calm — distress
  // doesn't reset just because the next message is short.
  const recentPrior = userTurns
    .slice(Math.max(0, userTurns.length - 4), userTurns.length - 1)
    .map((m) => normalize(m.content));
  for (const t of recentPrior) {
    if (anyMatch(t, ACUTE_PATTERNS)) return { tier: "concern", signal: "prior_acute" };
  }

  return { tier: "none", signal: null };
}

// ── Prompt directives ───────────────────────────────────────────────────────
// Prepended (high priority) to the system prompt for a single request. They
// constrain HOW the model opens, not whether it replies. Kept short and warm.

const ACUTE_DIRECTIVE = `# AKUT SÄKERHET — HÖGSTA PRIORITET (gäller detta svar)
Personen uttrycker självmordstankar, en plan, eller pågående självskada. Säkerheten går före allt annat.
- Inled DIREKT, i din allra första mening, med värme och ett tydligt nästa steg. Vänta inte med säkerheten och ställ inga utforskande frågor först.
- Lyft omedelbart fram Självmordslinjen (öppen dygnet runt, även chatt) och påminn om 112 vid akut fara för liv. Skriv markörerna [[line:sjalvmordslinjen]] och [[line:112-sos-alarm]] var för sig på egna rader.
- Håll det mycket kort, lugnt och konkret. Pressa inte, moralisera inte, lova inget du inte vet.
- Du får uttrycka att du finns kvar och gärna vill veta hur det är — men säkerhetssteget kommer först.`;

const CONCERN_DIRECTIVE = `# FÖRHÖJD OMSORG (gäller detta svar)
Personen uttrycker tung hopplöshet eller orkeslöshet. Ta det på allvar utan att överdramatisera.
- Validera kort och genuint först.
- Lyft tidigt fram att det går att prata med någon nu, t.ex. Självmordslinjen (dygnet runt). Skriv [[line:sjalvmordslinjen]] på egen rad. Nämn 112 endast om det framstår som akut fara för liv.
- Du får ställa EN mjuk följdfråga för att förstå hur tungt det är och vad som skulle hjälpa just nu.
- Var varm och närvarande, inte klinisk.`;

const CONCERN_FOR_OTHER_DIRECTIVE = `# FÖRHÖJD OMSORG — ORO FÖR NÅGON ANNAN (gäller detta svar)
Personen är orolig för någon närstående som kan vara i risk. Stötta den som frågar, och led mot rätt stöd.
- Validera kort att det är tungt att bära oro för någon man bryr sig om.
- Om den närstående kan vara i akut fara: påminn om 112, och lyft Självmordslinjen som även tar emot oroliga anhöriga ([[line:sjalvmordslinjen]] på egen rad). För barn/unga under 18, överväg BRIS.
- Du får ställa EN följdfråga: vem det gäller, ålder, och hur akut det verkar.`;

/** The directive block to prepend for a given crisis result, or "" for none. */
export function crisisDirective(result: CrisisResult): string {
  switch (result.tier) {
    case "acute":
      return ACUTE_DIRECTIVE;
    case "concern":
      return result.signal === "sv_other_at_risk" || result.signal === "en_other_at_risk"
        ? CONCERN_FOR_OTHER_DIRECTIVE
        : CONCERN_DIRECTIVE;
    default:
      return "";
  }
}
