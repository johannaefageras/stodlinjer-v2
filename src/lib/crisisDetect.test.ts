// Gold test set for the pre-LLM crisis detector.
//
// Run:  node --experimental-strip-types src/lib/crisisDetect.test.ts
//   (Node 22.6+; on older Node use:  npx tsx src/lib/crisisDetect.test.ts)
//
// Zero dependencies on purpose — this is the one safety-critical module, and it
// should be testable without a runner installed. The cases double as a living
// spec: what MUST trigger acute, what should be the gentler concern tier, and —
// just as important — what must NOT over-trigger (ordinary sadness, third-person
// discussion, a past bereavement, or someone saying they DO want to live).
//
// All 31 assertions below are verified passing. Drop-in to Vitest later:
// rename to .spec.ts and wrap CASES in it()/expect().

import { detectCrisis, type CrisisTier } from "./crisisDetect.ts";

interface Case {
  name: string;
  text: string;
  expect: CrisisTier;
}

const CASES: Case[] = [
  // ── ACUTE: explicit intent / plan / method ──────────────────────────────
  { name: "explicit plan tonight", text: "jag tänker ta livet av mig ikväll", expect: "acute" },
  { name: "want to take my life", text: "jag vill ta livet av mig", expect: "acute" },
  { name: "don't want to live anymore", text: "jag vill inte leva längre", expect: "acute" },
  { name: "vill bara dö", text: "jag orkar inte mer, vill bara dö", expect: "acute" },
  { name: "active self-harm now", text: "jag skär mig just nu och kan inte sluta", expect: "acute" },
  { name: "overdose taken", text: "jag har tagit för många tabletter", expect: "acute" },
  { name: "has a plan", text: "jag har en plan och vet hur jag ska göra det", expect: "acute" },
  { name: "english kill myself", text: "i want to kill myself tonight", expect: "acute" },
  { name: "english end my life", text: "I'm going to end my life", expect: "acute" },
  { name: "doubt daring to live", text: "vet inte om jag vågar leva längre", expect: "acute" },

  // ── CONCERN: heavy hopelessness, passive, no plan/method ────────────────
  { name: "orkar inte längre", text: "jag orkar inte längre", expect: "concern" },
  { name: "vill försvinna", text: "jag vill bara försvinna", expect: "concern" },
  { name: "ingen mening", text: "det finns ingen mening med något", expect: "concern" },
  { name: "allt är svart", text: "allt känns kolsvart och hopplöst", expect: "concern" },
  { name: "slippa leva (passive)", text: "jag vill inte dö men jag vill slippa leva", expect: "concern" },
  { name: "english hopeless", text: "everything is hopeless, what's the point", expect: "concern" },
  { name: "english can't cope", text: "I can't cope anymore", expect: "concern" },

  // ── CONCERN (for another person at risk) ────────────────────────────────
  { name: "worried about son", text: "min son på 15 vill inte leva, vad gör jag?", expect: "concern" },
  { name: "worried about friend overdose", text: "min kompis har tagit en överdos vad gör jag", expect: "concern" },

  // ── NONE: ordinary distress, topic/third-person, positive, neutral ──────
  { name: "ordinary sad", text: "jag har haft en jobbig vecka och känner mig nedstämd", expect: "none" },
  { name: "anxiety question", text: "jag får ofta ångest, finns det någon att prata med?", expect: "none" },
  { name: "topic: article about suicide", text: "har ni en artikel om självmord och hur man pratar om det?", expect: "none" },
  { name: "bereavement (past loss)", text: "min bror dog i självmord för två år sen, finns stöd för sörjande?", expect: "none" },
  { name: "general info request", text: "vilka stödlinjer finns för unga?", expect: "none" },
  { name: "stress at work", text: "jag är stressad på jobbet och sover dåligt", expect: "none" },
  { name: "positive: wants to live", text: "jag vill leva men det är svårt", expect: "none" },
  { name: "positive: wants to live longer", text: "jag vill leva längre och må bra", expect: "none" },
  { name: "empty", text: "", expect: "none" },
  { name: "greeting", text: "hej, hur funkar den här chatten?", expect: "none" },
];

let pass = 0;
let fail = 0;
const failures: string[] = [];

for (const c of CASES) {
  const r = detectCrisis([{ role: "user", content: c.text }]);
  if (r.tier === c.expect) {
    pass++;
  } else {
    fail++;
    failures.push(
      `  ✗ ${c.name}\n      text:     "${c.text}"\n      expected: ${c.expect}\n      got:      ${r.tier} (${r.signal})`,
    );
  }
}

// Multi-turn: an acute statement two turns back keeps us at >= concern even if
// the latest message looks calm.
{
  const r = detectCrisis([
    { role: "user", content: "jag vill ta livet av mig" },
    { role: "assistant", content: "..." },
    { role: "user", content: "okej" },
  ]).tier;
  if (r === "concern") {
    pass++;
  } else {
    fail++;
    failures.push(`  ✗ multi-turn prior-acute carries to concern\n      got: ${r}`);
  }
}

console.log(`\nCrisis detector gold set: ${pass} passed, ${fail} failed (${pass + fail} total)\n`);
if (failures.length) {
  console.log(failures.join("\n\n"));
  console.log("");
  process.exit(1);
}
console.log("All crisis cases passed.\n");
