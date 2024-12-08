/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ensure 'encoding' is installed before requiring it
    try {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        encoding: require.resolve('encoding'),
      };
    } catch (error) {
      console.error("Error resolving 'encoding' module:", error);
      // Optionally, remove the fallback if 'encoding' is not critical
      // config.resolve.fallback.encoding = false;
    }
    return config;
  },
};

module.exports = nextConfig;