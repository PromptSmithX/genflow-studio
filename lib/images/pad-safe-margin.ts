import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Tỉ lệ đệm thêm mỗi cạnh. Ảnh gốc được giữ NGUYÊN VẸN, không bị cắt -- canvas
 * chỉ được NỚI RỘNG ra để chừa lề. Vùng viền mới thêm trùng với vùng sẽ bị dải
 * lò xo / lỗ treo / mép cắt (bleed+trim) của trang lịch Printify che hoặc cắt
 * mất khi in, nên không cần "đẹp hoàn hảo" -- chỉ cần không bị trống/lộ seam.
 */
const MARGIN_RATIO = 0.08;

/**
 * Nới rộng canvas của một ảnh đã gen thêm MARGIN_RATIO mỗi cạnh để đảm bảo
 * TUYỆT ĐỐI (không phụ thuộc prompt/LLM) rằng vùng sát mép -- nơi bị lò xo/lỗ
 * treo/mã vạch/bleed che khi in lịch -- không chứa bất kỳ nội dung nào do AI
 * vẽ (mặt, tay chân, chữ). Viền mới là ảnh gốc phóng to + làm mờ (kiểu
 * "blurred-extend bezel" như Spotify/YouTube), ảnh gốc giữ nguyên 100% ở giữa.
 * Giữ nguyên tỉ lệ khung hình gốc (vd 4:3) vì đệm đều % theo cả 2 chiều.
 */
export async function padSafeMargin(input: Buffer): Promise<Buffer> {
  const image = await loadImage(input);
  const { width, height } = image;

  const newWidth = Math.round(width * (1 + 2 * MARGIN_RATIO));
  const newHeight = Math.round(height * (1 + 2 * MARGIN_RATIO));
  const dx = Math.round((newWidth - width) / 2);
  const dy = Math.round((newHeight - height) / 2);

  const canvas = createCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d");

  // Lớp nền: ảnh gốc phóng to phủ kín canvas mới (object-fit: cover) + làm mờ,
  // để viền nối màu mượt thay vì để trống.
  const coverScale = Math.max(newWidth / width, newHeight / height);
  const coverW = width * coverScale;
  const coverH = height * coverScale;
  const blurPx = Math.round(Math.min(newWidth, newHeight) * 0.025);
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(image, (newWidth - coverW) / 2, (newHeight - coverH) / 2, coverW, coverH);

  // Lớp trên: ảnh gốc SẮC NÉT, nguyên vẹn, căn giữa -- không cắt một pixel nào.
  ctx.filter = "none";
  ctx.drawImage(image, dx, dy, width, height);

  return canvas.encode("png");
}
