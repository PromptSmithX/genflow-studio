import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { censorImages } from "@/lib/censor/run-censor";

describe("censorImages local fallback", () => {
  const originalEnv = process.env.CENSOR_PYTHON;

  beforeEach(() => {
    delete process.env.CENSOR_PYTHON;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CENSOR_PYTHON = originalEnv;
    } else {
      delete process.env.CENSOR_PYTHON;
    }
  });

  it("returns empty array for empty items", async () => {
    const results = await censorImages([]);
    expect(results).toEqual([]);
  });

  it("marks all items as skipped when CENSOR_PYTHON is not set", async () => {
    const items = [
      { input: "path/to/in1.png", output: "path/to/out1.png" },
      { input: "path/to/in2.png", output: "path/to/out2.png" },
    ];
    const results = await censorImages(items);
    expect(results).toEqual([
      { input: "path/to/in1.png", output: "path/to/out1.png", status: "skipped" },
      { input: "path/to/in2.png", output: "path/to/out2.png", status: "skipped" },
    ]);
  });
});
