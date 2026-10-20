import { NextResponse, type NextRequest } from "next/server";
import { toBillCustomer } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

type Row = Parameters<typeof toBillCustomer>[0] & { name_ta: string | null; phone: string | null; score: number };

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[%_\\]/g, "").trim().slice(0, 60);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers", { q, lim: 8 });
  if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 });
  return NextResponse.json(
    ((data ?? []) as Row[]).map((c) => ({ ...toBillCustomer(c), nameTa: c.name_ta, phone: c.phone, score: Number(c.score ?? 0) })),
  );
}
