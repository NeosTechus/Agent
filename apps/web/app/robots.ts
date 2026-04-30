import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Allow indexing of marketing pages, disallow auth + dashboard.
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/how-it-works", "/faq", "/contact", "/status", "/privacy", "/terms"],
        disallow: ["/dashboard", "/onboarding", "/checkout", "/login", "/signup"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
