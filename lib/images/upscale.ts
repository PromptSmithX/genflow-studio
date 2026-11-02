import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { CalendarFormat } from "@/lib/calendar/formats";

/**
 * Phóng ảnh về ĐÚNG kích thước trang in của template lịch (ví dụ 3375×2625 cho
 * khổ 11×8.5 ở 300 DPI) bằng nội suy cục bộ -- không cần GPU/ComfyUI. Dùng
 * "cover + center-crop": scale theo cạnh lớn hơn rồi căn giữa, nên kết quả khít
 * đúng khổ, không méo tỉ lệ và không để lại viền trống.
 *
 * Ảnh gen ra ở tỉ lệ ~1.21 (xem COVER_DEFAULT_WIDTH/HEIGHT ở
 * assistant-create-form.tsx), cố ý chọn bằng-hoặc-vuông-hơn mọi khổ lịch hiện
 * có -- nên cover-crop luôn cắt trên/dưới (không bao giờ cắt 2 bên, nơi chữ
 * bìa nằm), và vì ảnh gốc không còn viền đệm nào (đã bỏ padSafeMargin), kết
 * quả không có dải mờ.
 *
 * Đây là engine mặc định (nội suy). Nếu chất lượng chưa đủ nét khi in, có thể
 * thêm nhánh engine GPU (ComfyUI UpscaleModelLoader + ImageUpscaleWithModel) và
 * chọn engine qua settings -- chữ ký hàm này giữ nguyên để nơi gọi không đổi.
 */
export async function upscaleToSize(input: Buffer, format: CalendarFormat): Promise<Buffer> {
  const { widthPx: targetW, heightPx: targetH } = format;
  const image = await loadImage(input);
  const { width, height } = image;

  const scale = Math.max(targetW / width, targetH / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, dx, dy, drawW, drawH);

  return canvas.encode("png");
}
