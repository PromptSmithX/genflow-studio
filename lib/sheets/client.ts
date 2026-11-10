import { GoogleAuth } from "google-auth-library";

export interface AccessTokenConfig {
  credentials?: Record<string, unknown>;
  serviceAccountFile?: string;
}

// Lấy access token từ Google service account qua JSON credentials hoặc keyFile
export async function getAccessToken(config: AccessTokenConfig | string): Promise<string> {
  let auth: GoogleAuth;
  if (typeof config === "string") {
    auth = new GoogleAuth({
      keyFile: config,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else if (config.credentials) {
    auth = new GoogleAuth({
      credentials: config.credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else if (config.serviceAccountFile) {
    auth = new GoogleAuth({
      keyFile: config.serviceAccountFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else {
    throw new Error("Cấu hình xác thực Google Sheets không hợp lệ");
  }

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error("Không thể lấy access token từ Google service account");
  }
  return tokenResponse.token;
}

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function fetchSheetsApi(
  accessToken: string,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Google Sheets API lỗi (${res.status}): ${errorBody}`);
  }

  return res;
}

export async function getSheetTitles(accessToken: string, sheetId: string): Promise<string[]> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}?fields=sheets.properties`;
  const res = await fetchSheetsApi(accessToken, url);
  const data = (await res.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  return (data.sheets || [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === "string");
}

export async function addSheetTab(
  accessToken: string,
  sheetId: string,
  title: string,
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}:batchUpdate`;
  await fetchSheetsApi(accessToken, url, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: { title },
          },
        },
      ],
    }),
  });
}

export async function getColumnValues(
  accessToken: string,
  sheetId: string,
  title: string,
  col = "A",
): Promise<string[]> {
  const range = `'${title}'!${col}:${col}`;
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetchSheetsApi(accessToken, url);
  const data = (await res.json()) as { values?: string[][] };
  return (data.values || []).map((row) => (row && row[0] !== undefined ? String(row[0]) : ""));
}

export async function updateRange(
  accessToken: string,
  sheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  await fetchSheetsApi(accessToken, url, {
    method: "PUT",
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values,
    }),
  });
}

export async function appendRange(
  accessToken: string,
  sheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await fetchSheetsApi(accessToken, url, {
    method: "POST",
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values,
    }),
  });
}
