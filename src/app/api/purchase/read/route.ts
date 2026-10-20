import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveOpenAIKey } from "@/lib/ai/keys";
import { getCurrentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/money";
import { downloadPage, ownsPath } from "@/lib/purchase/files";
import type { ReadResponse } from "@/lib/purchase/patch";
import { createClient } from "@/lib/supabase/server";
import { runPurchaseAgent } from "@/modules/purchase/agent";
import { toPurchasePatch } from "@/modules/purchase/match";

const Body = z.object({ pages: z.array(z.object({ path: z.string(), mime: z.string(), name: z.string() })).min(1).max(10) });

// Read uploaded bill pages with the vision model → a form patch matched to the vendor and item lists.
export async function POST(request: Request) {
  const t0 = Date.now();
  const reply = (body: ReadResponse, status = 200) => NextResponse.json(body, { status });
  const user = await getCurrentUser();
  const key = await resolveOpenAIKey(user.businessId);
  if (!key) return reply({ ok: false, error: "ai_off", message: "Bill reading is off — an admin needs to add the OpenAI key. You can still type the bill." }, 409);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.pages.some((p) => !ownsPath(user.businessId, p.path))) {
    return reply({ ok: false, error: "bad_request", message: "Couldn't find those pages." }, 400);
  }

  try {
    const supabase = await createClient();
    const [documents, { data: vendors }] = await Promise.all([
      Promise.all(parsed.data.pages.map(async (p) => ({ mime: p.mime, name: p.name, base64: (await downloadPage(p.path)).toString("base64") }))),
      supabase.from("vendors").select("name").eq("active", true).order("name").limit(300),
    ]);
    const extraction = await runPurchaseAgent({
      key,
      today: todayISO(),
      vendorNames: (vendors ?? []).map((v) => v.name),
      documents,
      businessId: user.businessId,
      userId: user.id,
    });
    const tRead = Date.now();
    const patch = await toPurchasePatch(supabase, extraction);
    console.info(`[purchase/read] ${documents.length} page(s) · read ${tRead - t0}ms · match ${Date.now() - tRead}ms`);
    return reply({ ok: true, patch });
  } catch (e) {
    console.error("bill read failed", e instanceof Error ? e.message : e);
    return reply({ ok: false, error: "read_failed", message: "Couldn't read the bill — try a clearer photo, or type it." }, 502);
  }
}
