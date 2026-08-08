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
      "posthog-js",
    ],
  },
  // Proxy PostHog through same-origin /ingest so MiniPay's WebView and mobile
  // ad blockers don't drop calls to us.i.posthog.com. Assets go to the static
  // host, everything else to the ingest host. Region: US.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // PostHog ingest endpoints have trailing slashes. Next's default strips them
  // from source patterns, breaking the rewrite. Skip trailing-slash redirects
  // so requests reach PostHog verbatim.
  skipTrailingSlashRedirect: true,
};

export default withBundleAnalyzer(nextConfig);
