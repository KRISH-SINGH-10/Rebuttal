import type { PayPalGateway } from "./gateway";
import { mockGateway } from "./mock";
import { sandboxGateway } from "./sandbox";

let cached: PayPalGateway | null = null;

// PAYPAL_MODE=mock forces the offline simulator; otherwise sandbox credentials win.
export function paypal(): PayPalGateway {
  if (cached) return cached;
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret, PAYPAL_MODE } = process.env;
  cached = PAYPAL_MODE !== "mock" && id && secret ? sandboxGateway(id, secret) : mockGateway;
  return cached;
}
