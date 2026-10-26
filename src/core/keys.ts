/**
 * keys.ts — the visitor's own OpenRouter key (BYOK).
 * Default: sessionStorage (gone when the tab closes). "Remember me" uses localStorage.
 * The key is only ever sent to openrouter.ai.
 */
const KEY = "dex-openrouter-key";
const VERIFIER = "dex-pkce-verifier";
const REMEMBER = "dex-remember";
export const KEY_PATTERN = /^sk-or-[A-Za-z0-9_-]{10,200}$/;

export const getUserKey = () => sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
export function saveUserKey(k: string, remember: boolean) {
  forgetUserKey();
  (remember ? localStorage : sessionStorage).setItem(KEY, k.trim());
}
export function forgetUserKey() {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** OAuth PKCE step 1: go to OpenRouter to approve a key for this app. */
export async function startOpenRouterSignIn(remember: boolean) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(REMEMBER, remember ? "1" : "");
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const callback = window.location.origin + window.location.pathname;
  window.location.href =
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&key_label=DEX%20Pok%C3%A9dex`;
}

/** OAuth PKCE step 2: back with ?code=… → exchange it for a key, directly with OpenRouter. */
export async function finishOpenRouterSignIn(): Promise<"none" | "ok" | "failed"> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return "none";
  url.searchParams.delete("code");
  history.replaceState(null, "", url.toString());
  const verifier = sessionStorage.getItem(VERIFIER);
  const remember = sessionStorage.getItem(REMEMBER) === "1";
  sessionStorage.removeItem(VERIFIER);
  sessionStorage.removeItem(REMEMBER);
  if (!verifier) return "failed";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    const { key } = (await res.json()) as { key?: string };
    if (!res.ok || !key) return "failed";
    saveUserKey(key, remember);
    return "ok";
  } catch {
    return "failed";
  }
}

/** Private deploys: optional password, opened once as ?key=… and kept in this browser. */
export function captureAccessPassword() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("key");
  if (fromUrl) {
    localStorage.setItem("dex-access", fromUrl);
    url.searchParams.delete("key");
    history.replaceState(null, "", url.toString());
  }
}
export const getAccessPassword = () => localStorage.getItem("dex-access") ?? "";
