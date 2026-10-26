/**
 * config.ts — models and limits. Change models with VITE_* variables at build time
 * (see .env.example) or edit the defaults here.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const MODELS = {
  chat: env.VITE_CHAT_MODEL || "openai/gpt-6-luna",
  stt: env.VITE_STT_MODEL || "openai/whisper-large-v3",
  tts: env.VITE_TTS_MODEL || "elevenlabs/eleven-v4-turbo",
  voice: env.VITE_TTS_VOICE || "george",
  image: env.VITE_IMAGE_MODEL || "google/gemini-nano-banana-2.1",
};

/** Spending caps. In BYOK mode they protect the visitor's own credits; the proxy enforces its own copy. */
export const CAPS = {
  maxRounds: 3,
  maxToolsPerRound: 4,
  maxDrawingsPerQuestion: 1,
  maxTokens: 1200,
  historyMessages: 6,
  speechChars: 300,
};

/** When set at build time, the page talks to this deploy's own /api/or proxy (server key) instead of OpenRouter. */
export const SERVER_PROXY = !!env.VITE_SERVER_PROXY && env.VITE_SERVER_PROXY !== "false";

export const OPENROUTER_DIRECT = "https://openrouter.ai/api/v1";
export const APP_TITLE = "DEX Pokédex (OpenRouter example)";
