import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built/downloaded packaging artifacts, not source.
    "resources/**",
    "dist-electron/**",
  ]),
  // Electron's main process is plain CommonJS, loaded directly by Node
  // without a build step -- unlike the rest of the app's TS/ESM code.
  {
    files: ["electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
