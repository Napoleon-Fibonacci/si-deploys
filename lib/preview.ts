/**
 * Sumber gambar pratinjau situs hasil deploy.
 *
 * Tidak ada cara mengambil screenshot di sisi kami sendiri: Vercel Functions
 * tidak bisa menjalankan browser. Jadi gambar diambil layanan pihak ketiga,
 * dan yang pertama gagal ditukar ke berikutnya. Microlink lebih dulu karena
 * hasilnya retina; thum.io cadangan karena tanpa kunci API dan punya cache.
 */
export function previewSources(url: string): string[] {
  return [
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`,
    `https://image.thum.io/get/width/1200/crop/750/noanimate/${encodeURI(url)}`,
  ];
}

/** Host tanpa skema dan tanpa jalur, buat label gambar. */
export function previewHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
