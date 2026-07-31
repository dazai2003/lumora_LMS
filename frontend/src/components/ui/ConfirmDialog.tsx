"use client";

import { useEffect, useRef } from "react";
import { SvgIcon } from "@/components/SvgIcon";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when the dialog opens, and allow Escape to cancel
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-body)",
          borderRadius: "var(--radius-md, 8px)",
          padding: "1.5rem",
          width: "100%",
          maxWidth: "380px",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
          animation: "scaleIn 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: danger ? "color-mix(in srgb, var(--error) 15%, transparent)" : "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: danger ? "var(--error)" : "var(--accent-primary)",
            }}
          >
            <SvgIcon name="alert-triangle" size={18} />
          </div>
          <div>
            <div id="confirm-dialog-title" style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.375rem" }}>
              {title}
            </div>
            <div id="confirm-dialog-message" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {message}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem" }}>
          <button onClick={onCancel} className="btn-secondary" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={danger ? "btn-danger" : "btn-primary"}
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
