"use client";

import { useState } from "react";
import { previewHost, previewSources } from "@/lib/preview";

/**
 * Pratinjau situs yang baru dideploy, muncul di bawah form setelah sukses.
 *
 * Gambar dimuat browser langsung dari layanan screenshot. Kalau sumber pertama
 * gagal, `onError` menukarnya ke sumber berikutnya; kalau semuanya gagal,
 * kartunya berhenti jadi tautan biasa yang tetap bisa dibuka.
 */
export function SitePreview({ url }: { url: string }) {
  const sources = previewSources(url);
  const host = previewHost(url);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Buka ${host}`}
      className="preview row-in"
    >
      {failed ? (
        <span className="preview-note">Pratinjau tidak tersedia — buka {host}</span>
      ) : (
        <>
          <span className="preview-note">Menyiapkan pratinjau…</span>
          <img
            src={sources[index]}
            alt={`Pratinjau ${host}`}
            decoding="async"
            className={`preview-img${loaded ? " is-loaded" : ""}`}
            onLoad={() => setLoaded(true)}
            onError={() => {
              if (index + 1 < sources.length) setIndex(index + 1);
              else setFailed(true);
            }}
          />
        </>
      )}
    </a>
  );
}
