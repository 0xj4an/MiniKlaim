import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  // Set ANALYZE=true when running `npm run build` to open the interactive
  // HTML report. Off by default so normal builds are unaffected.
  enabled: process.env.ANALYZE === "true",
});

// The commit this image was built from. Railway set RAILWAY_GIT_COMMIT_SHA
// for free; the VPS build has to pass BUILD_COMMIT_SHA itself, and when
// neither is there the build is anonymous: the version reads "dev" and
// `deploymentId` is undefined, which silently gives up version-skew
// protection. The Railway name is still read so nothing breaks if a build
// runs there.
const BUILD_SHA =
  process.env.BUILD_COMMIT_SHA?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  "";

const nextConfig: NextConfig = {
  // Short commit of this build, shown in support emails, so a player's
  // ticket can be tied to a build.
  env: {
    NEXT_PUBLIC_APP_VERSION: (BUILD_SHA || "dev").slice(0, 7),
    // The release Sentry tags events with. Full sha, matching the releases
    // Railway used to create, so the history lines up. Empty on a local
    // build, which `sentryInitOptions` reads as "no release".
    NEXT_PUBLIC_SENTRY_RELEASE: BUILD_SHA,
  },
  // Version skew: a tab on an old build calls Server Actions and chunks the
  // new build no longer has ("Failed to find Server Action", ChunkLoadError).
  // With a deployment id Next sees the mismatch and does a hard navigation
  // instead.
  deploymentId: BUILD_SHA || undefined,
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

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: "0xj4an",
  project: "miniklaim",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Name the release explicitly instead of letting the plugin guess from
  // git: the Docker build has no .git, so the guess was nothing.
  release: BUILD_SHA ? { name: BUILD_SHA } : undefined,
  // Same-origin tunnel. MiniPay's WebView drops calls to ingest.sentry.io.
  tunnelRoute: "/monitoring",
  silent: true,
  telemetry: false,
  widenClientFileUpload: false,
  sourcemaps: {
    deleteSourcemapsAfterUpload: false,
  },
  webpack: {
    automaticVercelMonitors: false,
    treeshake: {
      removeDebugLogging: true,
      removeTracing: true,
    },
  },
});
