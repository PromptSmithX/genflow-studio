export const PAGE_FILENAMES: readonly string[] = [
  "front_cover.png",
  "m01_month.png",
  "m02_month.png",
  "m03_month.png",
  "m04_month.png",
  "m05_month.png",
  "m06_month.png",
  "m07_month.png",
  "m08_month.png",
  "m09_month.png",
  "m10_month.png",
  "m11_month.png",
  "m12_month.png",
  "back_cover.png",
];

export function titleSlug(title?: string | null): string {
  if (!title) return "";
  let s = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[đĐ]/g, "d");
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > 50) {
    s = s.slice(0, 50).replace(/-+$/, "");
  }
  return s;
}

export function buildR2Folder(
  skuBase: string,
  createdAt: Date | string,
  title?: string | null,
): string {
  const d = new Date(createdAt);
  const yyyy = d.getFullYear();
  const skuLower = skuBase.toLowerCase();
  const slug = titleSlug(title);
  return slug ? `${yyyy}/${skuLower}_${slug}` : `${yyyy}/${skuLower}`;
}

export function pageKey(
  prefix: string,
  folder: string,
  size: string,
  variant: string,
  filename: string,
): string {
  const p = prefix.replace(/^\/+|\/+$/g, "");
  const f = folder.replace(/^\/+|\/+$/g, "");
  const s = size.replace(/^\/+|\/+$/g, "");
  const v = variant.replace(/^\/+|\/+$/g, "").toLowerCase();
  const file = filename.replace(/^\/+/, "");
  return p ? `${p}/${f}/${s}/${v}/${file}` : `${f}/${s}/${v}/${file}`;
}

export function previewKey(prefix: string, folder: string, filename: string): string {
  const p = prefix.replace(/^\/+|\/+$/g, "");
  const f = folder.replace(/^\/+|\/+$/g, "");
  const file = filename.replace(/^\/+/, "");
  return p ? `${p}/${f}/previews/${file}` : `${f}/previews/${file}`;
}

export function publicUrl(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${base}/${cleanKey}`;
}

export function versionedUrl(url: string, version: number | string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${version}`;
}
