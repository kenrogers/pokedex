/**
 * tools.ts — the tools the AI may use. The AI sees the name, description and JSON
 * Schema; when it asks for one, the page runs the real code and sends back the result.
 * Want a new trick? Add a tool here.
 */
import { compareTypes, lookupPokemon } from "./pokeapi";
import { drawPokemonTutorial } from "./draw";

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "lookup_pokemon",
      description:
        "Look up one Pokémon by official name or National Pokédex number. Returns types, base stats, size, abilities, some moves, Pokédex entry, genus, the full evolution chain (with stage numbers) plus evolvesFrom / evolvesInto ([] means it does not evolve further), and `pokemonCard`, a ready PokemonCard(...) line for the screen. If resolvedFrom is set, the name was auto-corrected from a misheard word.",
      parameters: {
        type: "object",
        properties: {
          nameOrId: { type: "string", description: "The official PokéAPI name you think the kid meant, or a number like '25'. For special forms use the PokéAPI form name: 'blastoise-mega', 'charizard-mega-x', 'charizard-gmax', 'vulpix-alola', 'meowth-galar', 'growlithe-hisui'. Only use a form name when the kid asked for that form." },
          shiny: {
            type: "boolean",
            description:
              "true if the kid wants the shiny version (returns shiny artwork).",
          },
        },
        required: ["nameOrId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_types",
      description:
        "How much damage an attacking TYPE does to a defender. The defender can be a type ('water') or a Pokémon name ('squirtle'). Returns the multiplier (0, 0.25, 0.5, 1, 2, 4) and a verdict.",
      parameters: {
        type: "object",
        properties: {
          attacker: { type: "string", description: "Attacking type, e.g. 'fire'" },
          defender: { type: "string", description: "Defending type or Pokémon name" },
        },
        required: ["attacker", "defender"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draw_pokemon_tutorial",
      description:
        "Make ONE picture: a simple numbered step-by-step 'how to draw' sheet for a Pokémon (simple shapes to finished drawing). Call it when the kid asks how to draw, sketch, or learn to draw a Pokémon. Returns name, number, types, a short tip, and `pokemonCard`: put that PokemonCard line on screen (DEX swaps in the drawing picture automatically).",
      parameters: {
        type: "object",
        properties: {
          nameOrId: { type: "string", description: "Pokémon name like 'pikachu' or a number like '25'" },
          focus: { type: "string", enum: ["whole body", "head", "face"], description: "Optional: what to draw" },
        },
        required: ["nameOrId"],
      },
    },
  },
] as const;

/** Run the tool the AI asked for. Returns a plain object (or { error }). */
export async function runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    if (name === "lookup_pokemon") return await lookupPokemon(String(args.nameOrId ?? ""), args.shiny === true);
    if (name === "compare_types") return await compareTypes(String(args.attacker ?? ""), String(args.defender ?? ""));
    if (name === "draw_pokemon_tutorial") return await drawPokemonTutorial(String(args.nameOrId ?? ""), args.focus as string | undefined);
    return { error: `Unknown tool ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lookup failed." };
  }
}
