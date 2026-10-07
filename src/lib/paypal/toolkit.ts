import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { AGENT_TOOL_NAMES, type ToolDef } from "./gateway";

export function makeToolkit(clientId: string, clientSecret: string) {
  return new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } },
  });
}

// The toolkit ships OpenAI-style function definitions; Claude takes the same JSON
// schema under `input_schema`. We reuse PayPal's own schemas and descriptions verbatim
// so mock mode and sandbox mode present the model with identical tools.
export function toolkitDefs(tk: PayPalAgentToolkit): ToolDef[] {
  const wanted = new Set<string>(AGENT_TOOL_NAMES);
  return tk
    .getTools()
    .filter((t) => wanted.has(t.function.name))
    .map((t) => {
      const { $schema: _ignored, ...schema } = (t.function.parameters ?? {}) as Record<string, unknown>;
      return { name: t.function.name, description: (t.function.description ?? "").trim(), input_schema: { ...schema, type: "object" as const } };
    });
}

let defsCache: ToolDef[] | null = null;
export function sharedToolDefs(): ToolDef[] {
  // Building the toolkit makes no network call, so placeholder credentials are fine
  // when all we need is the tool schemas.
  defsCache ??= toolkitDefs(makeToolkit("schema-only", "schema-only"));
  return defsCache;
}
