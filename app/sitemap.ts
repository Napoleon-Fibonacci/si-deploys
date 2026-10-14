import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Situs satu halaman: hanya halaman depan yang masuk peta. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE.url}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
