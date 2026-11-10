import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseSync } from "node:sqlite";

const hasNodeSqlite = typeof DatabaseSync === "function";
const runDescribe = hasNodeSqlite ? describe : describe.skip;

runDescribe("electron/migrate.js", () => {
  const scriptPath = path.resolve(__dirname, "../electron/migrate.js");

  function setupEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anima-migrate-test-"));
    const dbPath = path.join(tmpDir, "anima.sqlite");
    const migrationsDir = path.join(tmpDir, "prisma-migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });

    const db = new DatabaseSync(dbPath);
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
    db.close();

    return { tmpDir, dbPath, migrationsDir };
  }

  function cleanup(tmpDir: string) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  it("(1) DB co 1 migration da ap + 1 migration moi hop le -> tao backup, exit 0, migrate thanh cong", () => {
    const { tmpDir, dbPath, migrationsDir } = setupEnv();
    try {
      // Đánh dấu migration ban đầu đã được áp dụng
      const db = new DatabaseSync(dbPath);
      db.exec(`CREATE TABLE initial_tbl (id INTEGER PRIMARY KEY);`);
      db.prepare(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
        VALUES ('id-init', 'chk-init', CURRENT_TIMESTAMP, '20260101000000_init', 1)
      `).run();
      db.close();

      // Thư mục migration ban đầu
      const initFolder = path.join(migrationsDir, "20260101000000_init");
      fs.mkdirSync(initFolder, { recursive: true });
      fs.writeFileSync(path.join(initFolder, "migration.sql"), "CREATE TABLE initial_tbl (id INTEGER PRIMARY KEY);");

      // Thư mục migration mới
      const newFolder = path.join(migrationsDir, "20260102000000_new_feature");
      fs.mkdirSync(newFolder, { recursive: true });
      fs.writeFileSync(path.join(newFolder, "migration.sql"), "CREATE TABLE feature_tbl (title TEXT);");

      const result = spawnSync(process.execPath, [scriptPath, dbPath, migrationsDir], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BACKUP_PATH=");

      // Kiểm tra có đúng 1 file backup
      const backups = fs.readdirSync(tmpDir).filter((f) => /^anima\.sqlite\.bak-\d{8}-\d{6}$/.test(f));
      expect(backups.length).toBe(1);

      // Kiểm tra migration mới đã được áp dụng vào DB
      const verifyDb = new DatabaseSync(dbPath);
      const rows = verifyDb.prepare("SELECT migration_name FROM _prisma_migrations").all() as { migration_name: string }[];
      expect(rows.map((r) => r.migration_name)).toContain("20260102000000_new_feature");

      // Bảng mới được tạo
      const tableCheck = verifyDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feature_tbl'")
        .all();
      expect(tableCheck.length).toBe(1);
      verifyDb.close();
    } finally {
      cleanup(tmpDir);
    }
  });

  it("(2) Khong co migration pending -> exit 0, khong tao backup", () => {
    const { tmpDir, dbPath, migrationsDir } = setupEnv();
    try {
      const db = new DatabaseSync(dbPath);
      db.prepare(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
        VALUES ('id-init', 'chk-init', CURRENT_TIMESTAMP, '20260101000000_init', 1)
      `).run();
      db.close();

      const initFolder = path.join(migrationsDir, "20260101000000_init");
      fs.mkdirSync(initFolder, { recursive: true });
      fs.writeFileSync(path.join(initFolder, "migration.sql"), "CREATE TABLE initial_tbl (id INTEGER PRIMARY KEY);");

      const result = spawnSync(process.execPath, [scriptPath, dbPath, migrationsDir], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain("BACKUP_PATH=");

      const backups = fs.readdirSync(tmpDir).filter((f) => f.includes(".bak-"));
      expect(backups.length).toBe(0);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("(3) Migration SQL sai cu phap -> exit 1, backup van duoc tao truoc do", () => {
    const { tmpDir, dbPath, migrationsDir } = setupEnv();
    try {
      const badFolder = path.join(migrationsDir, "20260102000000_bad_syntax");
      fs.mkdirSync(badFolder, { recursive: true });
      fs.writeFileSync(path.join(badFolder, "migration.sql"), "INVALID SQL SYNTAX AT ALL !!!;");

      const result = spawnSync(process.execPath, [scriptPath, dbPath, migrationsDir], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("BACKUP_PATH=");

      const backups = fs.readdirSync(tmpDir).filter((f) => /^anima\.sqlite\.bak-\d{8}-\d{6}$/.test(f));
      expect(backups.length).toBe(1);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("(4) Tao san 4 file .bak-<timestamp> gia + 1 file .backup-before-migration-fix -> con dung 3 file .bak-* moi nhat, giu nguyen file backup cu", () => {
    const { tmpDir, dbPath, migrationsDir } = setupEnv();
    try {
      // Tạo 4 file .bak giả
      fs.writeFileSync(path.join(tmpDir, "anima.sqlite.bak-20260101-100001"), "bak1");
      fs.writeFileSync(path.join(tmpDir, "anima.sqlite.bak-20260101-100002"), "bak2");
      fs.writeFileSync(path.join(tmpDir, "anima.sqlite.bak-20260101-100003"), "bak3");
      fs.writeFileSync(path.join(tmpDir, "anima.sqlite.bak-20260101-100004"), "bak4");

      // Tạo file backup cũ đặc thù
      const specialBackup = path.join(tmpDir, "anima.sqlite.backup-before-migration-fix");
      fs.writeFileSync(specialBackup, "special");

      // 1 migration pending hợp lệ
      const newFolder = path.join(migrationsDir, "20260102000000_valid_step");
      fs.mkdirSync(newFolder, { recursive: true });
      fs.writeFileSync(path.join(newFolder, "migration.sql"), "CREATE TABLE step_tbl (id INT);");

      const result = spawnSync(process.execPath, [scriptPath, dbPath, migrationsDir], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);

      // File đặc thù vẫn còn nguyên
      expect(fs.existsSync(specialBackup)).toBe(true);

      // Danh sách các file .bak khớp mẫu chỉ còn đúng 3 file mới nhất
      const remainingBackups = fs
        .readdirSync(tmpDir)
        .filter((f) => /^anima\.sqlite\.bak-\d{8}-\d{6}$/.test(f))
        .sort();

      expect(remainingBackups.length).toBe(3);
      // Hai file cũ nhất đã bị xóa
      expect(remainingBackups).not.toContain("anima.sqlite.bak-20260101-100001");
      expect(remainingBackups).not.toContain("anima.sqlite.bak-20260101-100002");
      // Hai file giả mới hơn vẫn còn
      expect(remainingBackups).toContain("anima.sqlite.bak-20260101-100003");
      expect(remainingBackups).toContain("anima.sqlite.bak-20260101-100004");
    } finally {
      cleanup(tmpDir);
    }
  });
});
