import { describe, expect, it } from "vitest";
import { previewHost, previewSources } from "./preview";

describe("previewSources", () => {
  it("menaruh microlink lebih dulu, thum.io cadangan", () => {
    const [first, second] = previewSources("https://abc.vercel.app");

    expect(first).toContain("api.microlink.io");
    expect(first).toContain("url=https%3A%2F%2Fabc.vercel.app");
    expect(second).toContain("image.thum.io");
    expect(second).toContain("https://abc.vercel.app");
    expect(second).toContain("width/1200");
  });

  it("menjaga bentuk URL di jalur thum.io tetap utuh", () => {
    expect(previewSources("https://abc.vercel.app")[1]).toMatch(
      /noanimate\/https:\/\/abc\.vercel\.app$/
    );
  });
});

describe("previewHost", () => {
  it("membuang skema dan jalur", () => {
    expect(previewHost("https://abc.vercel.app")).toBe("abc.vercel.app");
    expect(previewHost("https://abc.vercel.app/halaman?x=1")).toBe("abc.vercel.app");
  });
});
