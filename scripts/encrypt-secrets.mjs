#!/usr/bin/env node
// Đọc secrets/build-secrets.json, mã hóa AES-256-GCM và lưu vào resources/secrets/secrets.enc
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { encrypt } = require("../electron/secrets-crypto.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const secretsSource = path.join(root, "secrets", "build-secrets.json");
const secretsDir = path.join(root, "resources", "secrets");
const secretsDest = path.join(secretsDir, "secrets.enc");

const WHITELIST = new Set([
  "ANIMA_RUNPOD_ENDPOINT_ID",
  "ANIMA_RUNPOD_API_KEY",
  "ANIMA_LLM_API_KEY",
  "ANIMA_LLM_BASE_URL",
  "ANIMA_LLM_MODEL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_KEY_PREFIX",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
]);

if (!fs.existsSync(secretsSource)) {
  console.warn("Không có secrets/build-secrets.json — exe sẽ yêu cầu nhập key thủ công");
  if (fs.existsSync(secretsDest)) {
    fs.rmSync(secretsDest, { force: true });
  }
  process.exit(0);
}

const rawContent = fs.readFileSync(secretsSource, "utf8");
let parsed;
try {
  parsed = JSON.parse(rawContent);
} catch (error) {
  console.error(`Lỗi cú pháp JSON trong ${secretsSource}:`, error.message);
  process.exit(1);
}

const filtered = {};
const embeddedKeys = [];

for (const [key, val] of Object.entries(parsed)) {
  if (!WHITELIST.has(key)) {
    console.warn(`Bỏ qua key không nằm trong whitelist: ${key}`);
    continue;
  }
  if (val === null || val === undefined) {
    continue;
  }
  if (key === "GOOGLE_SERVICE_ACCOUNT_JSON") {
    if (typeof val === "object") {
      if (Object.keys(val).length === 0) {
        continue;
      }
      filtered[key] = JSON.stringify(val);
      embeddedKeys.push(key);
    } else if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        continue;
      }
      try {
        JSON.parse(trimmed);
      } catch {
        console.error("Lỗi: GOOGLE_SERVICE_ACCOUNT_JSON không phải chuỗi JSON hợp lệ.");
        process.exit(1);
      }
      filtered[key] = trimmed;
      embeddedKeys.push(key);
    }
  } else if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed) {
      filtered[key] = trimmed;
      embeddedKeys.push(key);
    }
  } else if (String(val).trim()) {
    filtered[key] = String(val).trim();
    embeddedKeys.push(key);
  }
}

fs.mkdirSync(secretsDir, { recursive: true });
const encryptedBuffer = encrypt(filtered);
fs.writeFileSync(secretsDest, encryptedBuffer);
console.log(`Đã mã hóa và nhúng các key sau vào ${secretsDest}: ${embeddedKeys.join(", ")}`);
