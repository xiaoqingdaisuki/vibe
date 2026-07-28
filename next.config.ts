const nextConfig: import('next').NextConfig = {
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  // Turbopack is enabled via CLI flag
  // No static export - keep Vercel dynamic capabilities
  transpilePackages: ['next-mdx-remote'],
};

export default nextConfig;
