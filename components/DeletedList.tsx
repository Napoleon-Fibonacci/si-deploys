import { recentDeleted } from "@/lib/deployments";
import { IconTrash } from "@/components/icons";

/**
 * Ledger 20 project terbaru yang dihapus, urut deleted_at menurun,
 * dirender di server. Tanpa tombol; hanya catatan.
 */
export default async function DeletedList() {
  const rows = await recentDeleted(20).catch(() => []);

  return (
    <aside className="pane-side flex flex-col">
      <div className="flex items-center justify-between border-b border-line py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-medium">
          <IconTrash size={14} className="text-faint" />
          Baru dihapus
        </h2>
        <span className="font-mono text-[11px] text-faint">20 terbaru</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-[13px] text-faint">Belum ada yang dihapus.</p>
      ) : (
        <ul className="py-1">
          {rows.map((row, index) => (
            <li
              key={`${row.name}-${String(row.deleted_at)}`}
              className="ledger-row row-in"
              style={{ ["--d" as string]: `${Math.min(index * 30, 300)}ms` }}
            >
              <span className="truncate font-mono text-[13px]">{row.name}</span>
              <time className="shrink-0 font-mono text-[11px] text-faint">
                {formatDate(row.deleted_at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-auto border-t border-line pt-3.5 text-[12px] leading-relaxed text-faint">
        Saat kapasitas penuh, project tertua dihapus otomatis sebelum deploy baru.
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
