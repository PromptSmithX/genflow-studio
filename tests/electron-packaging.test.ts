import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Electron packaging configuration", () => {
  const rootDir = path.resolve(__dirname, "..");
  const builderYmlPath = path.join(rootDir, "electron-builder.yml");
  const mainJsPath = path.join(rootDir, "electron", "main.js");
  const migrateJsPath = path.join(rootDir, "electron", "migrate.js");

  it("electron-builder.yml có asarUnpack chứa electron/migrate.js", () => {
    const content = fs.readFileSync(builderYmlPath, "utf-8");
    const lines = content.split(/\r?\n/);
    const asarUnpackItems: string[] = [];
    let inAsarUnpack = false;

    for (const line of lines) {
      if (/^asarUnpack:\s*$/.test(line)) {
        inAsarUnpack = true;
        continue;
      }
      if (inAsarUnpack) {
        const itemMatch = line.match(/^\s*-\s*(.+)$/);
        if (itemMatch) {
          asarUnpackItems.push(itemMatch[1].trim().replace(/^['"]|['"]$/g, ""));
        } else if (/^[a-zA-Z0-9_-]+:/.test(line)) {
          break;
        }
      }
    }

    expect(asarUnpackItems).toContain("electron/migrate.js");
  });

  it("electron/main.js có app.asar.unpacked và migrate.js trong nhánh packaged", () => {
    const mainContent = fs.readFileSync(mainJsPath, "utf-8");
    expect(mainContent).toContain("app.asar.unpacked");
    expect(mainContent).toContain("migrate.js");
    expect(mainContent).toMatch(/app\.isPackaged[\s\S]*?app\.asar\.unpacked[\s\S]*?migrate\.js/);
  });

  it("electron/migrate.js chỉ require built-in modules dạng node:*", () => {
    const migrateContent = fs.readFileSync(migrateJsPath, "utf-8");
    const requireMatches = [...migrateContent.matchAll(/require\(["']([^"']+)["']\)/g)];

    expect(requireMatches.length).toBeGreaterThan(0);
    for (const match of requireMatches) {
      const moduleName = match[1];
      expect(moduleName.startsWith("node:")).toBe(true);
    }
  });

  it("electron-builder.yml có extraResources chứa resources/python", () => {
    const content = fs.readFileSync(builderYmlPath, "utf-8");
    expect(content).toMatch(/-\s*from:\s*resources\/python/);
  });

  it("scripts/prepare-electron-resources.mjs copy mockup_templates", () => {
    const prepareScriptPath = path.join(rootDir, "scripts", "prepare-electron-resources.mjs");
    const content = fs.readFileSync(prepareScriptPath, "utf-8");
    expect(content).toContain("mockup_templates");
  });

  it("assets/mockup_templates/Context Covers.png tồn tại trong repo", () => {
    const coverPath = path.join(rootDir, "assets", "mockup_templates", "Context Covers.png");
    expect(fs.existsSync(coverPath)).toBe(true);
  });
});
