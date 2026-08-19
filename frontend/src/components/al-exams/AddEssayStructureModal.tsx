"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import SvgIcon from "@/components/SvgIcon";

export type EssayStructureFormat = "single_complete" | "multi_part" | "short_notes";

export interface AddEssayStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultQuestionNumber: number;
  initialStructure?: EssayStructureFormat;
  onCreateStructure: (data: { questionNumber: number; structure: EssayStructureFormat; subpartCount?: number }) => void;
}

/**
 * Lightweight, Structure-Only Selection Dialog for Sri Lankan G.C.E. A/L Biology Paper II Part B.
 * Follows the strict separation of structure blueprint from content authoring.
 */
export default function AddEssayStructureModal({
  isOpen,
  onClose,
  defaultQuestionNumber,
  initialStructure = "single_complete",
  onCreateStructure,
}: AddEssayStructureModalProps) {
  const [structure, setStructure] = useState<EssayStructureFormat>(initialStructure);
  const [subpartCount, setSubpartCount] = useState<number>(2);

  useEffect(() => {
    if (isOpen) {
      setStructure(initialStructure);
      setSubpartCount(2);
    }
  }, [isOpen, initialStructure]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateStructure({
      questionNumber: defaultQuestionNumber,
      structure,
      subpartCount: structure === "single_complete" ? 1 : subpartCount,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal title="Add Essay Question — Choose Structure" onClose={onClose} maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        
        {/* 1. Question Number (Automatically Assigned, Read-Only) */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>
            Question Number
          </label>
          <div
            style={{
              padding: "0.65rem 0.9rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              fontWeight: 800,
              fontSize: "1rem",
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <SvgIcon name="file-text" size={17} />
              Question {defaultQuestionNumber}
            </span>
            <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
              Automatically assigned
            </span>
          </div>
        </div>

        {/* 2. Question Structure Selection (3 Canonical Structures) */}
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
            Select Essay Structure Template *
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            
            {/* Option 1: Single Complete Question */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                border: structure === "single_complete" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                background: structure === "single_complete" ? "rgba(99, 102, 241, 0.07)" : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="essay_structure_opt"
                checked={structure === "single_complete"}
                onChange={() => setStructure("single_complete")}
                style={{ marginTop: "0.2rem", accentColor: "var(--accent-primary)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: structure === "single_complete" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                  1. Single Complete Question
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                  One comprehensive essay prompt with itemized answer points and marking scheme.
                </div>
              </div>
            </label>

            {/* Option 2: Multi-Part Descriptive Subparts */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                border: structure === "multi_part" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                background: structure === "multi_part" ? "rgba(99, 102, 241, 0.07)" : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="essay_structure_opt"
                checked={structure === "multi_part"}
                onChange={() => setStructure("multi_part")}
                style={{ marginTop: "0.2rem", accentColor: "var(--accent-primary)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: structure === "multi_part" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                  2. Multi-Part Descriptive Subparts
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                  Sub-divided into Roman-numbered subquestions (i), (ii), (iii)... each with individual prompts and answer points.
                </div>

                {structure === "multi_part" && (
                  <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.6rem" }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Initial subquestions:
                    </span>
                    {[2, 3, 4, 5].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        className={`btn ${subpartCount === cnt ? "btn-primary" : "btn-secondary"}`}
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem", border: "none" }}
                        onClick={() => setSubpartCount(cnt)}
                      >
                        {cnt} parts
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {/* Option 3: Short Notes Style */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                border: structure === "short_notes" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                background: structure === "short_notes" ? "rgba(99, 102, 241, 0.07)" : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="essay_structure_opt"
                checked={structure === "short_notes"}
                onChange={() => setStructure("short_notes")}
                style={{ marginTop: "0.2rem", accentColor: "var(--accent-primary)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: structure === "short_notes" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                  3. Short Notes Style
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                  &quot;Write short notes on the following:&quot; format with itemized topic subquestions (i), (ii), (iii)...
                </div>

                {structure === "short_notes" && (
                  <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.6rem" }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Initial topics:
                    </span>
                    {[2, 3, 4].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        className={`btn ${subpartCount === cnt ? "btn-primary" : "btn-secondary"}`}
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem", border: "none" }}
                        onClick={() => setSubpartCount(cnt)}
                      >
                        {cnt} topics
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

          </div>
        </div>

        {/* Info Note: Structure vs Content separation */}
        <div style={{ padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <SvgIcon name="info" size={15} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
          <span>Clicking <strong>Create Question</strong> opens the dedicated Essay Authoring Form below to fill in prompts, answer points, and marking schemes.</span>
        </div>

        {/* Modal Actions Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              padding: "0.55rem 1.6rem",
              fontWeight: 700,
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              border: "none",
            }}
          >
            Create Question
          </button>
        </div>

      </form>
    </Modal>
  );
}
