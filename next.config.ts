// Fixed: Only one 'images' key, all domains and remotePatterns merged, deduped.
// Modern Next.js config, ESM style

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lefvtgqockzqkasylzwb.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/media/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      const existingExternals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = existingExternals.filter(
        (ext) => typeof ext !== 'object' || (!ext.hasOwnProperty('puppeteer-core') && !ext.hasOwnProperty('@sparticuz/chromium'))
      );
      if (Array.isArray(config.externals)) {
        config.externals = config.externals.filter(external => {
          if (typeof external === 'object' && external !== null) {
            return !('puppeteer-core' in external && '@sparticuz/chromium' in external);
          }
          return true;
        });
      }
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        dns: false,
        http2: false,
        module: false,
        dgram: false,
      };
    }
    if (!dev) {
      config.module.rules.push({
        test: /\.map$/,
        use: 'ignore-loader',
      });
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;