export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 py-3.5" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 animate-pulse rounded-field bg-outline" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
