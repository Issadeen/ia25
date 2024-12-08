
module.exports = {
  webpack: (config) => {
    config.resolve.fallback = {
      // ...existing fallbacks...
      encoding: require.resolve('encoding')
    };
    return config;
  },
};