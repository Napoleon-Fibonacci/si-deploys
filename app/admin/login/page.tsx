import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconAlert } from "@/components/icons";
import { adminEnabled, isAdmin } from "@/lib/admin";
import { RATE_LIMITS } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Tanpa "— Si Deploy": template di layout yang menambahkannya.
  title: "Masuk admin",
  robots: { index: false, follow: false },
};

/**
 * Pesan untuk tiap nilai `?error` dari /api/admin/login. Pesan batas diambil
 * dari kebijakan rate limit yang sama, jadi tak bisa berbeda kalimat.
 */
const ERROR_MESSAGES: Record<string, string> = {
  off: "Menu admin belum aktif di server.",
  limit: RATE_LIMITS.adminLogin.message,
  db: "Tidak bisa memeriksa batas percobaan masuk. Coba lagi sebentar.",
  "1": "Password salah.",
};

/** Halaman masuk admin. Form biasa tanpa JS, POST ke /api/admin/login. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!adminEnabled()) {
    return (
      <div className="app">
        <main className="admin-main">
          <div className="admin-login">
            <h1 className="stack-title">Admin nonaktif</h1>
            <p className="lead">
              Setel <span className="font-mono text-[13px]">ADMIN_PASSWORD</span> di server untuk
              mengaktifkan menu admin.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (await isAdmin()) redirect("/admin");

  return (
    <div className="app">
      <main className="admin-main">
        <div className="admin-login">
          <h1 className="stack-title">Masuk admin</h1>
          <p className="lead">Menu ini hanya untuk pemilik deployer.</p>

          <form action="/api/admin/login" method="post" className="field">
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
            {error && (
              <p role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] text-err">
                <IconAlert size={14} />
                {ERROR_MESSAGES[error] ?? ERROR_MESSAGES["1"]}
              </p>
            )}
            <div className="actionbar">
              <button type="submit" className="btn-primary">
                Masuk
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
