#!/usr/bin/env node
// After `next build` (with output: "standalone"), Next leaves .next/standalone
// without .next/static or public/ -- it expects those copied in manually
// (see Next's standalone-output docs). This assembles the final app folder
// that electron-builder ships as extraResources/app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const appDir = path.join(root, "resources", "app");

if (!fs.existsSync(standalone)) {
  throw new Error(`Missing ${standalone} -- run "npm run build" first.`);
}

try {
  // maxRetries/retryDelay absorb transient EBUSY/EPERM from AV or the search
  // indexer scanning files right after they're written.
  fs.rmSync(appDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch (error) {
  if (error.code === "EPERM" || error.code === "EBUSY") {
    throw new Error(
      `Không xóa được ${appDir} (đang bị khóa). Có khả năng một server Anima Studio ` +
        `cũ (node.exe) vẫn đang chạy với thư mục này làm cwd -- đóng Anima Studio và ` +
        `mọi terminal đang chạy "node server.js" / "npm run electron:dev" rồi thử lại.`,
    );
  }
  throw error;
}
fs.cpSync(standalone, appDir, { recursive: true });

// Xóa file .env khỏi resources/app để tránh lộ secret trong bản build
const envFiles = fs.readdirSync(appDir).filter((file) => file.startsWith(".env"));
for (const file of envFiles) {
  fs.rmSync(path.join(appDir, file), { force: true });
}
console.log(`Đã xóa ${envFiles.length} file env khỏi resources/app: ${envFiles.join(", ")}`);
fs.cpSync(path.join(root, ".next", "static"), path.join(appDir, ".next", "static"), {
  recursive: true,
});

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(appDir, "public"), { recursive: true });
}

// Copy template mockup cho bản đóng gói
const mockupTemplatesDir = path.join(root, "assets", "mockup_templates");
if (!fs.existsSync(mockupTemplatesDir)) {
  throw new Error(`Thiếu thư mục template mockup tại ${mockupTemplatesDir}.`);
}
fs.cpSync(mockupTemplatesDir, path.join(appDir, "assets", "mockup_templates"), { recursive: true });

console.log(`Prepared Electron app resources at ${appDir}`);
