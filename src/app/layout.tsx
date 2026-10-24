import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${SITE.name} — YouTube insights for Tamil creators`, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&family=Noto+Sans+Tamil:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-paper-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-tight">{SITE.name}</span>
              <span className="ta text-sm text-kolam" lang="ta">
                {SITE.tamilName}
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-5 text-sm text-ink-soft">
              <Link href="/outliers" className="hover:text-ink">
                Outliers
              </Link>
              <Link href="/channels" className="hover:text-ink">
                Channels
              </Link>
              <Link href="/" className="btn-primary !px-3 !py-1.5">
                Analyse
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-20">{children}</main>
        <footer className="border-t border-paper-line py-8 text-center text-xs text-ink-mute">
          {SITE.name} uses YouTube API Services. Not affiliated with YouTube or Google. ·{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy
          </Link>{" "}
          ·{" "}
          <a href="https://www.youtube.com/t/terms" className="underline hover:text-ink" target="_blank" rel="noreferrer">
            YouTube Terms
          </a>
        </footer>
      </body>
    </html>
  );
}
