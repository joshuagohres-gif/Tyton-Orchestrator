/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle ELK.js web-worker issues
    if (isServer) {
      // For server-side, provide a mock for web-worker
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'web-worker': false,
      };
    }
    
    return config;
  },
  
  experimental: {
    // Enable web workers support and isomorphic ELK
    esmExternals: 'loose',
  },
};

export default nextConfig;
