import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fiskalo — Menaxho biznesin",
  description: "Platformë për shitje, fatura dhe menaxhim fiskal të bizneseve në Kosovë.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sq">
      <body>{children}</body>
    </html>
  );
}
