import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type ProductHit = {
  id: string;
  name: string;
  nameTa: string | null;
  unit: string | null;
  hsn: string | null;
  gstRate: number;
  defaultRate: number | null;
};

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/[%_\\]/g, "").trim().slice(0, 60);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_products", { q, lim: 8 });
  if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 });
  const hits: ProductHit[] = (data ?? []).map(
    (p: { id: string; name: string; name_ta: string | null; unit: string | null; hsn_code: string | null; gst_rate: number | null; default_rate: number | null }) => ({
      id: p.id,
      name: p.name,
      nameTa: p.name_ta,
      unit: p.unit,
      hsn: p.hsn_code,
      gstRate: Number(p.gst_rate ?? 0),
      defaultRate: p.default_rate === null ? null : Number(p.default_rate),
    }),
  );
  return NextResponse.json(hits);
}
