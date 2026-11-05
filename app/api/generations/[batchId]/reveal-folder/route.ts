import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api/errors";
import { resolveSafePath } from "@/lib/files/safe-output";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ batchId: string }>;
}

/**
 * Mở Windows Explorer đúng thư mục export gọn gàng của một batch (xem
 * lib/generations/upscale-image.ts::exportBatchFolders), để người dùng không
 * rành kỹ thuật không phải tự gõ đường dẫn. Chỉ chạy được khi đã xuất xong
 * ("finalExportStatus" === "done"); path luôn đi qua `resolveSafePath` nên
 * không thể trỏ ra ngoài finalRoot. Không await exit code của explorer.exe --
 * nó trả về mã khác 0 ngay cả khi mở thành công.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { batchId } = await params;
    const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return apiError("not_found", "Không tìm thấy batch", 404);
    if (batch.finalExportStatus !== "done" || !batch.finalExportRelativePath) {
      return apiError("not_found", "Batch này chưa xuất file in", 404);
    }

    const settings = await getOrCreateSettings();
    const finalRoot = resolveFinalRoot(resolveOutputRoot(settings));
    let folderPath = resolveSafePath(finalRoot, batch.finalExportRelativePath);

    const sub = request.nextUrl.searchParams.get("folder");
    if (sub === "mockup") {
      const subPath = resolveSafePath(folderPath, "mockup");
      const subStat = await fs.stat(subPath).catch(() => null);
      if (subStat?.isDirectory()) {
        folderPath = subPath;
      }
    }

    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat?.isDirectory()) {
      return apiError("not_found", "Không tìm thấy thư mục đã xuất trên đĩa", 404);
    }

    spawn("explorer.exe", [folderPath], { detached: true, stdio: "ignore" }).unref();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
