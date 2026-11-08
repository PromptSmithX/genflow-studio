import { NextRequest, NextResponse } from "next/server";
import { getR2Status, readR2Config } from "@/lib/r2/config";
import { createR2Client, headBucket } from "@/lib/r2/client";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const test = request.nextUrl.searchParams.get("test") === "1";
    const status = getR2Status();

    if (!test) {
      return NextResponse.json(status);
    }

    if (!status.configured) {
      return NextResponse.json({
        ...status,
        connection: "error",
        error: `Chưa cấu hình đầy đủ biến môi trường: ${status.missing.join(", ")}`,
      });
    }

    try {
      const config = readR2Config();
      const client = createR2Client(config);
      await headBucket(client, config.bucket);
      return NextResponse.json({
        ...status,
        connection: "ok",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Kết nối Cloudflare R2 thất bại";
      return NextResponse.json({
        ...status,
        connection: "error",
        error: msg,
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
