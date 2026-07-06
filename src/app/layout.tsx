import type { Metadata, Viewport } from "next"
import { SiteHeader } from "@/components/layout/SiteHeader"
import { SiteFooter } from "@/components/layout/SiteFooter"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Vibe",
    template: "%s | Vibe",
  },
  description: "A personal Web Lab — apps, experiments, and public API powered demos.",
  keywords: ["web lab", "next.js", "bun", "experiments", "tools"],
  authors: [{ name: "xiaoqingdaisuki" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Vibe",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#ffffff",
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
