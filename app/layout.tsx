import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "PCSAN Otomatis", description: "Hitung pcs × harga jual per pcs, bundling dipecah otomatis" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
