/**
 * worker/index.ts — OPTIONAL server-key proxy for private deploys (family, classroom).
 *
 * The public BYOK version needs no Worker at all. Use this only with
 * wrangler.private.jsonc and a build made with VITE_SERVER_PROXY=1.
 *
 * It forwards four OpenRouter endpoints, adds this deploy's OPENROUTER_API_KEY, and
 * pipes the answer back untouched (almost no CPU). Guards:
 *   - ACCESS_PASSWORD secret (required): the page sends it as x-dex-key
 *   - per-IP rate limit (RATE_LIMITER binding)
 *   - only the configured models, capped max_tokens, capped body size
 */
interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY: string;
  ACCESS_PASSWORD?: string;
  ALLOWED_MODELS?: string;
  APP_URL?: string;
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const ROUTES: Record<string, number> = {
  "chat/completions": 64_000,
  "audio/speech": 4_000,
  "audio/transcriptions": 2_800_000,
  images: 4_000,
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const route = pathname.slice("/api/or/".length);
    const max = pathname.startsWith("/api/or/") ? ROUTES[route] : undefined;
    if (!max) return json({ error: "Not found." }, 404);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    if (!env.OPENROUTER_API_KEY) return json({ error: "This deploy has no OPENROUTER_API_KEY secret." }, 500);
    if (!(await passwordOk(request.headers.get("x-dex-key"), env.ACCESS_PASSWORD))) {
      return json({ error: "This app needs the access password." }, 403);
    }
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
      if (!success) return json({ error: "Too many requests. Wait a minute and try again." }, 429);
    }
    const raw = await readCapped(request, max);
    if (raw === null) return json({ error: "Request too large." }, 413);

    // The browser client sends JSON for every route, including transcriptions
    // (base64 input_audio). Parse, allowlist the single model field, and forward
    // the parsed object so a duplicate "model" key cannot slip through.
    const allowed = (env.ALLOWED_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); } catch { return json({ error: "Bad JSON." }, 400); }
    if (!allowed.includes(String(parsed.model))) return json({ error: "Model not allowed." }, 400);
    if (route === "chat/completions") {
      parsed.max_tokens = Math.min(Number(parsed.max_tokens) || 1200, 1200);
      if (!Array.isArray(parsed.messages) || parsed.messages.length > 20) return json({ error: "Bad messages." }, 400);
    }
    if (route === "images") parsed.n = 1;
    if (route === "audio/speech" && String(parsed.input ?? "").length > 400) return json({ error: "Too much text." }, 413);
    const body = JSON.stringify(parsed);

    const upstream = await fetch(`https://openrouter.ai/api/v1/${route}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.APP_URL || new URL(request.url).origin,
        "X-Title": "DEX Pokédex (OpenRouter example)",
      },
      body,
    });
    if (!upstream.ok) {
      console.error("OpenRouter", route, upstream.status, (await upstream.text()).slice(0, 300)); // logs only
      return json({ error: `The AI service returned ${upstream.status}.` }, upstream.status === 429 ? 429 : 502);
    }
    // Pipe the answer straight through (streams, audio and image JSON) without reading it.
    return new Response(upstream.body, {
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream", "Cache-Control": "no-store" },
    });
  },
} satisfies ExportedHandler<Env>;

/** Compare SHA-256 hashes with a constant-time XOR. Fail closed if the password is unset. */
async function passwordOk(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided ?? "")),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Read the body but stop once it's over `max` bytes (Content-Length can be missing or wrong). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { all.set(p, off); off += p.byteLength; }
  return new TextDecoder().decode(all);
}
