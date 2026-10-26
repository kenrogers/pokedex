
/**
 * page.tsx — the whole app on one page: a Pokédex with a screen and a talk button.
 * No keyboard needed! This file just keeps track of "what's happening" (the state)
 * and passes it to the pieces that draw things.
 */
import { dexChat, fetchDrawing, parseChatLine, speak } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { GeneratedScreen } from "@/components/GeneratedScreen";
import { PokedexFrame } from "@/components/PokedexFrame";
import { DEMO_SCREEN } from "@/lib/demo-screen";
import { type Status, type Turn, VoiceControls } from "@/components/VoiceControls";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null); // friendly hints and errors
  const [openui, setOpenui] = useState(""); // what the screen should draw
  const [isStreaming, setIsStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [history, setHistory] = useState<Turn[]>([]); // the conversation so far, so DEX remembers
  const [heard, setHeard] = useState(""); // what DEX heard (for the "Show words" toggle)
  const [said, setSaid] = useState(""); // what DEX said
  const [showWords, setShowWords] = useState(false);

  // Visiting /?demo=1 shows a sample screen (no API key needed). Handy for lessons.
  // Visiting /?ask=Who%20is%20Pikachu runs one text turn (no mic) — used to test on any device.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("demo")) setOpenui(DEMO_SCREEN);
    const ask = params.get("ask")?.trim();
    if (!ask) return;
    let cancelled = false;
    (async () => {
      setStatus("thinking");
      setMessage(`Testing: “${ask}”…`);
      setHeard(ask);
      try {
        let text = "";
        const cards: { name: string; number: number; imageUrl: string; types: string[]; genus: string }[] = [];
        const drawings: Promise<void>[] = [];
        const reader = dexChat([{ role: "user", content: ask }]).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: { type: string; delta?: string; card?: (typeof cards)[0]; message?: string; drawing?: boolean; ticket?: string };
            const parsed = parseChatLine(line);
            if (!parsed) continue;
            event = parsed as typeof event;
            if (event.type === "cards") (await import("@/lib/ensure-cards")).setShinyTurn(!!(event as { shiny?: boolean }).shiny);
            else if (event.type === "reset") text = "";
            else if (event.type === "text") text += event.delta ?? "";
            else if (event.type === "pokemon" && event.card && event.drawing) {
              const card = event.card;
              cards.unshift(card);
              if (event.ticket) drawings.push(fetchDrawing(event.ticket).then((url) => { if (url) card.imageUrl = url; }));
            } else if (event.type === "pokemon" && event.card) cards.push(event.card);
            else if (event.type === "error") throw new Error(event.message ?? "Chat error");
          }
        }
        await Promise.all(drawings);
        for (let i = cards.length - 1; i >= 0; i--) if (cards[i].imageUrl === "DRAWING") cards.splice(i, 1);
        if (cancelled) return;
        const { splitResponse } = await import("@/lib/response-format");
        const { ensureCards } = await import("@/lib/ensure-cards");
        let parts = splitResponse(text);
        if (!parts.openui && cards.length) {
          parts = {
            ...parts,
            openui: ensureCards("", cards),
            speech: parts.speech || `Pokémon detected: ${cards.map((c) => c.name).join(", ")}.`,
          };
        } else {
          parts = { ...parts, openui: ensureCards(parts.openui, cards) };
        }
        if (!parts.speech && parts.openui) parts = { ...parts, speech: "Pokémon data loaded." };
        if (!parts.speech && !parts.openui && text.trim()) {
          parts = { speech: text.trim().split("\n")[0].slice(0, 280), openui: "", speechComplete: true };
        }
        if (!parts.openui && !parts.speech) {
          setStatus("error");
          setMessage("DEX looked things up but sent back a blank answer. Try once more?");
          return;
        }
        if (parts.openui) setOpenui(parts.openui);
        setSaid(parts.speech);
        setHistory([
          { role: "user", content: ask },
          { role: "assistant", content: parts.speech || "(no speech line)" },
        ]);
        // Speak it too when possible.
        if (parts.speech) {
          setStatus("speaking");
          setMessage(null);
          try {
            const blob = await speak(parts.speech);
            if (blob) {
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              await audio.play().catch(() => undefined);
              URL.revokeObjectURL(url);
            }
          } catch {
            /* screen still updated */
          }
        }
        setStatus("idle");
        setMessage(null);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-neutral-900">
      <PokedexFrame
        status={status}
        screen={<GeneratedScreen openui={openui} isStreaming={isStreaming} activity={activity} />}
        controls={
          <div className="flex flex-col gap-2">
            <VoiceControls
              status={status}
              history={history}
              onStatus={(s, msg) => {
                setStatus(s);
                setMessage(msg ?? null);
              }}
              onTranscript={(text) => {
                setHeard(text);
                setSaid("");
              }}
              onReply={({ speech, openui: ui, streaming }) => {
                // Only replace the screen once new UI starts arriving, so the old
                // screen doesn't flash empty while the SPEECH line streams in.
                if (ui) setOpenui(ui);
                setSaid(speech);
                setIsStreaming(streaming);
              }}
              onActivity={setActivity}
              onTurnDone={(user, assistantSpeech) =>
                // Only remember the spoken line — NOT the OpenUI screen program.
                // Sending the whole screen back next turn made requests huge and flaky.
                setHistory((h) =>
                  [...h, { role: "user" as const, content: user }, { role: "assistant" as const, content: assistantSpeech }].slice(-10),
                )
              }
            />

            {message && (
              <div
                role="status"
                className={`rounded-xl px-3 py-1 text-center text-base font-bold ${
                  status === "error" ? "bg-yellow-300 text-black" : "bg-black/40 text-white"
                }`}
              >
                {message}
              </div>
            )}

            {/* Grown-up corner: see what DEX heard and said. Off by default. */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowWords((v) => !v)}
                className="text-xs text-red-100/70 underline"
              >
                {showWords ? "Hide words" : "Show words"}
              </button>
              {showWords && (
                <div className="mt-1 rounded-lg bg-black/50 p-2 text-left text-xs text-white">
                  <div className="line-clamp-2">
                    <b>Heard:</b> {heard || "—"}
                  </div>
                  <div className="line-clamp-2">
                    <b>Said:</b> {said || "—"}
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />
    </main>
  );
}
