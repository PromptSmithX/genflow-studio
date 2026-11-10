// Electron shell for Anima Studio. Spawns the Next.js standalone server as a
// child process (with a bundled portable Node binary, not Electron's own --
// see scripts/download-node.mjs for why), waits for it to come up, then opens
// a BrowserWindow pointed at it. No code here runs in the renderer; it only
// manages the child process and the window.
const { app, BrowserWindow } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

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
  };
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
    // Existing DB: run automatic migrations to apply any schema updates from the new version
    console.log("Checking for database migrations...");
    try {
      const result = spawnSync(paths.nodeBinary, [paths.migrateScript, dbPath, paths.migrationsDir], {
        stdio: "inherit",
        windowsHide: true,
      });
      if (result.status !== 0) {
        console.error("Auto-migration process exited with code:", result.status);
      }
    } catch (err) {
      console.error("Failed to run auto-migration:", err);
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

  serverProcess = spawn(paths.nodeBinary, [path.join(paths.serverDir, "server.js")], {
    cwd: paths.serverDir,
    env: {
      ...process.env,
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
