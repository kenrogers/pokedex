
/**
 * GeneratedScreen — the Pokédex's display.
 *
 * It takes the OpenUI Lang text the AI wrote and hands it to OpenUI's <Renderer>,
 * which turns it into real components from our library (openui-library.tsx).
 * Because the text arrives a little at a time, the Renderer redraws as it grows:
 * that's why the screen "builds itself" while DEX is thinking.
 */
import { Renderer } from "@openuidev/react-lang";
import { pokedexLibrary } from "@/lib/openui-library";

type Props = {
  openui: string;
  isStreaming: boolean;
  /** e.g. "Looking up pikachu…" while a tool is running. */
  activity: string | null;
};

export function GeneratedScreen({ openui, isStreaming, activity }: Props) {
  return (
    // The outer box holds the glow + the "Looking up…" bubble (so the bubble
    // doesn't scroll away). The inner .pokedex-scroll is the ONLY thing that scrolls.
    <div className="pokedex-screen relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pokedex-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2.5 sm:p-3">
      {openui ? (
        <Renderer
          response={openui}
          library={pokedexLibrary}
          isStreaming={isStreaming}
          // Keep everything local — no telemetry from a kid's app.
          publishObservability={false}
          onError={(errors) => {
            if (errors.length) console.warn("OpenUI errors:", errors);
          }}
        />
      ) : (
        <WelcomeScreen />
      )}
      </div>

      {activity && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1 text-base text-lime-200 animate-pulse">
          {activity}
        </div>
      )}
    </div>
  );
}

/** What the screen shows before the first question. */
function WelcomeScreen() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
      <div className="pokeball" aria-hidden />
      <div className="text-2xl font-black sm:text-3xl">Hi! I&apos;m DEX!</div>
      <div className="text-lg sm:text-xl">Hold the red button and ask me about any Pokémon.</div>
      <div className="text-base opacity-80">
        Try: &ldquo;Who is Pikachu?&rdquo; &bull; &ldquo;Is fire good against grass?&rdquo; &bull; &ldquo;How does Eevee evolve?&rdquo;
      </div>
    </div>
  );
}
