import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
