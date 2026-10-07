// Claude adapter, kept as an alternative to Gemini (AI_PROVIDER=claude).

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AgentModel, ChatEntry, ToolCall } from "./types";

export const CLAUDE_MODEL = "claude-opus-5-5";

export type MessagesClient = Pick<Anthropic["beta"]["messages"], "create">;

export function claudeModel(opts: { client?: MessagesClient } = {}): AgentModel {
  let client = opts.client;
  return {
    provider: "claude",
    model: CLAUDE_MODEL,
    async next({ system, tools, history }) {
      // APP_ANTHROPIC_API_KEY keeps the app's key separate from any ANTHROPIC_API_KEY that
      // developer tooling in the same environment might pick up.
      client ??= new Anthropic({ apiKey: process.env.APP_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY }).beta.messages;
      const res = await client.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, ...(t.strict ? { strict: true } : {}) })),
        messages: toMessages(history),
      });
      const calls: ToolCall[] = res.content
        .filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
      const stop = res.stop_reason === "refusal" ? "refusal" : res.stop_reason === "max_tokens" ? "max_tokens" : calls.length ? "tool_use" : "end";
      return { calls, stop, raw: res.content };
    },
  };
}

function toMessages(history: ChatEntry[]): BetaMessageParam[] {
  return history.map((e): BetaMessageParam => {
    if (e.role === "user") return { role: "user", content: e.text };
    if (e.role === "assistant") return { role: "assistant", content: e.turn.raw as BetaContentBlock[] };
    return {
      role: "user",
      content: e.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
    };
  });
}
