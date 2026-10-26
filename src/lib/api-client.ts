/**
 * api-client.ts — glue between the screen and src/core.
 * dexChat() runs the chat loop in this browser and hands back a stream of JSON lines.
 */
import { runChat, type Turn } from "@/core/chat";
export { fetchDrawing } from "@/core/draw";
export { speak, transcribe } from "@/core/voice";

export function dexChat(messages: Turn[], signal?: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (e: Record<string, unknown>) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runChat(messages, emit, signal);
      } catch (err) {
        console.error("chat failed", err);
        emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong. Try again." });
      } finally {
        controller.close();
      }
    },
  });
}

export function parseChatLine(line: string): { type: string; [k: string]: unknown } | null {
  const t = line.trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}
