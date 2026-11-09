import { NextResponse } from "next/server";
import { getSheetsStatus, readSheetsConfig } from "@/lib/sheets/config";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = getSheetsStatus();
    let sheetUrl: string | null = null;
    if (status.configured) {
      try {
        const config = readSheetsConfig();
        sheetUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}`;
      } catch {
        sheetUrl = null;
      }
    }
    return NextResponse.json({
      ...status,
      sheetUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
