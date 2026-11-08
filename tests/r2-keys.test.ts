import { describe, expect, it } from "vitest";
import {
  titleSlug,
  buildR2Folder,
  pageKey,
  previewKey,
  publicUrl,
  PAGE_FILENAMES,
} from "@/lib/r2/keys";

describe("r2-keys", () => {
  describe("titleSlug", () => {
    it("handles Vietnamese accents and đ/Đ", () => {
      expect(titleSlug("Lịch Treo Tường Đẹp")).toBe("lich-treo-tuong-dep");
      expect(titleSlug("Đêm Trăng Mờ")).toBe("dem-trang-mo");
    });

    it("handles special characters and multiple consecutive dashes", () => {
      expect(titleSlug("Cozy & Anime Girl: 2027 #Wall!Calendar")).toBe(
        "cozy-anime-girl-2027-wall-calendar",
      );
    });

    it("returns empty string when title is empty or null", () => {
      expect(titleSlug(null)).toBe("");
      expect(titleSlug(undefined)).toBe("");
      expect(titleSlug("   ")).toBe("");
      expect(titleSlug("---!@#$---")).toBe("");
    });

    it("trims to maximum 50 characters without trailing dash", () => {
      const longTitle =
        "This is an extraordinarily long calendar title designed to exceed fifty characters limit easily";
      const slug = titleSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(50);
      expect(slug.endsWith("-")).toBe(false);
      expect(slug).toBe("this-is-an-extraordinarily-long-calendar-title-des");
    });
  });

  describe("buildR2Folder", () => {
    it("builds folder with year, sku lower, and slug", () => {
      const folder = buildR2Folder("CAL-ANI-2611-SF4U7", new Date(2026, 10, 6), "Cozy Anime Girl 2027");
      expect(folder).toBe("2026/cal-ani-2611-sf4u7_cozy-anime-girl-2027");
    });

    it("builds folder with only year and sku lower if title slug is empty", () => {
      const folder = buildR2Folder("CAL-ANI-2611-SF4U7", new Date(2026, 10, 6), null);
      expect(folder).toBe("2026/cal-ani-2611-sf4u7");
    });
  });

  describe("pageKey and previewKey", () => {
    it("constructs page key properly", () => {
      const key = pageKey(
        "calendars/anima",
        "2026/cal-ani-2611-sf4u7_cozy-girl",
        "11x8.5",
        "cen",
        "front_cover.png",
      );
      expect(key).toBe(
        "calendars/anima/2026/cal-ani-2611-sf4u7_cozy-girl/11x8.5/cen/front_cover.png",
      );
    });

    it("constructs preview key properly", () => {
      const key = previewKey(
        "calendars/anima",
        "2026/cal-ani-2611-sf4u7_cozy-girl",
        "01_mockup_covers.png",
      );
      expect(key).toBe(
        "calendars/anima/2026/cal-ani-2611-sf4u7_cozy-girl/previews/01_mockup_covers.png",
      );
    });

    it("has exactly 14 filenames in PAGE_FILENAMES in expected order", () => {
      expect(PAGE_FILENAMES).toHaveLength(14);
      expect(PAGE_FILENAMES[0]).toBe("front_cover.png");
      expect(PAGE_FILENAMES[1]).toBe("m01_month.png");
      expect(PAGE_FILENAMES[12]).toBe("m12_month.png");
      expect(PAGE_FILENAMES[13]).toBe("back_cover.png");
    });
  });

  describe("publicUrl", () => {
    it("handles base URL with or without trailing slash", () => {
      expect(publicUrl("https://pub-cdn.r2.dev/", "calendars/anima/img.png")).toBe(
        "https://pub-cdn.r2.dev/calendars/anima/img.png",
      );
      expect(publicUrl("https://pub-cdn.r2.dev", "calendars/anima/img.png")).toBe(
        "https://pub-cdn.r2.dev/calendars/anima/img.png",
      );
      expect(publicUrl("https://pub-cdn.r2.dev/", "/calendars/anima/img.png")).toBe(
        "https://pub-cdn.r2.dev/calendars/anima/img.png",
      );
    });
  });
});
