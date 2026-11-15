import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earth Trend Detective | NASA Space Apps 2026",
  description:
    "Detect and visualize statistically significant Earth climate trends using NASA POWER API data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Font loaded at browser runtime — never blocks the build */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
        />
        {/* Leaflet CSS — loaded globally so the dynamic MapPickerModal has styles ready */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen bg-space-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
