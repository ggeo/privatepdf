/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const internalHost = process.env.TAURI_DEV_HOST || 'localhost';
const devPort = process.env.PORT || '3000';

const nextConfig = {
  // Enable Static Site Generation for Tauri builds only
  // When TAURI_BUILD=true, we export static files (no API routes)
  // For local dev (npm run dev), API routes work normally
  ...(process.env.TAURI_BUILD === 'true' && { output: 'export' }),

  // Disable image optimization for SSG
  images: {
    unoptimized: true,
  },

  // Configure asset prefix for dev/prod
  assetPrefix: isProd ? undefined : `http://${internalHost}:${devPort}`,

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Disable ESLint during build to avoid blocking on warnings
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Disable TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // Webpack configuration
  webpack: (config, { isServer, dev }) => {
    // Define global self for SSG
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@': require('path').resolve(__dirname, 'src'),
      };
    }

    // Handle node: imports and fs module for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        process: false,
        os: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        url: false,
        http: false,
        https: false,
      };

      // OBFUSCATION DISABLED - Was causing "Loading chunk failed" errors in production
      // The obfuscation was breaking dynamic imports and lazy loading
      // TODO: Investigate alternative obfuscation methods that don't break code splitting
      // For now, relying on Next.js built-in minification for some protection
    }

    // pdf.js worker configuration
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      encoding: false,
    };

    // Don't bundle these on the server
    if (isServer) {
      config.externals.push('pdfjs-dist');
    }

    return config;
  },
};

module.exports = nextConfig;
