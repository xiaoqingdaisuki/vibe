/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is enabled via CLI flag
  // No static export - keep Vercel dynamic capabilities
  transpilePackages: ['next-mdx-remote'],
  images: {
    remotePatterns: [new URL('https://static.mxdzlk.com/**')],
  },
};

export default nextConfig;
