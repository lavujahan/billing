"use client";

import { useRef, useState } from "react";
import { CameraIcon } from "@/components/icons";
import type { BillPage } from "@/lib/purchase/types";

export type PageView = BillPage & { url: string | null };

const pill = "flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold";

export function BillPages({
  pages,
  busy,
  onFiles,
  onRemove,
  onCompare,
  compareOpen,
}: {
  pages: PageView[];
  busy: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (path: string) => void;
  onCompare: (index: number) => void;
  compareOpen: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length) onFiles(files);
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">Supplier bill · பில்</span>
        {pages.length > 0 && (
          <button
            type="button"
            onClick={() => onCompare(0)}
            aria-pressed={compareOpen}
            className={`${pill} ${compareOpen ? "border-primary bg-primary-container text-primary-strong" : "border-primary-outline text-primary"}`}
          >
            {compareOpen ? "Hide bill" : "Compare with bill"}
          </button>
        )}
      </div>

      {pages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <div key={p.path} className="relative shrink-0">
              <button
                type="button"
                onClick={() => onCompare(i)}
                aria-label={`Open page ${i + 1}`}
                className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-field border border-outline bg-background"
              >
                {p.mime === "application/pdf" ? (
                  <span className="text-xs font-bold text-ink-muted">PDF</span>
                ) : p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-ink-muted">Page {i + 1}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(p.path)}
                aria-label={`Remove page ${i + 1}`}
                className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-outline bg-surface text-sm text-ink-muted"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-primary-strong">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
          {busy}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!!busy} onClick={() => camera.current?.click()} className={`${pill} border-primary bg-primary text-white disabled:opacity-50`}>
          <CameraIcon size={18} /> {pages.length ? "Add page" : "Photo"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => gallery.current?.click()} className={`${pill} border-primary-outline text-primary-strong disabled:opacity-50`}>
          Gallery / PDF
        </button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
      />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={pick} />
    </section>
  );
}

// Split view: the bill pinned at the top, zoomable, while the form scrolls underneath.
export function ComparePanel({ pages, index, onIndex, onClose }: { pages: PageView[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const page = pages[index];
  if (!page) return null;
  return (
    <div className="sticky top-0 z-20 -mx-4 flex h-[42dvh] flex-col border-b-2 border-primary bg-ink/90">
      <div className="flex items-center gap-1 bg-surface px-2 py-1">
        {pages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onIndex(i)}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold ${i === index ? "bg-primary text-white" : "text-ink-muted"}`}
          >
            Page {i + 1}
          </button>
        ))}
        <span className="grow" />
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="h-9 w-9 text-lg font-bold">
          −
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="h-9 w-9 text-lg font-bold">
          +
        </button>
        <button type="button" aria-label="Close bill view" onClick={onClose} className="h-9 w-9 text-lg">
          ×
        </button>
      </div>
      <div className="grow overflow-auto">
        {page.mime === "application/pdf" ? (
          page.url ? (
            <iframe src={page.url} title={`Bill page ${index + 1}`} className="h-full w-full bg-white" />
          ) : null
        ) : page.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img src={page.url} alt={`Bill page ${index + 1}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="block" />
        ) : null}
      </div>
    </div>
  );
}
