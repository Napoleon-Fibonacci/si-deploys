import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Mesin pencari boleh mengindeks halaman depan dan gambar preview-nya.
 * `/api/` dan `/admin` ditutup: keduanya tak punya isi untuk publik.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/admin/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
