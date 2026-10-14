import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconRefresh, IconRocket, IconSearch, IconX } from "@/components/icons";
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

  const swept = params.swept === "1" ? "ok" : params.swept === "0" ? "fail" : null;

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-inner appbar-wide">
          <span className="wordmark">
            <IconRocket size={16} />
            Si Deploy
          </span>
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
          <header className="admin-head">
            <div>
              <h1 className="stack-title">Deployan</h1>
              <p className="lead">Semua deploy yang tercatat di database.</p>
            </div>
            <div className="admin-actions">
              <span className="admin-total">
                {list ? `${list.total} baris` : "—"}
              </span>
              <form action="/api/admin/sweep" method="post">
                <button type="submit" className="btn-ghost">
                  <IconRefresh size={15} />
                  Bersihkan
                </button>
              </form>
            </div>
          </header>

          {swept && (
            <p className={`admin-note${swept === "fail" ? " text-err" : ""}`} role="status">
              {swept === "fail"
                ? "Sapuan gagal dijalankan. Coba lagi."
                : `Sapuan selesai: ${params.failed ?? 0} pending basi ditandai gagal, ${params.deleted ?? 0} project dihapus di Vercel.`}
            </p>
          )}

          {!list ? (
            <p className="admin-empty">Database belum siap. Coba lagi sebentar.</p>
          ) : (
            <>
              <nav className="filters" aria-label="Filter status">
                <Link className="filter" aria-current={status === null} href={href(null, q)}>
                  Semua
                  <span className="filter-count">{list.total}</span>
                </Link>
                {DEPLOY_STATUSES.map((key) => (
                  <Link
                    key={key}
                    className="filter"
                    aria-current={status === key}
                    href={href(key, q)}
                  >
                    {STATUS_LABEL[key]}
                    <span className="filter-count">{list.counts[key]}</span>
                  </Link>
                ))}
              </nav>

              <form className="admin-search" method="get" action="/admin" role="search">
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
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th>Status</th>
                        <th>Sumber</th>
                        <th>URL</th>
                        <th>Dibuat</th>
                        <th>Dihapus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono">{row.name}</td>
                          <td>
                            <span className="badge" data-s={row.status}>
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td className="text-muted">{row.source_type}</td>
                          <td>
                            {row.url ? (
                              <a href={row.url} target="_blank" rel="noreferrer" className="admin-link">
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
            </>
          )}
        </div>
      </main>
    </div>
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
