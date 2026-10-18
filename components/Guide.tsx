"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconRocket } from "@/components/icons";

/**
 * Panduan untuk orang yang belum pernah menyentuh kode sama sekali.
 *
 * Situs ini berguna hanya kalau ada berkas yang bisa diunggah, dan pengunjung
 * yang belum punya apa-apa akan mentok di kolom kosong. Jalan keluarnya minta
 * kode ke AI mana pun — bukan bagian dari layanan ini, tapi satu-satunya langkah
 * yang benar-benar menghambat orang baru. Karena itu contoh perintahnya
 * disiapkan siap tempel, bukan cuma disuruh "minta ke AI".
 */
const CONTOH_PERINTAH = `Buatkan saya satu halaman web lengkap dalam SATU berkas HTML. CSS dan JavaScript ditulis di dalam berkas yang sama, tanpa berkas lain dan tanpa pemasangan apa pun.

Isi halamannya: [tulis maumu di sini, contoh: profil singkat saya berisi nama, satu paragraf tentang saya, tiga tautan sosial, dan tombol WhatsApp].

Syaratnya:
- Rapi di layar HP dan tetap enak dilihat di laptop.
- Gaya gelap minimalis, kalem, tanpa efek berkilau.
- Tanpa layanan luar yang butuh kunci API atau berlangganan.
- Semua gambar dari kode saja, jangan ambil dari internet.

Cukup berikan kodenya saja.`;

export default function Guide() {
  const [copied, setCopied] = useState(false);

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(CONTOH_PERINTAH);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard ditolak (izin atau bukan HTTPS): biarkan teksnya disalin manual.
    }
  }

  return (
    <section className="guide">
      <h2 className="guide-title">
        <IconRocket size={14} className="text-faint" />
        Belum pernah bikin web? Mulai dari sini
      </h2>

      <ol className="guide-list">
        <li>
          <strong>Belum punya kodenya? Minta ke AI.</strong> Buka ChatGPT, Gemini,
          Claude, atau apa pun yang biasa kau pakai — semuanya boleh, yang gratis
          juga cukup. Tak perlu daftar ke mana-mana, tak perlu paham kodenya.
        </li>
        <li>
          Tempel perintah di bawah. Ganti bagian dalam tanda kurung siku dengan
          maumu — mau web undangan, portofolio, menu jualan, apa saja.
        </li>
        <li>
          AI-nya menjawab dengan satu blok kode. Salin semuanya, lalu tempel di
          kolom <em>Tempel kode</em> di atas — atau simpan jadi berkas{" "}
          <code>index.html</code> lalu unggah lewat tab <em>Berkas</em>.
        </li>
        <li>
          Sudah punya kodenya di GitHub, atau berkasnya banyak? Pakai tab{" "}
          <em>Repo GitHub</em> atau <em>ZIP / folder</em>. Empat jalan itu ujungnya
          sama.
        </li>
        <li>
          Tekan <strong>Deploy</strong>, tunggu sebentar, dapat link. Tinggal
          disebar.
        </li>
      </ol>

      <div className="guide-prompt">
        <div className="guide-prompt-head">
          <span>Perintah siap tempel</span>
          <button type="button" onClick={() => void copyPrompt()} className="btn-ghost">
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {copied ? "Tersalin" : "Salin"}
          </button>
        </div>
        <pre className="guide-prompt-body">{CONTOH_PERINTAH}</pre>
      </div>

      <p className="guide-note">
        Jawaban AI-nya bertele-tele? Bilang saja &ldquo;kodenya saja&rdquo;. Hasilnya
        berupa beberapa berkas terpisah? Bilang &ldquo;gabung semua jadi satu berkas
        HTML&rdquo;. Dan kalau kodenya bilang butuh kunci API, kunci rahasia, atau
        langganan berbayar — minta diganti dengan yang bisa jalan sendiri, karena
        yang bisa di-deploy di sini cuma berkas biasa.
      </p>
    </section>
  );
}
