/** 站点根布局，组合元数据、主题初始化与公共页面外壳 */

import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { getThemeInitializationScript, parseTheme, THEME_COLORS, THEME_COOKIE_NAME } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Vibe',
    template: '%s | Vibe',
  },
  description: 'A personal Web Lab — apps, experiments, and public API powered demos.',
  keywords: ['web lab', 'next.js', 'experiments', 'tools'],
  authors: [{ name: 'xiaoqingdaisuki' }],
  applicationName: 'Vibe',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/vibe-icon.svg', type: 'image/svg+xml' },
      { url: '/icon', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Vibe',
    statusBarStyle: 'default',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Vibe',
  },
};

// 使浏览器工具栏颜色与服务端首屏主题保持一致
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  return {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    themeColor: THEME_COLORS[theme],
    viewportFit: 'cover',
  };
}

// 全局布局：站点外壳，包含头部、主内容区和页脚
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = parseTheme(cookieTheme);

  return (
    <html lang="en" data-theme={theme} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* 同步内联脚本在首屏绘制前迁移旧设置，不等待 Next 客户端运行时 */}
        <script
          id="theme-initialization"
          dangerouslySetInnerHTML={{ __html: getThemeInitializationScript(cookieTheme) }}
        />
      </head>
      <body>
        <ThemeProvider initialTheme={theme}>
          <ServiceWorkerRegistration />
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
