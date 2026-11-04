#!/usr/bin/env node
// One-time (per machine) step before `npm run dist`: fetches a portable Windows
// Node runtime and drops node.exe into resources/node/. The Electron shell
// spawns the Next.js standalone server with THIS Node binary, not Electron's
// own bundled Node, so the native prebuilds (@napi-rs/canvas, sharp, Prisma's
// query engine) load against a standard Node ABI instead of Electron's.
// Requires internet access; run manually, not as part of `npm install`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const NODE_VERSION = "22.14.0"; // pin: bump deliberately, re-test native deps after.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const resourcesDir = path.join(root, "resources");
const outDir = path.join(resourcesDir, "node");
const zipUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const tmpZip = path.join(resourcesDir, "node-download.zip");
const extractDir = path.join(resourcesDir, `node-v${NODE_VERSION}-win-x64`);

fs.mkdirSync(resourcesDir, { recursive: true });

console.log(`Downloading ${zipUrl} ...`);
const res = await fetch(zipUrl);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
fs.writeFileSync(tmpZip, Buffer.from(await res.arrayBuffer()));

fs.rmSync(extractDir, { recursive: true, force: true });
const result = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path "${tmpZip}" -DestinationPath "${resourcesDir}" -Force`,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) throw new Error("Expand-Archive failed");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(extractDir, "node.exe"), path.join(outDir, "node.exe"));

fs.rmSync(tmpZip, { force: true });
fs.rmSync(extractDir, { recursive: true, force: true });

console.log(`node.exe (v${NODE_VERSION}) ready at ${path.join(outDir, "node.exe")}`);
