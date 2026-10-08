import { upsertFromDispute } from "@/lib/cases";
import { paypal } from "@/lib/paypal";
import { withVisitor } from "@/lib/visitor";

// Judge mode: file a realistic test dispute so the full flow can be tried without a PayPal login.
export const POST = withVisitor(async () => {
  try {
    const d = await paypal().fileTestDispute();
    return Response.json(upsertFromDispute(d));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
});
