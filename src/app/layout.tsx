import type { Metadata } from "next";
import "./globals.css";
import "./tactical.css";

export const metadata: Metadata = {
  title: "OPS CALENDAR — Tactical Operations",
  description: "A tactical operations calendar.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
