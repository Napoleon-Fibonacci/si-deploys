import { describe, expect, it } from "vitest";
import {
  DEPLOY_STAGES,
  STAGE_INDEX,
  decodeEvent,
  decodeEvents,
  encodeEvent,
  isSourceType,
  isStage,
  type DeployEvent,
} from "./deploy-protocol";

describe("encodeEvent / decodeEvents", () => {
  it("bolak-balik utuh", () => {
    const event: DeployEvent = { type: "stage", stage: "slot" };
    const { events, rest } = decodeEvents(encodeEvent(event));
    expect(events).toEqual([event]);
    expect(rest).toBe("");
  });

  it("menahan baris yang belum lengkap sebagai rest", () => {
    const { events, rest } = decodeEvents('{"type":"stage","stage":"files"}\n{"type":"do');
    expect(events).toEqual([{ type: "stage", stage: "files" }]);
    expect(rest).toBe('{"type":"do');
  });

  it("menyambung potongan yang terbelah di tengah baris", () => {
    const full = encodeEvent({ type: "done", url: "https://a.vercel.app", renamed: true });
    const first = decodeEvents(full.slice(0, 12));
    expect(first.events).toHaveLength(0);
    const second = decodeEvents(first.rest + full.slice(12));
    expect(second.events).toEqual([
      { type: "done", url: "https://a.vercel.app", renamed: true },
    ]);
  });

  it("melewati baris kosong", () => {
    const { events } = decodeEvents('\n\n{"type":"stage","stage":"create"}\n\n');
    expect(events).toEqual([{ type: "stage", stage: "create" }]);
  });

  it("mengembalikan beberapa event sekaligus", () => {
    const payload =
      encodeEvent({ type: "stage", stage: "files" }) +
      encodeEvent({ type: "stage", stage: "create" }) +
      encodeEvent({ type: "done", url: "u", renamed: false });
    const { events } = decodeEvents(payload);
    expect(events.map((event) => event.type)).toEqual(["stage", "stage", "done"]);
  });
});

describe("decodeEvent", () => {
  it("mengisi nilai aman untuk event yang tidak lengkap", () => {
    expect(decodeEvent('{"type":"done"}')).toEqual({ type: "done", url: "", renamed: false });
    expect(decodeEvent('{"type":"error"}')).toEqual({
      type: "error",
      code: 500,
      message: "Terjadi kesalahan tak terduga.",
      field: "source",
    });
  });

  it("meneruskan field formulir dan menolak nilai yang tak dikenal", () => {
    expect(decodeEvent('{"type":"error","code":409,"message":"x","field":"name"}')).toEqual({
      type: "error",
      code: 409,
      message: "x",
      field: "name",
    });
    expect(decodeEvent('{"type":"error","field":"sumber"}')).toMatchObject({ field: "source" });
  });

  it("menolak JSON rusak, bentuk bukan objek, dan tipe tak dikenal", () => {
    expect(decodeEvent("{bukan json")).toBeNull();
    expect(decodeEvent("[]")).toBeNull();
    expect(decodeEvent('"teks"')).toBeNull();
    expect(decodeEvent('{"type":"aneh"}')).toBeNull();
  });

  it("menolak tahap yang tidak dikenal", () => {
    expect(decodeEvent('{"type":"stage","stage":"upload"}')).toBeNull();
    expect(decodeEvent('{"type":"stage"}')).toBeNull();
  });

  it("hanya renamed === true yang dianggap benar", () => {
    expect(decodeEvent('{"type":"done","renamed":"yes"}')).toMatchObject({ renamed: false });
  });
});

describe("kosakata", () => {
  it("setiap tahap punya indeks langkah UI", () => {
    for (const stage of DEPLOY_STAGES) {
      expect(typeof STAGE_INDEX[stage], stage).toBe("number");
    }
  });

  it("isStage", () => {
    expect(isStage("files")).toBe(true);
    expect(isStage("Files")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });

  it("isSourceType menolak sumber yang sudah dihapus", () => {
    expect(isSourceType("github")).toBe(true);
    expect(isSourceType("zip")).toBe(true);
    expect(isSourceType("paste")).toBe(false);
    expect(isSourceType(undefined)).toBe(false);
  });
});
