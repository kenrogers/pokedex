/**
 * pokeapi.ts — Pokémon facts from PokéAPI (https://pokeapi.co).
 *
 * WHY GraphQL? PokéAPI's normal /pokemon/pikachu answer is ~300 KB (every move in
 * every game!). Reading that much JSON burns Worker CPU time, and the free
 * Cloudflare plan only gives us ~10 ms per request. PokéAPI's GraphQL endpoint lets
 * us ask for ONLY the fields we need, in ONE request (~1.5 KB).
 *
 * Answers are remembered in memory for this browser tab, to be kind to PokéAPI.
 */
import { resolveSpecies } from "./fuzzy-name";
import { ALL_TYPES, TYPE_CHART } from "./type-chart";

const GRAPHQL_URL = "https://graphql.pokeapi.co/v1beta2";
const MEMO = new Map<string, PokemonFacts>();

/** PokéAPI wants lowercase names with dashes: "Mr. Mime" -> "mr-mime". */
export function normalizeName(nameOrId: string | number): string {
  return String(nameOrId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "") // no "/", "?", "#" etc. — names only
    .slice(0, 40);
}

export function artworkUrl(id: number, shiny = false): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? "shiny/" : ""}${id}.png`;
}

const POKEMON_QUERY = `query($w: pokemon_bool_exp!) {
  pokemon(where: $w, order_by: {is_default: desc}, limit: 1) {
    id name height weight
    pokemontypes(order_by: {slot: asc}) { type { name } }
    pokemonstats { base_stat stat { name } }
    pokemonabilities { is_hidden ability { name } }
    pokemonmoves(limit: 8, distinct_on: move_id) { move { name } }
    pokemonspecy {
      name is_legendary is_mythical
      pokemoncolor { name } pokemonhabitat { name }
      pokemonspeciesnames(where: {language_id: {_eq: 9}}) { genus }
      pokemonspeciesflavortexts(where: {language_id: {_eq: 9}}, limit: 1) { flavor_text }
      evolutionchain { pokemonspecies(order_by: {order: asc}) { id name evolves_from_species_id } }
    }
  }
}`;

type Named = { name: string };
type RawPokemon = {
  id: number; name: string; height: number; weight: number;
  pokemontypes: { type: Named }[];
  pokemonstats: { base_stat: number; stat: Named }[];
  pokemonabilities: { is_hidden: boolean; ability: Named }[];
  pokemonmoves: { move: Named }[];
  pokemonspecy: {
    name: string; is_legendary: boolean; is_mythical: boolean;
    pokemoncolor: Named | null; pokemonhabitat: Named | null;
    pokemonspeciesnames: { genus: string }[];
    pokemonspeciesflavortexts: { flavor_text: string }[];
    evolutionchain: { pokemonspecies: { id: number; name: string; evolves_from_species_id: number | null }[] } | null;
  } | null;
};

/** Tidy facts about one Pokémon (no picture choice yet). */
export type PokemonFacts = {
  id: number; name: string; heightMeters: number; weightKg: number; types: string[];
  stats: { name: string; value: number }[]; abilities: string[]; sampleMoves: string[];
  genus: string; color: string; habitat: string; isLegendary: boolean; isMythical: boolean;
  flavorText: string; evolutions: { name: string; number: number; stage: number }[];
  /** Plain answers so the AI never has to guess: [] means "none". */
  evolvesFrom: string | null; evolvesInto: string[]; isFinalStage: boolean;
};

async function fetchFacts(nameOrId: string | number): Promise<PokemonFacts & { resolvedFrom?: string }> {
  const asked = normalizeName(nameOrId);
  if (!asked) throw new Error("Which Pokémon? I didn't catch a name.");
  // Misheard names ("dugong") snap to the closest real Pokémon ("dewgong").
  const r = resolveSpecies(asked);
  const facts = await fetchExact(r.name).catch((e) => {
    throw r.suggestions ? new Error(`${(e as Error).message} Did you mean: ${r.suggestions.join(", ")}?`) : e;
  });
  return r.resolvedFrom && r.resolvedFrom !== facts.name ? { ...facts, resolvedFrom: r.resolvedFrom } : facts;
}

async function fetchExact(key: string): Promise<PokemonFacts> {

  // In-memory cache for this tab, to be kind to PokéAPI.
  const hit = MEMO.get(key);
  if (hit) return hit;

  const where = /^\d+$/.test(key)
    ? { id: { _eq: Number(key) } }
    : { _or: [{ name: { _eq: key } }, { _and: [{ pokemonspecy: { name: { _eq: key } } }, { is_default: { _eq: true } }] }] };
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: POKEMON_QUERY, variables: { w: where } }),
  });
  if (!res.ok) throw new Error(`PokéAPI said ${res.status}`);
  const json = (await res.json()) as { data?: { pokemon?: RawPokemon[] }; errors?: unknown };
  const p = json.data?.pokemon?.[0];
  if (!p) throw new Error(`No Pokémon called "${key}" in the Pokédex.`);

  const s = p.pokemonspecy;
  const chain = s?.evolutionchain?.pokemonspecies ?? [];
  // Stage = how many "evolves from" steps back to the first Pokémon in the chain.
  const stageOf = (id: number | null, depth = 1): number => {
    const me = chain.find((c) => c.id === id);
    return me?.evolves_from_species_id ? stageOf(me.evolves_from_species_id, depth + 1) : depth;
  };
  const facts: PokemonFacts = {
    id: p.id,
    name: p.name,
    heightMeters: p.height / 10,
    weightKg: p.weight / 10,
    types: p.pokemontypes.map((t) => t.type.name),
    stats: p.pokemonstats.map((x) => ({ name: x.stat.name, value: x.base_stat })),
    abilities: p.pokemonabilities.map((a) => a.ability.name + (a.is_hidden ? " (hidden)" : "")),
    sampleMoves: p.pokemonmoves.map((m) => m.move.name),
    genus: s?.pokemonspeciesnames[0]?.genus ?? "",
    color: s?.pokemoncolor?.name ?? "",
    habitat: s?.pokemonhabitat?.name ?? "unknown",
    isLegendary: !!s?.is_legendary,
    isMythical: !!s?.is_mythical,
    // Old-game text has weird line breaks; clean them up.
    flavorText: (s?.pokemonspeciesflavortexts[0]?.flavor_text ?? "").replace(/[\n\f\r]+/g, " "),
    evolutions: chain.length
      ? chain.map((c) => ({ name: c.name, number: c.id, stage: stageOf(c.id) }))
      : [{ name: p.name, number: p.id, stage: 1 }],
    evolvesFrom: chain.find((c) => c.id === chain.find((d) => d.name === s?.name)?.evolves_from_species_id)?.name ?? null,
    evolvesInto: chain.filter((c) => c.evolves_from_species_id === chain.find((d) => d.name === s?.name)?.id).map((c) => c.name),
    isFinalStage: false,
  };
  facts.isFinalStage = facts.evolvesInto.length === 0;
  MEMO.set(key, facts);
  return facts;
}

/** e.g. PokemonCard("pikachu", 25, "https://...", ["electric"], "Mouse Pokémon") */
export function pokemonCardLine(p: { name: string; id: number; imageUrl: string; types: string[]; genus?: string }) {
  const q = (v: string) => JSON.stringify(v);
  return `PokemonCard(${q(p.name)}, ${p.id}, ${q(p.imageUrl)}, [${p.types.map(q).join(", ")}], ${q(p.genus ?? "")})`;
}

/** TOOL: lookup_pokemon. Shiny = same ID, "shiny" folder in the sprite path. */
export async function lookupPokemon(nameOrId: string | number, shiny = false) {
  const facts = await fetchFacts(nameOrId);
  const result = { ...facts, imageUrl: artworkUrl(facts.id, shiny), ...(shiny ? { shiny: true } : {}) };
  return { ...result, pokemonCard: pokemonCardLine(result) };
}

/** Just the facts (used by the drawing tool and compare_types). */
export const getPokemonFacts = fetchFacts;

/**
 * TOOL: compare_types — how much damage an attacking type does to a defender
 * (a type like "water", or a Pokémon like "squirtle" — two types multiply).
 */
export async function compareTypes(attackerType: string, defender: string) {
  const attacker = normalizeName(attackerType);
  if (!TYPE_CHART[attacker]) throw new Error(`"${attackerType}" isn't a Pokémon type.`);
  let defenderLabel = normalizeName(defender);
  let defenderTypes: string[];
  if (ALL_TYPES.includes(defenderLabel)) {
    defenderTypes = [defenderLabel];
  } else {
    const p = await fetchFacts(defender);
    defenderTypes = p.types;
    defenderLabel = p.name;
  }
  const row = TYPE_CHART[attacker];
  const multiplier = defenderTypes.reduce((m, t) => m * (row[t] ?? 1), 1);
  const verdict =
    multiplier === 0 ? "has no effect" : multiplier > 1 ? "is super effective" : multiplier < 1 ? "is not very effective" : "does normal damage";
  return {
    attackerType: attacker,
    defender: defenderLabel,
    defenderTypes,
    multiplier,
    verdict: `${attacker} ${verdict} against ${defenderLabel}`,
    attackerIsStrongAgainst: Object.keys(row).filter((t) => row[t] === 2),
  };
}
