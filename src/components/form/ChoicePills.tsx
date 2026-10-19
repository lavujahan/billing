"use client";

export function ChoicePills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-full text-sm ${
              selected
                ? "border-[1.5px] border-primary bg-primary-container font-bold text-primary-strong"
                : "border border-chip-border bg-surface font-medium text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
