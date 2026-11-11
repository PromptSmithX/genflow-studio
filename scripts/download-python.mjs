#!/usr/bin/env node
// Tải Python embeddable 3.11 và cài wheel Pillow/numpy cho bản đóng gói
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PYTHON_VERSION = "3.11.9";
const PILLOW_VERSION = "11.3.0";
const NUMPY_VERSION = "2.3.5";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const resourcesDir = path.join(root, "resources");
const outDir = path.join(resourcesDir, "python");
const zipUrl = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const tmpZip = path.join(resourcesDir, "python-download.zip");

fs.mkdirSync(resourcesDir, { recursive: true });

// Xóa bản cũ nếu có
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log(`Downloading ${zipUrl} ...`);
const res = await fetch(zipUrl);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
fs.writeFileSync(tmpZip, Buffer.from(await res.arrayBuffer()));

// Giải nén vào resources/python
const extractResult = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path "${tmpZip}" -DestinationPath "${outDir}" -Force`,
  ],
  { stdio: "inherit" },
);
if (extractResult.status !== 0) throw new Error("Expand-Archive failed");
fs.rmSync(tmpZip, { force: true });

// Sửa file python311._pth: thêm Lib\\site-packages và bật import site
const pthPath = path.join(outDir, "python311._pth");
if (!fs.existsSync(pthPath)) {
  throw new Error(`Không tìm thấy file ${pthPath}`);
}
let pthContent = fs.readFileSync(pthPath, "utf-8");
pthContent = pthContent.replace(/^#\s*import site/m, "import site");
if (!pthContent.includes("Lib\\site-packages")) {
  if (pthContent.includes("import site")) {
    pthContent = pthContent.replace("import site", "Lib\\site-packages\nimport site");
  } else {
    pthContent += "\nLib\\site-packages\nimport site\n";
  }
}
fs.writeFileSync(pthPath, pthContent, "utf-8");

// Tạo thư mục site-packages
const sitePackages = path.join(outDir, "Lib", "site-packages");
fs.mkdirSync(sitePackages, { recursive: true });

// Cài Pillow và numpy wheel bằng Python hệ thống
const buildPython = process.env.BUILD_PYTHON || "python";
console.log(`Installing wheels into ${sitePackages} via ${buildPython} ...`);
const pipResult = spawnSync(
  buildPython,
  [
    "-m",
    "pip",
    "install",
    "--target",
    sitePackages,
    "--only-binary=:all:",
    "--platform",
    "win_amd64",
    "--python-version",
    "3.11",
    "--implementation",
    "cp",
    `Pillow==${PILLOW_VERSION}`,
    `numpy==${NUMPY_VERSION}`,
  ],
  { stdio: "inherit" },
);
if (pipResult.status !== 0) {
  throw new Error(`pip install thất bại với mã lỗi ${pipResult.status}`);
}

// Kiểm tra import bằng python.exe embed vừa tải
const pythonExe = path.join(outDir, "python.exe");
const testResult = spawnSync(
  pythonExe,
  ["-c", "import PIL, numpy; print(PIL.__version__, numpy.__version__)"],
  { stdio: "inherit" },
);
if (testResult.status !== 0) {
  throw new Error(`Kiểm tra import PIL, numpy thất bại (exit code ${testResult.status})`);
}

console.log(`Python embed sẵn sàng tại ${pythonExe} (Pillow ${PILLOW_VERSION}, numpy ${NUMPY_VERSION})`);
