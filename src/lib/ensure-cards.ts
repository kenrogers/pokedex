/**
 * ensure-cards.ts — a safety net so DEX ALWAYS shows a picture.
 *
 * The AI is told to put a PokemonCard on screen for every Pokémon it talks
 * about, but AIs sometimes forget. The server tells us which Pokémon were
 * looked up this turn; here we:
 *   1. fix any PokemonCard whose image URL doesn't match the real one, and
 *   2. add a PokemonCard to the top of the screen for any Pokémon that's missing.
 *
 * Lesson idea: "trust, but verify" — code double-checks the AI's work.
 */
import { isSafeCardImageUrl } from "@/lib/safe-image-url";

export type CardInfo = {
  name: string;
  number: number;
  imageUrl: string;
  types: string[];
  genus: string;
};

const q = (v: string) => JSON.stringify(v);

function cardCall(c: CardInfo): string {
  return `PokemonCard(${q(c.name)}, ${c.number}, ${q(c.imageUrl)}, [${c.types.map(q).join(", ")}], ${q(c.genus)})`;
}

const CARD_RE = /PokemonCard\(\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*"([^"]*)"/g;

const ART = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";
/** The server tells us (a "cards" event) whether the kid's latest words asked for a shiny. */
let shinyTurn = false;
export function setShinyTurn(v: boolean) { shinyTurn = v; }

/**
 * Cards the AI wrote itself (e.g. web-fetch mode, no lookup tool): rebuild the picture
 * URL from the Pokédex NUMBER, so a typo'd or made-up URL can't break the picture.
 */
function fixArtwork(openui: string): string {
  return openui.replace(CARD_RE, (whole, name: string, num: string, url: string) => {
    if (url === "DRAWING" || isSafeCardImageUrl(url) || !/^\d{1,4}$/.test(num) || Number(num) < 1) return whole;
    return `PokemonCard(${q(name)}, ${num}, ${q(`${ART}${shinyTurn ? "shiny/" : ""}${num}.png`)}`;
  });
}

export function ensureCards(openui: string, cards: CardInfo[]): string {
  if (!cards.length) return fixArtwork(openui);
  // Same Pokémon looked up twice? Keep one.
  const unique = cards.filter((c, i) => cards.findIndex((d) => d.number === c.number) === i);

  // 1) Fix image URLs on cards the model did draw.
  const shown = new Set<number>();
  let fixed = openui.replace(CARD_RE, (whole, name: string, num: string) => {
    const real = unique.find((c) => c.number === Number(num) || c.name === name.toLowerCase());
    if (!real) return whole;
    shown.add(real.number);
    return `PokemonCard(${q(name)}, ${num}, ${q(real.imageUrl)}`;
  });

  const missing = unique.filter((c) => !shown.has(c.number)).slice(0, 4);
  if (!missing.length) return fixed;

  // 2) Add the missing cards. Two or more go side by side in a Row.
  const lines: string[] = [];
  missing.forEach((c, i) => lines.push(`dexcard${i} = ${cardCall(c)}`));
  let ref: string;
  if (missing.length === 1) {
    ref = "dexcard0";
  } else {
    ref = "dexcards";
    lines.push(`dexcards = Row([${missing.map((_, i) => `dexcard${i}`).join(", ")}])`);
  }

  const rootRe = /^(root\s*=\s*PokedexScreen\(\s*"(?:[^"\\]|\\.)*"\s*,\s*\[)(\s*\]?)/m;
  if (rootRe.test(fixed)) {
    fixed = fixed.replace(rootRe, (_m, head: string, rest: string) =>
      rest.trim() === "]" ? `${head}${ref}]` : `${head}${ref}, ${rest.trimStart()}`,
    );
    return `${fixed}\n${lines.join("\n")}`;
  }

  // A screen we can't safely edit: leave it alone.
  if (/^root\s*=/m.test(fixed)) return fixed;

  // No screen at all: build a simple one.
  const title = missing.map((c) => c.name.charAt(0).toUpperCase() + c.name.slice(1)).join(" & ");
  return [`root = PokedexScreen(${q(title)}, [${ref}])`, ...lines].join("\n");
}
