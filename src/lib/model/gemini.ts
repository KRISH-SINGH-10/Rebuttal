// Gemini adapter (default model). Uses the free tier of the Gemini API through the
// official @google/genai SDK, with function calling over the same JSON schemas the
// PayPal Agent Toolkit publishes.

import { GoogleGenAI, type Content, type GenerateContentResponse, type Part } from "@google/genai";
import type { ToolDef } from "../paypal/gateway";
import type { AgentModel, ChatEntry, ModelTurn, ToolCall } from "./types";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type GenerateClient = { models: { generateContent(params: any): Promise<GenerateContentResponse> } };

export function geminiModel(opts: { apiKey?: string; model?: string; client?: GenerateClient; retryDelaysMs?: number[] } = {}): AgentModel {
  const model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  let client = opts.client;
  const delays = opts.retryDelaysMs ?? [2_000, 5_000, 12_000, 25_000];
  let seq = 0;

  return {
    provider: "gemini",
    model,
    async next({ system, tools, history }) {
      client ??= new GoogleGenAI({ apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY });
      const params = {
        model,
        contents: toContents(history),
        config: {
          systemInstruction: system,
          temperature: 0.2,
          maxOutputTokens: 8192,
          tools: [{ functionDeclarations: tools.map(toDeclaration) }],
        },
      };
      const res = await withRetry(() => client!.models.generateContent(params), delays);
      return fromResponse(res, () => `gen_${++seq}`);
    },
  };
}

function toDeclaration(t: ToolDef) {
  return { name: t.name, description: t.description, parametersJsonSchema: t.input_schema };
}

export function toContents(history: ChatEntry[]): Content[] {
  return history.map((e): Content => {
    if (e.role === "user") return { role: "user", parts: [{ text: e.text }] };
    if (e.role === "assistant") return e.turn.raw as Content;
    return {
      role: "user",
      parts: e.results.map((r): Part => {
        let value: unknown = r.content;
        try {
          value = JSON.parse(r.content);
        } catch {
          // plain text result
        }
        return {
          functionResponse: {
            ...(r.id.startsWith("gen_") ? {} : { id: r.id }),
            name: r.name,
            response: r.isError ? { error: value } : { output: value },
          },
        };
      }),
    };
  });
}

export function fromResponse(res: GenerateContentResponse, newId: () => string): ModelTurn {
  if (res.promptFeedback?.blockReason) return { calls: [], stop: "refusal", raw: { role: "model", parts: [{ text: "" }] } };
  const cand = res.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const raw: Content = parts.length ? { role: "model", parts } : { role: "model", parts: [{ text: "(no output)" }] };
  const calls: ToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({ id: p.functionCall!.id ?? newId(), name: p.functionCall!.name!, input: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
  const reason = String(cand?.finishReason ?? "STOP");
  if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(reason)) return { calls: [], stop: "refusal", raw };
  if (reason === "MAX_TOKENS" && calls.length === 0) return { calls: [], stop: "max_tokens", raw };
  return { calls, stop: calls.length ? "tool_use" : "end", raw };
}

// The free tier allows only a few requests per minute, so back off on 429 and on
// transient 5xx errors, honouring the server's suggested retry delay when it gives one.
export async function withRetry<T>(fn: () => Promise<T>, delays: number[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt >= delays.length) {
        if (status === 429) throw new RateLimitError(e instanceof Error ? e.message : String(e));
        throw e;
      }
      const hinted = /"retryDelay":\s*"(\d+)s"/.exec(e instanceof Error ? e.message : "")?.[1];
      const wait = hinted ? Math.min(Number(hinted) * 1000, 60_000) : delays[attempt];
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export class RateLimitError extends Error {
  constructor(detail: string) {
    super(`The AI model's free-tier rate limit was reached. Try again in a minute. (${detail.slice(0, 200)})`);
    this.name = "RateLimitError";
  }
}
