import { recentActive } from "@/lib/deployments";
import { maskName } from "@/lib/mask";
import { IconGlobe } from "@/components/icons";

/**
 * Ledger project yang sedang hidup, dirender di server.
 *
 * Halaman ini publik, dan yang dipajang adalah project milik orang lain, jadi
 * nama dan URL-nya disamarkan: yang tampil hanya dua huruf pertama dari nama,
 * lalu bintang sepanjang sisanya, ditutup akhiran `.vercel.app` supaya tetap
 * terbaca sebagai alamat. Penyamaran terjadi di server — nama aslinya tak
 * pernah ikut ke browser. Kunci baris memakai `id`, bukan nama, karena kunci
 * React ikut terkirim di payload RSC.
 */
export default async function ActiveList() {
  const rows = await recentActive(20).catch(() => []);

  return (
    <aside className="pane-side flex flex-col">
      <div className="flex items-center justify-between border-b border-line py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium">
          <IconGlobe size={14} className="text-faint" />
          Sedang hidup
        </h2>
        <span className="font-mono text-[11px] text-faint">20 terbaru</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-[13px] text-faint">Belum ada yang hidup.</p>
      ) : (
        <ul className="py-1">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="ledger-row row-in"
              style={{ ["--d" as string]: `${Math.min(index * 30, 300)}ms` }}
            >
              <span className="truncate font-mono text-[13px]">
                {maskName(row.name)}
                <span className="text-faint">.vercel.app</span>
              </span>
              <time className="shrink-0 font-mono text-[11px] text-faint">
                {formatDate(row.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-auto border-t border-line pt-3.5 text-[12px] leading-relaxed text-faint">
        Nama disamarkan — dua huruf pertama saja — karena halaman ini publik. Saat
        kapasitas penuh, project tertua dihapus otomatis sebelum deploy baru.
      </p>
    </aside>
  );
}

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(date);
}
