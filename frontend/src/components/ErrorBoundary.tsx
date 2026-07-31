"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary: catches rendering errors in the component tree
 * and displays a clean recovery screen instead of a blank white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
            padding: "3rem 2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.5rem",
              fontSize: "1.75rem",
            }}
          >
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-primary, #f0f0f5)",
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              color: "var(--text-secondary, #9191a8)",
              fontSize: "0.95rem",
              maxWidth: "480px",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            An unexpected error occurred while rendering this page. You can try
            recovering, or go back to the dashboard.
          </p>

          {/* Error details (dev mode) */}
          {process.env.NODE_ENV === "development" && this.state.error && (
            <details
              style={{
                marginBottom: "1.5rem",
                padding: "1rem",
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "var(--radius-sm, 8px)",
                width: "100%",
                maxWidth: "600px",
                textAlign: "left",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  color: "#ef4444",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Error Details (dev only)
              </summary>
              <pre
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary, #9191a8)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="btn-primary"
              onClick={this.handleReset}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              ↻ Try Again
            </button>
            <button
              className="btn-secondary"
              onClick={() => (window.location.href = "/dashboard")}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
