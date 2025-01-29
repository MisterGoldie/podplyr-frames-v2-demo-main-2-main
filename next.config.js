/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    scrollRestoration: true
  },
  typescript: {
    // We'll temporarily ignore build errors and fix them properly
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: false
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' https://*.ngrok.com https://*.ngrok-free.app 'unsafe-eval' 'unsafe-inline'",
              "font-src 'self' https://assets.ngrok.com https://cdn.ngrok.com https://*.ngrok.com https://*.ngrok-free.app data:",
              "style-src 'self' 'unsafe-inline' https://assets.ngrok.com https://cdn.ngrok.com https://*.ngrok.com https://*.ngrok-free.app",
              "img-src 'self' https: data:",
              "media-src 'self' https: data:",
              "connect-src 'self' https: wss:",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.ngrok.com https://*.ngrok.com https://*.ngrok-free.app"
            ].join('; ')
          }
        ]
      }
    ];
  },
  staticPageGenerationTimeout: 1000,
  assetPrefix: process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_NGROK_URL : ''
}

module.exports = nextConfig; 