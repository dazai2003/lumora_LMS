"use client";

import React, { useState } from "react";
import { resolveDiagramImageUrl } from "@/lib/api";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";
import {
  EssaySubpart,
  EssayAnswerPoint,
  calculateSubpartMarks,
  stripLeadingNumberingPrefix,
} from "@/lib/alEssayTreeUtils";
import SvgIcon from "@/components/SvgIcon";

export interface EssayQuestionPaperRendererProps {
  questionNumber: number;
  stemText: string;
  points?: number; // default 40
  structureType?: "single_complete" | "multi_part" | "short_notes" | "single_essay" | "subparts";
  instruction?: string;
  subparts?: EssaySubpart[];
  criteria?: EssayAnswerPoint[];
  markingScheme?: string;
  examinerNotes?: string;
  diagramUrl?: string;
  requiresImage?: boolean;
  imageDescription?: string;
  showTeacherGuide?: boolean;
}

/**
 * Authentic Examination Paper Renderer for Sri Lankan G.C.E. A/L Biology Paper II Part B (Essay Questions).
 * Strictly preserves structural hierarchy, derived numbering (i, ii, a, b), and clean mark displays.
 */
export default function EssayQuestionPaperRenderer({
  questionNumber,
  stemText,
  points = 40,
  structureType = "single_complete",
  instruction = "Write short notes on the following:",
  subparts = [],
  criteria = [],
  markingScheme,
  examinerNotes,
  diagramUrl,
  imageDescription,
  showTeacherGuide = false,
}: EssayQuestionPaperRendererProps) {
  const [showRubricDetails, setShowRubricDetails] = useState(showTeacherGuide);

  const isMultiPart = structureType === "multi_part" || structureType === "subparts";
  const isShortNotes = structureType === "short_notes";

  // Helper to render authentic exam dotted lines for student writing space
  const renderDottedLines = (lineCount = 6) => {
    const lines = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(
        <div
          key={i}
          style={{
            borderBottom: "1px dotted #94a3b8",
            height: "26px",
            width: "100%",
          }}
        />
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", margin: "0.6rem 0" }}>
        {lines}
      </div>
    );
  };

  // Recursive Subpart Hierarchy Renderer (Level 1 Roman (i), Level 2 Alphabetical (a))
  const renderSubpartHierarchy = (nodes: EssaySubpart[], depth = 0) => {
    if (!nodes || nodes.length === 0) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: depth === 0 ? "1.25rem" : "0.85rem" }}>
        {nodes.map((sub, idx) => {
          const subMarks = calculateSubpartMarks(sub);
          const hasChildren = sub.children && sub.children.length > 0;
          const cleanPrompt = stripLeadingNumberingPrefix(sub.prompt);

          return (
            <div
              key={sub.id || idx}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                paddingLeft: depth > 0 ? "1.4rem" : "0",
                borderLeft: depth > 0 ? "2px solid rgba(99, 102, 241, 0.2)" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ fontSize: depth === 0 ? "0.98rem" : "0.92rem", lineHeight: 1.5, color: "var(--text-primary)" }}>
                  <strong
                    style={{
                      color: "var(--accent-primary)",
                      marginRight: "0.45rem",
                      fontSize: depth === 0 ? "1.05rem" : "0.95rem",
                      fontWeight: 800,
                    }}
                  >
                    {sub.label || (depth === 0 ? `(${idx + 1})` : `(${String.fromCharCode(97 + idx)})`)}
                  </strong>
                  <span>{normalizeScientificSymbols(cleanPrompt)}</span>
                </div>

                {subMarks > 0 && (
                  <span
                    style={{
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    [{subMarks} marks]
                  </span>
                )}
              </div>

              {/* If child subparts exist, render them recursively. Otherwise render student dotted lines */}
              {hasChildren ? (
                <div style={{ marginTop: "0.5rem" }}>
                  {renderSubpartHierarchy(sub.children!, depth + 1)}
                </div>
              ) : (
                renderDottedLines(depth === 0 ? 5 : 4)
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="essay-paper-renderer"
      style={{
        padding: "1.75rem",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        border: "1.5px solid var(--border)",
        color: "var(--text-primary)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
      }}
    >
      {/* 1. QUESTION HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "2px solid var(--text-primary)",
          paddingBottom: "0.6rem",
          marginBottom: "1rem",
        }}
      >
        <div>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-primary)", display: "block" }}>
            Paper II Part B — Essay
          </span>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: "0.2rem 0 0 0", color: "var(--text-primary)" }}>
            Question {questionNumber}
          </h3>
        </div>

        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 800,
              fontFamily: "monospace",
              color: "var(--accent-primary)",
              padding: "0.2rem 0.6rem",
              background: "var(--bg-secondary)",
              borderRadius: "4px",
              border: "1px solid var(--border)",
            }}
          >
            [{points} marks]
          </span>
        </div>
      </div>

      {/* 2. INSTRUCTION OR STEM TEXT */}
      {isShortNotes && instruction && (
        <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
          {normalizeScientificSymbols(instruction)}
        </div>
      )}

      {stemText && !isShortNotes && (
        <div
          style={{
            fontSize: "1.02rem",
            lineHeight: 1.6,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "1rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {normalizeScientificSymbols(stripLeadingNumberingPrefix(stemText))}
        </div>
      )}

      {/* 3. ATTACHED DIAGRAM / REFERENCE MATERIAL PREVIEW */}
      {diagramUrl && (
        <div style={{ margin: "1rem 0", textAlign: "center" }}>
          <img
            src={resolveDiagramImageUrl(diagramUrl)}
            alt={`Reference diagram for Question ${questionNumber}`}
            style={{
              maxWidth: "100%",
              maxHeight: "260px",
              objectFit: "contain",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "#fff",
            }}
          />
          {imageDescription && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic" }}>
              Figure {questionNumber}.1: {normalizeScientificSymbols(imageDescription)}
            </div>
          )}
        </div>
      )}

      {/* 4. HIERARCHICAL SUBPARTS RENDERING WITH EXAM WRITING SPACES */}
      {(isMultiPart || isShortNotes) && subparts && subparts.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          {renderSubpartHierarchy(subparts, 0)}
        </div>
      ) : (
        /* Single Essay General Answer Writing Space */
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", marginBottom: "0.5rem" }}>
            [Answer space for Question {questionNumber} — Use structured biological prose, chemical equations, and labeled diagrams]
          </div>
          {renderDottedLines(10)}
        </div>
      )}

      {/* 5. TEACHER / EXAMINER REFERENCE ACCORDION */}
      {((criteria && criteria.length > 0) || markingScheme || examinerNotes || subparts.some(s => s.marking_scheme || (s.answer_points && s.answer_points.length > 0) || (s.children && s.children.length > 0))) && (
        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1rem",
            borderTop: "1px dashed var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
              onClick={() => setShowRubricDetails(!showRubricDetails)}
            >
              <SvgIcon name="file-text" size={14} />
              {showRubricDetails ? "Hide Marking Scheme & Examiner Notes" : "View Marking Scheme & Examiner Notes"}
            </button>
            <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>Teacher / Examiner Reference</span>
          </div>

          {showRubricDetails && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              {/* Itemized Answer Points for Single Complete */}
              {criteria && criteria.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--accent-primary)" }}>
                    Answer Points:
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {criteria.map((c, i) => (
                      <div
                        key={c.id || i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "30px 1fr 70px",
                          gap: "0.5rem",
                          alignItems: "center",
                          padding: "0.4rem 0.6rem",
                          background: "var(--bg-card)",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          fontSize: "0.82rem",
                        }}
                      >
                        <span style={{ fontWeight: 800, color: "var(--accent-primary)" }}>#{c.item_number || i + 1}</span>
                        <div>
                          <span>{normalizeScientificSymbols(c.description)}</span>
                          {c.accepted_alternatives && (
                            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Alt: {normalizeScientificSymbols(c.accepted_alternatives)}
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700, textAlign: "right", color: "var(--accent-primary)", fontFamily: "monospace" }}>
                          {c.marks} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Marking Scheme for Single Complete */}
              {markingScheme && (
                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--text-primary)" }}>
                    Marking Scheme Guidance:
                  </h4>
                  <div style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    {normalizeScientificSymbols(markingScheme)}
                  </div>
                </div>
              )}

              {/* Subparts Answer Points and Marking Scheme */}
              {(isMultiPart || isShortNotes) && subparts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--accent-primary)" }}>
                    Subparts Answer Points &amp; Marking Schemes:
                  </h4>
                  {subparts.map((s, idx) => (
                    <div key={s.id || idx} style={{ padding: "0.6rem 0.75rem", background: "var(--bg-card)", borderRadius: "4px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--accent-primary)" }}>
                        {s.label} {normalizeScientificSymbols(stripLeadingNumberingPrefix(s.prompt))}
                      </div>

                      {s.answer_points && s.answer_points.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.2rem" }}>
                          {s.answer_points.map((p, pi) => (
                            <div key={p.id || pi} style={{ fontSize: "0.78rem", display: "flex", justifyContent: "space-between", color: "var(--text-primary)" }}>
                              <span>#{p.item_number || pi + 1}. {normalizeScientificSymbols(p.description)}</span>
                              <strong style={{ color: "var(--accent-primary)" }}>{p.marks} pts</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {s.marking_scheme && (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4, marginTop: "0.2rem" }}>
                          <strong>Marking Scheme:</strong> {normalizeScientificSymbols(s.marking_scheme)}
                        </div>
                      )}

                      {/* Nested Children in Rubric */}
                      {s.children && s.children.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingLeft: "1rem", borderLeft: "2px solid rgba(99, 102, 241, 0.2)", marginTop: "0.3rem" }}>
                          {s.children.map((child, cIdx) => (
                            <div key={child.id || cIdx} style={{ fontSize: "0.8rem" }}>
                              <div style={{ fontWeight: 700, color: "var(--accent-primary)" }}>
                                {child.label} {normalizeScientificSymbols(stripLeadingNumberingPrefix(child.prompt))}
                              </div>
                              {child.answer_points && child.answer_points.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.15rem" }}>
                                  {child.answer_points.map((cp, cpi) => (
                                    <div key={cp.id || cpi} style={{ fontSize: "0.76rem", display: "flex", justifyContent: "space-between" }}>
                                      <span>#{cp.item_number || cpi + 1}. {normalizeScientificSymbols(cp.description)}</span>
                                      <strong>{cp.marks} pts</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Examiner Notes */}
              {examinerNotes && (
                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--warning)" }}>
                    Examiner Notes (Optional Guidance):
                  </h4>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {normalizeScientificSymbols(examinerNotes)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
