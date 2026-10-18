import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Background from "@/components/Background";
import SideIcons from "@/components/SideIcons";
import { IconAlert, IconRocket } from "@/components/icons";
import { ADMIN_MAX_AGE, adminEnabled, isAdmin } from "@/lib/admin";
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

const SESSION_HOURS = Math.round(ADMIN_MAX_AGE / 3600);

/**
 * Kerangka halaman masuk: latar dan ikon tepi yang sama dengan halaman utama,
 * jadi pindah dari deployer ke admin tidak terasa pindah aplikasi.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Background />
      <SideIcons />
      <div className="app">
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="wordmark">
              <IconRocket size={16} />
              Si Deploy
            </Link>
            <span className="font-mono text-[11px] text-faint">admin</span>
          </div>
        </header>
        <main className="app-main">
          <section className="admin-login reveal">{children}</section>
        </main>
      </div>
    </>
  );
}

/** Halaman masuk admin. Form biasa tanpa JS, POST ke /api/admin/login. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!adminEnabled()) {
    return (
      <Shell>
        <span className="login-mark" aria-hidden="true">
          <IconAlert size={20} />
        </span>
        <h1 className="stack-title">Admin nonaktif</h1>
        <p className="lead">
          Setel <span className="font-mono text-[13px]">ADMIN_PASSWORD</span> di server untuk
          mengaktifkan menu admin.
        </p>
        <p className="login-foot">
          <Link className="admin-link" href="/">
            Kembali ke deployer
          </Link>
        </p>
      </Shell>
    );
  }

  if (await isAdmin()) redirect("/admin");

  return (
    <Shell>
      <span className="login-mark" aria-hidden="true">
        <IconRocket size={20} />
      </span>
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
        <div className="mt-6">
          <button type="submit" className="btn-primary login-submit">
            Masuk
          </button>
        </div>
      </form>

      <p className="login-foot">
        Sesi bertahan {SESSION_HOURS} jam setelah masuk.{" "}
        <Link className="admin-link" href="/">
          Kembali ke deployer
        </Link>
      </p>
    </Shell>
  );
}
