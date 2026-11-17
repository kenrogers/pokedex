/**
 * openrouter.ts — every OpenRouter call goes through here.
 * BYOK (default): straight from the browser to openrouter.ai with the visitor's key.
 * Private deploy (VITE_SERVER_PROXY): to this site's /api/or/* Worker, which adds the server key.
 */
import { APP_TITLE, OPENROUTER_DIRECT, SERVER_PROXY } from "./config";
import { forgetAccessPassword, forgetUserKey, getAccessPassword, getUserKey } from "./keys";

export class NeedsKeyError extends Error {}

export async function openRouter(path: string, body: string, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": window.location.origin,
    "X-Title": APP_TITLE,
  };
  let base = OPENROUTER_DIRECT;
  if (SERVER_PROXY) {
    base = "/api/or";
    const pw = getAccessPassword();
    if (pw) headers["x-dex-key"] = pw;
  } else {
    const key = getUserKey();
    if (!key) throw new NeedsKeyError("Connect your OpenRouter account first.");
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(`${base}/${path}`, { method: "POST", headers, body, signal });
  if (res.status === 401 && !SERVER_PROXY) {
    forgetUserKey();
    window.dispatchEvent(new Event("dex-needs-key"));
    throw new NeedsKeyError("Your OpenRouter key was not accepted. Connect again.");
  }
  if (res.status === 403 && SERVER_PROXY) {
    forgetAccessPassword();
    window.dispatchEvent(new Event("dex-needs-access"));
    throw new Error("The access password was not accepted. Try again.");
  }
  if (res.status === 402) throw new Error("This OpenRouter account is out of credits.");
  if (res.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
  return res;
}
