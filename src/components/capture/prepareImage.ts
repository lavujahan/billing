"use client";

export type PhotoIssue = "dark" | "blurry";
export type PreparedFile = { file: File; issues: PhotoIssue[]; previewUrl: string | null };

const MAX_SIDE = 2000;
const DARK_MEAN = 55; // average brightness 0–255
const BLUR_VARIANCE = 35; // Laplacian variance on a 320px greyscale copy

// Photos: check brightness/sharpness, then downscale to ~2000px JPEG (≈ 0.5–2 MB). PDFs pass through.
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf") return { file, issues: [], previewUrl: null };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(/heic|heif/i.test(file.type + file.name) ? "heic" : "unreadable");
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const issues = checkQuality(bitmap);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.82));
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  const out = new File([blob], name, { type: "image/jpeg" });
  return { file: out, issues, previewUrl: URL.createObjectURL(out) };
}

function checkQuality(bitmap: ImageBitmap): PhotoIssue[] {
  const w = 320;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const grey = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    grey[i] = g;
    sum += g;
  }
  const mean = sum / (w * h);

  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2;

  const issues: PhotoIssue[] = [];
  if (mean < DARK_MEAN) issues.push("dark");
  if (variance < BLUR_VARIANCE) issues.push("blurry");
  return issues;
}
