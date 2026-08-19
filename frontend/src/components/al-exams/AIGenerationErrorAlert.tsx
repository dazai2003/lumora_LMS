"use client";

import React, { useState, useEffect } from "react";
import SvgIcon from "@/components/SvgIcon";
import { ClassifiedAIError } from "@/lib/aiErrorClassifier";

export interface AIGenerationErrorAlertProps {
  error: ClassifiedAIError;
  onRetry?: () => void;
  onDismiss?: () => void;
  partialCount?: number;
  requestedCount?: number;
  onReviewPartial?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Standardized, user-facing error alert card for AI question generation in Lumora LMS.
 * Handles rate-limiting countdowns, network failures, timeouts, and partial-generation preservation.
 */
export default function AIGenerationErrorAlert({
  error,
  onRetry,
  onDismiss,
  partialCount,
  requestedCount,
  onReviewPartial,
  className = "",
  style = {},
}: AIGenerationErrorAlertProps) {
  // Live Countdown state for Quota / Rate-limit errors
  const [countdown, setCountdown] = useState<number>(error.retryDelaySeconds || 0);

  useEffect(() => {
    if (!error.retryDelaySeconds || error.retryDelaySeconds <= 0) {
      setCountdown(0);
      return;
    }
    setCountdown(error.retryDelaySeconds);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [error.retryDelaySeconds]);

  // Category-specific visual accents
  const getCategoryTheme = () => {
    switch (error.category) {
      case "quota":
        return {
          icon: "alert-triangle",
          borderColor: "rgba(245, 158, 11, 0.5)",
          bg: "rgba(245, 158, 11, 0.08)",
          titleColor: "#f59e0b",
          badgeText: "Rate Limit Active",
        };
      case "auth":
        return {
          icon: "lock",
          borderColor: "rgba(239, 68, 68, 0.5)",
          bg: "rgba(239, 68, 68, 0.08)",
          titleColor: "#ef4444",
          badgeText: "Config Error",
        };
      case "network":
      case "timeout":
        return {
          icon: "wifi-off",
          borderColor: "rgba(59, 130, 246, 0.5)",
          bg: "rgba(59, 130, 246, 0.08)",
          titleColor: "#3b82f6",
          badgeText: error.category === "timeout" ? "Timed Out" : "Connection Issue",
        };
      case "service":
        return {
          icon: "clock",
          borderColor: "rgba(168, 85, 247, 0.5)",
          bg: "rgba(168, 85, 247, 0.08)",
          titleColor: "#a855f7",
          badgeText: "High Demand",
        };
      case "response":
      case "server":
      default:
        return {
          icon: "alert-circle",
          borderColor: "rgba(239, 68, 68, 0.4)",
          bg: "rgba(239, 68, 68, 0.06)",
          titleColor: "var(--danger, #ef4444)",
          badgeText: "Preserved",
        };
    }
  };

  const theme = getCategoryTheme();
  const hasPartial = typeof partialCount === "number" && partialCount > 0;

  return (
    <div
      className={`ai-generation-error-alert ${className}`}
      style={{
        padding: "1.25rem 1.4rem",
        borderRadius: "var(--radius-lg, 12px)",
        background: theme.bg,
        border: `1.5px solid ${theme.borderColor}`,
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
        animation: "aiErrorSlideIn 0.3s ease-out",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
        ...style,
      }}
      role="alert"
      aria-live="assertive"
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem" }}>
        {/* Status Icon */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: `1.5px solid ${theme.borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.titleColor,
            flexShrink: 0,
            marginTop: "1px",
          }}
        >
          <SvgIcon name={theme.icon as any} size={20} />
        </div>

        {/* Message Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h4
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: theme.titleColor,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {error.title}
            </h4>
            <span
              className="badge"
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                background: "var(--bg-card)",
                border: `1px solid ${theme.borderColor}`,
                color: theme.titleColor,
                padding: "0.15rem 0.55rem",
                borderRadius: "10px",
              }}
            >
              Configuration Preserved
            </span>
          </div>

          <p
            style={{
              fontSize: "0.835rem",
              color: "var(--text-secondary)",
              margin: "0.4rem 0 0 0",
              lineHeight: 1.5,
            }}
          >
            {error.message}
          </p>

          {/* Partial Generation Reassurance Box */}
          {hasPartial && (
            <div
              style={{
                marginTop: "0.65rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "var(--radius-md, 8px)",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontSize: "0.8rem",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <SvgIcon name="check" size={16} />
              <span>
                <strong>{partialCount}</strong> {requestedCount ? `of ${requestedCount}` : ""} valid {partialCount === 1 ? "question" : "questions"} successfully generated and preserved.
              </span>
            </div>
          )}

          {/* Live Countdown Warning for Rate Limit */}
          {countdown > 0 && (
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.78rem",
                color: theme.titleColor,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <SvgIcon name="clock" size={14} />
              <span>Retry available in approximately {countdown} second{countdown !== 1 ? "s" : ""}...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          paddingTop: "0.65rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {onDismiss && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.9rem" }}
            onClick={onDismiss}
          >
            Back to Configuration
          </button>
        )}

        {hasPartial && onReviewPartial && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              fontSize: "0.82rem",
              padding: "0.4rem 0.95rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              borderColor: "rgba(16, 185, 129, 0.5)",
              color: "#10b981",
            }}
            onClick={onReviewPartial}
          >
            <SvgIcon name="eye" size={14} />
            Review {partialCount} Generated {partialCount === 1 ? "Question" : "Questions"}
          </button>
        )}

        {error.retryable && onRetry && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={countdown > 0}
            style={{
              fontSize: "0.82rem",
              padding: "0.4rem 1rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              opacity: countdown > 0 ? 0.6 : 1,
              cursor: countdown > 0 ? "not-allowed" : "pointer",
            }}
            onClick={onRetry}
          >
            <SvgIcon name="sparkle" size={14} />
            {countdown > 0 ? `Retry (${countdown}s)` : "Retry Generation"}
          </button>
        )}
      </div>

      <style>{`
        @keyframes aiErrorSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
