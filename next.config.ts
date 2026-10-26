/** 配置 Next 构建、桌面产物与跨源隔离响应头 */

import type { NextConfig } from 'next';

const isDesktopBuild = process.env.VIBE_DESKTOP_BUILD === 'true';

const nextConfig: NextConfig = {
  ...(isDesktopBuild ? { output: 'standalone' as const } : {}),
  // Turbopack 通过命令行参数启用
  // 桌面构建使用 standalone，Web 构建继续保留 Vercel 的动态能力
  transpilePackages: ['next-mdx-remote'],
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: [new URL('https://static.mxdzlk.com/**')],
  },
  // 为 GBA 页面和资源提供跨源隔离响应头
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
