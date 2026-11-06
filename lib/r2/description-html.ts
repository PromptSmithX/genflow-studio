function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function plainToHtml(text?: string | null): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";

  const blocks = normalized.split(/\n\s*\n/);
  const htmlParts: string[] = [];

  for (const rawBlock of blocks) {
    const trimmed = rawBlock.trim();
    if (!trimmed) continue;

    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) continue;

    const isList = lines.every((line) => /^[-•*]\s+/.test(line));
    if (isList) {
      const items = lines
        .map((line) => {
          const content = line.replace(/^[-•*]\s+/, "");
          return `<li>${escapeHtml(content)}</li>`;
        })
        .join("");
      htmlParts.push(`<ul>${items}</ul>`);
    } else {
      const content = lines.join(" ");
      htmlParts.push(`<p>${escapeHtml(content)}</p>`);
    }
  }

  return htmlParts.join("");
}
