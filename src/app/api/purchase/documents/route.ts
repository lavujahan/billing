import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ALLOWED_MIME, findDuplicateByHash, MAX_FILE_BYTES, signedUrls, storePage } from "@/lib/purchase/files";
import { createClient } from "@/lib/supabase/server";

// Upload bill pages (photos or PDF). Returns stored pages, preview URLs and any earlier purchase with the same file.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "no_files", message: "No file received." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "too_many", message: "Up to 10 pages per bill." }, { status: 400 });

  for (const f of files) {
    if (!ALLOWED_MIME.includes(f.type)) {
      return NextResponse.json(
        { error: "type", message: f.type === "image/heic" ? "HEIC photos aren't supported here — take the photo from the app's camera button." : "Use a photo (JPG/PNG) or a PDF." },
        { status: 415 },
      );
    }
    if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: "size", message: "Each file must be under 20 MB." }, { status: 413 });
  }

  try {
    const pages = await Promise.all(files.map((f) => storePage(user.businessId, f)));
    const supabase = await createClient();
    const [urls, duplicate] = await Promise.all([
      signedUrls(supabase, pages.map((p) => p.path)),
      findDuplicateByHash(supabase, pages.map((p) => p.hash)),
    ]);
    return NextResponse.json({ pages, urls, duplicate });
  } catch (e) {
    console.error("bill upload failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "upload_failed", message: "Upload failed — check the connection and try again." }, { status: 502 });
  }
}
