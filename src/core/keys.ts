/**
 * keys.ts — the visitor's own OpenRouter key (BYOK).
 * Default: sessionStorage (gone when the tab closes). "Remember me" uses localStorage.
 * The key is only ever sent to openrouter.ai.
 */
import { KEY_EXPIRATION, KEY_LIMIT_USD } from "./config";

const KEY = "dex-openrouter-key";
const VERIFIER = "dex-pkce-verifier";
const REMEMBER = "dex-remember";
const STATE = "dex-pkce-state";
const ACCESS = "dex-access";

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
  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(STATE, state);
  sessionStorage.setItem(REMEMBER, remember ? "1" : "");
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const callback = window.location.origin + window.location.pathname;
  window.location.href =
    `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256` +
    `&key_label=${encodeURIComponent("DEX Pokédex")}` +
    `&limit=${encodeURIComponent(String(KEY_LIMIT_USD))}` +
    `&expiration=${encodeURIComponent(KEY_EXPIRATION)}` +
    `&state=${encodeURIComponent(state)}`;
}

/** OAuth PKCE step 2: back with ?code=… → exchange it for a key, directly with OpenRouter. */
export async function finishOpenRouterSignIn(): Promise<"none" | "ok" | "failed"> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code) return "none";
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState(null, "", url.toString());
  const verifier = sessionStorage.getItem(VERIFIER);
  const expectedState = sessionStorage.getItem(STATE);
  const remember = sessionStorage.getItem(REMEMBER) === "1";
  sessionStorage.removeItem(VERIFIER);
  sessionStorage.removeItem(STATE);
  sessionStorage.removeItem(REMEMBER);
  if (!verifier || !expectedState || !returnedState || returnedState !== expectedState) return "failed";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    const { key } = (await res.json()) as { key?: string };
    if (!res.ok || !key || !KEY_PATTERN.test(key)) return "failed";
    saveUserKey(key, remember);
    return "ok";
  } catch {
    return "failed";
  }
}

/** Private deploys: password kept in memory, or in localStorage only if the user ticks "Remember". */
let accessMemory = "";

export const getAccessPassword = () =>
  accessMemory || sessionStorage.getItem(ACCESS) || localStorage.getItem(ACCESS) || "";

export function saveAccessPassword(password: string, remember: boolean) {
  forgetAccessPassword();
  const v = password.trim();
  if (!v) return;
  accessMemory = v;
  if (remember) localStorage.setItem(ACCESS, v);
}

export function forgetAccessPassword() {
  accessMemory = "";
  sessionStorage.removeItem(ACCESS);
  localStorage.removeItem(ACCESS);
}

/** Clears the OpenRouter key and the private-deploy password from this browser. */
export function forgetSavedSignIn() {
  forgetUserKey();
  forgetAccessPassword();
  window.dispatchEvent(new Event("dex-needs-key"));
  window.dispatchEvent(new Event("dex-needs-access"));
}
