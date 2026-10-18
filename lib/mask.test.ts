import { describe, expect, it } from "vitest";
import { maskName } from "./mask";

describe("maskName", () => {
  it("menyisakan dua huruf pertama, sisanya bintang", () => {
    expect(maskName("test-cheeses")).toBe("te**********");
    expect(maskName("blog")).toBe("bl**");
  });
  it("panjangnya tetap terbaca", () => {
    for (const name of ["a", "ab", "abc", "test-cheeses", "situs-baru-2026"]) {
      expect(maskName(name)).toHaveLength(name.length);
    }
  });

  it("nama yang pendek tak menyisakan seluruh namanya", () => {
    expect(maskName("ab")).toBe("a*");
    expect(maskName("a")).toBe("*");
  });

  it("nama kosong jadi tanda tanya", () => {
    expect(maskName("")).toBe("?");
  });

  it("tak pernah menyisakan potongan nama asli", () => {
    const masked = maskName("rahasia-banget");
    expect(masked).toBe("ra************");
    expect(masked).not.toContain("hasia");
  });
});
