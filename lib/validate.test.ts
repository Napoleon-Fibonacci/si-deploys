import { describe, expect, it } from "vitest";
import type { DeployFile } from "./sources";
import {
  MAX_EXTRACTED_BYTES,
  MAX_FILES,
  ValidationError,
  assertSafePath,
  isValidName,
  validateFiles,
  validateName,
} from "./validate";

function file(path: string, content = "x"): DeployFile {
  return { path, data: new TextEncoder().encode(content) };
}

/** validateFiles hanya membaca `.length` untuk ukuran, jadi tak perlu isi asli. */
function oversized(path: string): DeployFile {
  return { path, data: { length: MAX_EXTRACTED_BYTES + 1 } as unknown as Uint8Array };
}

describe("validateName", () => {
  it("menerima nama valid", () => {
    expect(validateName("abc")).toBe("abc");
    expect(validateName("hello-world")).toBe("hello-world");
    expect(validateName("a1b2c3")).toBe("a1b2c3");
    expect(validateName("a".repeat(40))).toBe("a".repeat(40));
  });

  it("menolak nama tidak valid", () => {
    const bad = ["", "ab", "ABC", "a b", "ab_", "-abc", "abc-", "a".repeat(41), "ab.c"];
    for (const value of bad) {
      expect(() => validateName(value), value).toThrow(ValidationError);
    }
  });

  it("menolak yang bukan string", () => {
    expect(() => validateName(undefined)).toThrow(ValidationError);
    expect(() => validateName(42)).toThrow(ValidationError);
  });

  it("isValidName tak pernah berbeda pendapat dengan validateName", () => {
    // Gerbang klien dan gerbang server harus memakai aturan yang sama persis.
    const cases: unknown[] = [
      "abc",
      "a-b-c",
      "abc-",
      "-abc",
      "AB",
      "a_b",
      "a b",
      "",
      "123",
      "a".repeat(40),
      "a".repeat(41),
      undefined,
      42,
      null,
    ];
    for (const value of cases) {
      let threw = false;
      try {
        validateName(value);
      } catch {
        threw = true;
      }
      expect(isValidName(value), String(value)).toBe(!threw);
    }
  });
});

describe("assertSafePath", () => {
  it("menerima path biasa", () => {
    expect(() => assertSafePath("index.html")).not.toThrow();
    expect(() => assertSafePath("sub/dir/file.css")).not.toThrow();
  });

  it("menolak path berbahaya", () => {
    const bad = ["../secret", "/abs/file", "C:/x", "a/../b", "./x", ".."];
    for (const value of bad) {
      expect(() => assertSafePath(value), value).toThrow(ValidationError);
    }
  });
});

describe("validateFiles", () => {
  it("wajib ada index.html di root", () => {
    expect(() => validateFiles([file("style.css")], "ZIP")).toThrow(ValidationError);
  });

  it("mengizinkan situs yang hanya berisi folder api/", () => {
    expect(validateFiles([file("api/hello.js")], "ZIP")).toHaveLength(1);
  });

  it("menyaring sampah dan berkas kosong", () => {
    const cleaned = validateFiles(
      [
        file("index.html"),
        file(".DS_Store"),
        file("__MACOSX/x"),
        file(".git/config"),
        file("empty.css", ""),
      ],
      "ZIP"
    );
    expect(cleaned.map((entry) => entry.path)).toEqual(["index.html"]);
  });

  it("menolak bila jumlah file melewati batas", () => {
    const files = [file("index.html")];
    for (let index = 0; index < MAX_FILES; index += 1) files.push(file(`f${index}.css`));
    expect(() => validateFiles(files, "ZIP")).toThrow(ValidationError);
  });

  it("menolak total isi melebihi batas anti zip bomb", () => {
    expect(() => validateFiles([oversized("index.html")], "ZIP")).toThrow(ValidationError);
  });

  it("menolak package.json dengan skrip build", () => {
    const pkg = JSON.stringify({ scripts: { build: "next build" } });
    expect(() => validateFiles([file("index.html"), file("package.json", pkg)], "ZIP")).toThrow(
      ValidationError
    );
  });

  it("meloloskan package.json tanpa skrip build", () => {
    const pkg = JSON.stringify({ scripts: { test: "vitest" } });
    expect(validateFiles([file("index.html"), file("package.json", pkg)], "ZIP")).toHaveLength(2);
  });
});
