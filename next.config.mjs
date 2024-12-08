/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    turbo: {
      resolveAlias: {
        '@': '.',
      }
    }
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src',
    }
    return config
  },
  transpilePackages: ["@radix-ui/react-icons", "lucide-react"],
};

export default nextConfig;