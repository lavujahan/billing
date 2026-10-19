import type { ReactNode } from "react";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-3.5 px-4 py-3.5 ${wide ? "max-w-5xl" : "max-w-[720px]"}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-[13px] text-ink-muted">{subtitle}</p>}
    </div>
  );
}

export function ComingSoon({ title, phase, children }: { title: string; phase: string; children?: ReactNode }) {
  return (
    <Page>
      <PageTitle title={title} />
      <div className="flex flex-col gap-1 rounded-card border border-outline bg-surface p-4">
        <span className="text-[15px] font-semibold">Coming soon · விரைவில்</span>
        <span className="text-[13px] text-ink-muted">{phase}</span>
        {children}
      </div>
    </Page>
  );
}
