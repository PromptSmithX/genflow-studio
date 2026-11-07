import { describe, expect, it } from "vitest";
import { plainToHtml } from "@/lib/r2/description-html";

describe("r2-description-html", () => {
  it("escapes html special characters &, <, >, \", '", () => {
    const raw = `Special & characters <tag> "double" and 'single'`;
    const html = plainToHtml(raw);
    expect(html).toBe(
      `<p>Special &amp; characters &lt;tag&gt; &quot;double&quot; and &#x27;single&#x27;</p>`,
    );
  });

  it("handles paragraphs separated by blank lines", () => {
    const raw = `Paragraph one.\n\nParagraph two.`;
    const html = plainToHtml(raw);
    expect(html).toBe(`<p>Paragraph one.</p><p>Paragraph two.</p>`);
  });

  it("merges single line breaks inside a paragraph into a single space", () => {
    const raw = `This is line 1\nof the same paragraph\nand line 3.`;
    const html = plainToHtml(raw);
    expect(html).toBe(`<p>This is line 1 of the same paragraph and line 3.</p>`);
  });

  it("converts blocks where every line starts with bullet/dash/asterisk into unordered lists", () => {
    const raw = `- Item 1\n- Item 2\n- Item 3`;
    const html = plainToHtml(raw);
    expect(html).toBe(`<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>`);

    const rawBullet = `• Bullet A\n• Bullet B`;
    expect(plainToHtml(rawBullet)).toBe(`<ul><li>Bullet A</li><li>Bullet B</li></ul>`);

    const rawStar = `* Star 1\n* Star 2`;
    expect(plainToHtml(rawStar)).toBe(`<ul><li>Star 1</li><li>Star 2</li></ul>`);
  });

  it("produces no whitespace or newlines between html tags", () => {
    const raw = `Intro text.\n\n- Feature 1\n- Feature 2\n\nOutro text.`;
    const html = plainToHtml(raw);
    expect(html).toBe(
      `<p>Intro text.</p><ul><li>Feature 1</li><li>Feature 2</li></ul><p>Outro text.</p>`,
    );
    expect(html).not.toMatch(/>\s+</);
  });

  it("returns empty string for null, undefined, or empty text", () => {
    expect(plainToHtml(null)).toBe("");
    expect(plainToHtml(undefined)).toBe("");
    expect(plainToHtml("   ")).toBe("");
  });
});
