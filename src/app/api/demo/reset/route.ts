import { resetCases } from "@/lib/cases";
import { paypal } from "@/lib/paypal";
import { resetMock } from "@/lib/paypal/mock";

export async function POST() {
  if (paypal().mode !== "mock") return Response.json({ error: "Reset is only available in demo mode." }, { status: 400 });
  resetMock();
  resetCases();
  return Response.json({ ok: true });
}
