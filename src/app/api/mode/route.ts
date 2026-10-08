import { connection } from "next/server";
import { currentMode, sandboxAvailable, setMode } from "@/lib/paypal";
import { viewOnly, withVisitor } from "@/lib/visitor";

const state = () => ({ mode: currentMode(), sandboxAvailable: sandboxAvailable(), viewOnly: viewOnly() });

export const GET = withVisitor(async () => {
  await connection(); // never prerender: the mode is per visitor
  return Response.json(state());
});

// Switches this browser between the PayPal simulator and the live sandbox (kept in a cookie).
export const POST = withVisitor(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  if (body?.mode !== "mock" && body?.mode !== "sandbox") return Response.json({ error: "mode must be mock or sandbox" }, { status: 400 });
  try {
    setMode(body.mode);
    return Response.json(state());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
});
