import type { MetadataRoute } from "next";

// Only public, unauthenticated pages belong here — dashboard, terminal,
// deposit, withdraw, history, kyc, and admin are all behind auth and have
// nothing useful to show a crawler (or a search result to a logged-out
// user), so they're deliberately excluded. Keep this list in sync with
// robots.txt's disallow list — the two should agree on what's public.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://fxstrading.onrender.com"; // update if you move to a custom domain

  const routes = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/signup", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/login", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/risk-disclosure", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
