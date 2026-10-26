import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// prisma.config.ts disables Prisma's automatic .env loading for the CLI,
// so load it explicitly here (Next.js itself loads .env on its own).
loadEnv({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
