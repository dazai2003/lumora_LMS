"use client";

import React, { useState } from "react";
import SvgIcon from "@/components/SvgIcon";
import api, { resolveDiagramImageUrl } from "@/lib/api";
import {
  StructuredNode,
  reindexTreeLabels,
  calculateNodePoints,
  isLeafNode,
  findNodeById,
  collectLeafAnswerableNodes,
  getStructureSummary,
} from "@/lib/alStructuredTreeUtils";
import { STRUCTURED_FORMAT_OPTIONS } from "./StructuredSkeletonBuilder";

export interface StructuredContentAuthoringFormProps {
  questionNumber?: number;
  stemText: string;
  onChangeStemText: (val: string) => void;
  diagramUrl?: string;
  onChangeDiagramUrl?: (val: string) => void;
  nodes: StructuredNode[];
  onChangeNodes: (nodes: StructuredNode[]) => void;
  onOpenStructureBuilder: () => void;
  onSaveQuestion: () => Promise<void> | void;
  onResetForm?: () => void;
  onClearForm?: () => void;
  onResetInputs?: () => void;
  isSubmitting?: boolean;
  isEditingExisting?: boolean;
  readOnly?: boolean;
}

export default function StructuredContentAuthoringForm({
  questionNumber = 1,
  stemText,
  onChangeStemText,
  diagramUrl = "",
  onChangeDiagramUrl,
  nodes,
  onChangeNodes,
  onOpenStructureBuilder,
  onSaveQuestion,
  onResetForm,
  onClearForm,
  onResetInputs,
  isSubmitting = false,
  isEditingExisting = false,
  readOnly = false,
}: StructuredContentAuthoringFormProps) {
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Summary Metrics
  const summary = getStructureSummary(nodes);
  const totalRawPoints = summary.totalRawPoints;
  const scaledMarks = summary.scaledMarks;
  const isOverAllocated = summary.isOverAllocated;
  const isComplete = summary.isComplete;

  const leafNodes = collectLeafAnswerableNodes(nodes);

  // Helper to update a node in the tree
  const updateNode = (id: string, updater: (n: StructuredNode) => StructuredNode) => {
    function updateRecursive(list: StructuredNode[]): StructuredNode[] {
      return list.map((node) => {
        if (node.id === id) {
          return updater(node);
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: updateRecursive(node.children),
          };
        }
        return node;
      });
    }
    const updated = updateRecursive(nodes);
    onChangeNodes(reindexTreeLabels(updated));
  };

  // Upload Diagram for Question Stem or Node
  const handleFileUpload = async (file: File, targetNodeId?: string) => {
    setUploadingImage(true);
    setUploadError(null);
    try {
      const res = await api.uploadQuestionDiagram(file);
      if (targetNodeId) {
        updateNode(targetNodeId, (n) => ({
          ...n,
          diagram_info: {
            ...n.diagram_info,
            requires_image: true,
            image_url: res.image_url,
            diagram_type: "PRE_SUPPLIED",
          },
        }));
      } else if (onChangeDiagramUrl) {
        onChangeDiagramUrl(res.image_url);
      }
    } catch (err: any) {
      console.error("Image upload error", err);
      setUploadError(err?.message || "Failed to upload image.");
    } finally {
      setUploadingImage(false);
    }
  };

  // If no skeleton nodes are defined yet, show empty state
  if (!nodes || nodes.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: "2.5rem 1.5rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "var(--bg-card)",
          border: "1.5px dashed var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-primary)",
          }}
        >
          <SvgIcon name="grid" size={28} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <h4 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Question Builder — Question {questionNumber}
            </h4>
            <span className="badge badge-primary">Paper II Part A — Structured</span>
          </div>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "520px", margin: "0 auto", lineHeight: 1.45 }}>
            No question structure loaded yet. Click below to configure the section hierarchy, subparts, and 40-point blueprint.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: "0.92rem", padding: "0.6rem 1.4rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
          onClick={onOpenStructureBuilder}
        >
          <SvgIcon name="plus" size={16} /> Add Structured Question (Configure Structure)
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.4rem" }}>
      {/* Header & Top Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Question Builder — Question {questionNumber}
            </h4>
            <span className="badge badge-primary">Paper II Part A — Structured</span>
            <span className={`badge ${isComplete ? "badge-success" : isOverAllocated ? "badge-danger" : "badge-info"}`} style={{ fontFamily: "monospace", fontWeight: 700 }}>
              {totalRawPoints} / 40 Points ({scaledMarks} / 100 Marks)
            </span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Author biology scenarios, subpart prompts, model answers, marking checklists, and diagrams based on the defined blueprint.
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={onOpenStructureBuilder}
            title="Modify sections, subparts, formats, or points in the Structure Builder popup"
          >
            <SvgIcon name="grid" size={14} /> Add / Edit Structure
          </button>

          {onResetForm && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.82rem", padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
              onClick={onResetForm}
              title="Reset form and start a fresh question"
            >
              <SvgIcon name="plus" size={14} /> New Question
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div style={{ padding: "0.6rem 0.9rem", borderRadius: "var(--radius-sm)", background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.82rem" }}>
          {uploadError}
        </div>
      )}

      {/* Main Question Scenario Stem & Optional Diagram */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.35rem" }}>
            Main Structured Scenario / Context Stem *
          </label>
          <textarea
            rows={2}
            className="textarea"
            disabled={readOnly}
            value={stemText}
            placeholder="[Enter main scenario stem e.g. The diagram below illustrates the Calvin cycle and light-independent reactions occurring in the stroma...]"
            onChange={(e) => onChangeStemText(e.target.value)}
            required
          />
        </div>

        {/* Optional Main Scenario Diagram Attachment */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
              Main Scenario Diagram URL (Optional)
            </label>
            <input
              type="text"
              className="input"
              disabled={readOnly}
              value={diagramUrl}
              placeholder="https://... or upload diagram image file"
              onChange={(e) => onChangeDiagramUrl && onChangeDiagramUrl(e.target.value)}
            />
          </div>

          <div>
            <label
              className="btn btn-secondary"
              style={{ fontSize: "0.82rem", padding: "0.55rem 0.9rem", cursor: uploadingImage ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <SvgIcon name="image" size={15} />
              <span>{uploadingImage ? "Uploading..." : "Upload Image"}</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploadingImage || readOnly}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>
          </div>
        </div>

        {diagramUrl && (
          <div style={{ padding: "0.6rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "1rem" }}>
            <img
              src={resolveDiagramImageUrl(diagramUrl)}
              alt="Main Scenario Diagram"
              style={{ maxHeight: "90px", maxWidth: "160px", objectFit: "contain", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
            />
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <strong>Attached Diagram:</strong> {diagramUrl}
            </div>
          </div>
        )}
      </div>

      {/* Structured Subparts Authoring Tree */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-primary)", borderBottom: "1.5px solid var(--border)", paddingBottom: "0.4rem" }}>
          Structured Question Blueprint Content ({leafNodes.length} Subparts &middot; {totalRawPoints} Raw Points)
        </div>

        {nodes.map((sectionNode) => {
          const secPoints = calculateNodePoints(sectionNode);
          const subpartsUnderSection = collectLeafAnswerableNodes([sectionNode]);

          return (
            <div
              key={sectionNode.id}
              style={{
                border: "1.5px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Section Container Header */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--bg-card)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontWeight: 900, fontSize: "1.1rem", color: "var(--accent-primary)" }}>
                    Section {sectionNode.label}
                  </span>
                  <span className="badge badge-secondary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                    {subpartsUnderSection.length} Subparts
                  </span>
                </div>

                <span className="badge badge-primary" style={{ fontSize: "0.82rem", fontWeight: 800 }}>
                  {secPoints} Raw Points ({secPoints * 2.5} Marks)
                </span>
              </div>

              {/* Subparts under this Section */}
              <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                {subpartsUnderSection.map((subpart) => {
                  const formatInfo = STRUCTURED_FORMAT_OPTIONS.find((f) => f.value === subpart.format_type);

                  return (
                    <div
                      key={subpart.id}
                      style={{
                        padding: "1.1rem",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.85rem",
                      }}
                    >
                      {/* Subpart Title Bar */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--accent-primary)" }}>
                            {subpart.label}.
                          </span>
                          <span className="badge badge-primary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                            {formatInfo?.label.split(" ")[1] || subpart.format_type}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            ({formatInfo?.desc})
                          </span>
                        </div>

                        <span className="badge badge-info" style={{ fontSize: "0.78rem", fontWeight: 800 }}>
                          {subpart.points} Raw Points ({subpart.points * 2.5} Marks)
                        </span>
                      </div>

                      {/* Subpart Question Prompt Textarea */}
                      <div>
                        <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                          Subpart Question Prompt / Text *
                        </label>
                        <textarea
                          rows={2}
                          className="textarea"
                          disabled={readOnly}
                          value={subpart.prompt}
                          placeholder={`[Enter question prompt for ${subpart.label}...]`}
                          onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, prompt: e.target.value }))}
                          required
                        />
                      </div>

                      {/* ──────────────────────────────────────────────────────────── */}
                      {/* DEDICATED FORMAT CONTENT EDITORS (1 TO 7)                   */}
                      {/* ──────────────────────────────────────────────────────────── */}

                      {/* FORMAT 1: DIRECT FACTUAL RECALL & NAMING */}
                      {subpart.format_type === "structured_direct_recall" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block" }}>
                            Expected Scientific Term / Direct Answer *
                          </label>
                          <input
                            type="text"
                            className="input"
                            disabled={readOnly}
                            value={subpart.model_answer || ""}
                            placeholder="[Enter expected scientific term, structure name, or reagent...]"
                            onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, model_answer: e.target.value }))}
                          />
                        </div>
                      )}

                      {/* FORMAT 2: SHORT CONCEPTUAL EXPLANATIONS */}
                      {subpart.format_type === "structured_conceptual" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                              Comprehensive Model Answer / Explanation
                            </label>
                            <textarea
                              rows={2}
                              className="textarea"
                              disabled={readOnly}
                              value={subpart.model_answer || ""}
                              placeholder="[Enter comprehensive scientific model answer...]"
                              onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, model_answer: e.target.value }))}
                            />
                          </div>

                          {/* Marking Points Checklist Builder */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                                Marking Scheme Points ({subpart.marking_points?.length || 0})
                              </label>
                              {!readOnly && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                                  onClick={() => {
                                    const pts = subpart.marking_points || [];
                                    updateNode(subpart.id, (n) => ({
                                      ...n,
                                      marking_points: [...pts, { criterion: "", points: 1.0 }],
                                    }));
                                  }}
                                >
                                  <SvgIcon name="plus" size={12} /> Add Marking Point
                                </button>
                              )}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                              {(subpart.marking_points || []).map((mp, mIdx) => (
                                <div key={mIdx} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.8rem", fontWeight: 700, minWidth: "20px" }}>&#9745;</span>
                                  <input
                                    type="text"
                                    className="input"
                                    disabled={readOnly}
                                    value={mp.criterion}
                                    placeholder="[Describe what earns this point e.g. Binds to RuBisCO active site...]"
                                    onChange={(e) => {
                                      const updatedPts = [...(subpart.marking_points || [])];
                                      updatedPts[mIdx] = { ...updatedPts[mIdx], criterion: e.target.value };
                                      updateNode(subpart.id, (n) => ({ ...n, marking_points: updatedPts }));
                                    }}
                                  />
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    className="input"
                                    disabled={readOnly}
                                    style={{ width: "65px", textAlign: "right" }}
                                    value={mp.points}
                                    onChange={(e) => {
                                      const updatedPts = [...(subpart.marking_points || [])];
                                      updatedPts[mIdx] = { ...updatedPts[mIdx], points: parseFloat(e.target.value) || 0.5 };
                                      updateNode(subpart.id, (n) => ({ ...n, marking_points: updatedPts }));
                                    }}
                                  />
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>pts</span>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      className="btn-icon btn-icon-danger"
                                      onClick={() => {
                                        const updatedPts = (subpart.marking_points || []).filter((_, i) => i !== mIdx);
                                        updateNode(subpart.id, (n) => ({ ...n, marking_points: updatedPts }));
                                      }}
                                    >
                                      <SvgIcon name="trash" size={13} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FORMAT 3: SEQUENTIAL PATHWAYS & CHRONOLOGY */}
                      {subpart.format_type === "structured_sequential" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                              Sequential Pathway Steps in Correct Chronological Order
                            </label>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => {
                                  const steps = subpart.sequence_items || [];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    sequence_items: [...steps, `Step ${steps.length + 1}`],
                                  }));
                                }}
                              >
                                <SvgIcon name="plus" size={12} /> Add Step
                              </button>
                            )}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {(subpart.sequence_items || []).map((stepText, sIdx) => (
                              <div key={sIdx} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                <span style={{ fontWeight: 800, fontSize: "0.8rem", color: "var(--accent-primary)", minWidth: "55px" }}>
                                  Step {sIdx + 1}:
                                </span>
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={stepText}
                                  placeholder={`[Describe sequential event ${sIdx + 1}...]`}
                                  onChange={(e) => {
                                    const updatedSteps = [...(subpart.sequence_items || [])];
                                    updatedSteps[sIdx] = e.target.value;
                                    updateNode(subpart.id, (n) => ({ ...n, sequence_items: updatedSteps }));
                                  }}
                                />
                                {!readOnly && (subpart.sequence_items || []).length > 2 && (
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => {
                                      const updatedSteps = (subpart.sequence_items || []).filter((_, i) => i !== sIdx);
                                      updateNode(subpart.id, (n) => ({ ...n, sequence_items: updatedSteps }));
                                    }}
                                  >
                                    <SvgIcon name="trash" size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* FORMAT 4: SIDE-BY-SIDE COMPARISONS */}
                      {subpart.format_type === "structured_comparison" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                            <div>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                                Entity / Column 1 Heading
                              </label>
                              <input
                                type="text"
                                className="input"
                                disabled={readOnly}
                                value={subpart.comparison_header_1 || ""}
                                placeholder="[e.g. C3 Plants / Mitosis]"
                                onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, comparison_header_1: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                                Entity / Column 2 Heading
                              </label>
                              <input
                                type="text"
                                className="input"
                                disabled={readOnly}
                                value={subpart.comparison_header_2 || ""}
                                placeholder="[e.g. C4 Plants / Meiosis]"
                                onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, comparison_header_2: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                              Comparison Pairs &amp; Criteria ({subpart.comparison_pairs?.length || 0})
                            </label>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => {
                                  const pairs = subpart.comparison_pairs || [];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    comparison_pairs: [...pairs, { criterion: "", value_1: "", value_2: "" }],
                                  }));
                                }}
                              >
                                <SvgIcon name="plus" size={12} /> Add Comparison Row
                              </button>
                            )}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {(subpart.comparison_pairs || []).map((cp, cpIdx) => (
                              <div key={cpIdx} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: "0.5rem", alignItems: "center" }}>
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={cp.criterion}
                                  placeholder="[Criterion e.g. Initial CO2 acceptor]"
                                  onChange={(e) => {
                                    const updatedPairs = [...(subpart.comparison_pairs || [])];
                                    updatedPairs[cpIdx] = { ...updatedPairs[cpIdx], criterion: e.target.value };
                                    updateNode(subpart.id, (n) => ({ ...n, comparison_pairs: updatedPairs }));
                                  }}
                                />
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={cp.value_1}
                                  placeholder="[Value 1 e.g. RuBP]"
                                  onChange={(e) => {
                                    const updatedPairs = [...(subpart.comparison_pairs || [])];
                                    updatedPairs[cpIdx] = { ...updatedPairs[cpIdx], value_1: e.target.value };
                                    updateNode(subpart.id, (n) => ({ ...n, comparison_pairs: updatedPairs }));
                                  }}
                                />
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={cp.value_2}
                                  placeholder="[Value 2 e.g. PEP]"
                                  onChange={(e) => {
                                    const updatedPairs = [...(subpart.comparison_pairs || [])];
                                    updatedPairs[cpIdx] = { ...updatedPairs[cpIdx], value_2: e.target.value };
                                    updateNode(subpart.id, (n) => ({ ...n, comparison_pairs: updatedPairs }));
                                  }}
                                />
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => {
                                      const updatedPairs = (subpart.comparison_pairs || []).filter((_, i) => i !== cpIdx);
                                      updateNode(subpart.id, (n) => ({ ...n, comparison_pairs: updatedPairs }));
                                    }}
                                  >
                                    <SvgIcon name="trash" size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* FORMAT 5: DIAGRAMMATIC / GENETICS DEDUCTIONS */}
                      {subpart.format_type === "structured_diagram" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "flex-end" }}>
                            <div>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                                Subpart Diagram URL (Image / Pedigree Chart)
                              </label>
                              <input
                                type="text"
                                className="input"
                                disabled={readOnly}
                                value={subpart.diagram_info?.image_url || ""}
                                placeholder="https://... or upload diagram image"
                                onChange={(e) => {
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    diagram_info: { ...n.diagram_info, requires_image: true, image_url: e.target.value },
                                  }));
                                }}
                              />
                            </div>
                            <div>
                              <label
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.5rem 0.8rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                              >
                                <SvgIcon name="image" size={14} /> Upload
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  disabled={readOnly}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFileUpload(f, subpart.id);
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          <div>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                              Diagram Interpretation / Deduction Model Answer *
                            </label>
                            <textarea
                              rows={2}
                              className="textarea"
                              disabled={readOnly}
                              value={subpart.model_answer || ""}
                              placeholder="[Enter expected biological deductions from the provided diagram...]"
                              onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, model_answer: e.target.value }))}
                            />
                          </div>
                        </div>
                      )}

                      {/* FORMAT 6: STRUCTURED MATRIX TABLES */}
                      {subpart.format_type === "structured_matrix" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                            <div>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>Column 1 Header</label>
                              <input
                                type="text"
                                className="input"
                                disabled={readOnly}
                                value={subpart.matrix_data?.col_headers?.[0] || ""}
                                placeholder="[e.g. Hormone / Organ]"
                                onChange={(e) => {
                                  const cur = subpart.matrix_data?.col_headers || ["", ""];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    matrix_data: { ...n.matrix_data, col_headers: [e.target.value, cur[1] || ""] },
                                  }));
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>Column 2 Header</label>
                              <input
                                type="text"
                                className="input"
                                disabled={readOnly}
                                value={subpart.matrix_data?.col_headers?.[1] || ""}
                                placeholder="[e.g. Primary Target Organ]"
                                onChange={(e) => {
                                  const cur = subpart.matrix_data?.col_headers || ["", ""];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    matrix_data: { ...n.matrix_data, col_headers: [cur[0] || "", e.target.value] },
                                  }));
                                }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                              Matrix Table Rows ({subpart.matrix_data?.rows?.length || 0})
                            </label>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => {
                                  const rows = subpart.matrix_data?.rows || [];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    matrix_data: { ...n.matrix_data, rows: [...rows, { item: "", expected: "" }] },
                                  }));
                                }}
                              >
                                <SvgIcon name="plus" size={12} /> Add Row
                              </button>
                            )}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {(subpart.matrix_data?.rows || []).map((row, rIdx) => (
                              <div key={rIdx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", alignItems: "center" }}>
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={row.item}
                                  placeholder={`[Item ${rIdx + 1}]`}
                                  onChange={(e) => {
                                    const updatedRows = [...(subpart.matrix_data?.rows || [])];
                                    updatedRows[rIdx] = { ...updatedRows[rIdx], item: e.target.value };
                                    updateNode(subpart.id, (n) => ({
                                      ...n,
                                      matrix_data: { ...n.matrix_data, rows: updatedRows },
                                    }));
                                  }}
                                />
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={row.expected}
                                  placeholder={`[Expected match ${rIdx + 1}]`}
                                  onChange={(e) => {
                                    const updatedRows = [...(subpart.matrix_data?.rows || [])];
                                    updatedRows[rIdx] = { ...updatedRows[rIdx], expected: e.target.value };
                                    updateNode(subpart.id, (n) => ({
                                      ...n,
                                      matrix_data: { ...n.matrix_data, rows: updatedRows },
                                    }));
                                  }}
                                />
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => {
                                      const updatedRows = (subpart.matrix_data?.rows || []).filter((_, i) => i !== rIdx);
                                      updateNode(subpart.id, (n) => ({
                                        ...n,
                                        matrix_data: { ...n.matrix_data, rows: updatedRows },
                                      }));
                                    }}
                                  >
                                    <SvgIcon name="trash" size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* FORMAT 7: LABELLED BIOLOGICAL DRAWINGS */}
                      {subpart.format_type === "structured_drawing" && (
                        <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <div>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
                              Drawing Instructions &amp; Required Scale
                            </label>
                            <input
                              type="text"
                              className="input"
                              disabled={readOnly}
                              value={subpart.drawing_prompt || ""}
                              placeholder="[e.g. Draw a neat labelled line diagram showing a cross section of a dicot stem...]"
                              onChange={(e) => updateNode(subpart.id, (n) => ({ ...n, drawing_prompt: e.target.value }))}
                            />
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                              Required Structures / Labelling Checklist ({subpart.required_labels?.length || 0})
                            </label>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => {
                                  const labels = subpart.required_labels || [];
                                  updateNode(subpart.id, (n) => ({
                                    ...n,
                                    required_labels: [...labels, ""],
                                  }));
                                }}
                              >
                                <SvgIcon name="plus" size={12} /> Add Label Checklist Item
                              </button>
                            )}
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
                            {(subpart.required_labels || []).map((lbl, lIdx) => (
                              <div key={lIdx} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                                <input
                                  type="text"
                                  className="input"
                                  disabled={readOnly}
                                  value={lbl}
                                  placeholder={`[Label item ${lIdx + 1} e.g. Epidermis / Endodermis]`}
                                  onChange={(e) => {
                                    const updatedLabels = [...(subpart.required_labels || [])];
                                    updatedLabels[lIdx] = e.target.value;
                                    updateNode(subpart.id, (n) => ({ ...n, required_labels: updatedLabels }));
                                  }}
                                />
                                {!readOnly && (
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => {
                                      const updatedLabels = (subpart.required_labels || []).filter((_, i) => i !== lIdx);
                                      updateNode(subpart.id, (n) => ({ ...n, required_labels: updatedLabels }));
                                    }}
                                  >
                                    <SvgIcon name="trash" size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Strict A/L Marking Flags */}
                      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", paddingTop: "0.4rem", borderTop: "1px dashed var(--border)" }}>
                        <label style={{ fontSize: "0.76rem", display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={subpart.strict_marking_rules?.require_correct_spelling || false}
                            onChange={(e) => {
                              updateNode(subpart.id, (n) => ({
                                ...n,
                                strict_marking_rules: {
                                  ...n.strict_marking_rules,
                                  require_correct_spelling: e.target.checked,
                                },
                              }));
                            }}
                          />
                          Strict Scientific Spelling
                        </label>

                        <label style={{ fontSize: "0.76rem", display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={subpart.strict_marking_rules?.require_units || false}
                            onChange={(e) => {
                              updateNode(subpart.id, (n) => ({
                                ...n,
                                strict_marking_rules: {
                                  ...n.strict_marking_rules,
                                  require_units: e.target.checked,
                                },
                              }));
                            }}
                          />
                          Require Standard Units
                        </label>

                        <label style={{ fontSize: "0.76rem", display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={subpart.strict_marking_rules?.require_binomial_format || false}
                            onChange={(e) => {
                              updateNode(subpart.id, (n) => ({
                                ...n,
                                strict_marking_rules: {
                                  ...n.strict_marking_rules,
                                  require_binomial_format: e.target.checked,
                                },
                              }));
                            }}
                          />
                          Binomial Nomenclature
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Form Submission Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          {isComplete ? (
            <span style={{ color: "var(--success)", fontWeight: 700 }}>&#10003; 40/40 Raw Points allocated (100 scaled marks)</span>
          ) : isOverAllocated ? (
            <span style={{ color: "var(--danger)", fontWeight: 700 }}>&#9888; Over-allocated ({totalRawPoints}/40 pts). Reduce leaf points before saving.</span>
          ) : (
            <span>Allocated: {totalRawPoints} / 40 Raw Points ({scaledMarks} / 100 Marks)</span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {onClearForm ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClearForm}
              disabled={isSubmitting}
              title="Remove question structure and return to blank state"
            >
              Clear Form
            </button>
          ) : onResetForm ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onResetForm}
              disabled={isSubmitting}
              title="Remove question structure and return to blank state"
            >
              Clear Form
            </button>
          ) : null}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (onResetInputs) {
                onResetInputs();
                return;
              }
              onChangeStemText("");
              if (onChangeDiagramUrl) onChangeDiagramUrl("");

              function clearNodeContent(list: StructuredNode[]): StructuredNode[] {
                return list.map((node) => ({
                  ...node,
                  prompt: "",
                  model_answer: "",
                  marking_rubric_description: "",
                  answer_checklist: [],
                  diagram_info: {
                    ...node.diagram_info,
                    image_url: "",
                    requires_image: false,
                    image_description: "",
                  },
                  children: node.children && node.children.length > 0 ? clearNodeContent(node.children) : [],
                }));
              }

              onChangeNodes(reindexTreeLabels(clearNodeContent(nodes)));
            }}
            disabled={isSubmitting}
            title="Clear all text fields and reset inputs for this structure"
          >
            Reset
          </button>

          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: "0.9rem", padding: "0.55rem 1.4rem", fontWeight: 700 }}
            disabled={isSubmitting || isOverAllocated}
            onClick={onSaveQuestion}
          >
            {isSubmitting
              ? "Saving Structured Question..."
              : isEditingExisting
              ? "Update Structured Question"
              : "Save Structured Question to Paper"}
          </button>
        </div>
      </div>
    </div>
  );
}
