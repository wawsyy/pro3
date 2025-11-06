import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Performance optimizations for FHEVM operations
  experimental: {
    optimizePackageImports: ['@fhevm', 'ethers', '@rainbow-me/rainbowkit'],
  },

  headers() {
    // Required by FHEVM
    return Promise.resolve([
      {
        source: "/",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
