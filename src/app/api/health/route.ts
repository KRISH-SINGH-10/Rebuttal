// Render health check: no PayPal or model calls, so a cold start stays cheap.
export async function GET() {
  return Response.json({ ok: true });
}
