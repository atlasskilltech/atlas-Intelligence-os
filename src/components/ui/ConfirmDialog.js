"use client";

import { useEffect, useRef } from "react";
import Button from "./Button";

/**
 * Small modal confirmation. Escape / backdrop cancel.
 * Focus is set ONCE when it opens: the first text field inside (so typing works),
 * else Cancel (the safe choice). It must not re-run on every render — parents pass
 * new onCancel functions each render, and re-focusing would steal the cursor while typing.
 */
export default function ConfirmDialog({ open, title, children, confirmLabel = "Confirm", tone = "danger", busy, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const latest = useRef({ busy, onCancel });
  useEffect(() => {
    latest.current = { busy, onCancel };
  });

  useEffect(() => {
    if (!open) return;
    const field = dialogRef.current?.querySelector("textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select");
    (field || cancelRef.current)?.focus();
    const onKey = (e) => e.key === "Escape" && !latest.current.busy && latest.current.onCancel?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy-900/50" onClick={() => !busy && onCancel()} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
        <h2 id="confirm-title" className="text-base font-bold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
