#!/usr/bin/env node
// Auto-migration runner for SQLite in packaged Electron and dev environments.
// Runs using Node.js built-in `node:sqlite` (DatabaseSync), requiring no external
// Prisma CLI at runtime on the user's machine.
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

try {
  console.log(`[migrate] Checking migrations for ${dbPath}...`);
  const db = new DatabaseSync(dbPath);

  // Ensure _prisma_migrations table exists
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

  // Query already applied migrations
  const rows = db.prepare("SELECT migration_name FROM _prisma_migrations").all();
  const applied = new Set(rows.map((r) => r.migration_name));

  // Read migration folders sorted by timestamp name (YYYYMMDDHHMMSS_name)
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let appliedCount = 0;

  for (const migrationName of entries) {
    if (applied.has(migrationName)) {
      continue;
    }

    const sqlFile = path.join(migrationsDir, migrationName, "migration.sql");
    if (!fs.existsSync(sqlFile)) {
      continue;
    }

    const sql = fs.readFileSync(sqlFile, "utf-8");
    console.log(`[migrate] Applying pending migration: ${migrationName}...`);

    try {
      // Execute the migration statements
      db.exec(sql);

      // Record successful application in _prisma_migrations
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

      // If column/table already exists (e.g. from previous manual fix or partial apply),
      // record it so subsequent migrations are not permanently blocked.
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

  console.log(`[migrate] Auto-migration complete. ${appliedCount} migration(s) applied.`);
} catch (error) {
  console.error("[migrate] Auto-migration failed:", error);
  process.exit(1);
}
