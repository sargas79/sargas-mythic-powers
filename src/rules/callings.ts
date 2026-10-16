/**
 * Parses a PF2e Calling description (HTML from pf2e.classfeatures) into the parts the Calling picker and the
 * sheet banner show: mythic proficiency actions, daily regain, edicts and anathema. Pure: no Foundry globals.
 */

export interface ParsedCalling {
  /** Flavour text before the rules sentences. */
  summary: string;
  /** The "When you … you can spend a Mythic Point …" sentence, as plain text. */
  actionsText: string;
  /** Short action names extracted from that sentence (for example ["Seek", "Track"]). */
  actions: string[];
  /** The sentence that ends with "you regain a Mythic Point". */
  regain: string;
  /** Edicts text, or "" (the "Echoes of …" Callings have none). */
  edicts: string;
  /** Anathema text, or "". */
  anathema: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Replaces Foundry/PF2e enrichers with their labels: @UUID[…]{Label} → Label, [[/act slug]] → Slug. */
export function stripEnrichers(text: string): string {
  return (
    text
      // @UUID[...]{Label}, @Check[...]{Label}, etc.
      .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
      // @UUID[Compendium.pf2e.x.Item.id] without a label: drop it.
      .replace(/@\w+\[[^\]]*\]/g, "")
      // [[/act slug ...]]{Label}
      .replace(/\[\[\/\w+\s[^\]]*\]\]\{([^}]*)\}/g, "$1")
      // [[/act gather-information]] → Gather Information
      .replace(/\[\[\/act\s+([\w-]+)[^\]]*\]\]/g, (_m, slug: string) => titleCase(slug))
      .replace(/\[\[[^\]]*\]\]/g, "")
  );
}

/** HTML → plain text with enrichers replaced and whitespace collapsed. */
export function htmlToText(html: string): string {
  const noTags = stripEnrichers(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div|h\d)>/gi, " ")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Text of the paragraph that starts with <strong>Label</strong>. */
function labelledParagraph(html: string, label: string): string {
  const re = new RegExp(`<strong>\\s*${label}\\s*</strong>([\\s\\S]*?)(?:</p>|<hr|<strong>|$)`, "i");
  const m = re.exec(html);
  if (!m) return "";
  return capitalize(htmlToText(m[1] ?? "").replace(/^[:.\s]+/, ""));
}

/** Splits plain text into sentences (period/question/exclamation followed by a capital). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ACTIONS_RE = /spend a Mythic Point to (?:attempt|make) the check at mythic proficiency/i;
const REGAIN_RE = /regain a Mythic Point/i;

/** Extracts short action names from the actions sentence. */
export function extractActions(sentence: string): string[] {
  const m = /When you (.*?),? you can spend a Mythic Point/i.exec(sentence);
  if (!m) return [];
  let clause = m[1] ?? "";
  clause = clause.replace(/\s*\([^)]*\)/g, "");
  // "attempt an Arcana, Nature, or Occultism check to X" / "attempt a check to X" → "X"
  clause = clause.replace(
    /\b(?:attempt )?(?:an? )?(?:[A-Z][a-z]+(?:, (?:or )?| or | ))*check (?:to|while) /g,
    "",
  );
  const pieces = clause.split(/,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+/);
  const out: string[] = [];
  for (let piece of pieces) {
    piece = piece
      .trim()
      .replace(/^(?:when you\s+)?/i, "")
      .replace(/^(?:attempt (?:to |an? )?|use (?:\w+ to )?)/i, "")
      .replace(/\s+(?:using|against|on|while|any)\s.*$/i, "")
      .replace(/\s+(?:an? (?:object|opponent|item|creature))$/i, "")
      .replace(/\s+check$/i, "")
      .trim();
    if (!piece) continue;
    const name = capitalize(piece);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Parses a Calling description. Missing parts come back as empty strings. */
export function parseCalling(html: string): ParsedCalling {
  const source = html ?? "";
  const edicts = labelledParagraph(source, "Edicts");
  const anathema = labelledParagraph(source, "Anathema");

  // Rules text: everything before the separator or the first labelled paragraph.
  const cut = source.search(/<hr\b|<p>\s*<strong>\s*(?:Edicts|Anathema)/i);
  const main = htmlToText(cut >= 0 ? source.slice(0, cut) : source);
  const parts = sentences(main);

  const actionsIdx = parts.findIndex((s) => ACTIONS_RE.test(s));
  const regainIdx = parts.findIndex((s) => REGAIN_RE.test(s));
  const actionsText = actionsIdx >= 0 ? parts[actionsIdx]! : "";
  const regain = regainIdx >= 0 ? parts[regainIdx]! : "";
  const firstRule = [actionsIdx, regainIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const summary = (firstRule === undefined ? parts : parts.slice(0, firstRule)).join(" ");

  return {
    summary,
    actionsText,
    actions: extractActions(actionsText),
    regain,
    edicts,
    anathema,
  };
}
