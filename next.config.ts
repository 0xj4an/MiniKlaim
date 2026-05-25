import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this directory so it does not climb up
  // to ~/pnpm-lock.yaml and get confused about which project is the root.
  turbopack: {
    root: __dirname,
  },
  // Ship browser source maps in production. The repo is public (MIT) so there
  // is no IP concern, and the maps let DevTools and Lighthouse insights reach
  // the original sources for real-user debugging.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
