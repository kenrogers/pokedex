/**
 * KeyGate.tsx — sign-in screen (BYOK) or access-password screen (private deploy).
 * Shown unless a key or password is already available. Keys stay in this browser
 * and are sent only to openrouter.ai.
 */
import { useEffect, useState } from "react";
import { SERVER_PROXY } from "@/core/config";
import {
  finishOpenRouterSignIn,
  getAccessPassword,
  getUserKey,
  KEY_PATTERN,
  saveAccessPassword,
  saveUserKey,
  startOpenRouterSignIn,
} from "@/core/keys";

export function KeyGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "need" | "need-password" | "ready">("checking");
  const [paste, setPaste] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  function goReadyOrNeed() {
    // /?demo=1 is a sample screen for lessons and does not need a key.
    if (new URLSearchParams(window.location.search).has("demo")) {
      setState("ready");
      return;
    }
    if (SERVER_PROXY) setState(getAccessPassword() ? "ready" : "need-password");
    else setState(getUserKey() ? "ready" : "need");
  }

  useEffect(() => {
    (async () => {
      const back = await finishOpenRouterSignIn();
      if (back === "failed") setNote("Sign-in didn't finish. Try again.");
      goReadyOrNeed();
    })();
    const onNeed = () => { if (!SERVER_PROXY) setState("need"); };
    const onNeedAccess = () => { if (SERVER_PROXY) setState("need-password"); };
    window.addEventListener("dex-needs-key", onNeed);
    window.addEventListener("dex-needs-access", onNeedAccess);
    return () => {
      window.removeEventListener("dex-needs-key", onNeed);
      window.removeEventListener("dex-needs-access", onNeedAccess);
    };
  }, []);

  if (state === "ready") return <>{children}</>;

  if (state === "need-password") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-red-600 p-6 text-center text-white">
        <div className="text-6xl" aria-hidden>🔴</div>
        <h1 className="text-3xl font-black">Enter the access password</h1>
        <p className="max-w-xs text-lg">This private DEX uses a password so only people you share it with can use it.</p>
        {note && <p className="rounded-lg bg-black/40 px-3 py-1">{note}</p>}
        <form
          className="flex w-full max-w-xs flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const pw = draft.trim();
            if (!pw) return setNote("Enter the access password.");
            saveAccessPassword(pw, remember);
            setDraft("");
            setState("ready");
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Access password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="rounded-lg px-3 py-2 text-black"
          />
          <label className="flex items-center gap-2 text-sm text-left">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this password on this device
          </label>
          <button type="submit" className="rounded-full bg-yellow-300 px-8 py-3 text-xl font-black text-black shadow-lg active:scale-95">
            Continue
          </button>
        </form>
        <p className="max-w-xs text-xs opacity-75">The password is stored on this device only if you tick the box. Use Forget password on the main screen to remove it.</p>
      </main>
    );
  }

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
          <p className="max-w-xs text-xs opacity-75">Your key is kept only in this browser (until you close the tab, unless you tick Remember me) and is sent only to openrouter.ai. On the next screen, you can adjust the spending cap and expiry for the key (this app suggests $5 and 30 days). Voice recordings and questions are sent to OpenRouter to transcribe, answer and speak. There is no analytics in this app. Use Forget key on the main screen to remove a saved key.</p>
        </>
      )}
    </main>
  );
}
