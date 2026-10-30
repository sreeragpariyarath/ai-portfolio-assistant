import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The web app is a static export served by the API Worker (D-020). A static
  // export rejects cacheComponents and partialPrefetching ("PPR cannot be
  // enabled in export mode"), and this app uses neither.
  output: "export",
  cacheComponents: false,
  partialPrefetching: false,
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
