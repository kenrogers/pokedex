/** voice.ts — speech-to-text and text-to-speech, via OpenRouter. */
import { CAPS, MODELS } from "./config";
import { openRouter } from "./openrouter";

/** "audio/webm;codecs=opus" → "webm" (the format name OpenRouter wants). */
export function audioFormat(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  if (audio.size > 2_000_000) throw new Error("That recording is too long.");
  const data = await blobToBase64(audio);
  const res = await openRouter(
    "audio/transcriptions",
    JSON.stringify({ model: MODELS.stt, language: "en", input_audio: { format: audioFormat(audio.type || ""), data } }),
    signal,
  );
  if (!res.ok) throw new Error(`Speech-to-text failed (${res.status}).`);
  return (((await res.json()) as { text?: string }).text ?? "").trim();
}

export async function speak(text: string, signal?: AbortSignal): Promise<Blob | null> {
  const res = await openRouter(
    "audio/speech",
    JSON.stringify({ model: MODELS.tts, voice: MODELS.voice, input: text.slice(0, CAPS.speechChars), response_format: "mp3" }),
    signal,
  );
  if (!res.ok) return null;
  return await res.blob();
}
