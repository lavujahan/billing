"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Bottom sheet on phones, centred dialog from 640px. Uses <dialog> for focus trapping and Esc.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[20px] bg-surface p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-card"
    >
      <div className="flex flex-col gap-3 p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="mx-auto h-1 w-10 rounded-full bg-outline sm:hidden" aria-hidden="true" />
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
