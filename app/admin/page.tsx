import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Background from "@/components/Background";
import DeleteRow from "@/components/DeleteRow";
import SideIcons from "@/components/SideIcons";
import {
  IconAlert,
  IconCheck,
  IconRefresh,
  IconRocket,
  IconSearch,
  IconX,
} from "@/components/icons";
import { adminEnabled, isAdmin } from "@/lib/admin";
import {
  DEPLOY_STATUSES,
  STATUS_LABEL,
  listForAdmin,
  type AdminList,
  type DeployStatus,
} from "@/lib/deployments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Tanpa "— Si Deploy": template di layout yang menambahkannya.
  title: "Admin",
  robots: { index: false, follow: false },
};

const LIMIT = 100;

function isStatus(value: string): value is DeployStatus {
  return (DEPLOY_STATUSES as readonly string[]).includes(value);
}

function href(status: string | null, q: string): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

/** Jeda masuk berjenjang antar blok. Satu tempat, supaya urutannya tetap pas. */
function delay(ms: number): { [key: string]: string } {
  return { "--d": `${ms}ms` };
}

interface Flash {
  tone: "ok" | "err";
  text: string;
}

/**
 * Kabar sekali-tampil dari query string. Dipakai sapuan manual dan
 * penghapusan; keduanya redirect, jadi hasilnya harus ikut di URL.
 */
function flashMessage(params: Record<string, string | string[] | undefined>): Flash | null {
  const text = (key: string): string | null =>
    typeof params[key] === "string" ? (params[key] as string) : null;

  if (params.swept === "1") {
    return {
      tone: "ok",
      text: `Sapuan selesai: ${params.failed ?? 0} pending basi ditandai gagal, ${params.deleted ?? 0} project dihapus di Vercel.`,
    };
  }
  if (params.swept === "0") return { tone: "err", text: "Sapuan gagal dijalankan. Coba lagi." };

  const removed = text("removed");
  if (removed) return { tone: "ok", text: `${removed} dihapus: project di Vercel dan barisnya beres.` };

  const retry = text("retry");
  if (retry) {
    return {
      tone: "err",
      text: `${retry} gagal dihapus di Vercel. Barisnya tetap terkunci sampai sapuan berikutnya berhasil.`,
    };
  }
  if (params.missing === "1") return { tone: "err", text: "Baris itu sudah tidak ada." };
  if (params.fail === "1") return { tone: "err", text: "Hapus gagal dijalankan. Coba lagi." };
  return null;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!adminEnabled()) redirect("/admin/login");

  const params = await searchParams;
  const rawStatus = typeof params.status === "string" ? params.status : "";
  const status = isStatus(rawStatus) ? rawStatus : null;
  const q = (typeof params.q === "string" ? params.q : "").trim();

  if (!(await isAdmin())) redirect("/admin/login");

  let list: AdminList | null = null;
  try {
    list = await listForAdmin({ status, q, limit: LIMIT });
  } catch {
    list = null;
  }

  const flash = flashMessage(params);

  return (
    <>
      <Background />
      <SideIcons />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner appbar-wide">
            <Link href="/" className="wordmark">
              <IconRocket size={16} />
              Si Deploy
            </Link>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-faint">admin</span>
              <form action="/api/admin/logout" method="post">
                <button type="submit" className="btn-ghost">
                  <IconX size={15} />
                  Keluar
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="admin-main">
          <div className="admin">
            <header className="admin-head reveal">
              <div>
                <h1 className="stack-title">Deployan</h1>
                <p className="lead">Semua deploy yang tercatat di database.</p>
              </div>
              <div className="admin-actions">
                <span className="admin-total">{list ? `${list.total} baris` : "—"}</span>
                <form action="/api/admin/sweep" method="post">
                  <button type="submit" className="btn-ghost">
                    <IconRefresh size={15} />
                    Bersihkan
                  </button>
                </form>
              </div>
            </header>

            {flash && (
              <p className="flash pop" data-tone={flash.tone} role="status">
                {flash.tone === "ok" ? <IconCheck size={14} /> : <IconAlert size={14} />}
                {flash.text}
              </p>
            )}

            {!list ? (
              <p className="admin-empty">Database belum siap. Coba lagi sebentar.</p>
            ) : (
              <>
                <nav className="stats" aria-label="Filter status">
                  <Link className="stat row-in" aria-current={status === null} href={href(null, q)}>
                    <span className="stat-count">{list.total}</span>
                    <span className="stat-label">Semua</span>
                  </Link>
                  {DEPLOY_STATUSES.map((key, index) => (
                    <Link
                      key={key}
                      className="stat row-in"
                      style={delay(40 + index * 45)}
                      aria-current={status === key}
                      href={href(key, q)}
                    >
                      <span className="stat-count">{list.counts[key]}</span>
                      <span className="stat-label">{STATUS_LABEL[key]}</span>
                    </Link>
                  ))}
                </nav>

                <form
                  className="admin-search reveal"
                  style={delay(300)}
                  method="get"
                  action="/admin"
                  role="search"
                >
                  {status && <input type="hidden" name="status" value={status} />}
                  <div className="input-icon">
                    <IconSearch size={16} />
                    <input
                      type="search"
                      name="q"
                      defaultValue={q}
                      placeholder="Cari nama…"
                      aria-label="Cari nama project"
                      className="input"
                    />
                  </div>
                  <button type="submit" className="btn-ghost">
                    Cari
                  </button>
                  {q && (
                    <Link className="btn-ghost" href={href(status, "")}>
                      Reset
                    </Link>
                  )}
                </form>

                {list.rows.length === 0 ? (
                  <p className="admin-empty">Tidak ada baris yang cocok.</p>
                ) : (
                  <div className="admin-table-wrap reveal" style={delay(360)}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Nama</th>
                          <th>Status</th>
                          <th>Sumber</th>
                          <th>URL</th>
                          <th>Dibuat</th>
                          <th>Dihapus</th>
                          <th>
                            <span className="sr-only">Aksi</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.rows.map((row, index) => (
                          <tr
                            key={row.id}
                            className="row-in"
                            style={delay(Math.min(index * 18, 320))}
                          >
                            <td className="font-mono">{row.name}</td>
                            <td>
                              <span className="badge" data-s={row.status}>
                                {STATUS_LABEL[row.status]}
                              </span>
                            </td>
                            <td className="text-muted">{row.source_type}</td>
                            <td>
                              {row.url ? (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="admin-link"
                                >
                                  {prettyUrl(row.url)}
                                </a>
                              ) : (
                                <span className="text-faint">—</span>
                              )}
                            </td>
                            <td className="text-faint">{formatDate(row.created_at)}</td>
                            <td className="text-faint">
                              {row.deleted_at ? formatDate(row.deleted_at) : "—"}
                            </td>
                            <td className="admin-cell-action">
                              {row.status === "deleted" ? (
                                <span className="text-faint">—</span>
                              ) : (
                                <DeleteRow id={row.id} name={row.name} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {list.matched > list.rows.length && (
                  <p className="admin-note">
                    Menampilkan {list.rows.length} terbaru dari {list.matched} baris. Persempit dengan
                    filter atau pencarian.
                  </p>
                )}

                <p className="admin-note">
                  Menghapus di sini ikut menghapus project-nya di Vercel, jadi URL-nya berhenti
                  hidup dan slotnya bebas lagi.
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
