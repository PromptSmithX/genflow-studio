import { PRINTIFY_HEADER } from "@/lib/r2/csv";
import { fullSku } from "@/lib/r2/sku";

export const SHEET_TAB_DA_CHE = "da-che";
export const SHEET_TAB_KHONG_CHE = "khong-che";

export const EXTRA_SHEET_COLUMNS = ["Status", "Updated", "Thumbnail"] as const;

export const FULL_SHEET_HEADER = [...PRINTIFY_HEADER, ...EXTRA_SHEET_COLUMNS];

export function columnToLetter(colIndex: number): string {
  let temp = colIndex + 1;
  let letter = "";
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

export function formatLocalIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const timezoneOffset = -date.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(timezoneOffset) / 60));
  const offsetMinutes = pad(Math.abs(timezoneOffset) % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

export interface SplitRowsResult {
  [SHEET_TAB_DA_CHE]: string[][];
  [SHEET_TAB_KHONG_CHE]: string[][];
}

export function splitAndEnrichRows(
  rows: string[][],
  options?: { status?: string; updated?: string },
): SplitRowsResult {
  const status = options?.status ?? "Đã đẩy";
  const updated = options?.updated ?? formatLocalIso();

  const result: SplitRowsResult = {
    [SHEET_TAB_DA_CHE]: [],
    [SHEET_TAB_KHONG_CHE]: [],
  };

  for (const row of rows) {
    const sku = row[0] ?? "";
    const page01Url = row[1] ?? "";
    const thumbnail = page01Url ? `=IMAGE("${page01Url}")` : "";

    const enrichedRow = [...row, status, updated, thumbnail];

    if (sku.endsWith("-CEN")) {
      result[SHEET_TAB_DA_CHE].push(enrichedRow);
    } else if (sku.endsWith("-ORG")) {
      result[SHEET_TAB_KHONG_CHE].push(enrichedRow);
    }
  }

  return result;
}

export function buildErrorRowsForTabs(
  skuBase: string,
  title: string,
  errorMessage: string,
  options?: { updated?: string },
): SplitRowsResult {
  const status = errorMessage.startsWith("Lỗi:") ? errorMessage : `Lỗi: ${errorMessage}`;
  const updated = options?.updated ?? formatLocalIso();

  const makeErrorRow = (sku: string): string[] => {
    const row = new Array<string>(FULL_SHEET_HEADER.length).fill("");
    row[0] = sku;
    row[23] = title;
    row[26] = status;
    row[27] = updated;
    return row;
  };

  return {
    [SHEET_TAB_DA_CHE]: [
      makeErrorRow(fullSku(skuBase, "11", "CEN")),
      makeErrorRow(fullSku(skuBase, "14", "CEN")),
    ],
    [SHEET_TAB_KHONG_CHE]: [
      makeErrorRow(fullSku(skuBase, "11", "ORG")),
      makeErrorRow(fullSku(skuBase, "14", "ORG")),
    ],
  };
}
