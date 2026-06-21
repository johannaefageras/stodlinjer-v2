// Single source of truth for when the crisis banner appears.
// Both support lines and articles resolve through here so the same
// <CrisisBanner /> fires identically in both contexts.

// Tags on an article/guide that should force the crisis banner.
const ACUTE_TAGS = new Set(["akut", "självmord", "suicid", "kris", "nödsituation"]);

export type Urgency = {
  level: "emergency" | "urgent" | "standard";
  showEmergencyNotice?: boolean;
  emergencyText?: string;
};

/** Support line → should it show the crisis banner? */
export function lineNeedsCrisisBanner(urgency: Urgency): boolean {
  return urgency.level === "emergency" || urgency.showEmergencyNotice === true;
}

/** Article/guide → should it show the crisis banner? */
export function articleNeedsCrisisBanner(opts: {
  crisisBanner?: boolean;
  tags?: string[];
}): boolean {
  if (opts.crisisBanner) return true;
  return (opts.tags ?? []).some((t) => ACUTE_TAGS.has(t.toLowerCase()));
}

/** Default emergency copy when a line doesn't supply its own. */
export const DEFAULT_EMERGENCY_TEXT = "Vid akut fara för liv, ring 112.";
