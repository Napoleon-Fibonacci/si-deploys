/**
 * Satu rumah untuk identitas situs: judul, deskripsi, URL kanonik, locale.
 * Dipakai metadata, manifest, robots, sitemap, JSON-LD, dan gambar preview —
 * jadi kalimatnya tak bisa berbeda antar tempat.
 */

function resolveUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Diisi Vercel: domain produksi project (bukan URL deployment preview).
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;
  return "http://localhost:3000";
}

export const SITE = {
  name: "Si Deploy",
  title: "Si Deploy — Deploy situs HTML statis ke Vercel",
  tagline: "Deploy situs HTML statis ke Vercel",
  description:
    "Deploy situs HTML statis ke Vercel tanpa akun Vercel sendiri. Sumber ZIP atau repo GitHub, nama dicek otomatis, project terlama dibersihkan otomatis.",
  locale: "id_ID",
  lang: "id",
  url: resolveUrl(),
  keywords: [
    "deploy situs statis",
    "deploy HTML ke Vercel",
    "hosting statis gratis",
    "deploy ZIP ke Vercel",
    "deploy repo GitHub",
  ],
  themeColor: "#0a0b0e",
} as const;

/**
 * Nilai dasar kartu tautan. Dipakai layout DAN halaman depan: metadata Next
 * mengganti `openGraph` milik layout begitu halaman menyetelnya sendiri, jadi
 * menyetel sebagian di halaman akan menghapus sisanya.
 */
export const OPEN_GRAPH = {
  type: "website" as const,
  siteName: SITE.name,
  locale: SITE.locale,
  title: SITE.title,
  description: SITE.description,
};

export const TWITTER = {
  card: "summary_large_image" as const,
  title: SITE.title,
  description: SITE.description,
};
