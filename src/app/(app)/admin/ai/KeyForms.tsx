"use client";

import { useActionState } from "react";
import { FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { removeKeyAction, saveKeyAction, testKeyAction } from "./actions";

export function SaveKeyForm({ replacing }: { replacing: boolean }) {
  const [state, action, pending] = useActionState(saveKeyAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{replacing ? "New OpenAI API key" : "OpenAI API key"}</span>
        <input name="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" required className={inputClass} />
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Testing and saving…" : replacing ? "Replace key" : "Save key"}
      </Button>
    </form>
  );
}

export function TestKeyButton() {
  const [state, action, pending] = useActionState(testKeyAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Testing…" : "Test key"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RemoveKeyButton() {
  return (
    <form
      action={removeKeyAction}
      onSubmit={(e) => {
        if (!confirm("Remove the OpenAI key? Voice will stop working until a key is added.")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger" className="w-full">
        Remove key
      </Button>
    </form>
  );
}
