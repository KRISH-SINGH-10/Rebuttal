import { z } from "zod";
import { simulateRuling } from "@/lib/actions";

const Body = z.object({ outcome: z.enum(["SELLER_FAVOR", "BUYER_FAVOR"]) });

export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/ruling">) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  try {
    return Response.json(await simulateRuling(id, body.data.outcome));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
