/**
 * Lambang Si Deploy untuk gambar yang dirender mesin (icon Apple, preview
 * WhatsApp/Open Graph). Gaya inline wajib: renderer `next/og` (satori) tak
 * mengerti kelas Tailwind atau CSS eksternal.
 *
 * Bentuknya sengaja sama dengan `IconRocket` di wordmark: cincin + panah naik.
 */
export function BrandMark({ size }: { size: number }) {
  const stroke = Math.max(2, Math.round(size * 0.05));
  const ring = Math.round(size * 0.56);
  const chevron = Math.round(size * 0.2);
  const shaft = Math.round(size * 0.2);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        background: "#101216",
        borderRadius: Math.round(size * 0.24),
        border: `${stroke}px solid #23272e`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: `${stroke}px solid #7c8cff`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Dua sisi kotak diputar: sudutnya jadi kepala panah menghadap atas. */}
          <div
            style={{
              display: "flex",
              width: chevron,
              height: chevron,
              borderTop: `${stroke}px solid #7c8cff`,
              borderRight: `${stroke}px solid #7c8cff`,
              transform: "rotate(-45deg)",
            }}
          />
          <div style={{ display: "flex", width: stroke, height: shaft, background: "#7c8cff" }} />
        </div>
      </div>
    </div>
  );
}
