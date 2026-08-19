"use client";

import { useState, useEffect } from "react";
import { SvgIcon } from "@/components/SvgIcon";

interface CombinationGridSelectorProps {
  selectedOption?: string;
  onSelectOption: (option: string) => void;
  disabled?: boolean;
}

/**
 * Combination Grid Selector for A/L Biology Paper 1 (Questions 41–50).
 *
 * Dual-Mode Selection:
 *   1. Direct Option Pill Selection (A, B, C, D, E)
 *   2. Interactive Statement Checkboxes (a, b, c, d) with real-time Option calculation!
 *
 * Grid Rule:
 *   - Option A: (a) and (b) correct
 *   - Option B: (a) and (c) correct
 *   - Option C: (c) and (d) correct
 *   - Option D: (a), (b), and (c) correct
 *   - Option E: Any other combination of statements
 */
export default function CombinationGridSelector({
  selectedOption,
  onSelectOption,
  disabled = false,
}: CombinationGridSelectorProps) {
  const [activeStatements, setActiveStatements] = useState<Set<string>>(new Set());

  // Sync checkboxes when option is set directly
  useEffect(() => {
    if (!selectedOption) {
      setActiveStatements(new Set());
      return;
    }

    const opt = selectedOption.toUpperCase();
    if (opt === "A") setActiveStatements(new Set(["a", "b"]));
    else if (opt === "B") setActiveStatements(new Set(["a", "c"]));
    else if (opt === "C") setActiveStatements(new Set(["c", "d"]));
    else if (opt === "D") setActiveStatements(new Set(["a", "b", "c"]));
  }, [selectedOption]);

  const toggleStatement = (stmt: string) => {
    if (disabled) return;

    const next = new Set(activeStatements);
    if (next.has(stmt)) next.delete(stmt);
    else next.add(stmt);

    setActiveStatements(next);

    // Compute option letter from statement combination
    let computedOption = "E";
    const strSet = Array.from(next).sort().join(",");

    if (strSet === "a,b") computedOption = "A";
    else if (strSet === "a,c") computedOption = "B";
    else if (strSet === "c,d") computedOption = "C";
    else if (strSet === "a,b,c") computedOption = "D";
    else if (next.size > 0) computedOption = "E";

    onSelectOption(computedOption);
  };

  const GRID_OPTIONS = [
    { code: "A", label: "(a) and (b) are correct" },
    { code: "B", label: "(a) and (c) are correct" },
    { code: "C", label: "(c) and (d) are correct" },
    { code: "D", label: "(a), (b), and (c) are correct" },
    { code: "E", label: "Any other combination of statements" },
  ];

  const STATEMENTS = [
    { code: "a", label: "Statement (a)" },
    { code: "b", label: "Statement (b)" },
    { code: "c", label: "Statement (c)" },
    { code: "d", label: "Statement (d)" },
  ];

  return (
    <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Mode 1: Interactive Statement Toggles */}
      <div className="card" style={{ padding: "1.25rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <SvgIcon name="check-circle" size={18} style={{ color: "var(--accent-primary)" }} />
          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Statement Selection Mode (Auto-calculates Option)
          </span>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Select which statements you evaluate as correct. The matching combination option will highlight below automatically.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
          {STATEMENTS.map((st) => {
            const isChecked = activeStatements.has(st.code);
            return (
              <button
                key={st.code}
                type="button"
                disabled={disabled}
                onClick={() => toggleStatement(st.code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1rem",
                  borderRadius: "var(--radius-md)",
                  border: isChecked ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                  background: isChecked ? "rgba(99, 102, 241, 0.12)" : "var(--bg-card)",
                  color: isChecked ? "var(--accent-primary)" : "var(--text-primary)",
                  fontWeight: isChecked ? 700 : 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "4px",
                    border: isChecked ? "none" : "2px solid var(--text-muted)",
                    background: isChecked ? "var(--accent-primary)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "0.75rem",
                  }}
                >
                  {isChecked && "✓"}
                </div>
                <span>({st.code})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode 2: Standard Option Response Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Combination Options (Select or Auto-Calculated)
        </div>

        {GRID_OPTIONS.map((opt) => {
          const isSelected = selectedOption?.toUpperCase() === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onSelectOption(opt.code);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem 1.25rem",
                borderRadius: "var(--radius-md)",
                border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-card)",
                color: "var(--text-primary)",
                cursor: disabled ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: isSelected ? "var(--accent-primary)" : "var(--bg-secondary)",
                  color: isSelected ? "#fff" : "var(--text-secondary)",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                  flexShrink: 0,
                }}
              >
                {opt.code}
              </div>
              <div style={{ flex: 1, fontSize: "0.95rem", fontWeight: isSelected ? 600 : 400 }}>
                {opt.label}
              </div>
              {isSelected && (
                <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
                  Selected
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
