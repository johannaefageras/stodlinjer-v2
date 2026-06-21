// Opening-hours formatting + live "open now" status for support lines,
// evaluated in Europe/Stockholm. Shared by the card grid (index.astro) and
// any future surface that needs to show when a line is reachable.

export type Hours = { days: string[]; open: string; close: string };
export type LiveStatus = { tone: "open" | "soon" | "closed"; label: string };

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = {
  mon: "Mån",
  tue: "Tis",
  wed: "Ons",
  thu: "Tor",
  fri: "Fre",
  sat: "Lör",
  sun: "Sön",
};

const fmtTime = (t: string) =>
  t === "24:00" ? "24" : t.endsWith(":00") ? t.slice(0, 2) : t;
const fmtRange = (open: string, close: string) =>
  open === "00:00" && close === "24:00"
    ? "Dygnet runt"
    : `${fmtTime(open)}–${fmtTime(close)}`;

export function groupDays(days: string[]): string {
  const idx = days
    .map((d) => DAY_ORDER.indexOf(d as (typeof DAY_ORDER)[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (!idx.length) return "";
  const runs: [number, number][] = [];
  let start = idx[0];
  let prev = idx[0];
  for (let k = 1; k < idx.length; k++) {
    if (idx[k] === prev + 1) {
      prev = idx[k];
      continue;
    }
    runs.push([start, prev]);
    start = idx[k];
    prev = idx[k];
  }
  runs.push([start, prev]);
  return runs
    .map(([a, b]) =>
      a === b
        ? DAY_LABEL[DAY_ORDER[a]]
        : `${DAY_LABEL[DAY_ORDER[a]]}–${DAY_LABEL[DAY_ORDER[b]]}`,
    )
    .join(", ");
}

export const is247 = (entries: Hours[]) => {
  const all = new Set<string>();
  let allFull = true;
  for (const e of entries) {
    for (const d of e.days) all.add(d);
    if (!(e.open === "00:00" && e.close === "24:00")) allFull = false;
  }
  return allFull && all.size === 7;
};

export const detailHours = (entries: Hours[]) =>
  entries.map((e) => ({ dayRange: groupDays(e.days), time: fmtRange(e.open, e.close) }));

export function closedDays(entries: Hours[]): string | null {
  const covered = new Set<string>();
  for (const e of entries) for (const d of e.days) covered.add(d);
  const off = DAY_ORDER.filter((d) => !covered.has(d));
  return off.length ? groupDays(off as unknown as string[]) : null;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function liveStatus(entries: Hours[]): LiveStatus | null {
  if (!entries.length) return null;
  if (is247(entries)) return { tone: "open", label: "Dygnet runt" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdToIdx: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const todayIdx = wdToIdx[get("weekday")] ?? 0;
  const nowM = ((parseInt(get("hour"), 10) % 24) * 60) + parseInt(get("minute"), 10);

  // Flatten opening hours into per-weekday intervals.
  const ivals = entries.flatMap((e) =>
    e.days
      .map((d) => DAY_ORDER.indexOf(d as (typeof DAY_ORDER)[number]))
      .filter((day) => day >= 0)
      .map((day) => ({ day, open: toMin(e.open), close: toMin(e.close) })),
  );

  // Open right now?
  if (ivals.some((iv) => iv.day === todayIdx && nowM >= iv.open && nowM < iv.close)) {
    return { tone: "open", label: "Öppet nu" };
  }

  // Otherwise the next opening within the coming week.
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = (todayIdx + ahead) % 7;
    const next = ivals
      .filter((iv) => iv.day === day && (ahead > 0 || iv.open > nowM))
      .sort((a, b) => a.open - b.open)[0];
    if (!next) continue;
    if (ahead === 0) return { tone: "soon", label: `Öppnar ${clock(next.open)}` };
    const dayName = DAY_LABEL[DAY_ORDER[day]].toLowerCase();
    return { tone: "closed", label: `Öppnar ${dayName} ${clock(next.open)}` };
  }
  return { tone: "closed", label: "Stängt" };
}
