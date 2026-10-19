"use client";

import { useState } from "react";

// Shares a text summary through the phone's share sheet (WhatsApp etc.); copies it where sharing isn't available.
export function ShareBillButton({ title, text, className }: { title: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, text }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={share} className={className}>
      {copied ? "Copied" : "Share"}
    </button>
  );
}
