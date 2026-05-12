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
      // Google OAuth callback: the redirect URI registered in Google
      // Console (and the secret GOOGLE_OAUTH_REDIRECT_URI) points at
      // `/api/auth/oauth/google/callback` on the customer app. There is
      // no Next.js route at that path — proxy it to the backend's
      // `/v1/auth/oauth/*` handler instead.
      { source: "/api/auth/:path*", destination: `${apiOrigin}/v1/auth/:path*` },
    ];
  },
};

export default nextConfig;
