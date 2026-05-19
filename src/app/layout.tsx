import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Prode Mundial 2026",
  description: "Predecí los resultados del Mundial 2026 y competí con tus amigos",
  openGraph: {
    title: "Prode Mundial 2026",
    description: "Predecí los resultados del Mundial 2026 y competí con tus amigos",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
