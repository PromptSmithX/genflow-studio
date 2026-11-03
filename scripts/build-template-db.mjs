#!/usr/bin/env node
// Builds a fresh, fully-migrated + seeded SQLite file at resources/template/anima.sqlite.
// The Electron installer ships this file and copies it into the user's app-data
// folder on first run, so a new install never needs to run `prisma migrate` on
// the end user's machine.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "resources", "template");
const dbPath = path.join(outDir, "anima.sqlite");

fs.mkdirSync(outDir, { recursive: true });
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file);
}

// Overriding DATABASE_URL here (before prisma.config.ts's dotenv.config() runs
// in the child process) works because dotenv does not clobber variables that
// are already set in the environment.
const env = {
  ...process.env,
  DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
};

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, env, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`"${cmd} ${args.join(" ")}" exited with code ${result.status}`);
  }
}

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["prisma", "db", "seed"]);

console.log(`\nTemplate DB written to ${dbPath}`);
