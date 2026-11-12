import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "A to F: which side has the view?", template: "%s | A to F" },
  description:
    "Left or right window? Sunsets, sunrises and landmarks for JetBlue flyers, worked out from the flight path. Independent student project.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <p className="disclaimer">A student project for JetBlue flyers, not made by or connected to JetBlue.</p>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" aria-label="A to F home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" width={35} height={46} />
            </Link>
            <Link href="/" className="brand">A to F</Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/routes">Routes</Link>
              <Link href="/insights">Insights</Link>
              <Link href="/about">How it works</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>Independent student project. Not affiliated with JetBlue Airways.</span>
            <span>Every seat gets the view. <Link href="/privacy">Privacy</Link></span>
          </div>
        </footer>
      </body>
    </html>
  );
}
