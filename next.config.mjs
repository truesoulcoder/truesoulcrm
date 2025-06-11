// Modern Next.js config, ESM style
import path from 'path';
import { fileURLToPath } from 'url';
// import webpack from 'webpack'; // <-- REMOVED THIS LINE

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  transpilePackages: ['@supabase/supabase-js', '@supabase/realtime-js'],
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
  // Get the webpack object from the function's arguments
  webpack: (config, { isServer, dev, webpack }) => {
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

    // Add IgnorePlugin for fsevents
    config.plugins = config.plugins || [];
    // Use the webpack object provided by Next.js
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^fsevents$/ }));
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /nunjucks\/src\/node-loaders\.js$/ }));

    return config;
  },
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;