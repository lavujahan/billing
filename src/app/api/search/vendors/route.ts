import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type VendorHit = { id: string; name: string; nameTa: string | null; gstin: string | null; stateCode: string | null; phone: string | null; balance: number; score: number };

type Row = { id: string; name: string; name_ta: string | null; gstin: string | null; state_code: string | null; phone: string | null; balance: number | null; score: number | null };

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[%_\\]/g, "").trim().slice(0, 60);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_vendors", { q, lim: 8 });
  if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 });
  const hits: VendorHit[] = ((data ?? []) as Row[]).map((v) => ({
    id: v.id,
    name: v.name,
    nameTa: v.name_ta,
    gstin: v.gstin,
    stateCode: v.state_code,
    phone: v.phone,
    balance: Number(v.balance ?? 0),
    score: Number(v.score ?? 0),
  }));
  return NextResponse.json(hits);
}
