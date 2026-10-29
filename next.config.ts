import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas là native .node addon -> để Next require ở runtime thay vì
  // bundle (Turbopack không resolve được .node khi bundle).
  serverExternalPackages: ["@napi-rs/canvas"],
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
