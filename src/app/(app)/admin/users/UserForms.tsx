"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { createUserAction, resetCodeAction, type CodeResult } from "./actions";

function CodeNotice({ result }: { result: CodeResult }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
        {result.error}
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-1 rounded-field border border-primary-outline bg-primary-container px-3 py-2">
      <span className="text-[13px] text-primary-strong">
        Login code for {result.name} ({result.mobile}) — shown only once:
      </span>
      <span className="text-2xl font-bold tracking-[0.3em] text-primary-strong">{result.code}</span>
    </div>
  );
}

const fieldClass = "min-h-12 rounded-field border border-outline bg-surface px-3 text-[15px] outline-none focus:border-2 focus:border-primary";

export function CreateUserForm({ canAddAdmins }: { canAddAdmins: boolean }) {
  const [result, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Name · பெயர்</span>
        <input name="fullName" required maxLength={80} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Mobile number · மொபைல் எண்</span>
        <input name="mobile" type="tel" inputMode="numeric" required placeholder="98765 43210" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Role · பொறுப்பு</span>
        <select name="role" defaultValue="staff" className={fieldClass}>
          <option value="staff">Staff · பணியாளர்</option>
          {canAddAdmins && <option value="admin">Admin · நிர்வாகி</option>}
          {canAddAdmins && <option value="owner">Owner · உரிமையாளர்</option>}
        </select>
      </label>
      <CodeNotice result={result} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create login"}
      </Button>
    </form>
  );
}

export function ResetCodeButton({ userId }: { userId: string }) {
  const [result, action, pending] = useActionState(resetCodeAction, null);
  return (
    <form action={action} className="contents">
      <input type="hidden" name="userId" value={userId} />
      <button disabled={pending} className="min-h-11 rounded-full border border-primary-outline px-4 text-sm font-semibold text-primary">
        {pending ? "…" : "Reset code"}
      </button>
      {result && (
        <div className="basis-full">
          <CodeNotice result={result} />
        </div>
      )}
    </form>
  );
}
