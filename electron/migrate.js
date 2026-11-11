#!/usr/bin/env node
// Bộ chạy migration tự động cho SQLite trong môi trường Electron và dev
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const dbPath = process.argv[2];
const migrationsDir = process.argv[3];

if (!dbPath || !migrationsDir) {
  console.error("[migrate] Usage: node migrate.js <dbPath> <migrationsDir>");
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.log(`[migrate] Database file not found at ${dbPath}, skipping.`);
  process.exit(0);
}

if (!fs.existsSync(migrationsDir)) {
  console.log(`[migrate] Migrations directory not found at ${migrationsDir}, skipping.`);
  process.exit(0);
}

// Lấy chuỗi timestamp định dạng YYYYMMDD-HHmmss theo giờ local
function getLocalTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

// Giữ tối đa 3 file backup mới nhất khớp mẫu định dạng
function rotateBackups(targetDbPath) {
  const dir = path.dirname(targetDbPath);
  const base = path.basename(targetDbPath);
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedBase}\\.bak-\\d{8}-\\d{6}$`);

  const matching = fs
    .readdirSync(dir)
    .filter((f) => regex.test(f))
    .sort();

  if (matching.length > 3) {
    const toDelete = matching.slice(0, matching.length - 3);
    for (const file of toDelete) {
      try {
        fs.unlinkSync(path.join(dir, file));
      } catch (err) {
        console.warn(`[migrate] Failed to delete old backup ${file}:`, err.message);
      }
    }
  }
}

try {
  console.log(`[migrate] Checking migrations for ${dbPath}...`);
  const db = new DatabaseSync(dbPath);

  // Khởi tạo bảng _prisma_migrations nếu chưa tồn tại
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);

  // Lấy danh sách migration đã áp dụng
  const rows = db.prepare("SELECT migration_name FROM _prisma_migrations").all();
  const applied = new Set(rows.map((r) => r.migration_name));

  // Đọc danh sách thư mục migration được sắp xếp theo thời gian
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // Xác định các migration đang chờ áp dụng
  const pending = entries.filter((name) => {
    if (applied.has(name)) return false;
    const sqlFile = path.join(migrationsDir, name, "migration.sql");
    return fs.existsSync(sqlFile);
  });

  // Không có migration pending thì không tạo backup và kết thúc
  if (pending.length === 0) {
    console.log("[migrate] Auto-migration complete. 0 migration(s) applied.");
    process.exit(0);
  }

  // Tạo backup trước khi thực hiện migration
  const backupPath = `${dbPath}.bak-${getLocalTimestamp()}`;
  try {
    const escaped = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    console.log(`BACKUP_PATH=${backupPath}`);
  } catch (backupError) {
    console.error("[migrate] Backup failed before migration:", backupError.message);
    process.exit(1);
  }

  let appliedCount = 0;

  for (const migrationName of pending) {
    const sqlFile = path.join(migrationsDir, migrationName, "migration.sql");
    const sql = fs.readFileSync(sqlFile, "utf-8");
    console.log(`[migrate] Applying pending migration: ${migrationName}...`);

    try {
      // Thực thi các câu lệnh SQL của migration
      db.exec(sql);

      // Ghi nhận migration đã hoàn thành vào bảng _prisma_migrations
      const id = crypto.randomUUID();
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      db.prepare(`
        INSERT INTO "_prisma_migrations" (
          "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
        ) VALUES (
          ?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1
        )
      `).run(id, checksum, migrationName);

      appliedCount++;
      console.log(`[migrate] Successfully applied: ${migrationName}`);
    } catch (err) {
      console.error(`[migrate] Error applying ${migrationName}:`, err.message);

      // Xử lý trường hợp cột hoặc bảng đã tồn tại từ trước
      const isDuplicateError =
        err.message &&
        (err.message.includes("duplicate column") ||
          err.message.includes("already exists"));

      if (isDuplicateError) {
        console.warn(
          `[migrate] Column/table already exists (${err.message}). Marking ${migrationName} as applied.`
        );
        const id = crypto.randomUUID();
        const checksum = crypto.createHash("sha256").update(sql).digest("hex");
        db.prepare(`
          INSERT INTO "_prisma_migrations" (
            "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
          ) VALUES (
            ?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, CURRENT_TIMESTAMP, 1
          )
        `).run(id, checksum, migrationName);
        appliedCount++;
      } else {
        throw err;
      }
    }
  }

  // Chỉ xoay vòng bản backup khi toàn bộ migration đã thành công
  rotateBackups(dbPath);
  console.log(`[migrate] Auto-migration complete. ${appliedCount} migration(s) applied.`);
} catch (error) {
  console.error("[migrate] Auto-migration failed:", error);
  process.exit(1);
}
