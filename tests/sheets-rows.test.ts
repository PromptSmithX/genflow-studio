import { describe, expect, it } from "vitest";
import { PRINTIFY_HEADER } from "@/lib/r2/csv";
import {
  SHEET_TAB_DA_CHE,
  SHEET_TAB_KHONG_CHE,
  FULL_SHEET_HEADER,
  splitAndEnrichRows,
  buildErrorRowsForTabs,
  formatLocalIso,
} from "@/lib/sheets/rows";

describe("sheets-rows", () => {
  it("header has 29 columns (template + 3 extra columns)", () => {
    expect(FULL_SHEET_HEADER).toHaveLength(29);
    expect(FULL_SHEET_HEADER.slice(0, 26)).toEqual(PRINTIFY_HEADER);
    expect(FULL_SHEET_HEADER.slice(26)).toEqual(["Status", "Updated", "Thumbnail"]);
  });

  it("splits CEN/ORG into correct tabs with 29 columns and proper =IMAGE formula", () => {
    const makeSampleRow = (sku: string, page01Url: string) => {
      const row = new Array<string>(26).fill("");
      row[0] = sku;
      row[1] = page01Url;
      row[23] = "My Calendar Title";
      row[24] = "<p>Description</p>";
      row[25] = "tag1, tag2";
      return row;
    };

    const inputRows = [
      makeSampleRow("CAL-ANI-2611-B1OK1-11-CEN", "https://pub.r2.dev/11-cen-01.png"),
      makeSampleRow("CAL-ANI-2611-B1OK1-11-ORG", "https://pub.r2.dev/11-org-01.png"),
      makeSampleRow("CAL-ANI-2611-B1OK1-14-CEN", "https://pub.r2.dev/14-cen-01.png"),
      makeSampleRow("CAL-ANI-2611-B1OK1-14-ORG", ""),
    ];

    const result = splitAndEnrichRows(inputRows, {
      status: "Đã đẩy",
      updated: "2026-11-08T10:00:00+07:00",
    });

    expect(result[SHEET_TAB_DA_CHE]).toHaveLength(2);
    expect(result[SHEET_TAB_KHONG_CHE]).toHaveLength(2);

    const daCheFirst = result[SHEET_TAB_DA_CHE][0];
    expect(daCheFirst).toHaveLength(29);
    expect(daCheFirst[0]).toBe("CAL-ANI-2611-B1OK1-11-CEN");
    expect(daCheFirst[26]).toBe("Đã đẩy");
    expect(daCheFirst[27]).toBe("2026-11-08T10:00:00+07:00");
    expect(daCheFirst[28]).toBe('=IMAGE("https://pub.r2.dev/11-cen-01.png")');

    const khongCheSecond = result[SHEET_TAB_KHONG_CHE][1];
    expect(khongCheSecond).toHaveLength(29);
    expect(khongCheSecond[0]).toBe("CAL-ANI-2611-B1OK1-14-ORG");
    expect(khongCheSecond[28]).toBe(""); // empty because page01 was empty
  });

  it("builds error rows with correct format and columns", () => {
    const errorResult = buildErrorRowsForTabs(
      "CAL-ANI-2611-B1OK1",
      "Broken Calendar Title",
      "Lỗi render ảnh mockup",
      { updated: "2026-11-08T10:15:00+07:00" },
    );

    expect(errorResult[SHEET_TAB_DA_CHE]).toHaveLength(2);
    expect(errorResult[SHEET_TAB_KHONG_CHE]).toHaveLength(2);

    const row11Cen = errorResult[SHEET_TAB_DA_CHE][0];
    const row14Cen = errorResult[SHEET_TAB_DA_CHE][1];
    expect(row11Cen).toHaveLength(29);
    expect(row11Cen[0]).toBe("CAL-ANI-2611-B1OK1-11-CEN");
    expect(row14Cen[0]).toBe("CAL-ANI-2611-B1OK1-14-CEN");

    expect(row11Cen[23]).toBe("Broken Calendar Title");
    expect(row11Cen[26]).toBe("Lỗi: Lỗi render ảnh mockup");
    expect(row11Cen[27]).toBe("2026-11-08T10:15:00+07:00");

    // All other columns should be empty
    for (let i = 1; i <= 22; i++) {
      expect(row11Cen[i]).toBe("");
    }
    expect(row11Cen[24]).toBe("");
    expect(row11Cen[25]).toBe("");
    expect(row11Cen[28]).toBe("");

    const row11Org = errorResult[SHEET_TAB_KHONG_CHE][0];
    expect(row11Org[0]).toBe("CAL-ANI-2611-B1OK1-11-ORG");
    expect(row11Org[23]).toBe("Broken Calendar Title");
    expect(row11Org[26]).toBe("Lỗi: Lỗi render ảnh mockup");
  });

  it("formatLocalIso returns ISO string with offset", () => {
    const iso = formatLocalIso(new Date());
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
