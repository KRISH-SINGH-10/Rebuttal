import { z } from "zod";
import { approve } from "@/lib/actions";

const Body = z.object({
  decision: z.enum(["FIGHT", "OFFER", "REFUND"]),
  response: z.string().min(1).max(2000),
  offer_amount: z.number().optional(),
  offer_type: z.enum(["REFUND", "REFUND_WITH_RETURN"]).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/approve">) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  try {
    return Response.json(await approve(id, body.data));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
