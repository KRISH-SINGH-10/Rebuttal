// Provider-neutral shape of one agent conversation, so the investigation loop in
// agent.ts runs the same way on Gemini (default) or Claude.

import type { ToolDef } from "../paypal/gateway";

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { id: string; name: string; content: string; isError?: boolean };

export type ModelTurn = {
  calls: ToolCall[];
  stop: "tool_use" | "end" | "refusal" | "max_tokens";
  // The provider's own message, sent back verbatim on the next turn (Gemini needs its
  // thought signatures returned untouched, Claude its thinking blocks).
  raw: unknown;
};

export type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; turn: ModelTurn }
  | { role: "tool"; results: ToolResult[] };

export interface AgentModel {
  provider: "gemini" | "claude";
  model: string;
  next(req: { system: string; tools: ToolDef[]; history: ChatEntry[] }): Promise<ModelTurn>;
}
