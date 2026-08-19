"use client";

import React, { useState, useMemo } from "react";
import SvgIcon from "@/components/SvgIcon";
import api, { resolveDiagramImageUrl } from "@/lib/api";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";
import {
  EssayStructureFormat,
  EssayAnswerPoint,
  EssaySubpart,
  reindexEssaySubparts,
  calculateSubpartMarks,
  calculateEssayTotalMarks,
  addSubpartToTree,
  deleteSubpartFromTree,
  duplicateSubpartInTree,
  moveSubpartInTree,
  stripLeadingNumberingPrefix,
  createEmptyEssayAnswerPoint,
  createEmptyEssaySubpart,
} from "@/lib/alEssayTreeUtils";

export type { EssayStructureFormat, EssayAnswerPoint, EssaySubpart };

export {
  createEmptyEssayAnswerPoint as createEmptyAnswerPoint,
  createEmptyEssaySubpart as createEmptySubpart,
};

export interface EssayContentAuthoringFormProps {
  questionNumber: number;
  structureFormat: EssayStructureFormat;
  onChangeStructureFormat: (val: EssayStructureFormat) => void;
  instruction?: string;
  onChangeInstruction?: (val: string) => void;
  stemText: string;
  onChangeStemText: (val: string) => void;
  answerPoints?: EssayAnswerPoint[];
  onChangeAnswerPoints?: (points: EssayAnswerPoint[]) => void;
  markingScheme?: string;
  onChangeMarkingScheme?: (val: string) => void;
  subparts?: EssaySubpart[];
  onChangeSubparts?: (subparts: EssaySubpart[]) => void;
  examinerNotes?: string;
  onChangeExaminerNotes?: (val: string) => void;
  requiresImage?: boolean;
  onChangeRequiresImage?: (val: boolean) => void;
  imageDescription?: string;
  onChangeImageDescription?: (val: string) => void;
  diagramUrl?: string;
  onChangeDiagramUrl?: (val: string) => void;
  onOpenStructureModal?: () => void;
  onSaveQuestion: () => Promise<void> | void;
  onClearForm?: () => void;
  onResetInputs?: () => void;
  isSubmitting?: boolean;
  isEditingExisting?: boolean;
}

export default function EssayContentAuthoringForm({
  questionNumber,
  structureFormat,
  onChangeStructureFormat,
  instruction = "Write short notes on the following:",
  onChangeInstruction,
  stemText,
  onChangeStemText,
  answerPoints = [],
  onChangeAnswerPoints,
  markingScheme = "",
  onChangeMarkingScheme,
  subparts = [],
  onChangeSubparts,
  examinerNotes = "",
  onChangeExaminerNotes,
  requiresImage = false,
  onChangeRequiresImage,
  imageDescription = "",
  onChangeImageDescription,
  diagramUrl = "",
  onChangeDiagramUrl,
  onOpenStructureModal,
  onSaveQuestion,
  onClearForm,
  onResetInputs,
  isSubmitting = false,
  isEditingExisting = false,
}: EssayContentAuthoringFormProps) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmRestructureModalOpen, setConfirmRestructureModalOpen] = useState(false);
  const [pendingStructureTarget, setPendingStructureTarget] = useState<EssayStructureFormat | null>(null);

  // Live Total Marks calculation across structures without double-counting
  const activeTotalMarks = useMemo(() => {
    return calculateEssayTotalMarks({
      structure_format: structureFormat,
      answer_points: answerPoints,
      subparts: subparts,
    });
  }, [structureFormat, answerPoints, subparts]);

  // Form Validation prior to submission
  const handleValidateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (structureFormat === "single_complete") {
      if (!stemText.trim()) {
        setValidationError("Please enter the Essay Question Prompt.");
        return;
      }
      if (!answerPoints || answerPoints.length === 0) {
        setValidationError("Please add at least one Answer Point with a mark allocation.");
        return;
      }
      const hasEmptyPoint = answerPoints.some((p) => !p.description.trim());
      if (hasEmptyPoint) {
        setValidationError("All Answer Points must have a description.");
        return;
      }
      if (activeTotalMarks <= 0) {
        setValidationError("Total marks must be greater than 0.");
        return;
      }
    } else if (structureFormat === "multi_part") {
      if (!subparts || subparts.length === 0) {
        setValidationError("Please add at least one subpart.");
        return;
      }
      for (let i = 0; i < subparts.length; i++) {
        const sub = subparts[i];
        if (!sub.prompt.trim()) {
          setValidationError(`Subpart ${sub.label || `(${i + 1})`} requires an Essay Question Prompt.`);
          return;
        }
        // If it has children, validate children
        if (sub.children && sub.children.length > 0) {
          for (let c = 0; c < sub.children.length; c++) {
            const child = sub.children[c];
            if (!child.prompt.trim()) {
              setValidationError(`Nested part ${child.label || `(${c + 1})`} under ${sub.label} requires a prompt.`);
              return;
            }
            if (!child.answer_points || child.answer_points.length === 0) {
              setValidationError(`Nested part ${child.label} must contain at least one Answer Point.`);
              return;
            }
          }
        } else {
          if (!sub.answer_points || sub.answer_points.length === 0) {
            setValidationError(`Subpart ${sub.label} must contain at least one Answer Point.`);
            return;
          }
          const hasEmpty = sub.answer_points.some((p) => !p.description.trim());
          if (hasEmpty) {
            setValidationError(`All Answer Points in Subpart ${sub.label} must have a description.`);
            return;
          }
        }
      }
      if (activeTotalMarks <= 0) {
        setValidationError("Total marks must be greater than 0.");
        return;
      }
    } else if (structureFormat === "short_notes") {
      if (!subparts || subparts.length === 0) {
        setValidationError("Please add at least one Short Note topic.");
        return;
      }
      for (let i = 0; i < subparts.length; i++) {
        const sub = subparts[i];
        if (!sub.prompt.trim()) {
          setValidationError(`Short Note topic ${sub.label || `(${i + 1})`} requires a Topic Name or Prompt.`);
          return;
        }
        if (!sub.answer_points || sub.answer_points.length === 0) {
          setValidationError(`Short Note topic ${sub.label} must contain at least one Answer Point.`);
          return;
        }
        const hasEmpty = sub.answer_points.some((p) => !p.description.trim());
        if (hasEmpty) {
          setValidationError(`All Answer Points in Short Note ${sub.label} must have a description.`);
          return;
        }
      }
      if (activeTotalMarks <= 0) {
        setValidationError("Total marks must be greater than 0.");
        return;
      }
    }

    onSaveQuestion();
  };

  // Single Complete: Answer Points Operations
  const handleAddSingleAnswerPoint = () => {
    if (!onChangeAnswerPoints) return;
    const nextIdx = (answerPoints || []).length + 1;
    const newPt = createEmptyEssayAnswerPoint(nextIdx, 5);
    onChangeAnswerPoints([...(answerPoints || []), newPt]);
  };

  const handleUpdateSingleAnswerPoint = (id: string, field: keyof EssayAnswerPoint, val: any) => {
    if (!onChangeAnswerPoints) return;
    onChangeAnswerPoints(
      (answerPoints || []).map((p) => (p.id === id ? { ...p, [field]: field === "marks" ? Number(val) || 0 : val } : p))
    );
  };

  const handleDeleteSingleAnswerPoint = (id: string) => {
    if (!onChangeAnswerPoints) return;
    const filtered = (answerPoints || []).filter((p) => p.id !== id);
    onChangeAnswerPoints(filtered.map((p, idx) => ({ ...p, item_number: idx + 1 })));
  };

  const handleDuplicateSingleAnswerPoint = (id: string) => {
    if (!onChangeAnswerPoints) return;
    const target = (answerPoints || []).find((p) => p.id === id);
    if (!target) return;
    const nextIdx = (answerPoints || []).length + 1;
    const duplicate: EssayAnswerPoint = {
      ...target,
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      item_number: nextIdx,
    };
    onChangeAnswerPoints([...(answerPoints || []), duplicate]);
  };

  const handleMoveSingleAnswerPoint = (index: number, direction: "up" | "down") => {
    if (!onChangeAnswerPoints) return;
    const list = [...(answerPoints || [])];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    onChangeAnswerPoints(list.map((p, idx) => ({ ...p, item_number: idx + 1 })));
  };

  // Subparts Operations (Tree-safe)
  const handleAddTopSubpart = () => {
    if (!onChangeSubparts) return;
    onChangeSubparts(addSubpartToTree(subparts || [], null));
  };

  const handleAddNestedChildSubpart = (parentId: string) => {
    if (!onChangeSubparts) return;
    onChangeSubparts(addSubpartToTree(subparts || [], parentId));
  };

  const handleUpdateSubpartField = (subId: string, field: "prompt" | "marking_scheme" | "marks", val: any) => {
    if (!onChangeSubparts) return;

    function updateRecursive(list: EssaySubpart[]): EssaySubpart[] {
      return list.map((s) => {
        if (s.id === subId) {
          const finalVal = field === "prompt" ? stripLeadingNumberingPrefix(val) : field === "marks" ? Number(val) || 0 : val;
          return { ...s, [field]: finalVal };
        }
        if (s.children && s.children.length > 0) {
          return { ...s, children: updateRecursive(s.children) };
        }
        return s;
      });
    }

    onChangeSubparts(reindexEssaySubparts(updateRecursive(subparts || [])));
  };

  const handleAddSubpartAnswerPoint = (subId: string) => {
    if (!onChangeSubparts) return;

    function addPtRecursive(list: EssaySubpart[]): EssaySubpart[] {
      return list.map((s) => {
        if (s.id === subId) {
          const nextNum = (s.answer_points || []).length + 1;
          const newPt = createEmptyEssayAnswerPoint(nextNum, 5);
          return {
            ...s,
            answer_points: [...(s.answer_points || []), newPt],
          };
        }
        if (s.children && s.children.length > 0) {
          return { ...s, children: addPtRecursive(s.children) };
        }
        return s;
      });
    }

    onChangeSubparts(reindexEssaySubparts(addPtRecursive(subparts || [])));
  };

  const handleUpdateSubpartAnswerPoint = (subId: string, ptId: string, field: keyof EssayAnswerPoint, val: any) => {
    if (!onChangeSubparts) return;

    function updatePtRecursive(list: EssaySubpart[]): EssaySubpart[] {
      return list.map((s) => {
        if (s.id === subId) {
          const updatedPts = (s.answer_points || []).map((p) =>
            p.id === ptId ? { ...p, [field]: field === "marks" ? Number(val) || 0 : val } : p
          );
          return { ...s, answer_points: updatedPts };
        }
        if (s.children && s.children.length > 0) {
          return { ...s, children: updatePtRecursive(s.children) };
        }
        return s;
      });
    }

    onChangeSubparts(reindexEssaySubparts(updatePtRecursive(subparts || [])));
  };

  const handleDeleteSubpartAnswerPoint = (subId: string, ptId: string) => {
    if (!onChangeSubparts) return;

    function deletePtRecursive(list: EssaySubpart[]): EssaySubpart[] {
      return list.map((s) => {
        if (s.id === subId) {
          const filtered = (s.answer_points || []).filter((p) => p.id !== ptId);
          return {
            ...s,
            answer_points: filtered.map((p, idx) => ({ ...p, item_number: idx + 1 })),
          };
        }
        if (s.children && s.children.length > 0) {
          return { ...s, children: deletePtRecursive(s.children) };
        }
        return s;
      });
    }

    onChangeSubparts(reindexEssaySubparts(deletePtRecursive(subparts || [])));
  };

  const handleDeleteSubpart = (subId: string) => {
    if (!onChangeSubparts) return;
    onChangeSubparts(deleteSubpartFromTree(subparts || [], subId));
  };

  const handleDuplicateSubpart = (subId: string) => {
    if (!onChangeSubparts) return;
    onChangeSubparts(duplicateSubpartInTree(subparts || [], subId));
  };

  const handleMoveSubpart = (subId: string, direction: "up" | "down") => {
    if (!onChangeSubparts) return;
    onChangeSubparts(moveSubpartInTree(subparts || [], subId, direction));
  };

  // Safe Restructuring Handler
  const handleRequestStructureChange = (targetFormat: EssayStructureFormat) => {
    if (targetFormat === structureFormat) return;

    const hasAuthoredContent =
      structureFormat === "single_complete"
        ? Boolean(stemText.trim() || (answerPoints && answerPoints.length > 0 && answerPoints.some((p) => p.description.trim())))
        : Boolean(subparts && subparts.length > 0 && subparts.some((s) => s.prompt.trim() || (s.answer_points && s.answer_points.some((p) => p.description.trim()))));

    if (hasAuthoredContent) {
      setPendingStructureTarget(targetFormat);
      setConfirmRestructureModalOpen(true);
    } else {
      executeStructureChange(targetFormat);
    }
  };

  const executeStructureChange = (targetFormat: EssayStructureFormat) => {
    onChangeStructureFormat(targetFormat);
    if (targetFormat === "multi_part" || targetFormat === "short_notes") {
      if (!subparts || subparts.length === 0) {
        if (onChangeSubparts) {
          onChangeSubparts([
            createEmptyEssaySubpart(0, "", 0),
            createEmptyEssaySubpart(1, "", 0),
          ]);
        }
      }
    }
    setConfirmRestructureModalOpen(false);
    setPendingStructureTarget(null);
  };

  // Image Upload Handling
  const handleFileUpload = async (file: File) => {
    setUploadingImage(true);
    setUploadError(null);
    try {
      const res = await api.uploadQuestionDiagram(file);
      if (res && res.image_url) {
        if (onChangeDiagramUrl) onChangeDiagramUrl(res.image_url);
        if (onChangeRequiresImage) onChangeRequiresImage(true);
      }
    } catch (err: any) {
      console.error("Diagram upload error", err);
      setUploadError(err?.message || "Failed to upload reference image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const formatTitle =
    structureFormat === "single_complete"
      ? "Single Complete Question"
      : structureFormat === "multi_part"
      ? "Multi-Part Descriptive Subparts"
      : "Short Notes Style";

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      {/* 1. TOP HEADER BANNER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
            Question {questionNumber} — {formatTitle}
          </h4>
          <span className="badge badge-primary">Paper II Part B — Essay</span>
          <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 700 }}>
            Total: {activeTotalMarks} Marks
          </span>
          {isEditingExisting && (
            <span className="badge badge-warning" style={{ fontSize: "0.75rem" }}>
              Editing Mode
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {onOpenStructureModal ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8rem" }}
              onClick={onOpenStructureModal}
            >
              Change Structure
            </button>
          ) : (
            <div style={{ display: "flex", background: "var(--bg-secondary)", padding: "0.2rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <button
                type="button"
                className={`btn ${structureFormat === "single_complete" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", border: "none" }}
                onClick={() => handleRequestStructureChange("single_complete")}
              >
                Single Complete
              </button>
              <button
                type="button"
                className={`btn ${structureFormat === "multi_part" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", border: "none" }}
                onClick={() => handleRequestStructureChange("multi_part")}
              >
                Multi-Part
              </button>
              <button
                type="button"
                className={`btn ${structureFormat === "short_notes" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", border: "none" }}
                onClick={() => handleRequestStructureChange("short_notes")}
              >
                Short Notes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div
          style={{
            padding: "0.65rem 0.9rem",
            borderRadius: "var(--radius-sm)",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: "0.84rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <SvgIcon name="alert-triangle" size={16} />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleValidateAndSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        
        {/* ─── FORMAT 1: SINGLE COMPLETE QUESTION ─── */}
        {structureFormat === "single_complete" && (
          <>
            {/* Essay Question Prompt */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                Essay Question Prompt *
              </label>
              <textarea
                rows={3}
                className="textarea"
                value={stemText}
                onChange={(e) => onChangeStemText(stripLeadingNumberingPrefix(e.target.value))}
                required
                placeholder="Enter essay question prompt..."
                style={{ fontSize: "0.9rem", lineHeight: 1.5 }}
              />
            </div>

            {/* Answer Points System */}
            <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.4rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0 }}>
                    Answer Points
                  </h4>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                    Key biological facts/statements required for scoring. Total marks calculate automatically.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge badge-info" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                    Total: {activeTotalMarks} Marks
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
                    onClick={handleAddSingleAnswerPoint}
                  >
                    <SvgIcon name="plus" size={14} /> Add Answer Point
                  </button>
                </div>
              </div>

              {/* Answer Points List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {(answerPoints || []).map((pt, pIdx) => (
                  <div
                    key={pt.id}
                    style={{
                      padding: "0.65rem 0.85rem",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 90px 110px", gap: "0.6rem", alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--accent-primary)", textAlign: "center" }}>
                        #{pt.item_number || pIdx + 1}
                      </span>

                      <input
                        type="text"
                        className="input"
                        value={pt.description}
                        onChange={(e) => handleUpdateSingleAnswerPoint(pt.id, "description", e.target.value)}
                        placeholder={`Enter answer point description #${pt.item_number || pIdx + 1}...`}
                        style={{ fontSize: "0.85rem" }}
                      />

                      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                        <input
                          type="number"
                          className="input"
                          value={pt.marks}
                          onChange={(e) => handleUpdateSingleAnswerPoint(pt.id, "marks", e.target.value)}
                          min={1}
                          style={{ width: "55px", padding: "0.2rem 0.35rem", fontSize: "0.85rem", textAlign: "center", fontWeight: 700 }}
                        />
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>pts</span>
                      </div>

                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSingleAnswerPoint(pIdx, "up")}
                          disabled={pIdx === 0}
                          title="Move Up"
                        >
                          <SvgIcon name="chevron-up" size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSingleAnswerPoint(pIdx, "down")}
                          disabled={pIdx === (answerPoints || []).length - 1}
                          title="Move Down"
                        >
                          <SvgIcon name="chevron-down" size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDuplicateSingleAnswerPoint(pt.id)}
                          title="Duplicate Answer Point"
                        >
                          <SvgIcon name="copy" size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleDeleteSingleAnswerPoint(pt.id)}
                          disabled={(answerPoints || []).length <= 1}
                          title="Delete Answer Point"
                        >
                          <SvgIcon name="trash" size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{ paddingLeft: "30px" }}>
                      <input
                        type="text"
                        className="input"
                        value={pt.accepted_alternatives || ""}
                        onChange={(e) => handleUpdateSingleAnswerPoint(pt.id, "accepted_alternatives", e.target.value)}
                        placeholder="Accepted scientific alternatives (optional)..."
                        style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Marking Scheme */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.35rem" }}>
                Marking Scheme <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Overall Evaluation Guidance)</span>
              </label>
              <textarea
                className="textarea"
                rows={3}
                value={markingScheme}
                onChange={(e) => onChangeMarkingScheme && onChangeMarkingScheme(e.target.value)}
                placeholder="Enter marking scheme / examiner marking criteria..."
                style={{ fontSize: "0.88rem", lineHeight: 1.5 }}
              />
            </div>
          </>
        )}

        {/* ─── FORMAT 2: MULTI-PART DESCRIPTIVE SUBPARTS ─── */}
        {structureFormat === "multi_part" && (
          <>
            {/* General Premise / Context (Optional) */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.35rem" }}>
                General Question Stem / Premise <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional Context)</span>
              </label>
              <textarea
                className="textarea"
                rows={2}
                value={stemText}
                onChange={(e) => onChangeStemText(stripLeadingNumberingPrefix(e.target.value))}
                placeholder="Enter general question premise (optional)..."
                style={{ fontSize: "0.88rem" }}
              />
            </div>

            {/* Subparts Dynamic List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>
                    Subparts ({(subparts || []).length} Subquestions)
                  </h4>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                    Numbered automatically as (i), (ii), (iii)... Supports nested (a), (b) sub-items.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: "0.82rem", padding: "0.35rem 0.85rem" }}
                  onClick={handleAddTopSubpart}
                >
                  <SvgIcon name="plus" size={14} /> Add Subpart (Roman)
                </button>
              </div>

              {(subparts || []).map((sub, idx) => {
                const subMarks = calculateSubpartMarks(sub);
                const hasChildren = sub.children && sub.children.length > 0;

                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: "1.1rem",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-primary)", minWidth: "32px" }}>
                          {sub.label || `(${idx + 1})`}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          Sub-question {idx + 1}
                        </span>
                        <span className="badge badge-info" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                          {subMarks} Marks
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                          onClick={() => handleAddNestedChildSubpart(sub.id)}
                          title="Add nested (a)/(b) sub-part"
                        >
                          <SvgIcon name="plus" size={12} /> Add Nested (a)
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSubpart(sub.id, "up")}
                          disabled={idx === 0}
                          title="Move Up"
                        >
                          <SvgIcon name="chevron-up" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSubpart(sub.id, "down")}
                          disabled={idx === (subparts || []).length - 1}
                          title="Move Down"
                        >
                          <SvgIcon name="chevron-down" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDuplicateSubpart(sub.id)}
                          title="Duplicate Subpart"
                        >
                          <SvgIcon name="copy" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleDeleteSubpart(sub.id)}
                          disabled={(subparts || []).length <= 1}
                          title="Delete Subpart"
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Subpart Prompt */}
                    <div>
                      <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                        Sub-question Prompt {sub.label} *
                      </label>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={sub.prompt}
                        onChange={(e) => handleUpdateSubpartField(sub.id, "prompt", e.target.value)}
                        placeholder={`Enter sub-question ${sub.label}...`}
                        style={{ fontSize: "0.88rem" }}
                        required
                      />
                    </div>

                    {/* If Level 2 nested children exist, render them. Else render direct answer points */}
                    {hasChildren ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingLeft: "1rem", borderLeft: "2px solid rgba(99, 102, 241, 0.3)" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                          Nested Subparts:
                        </span>
                        {sub.children!.map((child, cIdx) => (
                          <div key={child.id} style={{ background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: "0.95rem" }}>
                                {child.label}
                              </span>
                              <button
                                type="button"
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleDeleteSubpart(child.id)}
                                title="Delete Nested Part"
                              >
                                <SvgIcon name="trash" size={12} />
                              </button>
                            </div>
                            <input
                              type="text"
                              className="input"
                              value={child.prompt}
                              onChange={(e) => handleUpdateSubpartField(child.id, "prompt", e.target.value)}
                              placeholder={`Enter prompt for ${child.label}...`}
                              style={{ fontSize: "0.84rem" }}
                            />
                            {/* Child Answer Points */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                              {(child.answer_points || []).map((cp) => (
                                <div key={cp.id} style={{ display: "grid", gridTemplateColumns: "25px 1fr 70px 30px", gap: "0.4rem", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)" }}>#{cp.item_number}</span>
                                  <input
                                    type="text"
                                    className="input"
                                    value={cp.description}
                                    onChange={(e) => handleUpdateSubpartAnswerPoint(child.id, cp.id, "description", e.target.value)}
                                    placeholder="Answer point..."
                                    style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
                                  />
                                  <input
                                    type="number"
                                    className="input"
                                    value={cp.marks}
                                    onChange={(e) => handleUpdateSubpartAnswerPoint(child.id, cp.id, "marks", e.target.value)}
                                    style={{ width: "45px", padding: "0.15rem 0.3rem", fontSize: "0.8rem", textAlign: "center" }}
                                  />
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => handleDeleteSubpartAnswerPoint(child.id, cp.id)}
                                  >
                                    <SvgIcon name="trash" size={12} />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.72rem", alignSelf: "flex-start", marginTop: "0.2rem" }}
                                onClick={() => handleAddSubpartAnswerPoint(child.id)}
                              >
                                <SvgIcon name="plus" size={11} /> Add Point to {child.label}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Subpart Direct Answer Points */
                      <div style={{ background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Answer Points ({subMarks} pts)
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                            onClick={() => handleAddSubpartAnswerPoint(sub.id)}
                          >
                            <SvgIcon name="plus" size={12} /> Add Answer Point
                          </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                          {(sub.answer_points || []).map((pt) => (
                            <div key={pt.id} style={{ display: "grid", gridTemplateColumns: "25px 1fr 80px 35px", gap: "0.5rem", alignItems: "center" }}>
                              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", textAlign: "center" }}>
                                #{pt.item_number}
                              </span>
                              <input
                                type="text"
                                className="input"
                                value={pt.description}
                                onChange={(e) => handleUpdateSubpartAnswerPoint(sub.id, pt.id, "description", e.target.value)}
                                placeholder="Answer point description..."
                                style={{ fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                <input
                                  type="number"
                                  className="input"
                                  value={pt.marks}
                                  onChange={(e) => handleUpdateSubpartAnswerPoint(sub.id, pt.id, "marks", e.target.value)}
                                  min={1}
                                  style={{ width: "50px", padding: "0.2rem 0.3rem", fontSize: "0.82rem", textAlign: "center", fontWeight: 700 }}
                                />
                                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>pts</span>
                              </div>
                              <button
                                type="button"
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleDeleteSubpartAnswerPoint(sub.id, pt.id)}
                                disabled={(sub.answer_points || []).length <= 1}
                                title="Delete Point"
                              >
                                <SvgIcon name="trash" size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subpart Marking Scheme */}
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.2rem" }}>
                        Marking Scheme for {sub.label}
                      </label>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={sub.marking_scheme || ""}
                        onChange={(e) => handleUpdateSubpartField(sub.id, "marking_scheme", e.target.value)}
                        placeholder={`Enter marking scheme / grading guidance for ${sub.label}...`}
                        style={{ fontSize: "0.82rem" }}
                      />
                    </div>

                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── FORMAT 3: SHORT NOTES STYLE ─── */}
        {structureFormat === "short_notes" && (
          <>
            {/* Instruction / Parent Header */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.35rem" }}>
                Instruction / Parent Question Prompt <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional Header)</span>
              </label>
              <input
                type="text"
                className="input"
                value={instruction}
                onChange={(e) => onChangeInstruction && onChangeInstruction(e.target.value)}
                placeholder="Write short notes on the following (or leave blank if none)..."
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              />
            </div>

            {/* Short Note Topics List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>
                    Short Note Topics ({(subparts || []).length} Topics)
                  </h4>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                    Numbered automatically as (i), (ii), (iii)... Each topic contains its prompt, answer points, and marking scheme.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: "0.82rem", padding: "0.35rem 0.85rem" }}
                  onClick={handleAddTopSubpart}
                >
                  <SvgIcon name="plus" size={14} /> Add Short Note Topic
                </button>
              </div>

              {(subparts || []).map((sub, idx) => {
                const subMarks = calculateSubpartMarks(sub);
                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: "1.1rem",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-primary)", minWidth: "32px" }}>
                          {sub.label || `(${idx + 1})`}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          Topic {idx + 1}
                        </span>
                        <span className="badge badge-info" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                          {subMarks} Marks
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSubpart(sub.id, "up")}
                          disabled={idx === 0}
                          title="Move Up"
                        >
                          <SvgIcon name="chevron-up" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveSubpart(sub.id, "down")}
                          disabled={idx === (subparts || []).length - 1}
                          title="Move Down"
                        >
                          <SvgIcon name="chevron-down" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDuplicateSubpart(sub.id)}
                          title="Duplicate Topic"
                        >
                          <SvgIcon name="copy" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleDeleteSubpart(sub.id)}
                          disabled={(subparts || []).length <= 1}
                          title="Delete Topic"
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Topic Prompt */}
                    <div>
                      <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                        Topic Name / Prompt {sub.label} *
                      </label>
                      <input
                        type="text"
                        className="input"
                        value={sub.prompt}
                        onChange={(e) => handleUpdateSubpartField(sub.id, "prompt", e.target.value)}
                        placeholder={`Enter topic name or prompt for ${sub.label}...`}
                        style={{ fontSize: "0.88rem", fontWeight: 600 }}
                        required
                      />
                    </div>

                    {/* Subpart Answer Points */}
                    <div style={{ background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                          Answer Points ({subMarks} pts)
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                          onClick={() => handleAddSubpartAnswerPoint(sub.id)}
                        >
                          <SvgIcon name="plus" size={12} /> Add Answer Point
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                        {(sub.answer_points || []).map((pt) => (
                          <div key={pt.id} style={{ display: "grid", gridTemplateColumns: "25px 1fr 80px 35px", gap: "0.5rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", textAlign: "center" }}>
                              #{pt.item_number}
                            </span>
                            <input
                              type="text"
                              className="input"
                              value={pt.description}
                              onChange={(e) => handleUpdateSubpartAnswerPoint(sub.id, pt.id, "description", e.target.value)}
                              placeholder="Answer point description..."
                              style={{ fontSize: "0.82rem", padding: "0.25rem 0.5rem" }}
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                              <input
                                type="number"
                                className="input"
                                value={pt.marks}
                                onChange={(e) => handleUpdateSubpartAnswerPoint(sub.id, pt.id, "marks", e.target.value)}
                                min={1}
                                style={{ width: "50px", padding: "0.2rem 0.3rem", fontSize: "0.82rem", textAlign: "center", fontWeight: 700 }}
                              />
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>pts</span>
                            </div>
                            <button
                              type="button"
                              className="btn-icon btn-icon-danger"
                              onClick={() => handleDeleteSubpartAnswerPoint(sub.id, pt.id)}
                              disabled={(sub.answer_points || []).length <= 1}
                              title="Delete Point"
                            >
                              <SvgIcon name="trash" size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Subpart Marking Scheme */}
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.2rem" }}>
                        Marking Scheme for {sub.label}
                      </label>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={sub.marking_scheme || ""}
                        onChange={(e) => handleUpdateSubpartField(sub.id, "marking_scheme", e.target.value)}
                        placeholder={`Enter marking scheme for ${sub.label}...`}
                        style={{ fontSize: "0.82rem" }}
                      />
                    </div>

                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── OPTIONAL EXAMINER NOTES & REFERENCE MEDIA ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", paddingTop: "0.75rem", borderTop: "1px dashed var(--border)" }}>
          
          {/* Examiner Notes */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
              Examiner Notes <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional)</span>
            </label>
            <textarea
              className="textarea"
              rows={3}
              value={examinerNotes}
              onChange={(e) => onChangeExaminerNotes && onChangeExaminerNotes(e.target.value)}
              placeholder="Enter optional examiner notes / grading notes for teachers..."
              style={{ fontSize: "0.82rem" }}
            />
          </div>

          {/* Reference Material / Diagram / Chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block" }}>
              Reference Material <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional)</span>
            </label>

            {diagramUrl ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.6rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--success)", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="check" size={14} /> Reference Image Attached
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", color: "var(--danger)" }}
                    onClick={() => {
                      if (onChangeDiagramUrl) onChangeDiagramUrl("");
                      if (onChangeRequiresImage) onChangeRequiresImage(false);
                      if (onChangeImageDescription) onChangeImageDescription("");
                    }}
                  >
                    Remove Diagram
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "center", background: "#fff", padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
                  <img
                    src={resolveDiagramImageUrl(diagramUrl)}
                    alt="Reference Material Preview"
                    style={{ maxHeight: "140px", maxWidth: "100%", objectFit: "contain" }}
                  />
                </div>

                <input
                  type="text"
                  className="input"
                  value={imageDescription}
                  onChange={(e) => onChangeImageDescription && onChangeImageDescription(e.target.value)}
                  placeholder="Figure caption / description (optional)..."
                  style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label
                  className="btn btn-secondary"
                  style={{
                    fontSize: "0.82rem",
                    padding: "0.6rem 0.9rem",
                    textAlign: "center",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    border: "1.5px dashed var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <SvgIcon name="image" size={16} style={{ color: "var(--accent-primary)" }} />
                  {uploadingImage ? "Uploading Image..." : "+ Add Diagram / Chart"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={uploadingImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </label>
                {uploadError && (
                  <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>{uploadError}</span>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ─── ACTION BUTTONS FOOTER ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.85rem", borderTop: "1.5px solid var(--border)", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {onClearForm && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClearForm}
                disabled={isSubmitting}
                title="Remove question template and return to blank state"
              >
                Clear Form
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (onResetInputs) {
                  onResetInputs();
                  return;
                }
                onChangeStemText("");
                if (onChangeMarkingScheme) onChangeMarkingScheme("");
                if (onChangeExaminerNotes) onChangeExaminerNotes("");
                if (onChangeDiagramUrl) onChangeDiagramUrl("");
                if (onChangeRequiresImage) onChangeRequiresImage(false);
                if (onChangeImageDescription) onChangeImageDescription("");

                if (structureFormat === "single_complete" && onChangeAnswerPoints) {
                  onChangeAnswerPoints(
                    (answerPoints || []).map((p) => ({ ...p, description: "", accepted_alternatives: "" }))
                  );
                } else if (onChangeSubparts) {
                  onChangeSubparts(
                    (subparts || []).map((s) => ({
                      ...s,
                      prompt: "",
                      marking_scheme: "",
                      answer_points: (s.answer_points || []).map((p) => ({ ...p, description: "", accepted_alternatives: "" })),
                      children: (s.children || []).map((c) => ({
                        ...c,
                        prompt: "",
                        marking_scheme: "",
                        answer_points: (c.answer_points || []).map((cp) => ({ ...cp, description: "", accepted_alternatives: "" })),
                      })),
                    }))
                  );
                }
              }}
              disabled={isSubmitting}
              title="Clear all text fields and reset inputs for this structure"
            >
              Reset
            </button>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: "0.6rem 2rem", fontSize: "0.95rem", fontWeight: 700 }}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Saving Question..."
              : isEditingExisting
              ? "Update Essay Question"
              : "Add Essay Question to Paper"}
          </button>
        </div>

      </form>

      {/* RESTRUCTURE SAFETY CONFIRMATION MODAL */}
      {confirmRestructureModalOpen && pendingStructureTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div className="card" style={{ maxWidth: "480px", padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-md)" }}>
            <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--warning)" }}>
              Change Question Structure?
            </h4>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.45, margin: "0 0 1rem 0" }}>
              Switching to <strong>{pendingStructureTarget}</strong> will adapt your authored content into the new layout. Existing subpart content will be converted. Do you want to proceed?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setConfirmRestructureModalOpen(false);
                  setPendingStructureTarget(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning"
                onClick={() => executeStructureChange(pendingStructureTarget)}
              >
                Proceed &amp; Switch Structure
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
