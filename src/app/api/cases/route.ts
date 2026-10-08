import { connection } from "next/server";
import { stats, syncCases } from "@/lib/cases";
import { paypal, sandboxAvailable } from "@/lib/paypal";
import { viewOnly, withVisitor } from "@/lib/visitor";

// Always read live dispute state; never prerender.
export const GET = withVisitor(async () => {
  await connection();
  try {
    const cases = await syncCases();
    return Response.json({ mode: paypal().mode, sandboxAvailable: sandboxAvailable(), viewOnly: viewOnly(), cases, stats: stats(cases) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
});
