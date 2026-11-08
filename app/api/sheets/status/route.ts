import { NextResponse } from "next/server";
import { getSheetsStatus } from "@/lib/sheets/config";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = getSheetsStatus();
    return NextResponse.json(status);
  } catch (error) {
    return handleApiError(error);
  }
}
