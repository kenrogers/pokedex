
/**
 * page.tsx — the whole app on one page: a Pokédex with a screen and a talk button.
 * No keyboard needed! This file just keeps track of "what's happening" (the state)
 * and passes it to the pieces that draw things.
 */
import { useEffect, useState } from "react";
import { GeneratedScreen } from "@/components/GeneratedScreen";
import { PokedexFrame } from "@/components/PokedexFrame";
import { DEMO_SCREEN } from "@/lib/demo-screen";
import { type Status, type Turn, VoiceControls } from "@/components/VoiceControls";
import { SERVER_PROXY } from "@/core/config";
import { forgetSavedSignIn } from "@/core/keys";
import { dexChat, fetchDrawing, parseChatLine } from "@/lib/api-client";

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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("demo")) setOpenui(DEMO_SCREEN);
  }, []);

  // Local tests only: sessionStorage dex-test=1, then dispatch window event "dex:ask"
  // with the question text. A link cannot set that flag or fire this event.
  useEffect(() => {
    if (sessionStorage.getItem("dex-test") !== "1") return;
    let cancelled = false;
    const onAsk = (e: Event) => {
      const ask = typeof (e as CustomEvent).detail === "string" ? (e as CustomEvent).detail.trim() : "";
      if (!ask) return;
      void (async () => {
        setStatus("thinking");
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
              const parsed = parseChatLine(line);
              if (!parsed) continue;
              const event = parsed as { type: string; delta?: string; card?: (typeof cards)[0]; message?: string; drawing?: boolean; ticket?: string; shiny?: boolean };
              if (event.type === "cards") (await import("@/lib/ensure-cards")).setShinyTurn(!!event.shiny);
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
            parts = { ...parts, openui: ensureCards("", cards), speech: parts.speech || cards.map((c) => c.name).join(", ") };
          } else {
            parts = { ...parts, openui: ensureCards(parts.openui, cards) };
          }
          if (parts.openui) setOpenui(parts.openui);
          setSaid(parts.speech);
          setStatus("idle");
        } catch (err) {
          if (cancelled) return;
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Something went wrong.");
        }
      })();
    };
    window.addEventListener("dex:ask", onAsk);
    return () => {
      cancelled = true;
      window.removeEventListener("dex:ask", onAsk);
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
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => forgetSavedSignIn()}
                  className="text-xs text-red-100/70 underline"
                >
                  {SERVER_PROXY ? "Forget password" : "Forget key"}
                </button>
              </div>
            </div>
          </div>
        }
      />
    </main>
  );
}
