import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";
import { resolveSafePath } from "@/lib/files/safe-output";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ name: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { name } = await params;
    if (!/^calendars_\d{8}_\d{6}_printify\.csv$/.test(name)) {
      return apiError("invalid_request", "Tên file CSV không đúng định dạng", 400);
    }

    const settings = await getOrCreateSettings();
    const finalRoot = resolveFinalRoot(resolveOutputRoot(settings));
    const exportsDir = path.join(finalRoot, "_r2_exports");
    const filePath = resolveSafePath(exportsDir, name);

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return apiError("not_found", "Không tìm thấy file export CSV", 404);
    }

    const content = await fs.readFile(filePath);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
