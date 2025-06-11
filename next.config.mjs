import path from 'path';

const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  transpilePackages: ['@supabase/supabase-js', '@supabase/realtime-js', '@heroui/react'],
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
  webpack: (config, { isServer, dev, webpack }) => {
    if (isServer) {
      // ... server-side webpack config remains correct ...
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
      // FIX: Use process.cwd() to robustly get the project root
      '@': path.join(process.cwd(), 'src'),
    };

    config.plugins = config.plugins || [];
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