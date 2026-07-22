import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "../components/Shell";

export const metadata: Metadata = {
  title: "Vane — get paid the moment work is proven",
  description:
    "A marketing marketplace where campaign budgets sit in escrow and an autonomous agent verifies every result, settling payouts in seconds.",
};

export const viewport: Viewport = {
  themeColor: "#0e171e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
