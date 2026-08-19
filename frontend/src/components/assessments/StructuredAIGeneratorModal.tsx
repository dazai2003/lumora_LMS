"use client";

import React, { useState } from "react";
import SvgIcon from "@/components/SvgIcon";
import api from "@/lib/api";

interface StructuredAIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId?: number;
  units?: { id: number; title: string }[];
  onCandidatesGenerated: (candidates: any[]) => void;
}

export const OFFICIAL_STRUCTURED_WEIGHTS: Record<string, { label: string; weight: number }> = {
  structured_direct_recall: { label: "Direct Factual Recall & Naming", weight: 53.9 },
  structured_conceptual: { label: "Short Conceptual Explanations", weight: 34.3 },
  structured_sequential: { label: "Sequential Pathways & Chronology", weight: 3.9 },
  structured_comparison: { label: "Side-by-Side Comparisons", weight: 2.9 },
  structured_diagram: { label: "Diagrammatic / Genetics Deductions", weight: 2.0 },
  structured_matrix: { label: "Structured Matrix Tables", weight: 1.0 },
  structured_drawing: { label: "Labelled Biological Drawings", weight: 1.0 },
};

export default function StructuredAIGeneratorModal({
  isOpen,
  onClose,
  courseId,
  units = [],
  onCandidatesGenerated,
}: StructuredAIGeneratorModalProps) {
  const [presetMode, setPresetMode] = useState<"full_paper" | "custom">("full_paper");
  const [questionCount, setQuestionCount] = useState<number>(4);
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [difficultyMode, setDifficultyMode] = useState<"easy" | "balanced" | "challenging">("balanced");
  const [cognitiveMode, setCognitiveMode] = useState<"remember" | "understand" | "apply" | "analyze">("understand");
  const [customInstruction, setCustomInstruction] = useState<string>("");
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Distribution weights state
  const [distribution, setDistribution] = useState<Record<string, number>>({
    structured_direct_recall: 53.9,
    structured_conceptual: 34.3,
    structured_sequential: 3.9,
    structured_comparison: 2.9,
    structured_diagram: 2.0,
    structured_matrix: 1.0,
    structured_drawing: 1.0,
  });

  if (!isOpen) return null;

  // Restore Official Distribution when switching back to full_paper preset
  const handleSelectPreset = (mode: "full_paper" | "custom") => {
    setPresetMode(mode);
    if (mode === "full_paper") {
      setDistribution({
        structured_direct_recall: 53.9,
        structured_conceptual: 34.3,
        structured_sequential: 3.9,
        structured_comparison: 2.9,
        structured_diagram: 2.0,
        structured_matrix: 1.0,
        structured_drawing: 1.0,
      });
      setQuestionCount(4);
    }
  };

  // Equal re-balancing algorithm for format sliders
  const handleSliderChange = (changedKey: string, newValue: number) => {
    if (presetMode !== "custom") setPresetMode("custom");

    const keys = Object.keys(distribution);
    const otherKeys = keys.filter((k) => k !== changedKey);
    const oldVal = distribution[changedKey] || 0;
    const diff = newValue - oldVal;

    if (otherKeys.length === 0) return;

    // Distribute diff equally across all other categories
    const share = diff / otherKeys.length;
    const updated: Record<string, number> = { ...distribution, [changedKey]: newValue };

    let currentSum = newValue;
    otherKeys.forEach((k) => {
      const adjusted = Math.max(0, (distribution[k] || 0) - share);
      updated[k] = Math.round(adjusted * 10) / 10;
      currentSum += updated[k];
    });

    // Fix rounding sum to exactly 100%
    const sumDiff = Math.round((100.0 - currentSum) * 10) / 10;
    if (sumDiff !== 0 && otherKeys.length > 0) {
      updated[otherKeys[0]] = Math.round((updated[otherKeys[0]] + sumDiff) * 10) / 10;
    }

    setDistribution(updated);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const candidates = await api.generateStructuredQuestions({
        question_count: questionCount,
        course_id: courseId,
        unit_ids: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
        custom_instruction: customInstruction.trim() || undefined,
      });

      onCandidatesGenerated(candidates);
      onClose();
    } catch (err: any) {
      console.error("AI Structured Question Generation failed", err);
      setError(err?.message || "Failed to generate structured AI candidates.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "880px", width: "95vw", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SvgIcon name="sparkles" size={22} style={{ color: "var(--accent-primary)" }} />
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
                Generate Paper II Part A Structured Questions with AI
              </h2>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Author 4 compulsory 100-mark structured questions using syllabus grounding &amp; 7 assessment patterns
              </span>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: "0.3rem 0.6rem" }} onClick={onClose} disabled={generating}>
            <SvgIcon name="x" size={16} />
          </button>
        </div>

        {error && (
          <div className="card" style={{ padding: "0.85rem 1rem", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            <SvgIcon name="alert-triangle" size={16} style={{ marginRight: "0.4rem" }} />
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "75vh", overflowY: "auto", paddingRight: "0.25rem" }}>
          {/* Section 1: Generation Preset */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
              1. Generation Preset
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  background: presetMode === "full_paper" ? "var(--accent-subtle, rgba(99, 102, 241, 0.12))" : "var(--bg-secondary)",
                  border: presetMode === "full_paper" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                  cursor: "pointer",
                }}
                onClick={() => handleSelectPreset("full_paper")}
              >
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.2rem" }}>
                  A-Level Biology Paper II Part A (Official)
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Locks official 4-question paper structure &amp; 7-format statistical distribution weights.
                </div>
              </div>

              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  background: presetMode === "custom" ? "var(--accent-subtle, rgba(99, 102, 241, 0.12))" : "var(--bg-secondary)",
                  border: presetMode === "custom" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                  cursor: "pointer",
                }}
                onClick={() => handleSelectPreset("custom")}
              >
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.2rem" }}>
                  Custom Assessment Preset
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Custom question count &amp; editable format distribution percentages.
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Target Questions Control */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
                2. Target Questions (40 Raw Pts / 100 Marks each)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="range"
                  min="1"
                  max="4"
                  className="input"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                  disabled={presetMode === "full_paper"}
                />
                <span className="badge badge-primary" style={{ fontSize: "0.85rem", minWidth: "90px", textAlign: "center" }}>
                  {questionCount} {questionCount === 1 ? "Question" : "Questions"}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
                Difficulty &amp; Progression Model
              </label>
              <select className="select" value={difficultyMode} onChange={(e: any) => setDifficultyMode(e.target.value)}>
                <option value="easy">Easy (Foundational Factual Recall)</option>
                <option value="balanced">Balanced (Official A/L Progressive Difficulty)</option>
                <option value="challenging">Challenging (Deep Analysis &amp; Deduction)</option>
              </select>
            </div>
          </div>

          {/* Section 3: Question Type Distribution Sliders */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                3. Question Type Format Distribution (Must total 100%)
              </label>
              {presetMode === "custom" && (
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--accent-primary)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                  onClick={() => handleSelectPreset("full_paper")}
                >
                  Restore Official Distribution
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", padding: "0.85rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              {Object.entries(OFFICIAL_STRUCTURED_WEIGHTS).map(([key, info]) => {
                const currentWeight = distribution[key] || 0;
                return (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "260px 1fr 65px", gap: "0.75rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{info.label}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      disabled={presetMode === "full_paper"}
                      value={currentWeight}
                      onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                    />
                    <span className="badge badge-secondary" style={{ fontSize: "0.75rem", textAlign: "right" }}>
                      {currentWeight.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Content Scope & Units */}
          {units.length > 0 && (
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>
                4. Content Scope &amp; Curriculum Units
              </label>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {units.map((u) => {
                  const isChecked = selectedUnitIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`btn ${isChecked ? "btn-primary" : "btn-secondary"}`}
                      style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
                      onClick={() => {
                        if (isChecked) setSelectedUnitIds(selectedUnitIds.filter((id) => id !== u.id));
                        else setSelectedUnitIds([...selectedUnitIds, u.id]);
                      }}
                    >
                      {u.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 5: Teacher Custom Guidance */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
              5. Custom Teacher Instructions (Optional)
            </label>
            <input
              type="text"
              className="input"
              value={customInstruction}
              placeholder="e.g. Focus on Unit 2 water potential equations and Unit 3 enzyme kinetics..."
              onChange={(e) => setCustomInstruction(e.target.value)}
            />
          </div>

          {/* Generation Summary Card */}
          <div style={{ padding: "0.85rem 1.1rem", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.08)", border: "1px solid var(--accent-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-primary)", marginBottom: "0.15rem" }}>
                Generation Summary
              </div>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {questionCount} Structured Questions &bull; {questionCount * 40} Raw Points &bull; {questionCount * 100} Final Marks
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                Preset: {presetMode === "full_paper" ? "Official A-Level Biology" : "Custom"} &bull; RAG Source Grounding Active
              </div>
            </div>

            <button className="btn btn-primary" style={{ padding: "0.55rem 1.25rem", fontSize: "0.88rem" }} onClick={handleGenerate} disabled={generating}>
              <SvgIcon name="sparkles" size={16} /> {generating ? "Generating Questions..." : "Generate Structured Questions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
