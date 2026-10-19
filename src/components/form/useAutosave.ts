"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "device";

// Debounced server autosave with a device copy in localStorage, so a lost network or a
// closed tab never loses a half-filled form. "device" = saved on this phone only.
export function useAutosave<T>({
  value,
  enabled,
  storageKey,
  save,
  delay = 1500,
}: {
  value: T;
  enabled: boolean;
  storageKey: string;
  save: (value: T) => Promise<boolean>;
  delay?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const first = useRef(true);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!enabled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value, at: Date.now() }));
    } catch {}
    const timer = setTimeout(async () => {
      setStatus("saving");
      const ok = await saveRef.current(value).catch(() => false);
      setStatus(ok ? "saved" : "device");
    }, delay);
    return () => clearTimeout(timer);
  }, [value, enabled, storageKey, delay]);

  return status;
}

export function readDeviceCopy<T>(storageKey: string): { value: T; at: number } | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as { value: T; at: number }) : null;
  } catch {
    return null;
  }
}

export function clearDeviceCopy(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {}
}
