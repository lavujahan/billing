import { Suspense } from "react";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading bill…</p>}>
      <div className="min-h-dvh bg-white text-black print:min-h-0">{children}</div>
    </Suspense>
  );
}
