import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Tỉ lệ đệm thêm mỗi cạnh, lệch nhau theo trục -- lấy từ số liệu thật trong
 * `Printify_Premade_Grid_Calendar_Templates/*\/format.json` (2 template
 * "premade_wall_11x8_5" và "premade_wall_14x11_5"), không phải số đoán:
 *
 *   - Trên/dưới: cả 2 template chỉ có vùng cấm (lò xo/lỗ treo) ở mép
 *     trên/dưới, full-width, cao nhất 183px/2625px ≈ 6.97% (lỗ treo mép dưới
 *     của front_cover, template 11x8.5). Lấy 7% để vừa đủ, gần như không dư.
 *   - Trái/phải: KHÔNG có vùng cấm nào ở 2 cạnh này trong cả 2 template (chỉ
 *     ô mã vạch ở back_cover mới nằm góc phải -- nhưng back_cover là trang
 *     cố định của Printify, app không gen ảnh cho trang này). Để gần 0 để
 *     viền mờ không lộ ra ở 2 bên khi Printify co/cắt ảnh (ảnh app xuất ra
 *     4:3, rộng hơn cả 2 khung in nên luôn bị cắt ngang -- phần cắt sẽ ăn
 *     đúng vào viền mờ mỏng này, không ăn vào nội dung thật).
 *
 * (Margin đều 8% như trước: trên/dưới dư ra ~1-2.4%, trái/phải dư ra
 * 3.5-6.2% sau khi bị cắt -- đủ để lộ thành dải mờ thấy rõ trên bản in.)
 */
const MARGIN_RATIO_Y = 0.07;
const MARGIN_RATIO_X = 0.01;

/**
 * Nới rộng canvas của một ảnh đã gen thêm margin mỗi cạnh để đảm bảo TUYỆT
 * ĐỐI (không phụ thuộc prompt/LLM) rằng vùng sát mép -- nơi bị lò xo/lỗ
 * treo/mã vạch/bleed che khi in lịch -- không chứa bất kỳ nội dung nào do AI
 * vẽ (mặt, tay chân, chữ). Viền mới là ảnh gốc phóng to + làm mờ (kiểu
 * "blurred-extend bezel" như Spotify/YouTube), ảnh gốc giữ nguyên 100% ở
 * giữa. Margin trên/dưới và trái/phải khác nhau (xem MARGIN_RATIO_Y/_X) nên
 * tỉ lệ khung hình gốc KHÔNG được giữ nguyên nữa -- cố ý, để khớp đúng hình
 * dạng vùng cấm thật của template (dải ngang trên/dưới, gần như phẳng ở 2
 * bên), không phải lỗi.
 */
export async function padSafeMargin(input: Buffer): Promise<Buffer> {
  const image = await loadImage(input);
  const { width, height } = image;

  const newWidth = Math.round(width * (1 + 2 * MARGIN_RATIO_X));
  const newHeight = Math.round(height * (1 + 2 * MARGIN_RATIO_Y));
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
