import { prisma } from "@/lib/db";
import { getSheetsStatus, readSheetsConfig } from "./config";
import {
  getAccessToken,
  getSheetTitles,
  addSheetTab,
  getColumnValues,
  updateRange,
  appendRange,
} from "./client";
import {
  SHEET_TAB_DA_CHE,
  SHEET_TAB_KHONG_CHE,
  FULL_SHEET_HEADER,
  columnToLetter,
  splitAndEnrichRows,
  buildErrorRowsForTabs,
  type SplitRowsResult,
} from "./rows";

export interface SyncBatchToSheetOptions {
  batchId: string;
  rows?: string[][];
  error?: string;
}

export type SheetSyncResult = "done" | "skipped";

export async function syncBatchToSheet(options: SyncBatchToSheetOptions): Promise<SheetSyncResult> {
  const status = getSheetsStatus();
  if (!status.configured) {
    console.warn(`Chưa cấu hình Google Sheets: ${status.missing.join(", ")}`);
    return "skipped";
  }

  const { batchId, rows, error } = options;
  const batch = await prisma.generationBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new Error(`Không tìm thấy batch "${batchId}"`);
  }

  let splitRows: SplitRowsResult;
  let isErrorMode = false;
  if (rows && rows.length > 0) {
    splitRows = splitAndEnrichRows(rows);
  } else if (error && batch.r2SkuBase) {
    isErrorMode = true;
    splitRows = buildErrorRowsForTabs(batch.r2SkuBase, batch.etsyTitle ?? "", error);
  } else {
    return "skipped";
  }

  const config = readSheetsConfig();
  const accessToken = await getAccessToken(config);
  const existingTitles = await getSheetTitles(accessToken, config.sheetId);

  const statusIndex = FULL_SHEET_HEADER.indexOf("Status");
  const updatedIndex = FULL_SHEET_HEADER.indexOf("Updated");
  const statusCol = columnToLetter(statusIndex >= 0 ? statusIndex : 26);
  const updatedCol = columnToLetter(updatedIndex >= 0 ? updatedIndex : 27);

  const targetTabs = [SHEET_TAB_DA_CHE, SHEET_TAB_KHONG_CHE] as const;

  for (const tab of targetTabs) {
    if (!existingTitles.includes(tab)) {
      await addSheetTab(accessToken, config.sheetId, tab);
      existingTitles.push(tab);
    }

    const colA = await getColumnValues(accessToken, config.sheetId, tab, "A");

    if (colA.length === 0) {
      await updateRange(accessToken, config.sheetId, `'${tab}'!A1`, [FULL_SHEET_HEADER]);
      colA.push(FULL_SHEET_HEADER[0]);
    }

    const tabRows = splitRows[tab];
    for (const row of tabRows) {
      const sku = row[0];
      const rowIndex = colA.findIndex((val) => val === sku);

      if (rowIndex >= 0) {
        const rowNum = rowIndex + 1;
        if (isErrorMode) {
          // Chỉ cập nhật Status và Updated để không xoá trắng URL đã đẩy trước đó
          const errorRange = `'${tab}'!${statusCol}${rowNum}:${updatedCol}${rowNum}`;
          await updateRange(accessToken, config.sheetId, errorRange, [
            [row[statusIndex], row[updatedIndex]],
          ]);
        } else {
          await updateRange(accessToken, config.sheetId, `'${tab}'!A${rowNum}`, [row]);
        }
      } else {
        await appendRange(accessToken, config.sheetId, `'${tab}'!A1`, [row]);
        colA.push(sku);
      }
    }
  }

  const syncedAt = new Date();
  await prisma.generationBatch.update({
    where: { id: batchId },
    data: { sheetSyncedAt: syncedAt },
  });

  return "done";
}
