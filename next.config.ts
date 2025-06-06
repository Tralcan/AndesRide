
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com', // Cubre lh3, lh4, etc.
        port: '',
        pathname: '/**', // Permite cualquier ruta dentro de estos dominios
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:9002"], // Adjust if your dev port is different
    }
  }
};

export default nextConfig;
