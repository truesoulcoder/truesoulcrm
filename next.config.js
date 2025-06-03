/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: false, // Temporarily disabled for diagnostics
  // External packages for server components
  // serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'], // Removed
  experimental: {
    // Add any experimental features here
    serverActions: {
      allowedOrigins: ['localhost:3000']
    }
  },
  // Configure webpack to handle Node.js modules and optimize builds
  webpack: (config, { isServer, dev }) => {
    // Only add these configurations for server-side bundles
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


      // Add Node.js polyfills
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

    // Exclude .map files from production builds
    if (!dev) {
      config.module.rules.push({
        test: /\.map$/, 
        use: 'ignore-loader'
      });
    }
    
    // Add path aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'oviiqouhtdajfwhpwbyq.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/media/**',
      },
    ],
  },

  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
      {
        source: '/dashboard/:path*',
        destination: '/api/dashboard/:path*',
      },
    ]
  },
  // For TypeScript path aliases
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
