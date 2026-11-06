import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRINTIFY_HEADER,
  escapeCsvField,
  buildCsv,
  buildRowsForBatch,
  type BatchUrlsInput,
} from "@/lib/r2/csv";

describe("r2-csv", () => {
  it("matches line 1 of the template file verbatim", async () => {
    const templatePath = path.join(
      process.cwd(),
      "templates",
      "printify_calendar_template.csv",
    );
    const content = await fs.readFile(templatePath, "utf-8");
    const firstLine = content.split(/\r?\n/)[0];

    expect(PRINTIFY_HEADER.join(",")).toBe(firstLine);
    expect(PRINTIFY_HEADER).toHaveLength(26);
  });

  describe("escapeCsvField", () => {
    it("leaves simple string without special characters unquoted", () => {
      expect(escapeCsvField("CAL-ANI-2611-SF4U7")).toBe("CAL-ANI-2611-SF4U7");
      expect(escapeCsvField("")).toBe("");
      expect(escapeCsvField(null)).toBe("");
      expect(escapeCsvField(undefined)).toBe("");
    });

    it("quotes fields containing comma", () => {
      expect(escapeCsvField("tag1, tag2")).toBe('"tag1, tag2"');
    });

    it("quotes fields containing double quotes and doubles them", () => {
      expect(escapeCsvField('Mother "Day" Gift')).toBe('"Mother ""Day"" Gift"');
    });

    it("quotes fields containing newlines", () => {
      expect(escapeCsvField("line 1\nline 2")).toBe('"line 1\nline 2"');
      expect(escapeCsvField("line 1\r\nline 2")).toBe('"line 1\r\nline 2"');
    });
  });

  describe("buildRowsForBatch", () => {
    it("generates exactly 4 rows in order 11-CEN, 11-ORG, 14-CEN, 14-ORG with 26 columns each", () => {
      const mockPages14 = Array.from({ length: 14 }, (_, i) => `https://r2.dev/p${i}.png`);
      const mockPreviews5 = Array.from({ length: 5 }, (_, i) => `https://r2.dev/prev${i}.png`);

      const input: BatchUrlsInput = {
        skuBase: "CAL-ANI-2611-SF4U7",
        etsyTitle: "Cozy Anime Calendar 2027",
        etsyDescription: "A nice calendar description.",
        etsyTagsJson: JSON.stringify(["anime calendar", "gift for her"]),
        pages: {
          "11": { cen: [...mockPages14], org: [...mockPages14] },
          "14": { cen: [...mockPages14], org: [...mockPages14] },
        },
        previews: mockPreviews5,
      };

      const rows = buildRowsForBatch(input);
      expect(rows).toHaveLength(4);

      // Verify SKU order
      expect(rows[0][0]).toBe("CAL-ANI-2611-SF4U7-11-CEN");
      expect(rows[1][0]).toBe("CAL-ANI-2611-SF4U7-11-ORG");
      expect(rows[2][0]).toBe("CAL-ANI-2611-SF4U7-14-CEN");
      expect(rows[3][0]).toBe("CAL-ANI-2611-SF4U7-14-ORG");

      // Verify each row has exactly 26 columns
      for (const row of rows) {
        expect(row).toHaveLength(26);

        // Previews 1..5 have URLs
        expect(row[15]).toBe("https://r2.dev/prev0.png");
        expect(row[16]).toBe("https://r2.dev/prev1.png");
        expect(row[17]).toBe("https://r2.dev/prev2.png");
        expect(row[18]).toBe("https://r2.dev/prev3.png");
        expect(row[19]).toBe("https://r2.dev/prev4.png");

        // Previews 6..8 must be empty string
        expect(row[20]).toBe("");
        expect(row[21]).toBe("");
        expect(row[22]).toBe("");

        // Title
        expect(row[23]).toBe("Cozy Anime Calendar 2027");

        // Description HTML
        expect(row[24]).toBe("<p>A nice calendar description.</p>");

        // Tags joined by comma-space
        expect(row[25]).toBe("anime calendar, gift for her");
      }
    });
  });

  describe("buildCsv", () => {
    it("produces valid CSV string ending with newline", () => {
      const csv = buildCsv([["val1", "val2,with comma", 'val3 "quote"']]);
      const lines = csv.split("\n");
      expect(lines[0]).toBe(PRINTIFY_HEADER.join(","));
      expect(lines[1]).toBe('val1,"val2,with comma","val3 ""quote"""');
      expect(csv.endsWith("\n")).toBe(true);
    });
  });
});
