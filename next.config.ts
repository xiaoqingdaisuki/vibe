/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is enabled via CLI flag
  // No static export - keep Vercel dynamic capabilities
  transpilePackages: ['next-mdx-remote'],
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
