import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rebuttal",
  description: "An AI agent that defends small sellers in PayPal disputes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-panel">R</span>
              Rebuttal
            </Link>
            <span className="text-sm text-muted">Dispute defense for Juniper &amp; Kiln</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
