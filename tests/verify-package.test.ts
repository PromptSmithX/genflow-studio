import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { verifyPackage } from "../scripts/verify-package.mjs";

function setupFixture(rootDir: string) {
  // Tạo cây thư mục hợp lệ tối thiểu cho đóng gói
  const dirs = [
    path.join(rootDir, "resources", "node"),
    path.join(rootDir, "resources", "python"),
    path.join(rootDir, "resources", "template", "migrations"),
    path.join(rootDir, "resources", "secrets"),
    path.join(rootDir, "resources", "app", "scripts", "mockup"),
    path.join(rootDir, "resources", "app", "scripts", "censor"),
    path.join(rootDir, "resources", "app", "assets", "mockup_templates"),
    path.join(rootDir, "resources", "app", "Printify_Premade_Grid_Calendar_Templates", "wall_11x8_5"),
    path.join(rootDir, "electron"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Tạo các file bắt buộc
  fs.writeFileSync(path.join(rootDir, "resources", "node", "node.exe"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "python", "python.exe"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "template", "anima.sqlite"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "secrets", "secrets.enc"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "app", "server.js"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "app", "scripts", "mockup", "wrap_mockup.py"), "");
  fs.writeFileSync(path.join(rootDir, "resources", "app", "scripts", "censor", "censor.py"), "");

  const templates = [
    "Context Covers.png",
    "Context Q1.png",
    "Context Q2.png",
    "Context Q3.png",
    "Context Q4.png",
  ];
  for (const tpl of templates) {
    fs.writeFileSync(path.join(rootDir, "resources", "app", "assets", "mockup_templates", tpl), "");
  }

  fs.writeFileSync(
    path.join(rootDir, "resources", "app", "Printify_Premade_Grid_Calendar_Templates", "wall_11x8_5", "format.json"),
    "{}"
  );
  fs.writeFileSync(path.join(rootDir, "electron", "migrate.js"), "");
}

describe("verifyPackage gatekeeper", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-pkg-test-"));
    setupFixture(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("thư mục tạm đủ file → không lỗi", () => {
    const result = verifyPackage(tmpDir, { skipExec: true });
    expect(result.errors).toEqual([]);
  });

  it("thiếu python.exe → lỗi chứa build:python", () => {
    fs.rmSync(path.join(tmpDir, "resources", "python", "python.exe"));
    const result = verifyPackage(tmpDir, { skipExec: true });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("build:python"))).toBe(true);
  });

  it("có resources/app/dist-electron → lỗi", () => {
    fs.mkdirSync(path.join(tmpDir, "resources", "app", "dist-electron"), { recursive: true });
    const result = verifyPackage(tmpDir, { skipExec: true });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("dist-electron"))).toBe(true);
  });

  it("có resources/app/data/x.sqlite → lỗi", () => {
    const dataDir = path.join(tmpDir, "resources", "app", "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "x.sqlite"), "");
    const result = verifyPackage(tmpDir, { skipExec: true });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("SQLite"))).toBe(true);
  });

  it("thiếu secrets.enc → chỉ cảnh báo", () => {
    fs.rmSync(path.join(tmpDir, "resources", "secrets", "secrets.enc"));
    const result = verifyPackage(tmpDir, { skipExec: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes("secrets.enc"))).toBe(true);
  });

  it("kiểm tra verifyPackage trên thư mục gốc hiện tại của repo không lỗi", () => {
    const realRoot = path.resolve(__dirname, "..");
    const result = verifyPackage(realRoot, { skipExec: false });
    expect(result.errors).toEqual([]);
  });
});
