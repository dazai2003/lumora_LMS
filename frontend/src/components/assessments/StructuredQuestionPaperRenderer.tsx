"use client";

import React, { useState } from "react";
import { resolveDiagramImageUrl } from "@/lib/api";
import { formatDisplayLabel, StructuredNode } from "@/lib/alStructuredTreeUtils";
import SvgIcon from "@/components/SvgIcon";

interface StructuredQuestionPaperRendererProps {
  questionNumber: number;
  stemText: string;
  parts: StructuredNode[] | any[];
  diagramUrl?: string;
  points?: number;
  showAnswers?: boolean;
}

export default function StructuredQuestionPaperRenderer({
  questionNumber,
  stemText,
  parts = [],
  diagramUrl,
  points = 40,
  showAnswers = false,
}: StructuredQuestionPaperRendererProps) {
  const [revealSolutions, setRevealSolutions] = useState<boolean>(showAnswers);
  const finalMarks = Math.round(points * 2.5 * 10) / 10;

  const renderDottedLines = (pts: number = 2) => {
    const lineCount = Math.max(1, Math.min(6, Math.ceil(pts * 1.1)));
    return (
      <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {Array.from({ length: lineCount }).map((_, idx) => (
          <div
            key={idx}
            style={{
              borderBottom: "1px dotted var(--border, #cbd5e1)",
              height: "1.1rem",
              width: "100%",
            }}
          />
        ))}
      </div>
    );
  };

  const renderPartNodes = (nodes: any[], level = 0) => {
    if (!nodes || nodes.length === 0) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: level === 0 ? "1.5rem" : "1rem", marginTop: level === 0 ? "1rem" : "0.75rem" }}>
        {nodes.map((node: any, idx: number) => {
          const isLeaf = !node.children || node.children.length === 0;
          const displayLabel = formatDisplayLabel(node.label, level, idx);
          const hasPrompt = Boolean(node.prompt && node.prompt.trim());

          return (
            <div
              key={node.id || `${level}-${idx}-${node.label}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
                paddingLeft: level > 0 ? `${Math.min(level, 4) * 1.25}rem` : 0,
              }}
            >
              {/* Section Header (Level 0 without prompt) */}
              {level === 0 && !hasPrompt && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: "0.35rem",
                    borderBottom: "1.5px solid rgba(99, 102, 241, 0.25)",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                    Part {displayLabel}
                  </span>
                  {node.points && (
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", fontFamily: "monospace" }}>
                      [{node.points} {node.points === 1 ? "pt" : "pts"}]
                    </span>
                  )}
                </div>
              )}

              {/* Question Label & Prompt */}
              {(level > 0 || hasPrompt) && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div style={{ fontSize: "0.95rem", lineHeight: 1.55, color: "var(--text-primary)" }}>
                    <strong style={{ color: "var(--accent-primary)", marginRight: "0.45rem", fontWeight: 800 }}>
                      {displayLabel}
                    </strong>
                    <span>{node.prompt}</span>
                  </div>

                  {isLeaf && Boolean(node.points) && (
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        fontFamily: "monospace",
                        background: "var(--bg-secondary)",
                        padding: "0.15rem 0.45rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      [{node.points} {node.points === 1 ? "pt" : "pts"}]
                    </span>
                  )}
                </div>
              )}

              {/* Node Diagram Image */}
              {(node.diagram_info?.image_url || (level === 0 && diagramUrl)) && (
                <div style={{ margin: "0.6rem 0", textAlign: "center" }}>
                  <img
                    src={resolveDiagramImageUrl(node.diagram_info?.image_url || diagramUrl)}
                    alt={`Diagram for Question ${questionNumber} ${displayLabel}`}
                    style={{
                      maxWidth: "420px",
                      maxHeight: "260px",
                      objectFit: "contain",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  />
                  {node.diagram_info?.image_description && (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic" }}>
                      {node.diagram_info.image_description}
                    </p>
                  )}
                </div>
              )}

              {/* Comparison Format Table */}
              {node.comparison_pairs && node.comparison_pairs.length > 0 && (
                <div style={{ margin: "0.6rem 0", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: "1.5px solid var(--border)", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)" }}>
                        <th style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 700 }}>Feature / Criterion</th>
                        <th style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 700 }}>{node.comparison_header_1 || "Structure A"}</th>
                        <th style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 700 }}>{node.comparison_header_2 || "Structure B"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.comparison_pairs.map((cp: any, cpi: number) => (
                        <tr key={cpi}>
                          <td style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", fontWeight: 600 }}>{cp.criterion}</td>
                          <td style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", minHeight: "2.2rem" }}>
                            {revealSolutions ? (
                              <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>{cp.value_1 || cp.left}</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)", letterSpacing: "2px" }}>........................................</span>
                            )}
                          </td>
                          <td style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", minHeight: "2.2rem" }}>
                            {revealSolutions ? (
                              <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>{cp.value_2 || cp.right}</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)", letterSpacing: "2px" }}>........................................</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sequential Flow Format */}
              {node.sequence_items && node.sequence_items.length > 0 && (
                <div style={{ margin: "0.6rem 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                  {node.sequence_items.map((s: string, si: number) => (
                    <React.Fragment key={si}>
                      <div
                        style={{
                          padding: "0.45rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <strong style={{ color: "var(--accent-primary)", marginRight: "0.3rem" }}>Step {si + 1}:</strong>
                        {revealSolutions ? (
                          <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>{s}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", letterSpacing: "1px" }}>[ .................... ]</span>
                        )}
                      </div>
                      {si < node.sequence_items.length - 1 && (
                        <span style={{ fontSize: "1.1rem", color: "var(--text-muted)", fontWeight: 700 }}>➔</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Matrix Matching Table */}
              {(node.matrix_data?.rows || node.table_data) && (
                <div style={{ margin: "0.6rem 0", overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      border: "1.5px solid var(--border)",
                      fontSize: "0.88rem",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)" }}>
                        {(node.matrix_data?.col_headers || node.table_data?.headers || ["Biological Item", "Expected Classification / Function"]).map((h: string, hIdx: number) => (
                          <th
                            key={hIdx}
                            style={{
                              border: "1px solid var(--border)",
                              padding: "0.5rem 0.75rem",
                              textAlign: "left",
                              fontWeight: 700,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(node.matrix_data?.rows || node.table_data?.rows || []).map((row: any, rIdx: number) => {
                        const isMatrixObj = Boolean(row && typeof row === "object" && "item" in row);
                        return (
                          <tr key={rIdx}>
                            {isMatrixObj ? (
                              <>
                                <td style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", fontWeight: 600 }}>{row.item}</td>
                                <td style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem" }}>
                                  {revealSolutions ? (
                                    <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>{row.expected}</span>
                                  ) : (
                                    <span style={{ color: "var(--text-muted)", letterSpacing: "2px" }}>........................................</span>
                                  )}
                                </td>
                              </>
                            ) : (
                              (Array.isArray(row) ? row : []).map((cell: string, cIdx: number) => (
                                <td
                                  key={cIdx}
                                  style={{
                                    border: "1px solid var(--border)",
                                    padding: "0.5rem 0.75rem",
                                  }}
                                >
                                  {cell || <span style={{ color: "var(--text-muted)", letterSpacing: "2px" }}>........................................</span>}
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Labelled Biological Drawing Box */}
              {(node.format_type === "structured_drawing" || node.drawing_prompt) && (
                <div
                  style={{
                    margin: "0.75rem 0",
                    height: "170px",
                    width: "100%",
                    borderRadius: "var(--radius-md)",
                    border: "2px dashed var(--border)",
                    background: "var(--bg-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--accent-primary)" }}>
                    <SvgIcon name="sparkle" size={16} />
                    <span>[ Student Biological Drawing Area ]</span>
                  </div>
                  {node.drawing_prompt && (
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {node.drawing_prompt}
                    </span>
                  )}
                  {node.required_labels && node.required_labels.length > 0 && (
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Required labels: {node.required_labels.join(", ")}
                    </span>
                  )}
                </div>
              )}

              {/* Dotted Student Answer Lines for Paper View */}
              {isLeaf && !node.comparison_pairs && !node.sequence_items && !node.matrix_data && !node.table_data && node.format_type !== "structured_drawing" && (
                renderDottedLines(node.points || 2)
              )}

              {/* Model Solution Preview (When toggled) */}
              {revealSolutions && (
                <div
                  style={{
                    marginTop: "0.4rem",
                    padding: "0.6rem 0.85rem",
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.82rem",
                  }}
                >
                  {node.model_answer && (
                    <div style={{ marginBottom: node.marking_points?.length ? "0.35rem" : 0 }}>
                      <strong style={{ color: "var(--success, #10b981)" }}>Expected Answer: </strong>
                      <span style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{node.model_answer}</span>
                    </div>
                  )}
                  {node.marking_points && node.marking_points.length > 0 && (
                    <div style={{ marginTop: "0.25rem" }}>
                      <strong style={{ color: "var(--success, #10b981)", display: "block", marginBottom: "0.2rem" }}>Marking Criteria:</strong>
                      <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        {node.marking_points.map((mp: any, mpi: number) => (
                          <li key={mpi} style={{ color: "var(--text-primary)" }}>
                            <span style={{ fontWeight: 700, color: "var(--success, #10b981)" }}>● {mp.points} pt{mp.points > 1 ? "s" : ""} — </span>
                            <span>{mp.criterion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Recursive Children Parts */}
              {node.children && node.children.length > 0 && renderPartNodes(node.children, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.5rem",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Question Main Title & Marks Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid var(--border)",
          paddingBottom: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
            QUESTION {questionNumber < 10 ? `0${questionNumber}` : questionNumber}
          </h3>
          <span className="badge badge-secondary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
            Structured Essay
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: "0.25rem 0.65rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              cursor: "pointer",
            }}
            onClick={() => setRevealSolutions(!revealSolutions)}
          >
            <SvgIcon name={revealSolutions ? "eye-off" : "eye"} size={13} />
            <span>{revealSolutions ? "Hide Solutions" : "Reveal Solutions"}</span>
          </button>

          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 800,
              color: "var(--accent-primary)",
              background: "var(--accent-subtle, rgba(99, 102, 241, 0.1))",
              padding: "0.25rem 0.65rem",
              borderRadius: "var(--radius-sm)",
              whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}
          >
            [{points} Raw Pts · {finalMarks} MARKS]
          </span>
        </div>
      </div>

      {/* Main Context / Stem Text */}
      {stemText && stemText.trim() && (
        <div
          style={{
            padding: "0.85rem 1rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            marginBottom: "1rem",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "var(--text-primary)",
          }}
        >
          {stemText}
        </div>
      )}

      {/* Main Diagram URL Preview if provided at root */}
      {diagramUrl && (
        <div style={{ margin: "1rem 0", textAlign: "center" }}>
          <img
            src={resolveDiagramImageUrl(diagramUrl)}
            alt={`Diagram for Question ${questionNumber}`}
            style={{
              maxWidth: "480px",
              maxHeight: "280px",
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          />
        </div>
      )}

      {/* Render Structured Question Parts Hierarchy */}
      {renderPartNodes(parts)}
    </div>
  );
}
