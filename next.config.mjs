/** @type {import('next').NextConfig} */
const nextConfig = {
  // cacheComponents is intentionally off: every dashboard page shows live
  // agent/run data, so request-time rendering is the right default.
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
