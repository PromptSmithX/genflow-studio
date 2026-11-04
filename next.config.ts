import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" copies the minimal production server + traced node_modules
  // into .next/standalone, so the Electron-packaged app runs it with a bundled
  // Node binary instead of needing the full project checkout + npm install.
  output: "standalone",
  // @napi-rs/canvas là native .node addon -> để Next require ở runtime thay vì
  // bundle (Turbopack không resolve được .node khi bundle).
  serverExternalPackages: ["@napi-rs/canvas"],
  // File tracing misses native addons loaded via runtime require() (sharp's
  // .node binary, Prisma's query engine) -- force them into the standalone copy.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@prisma/engines/**",
      "./node_modules/.prisma/client/**",
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
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
