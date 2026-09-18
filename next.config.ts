import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev && process.arch === "ia32") {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
