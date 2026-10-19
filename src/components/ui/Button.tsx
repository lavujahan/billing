import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white border-0 disabled:opacity-50",
  secondary: "bg-surface text-primary-strong border border-primary-outline",
  ghost: "bg-transparent text-primary border-0",
  danger: "bg-surface text-danger border border-chip-border",
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-card px-4 text-[15px] font-bold disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
