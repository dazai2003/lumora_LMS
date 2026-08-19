"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ─── Types ────────────────────────────────────
type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextType {
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

// ─── Context ──────────────────────────────────
const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

// ─── Variant Styles ───────────────────────────
const variantConfig: Record<ToastVariant, { icon: string; bg: string; border: string; color: string }> = {
  success: { icon: "✓", bg: "#F0FDF4", border: "rgba(16, 185, 129, 0.3)", color: "#10B981" },
  error:   { icon: "✕", bg: "#FEF2F2", border: "rgba(239, 68, 68, 0.3)", color: "#EF4444" },
  warning: { icon: "⚠", bg: "#FFFBEB", border: "rgba(245, 158, 11, 0.3)", color: "#F59E0B" },
  info:    { icon: "ℹ", bg: "#EFF6FF", border: "rgba(37, 99, 235, 0.3)", color: "#2563EB" },
};

// ─── Provider ─────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", duration: number = 4000) => {
      setToasts((prev) => {
        // Deduplicate identical active toast messages
        if (prev.some((t) => t.message === message && t.variant === variant)) {
          return prev;
        }
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setTimeout(() => removeToast(id), duration);
        return [...prev, { id, message, variant, duration }];
      });
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast Container — Top Right */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        style={{
          position: "fixed",
          top: "1.25rem",
          right: "1.25rem",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "0.625rem",
          pointerEvents: "none",
          maxWidth: "420px",
          width: "100%",
        }}
      >
        {toasts.map((toast) => {
          const cfg = variantConfig[toast.variant];
          return (
            <div
              key={toast.id}
              role="alert"
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.875rem 1.25rem",
                background: cfg.bg,
                backdropFilter: "blur(16px)",
                border: `1px solid ${cfg.border}`,
                borderRadius: "var(--radius-md, 12px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                color: "var(--text-primary, #f0f0f5)",
                fontSize: "0.9rem",
                lineHeight: 1.4,
                animation: "toast-slide-in 0.3s ease-out",
              }}
            >
              {/* Icon */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: cfg.color,
                  color: "white",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {cfg.icon}
              </span>

              {/* Message */}
              <span style={{ flex: 1 }}>{toast.message}</span>

              {/* Dismiss */}
              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted, #5e5e76)",
                  cursor: "pointer",
                  padding: "4px",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  flexShrink: 0,
                  transition: "color 0.15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-primary, #f0f0f5)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted, #5e5e76)")}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
