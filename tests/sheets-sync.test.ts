import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { syncBatchToSheet } from "@/lib/sheets/sync";
import { FULL_SHEET_HEADER, SHEET_TAB_DA_CHE, SHEET_TAB_KHONG_CHE } from "@/lib/sheets/rows";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("google-auth-library", () => {
  return {
    GoogleAuth: class {
      getClient() {
        return Promise.resolve({
          getAccessToken: () => Promise.resolve({ token: "mock-access-token" }),
        });
      }
    },
  };
});

describe("sheets-sync", () => {
  const origEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...origEnv };
    delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    delete process.env.GOOGLE_SHEET_ID;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("thiếu env -> console.warn và return skipped mà không throw", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await syncBatchToSheet({
      batchId: "batch-1",
      rows: [["CAL-ANI-2611-TEST-11-CEN"]],
    });

    expect(result).toBe("skipped");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Chưa cấu hình Google Sheets: GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SHEET_ID"),
    );
    expect(prisma.generationBatch.findUnique).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("tab trống -> tự động ghi header dòng 1 và append SKU mới", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = "/path/to/key.json";
    process.env.GOOGLE_SHEET_ID = "mock-sheet-id";

    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-1",
      r2SkuBase: "CAL-ANI-2611-TEST",
      etsyTitle: "Test Title",
    } as unknown as never);

    interface FetchCallRecord {
      url: string;
      method?: string;
      body?: { requests?: Array<{ addSheet: { properties: { title: string } } }>; values?: string[][] };
    }

    const fetchCalls: FetchCallRecord[] = [];

    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      const body = options?.body ? JSON.parse(options.body as string) : undefined;
      fetchCalls.push({ url, method, body });

      // getSheetTitles
      if (url.includes("?fields=sheets.properties")) {
        return {
          ok: true,
          json: async () => ({ sheets: [{ properties: { title: SHEET_TAB_DA_CHE } }] }),
        };
      }

      // batchUpdate (addSheet)
      if (url.includes(":batchUpdate")) {
        return { ok: true, json: async () => ({}) };
      }

      // getColumnValues (!A:A) -> return empty for tab trống
      if (method === "GET" && url.includes("/values/")) {
        return { ok: true, json: async () => ({ values: [] }) };
      }

      // updateRange or appendRange
      return { ok: true, json: async () => ({}) };
    });

    vi.stubGlobal("fetch", mockFetch);

    const sampleRowCen = new Array<string>(26).fill("");
    sampleRowCen[0] = "CAL-ANI-2611-TEST-11-CEN";
    sampleRowCen[1] = "https://r2/img.png";

    const sampleRowOrg = new Array<string>(26).fill("");
    sampleRowOrg[0] = "CAL-ANI-2611-TEST-11-ORG";

    const result = await syncBatchToSheet({
      batchId: "batch-1",
      rows: [sampleRowCen, sampleRowOrg],
    });

    expect(result).toBe("done");

    // Check addSheet called for khong-che (since da-che already in existingTitles)
    const addSheetCall = fetchCalls.find((c) => c.url.includes(":batchUpdate"));
    expect(addSheetCall).toBeDefined();
    expect(addSheetCall?.body?.requests?.[0]?.addSheet?.properties?.title).toBe(SHEET_TAB_KHONG_CHE);

    // Check header written
    const headerPuts = fetchCalls.filter((c) => c.method === "PUT" && c.url.includes("A1"));
    expect(headerPuts.length).toBeGreaterThanOrEqual(1);
    expect(headerPuts[0]?.body?.values?.[0]).toEqual(FULL_SHEET_HEADER);

    // Check append called
    const appendCalls = fetchCalls.filter((c) => c.method === "POST" && c.url.includes(":append"));
    expect(appendCalls.length).toBeGreaterThanOrEqual(2);

    expect(prisma.generationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({ sheetSyncedAt: expect.any(Date) }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("SKU đã có -> update đúng dòng; SKU mới -> append", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = "/path/to/key.json";
    process.env.GOOGLE_SHEET_ID = "mock-sheet-id";

    vi.mocked(prisma.generationBatch.findUnique).mockResolvedValue({
      id: "batch-1",
      r2SkuBase: "CAL-ANI-2611-TEST",
      etsyTitle: "Test Title",
    } as unknown as never);

    interface FetchCallRecord {
      url: string;
      method?: string;
      body?: { requests?: Array<{ addSheet: { properties: { title: string } } }>; values?: string[][] };
    }

    const fetchCalls: FetchCallRecord[] = [];

    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      const body = options?.body ? JSON.parse(options.body as string) : undefined;
      fetchCalls.push({ url, method, body });

      if (url.includes("?fields=sheets.properties")) {
        return {
          ok: true,
          json: async () => ({
            sheets: [
              { properties: { title: SHEET_TAB_DA_CHE } },
              { properties: { title: SHEET_TAB_KHONG_CHE } },
            ],
          }),
        };
      }

      if (method === "GET" && url.includes("/values/")) {
        // da-che has the SKU already at row 3 (index 2: ["SKU", "OLD-SKU", "CAL-ANI-2611-TEST-11-CEN"])
        if (url.includes(SHEET_TAB_DA_CHE)) {
          return {
            ok: true,
            json: async () => ({
              values: [["SKU"], ["OLD-SKU"], ["CAL-ANI-2611-TEST-11-CEN"]],
            }),
          };
        }
        // khong-che has header only
        return {
          ok: true,
          json: async () => ({
            values: [["SKU"]],
          }),
        };
      }

      return { ok: true, json: async () => ({}) };
    });

    vi.stubGlobal("fetch", mockFetch);

    const sampleRowCen = new Array<string>(26).fill("");
    sampleRowCen[0] = "CAL-ANI-2611-TEST-11-CEN";

    const sampleRowOrg = new Array<string>(26).fill("");
    sampleRowOrg[0] = "CAL-ANI-2611-TEST-11-ORG";

    const result = await syncBatchToSheet({
      batchId: "batch-1",
      rows: [sampleRowCen, sampleRowOrg],
    });

    expect(result).toBe("done");

    // da-che SKU existed at index 2 (row 3) -> PUT to A3
    const updateCall = fetchCalls.find(
      (c) => c.method === "PUT" && decodeURIComponent(c.url).includes("'da-che'!A3"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.body?.values?.[0]?.[0]).toBe("CAL-ANI-2611-TEST-11-CEN");

    // khong-che SKU was new -> POST append to A1
    const appendCall = fetchCalls.find(
      (c) => c.method === "POST" && decodeURIComponent(c.url).includes("'khong-che'!A1:append"),
    );
    expect(appendCall).toBeDefined();
    expect(appendCall?.body?.values?.[0]?.[0]).toBe("CAL-ANI-2611-TEST-11-ORG");

    vi.unstubAllGlobals();
  });
});
