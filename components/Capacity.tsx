import { countLive } from "@/lib/deployments";
import { MAX_PROJECTS } from "@/lib/validate";
import { IconLayers } from "@/components/icons";

/**
 * Penanda kapasitas di bar atas: jumlah slot terpakai dari batas.
 * Dirender di server; gagal DB = tampilkan batas saja.
 */
export default async function Capacity() {
  let used: number | null = null;
  try {
    used = await countLive();
  } catch {
    // Database belum siap: tampilkan batas saja.
  }

  return (
    <div className="flex items-center gap-2 font-mono text-xs text-faint">
      <IconLayers size={14} className="shrink-0" />
      {used === null ? (
        <span>maks {MAX_PROJECTS} project</span>
      ) : (
        <span>
          <span className="text-muted">{used}</span> / {MAX_PROJECTS} project
        </span>
      )}
    </div>
  );
}
