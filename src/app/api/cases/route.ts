import { connection } from "next/server";
import { stats, syncCases } from "@/lib/cases";
import { paypal, sandboxAvailable } from "@/lib/paypal";

// Always read live dispute state; never prerender.
export async function GET() {
  await connection();
  try {
    const cases = await syncCases();
    return Response.json({ mode: paypal().mode, sandboxAvailable: sandboxAvailable(), cases, stats: stats(cases) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
