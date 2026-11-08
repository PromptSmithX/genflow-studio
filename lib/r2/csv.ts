import { fullSku } from "./sku";
import { plainToHtml } from "./description-html";

export const PRINTIFY_HEADER: readonly string[] = [
  "SKU",
  "Page 01 front_cover",
  "Page 02 m01_month",
  "Page 03 m02_month",
  "Page 04 m03_month",
  "Page 05 m04_month",
  "Page 6 m05_month",
  "Page 7 m06_month",
  "Page 8 m07_month",
  "Page 9 m08_month",
  "Page 10 m09_month",
  "Page 11 m10_month",
  "Page 12 m11_month",
  "Page 13 m12_month",
  "Page 14 back_cover",
  "Preview 1",
  "Preview 2",
  "Preview 3",
  "Preview 4",
  "Preview 5",
  "Preview 6",
  "Preview 7",
  "Preview 8",
  "Title",
  "Description (HTML)",
  "Tags",
];

export function escapeCsvField(val: string | null | undefined): string {
  const str = val ?? "";
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(rows: string[][]): string {
  const headerLine = PRINTIFY_HEADER.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n") + "\n";
}

export interface BatchUrlsInput {
  skuBase: string;
  etsyTitle?: string | null;
  etsyDescription?: string | null;
  etsyTagsJson?: string | null;
  pages: {
    "11": { cen: string[]; org: string[] };
    "14": { cen: string[]; org: string[] };
  };
  previews: string[];
}

export function formatTags(tagsJson?: string | null): string {
  if (!tagsJson) return "";
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string").join(", ");
    }
  } catch {
    return "";
  }
  return "";
}

export function buildRowsForBatch(input: BatchUrlsInput): string[][] {
  const { skuBase, etsyTitle, etsyDescription, etsyTagsJson, pages, previews } = input;
  const title = etsyTitle ?? "";
  const descriptionHtml = plainToHtml(etsyDescription);
  const tags = formatTags(etsyTagsJson);

  const previewCols = [
    previews[0] ?? "",
    previews[1] ?? "",
    previews[2] ?? "",
    previews[3] ?? "",
    previews[4] ?? "",
    "",
    "",
    "",
  ];

  const variants: Array<{ size: "11" | "14"; variant: "CEN" | "ORG" }> = [
    { size: "11", variant: "CEN" },
    { size: "11", variant: "ORG" },
    { size: "14", variant: "CEN" },
    { size: "14", variant: "ORG" },
  ];

  return variants.map(({ size, variant }) => {
    const sku = fullSku(skuBase, size, variant);
    const pageUrls = variant === "CEN" ? pages[size].cen : pages[size].org;

    return [sku, ...pageUrls, ...previewCols, title, descriptionHtml, tags];
  });
}
