import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { CalendarFormat } from "@/lib/calendar/formats";
import { withPngDpi } from "@/lib/images/png-dpi";

/**
 * Phóng ảnh về ĐÚNG kích thước trang in của template lịch (ví dụ 3375×2625 cho
 * khổ 11×8.5 ở 300 DPI) bằng nội suy cục bộ -- không cần GPU/ComfyUI. KÉO GIÃN
 * cả ảnh cho khít khổ, không cắt: ảnh gen ~1.21 nên khổ 11×8.5 (1.286) bị bè
 * ngang ~6% (đã chấp nhận), khổ 14×11.5 lệch ~0.2%. Cắt (cover-crop) từng làm
 * mất chữ tiêu đề bìa sát mép trên.
 *
 * Đây là engine mặc định (nội suy). Nếu chất lượng chưa đủ nét khi in, có thể
 * thêm nhánh engine GPU (ComfyUI UpscaleModelLoader + ImageUpscaleWithModel) và
 * chọn engine qua settings -- chữ ký hàm này giữ nguyên để nơi gọi không đổi.
 */
export async function upscaleToSize(input: Buffer, format: CalendarFormat): Promise<Buffer> {
  const { widthPx: targetW, heightPx: targetH } = format;
  const image = await loadImage(input);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, targetW, targetH);

  return withPngDpi(await canvas.encode("png"), format.dpi);
}
