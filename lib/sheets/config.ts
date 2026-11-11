export type SheetsAuthSource =
  | { credentials: Record<string, unknown>; serviceAccountFile?: undefined }
  | { serviceAccountFile: string; credentials?: undefined };

export type SheetsConfig = SheetsAuthSource & {
  sheetId: string;
};

// Kiểm tra trạng thái cấu hình Google Sheets từ biến môi trường
export function getSheetsStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const saFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!saJson && !saFile) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_SERVICE_ACCOUNT_FILE");
  }
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!sheetId) {
    missing.push("GOOGLE_SHEET_ID");
  }
  return {
    configured: missing.length === 0,
    missing,
  };
}

// Đọc cấu hình Google Sheets từ JSON (ưu tiên) hoặc đường dẫn file
export function readSheetsConfig(): SheetsConfig {
  const status = getSheetsStatus();
  if (!status.configured) {
    throw new Error(`Thiếu biến môi trường Google Sheets: ${status.missing.join(", ")}`);
  }
  const sheetId = process.env.GOOGLE_SHEET_ID!.trim();
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (saJson) {
    try {
      const credentials = JSON.parse(saJson);
      return { credentials, sheetId };
    } catch (err) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ: ${(err as Error).message}`);
    }
  }
  return {
    serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE!.trim(),
    sheetId,
  };
}
