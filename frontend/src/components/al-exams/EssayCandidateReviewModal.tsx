"use client";

import React, { useState, useEffect } from "react";
import SvgIcon from "@/components/SvgIcon";
import api, { resolveDiagramImageUrl } from "@/lib/api";

export interface EssayCandidateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: any[];
  onBatchAccept: (acceptedCandidates: any[]) => Promise<void>;
  onEditCandidateInBuilder?: (candidate: any) => void;
  addToast?: (msg: string, type?: "success" | "error" | "info") => void;
  courseId?: number;
  unitIds?: number[];
}

export default function EssayCandidateReviewModal({
  isOpen,
  onClose,
  candidates: initialCandidates = [],
  onBatchAccept,
  onEditCandidateInBuilder,
  addToast,
  courseId,
  unitIds,
}: EssayCandidateReviewModalProps) {
  const [candidates, setCandidates] = useState<any[]>(initialCandidates);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<"all" | "ready" | "accepted" | "rejected">("all");

  // In-modal Candidate Editing State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editStem, setEditStem] = useState<string>("");
  const [editInstruction, setEditInstruction] = useState<string>("");
  const [editMarkingScheme, setEditMarkingScheme] = useState<string>("");
  const [editExaminerNotes, setEditExaminerNotes] = useState<string>("");
  const [editDifficulty, setEditDifficulty] = useState<string>("medium");
  const [editCognitive, setEditCognitive] = useState<string>("analyze");
  const [editRequiresImage, setEditRequiresImage] = useState<boolean>(false);
  const [editImageDescription, setEditImageDescription] = useState<string>("");
  const [editAnswerPoints, setEditAnswerPoints] = useState<any[]>([]);
  const [editSubparts, setEditSubparts] = useState<any[]>([]);

  useEffect(() => {
    if (initialCandidates && initialCandidates.length > 0) {
      setCandidates(initialCandidates);
      setSelectedIdx(0);
    }
  }, [initialCandidates]);

  if (!isOpen || candidates.length === 0) return null;

  const currentCand = candidates[selectedIdx] || candidates[0];

  const handleStartEdit = () => {
    if (!currentCand) return;
    setEditStem(currentCand.stem_text || "");
    setEditInstruction(currentCand.instruction || "");
    setEditMarkingScheme(currentCand.marking_scheme || "");
    setEditExaminerNotes(currentCand.examiner_notes || "");
    setEditDifficulty(currentCand.difficulty || "medium");
    setEditCognitive(currentCand.cognitive_level || "analyze");
    setEditRequiresImage(Boolean(currentCand.requires_image));
    setEditImageDescription(currentCand.image_description || "");
    setEditAnswerPoints(JSON.parse(JSON.stringify(currentCand.answer_points || [])));
    setEditSubparts(JSON.parse(JSON.stringify(currentCand.subparts || [])));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== selectedIdx) return c;
        return {
          ...c,
          stem_text: editStem.trim(),
          instruction: editInstruction.trim(),
          marking_scheme: editMarkingScheme.trim(),
          examiner_notes: editExaminerNotes.trim(),
          difficulty: editDifficulty,
          cognitive_level: editCognitive,
          requires_image: editRequiresImage,
          image_description: editRequiresImage ? editImageDescription.trim() : null,
          answer_points: editAnswerPoints,
          subparts: editSubparts,
          children: editSubparts,
        };
      })
    );
    setIsEditing(false);
    if (addToast) addToast(`Updated Essay Question #${currentCand.question_number}`, "success");
  };

  const handleToggleAccept = (idx: number) => {
    setCandidates((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const nextStatus = c.status === "accepted" ? "ready" : "accepted";
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
      if (addToast) addToast("Reference diagram attached successfully!", "success");
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
      const updated = await api.regenerateEssayCandidate({
        candidate: currentCand,
        course_id: courseId,
        unit_ids: unitIds,
        difficulty_mode: currentCand.difficulty,
        cognitive_mode: currentCand.cognitive_level,
      });

      if (updated) {
        setCandidates((prev) =>
          prev.map((c, i) =>
            i === selectedIdx
              ? {
                  ...updated,
                  status: "ready",
                  is_valid: true,
                  validation_errors: [],
                  validation_warnings: [],
                }
              : c
          )
        );
        if (addToast) addToast(`Regenerated Essay Question #${currentCand.question_number}!`, "success");
      }
    } catch (err: any) {
      console.error("Regeneration failed", err);
      if (addToast) addToast(err?.message || "Failed to regenerate candidate", "error");
    } finally {
      setRegenerating(false);
    }
  };

  const handleAcceptAllReady = async () => {
    const readyCandidates = candidates.filter((c) => c.status !== "rejected");
    if (readyCandidates.length === 0) {
      if (addToast) addToast("No ready candidates to accept.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await onBatchAccept(readyCandidates);
      onClose();
    } catch (err: any) {
      console.error("Batch accept failed", err);
      if (addToast) addToast(err?.message || "Failed to attach accepted essays", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    if (filterTab === "ready") return c.status === "ready";
    if (filterTab === "accepted") return c.status === "accepted";
    if (filterTab === "rejected") return c.status === "rejected";
    return true;
  });

  const getFormatBadge = (fmt: string) => {
    const lower = (fmt || "").toLowerCase();
    if (lower.includes("single")) return { label: "Single Complete", color: "badge-primary" };
    if (lower.includes("multi")) return { label: "Multi-Part (i, ii, iii)", color: "badge-secondary" };
    if (lower.includes("short")) return { label: "Short Notes Style", color: "badge-info" };
    return { label: fmt || "Essay", color: "badge-primary" };
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "1160px",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-card)",
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: "1.1rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-card)",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)",
              }}
            >
              <SvgIcon name="file-text" size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                AI Essay Question Review Workspace
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
                Review generated Paper II Part B essay questions, answer points, and marking schemes before attaching to paper.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                fontSize: "0.85rem",
                padding: "0.45rem 1.25rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
              onClick={handleAcceptAllReady}
              disabled={submitting || regenerating}
            >
              <SvgIcon name="check" size={16} />
              {submitting ? "Attaching Essays..." : `Accept All Ready (${candidates.filter((c) => c.status !== "rejected").length})`}
            </button>

            <button type="button" className="btn-icon" onClick={onClose} disabled={submitting} title="Close Review">
              <SvgIcon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* Workspace Body: Left Sidebar + Right Content */}
        <div style={{ display: "grid", gridTemplateColumns: "310px 1fr", flex: 1, minHeight: 0, background: "var(--bg-secondary)" }}>
          
          {/* Left Candidates List Sidebar */}
          <div
            style={{
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-card)",
              overflowY: "auto",
            }}
          >
            {/* Filter Tabs */}
            <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border)", display: "flex", gap: "0.3rem" }}>
              {(["all", "ready", "accepted", "rejected"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`badge ${filterTab === tab ? "badge-primary" : "badge-secondary"}`}
                  style={{
                    fontSize: "0.74rem",
                    padding: "0.3rem 0.55rem",
                    textTransform: "capitalize",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  {tab} ({candidates.filter((c) => (tab === "all" ? true : c.status === tab)).length})
                </button>
              ))}
            </div>

            {/* Candidate Cards List */}
            <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {filteredCandidates.map((cand, idx) => {
                const realIdx = candidates.findIndex((c) => c.candidate_id === cand.candidate_id);
                const isSelected = realIdx === selectedIdx;
                const fmtBadge = getFormatBadge(cand.structure_format || cand.structure_type);

                return (
                  <div
                    key={cand.candidate_id || idx}
                    onClick={() => {
                      setSelectedIdx(realIdx);
                      setIsEditing(false);
                    }}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-md)",
                      border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        Question {cand.question_number}
                      </span>
                      <span className={`badge ${fmtBadge.color}`} style={{ fontSize: "0.68rem" }}>
                        {fmtBadge.label}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {cand.stem_text || cand.instruction}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" }}>
                      <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--accent-primary)", fontFamily: "monospace" }}>
                        {cand.marks || cand.points} Marks
                      </span>
                      <span
                        className={`badge ${
                          cand.status === "accepted"
                            ? "badge-success"
                            : cand.status === "rejected"
                            ? "badge-danger"
                            : "badge-info"
                        }`}
                        style={{ fontSize: "0.68rem" }}
                      >
                        {cand.status === "accepted" ? "Accepted" : cand.status === "rejected" ? "Rejected" : "Ready"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Main Candidate Detailed View / Edit View */}
          <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
            
            {/* Top Candidate Action Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid var(--border)",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Question {currentCand.question_number}
                </h4>
                <span className={`badge ${getFormatBadge(currentCand.structure_format || currentCand.structure_type).color}`}>
                  {getFormatBadge(currentCand.structure_format || currentCand.structure_type).label}
                </span>
                <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 700 }}>
                  {currentCand.marks || currentCand.points} Marks
                </span>
                <span className="badge badge-secondary">{currentCand.difficulty || "medium"}</span>
                <span className="badge badge-secondary">{currentCand.cognitive_level || "analyze"}</span>
              </div>

              {/* Individual Candidate Actions */}
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {!isEditing ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                    onClick={handleStartEdit}
                    title="Edit content in-place without changing blueprint structure"
                  >
                    <SvgIcon name="edit" size={14} /> Edit Content
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", background: "var(--success)" }}
                    onClick={handleSaveEdit}
                  >
                    <SvgIcon name="check" size={14} /> Save Changes
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                  onClick={handleRegenerateCurrentCandidate}
                  disabled={regenerating}
                  title="Regenerate this single essay question with AI"
                >
                  <SvgIcon name="refresh" size={14} className={regenerating ? "spinning" : ""} />
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </button>

                <button
                  type="button"
                  className={`btn ${currentCand.status === "accepted" ? "btn-secondary" : "btn-primary"}`}
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", fontWeight: 700 }}
                  onClick={() => handleToggleAccept(selectedIdx)}
                >
                  <SvgIcon name="check" size={14} />
                  {currentCand.status === "accepted" ? "Accepted (Toggle)" : "Accept"}
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                  onClick={() => handleRejectCandidate(selectedIdx)}
                >
                  <SvgIcon name="trash" size={14} /> Reject
                </button>
              </div>
            </div>

            {/* Validation Warnings Alert (e.g. Near Duplicate / Leaks) */}
            {currentCand.validation_warnings && currentCand.validation_warnings.length > 0 && (
              <div
                style={{
                  padding: "0.65rem 0.9rem",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid var(--warning)",
                  fontSize: "0.82rem",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <SvgIcon name="alert-triangle" size={16} style={{ color: "var(--warning)" }} />
                <span>{currentCand.validation_warnings[0]}</span>
              </div>
            )}

            {/* If in edit mode, show In-place Editor */}
            {isEditing ? (
              <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)", border: "1.5px solid var(--accent-primary)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h5 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                  Editing Question {currentCand.question_number} Content
                </h5>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Question Prompt / Stem
                  </label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={editStem}
                    onChange={(e) => setEditStem(e.target.value)}
                    style={{ fontSize: "0.88rem", lineHeight: 1.45 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Difficulty Level
                    </label>
                    <select
                      className="form-control"
                      value={editDifficulty}
                      onChange={(e) => setEditDifficulty(e.target.value)}
                      style={{ fontSize: "0.82rem" }}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Cognitive Level
                    </label>
                    <select
                      className="form-control"
                      value={editCognitive}
                      onChange={(e) => setEditCognitive(e.target.value)}
                      style={{ fontSize: "0.82rem" }}
                    >
                      <option value="remember">Remember</option>
                      <option value="understand">Understand</option>
                      <option value="apply">Apply</option>
                      <option value="analyze">Analyze</option>
                      <option value="evaluate">Evaluate</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Marking Scheme Criteria
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={editMarkingScheme}
                    onChange={(e) => setEditMarkingScheme(e.target.value)}
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Examiner Guidance Notes (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={editExaminerNotes}
                    onChange={(e) => setEditExaminerNotes(e.target.value)}
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Question Stem / Context Premise */}
                <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                    {currentCand.structure_format === "short_notes" ? "Instruction / Context" : "Question Prompt / Stem"}
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {currentCand.stem_text || currentCand.instruction}
                  </div>
                </div>

                {/* Subparts Breakdown (For Multi-Part or Short Notes) */}
                {currentCand.structure_format !== "single_complete" && currentCand.subparts && currentCand.subparts.length > 0 && (
                  <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <h5 style={{ fontSize: "0.88rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                      {currentCand.structure_format === "short_notes" ? "Short Note Topics" : "Sub-Question Parts"}
                    </h5>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {currentCand.subparts.map((sub: any, sIdx: number) => (
                        <div
                          key={sub.id || sIdx}
                          style={{
                            padding: "0.85rem",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--accent-primary)" }}>
                              {sub.label}
                            </span>
                            <span className="badge badge-info" style={{ fontSize: "0.72rem", fontFamily: "monospace" }}>
                              {sub.marks || sub.max_points} Marks
                            </span>
                          </div>

                          <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 600, marginBottom: "0.5rem" }}>
                            {sub.prompt}
                          </div>

                          {/* Nested Subparts (if Level 2 Alphabetical items exist) */}
                          {sub.children && sub.children.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginLeft: "0.75rem", paddingLeft: "0.75rem", borderLeft: "2px solid rgba(99, 102, 241, 0.25)" }}>
                              {sub.children.map((nested: any, nIdx: number) => (
                                <div key={nested.id || nIdx} style={{ fontSize: "0.82rem", background: "var(--bg-card)", padding: "0.4rem 0.6rem", borderRadius: "4px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                                    <span>{nested.label} {nested.prompt}</span>
                                    <span style={{ color: "var(--accent-primary)", fontFamily: "monospace" }}>{nested.marks} pts</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Subpart Answer Points */}
                          {sub.answer_points && sub.answer_points.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.4rem" }}>
                              {sub.answer_points.map((pt: any, pIdx: number) => (
                                <div
                                  key={pt.id || pIdx}
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "0.5rem",
                                    fontSize: "0.82rem",
                                    background: "var(--bg-card)",
                                    padding: "0.4rem 0.6rem",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <span style={{ fontWeight: 800, color: "var(--accent-primary)", minWidth: "22px" }}>
                                    #{pt.item_number || pIdx + 1}
                                  </span>
                                  <span style={{ flex: 1, color: "var(--text-primary)" }}>{pt.description}</span>
                                  <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "monospace" }}>
                                    {pt.marks} pts
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Answer Points (For Single Complete Question) */}
                {currentCand.structure_format === "single_complete" && currentCand.answer_points && currentCand.answer_points.length > 0 && (
                  <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h5 style={{ fontSize: "0.88rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                        Itemized Answer Points ({currentCand.answer_points.length} Points)
                      </h5>
                      <span className="badge badge-info" style={{ fontFamily: "monospace" }}>
                        {currentCand.marks || currentCand.points} Total Marks
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {currentCand.answer_points.map((pt: any, pIdx: number) => (
                        <div
                          key={pt.id || pIdx}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.6rem",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            fontSize: "0.84rem",
                          }}
                        >
                          <span style={{ fontWeight: 800, color: "var(--accent-primary)", minWidth: "26px" }}>
                            #{pt.item_number || pIdx + 1}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{pt.description}</div>
                            {pt.accepted_alternatives && (
                              <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                <em>Acceptable alternatives:</em> {pt.accepted_alternatives}
                              </div>
                            )}
                          </div>
                          <span style={{ fontWeight: 700, color: "var(--accent-primary)", fontSize: "0.8rem", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {pt.marks} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dedicated Marking Scheme */}
                {currentCand.marking_scheme && (
                  <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <h5 style={{ fontSize: "0.88rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>
                      Marking Scheme Criteria
                    </h5>
                    <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                      {currentCand.marking_scheme}
                    </div>
                  </div>
                )}

                {/* Optional Examiner Notes */}
                {currentCand.examiner_notes && (
                  <div className="card" style={{ padding: "1.1rem", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                    <h5 style={{ fontSize: "0.85rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--accent-primary)" }}>
                      Examiner Guidance Notes
                    </h5>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {currentCand.examiner_notes}
                    </div>
                  </div>
                )}

                {/* Diagram / Visual Requirement */}
                {currentCand.requires_image && (
                  <div className="card" style={{ padding: "1.1rem", background: "rgba(245, 158, 11, 0.08)", border: "1px solid var(--warning)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                      <SvgIcon name="image" size={16} style={{ color: "var(--warning)" }} />
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        Visual / Diagram Requirement
                      </span>
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem 0" }}>
                      {currentCand.image_description || "An anatomical diagram or pathway is recommended for this question."}
                    </p>

                    {currentCand.diagram_url ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <img
                          src={resolveDiagramImageUrl(currentCand.diagram_url)}
                          alt="Diagram preview"
                          style={{ maxHeight: "100px", maxWidth: "160px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border)" }}
                        />
                        <span style={{ fontSize: "0.78rem", color: "var(--success)", fontWeight: 700 }}>
                          ✓ Diagram Attached
                        </span>
                      </div>
                    ) : (
                      <label
                        className="btn btn-secondary"
                        style={{
                          fontSize: "0.8rem",
                          padding: "0.4rem 0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          cursor: "pointer",
                        }}
                      >
                        <SvgIcon name="image" size={14} />
                        {uploadingImage ? "Uploading..." : "Attach Reference Diagram"}
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
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
