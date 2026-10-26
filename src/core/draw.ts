/**
 * draw.ts — TOOL: draw_pokemon_tutorial.
 * Half 1 (in the chat loop): check the Pokémon is real, return a small "ticket".
 * Half 2 (the page): turn the ticket into a picture with the image model.
 */
import { MODELS } from "./config";
import { openRouter } from "./openrouter";
import { getPokemonFacts, pokemonCardLine } from "./pokeapi";

type Ticket = { id: number; name: string; genus: string; types: string[]; focus: string };
const FOCUSES = ["whole body", "head", "face"];

export async function drawPokemonTutorial(nameOrId: string, focus?: string) {
  const p = await getPokemonFacts(nameOrId);
  const t: Ticket = {
    id: p.id, name: p.name, genus: p.genus, types: p.types,
    // Allowlist only, so free text from the model can't steer the image prompt.
    focus: FOCUSES.includes(String(focus)) ? String(focus) : "whole body",
  };
  const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
  return {
    name: p.name,
    id: p.id,
    types: p.types,
    ticket: JSON.stringify(t),
    tip: `Start with big light circles for ${name}'s head and body, then add details one step at a time.`,
    pokemonCard: pokemonCardLine({ name: p.name, id: p.id, imageUrl: "DRAWING", types: p.types, genus: "How to draw" }),
  };
}

/** Ticket → picture as a data: URL (or null if it failed). */
export async function fetchDrawing(ticket: string): Promise<string | null> {
  try {
    const t = JSON.parse(ticket) as Ticket;
    const name = t.name.charAt(0).toUpperCase() + t.name.slice(1);
    const prompt = [
      `A simple, kid-friendly "How to draw ${name}" step-by-step drawing tutorial sheet for a 7 year old.`,
      `Subject: ${name}, the ${t.genus || "Pokémon"} (${t.types.join("/")} type). Draw the ${t.focus}.`,
      `Layout: 6 numbered panels in a 3x2 grid, read left-to-right then top-to-bottom, each labeled "Step 1" to "Step 6".`,
      `Step 1 starts with basic shapes (circles, ovals); each step adds a few new lines in darker pencil; Step 6 is the finished simple cartoon drawing, lightly colored.`,
      `Plain white background, clean thick black outlines, simple cartoon style, friendly happy pose, recognizable but simplified (not a copy of official art).`,
      `Large clear labels only, no other text, no scary or violent content.`,
    ].join(" ");
    const res = await openRouter("images", JSON.stringify({ model: MODELS.image, prompt, aspect_ratio: "1:1", n: 1 }));
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { b64_json?: string; media_type?: string }[] };
    const img = json.data?.[0];
    // Only data: URLs are shown, so the page never loads images from unknown hosts.
    return img?.b64_json ? `data:${img.media_type || "image/png"};base64,${img.b64_json}` : null;
  } catch {
    return null;
  }
}
