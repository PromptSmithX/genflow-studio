import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Phóng ảnh về ĐÚNG kích thước trang in của template lịch (ví dụ 3375×2625 cho
 * khổ 11×8.5 ở 300 DPI) bằng nội suy cục bộ -- không cần GPU/ComfyUI. Dùng
 * "cover + center-crop": scale theo cạnh lớn hơn rồi căn giữa, nên kết quả khít
 * đúng khổ, không méo tỉ lệ và không để lại viền trống. Vùng sát mép của ảnh
 * đầu vào đã là bezel mờ do padSafeMargin tạo ra, nên phần bị crop không ăn vào
 * nội dung thật.
 *
 * Đây là engine mặc định (nội suy). Nếu chất lượng chưa đủ nét khi in, có thể
 * thêm nhánh engine GPU (ComfyUI UpscaleModelLoader + ImageUpscaleWithModel) và
 * chọn engine qua settings -- chữ ký hàm này giữ nguyên để nơi gọi không đổi.
 */
export async function upscaleToSize(input: Buffer, targetW: number, targetH: number): Promise<Buffer> {
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
