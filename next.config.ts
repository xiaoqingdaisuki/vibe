import type { NextConfig } from 'next';

const isDesktopBuild = process.env.VIBE_DESKTOP_BUILD === 'true';

const nextConfig: NextConfig = {
  ...(isDesktopBuild ? { output: 'standalone' as const } : {}),
  // Turbopack is enabled via CLI flag
  // 桌面构建使用 standalone，Web 构建继续保留 Vercel 的动态能力
  transpilePackages: ['next-mdx-remote'],
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: [new URL('https://static.mxdzlk.com/**')],
  },
  async headers() {
    return [
      {
        source: '/lab/gba',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/assets/gba/:path*',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
