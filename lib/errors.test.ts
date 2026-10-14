import { describe, expect, it } from "vitest";
import { NameTakenError } from "./deployments";
import {
  AppError,
  NAME_TAKEN_MESSAGE,
  errorCode,
  errorField,
  errorMessage,
  toErrorResponse,
} from "./errors";
import { RateLimitError } from "./ratelimit";
import { ValidationError, validateName } from "./validate";
import { VercelApiError } from "./vercel";

describe("errorCode", () => {
  it("mengambil kode dari AppError", () => {
    expect(errorCode(new AppError(418, "teko"))).toBe(418);
  });

  it("menghormati properti status pihak ketiga", () => {
    expect(errorCode(Object.assign(new Error("x"), { status: 429 }))).toBe(429);
  });

  it("jatuh ke 500", () => {
    expect(errorCode(new Error("x"))).toBe(500);
    expect(errorCode(undefined)).toBe(500);
    expect(errorCode("bukan error")).toBe(500);
    expect(errorCode({ status: "429" })).toBe(500);
  });
});

describe("errorField", () => {
  it("default ke source", () => {
    expect(errorField(new Error("x"))).toBe("source");
  });

  it("menghormati field AppError", () => {
    expect(errorField(new AppError(400, "x", "name"))).toBe("name");
  });
});

describe("errorMessage", () => {
  it("memakai pesan Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("punya kalimat cadangan", () => {
    expect(errorMessage(null)).toBe("Terjadi kesalahan tak terduga.");
    expect(errorMessage(new Error(""))).toBe("Terjadi kesalahan tak terduga.");
  });
});

describe("kelas error domain", () => {
  it("membawa kode dan field yang benar", () => {
    const cases: Array<[AppError, number, string]> = [
      [new ValidationError("x"), 400, "source"],
      [new ValidationError("x", "name"), 400, "name"],
      [new NameTakenError(), 409, "name"],
      [new VercelApiError("x"), 502, "source"],
      [new VercelApiError("x", 504), 504, "source"],
      [new RateLimitError("x"), 429, "source"],
    ];
    for (const [error, code, field] of cases) {
      expect(errorCode(error), error.name).toBe(code);
      expect(errorField(error), error.name).toBe(field);
    }
  });

  it("validateName menandai galatnya ke field nama", () => {
    expect(() => validateName("AB")).toThrow(ValidationError);
    try {
      validateName("AB");
    } catch (error) {
      expect(errorCode(error)).toBe(400);
      expect(errorField(error)).toBe("name");
    }
  });

  it("satu kalimat untuk nama yang sudah dipakai", () => {
    expect(new NameTakenError().message).toBe(NAME_TAKEN_MESSAGE);
  });
});

describe("toErrorResponse", () => {
  it("memakai kode dan pesan error", async () => {
    const response = toErrorResponse(new AppError(409, NAME_TAKEN_MESSAGE, "name"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: NAME_TAKEN_MESSAGE });
  });

  it("aman untuk nilai yang bukan error", async () => {
    const response = toErrorResponse("aneh");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Terjadi kesalahan tak terduga." });
  });
});
