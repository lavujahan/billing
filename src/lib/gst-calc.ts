// GST arithmetic shared by bills and purchases. All maths in paise; rupees only at the edges.
// GST is split per line so CGST always equals SGST.

export type CalcLineInput = { key: string; qty: number; rate: number; gstRate: number };

export type LineTotals = {
  key: string;
  qty: number;
  rate: number;
  gross: number; // qty × rate as entered
  taxable: number; // after removing included GST and the discount share
  tax: number;
  amount: number; // taxable + tax
};

export type GstTotals = {
  lines: LineTotals[];
  subtotal: number; // taxable before discount
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
};

export function calcGst(
  input: CalcLineInput[],
  opts: { inclusive: boolean; discount: { mode: "amount" | "percent"; value: number }; interState: boolean },
): GstTotals {
  const base = input.map((l) => {
    const gross = Math.round(l.qty * l.rate * 100);
    const taxable = opts.inclusive ? Math.round((gross * 100) / (100 + l.gstRate)) : gross;
    return { ...l, gross, taxable };
  });

  const subtotal = base.reduce((s, l) => s + l.taxable, 0);
  const wanted =
    opts.discount.mode === "percent"
      ? Math.round((subtotal * Math.min(opts.discount.value, 100)) / 100)
      : Math.round(opts.discount.value * 100);
  const discount = Math.min(Math.max(wanted, 0), subtotal);

  let allocated = 0;
  let cgst = 0;
  let igst = 0;
  const lines: LineTotals[] = base.map((l, i) => {
    const share = i === base.length - 1 ? discount - allocated : subtotal ? Math.round((discount * l.taxable) / subtotal) : 0;
    allocated += share;
    const net = l.taxable - share;
    let tax: number;
    if (opts.interState) {
      tax = Math.round((net * l.gstRate) / 100);
      igst += tax;
    } else {
      const half = Math.round((net * l.gstRate) / 200);
      tax = half * 2;
      cgst += half;
    }
    return { key: l.key, qty: l.qty, rate: l.rate, gross: l.gross / 100, taxable: net / 100, tax: tax / 100, amount: (net + tax) / 100 };
  });

  const taxable = subtotal - discount;
  const preRound = taxable + cgst * 2 + igst;
  const total = Math.round(preRound / 100) * 100;

  return {
    lines,
    subtotal: subtotal / 100,
    discount: discount / 100,
    taxable: taxable / 100,
    cgst: cgst / 100,
    sgst: cgst / 100,
    igst: igst / 100,
    roundOff: (total - preRound) / 100,
    total: total / 100,
  };
}
