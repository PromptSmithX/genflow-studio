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

// Kiểm tra trước khi copy: nếu .next/standalone chứa các thư mục không mong muốn thì cảnh báo
const leakedFromStandalone = ["dist-electron", "resources", "secrets"].filter((name) =>
  fs.existsSync(path.join(standalone, name))
);
if (leakedFromStandalone.length > 0) {
  console.warn(
    `[CẢNH BÁO] .next/standalone chứa các thư mục không mong muốn: ${leakedFromStandalone.join(
      ", "
    )}. Sẽ xóa khỏi resources/app sau khi copy.`
  );
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
        `mọi terminal đang chạy "node server.js" / "npm run electron:dev" rồi thử lại.`
    );
  }
  throw error;
}
fs.cpSync(standalone, appDir, { recursive: true });

// Xóa các thư mục thừa hoặc bị lồng khỏi resources/app
const forbiddenDirs = [
  "dist-electron",
  "resources",
  "secrets",
  "docs",
  "tests",
  "deploy",
  "data",
  "mockup",
  "templates",
  "app",
  "components",
  "lib",
  "hooks",
];
for (const dirName of forbiddenDirs) {
  const target = path.join(appDir, dirName);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

// Xóa file .env, build-secrets.json, token.txt khỏi gốc resources/app
const rootFiles = fs.readdirSync(appDir);
for (const file of rootFiles) {
  if (file.startsWith(".env") || file === "build-secrets.json" || file === "token.txt") {
    fs.rmSync(path.join(appDir, file), { force: true });
  }
}

// Xóa đệ quy mọi file *.sqlite, *.sqlite-journal, __pycache__, *.pyc
function cleanForbiddenFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanForbiddenFiles(fullPath);
      }
    } else {
      if (
        entry.name.endsWith(".sqlite") ||
        entry.name.endsWith(".sqlite-journal") ||
        entry.name.endsWith(".pyc")
      ) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}
cleanForbiddenFiles(appDir);

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

// Copy tường minh Printify templates cho bản đóng gói
const printifyDir = path.join(root, "Printify_Premade_Grid_Calendar_Templates");
if (!fs.existsSync(printifyDir)) {
  throw new Error(`Thiếu thư mục Printify templates tại ${printifyDir}.`);
}
fs.cpSync(printifyDir, path.join(appDir, "Printify_Premade_Grid_Calendar_Templates"), {
  recursive: true,
});

// Hàm copy thư mục script Python, lọc bỏ __pycache__ và *.pyc
function copyPythonScriptDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Thiếu thư mục script nguồn tại ${src}.`);
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      if (base === "__pycache__" || base.endsWith(".pyc")) {
        return false;
      }
      return true;
    },
  });
}

// Xóa scripts cũ nếu có từ standalone để đảm bảo chỉ copy đúng script cần thiết
const appScriptsDir = path.join(appDir, "scripts");
if (fs.existsSync(appScriptsDir)) {
  fs.rmSync(appScriptsDir, { recursive: true, force: true });
}

// Copy tường minh scripts/censor và scripts/mockup
copyPythonScriptDir(path.join(root, "scripts", "censor"), path.join(appDir, "scripts", "censor"));
copyPythonScriptDir(path.join(root, "scripts", "mockup"), path.join(appDir, "scripts", "mockup"));

console.log(`Prepared Electron app resources at ${appDir}`);
