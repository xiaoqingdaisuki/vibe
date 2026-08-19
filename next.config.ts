/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is enabled via CLI flag
  // No static export - keep Vercel dynamic capabilities
  transpilePackages: ['next-mdx-remote'],
  images: {
    remotePatterns: [new URL('https://static.mxdzlk.com/**')],
  },
  // 将已公开的旧 Lab 地址永久重定向到新 slug
  async redirects() {
    return [
      { source: '/lab/ai', destination: '/lab/agent', permanent: true },
      { source: '/lab/skills', destination: '/lab/skill', permanent: true },
    ];
  },
};

export default nextConfig;
