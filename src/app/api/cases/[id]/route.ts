import { connection } from "next/server";
import { getCase } from "@/lib/cases";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const c = getCase(id);
  return c ? Response.json(c) : Response.json({ error: "Not found" }, { status: 404 });
}
