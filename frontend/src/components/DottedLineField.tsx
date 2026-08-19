"use client";

import React from "react";

interface DottedLineFieldProps {
  label: string;
  lines?: number;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function DottedLineField({
  label,
  lines = 1,
  value,
  onChange,
  placeholder,
  disabled = false,
}: DottedLineFieldProps) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--text-primary)",
          marginBottom: "0.4rem",
          lineHeight: 1.4,
        }}
      >
        {label} :
      </div>

      {lines === 1 ? (
        <div style={{ position: "relative", width: "100%" }}>
          <input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "2px dotted var(--text-secondary)",
              padding: "0.4rem 0",
              fontSize: "0.95rem",
              fontFamily: "monospace",
              color: "var(--accent-primary)",
              outline: "none",
            }}
            placeholder={
              placeholder ||
              "...................................................................................................................................................."
            }
          />
        </div>
      ) : (
        <textarea
          rows={lines}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            background:
              "repeating-linear-gradient(transparent, transparent 27px, var(--border) 28px)",
            lineHeight: "28px",
            border: "none",
            fontSize: "0.95rem",
            fontFamily: "monospace",
            color: "var(--accent-primary)",
            outline: "none",
            resize: "none",
          }}
          placeholder={placeholder || "Write your answer within the provided lines..."}
        />
      )}
    </div>
  );
}
