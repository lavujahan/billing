import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones on the local Wi-Fi (e.g. https://192.168.1.5:3000) load the dev server's scripts.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  // Every signed-in page is per-user, so only validate instant navigation where a segment opts in.
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
