import type { PayPalGateway } from "./gateway";
import { mockGateway } from "./mock";
import { sandboxGateway } from "./sandbox";

export type Mode = "mock" | "sandbox";

// One server-wide mode, switchable from the inbox, so a hosted demo can open on the
// simulator (every step works, no PayPal login needed) and still show the live sandbox.
// PAYPAL_MODE sets the starting mode; without it, sandbox credentials win.
const g = globalThis as unknown as { __rebuttalMode?: Mode; __rebuttalSandbox?: PayPalGateway };

export function sandboxAvailable(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function currentMode(): Mode {
  if (!g.__rebuttalMode) {
    const want = process.env.PAYPAL_MODE;
    g.__rebuttalMode = want === "mock" || !sandboxAvailable() ? "mock" : "sandbox";
  }
  return g.__rebuttalMode;
}

export function setMode(mode: Mode) {
  if (mode === "sandbox" && !sandboxAvailable()) throw new Error("PayPal sandbox credentials are not configured on this server.");
  g.__rebuttalMode = mode;
}

export function paypal(): PayPalGateway {
  if (currentMode() === "mock") return mockGateway;
  g.__rebuttalSandbox ??= sandboxGateway(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!);
  return g.__rebuttalSandbox;
}
