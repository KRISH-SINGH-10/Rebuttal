import { runAnalysis } from "@/lib/analysis";

export const maxDuration = 300;

// Streams the agent's investigation as NDJSON: {type:"step"} lines, then {type:"done"} or {type:"error"}.
export async function POST(_req: Request, ctx: RouteContext<"/api/cases/[id]/analyze">) {
  const { id } = await ctx.params;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const rec = await runAnalysis(id, (step) => send({ type: "step", step }));
        send({ type: "done", case: rec });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
