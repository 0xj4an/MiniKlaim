import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  // Set ANALYZE=true when running `npm run build` to open the interactive
  // HTML report. Off by default so normal builds are unaffected.
  enabled: process.env.ANALYZE === "true",
});

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
  experimental: {
    // Tree-shake barrel exports from these wallet libs. We only use a handful
    // of hooks/utilities but the default Next import pulls in the whole
    // package, inflating client bundles by ~150 KiB on the home route where
    // most of these are never invoked.
    optimizePackageImports: [
      "wagmi",
      "viem",
      "@wagmi/core",
      "@tanstack/react-query",
      "@farcaster/miniapp-sdk",
      "@farcaster/miniapp-wagmi-connector",
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
