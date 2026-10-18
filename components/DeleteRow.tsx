"use client";

import { useState } from "react";
import { IconCheck, IconTrash, IconX } from "@/components/icons";

/**
 * Tombol hapus dua langkah.
 *
 * Klik pertama hanya mempersenjatai tombolnya; yang menghapus adalah klik
 * kedua. Sengaja bukan `window.confirm`: dialog bawaan browser tak bisa
 * diikuti tema, dan memblokir. Sisi server tetap jalur POST biasa, jadi
 * tanpa JavaScript tombol ini hanya diam — tak ada yang terhapus diam-diam.
 */
export default function DeleteRow({ id, name }: { id: string; name: string }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        className="icon-btn"
        onClick={() => setArmed(true)}
        title={`Hapus ${name}`}
        aria-label={`Hapus ${name}`}
      >
        <IconTrash size={15} />
      </button>
    );
  }

  return (
    <form action="/api/admin/delete" method="post" className="del-confirm pop">
      <input type="hidden" name="id" value={id} />
      <span className="del-ask">Hapus?</span>
      <button
        type="submit"
        className="icon-btn is-danger"
        autoFocus
        title="Ya, hapus"
        aria-label={`Ya, hapus ${name}`}
      >
        <IconCheck size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setArmed(false)}
        title="Batal"
        aria-label="Batal menghapus"
      >
        <IconX size={15} />
      </button>
    </form>
  );
}
