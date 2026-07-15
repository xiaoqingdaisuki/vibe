import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { DEFAULT_THEME, getThemeInitializationScript } from '@/lib/theme';
import './globals.css';

const themeInitializationScript = getThemeInitializationScript();

export const metadata: Metadata = {
  title: {
    default: 'Vibe',
    template: '%s | Vibe',
  },
  description: 'A personal Web Lab — apps, experiments, and public API powered demos.',
  keywords: ['web lab', 'next.js', 'experiments', 'tools'],
  authors: [{ name: 'xiaoqingdaisuki' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Vibe',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <body>
        <Script id="theme-initialization" strategy="beforeInteractive">
          {themeInitializationScript}
        </Script>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
