"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconAlert,
  IconArchive,
  IconCheck,
  IconCode,
  IconCopy,
  IconExternal,
  IconFolder,
  IconGithub,
  IconRefresh,
  IconRocket,
  IconUpload,
  IconX,
} from "@/components/icons";
import { DONE_STEP_INDEX, STAGE_INDEX, type SourceType } from "@/lib/deploy-protocol";
import {
  NAME_CHECK_DEBOUNCE_MS,
  checkName,
  startDeploy,
  type Picked,
  type PickedFile,
} from "@/lib/deploy-client";
import {
  MAX_FILES,
  MAX_NAME_LENGTH,
  MAX_ZIP_BYTES,
  NAME_RULE_TEXT,
  ZIP_ACCEPT,
  ZIP_ONLY_MESSAGE,
  HTML_ACCEPT,
  isHtmlName,
  isZipName,
  isValidName,
} from "@/lib/validate";
import { NAME_TAKEN_MESSAGE, type ErrorField } from "@/lib/errors";

type Tab = SourceType;
type CheckState = "idle" | "checking" | "ok" | "taken";
type DeployState = "idle" | "working" | "success" | "error";

interface FsFileEntry {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (cb: (file: File) => void, err?: () => void) => void;
}
interface FsDirEntry {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err?: () => void) => void;
  };
}
type FsEntry = FsFileEntry | FsDirEntry;

const TABS: Array<{ id: Tab; label: string; Icon: typeof IconGithub }> = [
  { id: "github", label: "GitHub", Icon: IconGithub },
  { id: "zip", label: "ZIP", Icon: IconArchive },
];

/** Label langkah UI; indeksnya dijaga STAGE_INDEX/DONE_STEP_INDEX dari protokol. */
const STEPS = ["Menyiapkan file", "Membuat project", "Selesai"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pickBytes(pick: Picked): number {
  return pick.kind === "zip"
    ? pick.file.size
    : pick.entries.reduce((sum, entry) => sum + entry.file.size, 0);
}

/** Telusuri entri File System API saat folder dijatuhkan, simpan path relatif. */
function walkEntry(entry: FsEntry, prefix: string, out: PickedFile[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file) => {
          out.push({ path: `${prefix}${file.name}`, file });
          resolve();
        },
        () => resolve()
      );
      return;
    }
    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve();
            return;
          }
          void Promise.all(
            batch.map((child) => walkEntry(child, `${prefix}${entry.name}/`, out))
          ).then(readBatch);
        },
        () => resolve()
      );
    };
    readBatch();
  });
}

export default function DeployForm() {
  const [name, setName] = useState("");
  const [check, setCheck] = useState<{ state: CheckState; reason: string }>({
    state: "idle",
    reason: "",
  });
  const [tab, setTab] = useState<Tab>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [pick, setPick] = useState<Picked | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<DeployState>("idle");
  const [stageIdx, setStageIdx] = useState(0);
  const [result, setResult] = useState<{ url: string; renamed: boolean } | null>(null);
  const [typedUrl, setTypedUrl] = useState("");
  const [error, setError] = useState<{ target: "name" | "source"; message: string } | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory bukan atribut JSX dikenal: pasang lewat ref.
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  // Cek ketersediaan nama, jalan otomatis setelah berhenti mengetik.
  useEffect(() => {
    if (!isValidName(name)) {
      setCheck({ state: "idle", reason: "" });
      return;
    }
    setCheck({ state: "checking", reason: "" });
    const timer = setTimeout(() => {
      checkName(name)
        .then((data) => {
          setCheck(
            data.available
              ? { state: "ok", reason: "" }
              : { state: "taken", reason: data.reason ?? NAME_TAKEN_MESSAGE }
          );
        })
        .catch(() => setCheck({ state: "idle", reason: "" }));
    }, NAME_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  const sourceReady =
    tab === "github" ? githubUrl.trim().length > 0 : pick !== null;

  const working = state === "working";
  const ready = isValidName(name) && check.state === "ok" && sourceReady;
  const canDeploy = !working && ready;

  const idleHint = !isValidName(name)
    ? "Isi nama project"
    : check.state === "checking"
      ? "Memeriksa nama…"
      : check.state !== "ok"
        ? "Nama belum tersedia"
        : !sourceReady
          ? "Pilih sumber situs"
          : "Siap dideploy";

  // URL muncul dengan efek mengetik singkat.
  useEffect(() => {
    if (!result) {
      setTypedUrl("");
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTypedUrl(result.url);
      return;
    }
    setTypedUrl("");
    let shown = 0;
    const timer = setInterval(() => {
      shown += 2;
      setTypedUrl(result.url.slice(0, shown));
      if (shown >= result.url.length) clearInterval(timer);
    }, 24);
    return () => clearInterval(timer);
  }, [result]);

  function showError(message: string, field: ErrorField = "source"): void {
    setError({ target: field, message });
    setShakeKey((value) => value + 1);
    setState("error");
  }

  function resetForAgain(): void {
    setResult(null);
    setError(null);
    setTypedUrl("");
    setState("idle");
    setStageIdx(0);
    setName("");
    setCheck({ state: "idle", reason: "" });
  }

  async function copyLink(): Promise<void> {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard ditolak browser: biarkan.
    }
  }

  function onTabKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = TABS.findIndex((item) => item.id === tab);
    const delta = event.key === "ArrowRight" ? 1 : TABS.length - 1;
    const next = TABS[(current + delta) % TABS.length].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  function onFolderChange(files: FileList | null): void {
    const list = Array.from(files ?? []);
    if (list.length === 0) {
      setPick(null);
      return;
    }
    setPick({
      kind: "folder",
      entries: list.map((file) => ({ path: file.webkitRelativePath || file.name, file })),
    });
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    setDragOver(false);
    const dt = event.dataTransfer;
    const entries: PickedFile[] = [];
    const walkers: Promise<void>[] = [];
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind !== "file") continue;
      const entry = (
        item as unknown as { webkitGetAsEntry?: () => FsEntry | null }
      ).webkitGetAsEntry?.();
      if (entry) walkers.push(walkEntry(entry, "", entries));
    }
    const fallback = Array.from(dt.files ?? []).map((file) => ({ path: file.name, file }));
    await Promise.all(walkers);

    const all = entries.length > 0 ? entries : fallback;
    if (all.length === 0) return;
    setTab("zip");
    if (all.length === 1 && isZipName(all[0].path)) {
      setPick({ kind: "zip", file: all[0].file });
      return;
    }
    setPick({ kind: "folder", entries: all });
  }

  async function runDeploy(): Promise<void> {
    setState("working");
    setError(null);
    setResult(null);
    setStageIdx(0);

    try {
      await startDeploy(
        { name, tab, githubUrl, pick },
        {
          onStage: (stage) => setStageIdx(STAGE_INDEX[stage]),
          onDone: ({ url, renamed }) => {
            setResult({ url, renamed });
            setStageIdx(DONE_STEP_INDEX);
            setState("success");
          },
          onError: ({ message, field }) => showError(message, field),
        }
      );
    } finally {
      setState((current) => (current === "working" ? "idle" : current));
    }
  }

  return (
    <>
      <section className="pane-main">
        <form
          id="deploy-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (canDeploy) void runDeploy();
          }}
        >
          {/* Nama project */}
          <div className="field">
            <label htmlFor="project-name" className="field-label">
              Nama project
            </label>
            <div className="relative">
              <input
                id="project-name"
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="input pr-28 font-mono"
                placeholder="namaweb"
                value={name}
                onInput={(event) => {
                  const clean = event.currentTarget.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, MAX_NAME_LENGTH);
                  setName(clean);
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                .vercel.app
              </span>
            </div>
            <div aria-live="polite" className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[13px]">
                {check.state === "checking" && <span className="text-faint">Memeriksa…</span>}
                {check.state === "ok" && (
                  <span className="check-icon flex items-center gap-1.5 text-ok">
                    <IconCheck size={14} className="check-path" />
                    Tersedia
                  </span>
                )}
                {check.state === "taken" && (
                  <span className="check-icon flex items-center gap-1.5 text-err">
                    <IconAlert size={14} />
                    {check.reason}
                  </span>
                )}
                {check.state === "idle" && (
                  <span className="text-faint">{NAME_RULE_TEXT}</span>
                )}
              </div>
              {error?.target === "name" && (
                <p key={`name-${shakeKey}`} role="alert" className="shake mt-1 flex items-center gap-1.5 text-[13px] text-err">
                  <IconAlert size={14} />
                  {error.message}
                </p>
              )}
          </div>

          {/* Sumber */}
          <div className="field">
            <span id="source-label" className="field-label">
              Sumber
            </span>
            <div role="group" aria-labelledby="source-label">
              <div role="tablist" aria-label="Sumber situs" onKeyDown={onTabKeyDown} className="seg">
                <div
                  aria-hidden
                  className="seg-thumb"
                  style={{
                    transform: `translateX(${TABS.findIndex((item) => item.id === tab) * 100}%)`,
                  }}
                />
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    id={`tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    aria-controls={`panel-${item.id}`}
                    tabIndex={tab === item.id ? 0 : -1}
                    onClick={() => setTab(item.id)}
                    onKeyDown={onTabKeyDown}
                    className="seg-tab"
                  >
                    <item.Icon size={15} />
                    {item.label}
                  </button>
                ))}
              </div>

              <div id={`panel-${tab}`} role="tabpanel" className="mt-3">
                {tab === "github" && (
                  <div>
                    <div className="input-icon">
                      <IconGithub size={16} />
                      <input
                        type="url"
                        value={githubUrl}
                        onChange={(event) => setGithubUrl(event.target.value)}
                        placeholder="github.com/user/repo"
                        aria-label="URL repo GitHub"
                        className="input font-mono text-sm"
                      />
                    </div>
                    <p className="mt-2 text-[13px] text-faint">Repo publik saja.</p>
                  </div>
                )}

                {tab === "zip" && (
                  <div>
                    {pick === null ? (
                      <div
                        className={`dz${dragOver ? " is-over" : ""}`}
                        onClick={() => zipInputRef.current?.click()}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                            setDragOver(false);
                          }
                        }}
                        onDrop={(event) => void onDrop(event)}
                      >
                        <span className="dz-icon">
                          <IconUpload size={26} />
                        </span>
                        <span className="mt-1 text-sm">
                          Tarik file ZIP, folder, atau satu file HTML ke sini
                        </span>
                        <span className="text-[12px] text-faint">atau</span>
                        <span className="mt-2 flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              zipInputRef.current?.click();
                            }}
                          >
                            <IconArchive size={15} />
                            Pilih file ZIP
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              folderInputRef.current?.click();
                            }}
                          >
                            <IconFolder size={15} />
                            Pilih folder
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              htmlInputRef.current?.click();
                            }}
                          >
                            <IconCode size={15} />
                            Pilih file HTML
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="chip">
                        <span className="chip-badge">
                          {pick.kind === "zip" ? <IconArchive size={17} /> : <IconFolder size={17} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px]">
                            {pick.kind === "zip"
                              ? pick.file.name
                              : pick.entries.length === 1
                                ? pick.entries[0].path
                                : `${pick.entries.length} file`}
                          </span>
                          <span className="block text-[12px] text-faint">{formatBytes(pickBytes(pick))}</span>
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Ganti pilihan file"
                          onClick={() => setPick(null)}
                        >
                          <IconX size={16} />
                        </button>
                      </div>
                    )}
                    <input
                      ref={zipInputRef}
                      type="file"
                      accept={ZIP_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file && !isZipName(file.name)) {
                          showError(ZIP_ONLY_MESSAGE);
                          event.target.value = "";
                          return;
                        }
                        setPick(file ? { kind: "zip", file } : null);
                      }}
                    />
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => onFolderChange(event.target.files)}
                    />
                    <input
                      ref={htmlInputRef}
                      type="file"
                      accept={HTML_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) return;
                        if (!isHtmlName(file.name)) {
                          showError("Sumber HTML harus berformat .html atau .htm.");
                          event.target.value = "";
                          return;
                        }
                        // Dibungkus jadi pick folder satu berkas: jalur ZIP yang
                        // sudah ada yang menangani, dan server menyalin berkas itu
                        // jadi index.html.
                        setPick({ kind: "folder", entries: [{ path: file.name, file }] });
                      }}
                    />
                    <p className="mt-2 text-[13px] text-faint">
                      Maksimal {MAX_ZIP_BYTES / 1024 / 1024} MB dan {MAX_FILES} file. Wajib ada
                      index.html di root; satu file HTML tunggal otomatis jadi index.html.
                    </p>
                  </div>
                )}
              </div>
              {error?.target === "source" && (
                <p key={`src-${shakeKey}`} role="alert" className="shake mt-2 flex items-center gap-1.5 text-[13px] text-err">
                  <IconAlert size={14} />
                  {error.message}
                </p>
              )}
            </div>
          </div>
        </form>
      </section>

      {/* Status bar bawah */}
      <div className="actionbar">
        <div className="min-w-0 flex-1">
          {working ? (
            <ol className="rail" aria-label="Progres deploy">
              {STEPS.map((step, index) => {
                const stateAttr =
                  index < stageIdx ? "done" : index === stageIdx ? "active" : "todo";
                return (
                  <li key={step} data-state={stateAttr} className="rail-step">
                    <span className="rail-dot" aria-hidden />
                    <span className="rail-label">{step}</span>
                  </li>
                );
              })}
            </ol>
          ) : state === "success" && result ? (
            <div className="flex min-w-0 items-center gap-2">
              <IconCheck
                size={16}
                className="check-draw shrink-0"
                style={{ color: result.renamed ? "var(--warn)" : "var(--ok)" }}
              />
              {result.renamed && (
                <span className="shrink-0 text-[12px] text-warn">Nama dipakai, alamat: </span>
              )}
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-ink underline decoration-accent decoration-2 underline-offset-4"
              >
                <span className="truncate">{typedUrl}</span>
                <IconExternal size={13} className="shrink-0 text-faint" />
              </a>
            </div>
          ) : (
            <div aria-live="polite" className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className={`status-dot${ready ? " is-ready" : ""}`} aria-hidden />
              <span className="truncate text-muted">{idleHint}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {state === "success" && result ? (
            <>
              <button type="button" onClick={() => void copyLink()} className="btn-ghost">
                {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                {copied ? "Tersalin" : "Salin link"}
              </button>
              <button type="button" onClick={resetForAgain} className="btn-ghost text-muted">
                <IconRefresh size={15} />
                Deploy lagi
              </button>
            </>
          ) : (
            <button type="submit" form="deploy-form" disabled={!canDeploy} className="btn-primary">
              {working ? (
                <>
                  <span className="spinner" aria-hidden />
                  Mendeploy…
                </>
              ) : (
                <>
                  <IconRocket size={16} />
                  Deploy
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
