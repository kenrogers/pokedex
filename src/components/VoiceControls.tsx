
/**
 * VoiceControls — the big talk button and the whole voice loop.
 *
 *   HOLD button ─► record mic ─► LET GO ─► /api/transcribe (words)
 *        ─► OpenRouter (AI + PokéAPI, streams screen) ─► OpenRouter TTS (voice) ─► play!
 *
 * We use "hold to talk", like a walkie-talkie: press and hold while talking,
 * let go when done. It's easy for kids and we know exactly when they finished.
 *
 * FIRST VISIT: browsers ask "Allow microphone?" the first time. If that popup
 * shows up while you're holding the talk button, it's confusing. So we show a
 * separate "Allow microphone" button first. After that, hold-to-talk just works.
 */
import { useEffect, useRef, useState } from "react";
import { splitResponse } from "@/lib/response-format";
import { type CardInfo, ensureCards, setShinyTurn } from "@/lib/ensure-cards";
import { dexChat, fetchDrawing, parseChatLine, speak, transcribe } from "@/lib/api-client";

export type Status = "idle" | "listening" | "thinking" | "speaking" | "error";
export type Turn = { role: "user" | "assistant"; content: string };

type Props = {
  status: Status;
  history: Turn[];
  onStatus: (status: Status, message?: string) => void;
  onTranscript: (text: string) => void;
  onReply: (reply: { speech: string; openui: string; streaming: boolean }) => void;
  onActivity: (activity: string | null) => void;
  onTurnDone: (user: string, assistantSpeech: string) => void;
};

// Recordings shorter than this are probably an accidental tap.
const MIN_RECORDING_MS = 400;


/** sessionStorage key so a refresh in the same visit stays "mic ready". */
const MIC_READY_KEY = "dex-mic-ready";

/**
 * Mic gate states:
 *  checking = still asking the browser if we already have permission
 *  needed   = show the "Allow microphone" button
 *  asking   = the browser popup is open
 *  denied   = the grown-up said no (or it's blocked) — show how to fix it
 *  nomic    = no microphone plugged in
 *  ready    = show hold-to-talk
 */
type MicState = "checking" | "needed" | "asking" | "denied" | "nomic" | "ready";

export function VoiceControls({ status, history, onStatus, onTranscript, onReply, onActivity, onTurnDone }: Props) {
  // useRef = a box that remembers things between renders without redrawing.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const unlockedRef = useRef(false);
  const [mic, setMic] = useState<MicState>("checking");

  // Skip the Allow button only when the browser already granted the mic.
  // Still show it when permission is "prompt" / unknown — that's the awkward first tap.
  // Audio unlock still happens on every hold-to-talk press.
  useEffect(() => {
    let cancelled = false;
    const set = (m: MicState) => {
      if (!cancelled) setMic(m);
    };
    async function check() {
      if (!navigator.mediaDevices?.getUserMedia) return set("nomic");
      try {
        if (sessionStorage.getItem(MIC_READY_KEY) === "1") {
          // Trusted only if Permissions API agrees (or can't answer — Safari).
          try {
            const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
            if (perm.state === "granted") return set("ready");
            if (perm.state === "denied") {
              sessionStorage.removeItem(MIC_READY_KEY);
              return set("denied");
            }
            // "prompt" = browser will ask again — show Allow.
            return set("needed");
          } catch {
            return set("ready"); // Safari: we allowed earlier this session
          }
        }
      } catch {
        // private mode
      }
      try {
        const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (perm.state === "granted") return set("ready");
        if (perm.state === "denied") return set("denied");
        return set("needed");
      } catch {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const granted = devices.some((d) => d.kind === "audioinput" && d.label);
          return set(granted ? "ready" : "needed");
        } catch {
          return set("needed");
        }
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  /** The "Allow microphone" tap: ask once, unlock sound, turn the mic right back off. */
  async function allowMic() {
    setMic("asking");
    // Unlock audio in this same tap so DEX can talk later.
    void unlockAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only wanted permission — stop the mic so the red dot goes away.
      stream.getTracks().forEach((t) => t.stop());
      try {
        sessionStorage.setItem(MIC_READY_KEY, "1");
      } catch {
        // fine
      }
      setMic("ready");
      onStatus("idle", "Mic is on! Hold the red button and ask about a Pokémon.");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setMic(name === "NotFoundError" ? "nomic" : "denied");
    }
  }

  /**
   * Phones only allow sound after a tap — and they can lock again between turns.
   * We keep an AudioContext and resume it on EVERY hold / Allow tap (not just once).
   */
  function getAudioCtx(): AudioContext {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current) audioCtxRef.current = new AC();
    return audioCtxRef.current;
  }

  async function unlockAudio() {
    try {
      const ctx = getAudioCtx();
      if (ctx.state !== "running") await ctx.resume();
      // Tiny silent burst in this same tap — keeps iOS from muting the next TTS.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      unlockedRef.current = true;
    } catch {
      // play() will show a friendly hint if it still fails later.
    }
  }

  // ---------- 1. Recording ----------

  async function startListening() {
    // If DEX is talking, pressing the button interrupts it.
    stopSpeaking();
    if (status === "thinking" || recorderRef.current) return;

    // Must run in this pointer-down turn, before any await to the network.
    void unlockAudio();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        try {
          sessionStorage.removeItem(MIC_READY_KEY);
        } catch {
          // fine
        }
        setMic("denied"); // show the Allow / Try again button instead of a broken talk button
      }
      onStatus(
        "error",
        name === "NotAllowedError"
          ? "DEX can't hear you! Ask a grown-up to allow the microphone (click the 🔒 or 🎤 icon in the address bar)."
          : name === "NotFoundError"
            ? "No microphone found. Plug one in and try again."
            : "The microphone didn't start. Try again?",
      );
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      // Turn the mic off (the browser's red dot goes away).
      stream.getTracks().forEach((t) => t.stop());
      const duration = Date.now() - startedAtRef.current;
      const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      recorderRef.current = null;
      if (duration < MIN_RECORDING_MS) {
        onStatus("idle", "Hold the button down the whole time you talk!");
        return;
      }
      void handleRecording(audio);
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    onStatus("listening");
  }

  function stopListening() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function stopSpeaking() {
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
  }

  // ---------- 2-4. Transcribe → Chat → Speak ----------

  async function handleRecording(audio: Blob) {
    onStatus("thinking", "Hearing you…");
    try {
      // 2. EARS
      const userText: string = await withTimeout((signal) => transcribe(audio, signal), 45000);
      if (!userText) {
        onStatus("idle", "I didn't hear anything. Hold longer and talk a little louder!");
        return;
      }
      onTranscript(userText);
      onStatus("thinking", `Heard: “${userText.slice(0, 60)}${userText.length > 60 ? "…" : ""}” — looking it up…`);

      // 3. BRAIN
      const { speech, openui } = await streamChat([...history, { role: "user", content: userText }]);
      if (!openui && !speech) {
        onStatus("error", "DEX looked things up but sent back a blank answer. Try once more?");
        return;
      }
      onTurnDone(userText, speech || "(no speech line)");

      // 4. MOUTH — only after the screen is ready (avoids racing the chat stream)
      if (speech) {
        onStatus("thinking", "Getting the Pokédex voice…");
        const blob = await fetchSpeech(speech);
        await play(blob);
      } else {
        onStatus("idle", "Screen updated — but DEX forgot to say the SPEECH line.");
      }
    } catch (err) {
      console.error(err);
      onActivity(null);
      onStatus("error", err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await run(ctrl.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("That step took too long. Check your connection and try again.");
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  /** Read the chat event stream line by line and update the screen as text arrives. */
  async function streamChat(messages: Turn[]) {
    // Keep the abort signal alive for the WHOLE stream (not just until headers).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    let text = "";
    const cards: CardInfo[] = [];
    const drawings: Promise<void>[] = [];
    const reader = dexChat(messages, ctrl.signal).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; delta?: string; name?: string; args?: string; message?: string; card?: CardInfo; drawing?: boolean; ticket?: string };
          const parsed = parseChatLine(line);
            if (!parsed) continue;
            event = parsed as typeof event;

          if (event.type === "cards") {
            setShinyTurn(!!(event as { shiny?: boolean }).shiny);
          } else if (event.type === "tool") {
            onActivity(describeTool(event.name ?? "", event.args ?? ""));
          } else if (event.type === "pokemon" && event.card) {
            // A drawing tutorial wins over the official art for the same Pokémon.
            if (event.drawing) {
              cards.unshift(event.card);
              // Start fetching the picture right away (it takes a while).
              if (event.ticket) {
                const card = event.card;
                drawings.push(fetchDrawing(event.ticket).then((url) => { if (url) card.imageUrl = url; }));
              }
            }
            else cards.push(event.card);
          } else if (event.type === "reset") {
            text = "";
          } else if (event.type === "text") {
            onActivity(null);
            text += event.delta ?? "";
            const parts = splitResponse(text);
            onReply({ speech: parts.speech, openui: parts.openui, streaming: true });
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Chat error");
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (drawings.length) {
      onActivity("✏️ Finishing the drawing…");
      await Promise.all(drawings);
    }
    // Drop a drawing card if the picture never arrived.
    for (let i = cards.length - 1; i >= 0; i--) if (cards[i].imageUrl === "DRAWING") cards.splice(i, 1);
    let parts = splitResponse(text);
    // If the model forgot SPEECH/OpenUI but we looked Pokémon up, build a screen anyway.
    if (!parts.openui && cards.length) {
      parts = { ...parts, openui: ensureCards("", cards), speech: parts.speech || `Pokémon detected: ${cards.map((c) => c.name).join(", ")}.` };
    } else {
      parts = { ...parts, openui: ensureCards(parts.openui, cards) };
    }
    if (!parts.speech && parts.openui) {
      parts = { ...parts, speech: "Pokémon data loaded." };
    }
    // Last resort: model returned prose without SPEECH:/root — still talk.
    if (!parts.speech && !parts.openui && text.trim()) {
      const line = text.trim().split("\n").map((l) => l.trim()).find(Boolean) ?? "";
      parts = { speech: line.slice(0, 280), openui: "", speechComplete: true };
    }
    onReply({ speech: parts.speech, openui: parts.openui, streaming: false });
    onActivity(null);
    return { fullText: text, speech: parts.speech, openui: parts.openui };
  }

  async function fetchSpeech(say: string): Promise<Blob | null> {
    try {
      return await withTimeout((signal) => speak(say, signal), 45000);
    } catch (err) {
      console.error("TTS error", err);
      return null;
    }
  }

  async function play(blob: Blob | null) {
    if (!blob || blob.size < 100) {
      onStatus("idle", "Screen is ready, but the Pokédex voice didn't play. Try once more.");
      return;
    }
    onStatus("speaking");
    stopSpeaking();

    // Prefer Web Audio — more reliable on phones after the hold gesture.
    try {
      const ctx = getAudioCtx();
      if (ctx.state !== "running") await ctx.resume();
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ctx.destination);
      sourceRef.current = source;
      await new Promise<void>((resolve, reject) => {
        source.onended = () => resolve();
        try {
          source.start(0);
        } catch (err) {
          reject(err);
        }
      });
      if (sourceRef.current === source) sourceRef.current = null;
      onStatus("idle");
      return;
    } catch (err) {
      console.warn("Web Audio play failed, trying HTMLAudioElement", err);
    }

    // Fallback: classic <audio> element.
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    const finish = () => {
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) {
        audioRef.current = null;
        onStatus("idle");
      }
    };
    audio.onended = finish;
    audio.onerror = () => {
      finish();
      onStatus("idle", "Voice file wouldn't play. Try again?");
    };
    try {
      await audio.play();
    } catch {
      unlockedRef.current = false;
      onStatus("idle", "Hold the red button once so the browser lets DEX talk, then ask again.");
    }
  }

  // ---------- The button ----------

  const label = {
    idle: "Hold to talk",
    error: "Hold to talk",
    listening: "Listening… let go when done",
    thinking: "Thinking…",
    speaking: "Talking… (press to interrupt)",
  }[status];

  // ---------- The mic gate (before hold-to-talk) ----------
  if (mic !== "ready") {
    const busy = mic === "checking" || mic === "asking";
    const gateLabel =
      mic === "checking"
        ? "Checking the mic…"
        : mic === "asking"
          ? "Tap “Allow” in the popup…"
          : mic === "denied" || mic === "nomic"
            ? "Try again"
            : "Allow microphone";
    const help =
      mic === "denied"
        ? "The mic is blocked. Grown-up: tap the 🔒 or 🎤 icon in the address bar, set Microphone to Allow, then tap Try again."
        : mic === "nomic"
          ? "No microphone found. Plug one in (or use a phone/laptop with a mic), then tap Try again."
          : "DEX needs the mic once, then you can hold to talk.";
    return (
      <div className="mx-auto flex w-full max-w-xs flex-col items-center justify-center gap-2 self-center text-center">
        <button
          type="button"
          onClick={() => void allowMic()}
          disabled={busy}
          aria-label={gateLabel}
          className="talk-button"
        >
          <MicIcon />
        </button>
        <div className="text-lg font-bold text-white drop-shadow">{gateLabel}</div>
        <div className="text-sm text-white/90 drop-shadow">{help}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        disabled={status === "thinking"}
        // Pointer events work for mouse, finger, and pen.
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId); // keep listening even if the finger slides off
          void startListening();
        }}
        onPointerUp={stopListening}
        onPointerCancel={stopListening}
        onContextMenu={(e) => e.preventDefault()} // long-press on phones shouldn't open a menu
        className={`talk-button ${status === "listening" ? "talk-button-on" : ""}`}
      >
        <MicIcon />
      </button>
      <div className="text-lg font-bold text-white drop-shadow">{label}</div>
    </div>
  );
}

/** Turn a tool call into a little message for the screen. */
function describeTool(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson || "{}");
    if (name === "lookup_pokemon") return `🔎 Looking up ${args.nameOrId}…`;
    if (name === "draw_pokemon_tutorial") return `✏️ Drawing a how-to for ${args.nameOrId}…`;
    if (name === "compare_types") return `⚔️ Checking ${args.attacker} vs ${args.defender}…`;
  } catch {
    // The arguments weren't valid JSON — that's fine, show a generic message.
  }
  return "🔎 Searching the Pokédex…";
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  );
}
