"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import SvgIcon from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";
import AILoadingProgressBox from "./AILoadingProgressBox";
import AIGenerationErrorAlert from "./AIGenerationErrorAlert";
import { classifyAIError, ClassifiedAIError } from "@/lib/aiErrorClassifier";
import {
  EssayStructureType,
  EssayBlueprintSubpartNode,
  EssayQuestionBlueprint,
  EssayPaperBlueprint,
  generateBlueprintId,
  createDefaultSingleCompleteBlueprint,
  createDefaultMultiPartBlueprint,
  createDefaultShortNotesBlueprint,
  createDefaultPaperBlueprint,
  reindexPaperBlueprint,
  calculateBlueprintQuestionMarks,
  validateEssayPaperBlueprint,
  saveBlueprintToStorage,
  loadBlueprintFromStorage,
} from "@/lib/alEssayBlueprintUtils";

export interface EssayAIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId?: string | number;
  startingQuestionNumber?: number; // default 5 (Q5 for Paper II Part B)
  courses?: Array<{ id: number; title: string }>;
  initialCourseId?: number;
  initialUnits?: Array<{ id: number; title: string; unit_number?: number; lessons?: any[] }>;
  onBlueprintFinalized: (blueprint: EssayPaperBlueprint) => void;
  onCandidatesGenerated?: (candidates: any[]) => void;
}

export default function EssayAIGeneratorModal({
  isOpen,
  onClose,
  assessmentId,
  startingQuestionNumber = 5,
  courses = [],
  initialCourseId,
  initialUnits = [],
  onBlueprintFinalized,
  onCandidatesGenerated,
}: EssayAIGeneratorModalProps) {
  const { addToast } = useToast();
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // 1. Target Question Count (1 to 5, default 3)
  const [questionCount, setQuestionCount] = useState<number>(3);

  // 2. Multi-Question Blueprint List
  const [blueprint, setBlueprint] = useState<EssayPaperBlueprint>(() => {
    return createDefaultPaperBlueprint(3, startingQuestionNumber, String(assessmentId || ""));
  });

  // 3. Course & Unit Grounding
  const [selectedCourseId, setSelectedCourseId] = useState<number>(
    initialCourseId || (courses && courses.length > 0 ? courses[0].id : 0)
  );
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>(
    initialUnits.map((u) => u.id)
  );

  // 4. View Mode: "configure" | "summary"
  const [viewMode, setViewMode] = useState<"configure" | "summary">("configure");
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // 5. AI Generation Execution State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeStageIndex, setActiveStageIndex] = useState<number>(0);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [generationError, setGenerationError] = useState<ClassifiedAIError | null>(null);
  const [difficultyMode, setDifficultyMode] = useState<string>("balanced");
  const [cognitiveMode, setCognitiveMode] = useState<string>("recommended");
  const [customInstruction, setCustomInstruction] = useState<string>("");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // 6. Attempt to load persisted blueprint on mount
  useEffect(() => {
    if (isOpen) {
      const persisted = loadBlueprintFromStorage(assessmentId);
      if (persisted && persisted.questions && persisted.questions.length > 0) {
        setBlueprint(persisted);
        setQuestionCount(persisted.target_question_count || persisted.questions.length);
      } else {
        const initial = createDefaultPaperBlueprint(3, startingQuestionNumber, String(assessmentId || ""));
        setBlueprint(initial);
        setQuestionCount(3);
      }
      setSaveSuccessMessage(null);
    }
  }, [isOpen, assessmentId, startingQuestionNumber]);

  // Validation Result
  const validation = useMemo(() => {
    return validateEssayPaperBlueprint(blueprint);
  }, [blueprint]);

  if (!isOpen) return null;

  // Handle Question Count Change (1 to 5)
  const handleTargetCountChange = (newCount: number) => {
    if (newCount < 1 || newCount > 5) return;
    setQuestionCount(newCount);

    const currentQuestions = [...(blueprint.questions || [])];

    if (newCount > currentQuestions.length) {
      // Add new question blueprints
      for (let i = currentQuestions.length; i < newCount; i++) {
        const order = i + 1;
        const qNum = startingQuestionNumber + i;
        if (i % 3 === 0) {
          currentQuestions.push(createDefaultSingleCompleteBlueprint(order, qNum, 40));
        } else if (i % 3 === 1) {
          currentQuestions.push(createDefaultMultiPartBlueprint(order, qNum, 40));
        } else {
          currentQuestions.push(createDefaultShortNotesBlueprint(order, qNum, 40));
        }
      }
    } else if (newCount < currentQuestions.length) {
      // Safely trim excess questions
      currentQuestions.splice(newCount);
    }

    const reindexed = reindexPaperBlueprint(currentQuestions, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      target_question_count: newCount,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
      questions: reindexed,
    };

    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  // Update Structure Type of a Specific Question
  const handleStructureTypeChange = (questionId: string, newType: EssayStructureType) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      if (newType === "SINGLE_COMPLETE") {
        return {
          ...q,
          structure_type: newType,
          children: [],
          marks: 40,
        };
      } else if (newType === "MULTI_PART") {
        return {
          ...q,
          structure_type: newType,
          marks: 40,
          children: [
            { id: generateBlueprintId("sub_roman"), order: 1, marks: 10, label: "(i)" },
            { id: generateBlueprintId("sub_roman"), order: 2, marks: 15, label: "(ii)" },
            { id: generateBlueprintId("sub_roman"), order: 3, marks: 15, label: "(iii)" },
          ],
        };
      } else {
        return {
          ...q,
          structure_type: newType,
          marks: 40,
          has_parent_instruction: true,
          children: [
            { id: generateBlueprintId("sub_topic"), order: 1, marks: 10, label: "(i)" },
            { id: generateBlueprintId("sub_topic"), order: 2, marks: 10, label: "(ii)" },
            { id: generateBlueprintId("sub_topic"), order: 3, marks: 20, label: "(iii)" },
          ],
        };
      }
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };

    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  // Update Max Marks for a Question
  const handleQuestionMarksChange = (questionId: string, val: number) => {
    const cleanMarks = Math.max(1, Number(val) || 1);
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id === questionId) {
        return { ...q, marks: cleanMarks };
      }
      return q;
    });

    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: updated,
      total_marks: updated.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  // Subparts Operations (Tree-safe)
  const handleAddSubpart = (questionId: string) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const currentChildren = q.children || [];
      const nextOrder = currentChildren.length + 1;
      const newSub: EssayBlueprintSubpartNode = {
        id: generateBlueprintId("sub_roman"),
        order: nextOrder,
        marks: 10,
      };

      return {
        ...q,
        children: [...currentChildren, newSub],
      };
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleAddNestedPart = (questionId: string, parentSubId: string) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const updatedChildren = (q.children || []).map((sub) => {
        if (sub.id !== parentSubId) return sub;

        const currentNested = sub.children || [];
        const nextOrder = currentNested.length + 1;
        const newNested: EssayBlueprintSubpartNode = {
          id: generateBlueprintId("sub_alpha"),
          order: nextOrder,
          marks: 5,
        };

        const nextNestedList = [...currentNested, newNested];
        const nextSubMarks = nextNestedList.reduce((sum, n) => sum + n.marks, 0);

        return {
          ...sub,
          marks: nextSubMarks,
          children: nextNestedList,
        };
      });

      return {
        ...q,
        children: updatedChildren,
      };
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleUpdateSubpartMarks = (questionId: string, subId: string, val: number) => {
    const cleanMarks = Math.max(1, Number(val) || 1);

    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const updatedChildren = (q.children || []).map((sub) => {
        if (sub.id === subId) {
          return { ...sub, marks: cleanMarks };
        }
        if (sub.children && sub.children.length > 0) {
          const updatedNested = sub.children.map((nested) =>
            nested.id === subId ? { ...nested, marks: cleanMarks } : nested
          );
          const derivedMarks = updatedNested.reduce((sum, n) => sum + n.marks, 0);
          return { ...sub, marks: derivedMarks, children: updatedNested };
        }
        return sub;
      });

      return { ...q, children: updatedChildren };
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleDeleteSubpart = (questionId: string, subId: string) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const filteredChildren = (q.children || [])
        .filter((sub) => sub.id !== subId)
        .map((sub) => {
          if (sub.children && sub.children.length > 0) {
            const filteredNested = sub.children.filter((n) => n.id !== subId);
            const derivedMarks = filteredNested.reduce((sum, n) => sum + n.marks, 0);
            return { ...sub, marks: derivedMarks, children: filteredNested };
          }
          return sub;
        });

      return { ...q, children: filteredChildren };
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleDuplicateSubpart = (questionId: string, subId: string) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const newChildren: EssayBlueprintSubpartNode[] = [];
      (q.children || []).forEach((sub) => {
        newChildren.push(sub);
        if (sub.id === subId) {
          newChildren.push({
            ...sub,
            id: generateBlueprintId("sub_dup"),
            children: (sub.children || []).map((n) => ({
              ...n,
              id: generateBlueprintId("sub_dup_nested"),
            })),
          });
        }
      });

      return { ...q, children: newChildren };
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleMoveSubpart = (questionId: string, subId: string, direction: "up" | "down") => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id !== questionId) return q;

      const list = [...(q.children || [])];
      const index = list.findIndex((s) => s.id === subId);
      if (index !== -1) {
        const targetIdx = direction === "up" ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < list.length) {
          const temp = list[index];
          list[index] = list[targetIdx];
          list[targetIdx] = temp;
          return { ...q, children: list };
        }
      }
      return q;
    });

    const reindexed = reindexPaperBlueprint(updated, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
    };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  // Question Node Level Operations (Duplicate, Move, Delete)
  const handleDuplicateQuestion = (questionId: string) => {
    if (blueprint.questions.length >= 5) {
      addToast("Maximum 5 essay questions allowed per paper blueprint.", "warning");
      return;
    }

    const current = [...(blueprint.questions || [])];
    const targetIdx = current.findIndex((q) => q.id === questionId);
    if (targetIdx === -1) return;

    const target = current[targetIdx];
    const duplicated: EssayQuestionBlueprint = {
      ...target,
      id: generateBlueprintId("q_dup"),
      children: (target.children || []).map((sub) => ({
        ...sub,
        id: generateBlueprintId("sub_dup"),
        children: (sub.children || []).map((nested) => ({
          ...nested,
          id: generateBlueprintId("nested_dup"),
        })),
      })),
    };

    current.splice(targetIdx + 1, 0, duplicated);
    const reindexed = reindexPaperBlueprint(current, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      target_question_count: reindexed.length,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };

    setQuestionCount(reindexed.length);
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
    addToast(`Question ${target.question_number} duplicated!`, "success");
  };

  const handleMoveQuestion = (questionId: string, direction: "up" | "down") => {
    const list = [...(blueprint.questions || [])];
    const index = list.findIndex((q) => q.id === questionId);
    if (index === -1) return;

    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    const reindexed = reindexPaperBlueprint(list, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      questions: reindexed,
    };

    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  const handleRemoveQuestion = (questionId: string) => {
    if (blueprint.questions.length <= 1) {
      addToast("At least 1 essay question blueprint is required.", "warning");
      return;
    }

    const filtered = (blueprint.questions || []).filter((q) => q.id !== questionId);
    const reindexed = reindexPaperBlueprint(filtered, startingQuestionNumber);
    const updatedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      target_question_count: reindexed.length,
      questions: reindexed,
      total_marks: reindexed.reduce((sum, q) => sum + q.marks, 0),
    };

    setQuestionCount(reindexed.length);
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
    addToast("Question blueprint removed.", "info");
  };

  // Toggle Short Notes Parent Instruction
  const handleToggleParentInstruction = (questionId: string) => {
    const updated = (blueprint.questions || []).map((q) => {
      if (q.id === questionId) {
        return { ...q, has_parent_instruction: !q.has_parent_instruction };
      }
      return q;
    });
    const updatedBlueprint: EssayPaperBlueprint = { ...blueprint, questions: updated };
    setBlueprint(updatedBlueprint);
    saveBlueprintToStorage(updatedBlueprint);
  };

  // Syllabus / Unit Selection
  const toggleUnit = (unitId: number) => {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  // Finalize Blueprint (No Gemini API call)
  const handleFinalize = () => {
    if (!validation.isValid) {
      addToast(validation.errors[0] || "Please resolve blueprint mark validation errors.", "error");
      return;
    }

    const finalizedBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      course_id: selectedCourseId || undefined,
      unit_ids: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
      total_marks: validation.totalMarks,
      updated_at: new Date().toISOString(),
    };

    // 1. Save to localStorage
    saveBlueprintToStorage(finalizedBlueprint);

    // 2. Deliver to parent Assessment Assembly Studio
    onBlueprintFinalized(finalizedBlueprint);

    setSaveSuccessMessage("Essay Blueprint finalized and saved successfully!");
    addToast("Essay AI Blueprint finalized and saved successfully!", "success");

    // Close modal cleanly after short confirmation
    setTimeout(() => {
      onClose();
    }, 600);
  };

  // Generate Essay Questions with AI (Phase 6 Workflow)
  const handleGenerateWithAI = async () => {
    if (!validation.isValid) {
      addToast(validation.errors[0] || "Cannot generate: Please resolve blueprint validation errors first.", "error");
      return;
    }

    setIsGenerating(true);
    setActiveStageIndex(0);
    setLoadingStage("Validating essay blueprints & rubric point allocations...");
    setGenerationError(null);

    // Scroll to top of modal body so progress is immediately in view
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    const currentBlueprint: EssayPaperBlueprint = {
      ...blueprint,
      course_id: selectedCourseId || undefined,
      unit_ids: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
      total_marks: validation.totalMarks,
      difficulty_mode: difficultyMode,
      cognitive_mode: cognitiveMode,
      custom_instruction: customInstruction.trim() || undefined,
      updated_at: new Date().toISOString(),
    };

    // Save blueprint to local storage before API invocation
    saveBlueprintToStorage(currentBlueprint);

    // Multi-stage progression timers for authentic UI feedback matching MCQ/Structured
    const t1 = setTimeout(() => {
      setActiveStageIndex(1);
      setLoadingStage("Checking learning resources & syllabus grounding...");
    }, 1200);
    const t2 = setTimeout(() => {
      setActiveStageIndex(2);
      setLoadingStage("Generating authentic essay questions via Gemini AI...");
    }, 2600);
    const t3 = setTimeout(() => {
      setActiveStageIndex(3);
      setLoadingStage("Validating subpart structure & Roman numeral items...");
    }, 4500);
    const t4 = setTimeout(() => {
      setActiveStageIndex(4);
      setLoadingStage("Validating itemized marking schemes & examiner criteria...");
    }, 6500);
    const t5 = setTimeout(() => {
      setActiveStageIndex(5);
      setLoadingStage("Preparing Candidate Review workspace...");
    }, 8500);

    try {
      const candidates = await api.generateEssayQuestions({
        question_count: questionCount,
        course_id: selectedCourseId || undefined,
        unit_ids: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
        custom_instruction: customInstruction.trim() || undefined,
        custom_blueprints: currentBlueprint.questions,
        paper_blueprint: currentBlueprint,
        difficulty_mode: difficultyMode,
        cognitive_mode: cognitiveMode,
      });

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);

      if (!candidates || candidates.length === 0) {
        throw new Error("AI returned 0 essay questions. Your blueprint has been preserved so you can safely retry.");
      }

      onBlueprintFinalized(currentBlueprint);

      if (onCandidatesGenerated) {
        onCandidatesGenerated(candidates);
      }

      onClose();
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);

      console.error("Essay AI Generation error:", err);
      const classified = classifyAIError(err);
      setGenerationError(classified);
      addToast(classified.title || "AI Generation encountered an error.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.65)",
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
          maxWidth: "880px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        {/* 1. MODAL HEADER */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1.5px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-secondary)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Paper II Part B — Essay AI Blueprint Workspace
              </h3>
              <span className="badge badge-primary" style={{ fontSize: "0.75rem" }}>
                Blueprint Config
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
              Define structural requirements, question formats, and mark allocations before AI generation.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ display: "flex", background: "var(--bg-card)", padding: "0.2rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <button
                type="button"
                className={`btn ${viewMode === "configure" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", border: "none" }}
                onClick={() => setViewMode("configure")}
              >
                Configure
              </button>
              <button
                type="button"
                className={`btn ${viewMode === "summary" ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", border: "none" }}
                onClick={() => setViewMode("summary")}
              >
                Summary View
              </button>
            </div>

            <button type="button" className="btn-icon" onClick={onClose} disabled={isGenerating} title="Close Workspace">
              <SvgIcon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* 2. MODAL BODY (SCROLLABLE) */}
        <div ref={modalBodyRef} style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* AI Generation Progress Box */}
          {isGenerating && (
            <div style={{ marginBottom: "0.5rem" }}>
              <AILoadingProgressBox
                questionType="essay"
                requestedCount={questionCount}
                activeStageIndex={activeStageIndex}
                loadingStage={loadingStage}
                subtext="Grounding authentic Sri Lankan A/L Biology essay prompts, itemized answer points, and dedicated marking schemes."
              />
            </div>
          )}

          {/* AI Generation Error Alert */}
          {generationError && (
            <div style={{ marginBottom: "0.5rem" }}>
              <AIGenerationErrorAlert
                error={generationError}
                onRetry={handleGenerateWithAI}
                onDismiss={() => setGenerationError(null)}
                requestedCount={questionCount}
              />
            </div>
          )}

          {/* Validation Alert / Success Feedback */}
          {!validation.isValid && !isGenerating && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                fontSize: "0.84rem",
                fontWeight: 600,
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <SvgIcon name="alert-triangle" size={16} />
                <span>Blueprint Mark Allocation Error:</span>
              </div>
              <ul style={{ margin: "0.2rem 0 0 1.4rem", padding: 0, fontSize: "0.8rem", fontWeight: 500 }}>
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {saveSuccessMessage && (
            <div
              style={{
                padding: "0.6rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid var(--success)",
                color: "var(--success)",
                fontSize: "0.82rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <SvgIcon name="check" size={16} />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {/* 3. TARGET QUESTION COUNT SELECTOR */}
          <div
            className="card"
            style={{
              padding: "1rem 1.25rem",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, display: "block" }}>
                Target Essay Questions
              </span>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                Select between 1 and 5 essay questions for this paper blueprint.
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  className={`btn ${questionCount === cnt ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    width: "38px",
                    height: "34px",
                    padding: 0,
                    fontSize: "0.88rem",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onClick={() => handleTargetCountChange(cnt)}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* 4. A/L PATTERN GUIDANCE (INFORMATIONAL ONLY) */}
          <div
            style={{
              padding: "0.65rem 0.9rem",
              borderRadius: "var(--radius-sm)",
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <SvgIcon name="info" size={14} style={{ color: "var(--accent-primary)" }} />
              <span><strong>A/L Pattern Guidance</strong> (Informational only — teacher may configure any combination):</span>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", fontFamily: "monospace", fontSize: "0.76rem", fontWeight: 700 }}>
              <span>Single Complete: ~33%</span>
              <span>Multi-Part: ~45%</span>
              <span>Short Notes: ~22%</span>
            </div>
          </div>

          {/* 5. SYLLABUS SCOPE SELECTOR */}
          {initialUnits && initialUnits.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                Target Syllabus Scope ({selectedUnitIds.length === 0 ? "All Units" : `${selectedUnitIds.length} Selected Units`})
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {initialUnits.map((u) => {
                  const isSelected = selectedUnitIds.length === 0 || selectedUnitIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUnit(u.id)}
                      style={{
                        fontSize: "0.76rem",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "4px",
                        border: isSelected ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                        background: isSelected ? "rgba(99, 102, 241, 0.1)" : "var(--bg-secondary)",
                        color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                        fontWeight: isSelected ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {u.unit_number ? `Unit ${u.unit_number}: ` : ""}{u.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. PEDAGOGICAL CALIBRATION & CUSTOM FOCUS (OPTIONAL) */}
          <div
            className="card"
            style={{
              padding: "0.85rem 1.1rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
              }}
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="settings" size={16} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Pedagogical Calibration & Custom Instructions
                </span>
                <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                  Optional
                </span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {showAdvancedOptions ? "▲ Hide Options" : "▼ Expand Options"}
              </span>
            </div>

            {showAdvancedOptions && (
              <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Difficulty Calibration
                    </label>
                    <select
                      className="form-control"
                      value={difficultyMode}
                      onChange={(e) => setDifficultyMode(e.target.value)}
                      style={{ fontSize: "0.82rem", padding: "0.35rem 0.6rem" }}
                    >
                      <option value="balanced">A/L Standard (Balanced Curve)</option>
                      <option value="easy">Introductory (Easier Contexts)</option>
                      <option value="hard">Advanced / Competitive (Challenging Scenarios)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Cognitive Depth Mode
                    </label>
                    <select
                      className="form-control"
                      value={cognitiveMode}
                      onChange={(e) => setCognitiveMode(e.target.value)}
                      style={{ fontSize: "0.82rem", padding: "0.35rem 0.6rem" }}
                    >
                      <option value="recommended">Recommended (Balanced Analysis & Recall)</option>
                      <option value="understand">Conceptual & Functional (Explain & Describe)</option>
                      <option value="analyze">Analytical & Deductive (Analyse & Compare)</option>
                      <option value="evaluate">Evaluative & Experimental (Discuss & Evaluate)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Teacher Focus / Custom Instructions
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Focus on Kidney counter-current multiplier, Photosystems I & II, and Heart conduction..."
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    style={{ fontSize: "0.82rem" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 7. CONFIGURE VIEW: INDEPENDENT QUESTION BLUEPRINT CARDS */}
          {viewMode === "configure" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {(blueprint.questions || []).map((q, qIdx) => {
                const calculatedQMarks = calculateBlueprintQuestionMarks(q);
                const isMarksMatching = calculatedQMarks === q.marks;

                return (
                  <div
                    key={q.id}
                    className="card"
                    style={{
                      padding: "1.2rem",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    {/* Question Card Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                          Question {q.question_number}
                        </span>
                        <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                          Slot #{q.order}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveQuestion(q.id, "up")}
                          disabled={qIdx === 0}
                          title="Move Question Up"
                        >
                          <SvgIcon name="chevron-up" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleMoveQuestion(q.id, "down")}
                          disabled={qIdx === (blueprint.questions || []).length - 1}
                          title="Move Question Down"
                        >
                          <SvgIcon name="chevron-down" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDuplicateQuestion(q.id)}
                          disabled={(blueprint.questions || []).length >= 5}
                          title="Duplicate Question Structure"
                        >
                          <SvgIcon name="copy" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleRemoveQuestion(q.id)}
                          disabled={(blueprint.questions || []).length <= 1}
                          title="Remove Question"
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Question Structure & Mark Allocation Controls */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "1rem", alignItems: "center" }}>
                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                          Question Structure
                        </label>
                        <select
                          className="input"
                          value={q.structure_type}
                          onChange={(e) => handleStructureTypeChange(q.id, e.target.value as EssayStructureType)}
                          style={{ fontSize: "0.85rem", fontWeight: 600 }}
                        >
                          <option value="SINGLE_COMPLETE">Single Complete Question</option>
                          <option value="MULTI_PART">Multi-Part Descriptive Subparts</option>
                          <option value="SHORT_NOTES">Short Notes Style</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                          Maximum Marks
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <input
                            type="number"
                            className="input"
                            value={q.marks}
                            onChange={(e) => handleQuestionMarksChange(q.id, Number(e.target.value))}
                            min={1}
                            style={{ fontSize: "0.88rem", fontWeight: 700, textAlign: "center" }}
                          />
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>marks</span>
                        </div>
                      </div>
                    </div>

                    {/* ─── SINGLE COMPLETE QUESTION SKELETON ─── */}
                    {q.structure_type === "SINGLE_COMPLETE" && (
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          background: "var(--bg-card)",
                          borderRadius: "var(--radius-sm)",
                          border: "1px dashed var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          <strong>Single Complete Essay Question:</strong> 1 comprehensive question prompt allocated {q.marks} marks.
                        </div>
                        <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 700 }}>
                          [{q.marks} marks]
                        </span>
                      </div>
                    )}

                    {/* ─── MULTI-PART DESCRIPTIVE SUBPARTS SKELETON ─── */}
                    {q.structure_type === "MULTI_PART" && (
                      <div style={{ background: "var(--bg-card)", padding: "0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Subquestion Hierarchy (Roman (i), (ii)... &amp; Alphabetical (a), (b))
                          </span>
                          <span
                            className={`badge ${isMarksMatching ? "badge-info" : "badge-warning"}`}
                            style={{ fontSize: "0.76rem", fontWeight: 700, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <SvgIcon name={isMarksMatching ? "check" : "alert-triangle"} size={12} /> Total: {calculatedQMarks} / {q.marks} Marks
                          </span>
                        </div>

                        {/* Subparts Tree */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {(q.children || []).map((sub, sIdx) => (
                            <div
                              key={sub.id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.35rem",
                                padding: "0.5rem 0.75rem",
                                background: "var(--bg-secondary)",
                                borderRadius: "4px",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div style={{ display: "grid", gridTemplateColumns: "35px 1fr 100px 110px", gap: "0.5rem", alignItems: "center" }}>
                                <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--accent-primary)", textAlign: "center" }}>
                                  {sub.label}
                                </span>

                                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                                  Subquestion {sIdx + 1}
                                </span>

                                <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                  <input
                                    type="number"
                                    className="input"
                                    value={sub.marks}
                                    onChange={(e) => handleUpdateSubpartMarks(q.id, sub.id, Number(e.target.value))}
                                    min={1}
                                    style={{ width: "50px", padding: "0.15rem 0.3rem", fontSize: "0.82rem", textAlign: "center", fontWeight: 700 }}
                                  />
                                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>pts</span>
                                </div>

                                <div style={{ display: "flex", gap: "0.2rem", justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => handleAddNestedPart(q.id, sub.id)}
                                    title="Add nested (a)/(b) subpart"
                                  >
                                    <SvgIcon name="plus" size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => handleMoveSubpart(q.id, sub.id, "up")}
                                    disabled={sIdx === 0}
                                    title="Move Up"
                                  >
                                    <SvgIcon name="chevron-up" size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => handleMoveSubpart(q.id, sub.id, "down")}
                                    disabled={sIdx === (q.children || []).length - 1}
                                    title="Move Down"
                                  >
                                    <SvgIcon name="chevron-down" size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => handleDuplicateSubpart(q.id, sub.id)}
                                    title="Duplicate Subquestion"
                                  >
                                    <SvgIcon name="copy" size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon btn-icon-danger"
                                    onClick={() => handleDeleteSubpart(q.id, sub.id)}
                                    disabled={(q.children || []).length <= 1}
                                    title="Delete Subquestion"
                                  >
                                    <SvgIcon name="trash" size={12} />
                                  </button>
                                </div>
                              </div>

                              {/* Nested Alphabetical Level 2 Subparts */}
                              {sub.children && sub.children.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingLeft: "1.4rem", borderLeft: "2px solid rgba(99, 102, 241, 0.2)", marginTop: "0.2rem" }}>
                                  {sub.children.map((nested, nIdx) => (
                                    <div key={nested.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr 90px 40px", gap: "0.4rem", alignItems: "center" }}>
                                      <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent-primary)" }}>
                                        {nested.label}
                                      </span>
                                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                        Nested sub-item {nIdx + 1}
                                      </span>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                        <input
                                          type="number"
                                          className="input"
                                          value={nested.marks}
                                          onChange={(e) => handleUpdateSubpartMarks(q.id, nested.id, Number(e.target.value))}
                                          min={1}
                                          style={{ width: "45px", padding: "0.15rem 0.25rem", fontSize: "0.78rem", textAlign: "center" }}
                                        />
                                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>pts</span>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn-icon btn-icon-danger"
                                        onClick={() => handleDeleteSubpart(q.id, nested.id)}
                                        title="Delete Nested Subpart"
                                      >
                                        <SvgIcon name="trash" size={11} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.76rem", alignSelf: "flex-start", marginTop: "0.2rem" }}
                          onClick={() => handleAddSubpart(q.id)}
                        >
                          <SvgIcon name="plus" size={12} /> Add Subquestion (Roman)
                        </button>
                      </div>
                    )}

                    {/* ─── SHORT NOTES STYLE SKELETON ─── */}
                    {q.structure_type === "SHORT_NOTES" && (
                      <div style={{ background: "var(--bg-card)", padding: "0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={q.has_parent_instruction !== false}
                              onChange={() => handleToggleParentInstruction(q.id)}
                            />
                            Include Parent Instruction (e.g. &quot;Write short notes on the following:&quot;)
                          </label>
                          <span
                            className={`badge ${isMarksMatching ? "badge-info" : "badge-warning"}`}
                            style={{ fontSize: "0.76rem", fontWeight: 700, fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <SvgIcon name={isMarksMatching ? "check" : "alert-triangle"} size={12} /> Total: {calculatedQMarks} / {q.marks} Marks
                          </span>
                        </div>

                        {/* Topics List */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                          {(q.children || []).map((topic, tIdx) => (
                            <div
                              key={topic.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "35px 1fr 100px 90px",
                                gap: "0.5rem",
                                alignItems: "center",
                                padding: "0.45rem 0.65rem",
                                background: "var(--bg-secondary)",
                                borderRadius: "4px",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--accent-primary)", textAlign: "center" }}>
                                {topic.label}
                              </span>

                              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                                Short Note Topic {tIdx + 1}
                              </span>

                              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                                <input
                                  type="number"
                                  className="input"
                                  value={topic.marks}
                                  onChange={(e) => handleUpdateSubpartMarks(q.id, topic.id, Number(e.target.value))}
                                  min={1}
                                  style={{ width: "50px", padding: "0.15rem 0.3rem", fontSize: "0.82rem", textAlign: "center", fontWeight: 700 }}
                                />
                                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>pts</span>
                              </div>

                              <div style={{ display: "flex", gap: "0.2rem", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  onClick={() => handleMoveSubpart(q.id, topic.id, "up")}
                                  disabled={tIdx === 0}
                                  title="Move Up"
                                >
                                  <SvgIcon name="chevron-up" size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon"
                                  onClick={() => handleMoveSubpart(q.id, topic.id, "down")}
                                  disabled={tIdx === (q.children || []).length - 1}
                                  title="Move Down"
                                >
                                  <SvgIcon name="chevron-down" size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon btn-icon-danger"
                                  onClick={() => handleDeleteSubpart(q.id, topic.id)}
                                  disabled={(q.children || []).length <= 1}
                                  title="Delete Topic"
                                >
                                  <SvgIcon name="trash" size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: "0.76rem", alignSelf: "flex-start", marginTop: "0.2rem" }}
                          onClick={() => handleAddSubpart(q.id)}
                        >
                          <SvgIcon name="plus" size={12} /> Add Short Note Topic
                        </button>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

          {/* 7. SUMMARY VIEW: COMPACT BLUEPRINT BREAKDOWN */}
          {viewMode === "summary" && (
            <div className="card" style={{ padding: "1.2rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                Essay Paper AI Blueprint Summary ({blueprint.questions.length} Questions)
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(blueprint.questions || []).map((q) => {
                  const formatTitle =
                    q.structure_type === "SINGLE_COMPLETE"
                      ? "Single Complete Question"
                      : q.structure_type === "MULTI_PART"
                      ? "Multi-Part Descriptive Subparts"
                      : "Short Notes Style";

                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: "0.85rem 1rem",
                        background: "var(--bg-card)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ color: "var(--accent-primary)", fontSize: "0.92rem", marginRight: "0.5rem" }}>
                            Question {q.question_number}
                          </strong>
                          <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>{formatTitle}</span>
                        </div>
                        <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 700 }}>
                          {q.marks} Marks
                        </span>
                      </div>

                      {/* Subpart breakdown */}
                      {q.children && q.children.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.25rem", paddingLeft: "1rem", borderLeft: "2px solid rgba(99, 102, 241, 0.2)" }}>
                          {q.children.map((sub) => (
                            <div key={sub.id} style={{ fontSize: "0.8rem", display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                              <span><strong>{sub.label}</strong> Subpart</span>
                              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{sub.marks} pts</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1.5px dashed var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>Total Paper Section Marks:</span>
                <span style={{ fontSize: "1.05rem", fontWeight: 800, fontFamily: "monospace", color: "var(--accent-primary)" }}>
                  {validation.totalMarks} Marks
                </span>
              </div>
            </div>
          )}

        </div>

        {/* 8. MODAL FOOTER */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1.5px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-secondary)",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
              Total Blueprint: <strong style={{ color: "var(--accent-primary)", fontFamily: "monospace" }}>{validation.totalMarks} Marks</strong>
            </span>
            {validation.isValid ? (
              <span className="badge badge-success" style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <SvgIcon name="check-circle" size={12} /> Valid Blueprint
              </span>
            ) : (
              <span className="badge badge-danger" style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <SvgIcon name="alert-triangle" size={12} /> Errors Found
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isGenerating}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "0.55rem 1.2rem", fontSize: "0.85rem", fontWeight: 600 }}
              onClick={handleFinalize}
              disabled={!validation.isValid || isGenerating}
              title="Save blueprint structure without triggering AI generation"
            >
              Save Blueprint Only
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: "0.55rem 1.6rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
              onClick={handleGenerateWithAI}
              disabled={!validation.isValid || isGenerating}
            >
              {isGenerating ? (
                <>
                  <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                  <span>Generating {questionCount} Essay Questions...</span>
                </>
              ) : (
                <>
                  <SvgIcon name="sparkle" size={16} />
                  <span>Generate {questionCount} Essay Questions with AI</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
