/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB — offline wallet
  runtimeCaching: [
    {
      urlPattern: /\/api\/v1\/policies/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'policies-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    domains: ['branivo-documents-dev.s3.eu-central-1.amazonaws.com'],
  },
};

module.exports = withPWA(nextConfig);
