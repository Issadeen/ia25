
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
    domains: ['avatars.githubusercontent.com', 'lh3.googleusercontent.com'],
  }
}

export default nextConfig