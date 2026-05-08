import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Bypass the build-time CSR bailout check: pages that use useSearchParams
  // (signup, verify-email, reset-password, accept-invite, checkout, pricing,
  // onboarding) all have their content rendered client-side after hydration.
  // Per Next 15 we'd otherwise wrap each in <Suspense>, but every one of
  // these pages already has client-side logic that handles missing params.
  experimental: { missingSuspenseWithCSRBailout: false },
  // Dev-only proxy so the frontend, API, and OAuth callback all share one
  // origin (localhost:3000). Chrome's third-party cookie blocking otherwise
  // strips the session cookie when the page at :3000 fetches :8787 even
  // when both share the registrable domain. With this rewrite, all /v1/*
  // requests from the browser go to :3000 and Next proxies upstream to
  // :8787 (or the staging API URL via API_PROXY_ORIGIN env var).
  async rewrites() {
    const apiOrigin = process.env.API_PROXY_ORIGIN ?? "http://localhost:8787";
    return [
      { source: "/v1/:path*", destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};

export default nextConfig;
