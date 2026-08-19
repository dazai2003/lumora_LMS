"use client";

import React, { useState } from "react";
import { ALQuestion } from "@/lib/api";

interface QuestionNavigatorProps {
  questions: ALQuestion[];
  currentIndex: number;
  answers: Record<number, string>;
  subpartAnswers?: Record<number, Record<string, any>>;
  essayAnswers?: Record<number, string>;
  flaggedIds: Set<number>;
  onSelectQuestion: (index: number) => void;
}

/**
 * 1–50 Question Status Grid Navigator for Sri Lankan A/L Biology Paper I.
 * Provides Part A (Q1–40) & Part B (Q41–50) section awareness, status color-coding,
 * and immediate keyboard & click navigation.
 */
export default function QuestionNavigator({
  questions,
  currentIndex,
  answers,
  subpartAnswers = {},
  essayAnswers = {},
  flaggedIds,
  onSelectQuestion,
}: QuestionNavigatorProps) {
  const totalCount = questions.length;
  const isStandard50Q = totalCount === 50;

  // Filter tab: "all", "part_a" (1-40), "part_b" (41-50)
  const [sectionFilter, setSectionFilter] = useState<"all" | "part_a" | "part_b">("all");

  // Calculate answered questions (handles MCQ, structured subparts, and essay text)
  const isQuestionAnswered = (q: ALQuestion) => {
    if (answers[q.id]?.trim()) return true;
    if (subpartAnswers[q.id] && Object.values(subpartAnswers[q.id]).some((v) => (typeof v === "string" ? v.trim().length > 0 : Boolean(v)))) return true;
    if (essayAnswers[q.id]?.trim()) return true;
    return false;
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const flaggedCount = flaggedIds.size;
  const unansweredCount = totalCount - answeredCount;

  // Filter questions by section tab
  const displayedQuestions = questions.filter((q, idx) => {
    if (sectionFilter === "part_a") return idx < 40;
    if (sectionFilter === "part_b") return idx >= 40;
    return true;
  });

  return (
    <div
      className="card"
      style={{
        padding: "1.25rem",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        position: "sticky",
        top: "5.5rem",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Question Navigator
        </h3>
        <span className="badge badge-info" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
          {answeredCount}/{totalCount} Answered
        </span>
      </div>

      {/* Part A / Part B Section Tabs (for Standard 50Q Papers) */}
      {isStandard50Q && (
        <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.85rem", background: "var(--bg-secondary)", padding: "0.2rem", borderRadius: "var(--radius-sm)" }}>
          <button
            type="button"
            onClick={() => setSectionFilter("all")}
            style={{
              flex: 1,
              padding: "0.3rem 0.4rem",
              fontSize: "0.72rem",
              fontWeight: sectionFilter === "all" ? 700 : 500,
              background: sectionFilter === "all" ? "var(--bg-card)" : "transparent",
              color: sectionFilter === "all" ? "var(--text-primary)" : "var(--text-muted)",
              border: sectionFilter === "all" ? "1px solid var(--border)" : "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            All (1–50)
          </button>
          <button
            type="button"
            onClick={() => setSectionFilter("part_a")}
            style={{
              flex: 1,
              padding: "0.3rem 0.4rem",
              fontSize: "0.72rem",
              fontWeight: sectionFilter === "part_a" ? 700 : 500,
              background: sectionFilter === "part_a" ? "var(--bg-card)" : "transparent",
              color: sectionFilter === "part_a" ? "var(--text-primary)" : "var(--text-muted)",
              border: sectionFilter === "part_a" ? "1px solid var(--border)" : "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Part A (1–40)
          </button>
          <button
            type="button"
            onClick={() => setSectionFilter("part_b")}
            style={{
              flex: 1,
              padding: "0.3rem 0.4rem",
              fontSize: "0.72rem",
              fontWeight: sectionFilter === "part_b" ? 700 : 500,
              background: sectionFilter === "part_b" ? "var(--bg-card)" : "transparent",
              color: sectionFilter === "part_b" ? "var(--text-primary)" : "var(--text-muted)",
              border: sectionFilter === "part_b" ? "1px solid var(--border)" : "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Part B (41–50)
          </button>
        </div>
      )}

      {/* Summary Legend */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.85rem", fontSize: "0.72rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-primary)" }} />
          {answeredCount} Answered
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--warning)" }} />
          {flaggedCount} Review
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--border)" }} />
          {unansweredCount} Left
        </span>
      </div>

      {/* 1-50 Grid of Buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "0.45rem",
          maxHeight: "360px",
          overflowY: "auto",
          paddingRight: "0.2rem",
        }}
      >
        {displayedQuestions.map((q) => {
          const originalIndex = questions.findIndex((orig) => orig.id === q.id);
          const isCurrent = originalIndex === currentIndex;
          const isAnswered = isQuestionAnswered(q);
          const isFlagged = flaggedIds.has(q.id);

          let bg = "var(--bg-secondary)";
          let color = "var(--text-secondary)";
          let border = "1px solid var(--border)";

          if (isAnswered) {
            bg = "var(--accent-primary)";
            color = "#fff";
            border = "1px solid var(--accent-primary)";
          }

          if (isFlagged) {
            bg = "var(--warning)";
            color = "#000";
            border = "1px solid var(--warning)";
          }

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelectQuestion(originalIndex >= 0 ? originalIndex : 0)}
              title={`Question ${q.question_number}${isAnswered ? ' (Answered)' : ''}${isFlagged ? ' (Marked for Review)' : ''}`}
              style={{
                height: "36px",
                borderRadius: "var(--radius-sm)",
                background: bg,
                color: color,
                border: border,
                fontWeight: isCurrent ? 800 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
                outline: isCurrent ? "2px solid var(--accent-primary)" : "none",
                outlineOffset: "1px",
                position: "relative",
              }}
            >
              {q.question_number}
              {originalIndex >= 40 && (
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    background: isAnswered ? "#fff" : "var(--accent-primary)",
                  }}
                  title="Part B Grid Item"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
