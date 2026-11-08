// Dùng chung cho UI và bước xuất thư mục để nhãn trên màn hình luôn khớp tên file trên đĩa.

export const BACK_COVER_FILENAME = "13_bia-sau.png";

export function slotFilename(indexInBatch: number): string {
  return indexInBatch === 0 ? "00_bia-truoc.png" : `${String(indexInBatch).padStart(2, "0")}.png`;
}

export function slotLabel(indexInBatch: number): string {
  return indexInBatch === 0 ? "Bìa trước" : `Tháng ${indexInBatch}`;
}
