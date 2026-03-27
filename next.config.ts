import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // When a parent folder (e.g. $HOME) has another lockfile, Next can mis-resolve
  // roots and break PostCSS/Tailwind. Pin everything to this app directory.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
