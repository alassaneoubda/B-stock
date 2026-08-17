/** @type {import('next').NextConfig} */
const nextConfig = {
  // Surface TypeScript errors in CI/local builds — do not hide them.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
