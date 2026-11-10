// Electron shell for Anima Studio. Spawns the Next.js standalone server as a
// child process (with a bundled portable Node binary, not Electron's own --
// see scripts/download-node.mjs for why), waits for it to come up, then opens
// a BrowserWindow pointed at it. No code here runs in the renderer; it only
// manages the child process and the window.
const { app, BrowserWindow, dialog } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { decrypt } = require("./secrets-crypto");

const SECRETS_WHITELIST = new Set([
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

let serverProcess = null;
let mainWindow = null;

function getPaths() {
  if (app.isPackaged) {
    const resourcesDir = process.resourcesPath;
    return {
      nodeBinary: path.join(resourcesDir, "node", "node.exe"),
      serverDir: path.join(resourcesDir, "app"),
      templateDb: path.join(resourcesDir, "template", "anima.sqlite"),
      templateWorkflowDir: path.join(resourcesDir, "template", "workflows"),
      migrationsDir: path.join(resourcesDir, "template", "migrations"),
      migrateScript: path.join(__dirname, "migrate.js"),
      secretsFile: path.join(resourcesDir, "secrets", "secrets.enc"),
    };
  }
  // Dev convenience path: `npm run build` then `npm run electron:dev`, using
  // the project's own .next/standalone + the system `node` on PATH. Native
  // addons only work here if the dev machine's Node matches what the
  // dependencies were installed against -- fine for local testing, not what
  // ships to users.
  const root = path.join(__dirname, "..");
  return {
    nodeBinary: "node",
    serverDir: path.join(root, ".next", "standalone"),
    templateDb: path.join(root, "resources", "template", "anima.sqlite"),
    templateWorkflowDir: path.join(root, "resources", "template", "workflows"),
    migrationsDir: path.join(root, "prisma", "migrations"),
    migrateScript: path.join(__dirname, "migrate.js"),
    secretsFile: path.join(root, "resources", "secrets", "secrets.enc"),
  };
}

// Giải mã secrets nhúng từ file secrets.enc nếu tồn tại
function loadEmbeddedSecrets(paths) {
  if (!paths.secretsFile || !fs.existsSync(paths.secretsFile)) {
    return {};
  }
  try {
    const encryptedBuf = fs.readFileSync(paths.secretsFile);
    const decrypted = decrypt(encryptedBuf);
    if (!decrypted || typeof decrypted !== "object") {
      return {};
    }
    const result = {};
    for (const [key, val] of Object.entries(decrypted)) {
      if (SECRETS_WHITELIST.has(key) && val !== null && val !== undefined) {
        result[key] = String(val);
      }
    }
    return result;
  } catch (err) {
    console.error("Không thể giải mã secrets nhúng:", err.message);
    return {};
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function ensureUserData(paths) {
  const dataRoot = app.getPath("userData");
  fs.mkdirSync(dataRoot, { recursive: true });

  const dbPath = path.join(dataRoot, "anima.sqlite");
  if (!fs.existsSync(dbPath)) {
    if (!fs.existsSync(paths.templateDb)) {
      throw new Error(`Template DB not found at ${paths.templateDb}`);
    }
    fs.copyFileSync(paths.templateDb, dbPath);
  } else if (fs.existsSync(paths.migrationsDir) && fs.existsSync(paths.migrateScript)) {
    // Chạy migration tự động khi cập nhật phiên bản ứng dụng
    console.log("Checking for database migrations...");
    const result = spawnSync(paths.nodeBinary, [paths.migrateScript, dbPath, paths.migrationsDir], {
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
      windowsHide: true,
    });

    const stdout = result.stdout || "";
    process.stdout.write(stdout);

    let backupPath = null;
    const backupMatch = stdout.match(/^BACKUP_PATH=(.+)$/m);
    if (backupMatch) {
      backupPath = backupMatch[1].trim();
    }

    if (result.error || result.status !== 0) {
      const err = new Error(
        `Auto-migration failed with status ${result.status}${result.error ? `: ${result.error.message}` : ""}`,
      );
      err.name = "MigrationError";
      err.backupPath = backupPath;
      err.dataRoot = dataRoot;
      throw err;
    }
  }

  // Mirror of the DB copy above: the seeded WorkflowConfig row (in the
  // template DB) points at a filename that must exist under
  // userData/workflows/ on first run, or the default workflow row would be
  // orphaned (loadWorkflowJson throws ENOENT) -- see Feature 2 in the plan.
  const workflowDir = path.join(dataRoot, "workflows");
  if (!fs.existsSync(workflowDir) && fs.existsSync(paths.templateWorkflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
    for (const filename of fs.readdirSync(paths.templateWorkflowDir)) {
      fs.copyFileSync(path.join(paths.templateWorkflowDir, filename), path.join(workflowDir, filename));
    }
  }

  return { dataRoot, dbPath };
}

function waitForServer(port, { timeoutMs = 30_000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(`http://127.0.0.1:${port}/api/health`)
        .then((res) => {
          if (res.ok) resolve();
          else retry();
        })
        .catch(retry);
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("Server did not become ready in time"));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

async function startServer() {
  const paths = getPaths();
  const { dataRoot, dbPath } = ensureUserData(paths);
  const port = await getFreePort();
  const embeddedSecrets = loadEmbeddedSecrets(paths);

  serverProcess = spawn(paths.nodeBinary, [path.join(paths.serverDir, "server.js")], {
    cwd: paths.serverDir,
    env: {
      ...process.env,
      ...embeddedSecrets,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ANIMA_DATA_DIR: dataRoot,
      DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
    },
    windowsHide: true,
  });

  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  await waitForServer(port);
  return port;
}

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Anima Studio",
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

// Single-instance lock: ensure running the app/exe twice focuses the existing instance
// instead of creating multiple conflicting server processes.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow().catch((error) => {
      console.error("Failed to start Anima Studio:", error);
      if (error && error.name === "MigrationError") {
        const title = "Anima Studio — Lỗi cập nhật dữ liệu";
        const contentLines = [
          "Quá trình cập nhật cấu trúc dữ liệu không thành công.",
          "Dữ liệu của bạn chưa bị mất.",
        ];
        if (error.backupPath) {
          contentLines.push(`Bản sao lưu an toàn: ${error.backupPath}`);
        }
        if (error.dataRoot) {
          contentLines.push(`Thư mục dữ liệu: ${error.dataRoot}`);
        }
        contentLines.push("Vui lòng gửi file log hoặc liên hệ người quản lý để được hỗ trợ.");
        dialog.showErrorBox(title, contentLines.join("\n\n"));
      } else {
        const title = "Anima Studio — Không khởi động được";
        dialog.showErrorBox(title, error?.message || String(error));
      }
      app.quit();
    });
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});
