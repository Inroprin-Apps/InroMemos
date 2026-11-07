import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ruta } from "@/lib/base";
import { RegistroSW } from "./registro-sw";

// Una sola familia, como INROCONTA: la jerarquía se arma con peso y tamaño.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "InroScan",
  description: "Rendiciones de caja chica y memos de viáticos de INROPRIN.",
  icons: { icon: ruta("inroprin-marca.svg"), apple: ruta("icono-192.png") },
  manifest: ruta("manifest.webmanifest"),
  appleWebApp: { capable: true, title: "InroScan", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#006db1" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <RegistroSW />
      </body>
    </html>
  );
}
