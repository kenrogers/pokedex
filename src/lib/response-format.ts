/**
 * response-format.ts — splits the AI's reply into "what to say" and "what to draw".
 *
 * Ideal shape:
 *   SPEECH: Charmander is a Fire-type lizard Pokémon!
 *   root = PokedexScreen("Charmander", [card])
 *
 * Models sometimes forget SPEECH: or put prose above `root =`. Accept those.
 */
export type SplitResponse = {
  speech: string;
  speechComplete: boolean;
  openui: string;
};

export function splitResponse(text: string): SplitResponse {
  const cleaned = text.replace(/```[a-z-]*\n?/gi, "").replace(/^\s+/, "");
  if (!cleaned) return { speech: "", speechComplete: false, openui: "" };

  // Still streaming the SPEECH label / first words — no newline yet.
  if (/^SPEECH:\s*[^\n]*$/i.test(cleaned)) {
    return {
      speech: cleaned.replace(/^SPEECH:\s*/i, "").trim(),
      speechComplete: false,
      openui: "",
    };
  }

  const rootIndex = cleaned.search(/(^|\n)root\s*=/i);
  let openui = "";
  let prose = cleaned;
  if (rootIndex >= 0) {
    // Skip the leading newline if root isn't at column 0.
    const absRoot = cleaned[rootIndex] === "\n" ? rootIndex + 1 : rootIndex;
    openui = cleaned.slice(absRoot).trim();
    prose = cleaned.slice(0, absRoot).trim();
  }

  let speech = "";
  const labeled = prose.match(/(?:^|\n)\s*SPEECH:\s*([\s\S]+)/i);
  if (labeled) {
    speech = labeled[1].trim();
    if (openui) speech = speech.split("\n")[0].trim();
  } else if (prose && !/^root\s*=/i.test(prose)) {
    speech = prose.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  }

  const speechComplete = Boolean(openui) || (Boolean(speech) && (prose.includes("\n") || Boolean(openui)));

  return { speech, speechComplete, openui };
}
