"use client";

import { useRef, useState } from "react";
import { MicIcon } from "./FieldMic";
import { useRecorder, type Recording } from "./useRecorder";

const CANCEL_DRAG_PX = 70;

// The big orange mic: hold, say the whole bill, release to fill; slide up to cancel.
// Keyboard: hold Space or Enter. A quick tap toggles recording for users who can't hold.
export function HoldToSpeak({ label, caption, onRecorded }: { label: string; caption: string; onRecorded: (rec: Recording) => void }) {
  const { state, level, history, start, stop, cancel } = useRecorder();
  const [elapsed, setElapsed] = useState(0);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = useRef<{ y: number; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recording = state === "recording";

  async function begin() {
    if (recording) return;
    setError(null);
    setCancelArmed(false);
    setElapsed(0);
    const t0 = Date.now();
    timer.current = setInterval(() => setElapsed(Date.now() - t0), 200);
    const rec = await start({ maxMs: 60_000 });
    if (timer.current) clearInterval(timer.current);
    if (rec === "denied") return setError("Microphone blocked — allow it in browser settings.");
    if (rec === "unsupported") return setError("This browser can't record audio.");
    if (rec) onRecorded(rec);
  }

  function end(cancelled: boolean) {
    origin.current = null;
    if (cancelled) cancel();
    else stop();
  }

  return (
    <div className="relative flex flex-col items-center gap-1">
      {recording && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-32 z-30 mx-auto flex max-w-[560px] flex-col items-center gap-2 rounded-card border border-outline bg-surface px-4 py-4 shadow-lg"
        >
          <span className="text-sm font-semibold">{cancelArmed ? "Release to cancel · ரத்து" : "Listening… · கேட்கிறது"}</span>
          <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
            {Array.from({ length: 32 }, (_, i) => history[history.length - 32 + i] ?? 0).map((v, i) => (
              <span key={i} className={`w-1.5 rounded-full ${cancelArmed ? "bg-ink-muted" : "bg-voice"}`} style={{ height: `${8 + v * 32}px` }} />
            ))}
          </div>
          <span className="text-xs text-ink-muted">
            {Math.floor(elapsed / 1000)}s · release to fill · slide up to cancel
          </span>
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        aria-pressed={recording}
        className={`flex touch-none items-center justify-center rounded-full bg-voice text-white select-none ${recording ? "h-[76px] w-[76px]" : "h-16 w-16"}`}
        style={recording ? { boxShadow: `0 0 0 ${6 + level * 10}px color-mix(in srgb, var(--color-voice) 22%, transparent)` } : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          origin.current = { y: e.clientY, at: Date.now() };
          void begin();
        }}
        onPointerMove={(e) => {
          if (origin.current) setCancelArmed(origin.current.y - e.clientY > CANCEL_DRAG_PX);
        }}
        onPointerUp={() => {
          const o = origin.current;
          // A tap shorter than 300ms leaves it recording; the next tap stops it.
          if (o && Date.now() - o.at < 300) {
            origin.current = null;
            return;
          }
          end(cancelArmed);
        }}
        onPointerCancel={() => end(true)}
        onClick={() => {
          if (recording && !origin.current) stop();
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            void begin();
          }
          if (e.key === "Escape") cancel();
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stop();
        }}
      >
        <MicIcon size={28} />
      </button>
      <span className="text-[11px] text-ink-muted">{caption}</span>
      {error && <span className="absolute bottom-full mb-2 w-48 rounded-field bg-warning-container px-2 py-1 text-xs text-warning-text">{error}</span>}
    </div>
  );
}
