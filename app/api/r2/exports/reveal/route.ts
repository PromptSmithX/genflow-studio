import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { getOrCreateSettings } from "@/lib/settings";
import { resolveOutputRoot, resolveFinalRoot } from "@/lib/output-dir";

export const runtime = "nodejs";

export async function POST() {
  try {
    const settings = await getOrCreateSettings();
    const finalRoot = resolveFinalRoot(resolveOutputRoot(settings));
    const exportsDir = path.join(finalRoot, "_r2_exports");

    await fs.mkdir(exportsDir, { recursive: true });

    spawn("explorer.exe", [exportsDir], { detached: true, stdio: "ignore" }).unref();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
