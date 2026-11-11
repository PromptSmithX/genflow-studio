#!/usr/bin/env node
// Chặn đóng gói thiếu runtime (node, python), thiếu file cấu hình
// hoặc lọt thư mục nhạy cảm/thừa thãi vào resources/app.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findSqliteFiles(dir) {
  const sqliteFiles = [];
  if (!fs.existsSync(dir)) return sqliteFiles;
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".sqlite")) {
        sqliteFiles.push(full);
      }
    }
  }
  walk(dir);
  return sqliteFiles;
}

function hasPrintifyFormatJson(printifyDir) {
  if (!fs.existsSync(printifyDir)) return false;
  try {
    const entries = fs.readdirSync(printifyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const formatPath = path.join(printifyDir, entry.name, "format.json");
        if (fs.existsSync(formatPath)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function getDirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          // Bỏ qua lỗi truy cập file tạm
        }
      }
    }
  }
  walk(dir);
  return total;
}

export function verifyPackage(rootDir, options = {}) {
  const errors = [];
  const warnings = [];
  const skipExec = Boolean(options.skipExec);

  // 1. Kiểm tra Node.js runtime
  const nodeExe = path.join(rootDir, "resources", "node", "node.exe");
  if (!fs.existsSync(nodeExe)) {
    errors.push(`Thiếu ${nodeExe}. Vui lòng chạy "npm run build:node" để tải runtime Node.`);
  }

  // 2. Kiểm tra Python runtime và import PIL, numpy
  const pythonExe = path.join(rootDir, "resources", "python", "python.exe");
  if (!fs.existsSync(pythonExe)) {
    errors.push(`Thiếu ${pythonExe}. Vui lòng chạy "npm run build:python" để cài đặt runtime Python.`);
  } else if (!skipExec) {
    try {
      execFileSync(pythonExe, ["-c", "import PIL, numpy"], { stdio: "pipe", timeout: 15000 });
    } catch (err) {
      errors.push(
        `Chạy ${pythonExe} kiểm tra import PIL, numpy thất bại: ${err.message}. Vui lòng chạy "npm run build:python".`
      );
    }
  }

  // 3. Kiểm tra DB template và migrations
  const dbPath = path.join(rootDir, "resources", "template", "anima.sqlite");
  if (!fs.existsSync(dbPath)) {
    errors.push(`Thiếu ${dbPath}. Vui lòng chạy "npm run build:template-db".`);
  }

  const migrationsDir = path.join(rootDir, "resources", "template", "migrations");
  if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
    errors.push(`Thiếu thư mục ${migrationsDir}. Vui lòng chạy "npm run build:template-db".`);
  }

  // 4. Kiểm tra server.js và script trong resources/app
  const appDir = path.join(rootDir, "resources", "app");

  const serverJs = path.join(appDir, "server.js");
  if (!fs.existsSync(serverJs)) {
    errors.push(`Thiếu ${serverJs}. Vui lòng chạy "npm run build && npm run build:electron-resources".`);
  }

  const wrapMockupPy = path.join(appDir, "scripts", "mockup", "wrap_mockup.py");
  if (!fs.existsSync(wrapMockupPy)) {
    errors.push(`Thiếu ${wrapMockupPy}. Vui lòng chạy "npm run build:electron-resources".`);
  }

  const censorPy = path.join(appDir, "scripts", "censor", "censor.py");
  if (!fs.existsSync(censorPy)) {
    errors.push(`Thiếu ${censorPy}. Vui lòng chạy "npm run build:electron-resources".`);
  }

  // 5. Kiểm tra template mockup
  const requiredTemplates = [
    "Context Covers.png",
    "Context Q1.png",
    "Context Q2.png",
    "Context Q3.png",
    "Context Q4.png",
  ];
  for (const tpl of requiredTemplates) {
    const tplPath = path.join(appDir, "assets", "mockup_templates", tpl);
    if (!fs.existsSync(tplPath)) {
      errors.push(`Thiếu template mockup ${tplPath}. Vui lòng chạy "npm run build:electron-resources".`);
    }
  }

  // 6. Kiểm tra ít nhất 1 format.json của Printify
  const printifyDir = path.join(appDir, "Printify_Premade_Grid_Calendar_Templates");
  if (!hasPrintifyFormatJson(printifyDir)) {
    errors.push(
      `Thiếu ít nhất 1 file format.json trong ${printifyDir}/*/. Vui lòng chạy "npm run build:electron-resources".`
    );
  }

  // 7. Kiểm tra electron/migrate.js
  const migrateJs = path.join(rootDir, "electron", "migrate.js");
  if (!fs.existsSync(migrateJs)) {
    errors.push(`Thiếu file migration script tại ${migrateJs}.`);
  }

  // 8. Bắt buộc KHÔNG CÓ trong resources/app
  const forbiddenItems = ["dist-electron", "resources", "secrets", "build-secrets.json", "token.txt"];
  for (const forbidden of forbiddenItems) {
    const fPath = path.join(appDir, forbidden);
    if (fs.existsSync(fPath)) {
      errors.push(`Tồn tại file/thư mục cấm trong resources/app: ${forbidden}`);
    }
  }

  if (fs.existsSync(appDir)) {
    let appRootFiles = [];
    try {
      appRootFiles = fs.readdirSync(appDir);
    } catch {}
    for (const f of appRootFiles) {
      if (f.startsWith(".env")) {
        errors.push(`Tồn tại file .env ở gốc resources/app: ${f}`);
      }
    }

    const sqliteFiles = findSqliteFiles(appDir);
    for (const sq of sqliteFiles) {
      const rel = path.relative(appDir, sq);
      errors.push(`Tồn tại file SQLite trong resources/app: ${rel}`);
    }
  }

  // 9. Cảnh báo (không fail)
  const secretsEnc = path.join(rootDir, "resources", "secrets", "secrets.enc");
  if (!fs.existsSync(secretsEnc)) {
    warnings.push(
      `Thiếu ${secretsEnc} (exe sẽ yêu cầu nhập key thủ công). Chạy "npm run build:secrets" nếu muốn đóng gói secret có sẵn.`
    );
  }

  const appSizeBytes = getDirSizeBytes(appDir);
  const appSizeMB = appSizeBytes / (1024 * 1024);
  if (appSizeMB > 150) {
    warnings.push(`Kích thước resources/app vượt quá 150MB (${appSizeMB.toFixed(1)}MB).`);
  }

  return { errors, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(__dirname, "..");
  const result = verifyPackage(root);

  if (result.warnings.length > 0) {
    console.warn("=== CẢNH BÁO KIỂM TRA ĐÓNG GÓI ===");
    for (const w of result.warnings) {
      console.warn(`[CẢNH BÁO] ${w}`);
    }
  }

  if (result.errors.length > 0) {
    console.error("=== LỖI KIỂM TRA ĐÓNG GÓI ===");
    for (const e of result.errors) {
      console.error(`[LỖI] ${e}`);
    }
    process.exit(1);
  }

  console.log("Kiểm tra gói cài đặt thành công (verify-package: OK).");
}
