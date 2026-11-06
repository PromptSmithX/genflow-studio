export interface R2FormatInfo {
  size: "11x8.5" | "14x11.5";
  code: "11" | "14";
}

export function mapFormatToR2(formatId: string): R2FormatInfo | null {
  if (formatId === "premade_wall_11x8_5") {
    return { size: "11x8.5", code: "11" };
  }
  if (formatId === "premade_wall_14x11_5") {
    return { size: "14x11.5", code: "14" };
  }
  console.warn(`[r2/formats] Bỏ qua format không hỗ trợ: ${formatId}`);
  return null;
}
