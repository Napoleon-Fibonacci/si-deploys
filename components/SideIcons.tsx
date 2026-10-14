import type { CSSProperties } from "react";
import {
  IconArchive,
  IconCode,
  IconGithub,
  IconGlobe,
  IconRocket,
  IconUpload,
} from "@/components/icons";

/**
 * Ikon hiasan di tepi kiri/kanan layar. Murni dekoratif: aria-hidden,
 * pointer-events none, dan disembunyikan di layar sempit. Gerak ada di
 * .side-ico (globals.css) dan dimatikan saat prefers-reduced-motion.
 */
interface SideIcon {
  Icon: typeof IconRocket;
  side: "left" | "right";
  top: string;
  offset: string;
  size: number;
  duration: string;
  delay: string;
  alt: boolean;
}

const ICONS: SideIcon[] = [
  { Icon: IconRocket, side: "left", top: "16%", offset: "5%", size: 30, duration: "9s", delay: "-1s", alt: false },
  { Icon: IconArchive, side: "left", top: "44%", offset: "11%", size: 24, duration: "11s", delay: "-4.5s", alt: true },
  { Icon: IconCode, side: "left", top: "71%", offset: "4%", size: 22, duration: "10s", delay: "-7s", alt: false },
  { Icon: IconGithub, side: "right", top: "21%", offset: "6%", size: 26, duration: "12s", delay: "-2.5s", alt: true },
  { Icon: IconUpload, side: "right", top: "49%", offset: "10%", size: 28, duration: "9.5s", delay: "-5s", alt: false },
  { Icon: IconGlobe, side: "right", top: "74%", offset: "5%", size: 22, duration: "10.5s", delay: "-8s", alt: true },
];

export default function SideIcons() {
  return (
    <div aria-hidden className="side-icons">
      {ICONS.map((item, index) => (
        <span
          key={index}
          className={`side-ico${item.alt ? " is-alt" : ""}`}
          style={
            {
              [item.side]: item.offset,
              top: item.top,
              animationDuration: item.duration,
              animationDelay: item.delay,
            } as CSSProperties
          }
        >
          <item.Icon size={item.size} />
        </span>
      ))}
    </div>
  );
}
