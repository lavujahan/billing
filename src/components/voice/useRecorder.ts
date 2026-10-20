"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Recording = { blob: Blob; durationMs: number; fileName: string };
export type RecorderState = "idle" | "recording" | "denied" | "unsupported";

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const SPEECH_LEVEL = 0.05;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// Microphone recording with a live level meter. With `silenceStopMs`, recording stops by
// itself once the speaker has talked and then gone quiet (field voice); without it, the
// caller stops it (hold-to-speak). Resolves null if cancelled or nothing was said.
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const stopRef = useRef<((keep: boolean) => void) | null>(null);

  useEffect(() => () => stopRef.current?.(false), []);

  const start = useCallback(async (opts: { silenceStopMs?: number; maxMs: number }): Promise<Recording | "denied" | "unsupported" | null> => {
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return "unsupported";
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("denied");
      return "denied";
    }

    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const startedAt = performance.now();
    let heardSpeech = false;
    let lastLoud = startedAt;
    let keep = true;
    let frame = 0;
    let lastSample = 0;
    setHistory([]);

    const done = new Promise<Recording | null>((resolve) => {
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        stopRef.current = null;
        setLevel(0);
        setState("idle");
        const durationMs = performance.now() - startedAt;
        if (!keep || !heardSpeech || chunks.length === 0) return resolve(null);
        const type = recorder.mimeType || mime || "audio/webm";
        resolve({ blob: new Blob(chunks, { type }), durationMs, fileName: type.includes("mp4") ? "voice.mp4" : type.includes("ogg") ? "voice.ogg" : "voice.webm" });
      };
    });

    const stop = (k: boolean) => {
      keep = k;
      if (recorder.state !== "inactive") recorder.stop();
    };
    stopRef.current = stop;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / samples.length);
      const lvl = Math.min(1, rms * 4);
      setLevel(lvl);
      const now = performance.now();
      if (now - lastSample > 120) {
        lastSample = now;
        setHistory((h) => [...h.slice(-31), lvl]);
      }
      if (rms > SPEECH_LEVEL) {
        heardSpeech = true;
        lastLoud = now;
      }
      const elapsed = now - startedAt;
      if (elapsed > opts.maxMs) return stop(true);
      if (opts.silenceStopMs) {
        if (heardSpeech && now - lastLoud > opts.silenceStopMs) return stop(true);
        if (!heardSpeech && elapsed > 6000) return stop(false);
      }
      frame = requestAnimationFrame(tick);
    };

    recorder.start(250);
    setState("recording");
    frame = requestAnimationFrame(tick);
    return done;
  }, []);

  const stop = useCallback(() => stopRef.current?.(true), []);
  const cancel = useCallback(() => stopRef.current?.(false), []);

  return { state, level, history, start, stop, cancel };
}

export async function postAudio<T>(url: string, rec: Recording, fields: Record<string, string>): Promise<T & { error?: string; message?: string }> {
  const body = new FormData();
  body.append("audio", new File([rec.blob], rec.fileName, { type: rec.blob.type }));
  body.append("durationMs", String(Math.round(rec.durationMs)));
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const res = await fetch(url, { method: "POST", body });
  return res.json().catch(() => ({ error: "network", message: "Network problem — try again." }));
}
