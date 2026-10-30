import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip type-checking and linting during CI/CD builds — run these locally
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Experimental Next.js 16 features (active in dev, safe to keep for prod)
  // @ts-ignore — these are valid runtime options in Next.js 16 but not yet in published types
  cacheComponents: true,
  // @ts-ignore
  partialPrefetching: true,

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
