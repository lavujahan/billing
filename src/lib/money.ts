const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrFixed = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function formatINR(rupees: number, opts: { fixed?: boolean } = {}) {
  const sign = rupees < 0 ? "−" : "";
  return `${sign}₹${(opts.fixed ? inrFixed : inr).format(Math.abs(rupees))}`;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

// Lenient parse for typed amounts: "4,500", "4.5k", "₹ 450".
export function parseAmount(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, "").toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|l|lakh)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === "k" ? 1_000 : m[2] ? 100_000 : 1;
  return Math.round(n * mult * 100) / 100;
}

export function parseQty(input: string): number | null {
  const s = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}

export function todayISO(timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function formatTime(ts: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(
    new Date(ts),
  );
}
