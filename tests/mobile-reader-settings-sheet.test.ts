import { describe, expect, it } from "vitest";
import { adjustReaderFontSize } from "../src/reader/ui/MobileReaderSettingsSheet";

describe("Mobile Reader settings font controls", () => {
  it("adjusts one existing font-size step at a time", () => {
    expect(adjustReaderFontSize(18, -1, 15, 26)).toBe(17);
    expect(adjustReaderFontSize(18, 1, 15, 26)).toBe(19);
  });

  it("keeps adjustments within the existing font-size range", () => {
    expect(adjustReaderFontSize(15, -1, 15, 26)).toBe(15);
    expect(adjustReaderFontSize(26, 1, 15, 26)).toBe(26);
  });
});
