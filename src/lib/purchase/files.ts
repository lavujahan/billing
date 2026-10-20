import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const BUCKET = "purchase-bills";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const ALLOWED_MIME = Object.keys(EXT);

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function storePage(businessId: string, file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  const path = `${businessId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${EXT[file.type]}`;
  const { error } = await createAdminClient().storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return { path, hash: sha256(buf), mime: file.type, name: file.name.slice(0, 120) };
}

// Paths come back from the browser, so only files inside this business's folder are accepted.
export function ownsPath(businessId: string, path: string) {
  return path.startsWith(`${businessId}/`) && !path.includes("..") && /^[0-9a-f-]+\/\d{4}\/\d{2}\/[0-9a-f-]+\.(jpg|png|webp|pdf)$/.test(path);
}

export async function downloadPage(path: string) {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function signedUrls(supabase: Supabase, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function findDuplicateByHash(supabase: Supabase, hashes: string[], excludeId?: string) {
  if (!hashes.length) return null;
  let q = supabase
    .from("purchases")
    .select("id, bill_number, bill_date, total_amount, vendors(name)")
    .eq("status", "confirmed")
    .overlaps("file_hashes", hashes)
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.maybeSingle();
  return data
    ? {
        id: data.id as string,
        billNumber: data.bill_number as string | null,
        billDate: data.bill_date as string,
        total: Number(data.total_amount),
        vendorName: (data.vendors as unknown as { name: string } | null)?.name ?? "",
      }
    : null;
}
