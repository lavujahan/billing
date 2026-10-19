import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/layout/Page";
import { ADMIN_NAV } from "@/lib/nav";

const PLACEHOLDERS = ADMIN_NAV.filter((item) => !("ready" in item));

export function generateStaticParams() {
  return PLACEHOLDERS.map((item) => ({ section: item.href.split("/").pop()! }));
}

export default async function AdminPlaceholderPage({ params }: PageProps<"/admin/[section]">) {
  const { section } = await params;
  const item = PLACEHOLDERS.find((i) => i.href === `/admin/${section}`);
  if (!item) notFound();
  return <ComingSoon title={`${item.label} · ${item.ta}`} phase={`Screen ${item.id} is built alongside the form that needs it.`} />;
}
