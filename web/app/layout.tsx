import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "A to F — Every seat gets the view", template: "%s · A to F" },
  description:
    "Which side of the plane has the view? Sun and landmark side recommendations for JetBlue flyers. Independent student project.",
};

export const viewport: Viewport = { themeColor: "#211B1D" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={34} height={44} />
            <Link href="/" className="brand">
              A to F
              <small>Every seat gets the view</small>
            </Link>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            Independent student project. Not affiliated with JetBlue Airways. Sun positions are computed;
            flight paths are approximations until real tracks are loaded.
          </div>
        </footer>
      </body>
    </html>
  );
}
