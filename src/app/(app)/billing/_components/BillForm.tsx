"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductHit } from "@/app/api/search/products/route";
import { BackIcon } from "@/components/icons";
import { ChoicePills } from "@/components/form/ChoicePills";
import { fetchJson, SearchPicker } from "@/components/form/SearchPicker";
import { clearDeviceCopy, readDeviceCopy, useAutosave } from "@/components/form/useAutosave";
import { FieldMic, type VoiceJobs } from "@/components/voice/FieldMic";
import { HoldToSpeak } from "@/components/voice/HoldToSpeak";
import { postAudio, type Recording } from "@/components/voice/useRecorder";
import { applyVoicePatch, type ApplyResult, type TypedField } from "@/lib/billing/apply-patch";
import { computeTotals } from "@/lib/billing/totals";
import type { BillCustomer, BillDraft, BillingContext, BillLine, PaymentStatus } from "@/lib/billing/types";
import { validateBill } from "@/lib/billing/validate";
import { LOW_CONFIDENCE, type FreeVoiceResponse } from "@/lib/billing/voice-patch";
import { formatDate, formatINR } from "@/lib/money";
import {
  detectCommand,
  nameSearchTerms,
  parseAmountUtterance,
  parseDateUtterance,
  parseLineUtterance,
  parsePaymentUtterance,
  splitItemList,
  splitItemUtterance,
} from "@/lib/voice/parse";
import { confidentPick, mergeByBestScore } from "@/lib/voice/pick";
import { discardDraftAction, requestItemAction, saveDraftAction } from "../actions";
import { SaveSummary } from "./SaveSummary";
import { VoiceChooser } from "./VoiceChooser";

type CustomerHit = BillCustomer & { id: string; nameTa: string | null; phone: string | null; score: number };
type CustomerOption = BillCustomer & { score?: number };

type Props = {
  businessName: string;
  ctx: BillingContext;
  initial: BillDraft;
  draftId: string | null;
  voiceEnabled: boolean;
  edit?: { invoiceId: string; invoiceNo: string; updatedAt: string };
};

const NEW_KEY = "bill-draft:new";
const NOT_HEARD = "புரியல, மறுபடியும் சொல்லுங்க · Didn't catch that";

const fieldBox = "flex flex-col rounded-field border px-2.5 py-1.5";
const numberInput = "w-full bg-transparent text-[15px] font-semibold outline-none";

async function searchByVoice<T extends { id: string; score: number }>(kind: "customers" | "products", text: string): Promise<T[]> {
  const lists = await Promise.all(
    nameSearchTerms(text).map((q) => fetchJson<T[]>(`/api/search/${kind}?q=${encodeURIComponent(q)}`).catch(() => [] as T[])),
  );
  return mergeByBestScore(lists);
}

export function BillForm({ businessName, ctx, initial, draftId: initialDraftId, voiceEnabled, edit }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<BillDraft>(initial);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [showErrors, setShowErrors] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingItem, setAddingItem] = useState(initial.lines.length === 0 && initial.customer !== null);
  const [restorable, setRestorable] = useState<{ value: BillDraft; at: number } | null>(null);
  const [undoStack, setUndoStack] = useState<BillDraft[]>([]);
  const [customerChoice, setCustomerChoice] = useState<ApplyResult["customerChoice"]>(null);
  // One row per item recording still being processed, so the next item can be spoken meanwhile.
  const [voiceItems, setVoiceItems] = useState<{ id: string; heard: string | null; problem: string | null }[]>([]);
  const [productChoices, setProductChoices] =useState<{ id: string; spoken: string; candidates: ProductHit[]; qty: number | null }[]>([]);
  const [unmatched, setUnmatched] = useState<ApplyResult["unmatched"]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [voiceStatus, setVoiceStatus] = useState<{ kind: "busy" } | { kind: "done"; transcript: string; chips: string[] } | { kind: "error"; message: string } | null>(null);
  const [extraDrafts, setExtraDrafts] = useState<{ id: string; title: string }[]>([]);
  const typed = useRef(new Set<TypedField>());
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
  const focusLine = useRef<string | null>(null);
  // Latest draft for async voice handlers. Several item recordings can finish back to back,
  // before React re-renders, so each must build on the previous one's result.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const totals = useMemo(() => computeTotals(draft, ctx.businessStateCode), [draft, ctx.businessStateCode]);
  const validation = useMemo(() => validateBill(draft, totals, ctx), [draft, totals, ctx]);
  const touched = Boolean(draft.customer || draft.lines.length);
  const storageKey = draftId ? `bill-draft:${draftId}` : NEW_KEY;

  const autosave = useAutosave({
    value: draft,
    enabled: !edit && !saved && touched,
    storageKey,
    save: useCallback(
      async (value: BillDraft) => {
        const res = await saveDraftAction({ id: draftId, draft: value, title: value.customer?.name ?? "", amount: totals.total });
        if (!res.ok) return false;
        if (res.id !== draftId) {
          clearDeviceCopy(NEW_KEY);
          setDraftId(res.id);
          window.history.replaceState(null, "", `/billing/new?draft=${res.id}`);
        }
        return true;
      },
      [draftId, totals.total],
    ),
  });

  const offerRestore = !edit && !initialDraftId && !initial.customer;
  useEffect(() => {
    if (!offerRestore) return;
    // localStorage only exists in the browser, so read it after hydration.
    const timer = setTimeout(() => {
      const copy = readDeviceCopy<BillDraft>(NEW_KEY);
      if (copy && (copy.value.customer || copy.value.lines.length)) setRestorable(copy);
    }, 0);
    return () => clearTimeout(timer);
  }, [offerRestore]);

  useEffect(() => {
    if (focusLine.current) {
      qtyRefs.current.get(focusLine.current)?.select();
      focusLine.current = null;
    }
  }, [draft.lines.length]);

  // ── Updates ────────────────────────────────────────────────────────────────
  const update = (patch: Partial<BillDraft>, typedField?: TypedField) => {
    if (typedField) typed.current.add(typedField);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const updateLine = (key: string, patch: Partial<BillLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  // Voice changes are undoable as one step each.
  const withUndo = (change: (d: BillDraft) => BillDraft) => {
    const prev = draftRef.current;
    const next = change(prev);
    draftRef.current = next;
    setUndoStack((s) => [...s.slice(-19), prev]);
    setDraft(next);
  };
  const undo = () => {
    const prev = undoStack.at(-1);
    if (!prev) return;
    setUndoStack((s) => s.slice(0, -1));
    setDraft(prev);
  };

  const issueFor = (field: string) =>
    (showErrors ? validation.blocking.find((i) => i.field === field) : undefined) ?? validation.warnings.find((i) => i.field === field);
  const isBlocking = (field: string) => showErrors && validation.blocking.some((i) => i.field === field);

  async function priceFor(productId: string, customerId: string | null | undefined) {
    const params = new URLSearchParams({ product: productId, ...(customerId ? { customer: customerId } : {}) });
    return fetchJson<{ rate: number | null; usualRate: number | null }>(`/api/billing/price?${params}`).catch(() => ({
      rate: null,
      usualRate: null,
    }));
  }

  async function addProduct(p: ProductHit, fromVoice = false, qty: number | null = null) {
    // Saying an item that is already on the bill adds to that line instead of a second line.
    const existing = fromVoice ? draftRef.current.lines.find((l) => l.productId === p.id) : undefined;
    if (existing) {
      const before = Number(existing.qty) || 0;
      const after = Math.round((before + (qty ?? 1)) * 1000) / 1000;
      withUndo((d) => ({ ...d, lines: d.lines.map((l) => (l.key === existing.key ? { ...l, qty: String(after), confidence: null } : l)) }));
      setVoiceStatus({ kind: "done", transcript: p.name, chips: [`Already on the bill · qty ${before} → ${after}`] });
      setTimeout(() => setVoiceStatus((s) => (s?.kind === "done" ? null : s)), 6000);
      return;
    }
    const key = crypto.randomUUID();
    const price = await priceFor(p.id, draftRef.current.customer?.id);
    const line: BillLine = {
      key,
      productId: p.id,
      name: p.name,
      nameTa: p.nameTa,
      unit: p.unit,
      hsn: p.hsn,
      gstRate: p.gstRate,
      qty: qty === null ? "1" : String(qty),
      rate: price.rate === null ? "" : String(price.rate),
      usualRate: price.usualRate,
    };
    // Voice keeps the add-item panel open, so the next item can be spoken right away.
    if (fromVoice) withUndo((d) => ({ ...d, lines: [...d.lines, line] }));
    else {
      focusLine.current = key;
      setDraft((d) => ({ ...d, lines: [...d.lines, line] }));
      setAddingItem(false);
    }
  }

  async function setCustomer(c: BillCustomer | null, fromVoice = false) {
    if (fromVoice) withUndo((d) => ({ ...d, customer: c }));
    else update({ customer: c });
    setCustomerChoice(null);
    if (!c?.id) return;
    const lines = draftRef.current.lines;
    const prices = await Promise.all(lines.map((l) => priceFor(l.productId, c.id)));
    const usual = new Map(lines.map((l, i) => [l.key, prices[i]?.usualRate ?? null]));
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (usual.has(l.key) ? { ...l, usualRate: usual.get(l.key)! } : l)) }));
  }

  // ── Field voice handlers: transcript → value by code, no AI ────────────────
  async function onCustomerVoice(text: string) {
    const candidates = await searchByVoice<CustomerHit>("customers", text);
    const pick = confidentPick(candidates);
    if (pick) await setCustomer(pick, true);
    else setCustomerChoice({ spokenName: text.trim(), candidates, conflictWith: draft.customer });
  }

  // Item and quantity come from speech; the rate always comes from the master (customer's last rate, else item rate).
  // One recording can name several items; a split is kept only if every piece finds an item.
  async function onProductVoice(text: string) {
    if (detectCommand(text) === "cancel") return setAddingItem(false);
    let pieces = splitItemList(text).filter((p) => p.itemText);
    if (!pieces.length) return NOT_HEARD;
    let found = await Promise.all(pieces.map((p) => searchByVoice<ProductHit>("products", p.itemText)));
    if (pieces.length > 1 && found.some((c) => !c.length)) {
      pieces = [splitItemUtterance(text)];
      found = [await searchByVoice<ProductHit>("products", pieces[0]!.itemText)];
    }
    // Unmatched items land in the "Not in the item list" card, so no problem is returned for them.
    for (const [i, { itemText, qty }] of pieces.entries()) {
      const candidates = found[i]!;
      const pick = confidentPick(candidates);
      if (pick) await addProduct(pick, true, qty);
      else if (candidates.length) setProductChoices((c) => [...c, { id: crypto.randomUUID(), spoken: itemText, candidates, qty }]);
      else setUnmatched((u) => [...u, { spoken: itemText, qty, rate: null }]);
    }
  }

  const removeVoiceItem = (id: string) => setVoiceItems((v) => v.filter((x) => x.id !== id));
  const itemJobs: VoiceJobs = {
    onStart: (id) => setVoiceItems((v) => [...v, { id, heard: null, problem: null }]),
    onHeard: (id, heard) => setVoiceItems((v) => v.map((x) => (x.id === id ? { ...x, heard } : x))),
    onEnd: (id, problem) => {
      if (!problem) return removeVoiceItem(id);
      setVoiceItems((v) => v.map((x) => (x.id === id ? { ...x, problem } : x)));
      setTimeout(() => removeVoiceItem(id), 5000);
    },
  };

  function onLineVoice(key: string) {
    return (text: string) => {
      const command = detectCommand(text);
      if (command === "delete_last" || command === "cancel") return withUndo((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }));
      if (command === "add_item" || command === "next") return setAddingItem(true);
      const parsed = parseLineUtterance(text);
      if (!parsed) return NOT_HEARD;
      withUndo((d) => ({
        ...d,
        lines: d.lines.map((l) =>
          l.key === key
            ? { ...l, qty: parsed.qty === null ? l.qty : String(parsed.qty), rate: parsed.rate === null ? l.rate : String(parsed.rate), confidence: null }
            : l,
        ),
      }));
    };
  }

  function onDateVoice(text: string) {
    const date = parseDateUtterance(text, ctx.today);
    if (!date) return NOT_HEARD;
    typed.current.add("invoiceDate");
    withUndo((d) => ({ ...d, invoiceDate: date }));
  }

  function onDiscountVoice(text: string) {
    const percent = /percent|சதவீத|%|sathaveetham/i.test(text);
    const value = parseAmountUtterance(text.replace(/percent|சதவீதம்|%/gi, " "));
    if (value === null) return NOT_HEARD;
    typed.current.add("discount");
    withUndo((d) => ({ ...d, discount: String(value), discountMode: percent ? "percent" : "amount" }));
  }

  function onPaymentVoice(text: string) {
    const p = parsePaymentUtterance(text);
    if (!p) return NOT_HEARD;
    typed.current.add("payment");
    withUndo((d) => ({ ...d, payment: p.payment, amountReceived: p.amount !== null ? String(p.amount) : d.amountReceived }));
  }

  // ── Free-form voice: one agent run → form patch ─────────────────────────────
  async function onFreeVoice(rec: Recording) {
    setVoiceStatus({ kind: "busy" });
    const res = await postAudio<FreeVoiceResponse>("/api/billing/voice/free", rec, { form: JSON.stringify(draft) });
    if (!("ok" in res) || !res.ok) {
      setVoiceStatus({ kind: "error", message: ("message" in res && res.message) || NOT_HEARD });
      return;
    }
    const result = applyVoicePatch(draftRef.current, res.patch, typed.current);
    withUndo(() => result.draft);
    setCustomerChoice(result.customerChoice);
    setUnmatched((u) => [...u, ...result.unmatched]);
    setExtraDrafts((d) => [...d, ...res.extraDrafts]);
    setVoiceStatus({ kind: "done", transcript: res.transcript, chips: result.chips });
    setTimeout(() => setVoiceStatus((s) => (s?.kind === "done" ? null : s)), 6000);
  }

  async function requestItem(item: ApplyResult["unmatched"][number]) {
    const res = await requestItemAction({ name: item.spoken, qty: item.qty, rate: item.rate, draftId });
    if (res.ok) setRequested((r) => new Set(r).add(item.spoken));
  }

  function trySave() {
    setShowErrors(true);
    const first = validation.blocking[0];
    if (first) {
      document.querySelector(`[data-field="${first.field}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSummaryOpen(true);
  }

  async function discard() {
    if (!confirm("Discard this draft bill? · இந்த draft-ஐ நீக்கவா?")) return;
    clearDeviceCopy(storageKey);
    if (draftId) await discardDraftAction(draftId);
    router.push("/billing");
  }

  const canSave = Boolean(draft.customer && draft.lines.length);
  const statusText = edit
    ? `Editing ${edit.invoiceNo}`
    : { idle: "Draft", saving: "Saving draft…", saved: "Draft saved ✓", device: "Saved on this device" }[autosave];
  const mic = (node: React.ReactNode) => (voiceEnabled ? node : null);

  return (
    <div className="flex min-h-dvh flex-col sm:min-h-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-outline bg-surface py-3 pr-3 pl-2 sm:static">
        <Link href={edit ? `/billing/${edit.invoiceId}` : "/billing"} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
          <BackIcon />
        </Link>
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-lg font-bold">{edit ? "Edit bill · பில் திருத்தம்" : "New bill · புது பில்"}</h1>
          <span className="text-[13px] text-ink-muted" aria-live="polite">
            {statusText} · {formatDate(draft.invoiceDate)}
          </span>
        </div>
        {undoStack.length > 0 && (
          <button type="button" onClick={undo} aria-label="Undo last voice action" className="flex h-11 w-11 items-center justify-center text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
        )}
        {!edit && touched && (
          <button type="button" onClick={discard} className="min-h-9 rounded-full border border-chip-border px-3 text-[13px] font-semibold text-ink-muted">
            Discard
          </button>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-[720px] grow flex-col gap-3 px-4 py-3.5 pb-36">
        {restorable && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-card border-[1.5px] border-voice bg-warning-container px-4 py-3">
            <span className="grow text-sm text-warning-text">
              Unsaved bill on this phone from {new Date(restorable.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button type="button" className="min-h-9 rounded-full bg-primary px-3 text-sm font-bold text-white" onClick={() => { setDraft(restorable.value); setRestorable(null); }}>
              Restore
            </button>
            <button type="button" className="min-h-9 px-2 text-sm text-ink-muted" onClick={() => { clearDeviceCopy(NEW_KEY); setRestorable(null); }}>
              Dismiss
            </button>
          </div>
        )}

        {extraDrafts.length > 0 && (
          <div role="status" className="flex flex-col gap-2 rounded-card border border-primary-outline bg-primary-container px-4 py-3">
            <span className="text-sm font-semibold text-primary-strong">
              {extraDrafts.length} more {extraDrafts.length === 1 ? "draft" : "drafts"} from what you said
            </span>
            <div className="flex flex-wrap gap-2">
              {extraDrafts.map((d) => (
                <Link key={d.id} href={`/billing/new?draft=${d.id}`} className="min-h-9 rounded-full border border-primary bg-surface px-3 py-1.5 text-sm font-semibold text-primary-strong">
                  {d.title || "Draft"} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Customer */}
        <section data-field="customer" className={`rounded-card border bg-surface py-3 pr-3 pl-4 ${isBlocking("customer") ? "border-[1.5px] border-voice" : "border-outline"}`}>
          {draft.customer ? (
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="text-xs text-ink-muted">Customer · வாடிக்கையாளர்</span>
                <span className="text-[17px] font-semibold">
                  {draft.customer.name}
                  {!draft.customer.id && <span className="ml-2 rounded-full bg-primary-container px-2 py-0.5 text-xs font-semibold text-primary-strong">New customer</span>}
                </span>
                {draft.customer.balance > 0 && <span className="text-xs text-warning-text">Balance due {formatINR(draft.customer.balance)}</span>}
                {draft.customer.id && draft.customer.gstin && <span className="text-xs text-ink-muted">GSTIN {draft.customer.gstin}</span>}
              </div>
              {mic(<FieldMic kind="customer" label="customer" onText={onCustomerVoice} />)}
              <button type="button" onClick={() => setCustomer(null)} className="min-h-11 shrink-0 rounded-full border border-primary-outline px-3 text-sm font-semibold text-primary">
                Change
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="grow">
                <SearchPicker<CustomerHit | { id: null; name: string }>
                  label="Customer · வாடிக்கையாளர்"
                  placeholder="Search name or phone"
                  autoFocus={!edit && !voiceEnabled}
                  search={(q, signal) => fetchJson<CustomerHit[]>(`/api/search/customers?q=${encodeURIComponent(q)}`, signal)}
                  render={(c) => ({
                    key: c.id ?? "new",
                    value: c,
                    label: (
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex flex-col">
                          <span className="font-semibold">{c.name}</span>
                          {"phone" in c && c.phone && <span className="text-xs text-ink-muted">{c.phone}</span>}
                        </span>
                        {"balance" in c && c.balance > 0 && <span className="text-xs text-warning-text">{formatINR(c.balance)} due</span>}
                      </span>
                    ),
                  })}
                  extraOptions={(q) => [
                    ...(q ? [{ key: "new", value: { id: null, name: q }, label: <span className="font-semibold text-primary">+ New customer “{q}”</span> }] : []),
                    { key: "cash", value: { id: null, name: "Cash" }, label: <span className="text-ink-muted">Cash sale · ரொக்க விற்பனை</span> },
                  ]}
                  onPick={(c) =>
                    setCustomer(
                      c.id === null
                        ? { id: null, name: c.name, gstin: null, stateCode: null, balance: 0, creditLimit: null }
                        : { id: c.id, name: c.name, gstin: c.gstin, stateCode: c.stateCode, balance: c.balance, creditLimit: c.creditLimit },
                    )
                  }
                />
              </div>
              {mic(<FieldMic kind="customer" label="customer" onText={onCustomerVoice} />)}
            </div>
          )}
          {draft.customer && !draft.customer.id && draft.customer.name.toLowerCase() !== "cash" && (
            <label className="mt-3 flex flex-col gap-1" data-field="gstin">
              <span className="text-xs text-ink-muted">Customer GSTIN (optional)</span>
              <input
                value={draft.customer.gstin ?? ""}
                maxLength={15}
                autoCapitalize="characters"
                onChange={(e) => update({ customer: { ...draft.customer!, gstin: e.target.value.toUpperCase() || null } })}
                className={`min-h-11 rounded-field border px-3 font-semibold tracking-wide uppercase outline-none focus:border-2 focus:border-primary ${issueFor("gstin") ? "border-voice bg-warning-container" : "border-outline"}`}
              />
              {issueFor("gstin") && <span className="text-xs text-warning-text">{issueFor("gstin")!.message}</span>}
            </label>
          )}
          {issueFor("customer") && <p className="mt-2 text-xs text-warning-text">{issueFor("customer")!.message}</p>}
        </section>

        {customerChoice && (
          <VoiceChooser<CustomerOption>
            title={
              customerChoice.conflictWith
                ? `Customer-ஐ மாத்தணுமா? Change from ${customerChoice.conflictWith.name}?`
                : `Which customer? “${customerChoice.spokenName}”`
            }
            options={customerChoice.candidates}
            detail={(c) => (c.balance > 0 ? `${formatINR(c.balance)} due` : null)}
            onPick={(c) => setCustomer(c, true)}
            onDismiss={() => setCustomerChoice(null)}
            extra={
              <>
                {customerChoice.spokenName && (
                  <button
                    type="button"
                    onClick={() => setCustomer({ id: null, name: customerChoice.spokenName, gstin: null, stateCode: null, balance: 0, creditLimit: null }, true)}
                    className="min-h-12 rounded-field border border-dashed border-primary-outline px-3 text-left font-semibold text-primary"
                  >
                    + New customer “{customerChoice.spokenName}”
                  </button>
                )}
                {customerChoice.conflictWith && (
                  <button type="button" onClick={() => setCustomerChoice(null)} className="min-h-12 rounded-field px-3 text-left text-sm text-ink-muted">
                    Keep {customerChoice.conflictWith.name}
                  </button>
                )}
              </>
            }
          />
        )}

        {/* Items */}
        <div className="flex items-baseline justify-between" data-field="lines">
          <h2 className="text-sm font-bold">Items · பொருட்கள் ({draft.lines.length})</h2>
          <span className="text-xs text-ink-muted">{voiceEnabled ? "Type, or tap a mic and speak" : "Tap a field to type"}</span>
        </div>
        {isBlocking("lines") && <p className="text-xs text-warning-text">{issueFor("lines")!.message}</p>}

        {draft.lines.map((l, i) => {
          const t = totals.lines[i];
          const rateIssue = issueFor(`line.${l.key}.rate`);
          const qtyIssue = isBlocking(`line.${l.key}.qty`);
          const lowConfidence = l.confidence !== null && l.confidence !== undefined && l.confidence < LOW_CONFIDENCE;
          const flagged = Boolean(rateIssue || qtyIssue || lowConfidence);
          return (
            <section
              key={l.key}
              data-field={`line.${l.key}.rate`}
              className={`flex flex-col gap-2.5 rounded-card bg-surface py-3 pr-3 pl-4 ${flagged ? "border-[1.5px] border-voice" : "border border-outline"}`}
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 grow flex-col">
                  <span className="text-base font-semibold">{l.name}</span>
                  <span className="text-xs text-ink-muted">
                    {l.nameTa ? `${l.nameTa} · ` : ""}GST {l.gstRate}%
                  </span>
                </div>
                {mic(<FieldMic kind="qty" label={`${l.name} quantity and rate`} onText={onLineVoice(l.key)} />)}
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => update({ lines: draft.lines.filter((x) => x.key !== l.key) })}
                  className="flex h-11 w-9 shrink-0 items-center justify-center text-xl text-ink-muted"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label data-field={`line.${l.key}.qty`} className={`${fieldBox} ${qtyIssue ? "border-[1.5px] border-voice bg-warning-container" : "border-outline"}`}>
                  <span className="text-[11px] text-ink-muted">Qty{l.unit ? ` (${l.unit})` : ""}</span>
                  <input
                    ref={(el) => {
                      if (el) qtyRefs.current.set(l.key, el);
                      else qtyRefs.current.delete(l.key);
                    }}
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => updateLine(l.key, { qty: e.target.value, confidence: null })}
                    className={numberInput}
                  />
                </label>
                <label className={`${fieldBox} ${rateIssue ? "border-[1.5px] border-voice bg-warning-container" : "border-outline"}`}>
                  <span className={`text-[11px] ${rateIssue ? "text-warning-text" : "text-ink-muted"}`}>Rate{rateIssue ? " · check" : ""}</span>
                  <span className="flex items-baseline">
                    <span className="text-[15px] font-semibold">₹</span>
                    <input inputMode="decimal" value={l.rate} onChange={(e) => updateLine(l.key, { rate: e.target.value, confidence: null })} className={numberInput} />
                  </span>
                </label>
                <div className="flex flex-col rounded-field bg-background px-2.5 py-1.5">
                  <span className="text-[11px] text-ink-muted">Amount</span>
                  <span className="text-[15px] font-semibold">{formatINR(t?.gross ?? 0)}</span>
                </div>
              </div>
              {lowConfidence && !rateIssue && <span className="text-xs text-warning-text">Check this — heard by voice · சரிபார்க்கவும்</span>}
              {rateIssue && <span className="text-xs text-warning-text">{rateIssue.message}</span>}
              {issueFor(`line.${l.key}.gst`) && <span className="text-xs text-warning-text">{issueFor(`line.${l.key}.gst`)!.message}</span>}
            </section>
          );
        })}

        {voiceItems.map((v) =>
          v.problem ? (
            <div key={v.id} role="status" className="flex items-center gap-2 rounded-card border-[1.5px] border-voice bg-warning-container py-2 pr-1 pl-4">
              <span className="flex min-w-0 grow flex-col">
                {v.heard && <span className="truncate text-sm">“{v.heard}”</span>}
                <span className="text-xs text-warning-text">{v.problem}</span>
              </span>
              <button type="button" onClick={() => removeVoiceItem(v.id)} aria-label="Dismiss" className="flex h-11 w-11 shrink-0 items-center justify-center text-lg text-ink-muted">
                ×
              </button>
            </div>
          ) : (
            <div key={v.id} role="status" className="flex min-h-[60px] items-center gap-3 rounded-card border border-dashed border-primary-outline bg-surface py-3 pr-3 pl-4">
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className={`truncate text-base ${v.heard ? "font-semibold" : "text-ink-muted"}`}>{v.heard ? `“${v.heard}”` : "Processing… · புரிந்துகொள்கிறது"}</span>
                <span className="text-xs text-ink-muted">{v.heard ? "Adding item… · சேர்க்கிறது" : "Say the next item below meanwhile"}</span>
              </span>
            </div>
          ),
        )}

        {productChoices.map((choice) => {
          const dismiss = () => setProductChoices((c) => c.filter((x) => x.id !== choice.id));
          return (
            <VoiceChooser<ProductHit>
              key={choice.id}
              title={`Which item? “${choice.spoken}”${choice.qty ? ` · qty ${choice.qty}` : ""}`}
              options={choice.candidates}
              detail={(p) => `${p.nameTa ?? ""} · GST ${p.gstRate}%`}
              onPick={(p) => {
                dismiss();
                void addProduct(p, true, choice.qty);
              }}
              onDismiss={dismiss}
            />
          );
        })}

        {unmatched.length > 0 && (
          <div className="flex flex-col gap-2 rounded-card border-[1.5px] border-voice bg-warning-container px-4 py-3">
            <span className="text-sm font-semibold text-warning-text">Not in the item list · item list-ல இல்லை</span>
            {unmatched.map((u) => (
              <div key={u.spoken} className="flex items-center gap-2">
                <span className="grow text-sm">
                  “{u.spoken}”{u.qty ? ` · ${u.qty}` : ""}
                  {u.rate ? ` · ${formatINR(u.rate)}` : ""}
                </span>
                {requested.has(u.spoken) ? (
                  <span className="text-xs font-semibold text-primary-strong">Requested ✓</span>
                ) : (
                  <button type="button" onClick={() => requestItem(u)} className="min-h-9 rounded-full border border-primary bg-surface px-3 text-xs font-semibold text-primary-strong">
                    Request admin to add
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setUnmatched([])} className="self-start text-xs text-ink-muted">
              Dismiss
            </button>
          </div>
        )}

        {addingItem ? (
          <div className="rounded-card border border-outline bg-surface p-3">
            <div className="flex items-end gap-2">
              <div className="grow">
                <SearchPicker<ProductHit>
                  label={draft.lines.length || voiceItems.length ? "Next item · அடுத்த பொருள்" : "Item · பொருள்"}
                  placeholder="Search item, Tamil name or alias"
                  autoFocus={!voiceEnabled}
                  search={(q, signal) => fetchJson<ProductHit[]>(`/api/search/products?q=${encodeURIComponent(q)}`, signal)}
                  render={(p) => ({
                    key: p.id,
                    value: p,
                    label: (
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex flex-col">
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-xs text-ink-muted">
                            {p.nameTa ? `${p.nameTa} · ` : ""}GST {p.gstRate}%{p.unit ? ` · ${p.unit}` : ""}
                          </span>
                        </span>
                        {p.defaultRate !== null && <span className="text-sm text-ink-muted">{formatINR(p.defaultRate)}</span>}
                      </span>
                    ),
                  })}
                  emptyText="Not in the item list — ask your admin to add it · admin-இடம் சேர்க்கச் சொல்லுங்கள்"
                  onPick={(p) => addProduct(p)}
                />
              </div>
              {mic(<FieldMic kind="product" label="item" parallel={itemJobs} onText={onProductVoice} />)}
            </div>
            <button type="button" onClick={() => setAddingItem(false)} className="mt-2 min-h-11 text-sm font-semibold text-ink-muted">
              Close
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingItem(true)}
            className="min-h-11 rounded-xl border-[1.5px] border-dashed border-primary-outline text-sm font-semibold text-primary"
          >
            + Add item · இன்னொரு item
          </button>
        )}

        {/* Options */}
        <section className="flex flex-col gap-3 rounded-card border border-outline bg-surface px-4 py-3">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm">Rates include GST · GST சேர்த்து</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.rateIncludesGst}
              onChange={(e) => update({ rateIncludesGst: e.target.checked }, "rateIncludesGst")}
              className="h-6 w-11 accent-[var(--color-primary)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1" data-field="invoiceDate">
              <span className="flex items-center justify-between text-xs text-ink-muted" id="date-label">
                Date · தேதி
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  aria-labelledby="date-label"
                  value={draft.invoiceDate}
                  max={ctx.today}
                  onChange={(e) => update({ invoiceDate: e.target.value }, "invoiceDate")}
                  className={`min-h-11 w-full min-w-0 rounded-field border px-2 outline-none focus:border-2 focus:border-primary ${issueFor("invoiceDate") ? "border-voice bg-warning-container" : "border-outline"}`}
                />
                {mic(<FieldMic kind="date" label="date" onText={onDateVoice} />)}
              </div>
            </div>
            <div className="flex flex-col gap-1" data-field="discount">
              <span className="text-xs text-ink-muted" id="discount-label">
                Discount · தள்ளுபடி
              </span>
              <div className="flex items-center gap-1">
                <div className={`flex min-h-11 min-w-0 grow items-center rounded-field border ${isBlocking("discount") ? "border-voice bg-warning-container" : "border-outline"}`}>
                  <input
                    aria-labelledby="discount-label"
                    inputMode="decimal"
                    value={draft.discount}
                    onChange={(e) => update({ discount: e.target.value }, "discount")}
                    placeholder="0"
                    className="w-full min-w-0 bg-transparent px-2 font-semibold outline-none"
                  />
                  <button
                    type="button"
                    aria-label={draft.discountMode === "amount" ? "Discount in rupees; switch to percent" : "Discount in percent; switch to rupees"}
                    onClick={() => update({ discountMode: draft.discountMode === "amount" ? "percent" : "amount" }, "discount")}
                    className="flex h-11 w-9 shrink-0 items-center justify-center font-bold text-primary"
                  >
                    {draft.discountMode === "amount" ? "₹" : "%"}
                  </button>
                </div>
                {mic(<FieldMic kind="amount" label="discount" onText={onDiscountVoice} />)}
              </div>
            </div>
          </div>
          {[issueFor("invoiceDate"), isBlocking("discount") ? issueFor("discount") : undefined]
            .filter(Boolean)
            .map((i) => (
              <span key={i!.field} className="text-xs text-warning-text">
                {i!.message}
              </span>
            ))}
        </section>

        {/* Totals */}
        <section className="flex flex-col gap-1.5 rounded-card border border-outline bg-surface px-4 py-3">
          {totals.discount > 0 && <TotalRow label="Discount" value={`−${formatINR(totals.discount, { fixed: true })}`} />}
          <TotalRow label="Taxable" value={formatINR(totals.taxable, { fixed: true })} />
          {totals.interState ? (
            <TotalRow label="IGST" value={formatINR(totals.igst, { fixed: true })} />
          ) : (
            <TotalRow label="CGST + SGST" value={formatINR(totals.cgst + totals.sgst, { fixed: true })} />
          )}
          {totals.roundOff !== 0 && <TotalRow label="Round off" value={formatINR(totals.roundOff, { fixed: true })} />}
          <div className="flex items-baseline justify-between border-t border-outline pt-1.5">
            <span className="text-[15px] font-bold">Total · மொத்தம்</span>
            <span className="text-[22px] font-bold">{formatINR(totals.total)}</span>
          </div>
        </section>

        {/* Payment */}
        <div className="flex flex-col gap-2" data-field="amountReceived">
          <div className="flex items-center gap-2">
            <div className="grow">
              <ChoicePills<PaymentStatus>
                label="Payment"
                value={draft.payment}
                onChange={(payment) => update({ payment }, "payment")}
                options={[
                  { value: "paid", label: "Cash" },
                  { value: "credit", label: "Credit" },
                  { value: "partial", label: "Partial" },
                ]}
              />
            </div>
            {mic(<FieldMic kind="payment" label="payment" onText={onPaymentVoice} />)}
          </div>
          {draft.payment === "partial" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Amount paid now · இப்போ கொடுத்தது</span>
              <input
                inputMode="decimal"
                value={draft.amountReceived}
                onChange={(e) => update({ amountReceived: e.target.value }, "amountReceived")}
                className={`min-h-11 rounded-field border bg-surface px-3 font-semibold outline-none focus:border-2 focus:border-primary ${isBlocking("amountReceived") ? "border-voice bg-warning-container" : "border-outline"}`}
              />
              {isBlocking("amountReceived") && <span className="text-xs text-warning-text">{issueFor("amountReceived")!.message}</span>}
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Notes (printed on the bill)</span>
          <textarea
            value={draft.notes}
            rows={2}
            maxLength={1000}
            onChange={(e) => update({ notes: e.target.value }, "notes")}
            className="rounded-field border border-outline bg-surface px-3 py-2 outline-none focus:border-2 focus:border-primary"
          />
        </label>
      </div>

      {voiceStatus && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-32 z-20 mx-auto flex max-w-[560px] flex-col gap-2 rounded-card border border-outline bg-surface px-4 py-3 shadow-lg"
        >
          {voiceStatus.kind === "busy" && (
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-voice border-t-transparent" aria-hidden="true" />
              Understanding… · புரிந்துகொள்கிறது
            </span>
          )}
          {voiceStatus.kind === "error" && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-warning-text">{voiceStatus.message}</span>
              <button type="button" onClick={() => setVoiceStatus(null)} aria-label="Close" className="h-9 w-9 text-lg text-ink-muted">
                ×
              </button>
            </div>
          )}
          {voiceStatus.kind === "done" && (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-field bg-warning-container px-2 py-1 text-[13px]">“{voiceStatus.transcript}”</span>
                <button type="button" onClick={() => setVoiceStatus(null)} aria-label="Close" className="h-9 w-9 shrink-0 text-lg text-ink-muted">
                  ×
                </button>
              </div>
              {voiceStatus.chips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {voiceStatus.chips.map((c, i) => (
                    <span key={i} className="rounded-full bg-primary-container px-2.5 py-1 text-xs font-semibold text-primary-strong">
                      ✓ {c}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-ink-muted">Nothing new to fill.</span>
              )}
            </>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline bg-surface px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:sticky sm:pb-3">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <button
            type="button"
            onClick={trySave}
            disabled={!canSave}
            className="min-h-[52px] grow rounded-card bg-primary text-base font-bold text-white disabled:opacity-50"
          >
            {edit ? "Save changes · சேமி" : "Save · சேமி"}
          </button>
          {voiceEnabled && <HoldToSpeak label="Hold to speak the whole bill" caption="Hold to speak" onRecorded={onFreeVoice} />}
        </div>
      </div>

      <SaveSummary
        businessName={businessName}
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        draft={draft}
        totals={totals}
        warnings={validation.warnings}
        draftId={draftId}
        edit={edit}
        onSaved={() => {
          setSaved(true);
          clearDeviceCopy(storageKey);
          clearDeviceCopy(NEW_KEY);
        }}
      />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px] text-ink-muted">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
