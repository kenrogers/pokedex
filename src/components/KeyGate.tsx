/**
 * KeyGate.tsx — "Sign in with OpenRouter" screen (BYOK).
 * Shown unless this is a private deploy built with VITE_SERVER_PROXY. The key is kept in this
 * browser (this tab only, unless "Remember me" is ticked) and sent only to openrouter.ai.
 */
import { useEffect, useState } from "react";
import { SERVER_PROXY } from "@/core/config";
import { finishOpenRouterSignIn, getUserKey, KEY_PATTERN, saveUserKey, startOpenRouterSignIn } from "@/core/keys";

export function KeyGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "need" | "ready">("checking");
  const [paste, setPaste] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    (async () => {
      const back = await finishOpenRouterSignIn();
      if (back === "failed") setNote("Sign-in didn't finish. Try again.");
      if (SERVER_PROXY || getUserKey()) setState("ready");
      else setState("need");
    })();
    // If OpenRouter ever rejects the key, show this screen again.
    const onNeed = () => setState("need");
    window.addEventListener("dex-needs-key", onNeed);
    return () => window.removeEventListener("dex-needs-key", onNeed);
  }, []);

  if (state === "ready") return <>{children}</>;
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-red-600 p-6 text-center text-white">
      <div className="text-6xl" aria-hidden>🔴</div>
      <h1 className="text-3xl font-black">Connect your OpenRouter account</h1>
      {state === "checking" ? (
        <p className="text-lg">Checking…</p>
      ) : (
        <>
          <p className="max-w-xs text-lg">DEX uses your own OpenRouter API key to pay for AI requests. Sign in with OpenRouter, or paste a key you already have. Your key stays in this browser.</p>
          <button
            type="button"
            onClick={() => startOpenRouterSignIn(remember)}
            className="rounded-full bg-yellow-300 px-8 py-4 text-2xl font-black text-black shadow-lg active:scale-95"
          >
            Sign in with OpenRouter
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>
          {note && <p className="rounded-lg bg-black/40 px-3 py-1">{note}</p>}
          {!paste ? (
            <button type="button" onClick={() => setPaste(true)} className="text-sm underline opacity-80">
              I already have a key
            </button>
          ) : (
            <form
              className="flex w-full max-w-xs flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!KEY_PATTERN.test(draft.trim())) return setNote("That doesn't look like an OpenRouter key (sk-or-…).");
                saveUserKey(draft, remember);
                setState("ready");
              }}
            >
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-or-…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="rounded-lg px-3 py-2 text-black"
              />
              <button type="submit" className="rounded-lg bg-black/50 py-2 font-bold">Use this key</button>
            </form>
          )}
          <p className="max-w-xs text-xs opacity-75">Your key is kept only in this browser (until you close the tab, unless you tick Remember me) and is sent only to openrouter.ai. Use a key with a credit limit.</p>
        </>
      )}
    </main>
  );
}
