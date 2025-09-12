import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "../styles/theme.css";
import "../styles/starfield.css";
import StarfieldLayer from "@/components/StarfieldLayer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Tyton Orchestrator",
  description: "Hardware project design & management with AI assistance",
  themeColor: "#0B0F14",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="starry" data-effects="subtle">
      <head>
        <meta name="theme-color" content="#0B0F14" />
      </head>
      <body
        className={`
          ${geistSans.variable} ${geistMono.variable} antialiased
          bg-bg text-text overflow-x-hidden
        `}
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <StarfieldLayer />
        {children}
      </body>
    </html>
  );
}
