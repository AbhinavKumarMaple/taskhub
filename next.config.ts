import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM + data files; load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
  async redirects() {
    return [{ source: "/", destination: "/board?type=feature", permanent: false }];
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
