import { describe, expect, it } from "vitest";
import { stripRoot, type DeployFile } from "./sources";

function file(path: string): DeployFile {
  return { path, data: new Uint8Array([1]) };
}

describe("stripRoot", () => {
  it("membuang folder root tunggal dari arsip GitHub", () => {
    const out = stripRoot([file("repo-main/index.html"), file("repo-main/assets/a.css")]);
    expect(out.map((entry) => entry.path)).toEqual(["index.html", "assets/a.css"]);
  });

  it("membiarkan berkas yang sudah di root", () => {
    const out = stripRoot([file("index.html"), file("a.css")]);
    expect(out.map((entry) => entry.path)).toEqual(["index.html", "a.css"]);
  });

  it("tidak membuang apa pun bila ada beberapa root", () => {
    const out = stripRoot([file("a/index.html"), file("b/x.css")]);
    expect(out.map((entry) => entry.path)).toEqual(["a/index.html", "b/x.css"]);
  });

  it("menormalkan pemisah backslash Windows", () => {
    const out = stripRoot([file("repo-main\\index.html"), file("repo-main\\a.css")]);
    expect(out.map((entry) => entry.path)).toEqual(["index.html", "a.css"]);
  });
});
