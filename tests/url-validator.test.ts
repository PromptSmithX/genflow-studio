import { describe, expect, it } from "vitest";
import { parseComfyBaseUrl } from "@/lib/validations/url";

describe("parseComfyBaseUrl", () => {
  it("accepts a valid https URL and strips trailing slash", () => {
    const result = parseComfyBaseUrl("https://abc123.loca.lt/");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://abc123.loca.lt");
  });

  it("accepts a valid http URL", () => {
    const result = parseComfyBaseUrl("http://localhost:8188");
    expect(result.ok).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = parseComfyBaseUrl("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const result = parseComfyBaseUrl("not a url");
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported schemes like file:// or ftp://", () => {
    expect(parseComfyBaseUrl("file:///etc/passwd").ok).toBe(false);
    expect(parseComfyBaseUrl("ftp://example.com").ok).toBe(false);
  });
});
