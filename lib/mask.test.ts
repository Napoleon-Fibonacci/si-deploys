import { describe, expect, it } from "vitest";
import { maskName } from "./mask";

describe("maskName", () => {
  it("mengambil huruf pertama tiap bagian", () => {
    expect(maskName("test-cheeses")).toBe("TC");
    expect(maskName("my.cool_site")).toBe("MCS");
  });

  it("satu bagian jadi satu huruf", () => {
    expect(maskName("blog")).toBe("B");
    expect(maskName("7")).toBe("7");
  });

  it("berhenti di empat inisial", () => {
    expect(maskName("a-b-c-d-e")).toBe("ABCD");
  });

  it("tanda baca berulang tidak menghasilkan inisial kosong", () => {
    expect(maskName("a--b")).toBe("AB");
    expect(maskName("-,-")).toBe("?");
  });

  it("tak pernah menyisakan potongan nama asli", () => {
    const masked = maskName("rahasia-banget");
    expect(masked).toBe("RB");
    expect(masked).not.toContain("rahasia");
  });
});
