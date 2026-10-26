/**
 * PokedexFrame — the red plastic "device" around the screen.
 * Pure decoration: blinking lights on top, the screen in the middle, controls at the bottom.
 */
import type { ReactNode } from "react";

type Props = {
  /** Which light is on tells you what DEX is doing. */
  status: "idle" | "listening" | "thinking" | "speaking" | "error";
  screen: ReactNode;
  controls: ReactNode;
};

export function PokedexFrame({ status, screen, controls }: Props) {
  return (
    <div className="pokedex-device mx-auto flex h-[100dvh] max-w-3xl flex-col gap-2 overflow-hidden p-3 sm:my-4 sm:h-[calc(100dvh-2rem)] sm:gap-3 sm:rounded-3xl sm:p-4">
      {/* Top: the big blue "lens" and the three little lights */}
      <div className="flex shrink-0 items-center gap-3">
        <div className={`lens ${status === "speaking" ? "lens-on" : ""}`} aria-hidden />
        <div className={`light bg-red-500 ${status === "listening" ? "light-on" : ""}`} title="Listening" />
        <div className={`light bg-yellow-400 ${status === "thinking" ? "light-on" : ""}`} title="Thinking" />
        <div className={`light bg-green-500 ${status === "speaking" ? "light-on" : ""}`} title="Speaking" />
        <div className="ml-auto text-sm font-bold tracking-widest text-red-100/80">POKÉDEX</div>
      </div>

      {/* Middle: the screen */}
      <div className="screen-bezel flex min-h-0 flex-1 flex-col overflow-hidden">{screen}</div>

      {/* Bottom: the talk button */}
      <div className="shrink-0">{controls}</div>
    </div>
  );
}
