/**
 * fuzzy-name.ts — fix misheard Pokémon names ("dugong" -> "dewgong", "pickachu" -> "pikachu").
 * Speech-to-text often mangles names, so before asking PokéAPI we snap the name to the
 * closest real species. Cheap on CPU: a sound-alike key + small edit distance over ~1025 names.
 */
import { SPECIES } from "./species-names";

const SET = new Set(SPECIES);

/** Rough "sounds like" key: collapse spellings that sound the same. */
function sound(s: string): string {
  return s
    .replace(/-/g, "")
    .replace(/ph/g, "f").replace(/ck|c(?=[aou])|q/g, "k").replace(/c/g, "s")
    .replace(/ee|ea|ie|y/g, "i").replace(/oo|ou|ew|ue/g, "u").replace(/z/g, "s")
    .replace(/[aeiou]+/g, (v) => v[0]) // vowel runs -> one vowel
    .replace(/(.)\1+/g, "$1") // double letters -> one
    .replace(/h/g, "");
}

let SOUNDS: string[] | null = null;
let FLATS: string[] | null = null;

/** Levenshtein with early exit once the row minimum passes `max`. */
let P = new Int32Array(64), C = new Int32Array(64);
function dist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  for (let j = 0; j <= b.length; j++) P[j] = j;
  for (let i = 1; i <= a.length; i++) {
    C[0] = i;
    let rowMin = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      let v = P[j - 1] + (ac === b.charCodeAt(j - 1) ? 0 : 1);
      if (P[j] + 1 < v) v = P[j] + 1;
      if (C[j - 1] + 1 < v) v = C[j - 1] + 1;
      C[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = P; P = C; C = t;
  }
  return P[b.length];
}

export type Resolved = { name: string; resolvedFrom?: string; suggestions?: string[] };

/** `key` is already normalized (lowercase, dashes). */
export function resolveSpecies(key: string): Resolved {
  key = formName(key);
  if (!key || /^\d+$/.test(key) || SET.has(key)) return { name: key };
  // Forms like "charizard-mega-x" or "pikachu-gmax": leave alone.
  const base = key.split("-")[0];
  if (key.includes("-") && SET.has(base)) return { name: key };
  // Misheard base + a form tag ("blastois-mega"): fix the base, keep the form.
  const formTail = key.match(/-(mega(-[xy])?|gmax|alola|galar|hisui|paldea)$/);
  if (formTail) {
    const fixed = resolveSpecies(key.slice(0, -formTail[0].length));
    return { ...fixed, name: fixed.name + formTail[0], resolvedFrom: key };
  }
  // Same name without dashes? ("mrmime" -> "mr-mime", "nidoran" -> nidoran-f/m)
  const flat = key.replace(/-/g, "");
  SOUNDS ??= SPECIES.map(sound);
  FLATS ??= SPECIES.map((n) => n.replace(/-/g, ""));
  const ks = sound(key);
  const scored: { n: string; d: number }[] = [];
  for (let i = 0; i < SPECIES.length; i++) {
    const n = SPECIES[i], f = FLATS[i];
    let d: number;
    if (f === flat) d = 0;
    else if (SOUNDS[i] === ks) d = 0.5;
    else {
      const lim = Math.max(1, Math.floor(n.length / 3));
      const raw = Math.min(dist(flat, f, lim), dist(ks, SOUNDS[i], lim) + 0.5);
      // Prefix match ("charizar" -> charizard) is a good sign too.
      d = f.startsWith(flat) && flat.length >= 4 ? Math.min(raw, 1) : raw;
      if (d > lim) continue;
    }
    scored.push({ n, d });
  }
  scored.sort((a, b) => a.d - b.d);
  if (!scored.length) return { name: key };
  return { name: scored[0].n, resolvedFrom: key, suggestions: scored.slice(0, 3).map((s) => s.n) };
}

/** Spoken form words -> PokéAPI form names: "mega-charizard-x" -> "charizard-mega-x", "alolan-vulpix" -> "vulpix-alola". */
const PREFIX: Record<string, string> = { mega: "mega", alolan: "alola", alola: "alola", galarian: "galar", galar: "galar", hisuian: "hisui", hisui: "hisui", paldean: "paldea", gigantamax: "gmax", gmax: "gmax" };
export function formName(key: string): string {
  const parts = key.split("-");
  const tag = PREFIX[parts[0]];
  if (!tag || parts.length < 2) return key.replace(/-gigantamax$/, "-gmax").replace(/-(alolan|galarian|hisuian|paldean)$/, (_, w: string) => "-" + PREFIX[w]);
  const rest = parts.slice(1);
  const xy = tag === "mega" && /^[xy]$/.test(rest[rest.length - 1]) ? "-" + rest.pop() : "";
  return `${rest.join("-")}-${tag}${xy}`;
}
