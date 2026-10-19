import Link from "next/link";

export function SummaryCard({
  href,
  label,
  value,
  caption,
}: {
  href: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-card border border-outline bg-surface px-3.5 py-3 text-ink no-underline"
    >
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-[22px] font-bold">{value}</span>
      <span className="text-xs text-ink-muted">{caption}</span>
    </Link>
  );
}
