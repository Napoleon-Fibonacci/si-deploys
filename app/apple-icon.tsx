import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";

/** Ikon layar utama iOS. SVG tak didukung di sini, jadi dirender jadi PNG. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} />, { ...size });
}
