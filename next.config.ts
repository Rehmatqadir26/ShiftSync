import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid picking parent /Users/dev as monorepo root when another lockfile exists
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
