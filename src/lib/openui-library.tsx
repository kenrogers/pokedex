/* eslint-disable */
/**
 * openui-library.tsx — the "LEGO bricks" the AI is allowed to build screens with.
 *
 * WHY this file exists:
 *   The AI doesn't write HTML. It writes a tiny language called OpenUI Lang, like:
 *
 *     root = PokedexScreen("Pikachu", [card, stats])
 *     card = PokemonCard("pikachu", 25, "https://...png", ["electric"], "Mouse Pokémon")
 *     stats = StatBars([StatBar("HP", 35), StatBar("Speed", 90)])
 *
 *   Each name (PokedexScreen, PokemonCard, StatBar...) must be one of the
 *   components defined below. Each one has:
 *     - name:        what the AI types
 *     - description: a hint for the AI about when to use it
 *     - props:       a Zod schema = the rules for what goes inside the ( )
 *                    (the ORDER of the keys is the order of the arguments!)
 *     - component:   the React code that actually draws it
 *
 *   Want the Pokédex to show something new? Add a new brick here. The system
 *   prompt is generated from this file automatically, so the AI learns about it.
 *
 * NOTE: no "use client" here on purpose — the server imports this file too,
 * to build the system prompt. None of these components use React hooks.
 */
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";

// ---------- Shared helpers ----------

/** Classic type colors, so Fire looks fiery and Water looks watery. */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A", fire: "#EE8130", water: "#6390F0", electric: "#F7D02C",
  grass: "#7AC74C", ice: "#96D9D6", fighting: "#C22E28", poison: "#A33EA1",
  ground: "#E2BF65", flying: "#A98FF3", psychic: "#F95587", bug: "#A6B91A",
  rock: "#B6A136", ghost: "#735797", dragon: "#6F35FC", dark: "#705746",
  steel: "#B7B7CE", fairy: "#D685AD",
};

/** "mr-mime" -> "Mr Mime" so names look nice on screen. */
function prettyName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Small sprite image straight from PokéAPI's sprite collection, by Pokédex number. */
function spriteFor(number: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${number}.png`;
}

/** Big official artwork by Pokédex number (backup when the AI leaves imageUrl empty). */
function artworkFor(number: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${number}.png`;
}

/** While the AI is still streaming, some props can be missing. Arrays help us be safe. */
function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

// ---------- Small bricks ----------

export const TypeBadge = defineComponent({
  name: "TypeBadge",
  description: "A colored pill showing one Pokémon type, like fire or water.",
  props: z.object({
    type: z.string().describe("lowercase type name, e.g. 'fire'"),
  }),
  component: ({ props }) => {
    const type = (props.type ?? "").toLowerCase();
    return (
      <span
        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow"
        style={{ backgroundColor: TYPE_COLORS[type] ?? "#555" }}
      >
        {type}
      </span>
    );
  },
});

export const TypeRow = defineComponent({
  name: "TypeRow",
  description:
    "A labeled row of type badges. Use for weaknesses, strengths or resistances, e.g. TypeRow(\"Weak to\", [\"water\",\"rock\"]).",
  props: z.object({
    label: z.string(),
    types: z.array(z.string()),
  }),
  component: ({ props }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="screen-label min-w-24">{props.label}</span>
      {asArray(props.types).map((t) => (
        <TypeBadge.component key={t} props={{ type: t }} renderNode={() => null} />
      ))}
    </div>
  ),
});

export const StatBar = defineComponent({
  name: "StatBar",
  description: "One base stat as a bar. value is 0-255.",
  props: z.object({
    label: z.string().describe("e.g. HP, Attack, Defense, Sp. Atk, Sp. Def, Speed"),
    value: z.number(),
  }),
  component: ({ props }) => {
    const value = Number(props.value ?? 0);
    // 255 is the highest any base stat can be, so that's a "full" bar.
    const percent = Math.min(100, Math.round((value / 255) * 100));
    return (
      // Narrow box (e.g. next to a card on a phone): label/number on top, bar below.
      // Wide box: everything on one line. "@container" + "@[14rem]:" makes that switch.
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 @[14rem]:flex-nowrap">
        <span className="screen-label w-16 shrink-0 truncate">{props.label}</span>
        <span className="ml-auto w-8 text-right font-bold @[14rem]:ml-0">{value}</span>
        <div className="h-2.5 w-full overflow-hidden rounded bg-black/40 @[14rem]:h-3 @[14rem]:w-auto @[14rem]:flex-1">
          <div className="h-full rounded bg-lime-300 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  },
});

export const StatBars = defineComponent({
  name: "StatBars",
  description: "A group of StatBar for a Pokémon's base stats.",
  props: z.object({
    stats: z.array(StatBar.ref),
  }),
  component: ({ props, renderNode }) => (
    <div className="screen-panel @container flex min-w-0 flex-col gap-1">
      <div className="screen-title">Base stats</div>
      {renderNode(props.stats)}
    </div>
  ),
});

export const InfoPanel = defineComponent({
  name: "InfoPanel",
  description: "A titled box with a short paragraph, e.g. the Pokédex entry or an explanation.",
  props: z.object({
    title: z.string(),
    text: z.string(),
  }),
  component: ({ props }) => (
    <div className="screen-panel">
      <div className="screen-title">{props.title}</div>
      <p className="text-base leading-snug">{props.text}</p>
    </div>
  ),
});

export const FactList = defineComponent({
  name: "FactList",
  description: "A titled bullet list of short facts (height, weight, habitat, abilities...).",
  props: z.object({
    title: z.string(),
    facts: z.array(z.string()),
  }),
  component: ({ props }) => (
    <div className="screen-panel">
      <div className="screen-title">{props.title}</div>
      <ul className="list-inside list-disc space-y-0.5 text-base">
        {asArray(props.facts).map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  ),
});

export const MoveList = defineComponent({
  name: "MoveList",
  description: "A grid of move names a Pokémon can learn.",
  props: z.object({
    moves: z.array(z.string()),
  }),
  component: ({ props }) => (
    <div className="screen-panel">
      <div className="screen-title">Moves</div>
      <div className="grid grid-cols-2 gap-1.5">
        {asArray(props.moves).map((m) => (
          <span key={m} className="rounded bg-black/30 px-2 py-1 text-center">
            {prettyName(m)}
          </span>
        ))}
      </div>
    </div>
  ),
});

export const EvolutionStage = defineComponent({
  name: "EvolutionStage",
  description:
    "One Pokémon in an evolution line: name, National Pokédex number, and stage (1 = first form, 2 = evolves once, 3 = evolves twice).",
  props: z.object({
    name: z.string(),
    number: z.number(),
    stage: z.number().optional(),
  }),
  component: ({ props }) => (
    <div className="flex w-[4.75rem] flex-col items-center text-center">
      {props.number ? (
        <img src={spriteFor(props.number)} alt={props.name} className="pixelated h-14 w-14" />
      ) : null}
      <span className="w-full break-words text-sm font-bold leading-tight">{prettyName(props.name ?? "")}</span>
    </div>
  ),
});

export const EvolutionChain = defineComponent({
  name: "EvolutionChain",
  description:
    "Shows how a Pokémon evolves. Pass every EvolutionStage from the tool result, with its stage number.",
  props: z.object({
    stages: z.array(EvolutionStage.ref),
  }),
  component: ({ props, renderNode }) => {
    // Group the stages into columns: all stage-1 Pokémon, then all stage-2, ...
    // That way Eevee → [Vaporeon, Jolteon, Flareon, ...] looks like a branch, not a line.
    const columns: unknown[][] = [];
    asArray(props.stages).forEach((stage, i) => {
      const n = Number(stage?.props?.stage ?? i + 1);
      const index = Math.max(0, n - 1);
      (columns[index] ??= []).push(stage);
    });
    const filled = columns.filter(Boolean);
    return (
      <div className="screen-panel">
        <div className="screen-title">Evolution</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {filled.map((column, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-3xl">→</span>}
              <div className="flex flex-wrap justify-center gap-1">
                {column.map((stage, j) => (
                  <div key={j}>{renderNode(stage)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

export const TypeMatchup = defineComponent({
  name: "TypeMatchup",
  description:
    "Shows one attack type hitting a defender with a damage multiplier (0, 0.25, 0.5, 1, 2 or 4) and a one-line verdict.",
  props: z.object({
    attackerType: z.string(),
    defender: z.string().describe("a type or Pokémon name"),
    multiplier: z.number(),
    verdict: z.string(),
  }),
  component: ({ props }) => {
    const m = Number(props.multiplier ?? 1);
    // Big friendly color: green = great hit, red = bad hit.
    const color = m === 0 ? "#999" : m > 1 ? "#7CFC00" : m < 1 ? "#FF6B6B" : "#FFD54F";
    const attacker = (props.attackerType ?? "").toLowerCase();
    return (
      <div className="screen-panel flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-3 text-xl">
          <span
            className="rounded-full px-3 py-1 font-bold uppercase text-white"
            style={{ backgroundColor: TYPE_COLORS[attacker] ?? "#555" }}
          >
            {attacker}
          </span>
          <span>⚡ vs ⚡</span>
          <span className="font-bold">{prettyName(props.defender ?? "")}</span>
        </div>
        <div className="text-4xl font-black" style={{ color }}>
          ×{m}
        </div>
        <div className="text-lg">{props.verdict}</div>
      </div>
    );
  },
});

export const PokemonCard = defineComponent({
  name: "PokemonCard",
  description:
    "REQUIRED picture card for EVERY Pokémon you talk about: name, National Pokédex number, imageUrl from lookup_pokemon, its types, and its category (genus). Copy the `pokemonCard` line from the tool result. Put it first.",
  props: z.object({
    name: z.string(),
    number: z.number(),
    imageUrl: z.string(),
    types: z.array(z.string()),
    genus: z.string().optional(),
  }),
  component: ({ props }) => (
    <div className="screen-panel pokemon-card flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="flex w-full flex-wrap items-baseline justify-between gap-x-2">
        <span className="card-name font-black">{prettyName(props.name ?? "")}</span>
        <span className="opacity-80">#{String(props.number ?? "").padStart(4, "0")}</span>
      </div>
      {props.imageUrl || props.number ? (
        <img
          src={props.imageUrl || artworkFor(props.number)}
          alt={props.name}
          className="card-art object-contain drop-shadow-lg"
          // If the big artwork fails, fall back to the small game sprite.
          onError={(e) => {
            const img = e.currentTarget;
            const backup = props.number ? spriteFor(props.number) : "";
            if (backup && img.src !== backup) img.src = backup;
          }}
        />
      ) : (
        <div className="card-art animate-pulse rounded-full bg-black/30" />
      )}
      <div className="flex flex-wrap justify-center gap-1.5">
        {asArray(props.types).map((t) => (
          <TypeBadge.component key={t} props={{ type: t }} renderNode={() => null} />
        ))}
      </div>
      {props.genus ? <div className="italic opacity-90">{props.genus}</div> : null}
    </div>
  ),
});

/** Every brick that can go directly inside a screen or a row. */
const panelRefs = [
  PokemonCard.ref,
  StatBars.ref,
  InfoPanel.ref,
  FactList.ref,
  MoveList.ref,
  EvolutionChain.ref,
  TypeMatchup.ref,
  TypeRow.ref,
  TypeBadge.ref,
] as const;

export const Row = defineComponent({
  name: "Row",
  description: "Puts panels side by side. Use it for two Pokémon: Row([PokemonCard, PokemonCard]).",
  props: z.object({
    children: z.array(z.union(panelRefs)),
  }),
  component: ({ props, renderNode }) => (
    <div className="grid grid-cols-2 gap-2">{renderNode(props.children)}</div>
  ),
});

// ---------- The ROOT brick: every screen starts here ----------

export const PokedexScreen = defineComponent({
  name: "PokedexScreen",
  description: "The whole Pokédex screen. Always the root. title is short, e.g. the Pokémon's name.",
  props: z.object({
    title: z.string(),
    children: z.array(z.union([...panelRefs, Row.ref])),
  }),
  component: ({ props, renderNode }) => (
    <div className="screen-content flex flex-col gap-2">
      <div className="screen-header">{props.title}</div>
      {renderNode(props.children)}
    </div>
  ),
});

// ---------- Put all the bricks in one box ----------

export const pokedexLibrary = createLibrary({
  root: "PokedexScreen",
  components: [
    PokedexScreen,
    Row,
    PokemonCard,
    StatBars,
    StatBar,
    TypeBadge,
    TypeRow,
    InfoPanel,
    FactList,
    MoveList,
    EvolutionChain,
    EvolutionStage,
    TypeMatchup,
  ],
  componentGroups: [
    { name: "Screen", components: ["PokedexScreen", "Row"] },
    {
      name: "Pokémon",
      components: ["PokemonCard", "StatBars", "StatBar", "EvolutionChain", "EvolutionStage", "MoveList"],
      notes: [
        "- EVERY Pokémon named in SPEECH gets a PokemonCard (its picture). No Pokémon answer without a card.",
        "- For 'tell me about X' show PokemonCard, then StatBars OR a short InfoPanel. 2–3 panels max so it fits a phone screen.",
        "- For two Pokémon use Row([cardA, cardB]) first.",
        "- Use the exact imageUrl and numbers from the lookup_pokemon tool result (or paste its `pokemonCard` line). Never invent URLs.",
      ],
    },
    {
      name: "Types and facts",
      components: ["TypeBadge", "TypeRow", "TypeMatchup", "InfoPanel", "FactList"],
      notes: ["- For 'is X good against Y' questions use TypeMatchup with numbers from compare_types."],
    },
  ],
});
