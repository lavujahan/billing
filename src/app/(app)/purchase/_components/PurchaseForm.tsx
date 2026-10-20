"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductHit } from "@/app/api/search/products/route";
import type { VendorHit } from "@/app/api/search/vendors/route";
import { prepareFile, type PreparedFile } from "@/components/capture/prepareImage";
import { BackIcon } from "@/components/icons";
import { ChoicePills } from "@/components/form/ChoicePills";
import { inputClass } from "@/components/form/Field";
import { fetchJson, SearchPicker } from "@/components/form/SearchPicker";
import { Sheet } from "@/components/form/Sheet";
import { clearDeviceCopy, useAutosave } from "@/components/form/useAutosave";
import { FieldMic } from "@/components/voice/FieldMic";
import { HoldToSpeak } from "@/components/voice/HoldToSpeak";
import { postAudio, type Recording } from "@/components/voice/useRecorder";
import { formatINR } from "@/lib/money";
import { applyPurchasePatch, type PurchasePatch, type PurchaseTypedField, type ReadResponse } from "@/lib/purchase/patch";
import { computePurchaseTotals } from "@/lib/purchase/totals";
import type { BillPage, PaymentMode, PurchaseContext, PurchaseDraft, PurchaseLine, PurchaseVendor } from "@/lib/purchase/types";
import { validatePurchase } from "@/lib/purchase/validate";
import { nameSearchTerms, parseAmountUtterance, parseDateUtterance, parsePaymentUtterance } from "@/lib/voice/parse";
import { mergeByBestScore } from "@/lib/voice/pick";
import { addVendorFromFormAction, discardPurchaseDraftAction, savePurchaseDraftAction } from "../actions";
import { BillPages, ComparePanel, type PageView } from "./BillPages";
import { PurchaseSummary } from "./PurchaseSummary";

type Props = {
  ctx: PurchaseContext;
  initial: PurchaseDraft;
  initialUrls: Record<string, string>;
  draftId: string | null;
  aiEnabled: boolean;
  isAdmin: boolean;
  edit?: { purchaseId: string; label: string; updatedAt: string };
};

type UploadResponse = { pages?: BillPage[]; urls?: Record<string, string>; duplicate?: { id: string; billNumber: string | null; vendorName: string } | null; message?: string };

const NOT_HEARD = "புரியல, மறுபடியும் சொல்லுங்க · Didn't catch that";
const LOW = 0.8;
const boxLabel = "text-[11px] text-ink-muted";
const box = "flex flex-col rounded-field border px-2.5 py-1.5";
const boxInput = "w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none";

export function PurchaseForm({ ctx, initial, initialUrls, draftId: initialDraftId, aiEnabled, isAdmin, edit }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "warn" | "info"; text: string; dupId?: string } | null>(null);
  const [qualityPrompt, setQualityPrompt] = useState<PreparedFile[] | null>(null);
  const [pagePrompt, setPagePrompt] = useState<PreparedFile[] | null>(null);
  const [vendorChoice, setVendorChoice] = useState<PurchasePatch["vendor"] | null>(null);
  const [addVendor, setAddVendor] = useState<{ name: string; gstin: string; phone: string; message?: string } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<PurchaseDraft[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const typed = useRef(new Set<PurchaseTypedField>());

  const [vendorAvg, setVendorAvg] = useState<{ id: string; average: number | null } | null>(null);
  const totals = useMemo(() => computePurchaseTotals(draft, ctx.businessStateCode), [draft, ctx.businessStateCode]);
  const vendorAverage = vendorAvg && vendorAvg.id === draft.vendor?.id ? vendorAvg.average : null;
  const validation = useMemo(() => validatePurchase(draft, totals, { ...ctx, vendorAverage }), [draft, totals, ctx, vendorAverage]);

  useEffect(() => {
    const id = draft.vendor?.id;
    if (!id || vendorAvg?.id === id) return;
    let live = true;
    fetchJson<{ average: number | null }>(`/api/purchase/vendor-average?vendor=${id}`)
      .then((r) => live && setVendorAvg({ id, average: r.average }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft.vendor?.id, vendorAvg?.id]);
  const pages: PageView[] = draft.pages.map((p) => ({ ...p, url: urls[p.path] ?? null }));
  const touched = Boolean(draft.vendor || draft.lines.length || draft.pages.length || draft.manual.total);
  const storageKey = draftId ? `purchase-draft:${draftId}` : "purchase-draft:new";

  const autosave = useAutosave({
    value: draft,
    enabled: !edit && !saved && touched,
    storageKey,
    save: useCallback(
      async (value: PurchaseDraft) => {
        const res = await savePurchaseDraftAction({ id: draftId, draft: value, title: value.vendor?.name ?? "", amount: totals.total });
        if (!res.ok) return false;
        if (res.id !== draftId) {
          clearDeviceCopy("purchase-draft:new");
          setDraftId(res.id);
          window.history.replaceState(null, "", `/purchase/new?draft=${res.id}`);
        }
        return true;
      },
      [draftId, totals.total],
    ),
  });

  const update = (patch: Partial<PurchaseDraft>, field?: PurchaseTypedField) => {
    if (field) typed.current.add(field);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const updateLine = (key: string, patch: Partial<PurchaseLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch, confidence: null } : l)) }));
  const undo = () => {
    const prev = undoStack.at(-1);
    if (!prev) return;
    setUndoStack((s) => s.slice(0, -1));
    setDraft(prev);
  };

  const issue = (field: string) =>
    (showErrors ? validation.blocking.find((i) => i.field === field) : undefined) ?? validation.warnings.find((i) => i.field === field);
  const blocked = (field: string) => showErrors && validation.blocking.some((i) => i.field === field);
  const lowConf = (f: keyof PurchaseDraft["fieldConfidence"]) => (draft.fieldConfidence[f] ?? 1) < LOW;

  // ── Bill pages: check → upload → read ────────────────────────────────────────
  async function onFiles(files: File[]) {
    setNotice(null);
    let prepared: PreparedFile[];
    try {
      prepared = await Promise.all(files.map(prepareFile));
    } catch (e) {
      setNotice({
        tone: "warn",
        text: e instanceof Error && e.message === "heic" ? "This photo format (HEIC) can't be read here — use the Photo button instead." : "Couldn't open that file.",
      });
      return;
    }
    if (prepared.some((p) => p.issues.length)) return setQualityPrompt(prepared);
    proceed(prepared);
  }

  function proceed(prepared: PreparedFile[]) {
    setQualityPrompt(null);
    if (draft.pages.length && !edit) return setPagePrompt(prepared);
    void upload(prepared, "add");
  }

  async function upload(prepared: PreparedFile[], mode: "add" | "replace") {
    setPagePrompt(null);
    setBusy("Uploading… · ஏற்றுகிறது");
    const body = new FormData();
    prepared.forEach((p) => body.append("files", p.file));
    const res: UploadResponse = await fetch("/api/purchase/documents", { method: "POST", body })
      .then((r) => r.json())
      .catch(() => ({ message: "Upload failed — check the connection." }));
    if (!res.pages) {
      setBusy(null);
      return setNotice({ tone: "warn", text: res.message ?? "Upload failed." });
    }
    setUrls((u) => ({ ...u, ...res.urls }));
    const allPages = mode === "replace" ? res.pages : [...draft.pages, ...res.pages];
    const source = allPages.some((p) => p.mime === "application/pdf") ? "pdf" : "image";
    const next: PurchaseDraft = { ...draft, pages: allPages, source };
    setDraft(next);
    if (res.duplicate) {
      setNotice({ tone: "warn", text: `This file was already saved: ${res.duplicate.vendorName} ${res.duplicate.billNumber ?? ""}`.trim(), dupId: res.duplicate.id });
    }
    if (!aiEnabled) {
      setBusy(null);
      return setNotice((n) => n ?? { tone: "info", text: "Bill attached. Type the details below (bill reading needs the AI key)." });
    }

    setBusy("Reading bill… · பில் படிக்கிறது");
    const read: ReadResponse = await fetch("/api/purchase/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pages: allPages.map(({ path, mime, name }) => ({ path, mime, name })) }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "network", message: "Network problem — type the bill or try again." }));
    setBusy(null);
    if (!read.ok) return setNotice({ tone: "warn", text: read.message });
    applyRead(next, read.patch);
  }

  function applyRead(base: PurchaseDraft, patch: PurchasePatch) {
    if (patch.documentKind === "not_a_bill") {
      setNotice({ tone: "warn", text: "இது bill மாதிரி தெரியல · This doesn't look like a bill. Nothing was filled." });
      return base;
    }
    const result = applyPurchasePatch(base, patch, typed.current);
    setUndoStack((s) => [...s.slice(-19), base]);
    setDraft(result.draft);
    setVendorChoice(result.vendorChoice);
    if (result.vendorChoice && !result.vendorChoice.candidates.length) {
      setAddVendor({ name: result.vendorChoice.readName, gstin: result.vendorChoice.gstin ?? "", phone: "" });
    }
    const notes: string[] = [];
    if (patch.billCount > 1) notes.push("Two bills in one photo — only the first was read. Photograph the other separately.");
    if (patch.documentKind === "credit_note") notes.push("This is a credit note — check before saving it as a purchase.");
    if (patch.documentKind === "estimate") notes.push("This looks like an estimate/quotation, not a bill.");
    if (patch.handwritten) notes.push("Handwritten bill — check every figure against the photo.");
    if (result.linesKept) notes.push("You had typed items, so the bill's items were not added. Clear yours to use the bill's.");
    if (notes.length) setNotice({ tone: "warn", text: notes.join(" ") });
    if (patch.handwritten || Object.values(result.draft.fieldConfidence).some((c) => (c ?? 1) < LOW)) setCompare(0);
    return result.draft;
  }

  // ── Vendor ────────────────────────────────────────────────────────────────────
  function setVendor(v: PurchaseVendor | null) {
    typed.current.add("vendor");
    setDraft((d) => ({ ...d, vendor: v, fieldConfidence: { ...d.fieldConfidence, vendor: undefined } }));
    setVendorChoice(null);
  }

  async function onVendorVoice(text: string) {
    const lists = await Promise.all(
      nameSearchTerms(text).map((q) => fetchJson<VendorHit[]>(`/api/search/vendors?q=${encodeURIComponent(q)}`).catch(() => [] as VendorHit[])),
    );
    const candidates = mergeByBestScore(lists);
    const [top, second] = candidates;
    if (top && top.score >= 0.75 && (!second || top.score - second.score >= 0.15)) return setVendor(top);
    setVendorChoice({ pick: null, candidates, readName: text.trim(), gstin: null });
  }

  async function submitNewVendor() {
    if (!addVendor) return;
    const res = await addVendorFromFormAction({ name: addVendor.name, gstin: addVendor.gstin || null, phone: addVendor.phone || null, draftId });
    if (!res.ok) return setAddVendor({ ...addVendor, message: res.message });
    if ("vendor" in res && res.vendor) {
      setVendor(res.vendor);
      setAddVendor(null);
    } else {
      setAddVendor(null);
      setNotice({ tone: "info", text: `Asked the admin to add “${addVendor.name}”. This purchase is saved as a draft and can be finished once it's added.` });
    }
  }

  // ── Voice for the whole purchase ──────────────────────────────────────────────
  async function onFreeVoice(rec: Recording) {
    setBusy("Understanding… · புரிந்துகொள்கிறது");
    const res = await postAudio<ReadResponse>("/api/purchase/voice/free", rec, {});
    setBusy(null);
    if (!("ok" in res) || !res.ok) return setNotice({ tone: "warn", text: ("message" in res && res.message) || NOT_HEARD });
    applyRead({ ...draft, source: draft.pages.length ? draft.source : "voice" }, res.patch);
    if (res.transcript) setNotice((n) => n ?? { tone: "info", text: `Heard: “${res.transcript}”` });
  }

  function trySave() {
    setShowErrors(true);
    const first = validation.blocking[0];
    if (first) {
      document.querySelector(`[data-field="${first.field.startsWith("line.") ? "lines" : first.field}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSummaryOpen(true);
  }

  async function discard() {
    if (!confirm("Discard this draft purchase? · இந்த draft-ஐ நீக்கவா?")) return;
    clearDeviceCopy(storageKey);
    if (draftId) await discardPurchaseDraftAction(draftId);
    router.push("/purchase");
  }

  const statusText = edit
    ? `Editing ${edit.label}`
    : { idle: "Draft", saving: "Saving draft…", saved: "Draft saved ✓", device: "Saved on this device" }[autosave];
  const slabOptions = (current: string) => [...new Set([...ctx.gstSlabs.map(String), ...(current ? [current] : [])])];
  const mic = (node: React.ReactNode) => (aiEnabled ? node : null);
  const totalIssue = issue("total");

  return (
    <div className="flex min-h-dvh flex-col sm:min-h-0">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-outline bg-surface py-3 pr-3 pl-2 sm:static">
        <Link href={edit ? `/purchase/${edit.purchaseId}` : "/purchase"} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
          <BackIcon />
        </Link>
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-lg font-bold">{edit ? "Edit purchase · திருத்தம்" : "New purchase · புது கொள்முதல்"}</h1>
          <span className="text-[13px] text-ink-muted" aria-live="polite">
            {statusText}
          </span>
        </div>
        {undoStack.length > 0 && (
          <button type="button" onClick={undo} aria-label="Undo last read or voice action" className="flex h-11 w-11 items-center justify-center text-ink">
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
        {compare !== null && <ComparePanel pages={pages} index={compare} onIndex={setCompare} onClose={() => setCompare(null)} />}

        <BillPages
          pages={pages}
          busy={busy}
          onFiles={onFiles}
          onRemove={(path) => update({ pages: draft.pages.filter((p) => p.path !== path) })}
          onCompare={(i) => setCompare((c) => (c === null ? i : null))}
          compareOpen={compare !== null}
        />

        {notice && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-card px-4 py-3 text-sm ${
              notice.tone === "warn" ? "border-[1.5px] border-voice bg-warning-container text-warning-text" : "border border-primary-outline bg-primary-container text-primary-strong"
            }`}
          >
            <span className="grow">
              {notice.text}
              {notice.dupId && (
                <>
                  {" "}
                  <Link href={`/purchase/${notice.dupId}`} className="font-semibold underline">
                    Open it
                  </Link>
                </>
              )}
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="h-7 w-7 shrink-0 text-lg leading-none">
              ×
            </button>
          </div>
        )}

        {/* Vendor */}
        <section
          data-field="vendor"
          className={`flex flex-col gap-2 rounded-card bg-surface py-3 pr-3 pl-4 ${blocked("vendor") || lowConf("vendor") ? "border-[1.5px] border-voice" : "border border-outline"}`}
        >
          {draft.vendor ? (
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="text-xs text-ink-muted">Vendor · விற்பனையாளர்</span>
                <span className="text-[17px] font-semibold">{draft.vendor.name}</span>
                <span className="text-xs text-ink-muted">
                  {draft.vendor.gstin ? `GSTIN ${draft.vendor.gstin}` : "No GSTIN"}
                  {draft.vendor.balance > 0 ? <span className="text-warning-text"> · you owe {formatINR(draft.vendor.balance)}</span> : null}
                </span>
              </div>
              {mic(<FieldMic kind="vendor" module="purchase" label="vendor" onText={onVendorVoice} />)}
              <button type="button" onClick={() => setVendor(null)} className="min-h-11 shrink-0 rounded-full border border-primary-outline px-3 text-sm font-semibold text-primary">
                Change
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="grow">
                <SearchPicker<VendorHit | { id: null; name: string }>
                  label="Vendor · விற்பனையாளர்"
                  placeholder="Search name, phone or GSTIN"
                  search={(q, signal) => fetchJson<VendorHit[]>(`/api/search/vendors?q=${encodeURIComponent(q)}`, signal)}
                  render={(v) => ({
                    key: v.id ?? "new",
                    value: v,
                    label:
                      v.id === null ? (
                        <span className="font-semibold text-primary">+ {isAdmin ? "Add vendor" : "Request admin to add"} “{v.name}”</span>
                      ) : (
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="flex flex-col">
                            <span className="font-semibold">{v.name}</span>
                            {"gstin" in v && v.gstin && <span className="text-xs text-ink-muted">{v.gstin}</span>}
                          </span>
                          {"balance" in v && v.balance > 0 && <span className="text-xs text-warning-text">owe {formatINR(v.balance)}</span>}
                        </span>
                      ),
                  })}
                  extraOptions={(q) => (q ? [{ key: "new", value: { id: null, name: q }, label: <span className="font-semibold text-primary">+ {isAdmin ? "Add vendor" : "Request admin to add"} “{q}”</span> }] : [])}
                  onPick={(v) => (v.id === null ? setAddVendor({ name: v.name, gstin: draft.billGstin ?? "", phone: "" }) : setVendor(v))}
                />
              </div>
              {mic(<FieldMic kind="vendor" module="purchase" label="vendor" onText={onVendorVoice} />)}
            </div>
          )}
          {draft.billGstin && (!draft.vendor || draft.vendor.gstin !== draft.billGstin) && <span className="text-xs text-ink-muted">GSTIN on the bill: {draft.billGstin}</span>}
          {issue("vendor") && <span className="text-xs text-warning-text">{issue("vendor")!.message}</span>}
        </section>

        {vendorChoice && (vendorChoice.candidates.length > 0 || vendorChoice.readName) && (
          <div className="flex flex-col gap-1.5 rounded-card border-2 border-primary bg-surface p-3" role="group" aria-label="Choose vendor">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Which vendor? “{vendorChoice.readName}”</span>
              <button type="button" aria-label="Close" onClick={() => setVendorChoice(null)} className="h-9 w-9 text-lg text-ink-muted">
                ×
              </button>
            </div>
            {vendorChoice.candidates.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVendor(v)}
                className={`flex min-h-12 items-center justify-between rounded-field px-3 text-left ${i === 0 ? "border-[1.5px] border-primary bg-primary-container" : "border border-outline"}`}
              >
                <span className="font-semibold">{v.name}</span>
                <span className="text-xs text-ink-muted">{v.gstin ?? ""}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddVendor({ name: vendorChoice.readName, gstin: vendorChoice.gstin ?? "", phone: "" })}
              className="min-h-12 rounded-field border border-dashed border-primary-outline px-3 text-left font-semibold text-primary"
            >
              + {isAdmin ? "Add as new vendor" : "Request admin to add"} “{vendorChoice.readName}”
            </button>
          </div>
        )}

        {/* Bill no + date */}
        <section className="grid grid-cols-2 gap-3 rounded-card border border-outline bg-surface px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Bill no · பில் எண்</span>
            <input
              value={draft.billNumber}
              maxLength={40}
              onChange={(e) => update({ billNumber: e.target.value, fieldConfidence: { ...draft.fieldConfidence, billNumber: undefined } }, "billNumber")}
              className={`${inputClass} ${lowConf("billNumber") ? "border-voice bg-warning-container" : ""}`}
            />
          </label>
          <div className="flex flex-col gap-1" data-field="billDate">
            <span className="text-xs text-ink-muted" id="bill-date">
              Bill date · தேதி
            </span>
            <div className="flex items-center gap-1">
              <input
                type="date"
                aria-labelledby="bill-date"
                value={draft.billDate}
                max={ctx.today}
                onChange={(e) => update({ billDate: e.target.value, fieldConfidence: { ...draft.fieldConfidence, billDate: undefined } }, "billDate")}
                className={`${inputClass} min-w-0 px-2 ${lowConf("billDate") || issue("billDate") ? "border-voice bg-warning-container" : ""}`}
              />
              {mic(
                <FieldMic
                  kind="date"
                  module="purchase"
                  label="bill date"
                  onText={(t) => {
                    const d = parseDateUtterance(t, ctx.today);
                    if (!d) return NOT_HEARD;
                    update({ billDate: d }, "billDate");
                  }}
                />,
              )}
            </div>
          </div>
          {issue("billDate") && <span className="col-span-2 text-xs text-warning-text">{issue("billDate")!.message}</span>}
        </section>

        {/* Items or total only */}
        <ChoicePills<"items" | "total">
          label="How to enter"
          value={draft.itemsMode}
          onChange={(itemsMode) => update({ itemsMode })}
          options={[
            { value: "items", label: "Items · பொருட்கள்" },
            { value: "total", label: "Total only · மொத்தம் மட்டும்" },
          ]}
        />

        {draft.itemsMode === "items" ? (
          <div className="flex flex-col gap-3" data-field="lines">
            {blocked("lines") && <p className="text-xs text-warning-text">{issue("lines")!.message}</p>}
            {draft.lines.map((l, i) => {
              const t = totals.lines[i];
              const low = l.confidence !== null && l.confidence !== undefined && l.confidence < LOW;
              const mismatch = l.printedAmount !== null && t && Math.abs((draft.ratesIncludeGst ? t.amount : t.gross) - l.printedAmount) > 1;
              return (
                <section key={l.key} className={`flex flex-col gap-2 rounded-card bg-surface py-3 pr-3 pl-4 ${low || mismatch ? "border-[1.5px] border-voice" : "border border-outline"}`}>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`Item ${i + 1} name`}
                      value={l.name}
                      placeholder="Item as on the bill"
                      onChange={(e) => updateLine(l.key, { name: e.target.value })}
                      className="min-w-0 grow bg-transparent text-base font-semibold outline-none"
                    />
                    <button type="button" aria-label={`Remove ${l.name || "item"}`} onClick={() => update({ lines: draft.lines.filter((x) => x.key !== l.key) })} className="flex h-11 w-9 shrink-0 items-center justify-center text-xl text-ink-muted">
                      ×
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {l.productId ? (
                      <span className="rounded-full bg-primary-container px-2 py-0.5 font-semibold text-primary-strong">In item list ✓</span>
                    ) : (
                      <span className="rounded-full bg-warning-container px-2 py-0.5 font-semibold text-warning-text">Not in item list</span>
                    )}
                    <button type="button" onClick={() => setLinking(linking === l.key ? null : l.key)} className="min-h-8 font-semibold text-primary">
                      {l.productId ? "Change link" : "Link to item"}
                    </button>
                    {l.hsn && <span className="text-ink-muted">HSN {l.hsn}</span>}
                  </div>
                  {linking === l.key && (
                    <SearchPicker<ProductHit>
                      label="Link to an item in your list"
                      autoFocus
                      search={(q, signal) => fetchJson<ProductHit[]>(`/api/search/products?q=${encodeURIComponent(q || l.name)}`, signal)}
                      render={(p) => ({ key: p.id, value: p, label: <span className="font-semibold">{p.name}</span> })}
                      onPick={(p) => {
                        updateLine(l.key, { productId: p.id, gstRate: l.gstRate || String(p.gstRate), unit: l.unit ?? p.unit, hsn: l.hsn ?? p.hsn });
                        setLinking(null);
                      }}
                    />
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <label className={`${box} border-outline`}>
                      <span className={boxLabel}>Qty{l.unit ? ` (${l.unit})` : ""}</span>
                      <input inputMode="decimal" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} className={boxInput} />
                    </label>
                    <label className={`${box} border-outline`}>
                      <span className={boxLabel}>Rate</span>
                      <input inputMode="decimal" value={l.rate} onChange={(e) => updateLine(l.key, { rate: e.target.value })} className={boxInput} />
                    </label>
                    <label className={`${box} border-outline`}>
                      <span className={boxLabel}>GST %</span>
                      <select value={l.gstRate} onChange={(e) => updateLine(l.key, { gstRate: e.target.value })} className={`${boxInput} appearance-none`}>
                        <option value="">—</option>
                        {slabOptions(l.gstRate).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-col rounded-field bg-background px-2.5 py-1.5">
                      <span className={boxLabel}>Amount</span>
                      <span className="text-[15px] font-semibold">{formatINR(t?.gross ?? 0)}</span>
                    </div>
                  </div>
                  {mismatch && <span className="text-xs text-warning-text">Bill shows {formatINR(l.printedAmount!)} for this line — check qty and rate.</span>}
                  {low && !mismatch && <span className="text-xs text-warning-text">Check this row against the bill · சரிபார்க்கவும்</span>}
                </section>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  lines: [...d.lines, { key: crypto.randomUUID(), productId: null, name: "", hsn: null, qty: "1", unit: null, rate: "", gstRate: "", printedAmount: null }],
                }))
              }
              className="min-h-11 rounded-xl border-[1.5px] border-dashed border-primary-outline text-sm font-semibold text-primary"
            >
              + Add row
            </button>

            <section className="flex flex-col gap-3 rounded-card border border-outline bg-surface px-4 py-3">
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm">Rates include GST · GST சேர்த்து</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.ratesIncludeGst}
                  onChange={(e) => update({ ratesIncludeGst: e.target.checked }, "ratesIncludeGst")}
                  className="h-6 w-11 accent-[var(--color-primary)]"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">Discount (₹)</span>
                <input inputMode="decimal" value={draft.discount} placeholder="0" onChange={(e) => update({ discount: e.target.value }, "discount")} className={`${inputClass} w-32 text-right`} />
              </label>
            </section>
          </div>
        ) : (
          <section data-field="total" className="grid grid-cols-2 gap-3 rounded-card border border-outline bg-surface px-4 py-3">
            {(
              [
                ["taxable", "Taxable value"],
                ["cgst", "CGST"],
                ["sgst", "SGST"],
                ["igst", "IGST"],
                ["roundOff", "Round off"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{label}</span>
                <input inputMode="decimal" value={draft.manual[k]} onChange={(e) => update({ manual: { ...draft.manual, [k]: e.target.value } }, "manual")} className={inputClass} />
              </label>
            ))}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink" id="total-label">
                Total · மொத்தம் *
              </span>
              <div className="flex items-center gap-1">
                <input
                  aria-labelledby="total-label"
                  inputMode="decimal"
                  value={draft.manual.total}
                  onChange={(e) => update({ manual: { ...draft.manual, total: e.target.value }, fieldConfidence: { ...draft.fieldConfidence, total: undefined } }, "manual")}
                  className={`${inputClass} font-bold ${blocked("total") || lowConf("total") ? "border-voice bg-warning-container" : ""}`}
                />
                {mic(
                  <FieldMic
                    kind="amount"
                    module="purchase"
                    label="bill total"
                    onText={(t) => {
                      const n = parseAmountUtterance(t);
                      if (n === null) return NOT_HEARD;
                      update({ manual: { ...draft.manual, total: String(n) } }, "manual");
                    }}
                  />,
                )}
              </div>
            </div>
          </section>
        )}

        {/* Totals */}
        <section data-field={draft.itemsMode === "items" ? "total" : undefined} className="flex flex-col gap-1.5 rounded-card border border-outline bg-surface px-4 py-3 text-[13px] text-ink-muted">
          {totals.discount > 0 && <Row label="Discount" value={`−${formatINR(totals.discount, { fixed: true })}`} />}
          <Row label="Taxable" value={formatINR(totals.taxable, { fixed: true })} />
          {totals.igst > 0 || totals.interState ? (
            <Row label="IGST" value={formatINR(totals.igst, { fixed: true })} />
          ) : (
            <Row label="CGST + SGST" value={formatINR(totals.cgst + totals.sgst, { fixed: true })} />
          )}
          {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff, { fixed: true })} />}
          <div className="flex items-baseline justify-between border-t border-outline pt-1.5 text-ink">
            <span className="text-[15px] font-bold">Total · மொத்தம்</span>
            <span className="text-[22px] font-bold">{formatINR(totals.total)}</span>
          </div>
          {draft.printedTotal !== null && draft.itemsMode === "items" && <Row label="Bill says" value={formatINR(draft.printedTotal)} />}
          {totalIssue && <span className="text-xs text-warning-text">{totalIssue.message}</span>}
        </section>

        {/* Payment */}
        <div className="flex flex-col gap-2" data-field="amountPaid">
          <div className="flex items-center gap-2">
            <div className="grow">
              <ChoicePills<PurchaseDraft["payment"]>
                label="Payment"
                value={draft.payment}
                onChange={(payment) => update({ payment }, "payment")}
                options={[
                  { value: "credit", label: "Credit" },
                  { value: "paid", label: "Paid" },
                  { value: "partial", label: "Partial" },
                ]}
              />
            </div>
            {mic(
              <FieldMic
                kind="payment"
                module="purchase"
                label="payment"
                onText={(t) => {
                  const p = parsePaymentUtterance(t);
                  if (!p) return NOT_HEARD;
                  update({ payment: p.payment, amountPaid: p.amount !== null ? String(p.amount) : draft.amountPaid }, "payment");
                }}
              />,
            )}
          </div>
          {draft.payment !== "credit" && (
            <ChoicePills<PaymentMode>
              label="Paid by"
              value={draft.paymentMode ?? "cash"}
              onChange={(paymentMode) => update({ paymentMode }, "paymentMode")}
              options={[
                { value: "cash", label: "Cash" },
                { value: "upi", label: "UPI" },
                { value: "bank", label: "Bank" },
                { value: "cheque", label: "Cheque" },
              ]}
            />
          )}
          {draft.payment === "partial" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Amount paid now · இப்போ கொடுத்தது</span>
              <input
                inputMode="decimal"
                value={draft.amountPaid}
                onChange={(e) => update({ amountPaid: e.target.value }, "amountPaid")}
                className={`${inputClass} ${blocked("amountPaid") ? "border-voice bg-warning-container" : ""}`}
              />
              {blocked("amountPaid") && <span className="text-xs text-warning-text">{issue("amountPaid")!.message}</span>}
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Notes</span>
          <textarea value={draft.notes} rows={2} maxLength={1000} onChange={(e) => update({ notes: e.target.value })} className={`${inputClass} py-2`} />
        </label>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline bg-surface px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:sticky sm:pb-3">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <button type="button" onClick={trySave} disabled={!!busy} className="min-h-[52px] grow rounded-card bg-primary text-base font-bold text-white disabled:opacity-50">
            {edit ? "Save changes · சேமி" : "Save · சேமி"}
          </button>
          {aiEnabled && <HoldToSpeak label="Hold to speak the purchase" caption="Hold to speak" onRecorded={onFreeVoice} />}
        </div>
      </div>

      <Sheet open={!!qualityPrompt} onClose={() => setQualityPrompt(null)} title="Photo தெளிவா இல்ல · Photo isn't clear">
        <p className="text-sm text-ink-muted">
          {qualityPrompt?.some((p) => p.issues.includes("dark")) ? "It looks too dark. " : ""}
          {qualityPrompt?.some((p) => p.issues.includes("blurry")) ? "It looks blurry. " : ""}A clearer photo reads much better — hold steady, in good light, with the whole bill in view.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setQualityPrompt(null)} className="min-h-[52px] rounded-card bg-primary font-bold text-white">
            Retake · மறுபடி
          </button>
          <button type="button" onClick={() => qualityPrompt && proceed(qualityPrompt)} className="min-h-[52px] rounded-card border border-primary-outline font-bold text-primary-strong">
            Use anyway
          </button>
        </div>
      </Sheet>

      <Sheet open={!!pagePrompt} onClose={() => setPagePrompt(null)} title="Add to this bill?">
        <p className="text-sm text-ink-muted">This purchase already has a bill attached.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => pagePrompt && upload(pagePrompt, "add")} className="min-h-[52px] rounded-card bg-primary font-bold text-white">
            Add as pages
          </button>
          <button type="button" onClick={() => pagePrompt && upload(pagePrompt, "replace")} className="min-h-[52px] rounded-card border border-primary-outline font-bold text-primary-strong">
            Replace bill
          </button>
        </div>
      </Sheet>

      <Sheet open={!!addVendor} onClose={() => setAddVendor(null)} title={isAdmin ? "Add vendor · புது விற்பனையாளர்" : "Request admin to add vendor"}>
        {addVendor && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitNewVendor();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Name</span>
              <input required value={addVendor.name} onChange={(e) => setAddVendor({ ...addVendor, name: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">GSTIN</span>
              <input value={addVendor.gstin} maxLength={15} onChange={(e) => setAddVendor({ ...addVendor, gstin: e.target.value.toUpperCase() })} className={`${inputClass} uppercase`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Phone</span>
              <input type="tel" value={addVendor.phone} onChange={(e) => setAddVendor({ ...addVendor, phone: e.target.value })} className={inputClass} />
            </label>
            {addVendor.message && <p className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">{addVendor.message}</p>}
            <button className="min-h-[52px] rounded-card bg-primary font-bold text-white">{isAdmin ? "Add vendor" : "Send request"}</button>
          </form>
        )}
      </Sheet>

      <PurchaseSummary
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        draft={draft}
        totals={totals}
        warnings={validation.warnings}
        draftId={draftId}
        edit={edit}
        thumbnail={pages.find((p) => p.mime !== "application/pdf")?.url ?? null}
        onSaved={() => {
          setSaved(true);
          clearDeviceCopy(storageKey);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
