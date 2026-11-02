import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { listCalendarFormats } from "@/lib/calendar/formats";

export const runtime = "nodejs";

export async function GET() {
  try {
    const formats = await listCalendarFormats();
    return NextResponse.json({ formats });
  } catch (error) {
    return handleApiError(error);
  }
}
