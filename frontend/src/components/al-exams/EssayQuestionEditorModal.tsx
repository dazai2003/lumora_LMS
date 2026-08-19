"use client";

import React, { useState, useEffect, useMemo } from "react";
import Modal from "@/components/Modal";
import SvgIcon from "@/components/SvgIcon";
import api, { resolveDiagramImageUrl } from "@/lib/api";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";

export type EssayStructureType = "single_essay" | "subparts" | "short_notes";

export interface EssaySubpartItem {
  id: string;
  label: string; // (a), (b), (c)...
  prompt: string;
  max_marks: number;
}

export interface EssayMarkingCriterion {
  id: string;
  item_number: number;
  description: string;
  marks: number;
  accepted_alternatives?: string;
  examiner_note?: string;
}

export interface EssayQuestionData {
  id?: number;
  question_number: number;
  structure_type: EssayStructureType;
  stem_text: string;
  points: number; // default 150
  subparts: EssaySubpartItem[];
  model_answer: string;
  criteria: EssayMarkingCriterion[];
  examiner_notes: string;
  requires_image: boolean;
  image_description?: string;
  diagram_url?: string;
}

export interface EssayQuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Partial<EssayQuestionData> | null;
  defaultQuestionNumber?: number;
  onSave: (data: EssayQuestionData) => Promise<void> | void;
  isSaving?: boolean;
}

/**
 * Re-indexes subparts to automatic alphabetical labels: (a), (b), (c), (d)...
 */
function reindexSubpartLabels(items: EssaySubpartItem[]): EssaySubpartItem[] {
  return items.map((item, idx) => ({
    ...item,
    label: `(${String.fromCharCode(97 + idx)})`, // 'a' is 97
  }));
}

/**
 * Generates an empty subpart with automatic label
 */
function createEmptySubpart(index: number, defaultMarks: number = 50): EssaySubpartItem {
  return {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    label: `(${String.fromCharCode(97 + index)})`,
    prompt: "",
    max_marks: defaultMarks,
  };
}

/**
 * Generates an empty marking criterion
 */
function createEmptyCriterion(itemNumber: number, defaultMarks: number = 10): EssayMarkingCriterion {
  return {
    id: `crit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    item_number: itemNumber,
    description: "",
    marks: defaultMarks,
    accepted_alternatives: "",
    examiner_note: "",
  };
}

export default function EssayQuestionEditorModal({
  isOpen,
  onClose,
  initialData,
  defaultQuestionNumber = 5,
  onSave,
  isSaving = false,
}: EssayQuestionEditorModalProps) {
  // Form State
  const [questionNumber, setQuestionNumber] = useState<number>(defaultQuestionNumber);
  const [structureType, setStructureType] = useState<EssayStructureType>("single_essay");
  const [stemText, setStemText] = useState<string>("");
  const [maxMarks, setMaxMarks] = useState<number>(150);
  const [subparts, setSubparts] = useState<EssaySubpartItem[]>([]);
  const [modelAnswer, setModelAnswer] = useState<string>("");
  const [criteria, setCriteria] = useState<EssayMarkingCriterion[]>([]);
  const [examinerNotes, setExaminerNotes] = useState<string>("");
  const [requiresImage, setRequiresImage] = useState<boolean>(false);
  const [imageDescription, setImageDescription] = useState<string>("");
  const [diagramUrl, setDiagramUrl] = useState<string>("");
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize or reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      if (initialData) {
        setQuestionNumber(initialData.question_number ?? defaultQuestionNumber);
        setStructureType(initialData.structure_type || "single_essay");
        setStemText(initialData.stem_text || "");
        setMaxMarks(initialData.points ?? 150);
        setSubparts(initialData.subparts ? reindexSubpartLabels(initialData.subparts) : []);
        setModelAnswer(initialData.model_answer || "");
        setCriteria(
          initialData.criteria && initialData.criteria.length > 0
            ? initialData.criteria.map((c, i) => ({ ...c, item_number: i + 1 }))
            : [createEmptyCriterion(1, 15), createEmptyCriterion(2, 20), createEmptyCriterion(3, 15)]
        );
        setExaminerNotes(initialData.examiner_notes || "");
        setRequiresImage(initialData.requires_image || false);
        setImageDescription(initialData.image_description || "");
        setDiagramUrl(initialData.diagram_url || "");
      } else {
        // Pristine empty state for new essay question
        setQuestionNumber(defaultQuestionNumber);
        setStructureType("single_essay");
        setStemText("");
        setMaxMarks(150);
        setSubparts([]);
        setModelAnswer("");
        setCriteria([
          createEmptyCriterion(1, 15),
          createEmptyCriterion(2, 20),
          createEmptyCriterion(3, 15),
        ]);
        setExaminerNotes("");
        setRequiresImage(false);
        setImageDescription("");
        setDiagramUrl("");
      }
    }
  }, [isOpen, initialData, defaultQuestionNumber]);

  // Handle Structure Type Switching
  const handleStructureTypeChange = (newType: EssayStructureType) => {
    setStructureType(newType);
    if (newType === "subparts" || newType === "short_notes") {
      if (subparts.length === 0) {
        // Provide 3 clean subparts (a, b, c) summing to maxMarks
        const share = Math.floor(maxMarks / 3);
        const rem = maxMarks - share * 2;
        setSubparts([
          createEmptySubpart(0, share),
          createEmptySubpart(1, share),
          createEmptySubpart(2, rem),
        ]);
      }
    }
  };

  // Subparts Calculations & Management
  const subpartsTotalMarks = useMemo(() => {
    return subparts.reduce((sum, s) => sum + (Number(s.max_marks) || 0), 0);
  }, [subparts]);

  const handleAddSubpart = () => {
    const nextIdx = subparts.length;
    const remaining = Math.max(0, maxMarks - subpartsTotalMarks);
    const newSubpart = createEmptySubpart(nextIdx, remaining > 0 ? remaining : 25);
    setSubparts((prev) => reindexSubpartLabels([...prev, newSubpart]));
  };

  const handleUpdateSubpart = (id: string, field: "prompt" | "max_marks", value: any) => {
    setSubparts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: field === "max_marks" ? Number(value) || 0 : value } : s))
    );
  };

  const handleDeleteSubpart = (id: string) => {
    setSubparts((prev) => reindexSubpartLabels(prev.filter((s) => s.id !== id)));
  };

  const handleDuplicateSubpart = (id: string) => {
    const target = subparts.find((s) => s.id === id);
    if (!target) return;
    const duplicate: EssaySubpartItem = {
      ...target,
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    setSubparts((prev) => reindexSubpartLabels([...prev, duplicate]));
  };

  // Marking Criteria Calculations & Management
  const criteriaTotalMarks = useMemo(() => {
    return criteria.reduce((sum, c) => sum + (Number(c.marks) || 0), 0);
  }, [criteria]);

  const criteriaRemainingMarks = maxMarks - criteriaTotalMarks;
  const isCriteriaComplete = criteriaTotalMarks === maxMarks;
  const isCriteriaOverAllocated = criteriaTotalMarks > maxMarks;

  const handleAddCriterion = () => {
    const nextItemNum = criteria.length + 1;
    const remaining = Math.max(0, criteriaRemainingMarks);
    const newCrit = createEmptyCriterion(nextItemNum, remaining > 0 ? remaining : 10);
    setCriteria((prev) => [...prev, newCrit]);
  };

  const handleUpdateCriterion = (id: string, field: keyof EssayMarkingCriterion, value: any) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: field === "marks" ? Number(value) || 0 : value } : c))
    );
  };

  const handleDeleteCriterion = (id: string) => {
    setCriteria((prev) =>
      prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, item_number: i + 1 }))
    );
  };

  // Image Upload Handling
  const handleUploadImage = async (file: File) => {
    setUploadingImage(true);
    setValidationError(null);
    try {
      const res = await api.uploadQuestionDiagram(file);
      if (res && res.image_url) {
        setDiagramUrl(res.image_url);
        setRequiresImage(true);
      }
    } catch (err: any) {
      console.error("Diagram upload failed:", err);
      setValidationError(err?.message || "Failed to upload diagram image.");
    } finally {
      setUploadingImage(false);
    }
  };

  // Form Validation and Save
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // 1. Validate Question Stem
    if (!stemText.trim()) {
      setValidationError("Please enter the main essay question prompt.");
      return;
    }

    // 2. Validate Subparts if enabled
    if (structureType === "subparts" || structureType === "short_notes") {
      if (subparts.length === 0) {
        setValidationError("Please add at least one subpart for this essay structure.");
        return;
      }
      for (const s of subparts) {
        if (!s.prompt.trim()) {
          setValidationError(`Subpart ${s.label} prompt is empty.`);
          return;
        }
        if (s.max_marks <= 0) {
          setValidationError(`Subpart ${s.label} must have marks greater than 0.`);
          return;
        }
      }
      if (subpartsTotalMarks !== maxMarks) {
        setValidationError(
          `Subparts total marks (${subpartsTotalMarks}) must equal the essay maximum marks (${maxMarks}).`
        );
        return;
      }
    }

    // 3. Validate Marking Criteria
    if (criteria.length === 0) {
      setValidationError("Please add at least one marking criterion in the marking scheme.");
      return;
    }
    for (const c of criteria) {
      if (!c.description.trim()) {
        setValidationError(`Marking criterion #${c.item_number} description is empty.`);
        return;
      }
      if (c.marks <= 0) {
        setValidationError(`Marking criterion #${c.item_number} allocated marks must be greater than 0.`);
        return;
      }
    }
    if (isCriteriaOverAllocated) {
      setValidationError(
        `Marking scheme total (${criteriaTotalMarks} marks) exceeds the maximum allowed ${maxMarks} marks.`
      );
      return;
    }
    if (criteriaTotalMarks < maxMarks) {
      setValidationError(
        `Marking scheme total is incomplete (${criteriaTotalMarks} / ${maxMarks} marks). ${criteriaRemainingMarks} marks remaining.`
      );
      return;
    }

    // 4. Submit Question Data
    const payload: EssayQuestionData = {
      id: initialData?.id,
      question_number: questionNumber,
      structure_type: structureType,
      stem_text: normalizeScientificSymbols(stemText.trim()),
      points: maxMarks,
      subparts: subparts.map((s) => ({
        ...s,
        prompt: normalizeScientificSymbols(s.prompt.trim()),
      })),
      model_answer: normalizeScientificSymbols(modelAnswer.trim()),
      criteria: criteria.map((c, i) => ({
        ...c,
        item_number: i + 1,
        description: normalizeScientificSymbols(c.description.trim()),
        accepted_alternatives: normalizeScientificSymbols(c.accepted_alternatives || ""),
        examiner_note: normalizeScientificSymbols(c.examiner_note || ""),
      })),
      examiner_notes: normalizeScientificSymbols(examinerNotes.trim()),
      requires_image: requiresImage,
      image_description: normalizeScientificSymbols(imageDescription.trim()),
      diagram_url: diagramUrl || undefined,
    };

    await onSave(payload);
  };

  return (
    <Modal
      title={initialData?.id ? `Edit Essay Question — Question ${questionNumber}` : `Add Essay Question — Question ${questionNumber}`}
      onClose={onClose}
      maxWidth="920px"
    >
      <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "78vh", overflowY: "auto", paddingRight: "0.4rem" }}>
        
        {/* Error Validation Alert */}
        {validationError && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1.5px solid var(--danger)",
              color: "var(--danger)",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <SvgIcon name="alert-triangle" size={18} />
            <span>{validationError}</span>
          </div>
        )}

        {/* 1. TOP METADATA BAR (Question Number, Structure Type, Max Marks) */}
        <div className="card" style={{ padding: "1rem 1.25rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1.5fr 140px", gap: "1rem", alignItems: "center" }}>
            {/* Auto-Assigned Question Number */}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                Question No.
              </label>
              <div
                style={{
                  padding: "0.45rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: "var(--accent-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <SvgIcon name="folder" size={16} />
                Q{questionNumber}
              </div>
            </div>

            {/* Structure Type Selector */}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                Essay Structure Format *
              </label>
              <select
                className="select"
                value={structureType}
                onChange={(e) => handleStructureTypeChange(e.target.value as EssayStructureType)}
                style={{ fontWeight: 600, fontSize: "0.88rem" }}
              >
                <option value="single_essay">1. Single Comprehensive Essay (One Long Prompt)</option>
                <option value="subparts">2. Multipart Essay with Subparts (a), (b), (c)...</option>
                <option value="short_notes">3. Short Notes Style Questions on Specific Topics</option>
              </select>
            </div>

            {/* Maximum Marks Allocation */}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                Max Marks *
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <input
                  type="number"
                  className="input"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(Math.max(10, parseInt(e.target.value, 10) || 150))}
                  min={10}
                  max={300}
                  style={{ fontWeight: 800, textAlign: "center", fontSize: "0.95rem", color: "var(--accent-primary)" }}
                  required
                />
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>pts</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. QUESTION STEM PROMPT */}
        <div className="card" style={{ padding: "1.1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {structureType === "short_notes" ? "Main Prompt / Introduction Header *" : "Essay Question Prompt *"}
            </label>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Supports scientific notations (e.g. CO₂, H₂O, P700, ψw, α, β)
            </span>
          </div>
          <textarea
            className="textarea"
            rows={structureType === "single_essay" ? 4 : 2}
            value={stemText}
            onChange={(e) => setStemText(e.target.value)}
            placeholder={
              structureType === "short_notes"
                ? "Write short notes on the following biological mechanisms:"
                : "Enter the complete essay question prompt (e.g. Discuss the physiological mechanisms of water and solute transport in angiosperms)..."
            }
            required
            style={{ fontSize: "0.92rem", lineHeight: 1.5 }}
          />
        </div>

        {/* 3. SUBPARTS AUTHORING (For 'subparts' or 'short_notes') */}
        {(structureType === "subparts" || structureType === "short_notes") && (
          <div className="card" style={{ padding: "1.1rem 1.25rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Question Subparts
                </h4>
                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                  Define distinct sections with automatically sequenced labels.
                </p>
              </div>

              {/* Subparts Tally Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  className={`badge ${subpartsTotalMarks === maxMarks ? "badge-success" : "badge-warning"}`}
                  style={{ fontSize: "0.8rem", fontWeight: 700, padding: "0.35rem 0.65rem" }}
                >
                  Subparts Total: {subpartsTotalMarks} / {maxMarks} marks
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                  onClick={handleAddSubpart}
                >
                  <SvgIcon name="plus" size={14} /> Add Subpart
                </button>
              </div>
            </div>

            {/* Subpart List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {subparts.map((sub, idx) => (
                <div
                  key={sub.id}
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                        {sub.label}
                      </span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>
                        Sub-question {idx + 1}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>Marks:</span>
                        <input
                          type="number"
                          className="input"
                          value={sub.max_marks}
                          onChange={(e) => handleUpdateSubpart(sub.id, "max_marks", e.target.value)}
                          min={1}
                          max={maxMarks}
                          style={{ width: "65px", padding: "0.2rem 0.4rem", fontSize: "0.85rem", textAlign: "center", fontWeight: 700 }}
                        />
                      </div>

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
                        disabled={subparts.length <= 1}
                        title="Delete Subpart"
                      >
                        <SvgIcon name="trash" size={14} />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    className="input"
                    value={sub.prompt}
                    onChange={(e) => handleUpdateSubpart(sub.id, "prompt", e.target.value)}
                    placeholder={`Enter subpart ${sub.label} question text...`}
                    style={{ fontSize: "0.88rem" }}
                    required
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. MODEL / EXPECTED ANSWER (Optional Rich Prose) */}
        <div className="card" style={{ padding: "1.1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Model / Expected Answer <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional Reference Guide)</span>
            </label>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Comprehensive scientific prose &amp; key arguments
            </span>
          </div>
          <textarea
            className="textarea"
            rows={4}
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            placeholder="Enter the model/expected answer with scientific terminology, key biological mechanisms, and accepted facts..."
            style={{ fontSize: "0.88rem", lineHeight: 1.5 }}
          />
        </div>

        {/* 5. ITEMIZED MARKING SCHEME (Criteria & Points Tallying) */}
        <div className="card" style={{ padding: "1.1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Itemized Marking Scheme &amp; Criteria *
              </h4>
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                Specific grading checklist used by examiners to allocate points.
              </p>
            </div>

            {/* Real-Time Mark Allocation Status Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                className={`badge ${
                  isCriteriaComplete
                    ? "badge-success"
                    : isCriteriaOverAllocated
                    ? "badge-danger"
                    : "badge-warning"
                }`}
                style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0.4rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {isCriteriaComplete && <><SvgIcon name="check-circle" size={13} /> Valid: {criteriaTotalMarks} / {maxMarks} marks</>}
                {isCriteriaOverAllocated && <><SvgIcon name="alert-triangle" size={13} /> Over-allocated: {criteriaTotalMarks} / {maxMarks} ({criteriaTotalMarks - maxMarks} marks over)</>}
                {!isCriteriaComplete && !isCriteriaOverAllocated && <><SvgIcon name="clock" size={13} /> Incomplete: {criteriaTotalMarks} / {maxMarks} ({criteriaRemainingMarks} marks remaining)</>}
              </span>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                onClick={handleAddCriterion}
              >
                <SvgIcon name="plus" size={14} /> Add Criterion
              </button>
            </div>
          </div>

          {/* Criteria Checklist Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {criteria.map((crit, idx) => (
              <div
                key={crit.id}
                style={{
                  padding: "0.75rem 0.9rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "35px 1fr 90px 40px", gap: "0.6rem", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--accent-primary)", textAlign: "center" }}>
                    #{crit.item_number}
                  </span>

                  <input
                    type="text"
                    className="input"
                    value={crit.description}
                    onChange={(e) => handleUpdateCriterion(crit.id, "description", e.target.value)}
                    placeholder={`Describe marking point #${crit.item_number} (e.g. Correct identification of photosynthetic pigments)...`}
                    style={{ fontSize: "0.85rem" }}
                    required
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                    <input
                      type="number"
                      className="input"
                      value={crit.marks}
                      onChange={(e) => handleUpdateCriterion(crit.id, "marks", e.target.value)}
                      min={1}
                      max={maxMarks}
                      style={{ width: "55px", padding: "0.2rem 0.35rem", fontSize: "0.85rem", textAlign: "center", fontWeight: 700 }}
                      required
                    />
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>pts</span>
                  </div>

                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    onClick={() => handleDeleteCriterion(crit.id)}
                    disabled={criteria.length <= 1}
                    title="Delete Criterion"
                  >
                    <SvgIcon name="trash" size={14} />
                  </button>
                </div>

                {/* Optional accepted alternatives & examiner note toggle */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", paddingLeft: "35px" }}>
                  <input
                    type="text"
                    className="input"
                    value={crit.accepted_alternatives || ""}
                    onChange={(e) => handleUpdateCriterion(crit.id, "accepted_alternatives", e.target.value)}
                    placeholder="Accepted scientific alternatives (optional)..."
                    style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                  />
                  <input
                    type="text"
                    className="input"
                    value={crit.examiner_note || ""}
                    onChange={(e) => handleUpdateCriterion(crit.id, "examiner_note", e.target.value)}
                    placeholder="Examiner marking note (optional)..."
                    style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. EXAMINER GUIDANCE & DIAGRAM REQUIREMENTS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Examiner Notes (Optional) */}
          <div className="card" style={{ padding: "1rem 1.15rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
              Examiner Guidance Notes <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>(Optional)</span>
            </label>
            <textarea
              className="textarea"
              rows={3}
              value={examinerNotes}
              onChange={(e) => setExaminerNotes(e.target.value)}
              placeholder="Internal guidance on common student errors, required scientific terminology, or diagram standards..."
              style={{ fontSize: "0.82rem", lineHeight: 1.4 }}
            />
          </div>

          {/* Diagram / Visual Requirement */}
          <div className="card" style={{ padding: "1rem 1.15rem", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={requiresImage}
                onChange={(e) => setRequiresImage(e.target.checked)}
              />
              <SvgIcon name="image" size={16} style={{ color: "var(--accent-primary)" }} />
              This question requires a diagram / reference chart
            </label>

            {requiresImage && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
                <input
                  type="text"
                  className="input"
                  value={imageDescription}
                  onChange={(e) => setImageDescription(e.target.value)}
                  placeholder="Describe required diagram (e.g. Labelled diagram of a nephron)..."
                  style={{ fontSize: "0.8rem" }}
                />

                {diagramUrl ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                    <img
                      src={resolveDiagramImageUrl(diagramUrl)}
                      alt="Diagram preview"
                      style={{ maxHeight: "45px", maxWidth: "65px", objectFit: "contain", borderRadius: "4px" }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>Diagram Attached</span>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      style={{ marginLeft: "auto" }}
                      onClick={() => setDiagramUrl("")}
                      title="Remove diagram"
                    >
                      <SvgIcon name="trash" size={13} />
                    </button>
                  </div>
                ) : (
                  <label className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem", textAlign: "center", cursor: "pointer" }}>
                    {uploadingImage ? "Uploading..." : "Upload Reference Image"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadImage(file);
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ACTION BUTTONS FOOTER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.85rem", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: "0.6rem 1.8rem", fontSize: "0.92rem", fontWeight: 700 }}
            disabled={isSaving || !isCriteriaComplete}
          >
            {isSaving ? "Saving Essay Question..." : initialData?.id ? "Update Essay Question" : "Save Essay Question"}
          </button>
        </div>

      </form>
    </Modal>
  );
}
