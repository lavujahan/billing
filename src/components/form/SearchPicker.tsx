"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type PickerOption<T> = { key: string; value: T; label: ReactNode };

// Type-ahead search box with a listbox under it. `extraOptions` lets callers add rows such as "+ New customer".
export function SearchPicker<T>({
  label,
  placeholder,
  search,
  render,
  extraOptions,
  onPick,
  autoFocus,
  emptyText = "No match · பொருத்தம் இல்லை",
}: {
  label: string;
  placeholder?: string;
  search: (q: string, signal: AbortSignal) => Promise<T[]>;
  render: (item: T) => PickerOption<T>;
  extraOptions?: (q: string) => PickerOption<T>[];
  onPick: (item: T) => void;
  autoFocus?: boolean;
  emptyText?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      search(q, controller.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, open, search]);

  const options = [...results.map(render), ...(extraOptions?.(q.trim()) ?? [])];

  function pick(option: PickerOption<T> | undefined) {
    if (!option) return;
    onPick(option.value);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="text-xs text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="mt-1 min-h-12 w-full rounded-field border border-outline bg-surface px-3 text-[16px] outline-none focus:border-2 focus:border-primary"
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-field border border-outline bg-surface shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              className={`flex min-h-12 cursor-pointer items-center border-t border-divider px-3 py-2 first:border-t-0 ${
                i === active ? "bg-primary-container" : ""
              }`}
            >
              {o.label}
            </li>
          ))}
          {!loading && options.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">{emptyText}</li>}
          {loading && options.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">Searching…</li>}
        </ul>
      )}
    </div>
  );
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
