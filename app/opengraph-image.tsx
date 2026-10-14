import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";
import { SITE } from "@/lib/site";

/**
 * Gambar preview tautan (Open Graph). 1200x630 dan PNG: ukuran yang aman untuk
 * WhatsApp, yang memotong gambar dan hanya membaca bagian awal berkas.
 */
export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#0a0b0e",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <BrandMark size={76} />
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 600,
              color: "#e8eaee",
              letterSpacing: -0.5,
            }}
          >
            {SITE.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 600,
              color: "#e8eaee",
              letterSpacing: -2,
            }}
          >
            {SITE.tagline}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#949aa3" }}>
            Sumber ZIP atau repo GitHub. Nama dicek otomatis.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "1px solid #23272e",
            paddingTop: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#4ade80",
            }}
          />
          <div style={{ display: "flex", fontSize: 28, color: "#6a707a" }}>
            Tanpa akun Vercel sendiri
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
