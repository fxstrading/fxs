import type { MetadataRoute } from "next";

// Same public/private split as sitemap.ts — keep the two in sync. Auth-
// gated pages (dashboard, terminal, deposit, withdraw, history, kyc) and
// admin/api/auth routes are disallowed: nothing useful for a crawler to
// index there, and no reason to advertise their paths to bots.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://fxstrading.onrender.com"; // update if you move to a custom domain

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/terminal",
        "/deposit",
        "/withdraw",
        "/history",
        "/kyc",
        "/admin",
        "/admin/",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
