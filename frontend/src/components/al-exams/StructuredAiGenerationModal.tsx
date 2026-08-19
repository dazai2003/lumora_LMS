"use client";

import React, { useState, useEffect, useMemo } from "react";
import SvgIcon from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import api from "@/lib/api";
import {
  StructuredNode,
  reindexTreeLabels,
  calculateNodePoints,
  calculateTotalTreeRawPoints,
  createBlankNode,
  insertChildNode,
  insertSiblingNode,
  deleteNodeById,
  duplicateNode,
  moveNode,
  getStructureSummary,
} from "@/lib/alStructuredTreeUtils";
import { STRUCTURED_FORMAT_OPTIONS } from "./StructuredSkeletonBuilder";
import AILoadingProgressBox from "./AILoadingProgressBox";
import AIGenerationErrorAlert from "./AIGenerationErrorAlert";
import { classifyAIError, ClassifiedAIError } from "@/lib/aiErrorClassifier";

export interface StructuredAiGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Array<{ id: number; title: string }>;
  initialCourseId?: number;
  initialUnits?: Array<{ id: number; title: string; unit_number?: number }>;
  onGenerate: (data: {
    question_count: number;
    course_id: number;
    unit_ids: number[];
    custom_instruction: string;
    custom_blueprints: any[];
    difficulty_mode: string;
    cognitive_mode: string;
  }) => Promise<void>;
  isGenerating: boolean;
}

// Researched Sri Lankan A/L Paper 2A Empirical Reference Percentages (Guidance Only)
export const AL_PAPER_2A_REFERENCE_DISTRIBUTION = [
  { key: "structured_direct_recall", label: "Direct Factual Recall & Naming", pct: 53.9 },
  { key: "structured_conceptual", label: "Short Conceptual Explanation / Function", pct: 34.3 },
  { key: "structured_sequential", label: "Sequential Pathway / Chronology", pct: 3.9 },
  { key: "structured_comparison", label: "Side-by-Side Comparison", pct: 2.9 },
  { key: "structured_diagram", label: "Diagrammatic / Genetics Deduction", pct: 2.0 },
  { key: "structured_matrix", label: "Structured Matrix Table", pct: 1.0 },
  { key: "structured_drawing", label: "Labelled Biological Drawing", pct: 1.0 },
];

function createDefaultQuestionSkeleton(qNum: number): StructuredNode[] {
  const nodeA = createBlankNode("structured_direct_recall", 10);
  nodeA.children = [
    createBlankNode("structured_direct_recall", 2),
    createBlankNode("structured_direct_recall", 2),
    createBlankNode("structured_conceptual", 6),
  ];
  const nodeB = createBlankNode("structured_comparison", 14);
  nodeB.children = [
    createBlankNode("structured_comparison", 6),
    createBlankNode("structured_conceptual", 4),
    createBlankNode("structured_sequential", 4),
  ];
  const nodeC = createBlankNode("structured_conceptual", 16);
  nodeC.children = [
    createBlankNode("structured_matrix", 8),
    createBlankNode("structured_conceptual", 8),
  ];
  return [nodeA, nodeB, nodeC];
}

export type GenerationStage = "idle" | "validating" | "grounding" | "generating" | "verifying" | "complete" | "error";

export default function StructuredAiGenerationModal({
  isOpen,
  onClose,
  courses,
  initialCourseId,
  initialUnits = [],
  onGenerate,
  isGenerating: externalGenerating = false,
}: StructuredAiGenerationModalProps) {
  // 1. Question Count (1 to 5)
  const [questionCount, setQuestionCount] = useState<number>(4);

  // 2. Active Tab for Question Config (0 to 4)
  const [activeQuestionTab, setActiveQuestionTab] = useState<number>(0);
  const [showSummaryPreview, setShowSummaryPreview] = useState<boolean>(false);

  // 3. Multi-Question Blueprints State
  const [blueprints, setBlueprints] = useState<Array<{
    question_number: number;
    theme?: string;
    structured_subparts_json: StructuredNode[];
  }>>(() => {
    return [1, 2, 3, 4, 5].map((qNum) => ({
      question_number: qNum,
      theme: `Question ${qNum}`,
      structured_subparts_json: createDefaultQuestionSkeleton(qNum),
    }));
  });

  // 4. Course & Unit Grounding
  const [selectedCourseId, setSelectedCourseId] = useState<number>(
    initialCourseId || (courses && courses.length > 0 ? courses[0].id : 0)
  );
  const [availableUnits, setAvailableUnits] = useState<any[]>(initialUnits);
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>(
    initialUnits.map((u) => u.id)
  );
  const [loadingUnits, setLoadingUnits] = useState<boolean>(false);

  // 4b. Generation Mode Controls
  const [difficultyMode, setDifficultyMode] = useState<string>("balanced");
  const [cognitiveMode, setCognitiveMode] = useState<string>("recommended");

  // Dynamic Syllabus Units Lessons/Materials Detection (Phase 9)
  const { totalLessonsCount, totalMaterialsCount, lessonsWithMaterialsCount, selectedUnitsCount } = useMemo(() => {
    let lCount = 0;
    let mCount = 0;
    let lWithMCount = 0;
    let uCount = 0;
    for (const u of availableUnits) {
      if (selectedUnitIds.length === 0 || selectedUnitIds.includes(u.id)) {
        uCount += 1;
        for (const l of u.lessons || []) {
          lCount += 1;
          const matCount = l.material_count || (l.materials || []).length || 0;
          mCount += matCount;
          if (matCount > 0) lWithMCount += 1;
        }
      }
    }
    return { totalLessonsCount: lCount, totalMaterialsCount: mCount, lessonsWithMaterialsCount: lWithMCount, selectedUnitsCount: uCount };
  }, [availableUnits, selectedUnitIds]);

  // 5. Teacher Topic Focus / Custom Instructions
  const [customInstruction, setCustomInstruction] = useState<string>("");

  // 6. Generation Progress & Error States
  const [generationStage, setGenerationStage] = useState<GenerationStage>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [classifiedError, setClassifiedError] = useState<ClassifiedAIError | null>(null);
  const [aiLoadingStage, setAiLoadingStage] = useState<string | null>(null);

  const isProcessing = externalGenerating || (generationStage !== "idle" && generationStage !== "error" && generationStage !== "complete");

  // Sync Question Count with Blueprints array
  const handleQuestionCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(5, newCount));
    setQuestionCount(clamped);
    if (activeQuestionTab >= clamped) {
      setActiveQuestionTab(clamped - 1);
    }
  };

  // Fetch course units when course changes
  useEffect(() => {
    if (selectedCourseId > 0) {
      setLoadingUnits(true);
      api
        .listUnits(selectedCourseId)
        .then((data) => {
          const fetched = data || [];
          setAvailableUnits(fetched);
          setSelectedUnitIds(fetched.map((u: any) => u.id));
        })
        .catch(console.error)
        .finally(() => setLoadingUnits(false));
    }
  }, [selectedCourseId]);

  if (!isOpen) return null;

  const currentBlueprint = blueprints[activeQuestionTab] || blueprints[0];
  const currentNodes = currentBlueprint?.structured_subparts_json || [];
  const currentSummary = getStructureSummary(currentNodes);

  // Helper to update current question's nodes
  const updateCurrentNodes = (newNodes: StructuredNode[]) => {
    const reindexed = reindexTreeLabels(newNodes);
    setBlueprints((prev) =>
      prev.map((bp, idx) =>
        idx === activeQuestionTab ? { ...bp, structured_subparts_json: reindexed } : bp
      )
    );
  };

  // Helper to update node property
  const updateNodeProperty = (nodeId: string, updates: Partial<StructuredNode>) => {
    function recurse(list: StructuredNode[]): StructuredNode[] {
      return list.map((n) => {
        if (n.id === nodeId) {
          return { ...n, ...updates };
        }
        if (n.children && n.children.length > 0) {
          return { ...n, children: recurse(n.children) };
        }
        return n;
      });
    }
    updateCurrentNodes(recurse(currentNodes));
  };

  // Duplicate an entire question blueprint
  const handleDuplicateQuestion = (qIdx: number) => {
    if (questionCount >= 5) {
      alert("Maximum 5 questions allowed in structured blueprint.");
      return;
    }
    const source = blueprints[qIdx];
    const clonedNodes = JSON.parse(JSON.stringify(source.structured_subparts_json));
    const newBlueprints = [...blueprints];
    newBlueprints.splice(qIdx + 1, 0, {
      question_number: qIdx + 2,
      theme: source.theme,
      structured_subparts_json: reindexTreeLabels(clonedNodes),
    });
    newBlueprints.forEach((bp, i) => {
      bp.question_number = i + 1;
    });
    setBlueprints(newBlueprints);
    setQuestionCount(Math.min(5, questionCount + 1));
    setActiveQuestionTab(qIdx + 1);
  };

  // Pre-generation validation
  const validateBeforeGenerate = (): boolean => {
    if (selectedUnitIds.length === 0 && availableUnits.length > 0) {
      setGenerationError("Please select at least one syllabus unit for curriculum grounding.");
      return false;
    }

    const activeBps = blueprints.slice(0, questionCount);
    for (let i = 0; i < activeBps.length; i++) {
      const bp = activeBps[i];
      const summary = getStructureSummary(bp.structured_subparts_json);
      if (summary.isOverAllocated) {
        setGenerationError(`Question ${i + 1} exceeds 40 raw points (${summary.totalRawPoints} pts). Please adjust points before generating.`);
        setActiveQuestionTab(i);
        return false;
      }
      if (summary.totalRawPoints === 0 || bp.structured_subparts_json.length === 0) {
        setGenerationError(`Question ${i + 1} has no sections or 0 points allocated. Please configure its structure.`);
        setActiveQuestionTab(i);
        return false;
      }
    }
    return true;
  };

  const handleStartGeneration = async () => {
    setGenerationError(null);
    setClassifiedError(null);
    if (!validateBeforeGenerate()) return;

    setGenerationStage("validating");
    setAiLoadingStage("Analyzing selected lesson materials...");

    const stageTimer1 = setTimeout(() => setAiLoadingStage("Building structured question blueprints & subparts..."), 1200);
    const stageTimer2 = setTimeout(() => setAiLoadingStage("Generating structured A/L questions via Gemini AI..."), 2500);
    const stageTimer3 = setTimeout(() => setAiLoadingStage("Validating question schemas & 40.0 raw points hierarchy..."), 4000);

    try {
      const activeBps = blueprints.slice(0, questionCount).map((bp, i) => ({
        question_number: i + 1,
        theme: bp.theme?.trim() || `Question ${i + 1}`,
        points: calculateTotalTreeRawPoints(bp.structured_subparts_json),
        structured_subparts_json: bp.structured_subparts_json,
      }));

      await onGenerate({
        question_count: questionCount,
        course_id: selectedCourseId,
        unit_ids: selectedUnitIds,
        custom_instruction: customInstruction.trim(),
        custom_blueprints: activeBps,
        difficulty_mode: difficultyMode,
        cognitive_mode: cognitiveMode,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      setGenerationStage("complete");
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      console.error("Structured generation failed:", err);
      setGenerationStage("error");
      const classified = classifyAIError(err);
      setClassifiedError(classified);
    } finally {
      setAiLoadingStage(null);
    }
  };

  // Render recursive node tree for interactive editing
  const renderNodeHierarchyEditor = (nodes: StructuredNode[], depth: number = 0) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {nodes.map((node, idx) => {
          const isSection = depth === 0;
          const hasChildren = node.children && node.children.length > 0;
          const nodePoints = calculateNodePoints(node);

          return (
            <div
              key={node.id}
              style={{
                padding: isSection ? "0.85rem 1rem" : "0.6rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                background: isSection ? "var(--bg-card)" : "var(--bg-secondary)",
                border: isSection ? "1px solid var(--border)" : "1px solid rgba(255, 255, 255, 0.05)",
                marginLeft: depth > 0 ? "1rem" : 0,
              }}
            >
              {/* Node Header Row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 800, fontSize: isSection ? "0.95rem" : "0.85rem", color: "var(--accent-primary)" }}>
                    {isSection ? `Section ${node.label}` : node.label}
                  </span>

                  {!hasChildren ? (
                    <select
                      className="select"
                      style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem", width: "auto" }}
                      value={node.format_type || "structured_direct_recall"}
                      disabled={isProcessing}
                      onChange={(e) => updateNodeProperty(node.id, { format_type: e.target.value })}
                    >
                      {STRUCTURED_FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                      Container ({node.children?.length} subparts)
                    </span>
                  )}
                </div>

                {/* Points & Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {!hasChildren ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        className="input"
                        style={{ width: "55px", padding: "0.2rem 0.4rem", fontSize: "0.8rem", textAlign: "center", fontWeight: 700 }}
                        value={node.points || 2}
                        disabled={isProcessing}
                        onChange={(e) => updateNodeProperty(node.id, { points: Math.max(1, parseInt(e.target.value) || 1) })}
                      />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>pts</span>
                    </div>
                  ) : (
                    <span className="badge badge-info" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                      {nodePoints} pts total
                    </span>
                  )}

                  {/* Move Up/Down */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.72rem" }}
                    title="Move Up"
                    disabled={isProcessing || idx === 0}
                    onClick={() => updateCurrentNodes(moveNode(currentNodes, node.id, "up"))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.72rem" }}
                    title="Move Down"
                    disabled={isProcessing || idx === nodes.length - 1}
                    onClick={() => updateCurrentNodes(moveNode(currentNodes, node.id, "down"))}
                  >
                    ↓
                  </button>

                  {/* Add Subpart (if Section container) */}
                  {isSection && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                      disabled={isProcessing}
                      onClick={() => updateCurrentNodes(insertChildNode(currentNodes, node.id, "structured_direct_recall", 2))}
                    >
                      <SvgIcon name="plus" size={12} /> Add Subpart
                    </button>
                  )}

                  {/* Duplicate Node */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.72rem" }}
                    title="Duplicate node"
                    disabled={isProcessing}
                    onClick={() => updateCurrentNodes(duplicateNode(currentNodes, node.id, true))}
                  >
                    <SvgIcon name="copy" size={12} />
                  </button>

                  {/* Delete Node */}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.2rem 0.4rem", fontSize: "0.72rem", color: "var(--danger)" }}
                    title="Delete node"
                    disabled={isProcessing}
                    onClick={() => updateCurrentNodes(deleteNodeById(currentNodes, node.id))}
                  >
                    <SvgIcon name="trash" size={12} />
                  </button>
                </div>
              </div>

              {/* Recursive Children */}
              {hasChildren && (
                <div style={{ marginTop: "0.6rem", paddingLeft: "0.5rem", borderLeft: "2px solid var(--border)" }}>
                  {renderNodeHierarchyEditor(node.children || [], depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Modal
      title="Generate Structured Questions with AI — Blueprint Configuration Workspace"
      onClose={isProcessing ? () => {} : onClose}
      maxWidth="980px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", maxHeight: "78vh", overflowY: "auto", paddingRight: "0.4rem" }}>
        
        {/* Categorized AI Error Alert */}
        {classifiedError && !isProcessing && (
          <AIGenerationErrorAlert
            error={classifiedError}
            onRetry={handleStartGeneration}
            onDismiss={() => setClassifiedError(null)}
          />
        )}

        {/* Error Alert Banner */}
        {generationStage === "error" && generationError && !classifiedError && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1.5px solid var(--danger)",
              color: "var(--text-primary)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger)", fontWeight: 700, fontSize: "0.95rem" }}>
              <SvgIcon name="alert-triangle" size={18} />
              <span>Generation Failed</span>
            </div>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.45, color: "var(--text-secondary)" }}>
              {generationError}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}
                onClick={() => setGenerationStage("idle")}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}
                onClick={handleStartGeneration}
              >
                <SvgIcon name="sparkle" size={14} /> Try Again
              </button>
            </div>
          </div>
        )}


        {/* 1. TARGET QUESTION COUNT CONTROL */}
        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", opacity: isProcessing ? 0.7 : 1, pointerEvents: isProcessing ? "none" : "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <div>
              <label style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0 }}>
                1. TARGET QUESTION COUNT
              </label>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                Select how many compulsory structured questions (1 to 5) to configure in this paper blueprint.
              </p>
            </div>

            {/* Stepper Controls: − 4 + */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-card)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.2rem 0.6rem", fontSize: "1rem", fontWeight: 700, lineHeight: 1 }}
                onClick={() => handleQuestionCountChange(questionCount - 1)}
                disabled={isProcessing || questionCount <= 1}
              >
                −
              </button>
              <span style={{ fontSize: "1.05rem", fontWeight: 800, minWidth: "24px", textAlign: "center", color: "var(--accent-primary)" }}>
                {questionCount}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.2rem 0.6rem", fontSize: "1rem", fontWeight: 700, lineHeight: 1 }}
                onClick={() => handleQuestionCountChange(questionCount + 1)}
                disabled={isProcessing || questionCount >= 5}
              >
                +
              </button>
            </div>
          </div>

          {/* Slider 1 ───────── 5 */}
          <div style={{ padding: "0.3rem 0" }}>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={questionCount}
              disabled={isProcessing}
              onChange={(e) => handleQuestionCountChange(parseInt(e.target.value) || 4)}
              style={{ width: "100%", accentColor: "var(--accent-primary)", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem", fontWeight: 600 }}>
              <span>1 Question (40 pts)</span>
              <span>2 Questions (80 pts)</span>
              <span>3 Questions (120 pts)</span>
              <span>4 Questions (160 pts)</span>
              <span>5 Questions (200 pts)</span>
            </div>
          </div>
        </div>

        {/* 2. INFORMATIONAL A/L REFERENCE DISTRIBUTION (GUIDANCE ONLY) */}
        <div className="card" style={{ padding: "1rem 1.1rem", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <SvgIcon name="info" size={16} /> A/L Reference Distribution (Guidance Only)
            </span>
            <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
              Non-enforced reference
            </span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.6rem 0", lineHeight: 1.4 }}>
            These percentages are provided as guidance based on historical A/L Paper 2A patterns. You can freely override them when designing your assessment.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.4rem" }}>
            {AL_PAPER_2A_REFERENCE_DISTRIBUTION.map((item) => (
              <div
                key={item.key}
                style={{
                  padding: "0.35rem 0.55rem",
                  background: "var(--bg-card)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.74rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
                <span style={{ fontWeight: 800, color: "var(--accent-primary)", marginLeft: "0.3rem" }}>
                  {item.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. STRUCTURED SKELETON / BLUEPRINT BUILDER */}
        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", opacity: isProcessing ? 0.7 : 1, pointerEvents: isProcessing ? "none" : "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <label style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                2. STRUCTURED QUESTION BLUEPRINT
              </label>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.15rem 0 0 0" }}>
                Define the exact question tree hierarchy, formats, and points. The AI strictly populates this skeleton without altering your structure.
              </p>
            </div>

            {/* Live Point Status Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {currentSummary.isComplete && (
                <span className="badge badge-success" style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0.35rem 0.65rem" }}>
                  40 / 40 pts ✓
                </span>
              )}
              {currentSummary.isOverAllocated && (
                <span className="badge badge-danger" style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0.35rem 0.65rem" }}>
                  {currentSummary.totalRawPoints} / 40 pts — Over-allocated!
                </span>
              )}
              {!currentSummary.isComplete && !currentSummary.isOverAllocated && (
                <span className="badge badge-info" style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0.35rem 0.65rem" }}>
                  {currentSummary.totalRawPoints} / 40 pts — {currentSummary.pointsRemaining} pts remaining
                </span>
              )}
            </div>
          </div>

          {/* Question Tabs: Question 1..Question N */}
          <div style={{ display: "flex", gap: "0.4rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.85rem", overflowX: "auto" }}>
            {Array.from({ length: questionCount }).map((_, qIdx) => {
              const isActive = activeQuestionTab === qIdx;
              const bp = blueprints[qIdx];
              const pts = calculateTotalTreeRawPoints(bp?.structured_subparts_json || []);

              return (
                <button
                  key={qIdx}
                  type="button"
                  onClick={() => setActiveQuestionTab(qIdx)}
                  className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "0.82rem", padding: "0.35rem 0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                  disabled={isProcessing}
                >
                  <span>Question {qIdx + 1}</span>
                  <span style={{ fontSize: "0.72rem", opacity: 0.85, fontWeight: 700 }}>
                    ({pts} pts)
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Question Blueprint Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                  Question {activeQuestionTab + 1} Structure ({currentSummary.sections.length} Sections &middot; {currentSummary.sections.reduce((s, x) => s + x.leafCount, 0)} Subparts)
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  disabled={isProcessing}
                  onClick={() => updateCurrentNodes(insertSiblingNode(currentNodes))}
                >
                  <SvgIcon name="plus" size={14} /> Add Section
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  disabled={isProcessing}
                  onClick={() => handleDuplicateQuestion(activeQuestionTab)}
                  title="Duplicate Question Blueprint"
                >
                  <SvgIcon name="copy" size={14} /> Duplicate Question
                </button>
              </div>
            </div>

            {/* Tree Hierarchy Editor */}
            {currentNodes.length > 0 ? (
              renderNodeHierarchyEditor(currentNodes, 0)
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border)" }}>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  No sections in Question {activeQuestionTab + 1} blueprint.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}
                  disabled={isProcessing}
                  onClick={() => updateCurrentNodes(createDefaultQuestionSkeleton(activeQuestionTab + 1))}
                >
                  <SvgIcon name="plus" size={14} /> Load Default 40-pt Skeleton
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. CONTENT SCOPE (COURSE & SYLLABUS UNITS CHECKBOXES) */}
        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", opacity: isProcessing ? 0.7 : 1, pointerEvents: isProcessing ? "none" : "auto" }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 700, display: "block", marginBottom: "0.6rem" }}>
            3. CONTENT SCOPE &amp; CURRICULUM GROUNDING
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Target Course</label>
              <select
                className="select"
                value={selectedCourseId}
                disabled={isProcessing}
                onChange={(e) => setSelectedCourseId(parseInt(e.target.value) || 0)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Units Multi-Select Checkboxes */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                  Syllabus Units ({selectedUnitIds.length} of {availableUnits.length} units selected)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  disabled={isProcessing}
                  onClick={() => {
                    if (selectedUnitIds.length === availableUnits.length) {
                      setSelectedUnitIds([]);
                    } else {
                      setSelectedUnitIds(availableUnits.map((u) => u.id));
                    }
                  }}
                >
                  {selectedUnitIds.length === availableUnits.length ? "Clear All" : "Select All Units"}
                </button>
              </div>

              {loadingUnits ? (
                <div style={{ padding: "0.85rem", textAlign: "center", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Loading course units...
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem", maxHeight: "130px", overflowY: "auto", border: "1px solid var(--border)", padding: "0.6rem", borderRadius: "var(--radius-sm)", background: "var(--bg-card)" }}>
                  {availableUnits.map((u) => {
                    const isChecked = selectedUnitIds.includes(u.id);
                    return (
                      <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: isProcessing ? "not-allowed" : "pointer" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isProcessing}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedUnitIds((prev) => prev.filter((id) => id !== u.id));
                            } else {
                              setSelectedUnitIds((prev) => [...prev, u.id]);
                            }
                          }}
                        />
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {u.unit_number ? `Unit ${u.unit_number}: ` : ""}{u.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Informational Learning Material Status Banner (Phase 9) */}
            {totalMaterialsCount > 0 ? (
              lessonsWithMaterialsCount === totalLessonsCount ? (
                <div style={{ padding: "0.65rem 0.85rem", background: "rgba(16, 185, 129, 0.08)", color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                  <SvgIcon name="check" size={16} style={{ color: "var(--color-success, #10b981)" }} />
                  <span>
                    <strong>Learning Material Available:</strong> {totalLessonsCount} lessons &middot; {totalMaterialsCount} PDF/media resources indexed across {selectedUnitsCount} selected units.
                  </span>
                </div>
              ) : (
                <div style={{ padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.08)", color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.25)" }}>
                  <SvgIcon name="layers" size={16} style={{ color: "var(--accent-primary)" }} />
                  <span>
                    <strong>Partial Learning Material:</strong> Available for {lessonsWithMaterialsCount} of {totalLessonsCount} lessons ({totalMaterialsCount} resources indexed). Remaining concepts will be grounded in syllabus standards.
                  </span>
                </div>
              )
            ) : (
              <div style={{ padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.06)", color: "var(--text-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                <SvgIcon name="info" size={16} style={{ color: "var(--accent-primary)" }} />
                <span>
                  No uploaded learning material attached to selected units. Lumora will generate questions using core A/L syllabus concepts.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5. ASSESSMENT PARAMETERS & TEACHER TOPIC FOCUS PROMPT */}
        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", opacity: isProcessing ? 0.7 : 1, pointerEvents: isProcessing ? "none" : "auto" }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 700, display: "block", marginBottom: "0.6rem" }}>
            4. ASSESSMENT PARAMETERS &amp; TOPIC FOCUS
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "0.85rem" }}>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Difficulty Calibration</label>
              <select className="select" value={difficultyMode} disabled={isProcessing} onChange={(e) => setDifficultyMode(e.target.value)}>
                <option value="balanced">Balanced (Official A/L Standard)</option>
                <option value="easy">Introductory / Foundational Focus</option>
                <option value="hard">Challenging / Distinction Grade Target</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Cognitive Level Bias</label>
              <select className="select" value={cognitiveMode} disabled={isProcessing} onChange={(e) => setCognitiveMode(e.target.value)}>
                <option value="recommended">Recommended (Understand + Apply + Analyze)</option>
                <option value="recall">Factual Recall &amp; Definitions</option>
                <option value="analysis">Higher-Order Deductions &amp; Synthesis</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
              Teacher Topic Focus / Custom Instructions (Optional)
            </label>
            <textarea
              rows={2}
              className="textarea"
              value={customInstruction}
              disabled={isProcessing}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="e.g. Focus Question 1 on Plant Water Relations (ψw equations), Question 2 on Nephron Counter-Current multiplier, Question 3 on Dihybrid crosses..."
            />
          </div>
        </div>

        {/* 6. BLUEPRINT SUMMARY PREVIEW */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.82rem", padding: "0.35rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={() => setShowSummaryPreview(!showSummaryPreview)}
          >
            <SvgIcon name="file-text" size={14} />
            {showSummaryPreview ? "Hide Blueprint Summary" : "View Paper Blueprint Summary"}
          </button>
        </div>

        {showSummaryPreview && (
          <div className="card" style={{ padding: "1rem", background: "var(--bg-card)", border: "1px solid var(--border)", fontSize: "0.82rem" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.88rem", fontWeight: 700, color: "var(--accent-primary)" }}>
              STRUCTURED PAPER BLUEPRINT SUMMARY ({questionCount} Questions)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {blueprints.slice(0, questionCount).map((bp, qIdx) => {
                const summary = getStructureSummary(bp.structured_subparts_json);
                return (
                  <div key={qIdx} style={{ padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: "0.3rem" }}>
                      <span>Question {qIdx + 1}</span>
                      <span className={summary.isOverAllocated ? "badge badge-danger" : "badge badge-info"}>
                        {summary.totalRawPoints} / 40 Raw Points ({summary.scaledMarks} Marks)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      {summary.sections.map((sec) => (
                        <div key={sec.id} style={{ marginLeft: "0.5rem" }}>
                          • Section {sec.label} — {sec.points} pts ({sec.leafCount} parts)
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Categorized AI Error Alert */}
        {classifiedError && !isProcessing && (
          <AIGenerationErrorAlert
            error={classifiedError}
            onRetry={handleStartGeneration}
            onDismiss={() => setClassifiedError(null)}
          />
        )}

        {/* LOADING OVERLAY / PROGRESS UI */}
        {isProcessing && (
          <AILoadingProgressBox
            questionType="structured"
            requestedCount={questionCount}
            loadingStage={aiLoadingStage || "Generating structured A/L questions via Gemini AI..."}
            subtext="Applying Sri Lankan G.C.E. A/L Biology curriculum grounding & schema validators."
            style={{ marginTop: "0.5rem" }}
          />
        )}

        {/* ACTION BUTTONS */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              border: "none",
              padding: "0.65rem 1.75rem",
              fontSize: "0.92rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
            onClick={handleStartGeneration}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <SvgIcon name="sparkle" size={16} />
                <span>Generate {questionCount} Structured Questions</span>
              </>
            )}
          </button>
        </div>

      </div>
    </Modal>
  );
}
