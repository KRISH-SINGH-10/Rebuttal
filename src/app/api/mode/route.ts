import { connection } from "next/server";
import { currentMode, sandboxAvailable, setMode } from "@/lib/paypal";

export async function GET() {
  await connection(); // never prerender: the mode changes at runtime
  return Response.json({ mode: currentMode(), sandboxAvailable: sandboxAvailable() });
}

// Switches the whole server between the PayPal simulator and the live sandbox.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  if (body?.mode !== "mock" && body?.mode !== "sandbox") return Response.json({ error: "mode must be mock or sandbox" }, { status: 400 });
  try {
    setMode(body.mode);
    return Response.json({ mode: currentMode(), sandboxAvailable: sandboxAvailable() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
