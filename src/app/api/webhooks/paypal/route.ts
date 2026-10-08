import { after } from "next/server";
import { runAnalysis } from "@/lib/analysis";
import { upsertFromDispute } from "@/lib/cases";
import { paypal } from "@/lib/paypal";
import { runAs } from "@/lib/visitor";

export const maxDuration = 300;

// PayPal calls this for CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED. New disputes
// are analyzed in the background so a recommendation is waiting when the seller looks.
// Webhooks come from the live PayPal sandbox, whatever mode visitors have picked.
export async function POST(req: Request) {
  return runAs({ id: "server", mode: "sandbox" }, () => handle(req));
}

async function handle(req: Request) {
  const event = await req.json().catch(() => null);
  if (!event?.event_type) return Response.json({ error: "Bad payload" }, { status: 400 });
  const gw = paypal();
  try {
    if (!(await gw.verifyWebhook(req.headers, event))) return Response.json({ error: "Signature check failed" }, { status: 401 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (!String(event.event_type).startsWith("CUSTOMER.DISPUTE.")) return Response.json({ ignored: true });

  const id: string | undefined = event.resource?.dispute_id;
  if (!id) return Response.json({ error: "No dispute_id" }, { status: 400 });
  const rec = upsertFromDispute(await gw.getDispute(id));
  if (event.event_type === "CUSTOMER.DISPUTE.CREATED" && rec.status === "NEW") {
    after(() => runAnalysis(id).catch((e) => console.error(`analysis ${id} failed:`, e)));
  }
  return Response.json({ received: true });
}
