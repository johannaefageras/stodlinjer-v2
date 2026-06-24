// Stödkompassen client. Drives one or more `.sk` chat surfaces: conversation
// state (in-memory + sessionStorage), the SSE request to /api/chat, streamed
// rendering, and turning `[[line:slug]]` markers into real line cards built
// from verified data (never from model text).

interface ClientLine {
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

interface ClientArticle {
  slug: string;
  title: string;
  description: string;
  collectionLabel: string;
  categoryColor: string;
  categoryIcon: string;
  readingTime: string | null;
  href: string;
}

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "stodkompassen:messages";
// Markers the model emits; the client swaps them for verified cards.
// Line slugs are flat ("sjalvmordslinjen"); article keys are composite
// ("akut-och-kris/att-overleva-natten"), so the slug class allows "/".
const MARKER = /\[\[(line|article):([a-z0-9/-]+)\]\]/g;

// Verified line display data, fetched once and shared across chat instances.
let linesCache: Record<string, ClientLine> | null = null;
async function loadLines(): Promise<Record<string, ClientLine>> {
  if (linesCache) return linesCache;
  let data: Record<string, ClientLine> = {};
  try {
    const res = await fetch("/stodkompassen-lines.json");
    if (res.ok) data = await res.json();
  } catch {
    /* network/parse failure → cards just won't render */
  }
  linesCache = data;
  return data;
}

// Verified article display data, fetched once and shared across instances.
let articlesCache: Record<string, ClientArticle> | null = null;
async function loadArticles(): Promise<Record<string, ClientArticle>> {
  if (articlesCache) return articlesCache;
  let data: Record<string, ClientArticle> = {};
  try {
    const res = await fetch("/stodkompassen-articles.json");
    if (res.ok) data = await res.json();
  } catch {
    /* network/parse failure → cards just won't render */
  }
  articlesCache = data;
  return data;
}

function loadStored(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(messages: Msg[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* sessionStorage may be unavailable (private mode); ignore */
  }
}

function initChat(root: HTMLElement) {
  let lines: Record<string, ClientLine> = {};
  let articles: Record<string, ClientArticle> = {};
  const uiMode = root.dataset.variant === "panel" ? "widget" : "page";
  const log = root.querySelector<HTMLElement>("[data-sk-log]");
  const form = root.querySelector<HTMLFormElement>("[data-sk-form]");
  const input = root.querySelector<HTMLTextAreaElement>("[data-sk-input]");
  const sendBtn = root.querySelector<HTMLButtonElement>("[data-sk-send]");
  if (!log || !form || !input || !sendBtn) return;

  const messages: Msg[] = loadStored();
  let busy = false;

  // ── rendering helpers ─────────────────────────────────────────────────
  function scrollToEnd() {
    log!.scrollTop = log!.scrollHeight;
  }

  function bubble(role: "user" | "assistant"): HTMLElement {
    const el = document.createElement("div");
    el.className = `sk-msg sk-msg--${role}`;
    log!.appendChild(el);
    return el;
  }

  function renderText(parent: HTMLElement, text: string) {
    text.split(/\n{2,}/).forEach((para) => {
      if (!para) return;
      const p = document.createElement("p");
      para.split("\n").forEach((line, i) => {
        if (i > 0) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(line));
      });
      parent.appendChild(p);
    });
  }

  function lineCard(line: ClientLine): HTMLElement {
    const card = document.createElement("article");
    card.className = "sk-card";
    card.style.setProperty("--c", `var(--cat-${line.categoryColor}, var(--accent-soft))`);
    card.style.setProperty("--c-fg", `var(--cat-${line.categoryColor}-fg, var(--accent-soft-fg))`);

    const head = document.createElement("div");
    head.className = "sk-card__head";
    const chip = document.createElement("span");
    chip.className = "sk-card__chip";
    chip.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    icon.className = `icon ni-${line.categoryIcon}`;
    icon.style.fontSize = "20px";
    chip.appendChild(icon);
    const cat = document.createElement("span");
    cat.className = "sk-card__cat";
    cat.textContent = line.categoryLabel;
    head.append(chip, cat);

    const name = document.createElement("a");
    name.className = "sk-card__name";
    name.href = line.href;
    name.textContent = line.name;

    const desc = document.createElement("p");
    desc.className = "sk-card__desc";
    desc.textContent = line.shortDescription;

    const foot = document.createElement("div");
    foot.className = "sk-card__foot";
    const isPhone = line.primaryChannel === "phone";
    const value: HTMLElement = line.primaryHref
      ? document.createElement("a")
      : document.createElement("span");
    value.className = "sk-card__value mono";
    if (line.primaryHref && value instanceof HTMLAnchorElement) {
      value.href = line.primaryHref;
      if (!isPhone) {
        value.target = "_blank";
        value.rel = "noopener noreferrer";
      }
    }
    value.textContent = line.primaryValue;
    foot.appendChild(value);

    if (line.hoursDetail.length) {
      const hours = document.createElement("span");
      hours.className = "sk-card__hours mono";
      const open = line.hoursDetail[0];
      hours.textContent =
        line.hoursDetail.length === 1 && (open.dayRange === "" || open.time === "Dygnet runt")
          ? open.time
          : `${open.dayRange} ${open.time}`;
      foot.appendChild(hours);
    }

    card.append(head, name, desc, foot);
    return card;
  }

  // Article card — verified title/description/link from /stodkompassen-articles.json,
  // styled to sit alongside line cards but visually lighter (a reading suggestion,
  // not a contact action).
  function articleCard(article: ClientArticle): HTMLElement {
    const card = document.createElement("article");
    card.className = "sk-card sk-card--article";
    card.style.setProperty("--c", `var(--cat-${article.categoryColor}, var(--accent-soft))`);
    card.style.setProperty("--c-fg", `var(--cat-${article.categoryColor}-fg, var(--accent-soft-fg))`);

    const head = document.createElement("div");
    head.className = "sk-card__head";
    const chip = document.createElement("span");
    chip.className = "sk-card__chip";
    chip.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    icon.className = `icon ni-${article.categoryIcon}`;
    icon.style.fontSize = "20px";
    chip.appendChild(icon);
    const cat = document.createElement("span");
    cat.className = "sk-card__cat";
    cat.textContent = article.collectionLabel;
    head.append(chip, cat);

    const name = document.createElement("a");
    name.className = "sk-card__name";
    name.href = article.href;
    name.textContent = article.title;

    const desc = document.createElement("p");
    desc.className = "sk-card__desc";
    desc.textContent = article.description;

    const foot = document.createElement("div");
    foot.className = "sk-card__foot";
    const read = document.createElement("a");
    read.className = "sk-card__value";
    read.href = article.href;
    read.textContent = "Läs artikeln";
    foot.appendChild(read);
    if (article.readingTime) {
      const rt = document.createElement("span");
      rt.className = "sk-card__hours mono";
      rt.textContent = article.readingTime;
      foot.appendChild(rt);
    }

    card.append(head, name, desc, foot);
    return card;
  }

  // Parse an assistant turn into an ordered list of segments: text blocks and
  // card references. Pure (no DOM) so it can be diffed against what's rendered.
  type Seg =
    | { kind: "text"; value: string }
    | { kind: "line"; slug: string }
    | { kind: "article"; slug: string };

  function parseSegments(text: string, final: boolean): Seg[] {
    // While streaming, hide a dangling, not-yet-closed `[[…` tail so a half-typed
    // marker never flashes as broken text or renders a card a token too early.
    if (!final) {
      const open = text.lastIndexOf("[[");
      if (open >= 0 && !/\]\]/.test(text.slice(open))) text = text.slice(0, open);
    }
    const segs: Seg[] = [];
    const pushText = (s: string) => {
      const t = s.trim();
      if (t) segs.push({ kind: "text", value: t });
    };
    MARKER.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKER.exec(text))) {
      if (m.index > last) pushText(text.slice(last, m.index));
      const [, kind, slug] = m;
      // Only emit a card segment if the slug resolves to verified data;
      // unknown slugs render nothing (and don't disturb the diff).
      if (kind === "line" && lines[slug]) segs.push({ kind: "line", slug });
      else if (kind === "article" && articles[slug]) segs.push({ kind: "article", slug });
      last = m.index + m[0].length;
    }
    if (last < text.length) pushText(text.slice(last));
    return segs;
  }

  // A stable signature per segment, used to tell whether an already-rendered
  // child can stay (text nodes keyed by position+kind; cards by slug).
  function segKey(seg: Seg, index: number): string {
    return seg.kind === "text" ? `text:${index}` : `${seg.kind}:${seg.slug}`;
  }

  function renderSeg(seg: Seg, animateCards: boolean): HTMLElement {
    if (seg.kind === "text") {
      const b = document.createElement("div");
      b.className = "sk-bubble";
      renderText(b, seg.value);
      return b;
    }
    const card =
      seg.kind === "line" ? lineCard(lines[seg.slug]) : articleCard(articles[seg.slug]);
    // Animate cards in (cards only — text bubbles grow in place, no pop), but
    // only for live streaming; replayed history should appear already settled.
    if (animateCards) card.classList.add("sk-card--enter");
    return card;
  }

  // Render (and re-render during streaming) by DIFFING against what's already
  // in the DOM, rather than replacing everything each token. This keeps already
  // rendered cards alive (no flicker, animation plays once), and lets a growing
  // trailing text block update in place instead of being torn down and rebuilt.
  // `animateCards` is true while streaming a new reply, false when replaying
  // stored history (so old cards don't all animate in on page load).
  function renderAssistant(el: HTMLElement, text: string, final: boolean, animateCards = true) {
    const segs = parseSegments(text, final);
    const children = Array.from(el.children) as HTMLElement[];

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const key = segKey(seg, i);
      const existing = children[i];

      if (existing && existing.dataset.segKey === key) {
        // Same slot, same identity. Text may have grown mid-stream → refresh
        // its content in place; cards are immutable so leave them untouched.
        if (seg.kind === "text") {
          const next = seg.value;
          if (existing.dataset.segText !== next) {
            existing.replaceChildren();
            renderText(existing, next);
            existing.dataset.segText = next;
          }
        }
        continue;
      }

      // Identity changed at this position → replace from here down. (Cards
      // never change identity once committed, so in practice this only fires
      // for the trailing text slot or when a new segment is appended.)
      const node = renderSeg(seg, animateCards);
      node.dataset.segKey = key;
      if (seg.kind === "text") node.dataset.segText = seg.value;
      if (existing) el.replaceChild(node, existing);
      else el.appendChild(node);
    }

    // Drop any stale trailing children (e.g. the streaming tail shrank).
    while (el.children.length > segs.length) el.removeChild(el.lastChild!);
  }

  // ── sending ───────────────────────────────────────────────────────────
  function setBusy(state: boolean) {
    busy = state;
    sendBtn!.disabled = state;
    input!.disabled = state;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    [lines, articles] = await Promise.all([loadLines(), loadArticles()]);

    messages.push({ role: "user", content: trimmed });
    renderText(bubble("user"), trimmed);
    saveStored(messages);
    input!.value = "";
    input!.style.height = "auto";
    scrollToEnd();

    setBusy(true);
    const el = bubble("assistant");
    el.innerHTML =
      '<div class="sk-bubble"><span class="sk-dots"><span></span><span></span><span></span></span></div>';
    scrollToEnd();

    let acc = "";
    let started = false;
    const onChunk = (event: string, data: { text?: string }) => {
      if (event === "delta" && data.text) {
        if (!started) {
          started = true;
          el.classList.remove("is-typing");
        }
        acc += data.text;
        renderAssistant(el, acc, false);
        scrollToEnd();
      } else if ((event === "notice" || event === "error") && data.text) {
        acc += (acc ? "\n\n" : "") + data.text;
        el.classList.remove("is-typing");
        renderAssistant(el, acc, true);
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, uiMode }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const evMatch = block.match(/^event: (.+)$/m);
          const dataMatch = block.match(/^data: (.+)$/m);
          if (!evMatch || !dataMatch) continue;
          try {
            onChunk(evMatch[1], JSON.parse(dataMatch[1]));
          } catch {
            /* ignore malformed event */
          }
        }
      }
    } catch {
      el.classList.remove("is-typing");
      if (!acc) {
        acc =
          "Något gick fel och jag kunde inte svara just nu. Vid akut fara för liv, ring 112. Du kan alltid ringa Självmordslinjen på 90 101, dygnet runt.";
      }
    }

    renderAssistant(el, acc, true);
    if (acc) {
      messages.push({ role: "assistant", content: acc });
      saveStored(messages);
    }
    setBusy(false);
    scrollToEnd();
    input!.focus();
  }

  // ── wiring ────────────────────────────────────────────────────────────
  // Replay any stored conversation (continuity between the panel and /chatt/).
  if (messages.length) {
    void (async () => {
      [lines, articles] = await Promise.all([loadLines(), loadArticles()]);
      for (const m of messages) {
        const el = bubble(m.role);
        if (m.role === "assistant") renderAssistant(el, m.content, true, false);
        else renderText(el, m.content);
      }
      scrollToEnd();
    })();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void send(input.value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input.value);
    }
  });

  // Auto-grow the composer.
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  });
}

document.querySelectorAll<HTMLElement>(".sk").forEach(initChat);
