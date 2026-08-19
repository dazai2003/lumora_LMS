"use client";

import React, { useState, useMemo } from "react";
import SvgIcon from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import api, { resolveDiagramImageUrl } from "@/lib/api";
import { StructuredContentAuthoringForm, StructuredSkeletonBuilder } from "./StructuredQuestionEditor";
import { getStructureSummary, calculateTotalTreeRawPoints, StructuredNode } from "@/lib/alStructuredTreeUtils";

export interface StructuredCandidateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: any[];
  onBatchAccept: (acceptedCandidates: any[]) => Promise<void>;
  addToast?: (msg: string, type?: "success" | "error" | "info") => void;
  courseId?: number;
  unitIds?: number[];
}

export default function StructuredCandidateReviewModal({
  isOpen,
  onClose,
  candidates: initialCandidates = [],
  onBatchAccept,
  addToast,
  courseId,
  unitIds,
}: StructuredCandidateReviewModalProps) {
  const [candidates, setCandidates] = useState<any[]>(initialCandidates);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [editing, setEditing] = useState<boolean>(false);
  const [editStem, setEditStem] = useState<string>("");
  const [editNodes, setEditNodes] = useState<StructuredNode[]>([]);
  const [builderModalOpen, setBuilderModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<"all" | "ready" | "needs_image" | "accepted" | "rejected" | "issues">("all");

  const currentCand = candidates[selectedIdx] || candidates[0];

  // Dynamic filter counts
  const allCount = candidates.length;
  const readyCount = candidates.filter(
    (c) => c.status !== "rejected" && c.status !== "generation_issue" && c.is_valid !== false && !c.requires_image && !(c.diagram_info && c.diagram_info.requires_image)
  ).length;
  const needsImgCount = candidates.filter((c) => c.requires_image || (c.diagram_info && c.diagram_info.requires_image)).length;
  const acceptedCount = candidates.filter((c) => c.status === "accepted").length;
  const rejectedCount = candidates.filter((c) => c.status === "rejected").length;
  const issuesCount = candidates.filter((c) => c.status === "generation_issue" || !c.is_valid).length;

  // Filtered candidate list preserving original candidate indexes
  const indexedCandidates = useMemo(() => {
    return candidates.map((cand, origIdx) => ({ cand, origIdx }));
  }, [candidates]);

  const filteredIndexedCandidates = useMemo(() => {
    return indexedCandidates.filter(({ cand }) => {
      if (filterTab === "ready") {
        return (
          cand.status !== "rejected" &&
          cand.status !== "generation_issue" &&
          cand.is_valid !== false &&
          !cand.requires_image &&
          !(cand.diagram_info && cand.diagram_info.requires_image)
        );
      }
      if (filterTab === "needs_image") return cand.requires_image || (cand.diagram_info && cand.diagram_info.requires_image);
      if (filterTab === "accepted") return cand.status === "accepted";
      if (filterTab === "rejected") return cand.status === "rejected";
      if (filterTab === "issues") return cand.status === "generation_issue" || !cand.is_valid;
      return true;
    });
  }, [indexedCandidates, filterTab]);

  if (!isOpen || candidates.length === 0) return null;

  const handleToggleAccept = (idx: number) => {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const nextStatus = c.status === "accepted" ? "validated" : "accepted";
        return { ...c, status: nextStatus };
      })
    );
  };

  const handleRejectCandidate = (idx: number) => {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        return { ...c, status: "rejected" };
      })
    );
  };

  const handleDiagramUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const res = await api.uploadQuestionDiagram(file);
      setCandidates((prev) =>
        prev.map((c, i) => (i === selectedIdx ? { ...c, diagram_url: res.image_url, requires_image: false } : c))
      );
      if (addToast) addToast("Diagram uploaded and attached successfully!", "success");
    } catch (err: any) {
      console.error("Failed to upload diagram", err);
      if (addToast) addToast(err?.message || "Failed to upload diagram image", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRegenerateCurrentCandidate = async () => {
    setRegenerating(true);
    try {
      const updated = await api.regenerateStructuredCandidate({
        candidate: currentCand,
        course_id: courseId,
        unit_ids: unitIds,
        difficulty_mode: currentCand.difficulty,
        cognitive_mode: currentCand.cognitive_level,
      });

      if (updated) {
        const isValid = updated.is_valid !== false && (!updated.validation_errors || updated.validation_errors.length === 0);
        setCandidates((prev) =>
          prev.map((c, i) =>
            i === selectedIdx
              ? {
                  ...updated,
                  status: isValid ? "validated" : "generation_issue",
                  is_valid: isValid,
                  validation_errors: updated.validation_errors || [],
                  validation_warnings: updated.validation_warnings || [],
                }
              : c
          )
        );

        if (isValid) {
          if (addToast) addToast(`Question ${selectedIdx + 1} successfully regenerated and verified!`, "success");
        } else {
          if (addToast) addToast(updated.validation_errors?.[0] || "Question regenerated with minor validation warnings.", "info");
        }
      }
    } catch (err: any) {
      console.error("Failed to regenerate candidate", err);
      if (addToast) addToast(err?.message || "Failed to regenerate candidate question.", "error");
    } finally {
      setRegenerating(false);
    }
  };

  const handleAcceptAllReady = async () => {
    const readyCandidates = candidates.filter((c) => c.status !== "rejected" && c.status !== "generation_issue" && c.is_valid !== false);
    if (readyCandidates.length === 0) {
      if (addToast) addToast("No valid candidates ready for acceptance.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await onBatchAccept(readyCandidates);
      if (addToast) addToast(`${readyCandidates.length} structured questions accepted into Paper 2A.`, "success");
      onClose();
    } catch (err: any) {
      console.error("Batch accept failed", err);
      if (addToast) addToast(err?.message || "Failed to batch accept candidates.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDisplayLabel = (label: string): string => {
    if (!label) return "";
    const trimmed = label.trim();
    if (trimmed.endsWith(".") || trimmed.endsWith(")") || trimmed.startsWith("(")) {
      return trimmed;
    }
    return `${trimmed}.`;
  };

  const calculateSubpartPoints = (node: any): number => {
    if (node.children && node.children.length > 0) {
      return node.children.reduce((sum: number, c: any) => sum + calculateSubpartPoints(c), 0);
    }
    return Number(node.points) || 0;
  };

  // Render un-truncated question hierarchy
  const renderPartHierarchyPreview = (parts: any[]) => {
    if (!parts || parts.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {parts.map((p: any) => {
          const pPoints = calculateSubpartPoints(p);
          const hasChildren = p.children && p.children.length > 0;
          return (
            <div
              key={p.id || p.label}
              style={{
                padding: "1.1rem 1.25rem",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                    {formatDisplayLabel(p.label)}
                  </span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {p.prompt || "[Section Prompt]"}
                  </span>
                </div>
                <span className="badge badge-primary" style={{ fontSize: "0.8rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {pPoints} pts
                </span>
              </div>

              {/* Expected Model Answer */}
              {p.model_answer && (
                <div style={{ padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border)", fontSize: "0.86rem", marginTop: "0.6rem" }}>
                  <strong style={{ color: "var(--accent-primary)", display: "block", marginBottom: "0.25rem", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>Expected Model Answer:</strong>
                  <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)", lineHeight: 1.6 }}>
                    {p.model_answer}
                  </div>
                </div>
              )}

              {/* Real Itemized Marking Scheme Criteria */}
              {p.marking_points && p.marking_points.length > 0 && (
                <div style={{ padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", background: "rgba(16, 185, 129, 0.07)", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "0.84rem", marginTop: "0.6rem" }}>
                  <strong style={{ color: "var(--success)", display: "block", marginBottom: "0.35rem", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>Official Marking Scheme Criteria:</strong>
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {p.marking_points.map((mp: any, mpi: number) => (
                      <li key={mpi}>
                        <span style={{ fontWeight: 800, color: "var(--success)" }}>+{mp.points} pt{mp.points > 1 ? "s" : ""} &mdash; </span>
                        <span style={{ color: "var(--text-primary)" }}>{mp.criterion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Side-by-Side Comparison Pairs */}
              {p.comparison_pairs && p.comparison_pairs.length > 0 && (
                <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "0.5rem", fontWeight: 700, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <span>Feature / Criterion</span>
                    <span>{p.comparison_header_1 || "Entity 1"}</span>
                    <span>{p.comparison_header_2 || "Entity 2"}</span>
                  </div>
                  {p.comparison_pairs.map((cp: any, cpi: number) => (
                    <div key={cpi} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "0.5rem", padding: "0.45rem 0.65rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", border: "1px solid var(--border)" }}>
                      <span><strong>{cp.criterion}</strong></span>
                      <span>{cp.value_1 || cp.left}</span>
                      <span>{cp.value_2 || cp.right}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sequential Steps */}
              {p.sequence_items && p.sequence_items.length > 0 && (
                <div style={{ marginTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {p.sequence_items.map((s: string, si: number) => (
                    <div key={si} style={{ padding: "0.4rem 0.75rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", border: "1px solid var(--border)" }}>
                      <strong style={{ color: "var(--accent-primary)" }}>Step {si + 1}:</strong> {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Matrix Table */}
              {p.matrix_data && p.matrix_data.rows && (
                <div style={{ marginTop: "0.65rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr>
                        {(p.matrix_data.col_headers || ["Item", "Expected Match"]).map((h: string, hi: number) => (
                          <th key={hi} style={{ border: "1px solid var(--border)", padding: "0.5rem 0.75rem", background: "var(--bg-card)", textAlign: "left", fontWeight: 700 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.matrix_data.rows.map((row: any, ri: number) => (
                        <tr key={ri}>
                          <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.75rem" }}>{row.item}</td>
                          <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.75rem" }}>{row.expected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Drawing Prompt */}
              {p.drawing_prompt && (
                <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", border: "1px solid var(--border)" }}>
                  <strong>Drawing Requirement:</strong> {p.drawing_prompt}
                  {p.required_labels && p.required_labels.length > 0 && (
                    <div style={{ marginTop: "0.35rem" }}>
                      <strong>Required Labels:</strong> {p.required_labels.join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* Recursive Children Subparts */}
              {hasChildren && (
                <div style={{ marginTop: "0.9rem", paddingLeft: "1.25rem", borderLeft: "2.5px solid var(--accent-primary)" }}>
                  {renderPartHierarchyPreview(p.children)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100, background: "rgba(0, 0, 0, 0.8)", backdropFilter: "blur(4px)" }}>
      {/* EXPANSIVE MAIN WORKSPACE CONTAINER */}
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "1560px",
          width: "98vw",
          padding: "1.5rem 1.75rem",
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--text-primary)" }}>
              <SvgIcon name="sparkle" size={22} style={{ color: "var(--accent-primary)" }} />
              AI Structured Question Review Workspace
            </h2>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem", display: "block" }}>
              G.C.E. Advanced Level Paper II Part A &bull; {candidates.length} Questions &bull; {candidates.reduce((sum, c) => sum + (c.points || 40), 0)} Raw Points ({candidates.reduce((sum, c) => sum + (c.points || 40), 0) * 2.5} Scaled Marks)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Primary Batch Acceptance Button */}
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: "0.6rem 1.4rem",
                fontSize: "0.92rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
              onClick={handleAcceptAllReady}
              disabled={submitting || readyCount === 0}
            >
              <SvgIcon name="check" size={18} />
              <span>{submitting ? "Accepting Questions..." : `Accept All Ready (${readyCount})`}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "0.55rem 0.85rem", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={onClose}
              disabled={submitting}
              title="Close Review"
            >
              <SvgIcon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* 3-Pane Expansive Review Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr) 340px", gap: "1.25rem", height: "82vh" }}>
          
          {/* Left Sidebar: Question Navigation & Working Filter Tabs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "1rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {/* Working Filter Tabs */}
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`btn ${filterTab === "all" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem" }}
              >
                All ({allCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("ready")}
                className={`btn ${filterTab === "ready" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem" }}
              >
                Ready ({readyCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("needs_image")}
                className={`btn ${filterTab === "needs_image" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem" }}
              >
                Needs Img ({needsImgCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("accepted")}
                className={`btn ${filterTab === "accepted" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem" }}
              >
                Accepted ({acceptedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("issues")}
                className={`btn ${filterTab === "issues" ? "btn-primary" : "btn-secondary"}`}
                style={{
                  fontSize: "0.74rem",
                  padding: "0.25rem 0.55rem",
                  color: issuesCount > 0 && filterTab !== "issues" ? "var(--danger)" : undefined,
                  borderColor: issuesCount > 0 && filterTab !== "issues" ? "rgba(239, 68, 68, 0.5)" : undefined,
                }}
              >
                Issues ({issuesCount})
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
              <span style={{ fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Questions ({filteredIndexedCandidates.length} of {candidates.length})
              </span>
            </div>

            {filteredIndexedCandidates.length === 0 ? (
              <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border)" }}>
                <p style={{ margin: "0 0 0.75rem 0" }}>No questions match the "{filterTab}" filter.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setFilterTab("all")}
                >
                  Show All Questions ({allCount})
                </button>
              </div>
            ) : (
              filteredIndexedCandidates.map(({ cand, origIdx }) => {
                const isSelected = origIdx === selectedIdx;
                const isAccepted = cand.status === "accepted";
                const isRejected = cand.status === "rejected";
                const isIssue = cand.status === "generation_issue" || !cand.is_valid;
                const needsImg = cand.requires_image || (cand.diagram_info && cand.diagram_info.requires_image);
                const points = cand.points || calculateTotalTreeRawPoints(cand.structured_subparts_json || []);
                const partsCount = (cand.structured_subparts_json || []).reduce((acc: number, sec: any) => acc + (sec.children?.length || 1), 0);

                return (
                  <div
                    key={cand.candidate_id || origIdx}
                    style={{
                      padding: "0.85rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "var(--accent-subtle, rgba(99, 102, 241, 0.14))" : "var(--bg-secondary)",
                      border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                      transition: "all 0.15s ease",
                    }}
                    onClick={() => {
                      setSelectedIdx(origIdx);
                      setEditing(false);
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.92rem", color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}>
                        Question {origIdx + 1}
                      </span>
                      <span
                        className={`badge ${
                          isAccepted
                            ? "badge-success"
                            : isRejected
                            ? "badge-danger"
                            : isIssue
                            ? "badge-danger"
                            : needsImg
                            ? "badge-warning"
                            : "badge-info"
                        }`}
                        style={{ fontSize: "0.7rem", fontWeight: 700 }}
                      >
                        {isAccepted ? "Accepted" : isRejected ? "Rejected" : isIssue ? "Issue" : needsImg ? "Needs Img" : "Ready"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {cand.stem_text ? cand.stem_text.slice(0, 60) + "..." : "Structured Question"}
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.35rem" }}>
                      <span><strong>{points} / 40 pts</strong> ({points * 2.5}m)</span>
                      <span>{partsCount} parts</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Center Viewport: Expansive Question Hierarchy or Inline Editor */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              padding: "1.5rem 1.75rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            {/* Header with Title and Edit toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border)", paddingBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <span className="badge badge-purple" style={{ fontWeight: 800, marginBottom: "0.35rem" }}>
                  Question {selectedIdx + 1} of {candidates.length}
                </span>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "0.25rem 0 0 0", color: "var(--text-primary)", lineHeight: 1.5 }}>
                  {currentCand.stem_text || "Structured Question"}
                </h3>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  Theme: <strong>{currentCand.theme || "Sri Lankan G.C.E. A/L Biology"}</strong> &bull; 40.0 Raw Points &bull; Scaled 100 Marks
                </span>
              </div>

              <button
                type="button"
                className={`btn ${editing ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.85rem", padding: "0.45rem 1rem", display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                onClick={() => {
                  if (!editing) {
                    setEditStem(currentCand.stem_text || "");
                    setEditNodes(currentCand.structured_subparts_json || []);
                  }
                  setEditing(!editing);
                }}
              >
                <SvgIcon name="edit" size={16} /> {editing ? "View Hierarchy Preview" : "Edit Subparts"}
              </button>
            </div>

            {/* Generation Issue Alert */}
            {(!currentCand.is_valid || currentCand.status === "generation_issue") && (
              <div style={{ padding: "1rem 1.25rem", borderRadius: "var(--radius-sm)", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", fontSize: "0.86rem", color: "var(--danger)" }}>
                <strong style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                  <SvgIcon name="alert-triangle" size={16} /> Validation Notice:
                </strong>
                <ul style={{ margin: "0.4rem 0 0 0", paddingLeft: "1.3rem", lineHeight: 1.5 }}>
                  {(currentCand.validation_errors || ["Validation review required"]).map((err: string, ei: number) => (
                    <li key={ei}>{err}</li>
                  ))}
                </ul>
                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: "0.82rem", padding: "0.4rem 1rem", fontWeight: 700 }}
                    onClick={handleRegenerateCurrentCandidate}
                    disabled={regenerating}
                  >
                    {regenerating ? "Regenerating..." : "Regenerate This Question"}
                  </button>
                </div>
              </div>
            )}

            {!editing ? (
              /* FULL UN-TRUNCATED HIERARCHY PREVIEW */
              renderPartHierarchyPreview(currentCand.structured_subparts_json || [])
            ) : (
              /* INTERACTIVE SUBPART EDITOR */
              <StructuredContentAuthoringForm
                questionNumber={selectedIdx + 1}
                stemText={editStem}
                onChangeStemText={setEditStem}
                nodes={editNodes}
                onChangeNodes={setEditNodes}
                onOpenStructureBuilder={() => setBuilderModalOpen(true)}
                onSaveQuestion={() => {
                  const summary = getStructureSummary(editNodes);
                  setCandidates((prev) =>
                    prev.map((c, i) =>
                      i === selectedIdx
                        ? {
                            ...c,
                            stem_text: editStem,
                            structured_subparts_json: editNodes,
                            points: summary.totalRawPoints,
                            is_valid: !summary.isOverAllocated,
                            status: "validated",
                          }
                        : c
                    )
                  );
                  setEditing(false);
                  if (addToast) addToast("Candidate updated successfully!", "success");
                }}
                onResetForm={() => setEditing(false)}
              />
            )}
          </div>

          {/* Right Panel: Metadata, Diagram Upload, & Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.1rem",
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              overflowY: "auto",
            }}
          >
            <span style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Question Blueprint Specs
            </span>

            {/* Metadata Card */}
            <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Total Points:</span>
                <strong>{currentCand.points || 40} / 40 pts</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Scaled Marks:</span>
                <strong style={{ color: "var(--accent-primary)" }}>{(currentCand.points || 40) * 2.5} marks</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Difficulty:</span>
                <strong style={{ textTransform: "capitalize" }}>{currentCand.difficulty || "balanced"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Cognitive Level:</span>
                <strong style={{ textTransform: "capitalize" }}>{currentCand.cognitive_level || "understand"}</strong>
              </div>
            </div>

            {/* IMAGE REQUIRED PANEL */}
            {(currentCand.requires_image || (currentCand.diagram_info && currentCand.diagram_info.requires_image)) && (
              <div style={{ padding: "1rem", borderRadius: "var(--radius-sm)", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.35)", fontSize: "0.84rem" }}>
                <div style={{ fontWeight: 800, color: "var(--warning)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <SvgIcon name="image" size={18} /> DIAGRAM REQUIRED
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.75rem", lineHeight: 1.45 }}>
                  {currentCand.image_description || currentCand.diagram_info?.image_description || "A visual biological figure or anatomical diagram is required for this question."}
                </div>

                {currentCand.diagram_url ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <img
                      src={resolveDiagramImageUrl(currentCand.diagram_url)}
                      alt="Diagram preview"
                      style={{ maxWidth: "100%", maxHeight: "150px", objectFit: "contain", borderRadius: "var(--radius-sm)", background: "#fff", border: "1px solid var(--border)" }}
                    />
                    <label className="btn btn-secondary btn-sm" style={{ textAlign: "center", cursor: "pointer", display: "block" }}>
                      Replace Diagram Image
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDiagramUpload(file);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="btn btn-primary" style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem", textAlign: "center", cursor: "pointer", display: "block", fontWeight: 700 }}>
                    {uploadingImage ? "Uploading..." : "Upload Diagram Image"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDiagramUpload(file);
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Candidate Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "auto" }}>
              <button
                type="button"
                className={`btn ${currentCand.status === "accepted" ? "btn-success" : "btn-primary"}`}
                style={{ padding: "0.6rem", fontSize: "0.9rem", fontWeight: 700, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}
                onClick={() => handleToggleAccept(selectedIdx)}
              >
                <SvgIcon name="check" size={18} /> {currentCand.status === "accepted" ? "Accepted for Exam" : "Accept Question"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.55rem", fontSize: "0.88rem", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}
                onClick={handleRegenerateCurrentCandidate}
                disabled={regenerating}
              >
                <SvgIcon name="sparkle" size={16} /> {regenerating ? "Regenerating Question..." : "Regenerate Question"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.55rem", fontSize: "0.88rem", width: "100%", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}
                onClick={() => handleRejectCandidate(selectedIdx)}
              >
                <SvgIcon name="trash" size={16} /> Reject Question
              </button>
            </div>

          </div>
        </div>

      </div>

      {builderModalOpen && (
        <Modal
          title="Structured Question Structure Builder"
          onClose={() => setBuilderModalOpen(false)}
          maxWidth="980px"
        >
          <StructuredSkeletonBuilder
            initialNodes={editNodes}
            questionNumber={selectedIdx + 1}
            onSaveStructure={(data) => {
              setEditNodes(data.nodes);
              setBuilderModalOpen(false);
            }}
            onCancel={() => setBuilderModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
