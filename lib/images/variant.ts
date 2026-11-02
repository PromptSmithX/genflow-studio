import type { GeneratedImage } from "@prisma/client";

export interface VariantRoots {
  outputRoot: string;
  censoredRoot: string;
  upscaledRoot: string;
  upscaledCensoredRoot: string;
}

export interface ResolvedVariant {
  root: string;
  relativePath: string;
  /** Hậu tố chèn vào tên file khi tải, phân biệt với bản gốc. */
  downloadSuffix: string;
}

/**
 * Ánh xạ `?variant=` sang đúng thư mục + đường dẫn tương đối của bản ảnh. Trả
 * null khi bản được yêu cầu chưa tồn tại (chưa che / chưa upscale), để route
 * trả 404. Chỉ nhận id ảnh từ DB, không nhận path tùy ý; resolveSafePath ở nơi
 * gọi vẫn chặn thoát khỏi root.
 */
export function resolveImageVariant(
  image: GeneratedImage,
  variantParam: string | null,
  roots: VariantRoots,
): ResolvedVariant | null {
  switch (variantParam) {
    case "masked":
      if (!image.maskedRelativePath) return null;
      return { root: roots.censoredRoot, relativePath: image.maskedRelativePath, downloadSuffix: "_censored" };
    case "upscaled":
      if (!image.upscaledRelativePath) return null;
      return { root: roots.upscaledRoot, relativePath: image.upscaledRelativePath, downloadSuffix: "_print" };
    case "upscaled-masked":
      if (!image.upscaledMaskedRelativePath) return null;
      return {
        root: roots.upscaledCensoredRoot,
        relativePath: image.upscaledMaskedRelativePath,
        downloadSuffix: "_print_censored",
      };
    default:
      return { root: roots.outputRoot, relativePath: image.relativePath, downloadSuffix: "" };
  }
}
