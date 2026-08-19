"use client";

import React, { useMemo } from "react";
import { SvgIcon } from "@/components/SvgIcon";

export type AIGenerationType = "mcq" | "structured" | "essay";

export interface AILoadingProgressBoxProps {
  questionType?: AIGenerationType;
  requestedCount?: number;
  loadingStage?: string;
  activeStageIndex?: number;
  subtext?: string;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_STAGES: Record<AIGenerationType, string[]> = {
  mcq: [
    "Validating question blueprint & target counts",
    "Checking learning resources & syllabus grounding",
    "Generating candidate questions via Gemini AI",
    "Validating question options, diagrams & keys",
    "Checking for duplicates & normalizing symbols",
    "Preparing Candidate Review workspace",
  ],
  structured: [
    "Validating structured blueprint & subpart hierarchy",
    "Checking learning resources & syllabus grounding",
    "Generating structured questions via Gemini AI",
    "Validating node hierarchy, marks & model answers",
    "Checking content conformance & eliminating placeholders",
    "Preparing Candidate Review workspace",
  ],
  essay: [
    "Validating essay blueprints & rubric point allocations",
    "Checking learning resources & syllabus grounding",
    "Generating authentic essay questions via Gemini AI",
    "Validating subpart structure & Roman numeral items",
    "Validating itemized marking schemes & examiner criteria",
    "Preparing Candidate Review workspace",
  ],
};

function inferStageIndex(stageText: string, stages: string[]): number {
  if (!stageText) return 0;
  const lower = stageText.toLowerCase();
  if (lower.includes("analyzing") || lower.includes("scope") || lower.includes("resource") || lower.includes("material")) {
    return 1;
  }
  if (lower.includes("generating") || lower.includes("gemini") || lower.includes("ai")) {
    return 2;
  }
  if (lower.includes("validating") || lower.includes("verifying") || lower.includes("schema") || lower.includes("hierarchy") || lower.includes("subpart") || lower.includes("rubric")) {
    return 3;
  }
  if (lower.includes("duplicate") || lower.includes("normalizing") || lower.includes("conformance") || lower.includes("placeholder")) {
    return 4;
  }
  if (lower.includes("preparing") || lower.includes("workspace") || lower.includes("review") || lower.includes("complete")) {
    return 5;
  }
  return 0;
}

/**
 * Universal AI Generation Progress Component for Lumora Assessment Authoring.
 * Provides transparent, stage-based progress visualization across MCQ, Structured, and Essay generation.
 */
export default function AILoadingProgressBox({
  questionType = "mcq",
  requestedCount,
  loadingStage = "",
  activeStageIndex,
  subtext = "Applying Sri Lankan G.C.E. A/L Biology curriculum grounding & schema validators.",
  className = "",
  style = {},
}: AILoadingProgressBoxProps) {
  const stages = DEFAULT_STAGES[questionType] || DEFAULT_STAGES.mcq;

  const currentStageIdx = useMemo(() => {
    if (typeof activeStageIndex === "number" && activeStageIndex >= 0) {
      return Math.min(activeStageIndex, stages.length - 1);
    }
    return inferStageIndex(loadingStage, stages);
  }, [activeStageIndex, loadingStage, stages]);

  const typeLabels: Record<AIGenerationType, string> = {
    mcq: "Multiple Choice Questions (Paper I)",
    structured: "Structured Questions (Paper II Part A)",
    essay: "Essay Questions (Paper II Part B)",
  };

  return (
    <div
      className={`ai-loading-progress-box ${className}`}
      style={{
        padding: "1.5rem 1.75rem",
        borderRadius: "var(--radius-lg, 12px)",
        background: "var(--bg-card)",
        border: "1.5px solid var(--accent-primary)",
        boxShadow: "0 10px 30px rgba(99, 102, 241, 0.14)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        animation: "aiFadeIn 0.3s ease-out",
        ...style,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Header with Title & Question Count Badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div
            className="spinner"
            style={{
              width: "22px",
              height: "22px",
              borderWidth: "2.5px",
              borderColor: "rgba(99, 102, 241, 0.2)",
              borderTopColor: "var(--accent-primary)",
            }}
          />
          <div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Generating {typeLabels[questionType]}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>
              Sri Lankan G.C.E. A/L Biology AI Authoring Pipeline
            </div>
          </div>
        </div>

        {requestedCount && requestedCount > 0 && (
          <span
            className="badge badge-primary"
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "0.25rem 0.65rem",
              borderRadius: "12px",
            }}
          >
            Target: {requestedCount} {requestedCount === 1 ? "Question" : "Questions"}
          </span>
        )}
      </div>

      {/* Stage Progression Visual Checklist */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          background: "var(--bg-secondary)",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-md, 8px)",
          border: "1px solid var(--border)",
        }}
      >
        {stages.map((stageTitle, idx) => {
          const isCompleted = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx;
          const isQueued = idx > currentStageIdx;

          return (
            <div
              key={stageTitle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                fontSize: "0.84rem",
                fontWeight: isCurrent ? 700 : isCompleted ? 600 : 400,
                color: isCurrent
                  ? "var(--accent-primary)"
                  : isCompleted
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
                transition: "all 0.25s ease",
              }}
            >
              {/* Stage Status Icon Indicator */}
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  background: isCompleted
                    ? "rgba(16, 185, 129, 0.15)"
                    : isCurrent
                    ? "rgba(99, 102, 241, 0.18)"
                    : "rgba(150, 150, 150, 0.1)",
                  border: isCompleted
                    ? "1.5px solid #10b981"
                    : isCurrent
                    ? "1.5px solid var(--accent-primary)"
                    : "1px dashed var(--border)",
                  color: isCompleted
                    ? "#10b981"
                    : isCurrent
                    ? "var(--accent-primary)"
                    : "var(--text-muted)",
                }}
              >
                {isCompleted ? (
                  "✓"
                ) : isCurrent ? (
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--accent-primary)",
                      display: "inline-block",
                      animation: "aiDotPulse 1.2s infinite ease-in-out",
                    }}
                  />
                ) : (
                  ""
                )}
              </div>

              {/* Stage Text Label */}
              <div style={{ flex: 1 }}>
                {stageTitle}
              </div>

              {/* Active Running Pulse Badge */}
              {isCurrent && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "var(--accent-primary)",
                    background: "rgba(99, 102, 241, 0.1)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "4px",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  In Progress
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Dynamic Subtext & Reassurance Footer */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "0.825rem",
            fontWeight: 600,
            color: "var(--accent-primary)",
            minHeight: "1.2rem",
          }}
        >
          {loadingStage || stages[currentStageIdx]}
        </div>
        <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
          {subtext} Please keep this window open while Lumora prepares your candidate review.
        </div>
      </div>

      <style>{`
        @keyframes aiFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiDotPulse {
          0%, 100% { transform: scale(0.85); opacity: 0.7; }
          50% { transform: scale(1.25); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
