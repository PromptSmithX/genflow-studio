import { describe, expect, it } from "vitest";
import { BACK_COVER_FILENAME, slotFilename, slotLabel } from "@/lib/calendar/slot-label";

describe("slot-label", () => {
  it("maps the cover slot to the front-cover file and label", () => {
    expect(slotFilename(0)).toBe("00_bia-truoc.png");
    expect(slotLabel(0)).toBe("Bìa trước");
  });

  it("maps month slots to zero-padded files with matching month labels", () => {
    expect(slotFilename(1)).toBe("01.png");
    expect(slotLabel(1)).toBe("Tháng 1");
    expect(slotFilename(12)).toBe("12.png");
    expect(slotLabel(12)).toBe("Tháng 12");
  });

  it("produces the 14 page names the mockup script expects, in print order", () => {
    const names = [...Array.from({ length: 13 }, (_, i) => slotFilename(i)), BACK_COVER_FILENAME];
    expect(names).toHaveLength(14);
    expect(names[0]).toBe("00_bia-truoc.png");
    expect(names[13]).toBe("13_bia-sau.png");
    expect(new Set(names).size).toBe(14);
  });
});
