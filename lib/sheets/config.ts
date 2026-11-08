export interface SheetsConfig {
  serviceAccountFile: string;
  sheetId: string;
}

const REQUIRED_VARS = ["GOOGLE_SERVICE_ACCOUNT_FILE", "GOOGLE_SHEET_ID"] as const;

export function getSheetsStatus(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_VARS.filter((key) => {
    const val = process.env[key];
    return !val || !val.trim();
  });
  return {
    configured: missing.length === 0,
    missing: [...missing],
  };
}

export function readSheetsConfig(): SheetsConfig {
  const status = getSheetsStatus();
  if (!status.configured) {
    throw new Error(`Thiếu biến môi trường Google Sheets: ${status.missing.join(", ")}`);
  }
  return {
    serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE!.trim(),
    sheetId: process.env.GOOGLE_SHEET_ID!.trim(),
  };
}
