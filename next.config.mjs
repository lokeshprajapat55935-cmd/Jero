import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/request/new',
        destination: '/booking/new',
        permanent: true,
      },
      {
        source: '/booking/create',
        destination: '/booking/new',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/worker/:path*',
        destination: '/partner/:path*',
      },
    ];
  },
  webpack: (config, { isServer, dev }) => {
    if (!isServer && !dev) {
      config.output.chunkFilename = (pathData) => {
        const name = pathData.chunk.name;
        if (name) {
          const sanitized = name.replace(/[()]/g, '');
          return `static/chunks/${sanitized}.[contenthash].js`;
        }
        return 'static/chunks/[id].[contenthash].js';
      };
    }
    return config;
  },
};

export default nextConfig;
