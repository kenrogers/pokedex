/**
 * chat.ts — the chat loop, run in the browser.
 *
 *   ask the model (with tools) → run the tools it asks for → ask again → stream the answer
 *
 * It returns a stream of small JSON lines ("events") that the screen reads:
 *   {type:"cards"} {type:"tool"} {type:"pokemon"} {type:"text"} {type:"error"}
 */
import { CAPS, MODELS } from "./config";
import { openRouter } from "./openrouter";
import { SYSTEM_PROMPT } from "./system-prompt";
import { runTool, TOOL_DEFINITIONS } from "./tools";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type Turn = { role: "user" | "assistant"; content: string };
export type DexEvent = { type: string; [k: string]: unknown };

function cleanHistory(raw: Turn[]): ChatMessage[] {
  return raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-CAPS.historyMessages)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

const body = (messages: ChatMessage[], withTools: boolean, stream: boolean) =>
  JSON.stringify({
    model: MODELS.chat,
    ...(withTools ? { tools: TOOL_DEFINITIONS, parallel_tool_calls: true } : {}),
    stream,
    temperature: 0.4,
    max_tokens: CAPS.maxTokens,
    reasoning: { exclude: true },
    messages,
  });

/** Run one question. Calls `emit` for every event, in order. */
export async function runChat(history: Turn[], emit: (e: DexEvent) => void, signal?: AbortSignal) {
  const turns = cleanHistory(history);
  if (!turns.length) throw new Error("Say something first.");
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...turns];
  // Backup: if the latest words say "shiny", force shiny art even if the AI forgets.
  const lastUser = [...turns].reverse().find((m) => m.role === "user");
  const wantsShiny = /\bshin(y|ies)\b/i.test(String(lastUser?.content ?? ""));
  emit({ type: "cards", shiny: wantsShiny });

  let answered = false;
  let drawings = 0;
  for (let round = 0; round < CAPS.maxRounds && !answered; round++) {
    // Round 0 usually asks for tools, so it isn't streamed. Later rounds stream the answer.
    const r = round === 0 ? await quietRound(messages, signal) : await streamRound(messages, true, emit, signal);
    if (r.text) { if (round === 0) emit({ type: "text", delta: r.text }); answered = true; break; }
    if (!r.toolCalls.length) break;
    const calls = r.toolCalls.slice(0, CAPS.maxToolsPerRound);
    messages.push({ role: "assistant", content: null, tool_calls: calls });
    const results = await Promise.all(calls.map(async (call) => {
      const name = call.function.name;
      emit({ type: "tool", name, args: call.function.arguments });
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* tool reports the error */ }
      if (name === "lookup_pokemon" && wantsShiny) args.shiny = true;
      if (name === "draw_pokemon_tutorial" && ++drawings > CAPS.maxDrawingsPerQuestion) {
        return { call, result: { error: "Already drawing one picture for this question. Use that one." } };
      }
      return { call, result: await runTool(name, args) };
    }));
    for (const { call, result } of results) {
      const r2 = result as Record<string, unknown> & { id?: number; name?: string; types?: string[]; imageUrl?: string; genus?: string; ticket?: string };
      if (!r2.error && r2.id) {
        if (call.function.name === "lookup_pokemon") {
          emit({ type: "pokemon", card: { name: r2.name, number: r2.id, imageUrl: r2.imageUrl, types: r2.types, genus: r2.genus ?? "" } });
        } else if (call.function.name === "draw_pokemon_tutorial" && r2.ticket) {
          emit({ type: "pokemon", drawing: true, ticket: r2.ticket, card: { name: r2.name, number: r2.id, imageUrl: "DRAWING", types: r2.types, genus: "How to draw" } });
        }
      }
      const { ticket: _t, ...forModel } = r2;
      void _t;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(forModel) });
    }
  }
  if (!answered) {
    messages.push({ role: "user", content: "Now answer using the tool results. Start with SPEECH: then OpenUI Lang. Include a PokemonCard for every Pokémon you name." });
    const r = await streamRound(messages, false, emit, signal);
    answered = !!r.text;
  }
  if (!answered) emit({ type: "error", message: "DEX looked things up but didn't answer. Try once more." });
}

async function quietRound(messages: ChatMessage[], signal?: AbortSignal) {
  const res = await openRouter("chat/completions", body(messages, true, false), signal);
  if (!res.ok) throw new Error(`The AI request failed (${res.status}).`);
  const data = (await res.json()) as { error?: { message?: string }; choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  if (data.error) throw new Error("The AI request failed.");
  const msg = data.choices?.[0]?.message;
  const toolCalls = (msg?.tool_calls ?? []).filter((c) => c?.function?.name);
  return { toolCalls, text: toolCalls.length ? "" : (msg?.content ?? "") };
}

/** Streamed round: forwards answer text as it arrives and collects any tool calls. */
async function streamRound(messages: ChatMessage[], withTools: boolean, emit: (e: DexEvent) => void, signal?: AbortSignal) {
  const res = await openRouter("chat/completions", body(messages, withTools, true), signal);
  if (!res.ok || !res.body) throw new Error(`The AI request failed (${res.status}).`);
  const toolCalls: ToolCall[] = [];
  let text = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: { error?: unknown; choices?: { delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) throw new Error("The AI stream failed.");
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) { text += delta.content; emit({ type: "text", delta: delta.content }); }
      for (const piece of delta?.tool_calls ?? []) {
        const i = piece.index ?? 0;
        toolCalls[i] ??= { id: "", type: "function", function: { name: "", arguments: "" } };
        if (piece.id) toolCalls[i].id = piece.id;
        if (piece.function?.name) toolCalls[i].function.name += piece.function.name;
        if (piece.function?.arguments) toolCalls[i].function.arguments += piece.function.arguments;
      }
    }
  }
  return { text, toolCalls: text ? [] : toolCalls.filter(Boolean) };
}
