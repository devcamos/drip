import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drip",
  description: "Track your passive income. Data stays on your device.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Drip", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon-192.png?v=drip-growth-1", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png?v=drip-growth-1", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png?v=drip-growth-1", sizes: "180x180" }],
  },
  other: { "apple-mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = { themeColor: "#fffaf1", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-GB"><body>{children}</body></html>;
}
