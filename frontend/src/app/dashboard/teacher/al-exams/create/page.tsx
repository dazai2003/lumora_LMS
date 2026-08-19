"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api, { Course, ALExam, ALExamType, ALQuestion, ALQuestionTemplate, QuestionVersionResponse, UnitWithLessons, resolveDiagramImageUrl } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  AL_CERTIFIED_PAPER_1_DISTRIBUTION,
  AL_DEFAULT_DIFFICULTY_DISTRIBUTION,
  FORMAT_DISPLAY_NAMES,
  QuestionDistribution,
  DifficultyDistribution,
  redistributeProportionally,
  redistributeEqualDelta,
  calculateExactQuestionCounts,
} from "@/lib/alDistributionUtils";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";
import QuestionDiagramImage from "@/components/al-exams/QuestionDiagramImage";
import StructuredQuestionPaperRenderer from "@/components/al-exams/StructuredQuestionPaperRenderer";
import { StructuredSkeletonBuilder, StructuredContentAuthoringForm } from "@/components/al-exams/StructuredQuestionEditor";
import StructuredAiGenerationModal from "@/components/al-exams/StructuredAiGenerationModal";
import StructuredCandidateReviewModal from "@/components/al-exams/StructuredCandidateReviewModal";
import EssayAIGeneratorModal from "@/components/al-exams/EssayAIGeneratorModal";
import EssayCandidateReviewModal from "@/components/al-exams/EssayCandidateReviewModal";
import AddEssayStructureModal, { EssayStructureFormat } from "@/components/al-exams/AddEssayStructureModal";
import EssayContentAuthoringForm, { EssayAnswerPoint, EssaySubpart, createEmptySubpart, createEmptyAnswerPoint } from "@/components/al-exams/EssayContentAuthoringForm";
import EssayQuestionPaperRenderer from "@/components/al-exams/EssayQuestionPaperRenderer";
import { EssayPaperBlueprint } from "@/lib/alEssayBlueprintUtils";
import {
  normalizeLegacyEssayData,
  calculateEssayTotalMarks,
  calculateSubpartMarks,
  reindexEssaySubparts,
  stripLeadingNumberingPrefix,
} from "@/lib/alEssayTreeUtils";
import AILoadingProgressBox from "@/components/al-exams/AILoadingProgressBox";
import AIGenerationErrorAlert from "@/components/al-exams/AIGenerationErrorAlert";
import { classifyAIError, ClassifiedAIError } from "@/lib/aiErrorClassifier";
import { StructuredNode, cloneStructuredTree, getStructureSummary, createBlankNode } from "@/lib/alStructuredTreeUtils";

type ExamPresetMode = "full_paper" | "paper_1_only" | "paper_2_only" | "paper_2_structured" | "paper_2_essay" | "custom";

interface StructuredSubpartInput {
  part: string;
  prompt: string;
  max_points: number;
  lines: number;
  expected_keywords: string;
}

interface EssayRubricItemInput {
  item_number: number;
  criterion: string;
  description: string;
  points: number;
}

// 7 Canonical A/L Paper I Question Templates
const MCQ_TEMPLATES = [
  { id: "generic_mcq", title: "1. Direct Factual Recall", refPct: 26, desc: "Standard 5-option MCQ (A-E) with direct stem", icon: "file-text" },
  { id: "multi_response_grid", title: "2. 1-to-5 Multi-Response Grid", refPct: 20, desc: "Statements A–E + official 1-to-5 combination key (Q41–Q50)", icon: "grid" },
  { id: "five_statement_truth", title: "3. Five-Statement Evaluation", refPct: 16, desc: "5 independent statements as option choices", icon: "clipboard" },
  { id: "matching_column", title: "4. Matrix Matching / Profile Grid", refPct: 14, desc: "Column I to Column II pairings or condition grid", icon: "layers" },
  { id: "combination_grid", title: "5. Multi-Variable Selection", refPct: 12, desc: "Statements A–D with variable combination choices", icon: "filter" },
  { id: "sequential_diagnostic", title: "6. Sequential / Diagnostic", refPct: 8, desc: "Process ordering or specimen diagnostic case study", icon: "trending-up" },
  { id: "incomplete_stem", title: "7. Incomplete Stem / Calculation", refPct: 4, desc: "Sentence fragment completion or numerical formula calculation", icon: "target" },
];

// 7 Canonical A/L Paper I Question Templates Badge Resolver
function getTemplateBadgeTitle(templateType: string): { label: string; color: string } {
  const norm = (templateType || "generic_mcq").toLowerCase();
  switch (norm) {
    case "generic_mcq":
      return { label: "DIRECT FACTUAL RECALL", color: "badge-primary" };
    case "multi_response_grid":
      return { label: "MULTI-RESPONSE GRID", color: "badge-primary" };
    case "five_statement_truth":
      return { label: "FIVE-STATEMENT EVALUATION", color: "badge-info" };
    case "matching_column":
      return { label: "MATRIX MATCHING", color: "badge-warning" };
    case "combination_grid":
      return { label: "MULTI-VARIABLE SELECTION", color: "badge-info" };
    case "sequential_diagnostic":
      return { label: "SEQUENTIAL / DIAGNOSTIC", color: "badge-secondary" };
    case "incomplete_stem":
      return { label: "INCOMPLETE STEM / CALCULATION", color: "badge-secondary" };
    default:
      return { label: (templateType || "MCQ").toUpperCase(), color: "badge-secondary" };
  }
}

// Safe Numeric Parser Utility Functions (Prevents NaN state propagation)
function safeParseInt(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const p = parseInt(String(val), 10);
  return isNaN(p) ? fallback : p;
}

function safeParseFloat(val: any, fallback: number = 0.0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const p = parseFloat(String(val));
  return isNaN(p) ? fallback : p;
}

function formatPolicyDateTime(dtStr?: string | null): string {
  if (!dtStr) return "Not set";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return "Not set";
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "Not set";
  }
}

// Official G.C.E. A/L Biology 1-to-5 Multi-Response Combination Resolver
function resolveMultiResponseOption(truth: { A: boolean; B: boolean; C: boolean; D: boolean; E?: boolean }): string {
  const { A, B, C, D } = truth;
  if (A && B && D && !C) return "1";
  if (A && C && D && !B) return "2";
  if (A && B && !C && !D) return "3";
  if (C && D && !A && !B) return "4";
  return "5";
}

// Deterministic Integer Allocation Algorithm
function calculateExactCounts(totalCount: number, distribution: Record<string, number>): Record<string, number> {
  const safeTotal = Math.max(0, safeParseInt(totalCount, 0));
  if (safeTotal <= 0 || !distribution) return {};

  let sumWeight = 0;
  for (const k of Object.keys(distribution)) {
    const w = safeParseFloat(distribution[k], 0);
    sumWeight += w;
  }
  if (sumWeight <= 0) sumWeight = 100.0;

  const rawCounts: Record<string, number> = {};
  const remainders: Record<string, number> = {};
  let allocatedSum = 0;

  for (const fmt of Object.keys(distribution)) {
    const w = safeParseFloat(distribution[fmt], 0);
    const exactShare = (w / sumWeight) * safeTotal;
    const floorCount = Math.floor(exactShare);
    rawCounts[fmt] = floorCount;
    remainders[fmt] = exactShare - floorCount;
    allocatedSum += floorCount;
  }

  const deficit = safeTotal - allocatedSum;
  if (deficit > 0) {
    const sortedKeys = Object.keys(distribution).sort((a, b) => (remainders[b] || 0) - (remainders[a] || 0));
    for (let i = 0; i < deficit; i++) {
      const fmt = sortedKeys[i % sortedKeys.length];
      rawCounts[fmt] = (rawCounts[fmt] || 0) + 1;
    }
  }

  return rawCounts;
}

function TeacherExamCreateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const existingExamIdParam = searchParams.get("exam_id");

  const { addToast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");
  const [units, setUnits] = useState<UnitWithLessons[]>([]);

  // Assessment Creation Presets
  const [presetMode, setPresetMode] = useState<ExamPresetMode>("full_paper");

  // Form Settings Details
  const [title, setTitle] = useState("2026 G.C.E. A/L Biology Full Examination Paper");
  const [description, setDescription] = useState("Combined Paper 1 (50 MCQs) + Paper 2 Part A (Structured) + Part B (Essay)");
  const [paperType, setPaperType] = useState<ALExamType>("full_paper");
  const [timeLimit, setTimeLimit] = useState<number>(300);
  const [totalQuestions, setTotalQuestions] = useState<number>(60);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [availableFrom, setAvailableFrom] = useState<string>("");
  const [availableUntil, setAvailableUntil] = useState<string>("");
  const [showResultImmediately, setShowResultImmediately] = useState<boolean>(true);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(false);
  const [navigationMode, setNavigationMode] = useState<"free" | "sequential">("free");
  // Unified Assessment Operation Policy Edit Mode State (Read-Only by Default)
  const [isEditingPolicy, setIsEditingPolicy] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editTimeLimit, setEditTimeLimit] = useState<number>(120);
  const [editMaxAttempts, setEditMaxAttempts] = useState<number>(1);
  const [editAvailableFrom, setEditAvailableFrom] = useState<string>("");
  const [editAvailableUntil, setEditAvailableUntil] = useState<string>("");
  const [editShowResultImmediately, setEditShowResultImmediately] = useState<boolean>(true);
  const [editShuffleQuestions, setEditShuffleQuestions] = useState<boolean>(false);
  const [editShuffleOptions, setEditShuffleOptions] = useState<boolean>(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const handleStartEditPolicy = () => {
    if (!createdExam) return;
    setEditTitle(createdExam.title);
    setEditDescription(createdExam.description || "");
    setEditTimeLimit(safeParseInt(createdExam.time_limit_minutes, 120));
    setEditMaxAttempts(safeParseInt(createdExam.max_attempts, 1));
    setEditAvailableFrom(createdExam.available_from ? createdExam.available_from.slice(0, 16) : "");
    setEditAvailableUntil(createdExam.available_until ? createdExam.available_until.slice(0, 16) : "");
    setEditShowResultImmediately(createdExam.show_result_immediately ?? true);
    setEditShuffleQuestions(shuffleQuestions);
    setEditShuffleOptions(shuffleOptions);
    setIsEditingPolicy(true);
  };

  const handleCancelEditPolicy = () => {
    setIsEditingPolicy(false);
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdExam) return;
    if (!editTitle.trim()) {
      addToast("Assessment title cannot be empty.", "error");
      return;
    }
    if (editTimeLimit <= 0) {
      addToast("Duration must be greater than 0 minutes.", "error");
      return;
    }
    if (editMaxAttempts < 1) {
      addToast("Maximum attempts must be at least 1.", "error");
      return;
    }

    setSavingPolicy(true);
    try {
      const updated = await api.updateALExam(createdExam.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        time_limit_minutes: editTimeLimit,
        max_attempts: editMaxAttempts,
        available_from: editAvailableFrom ? new Date(editAvailableFrom).toISOString() : undefined,
        available_until: editAvailableUntil ? new Date(editAvailableUntil).toISOString() : undefined,
        show_result_immediately: editShowResultImmediately,
      });

      setTitle(updated.title);
      setDescription(updated.description || "");
      setTimeLimit(updated.time_limit_minutes);
      setMaxAttempts(updated.max_attempts);
      setAvailableFrom(updated.available_from ? updated.available_from.slice(0, 16) : "");
      setAvailableUntil(updated.available_until ? updated.available_until.slice(0, 16) : "");
      setShowResultImmediately(updated.show_result_immediately ?? true);
      setShuffleQuestions(editShuffleQuestions);
      setShuffleOptions(editShuffleOptions);

      setCreatedExam(updated);
      addToast(`Assessment Operation Policy updated for "${updated.title}"!`, "success");
      setIsEditingPolicy(false);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to save assessment policy.", "error");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Active Exam Container after creation
  const [createdExam, setCreatedExam] = useState<ALExam | null>(null);
  const [loadingExam, setLoadingExam] = useState<boolean>(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"saved" | "saving" | "idle">("idle");

  // Active Authoring Section
  const [activeSectionTab, setActiveSectionTab] = useState<"paper_1" | "part_a" | "part_b" | "summary">("paper_1");

  // Progressive Disclosure: Advanced Settings Collapsible Toggle
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Format Selector & Manual Authoring Form States
  const [formatSelectorModalOpen, setFormatSelectorModalOpen] = useState(false);
  const [activeMcqFormat, setActiveMcqFormat] = useState<ALQuestionTemplate>("generic_mcq");
  const [isMcqAuthoringActive, setIsMcqAuthoringActive] = useState(false);

  // Structured Question System Modal & Bottom Authoring States
  const [manualStructuredModalOpen, setManualStructuredModalOpen] = useState(false);
  const [editingStructuredQuestionId, setEditingStructuredQuestionId] = useState<number | null>(null);
  const [editingStructuredNodes, setEditingStructuredNodes] = useState<StructuredNode[]>([]);
  const [editingStructuredStem, setEditingStructuredStem] = useState<string>("");
  const [editingStructuredDiagramUrl, setEditingStructuredDiagramUrl] = useState<string>("");
  const [savingManualStructured, setSavingManualStructured] = useState(false);

  // Called when [Save Structure] is clicked inside the Structured Question Structure Builder popup
  const handleSaveStructureFromBuilder = (data: { nodes: StructuredNode[]; total_points: number }) => {
    setEditingStructuredNodes(data.nodes);
    setManualStructuredModalOpen(false);
    setActiveSectionTab("part_a");
    addToast("Structure skeleton saved! You can now author question content below in Paper 2A form.", "info");
    setTimeout(() => {
      const el = document.getElementById("structured-authoring-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  // Called when [Save Structured Question to Paper] is clicked in Paper 2A Authoring Form
  const handleSaveStructuredQuestionToPaper = async () => {
    if (!createdExam) return;
    if (!editingStructuredStem.trim()) {
      addToast("Please enter the main scenario / context stem for this question.", "warning");
      return;
    }
    if (!editingStructuredNodes || editingStructuredNodes.length === 0) {
      addToast("Please define the question structure skeleton first.", "warning");
      return;
    }
    const summary = getStructureSummary(editingStructuredNodes);
    if (summary.isOverAllocated) {
      addToast(`Cannot save: Total raw points (${summary.totalRawPoints}) exceeds 40 raw points.`, "error");
      return;
    }
    setSavingManualStructured(true);
    try {
      if (editingStructuredQuestionId) {
        await api.updateALQuestion(createdExam.id, editingStructuredQuestionId, {
          stem_text: editingStructuredStem.trim(),
          points: summary.totalRawPoints,
          structured_subparts_json: editingStructuredNodes,
          diagram_url: editingStructuredDiagramUrl || undefined,
        });
        addToast(`Structured Question updated successfully!`, "success");
      } else {
        const currentQCount = createdExam.questions ? createdExam.questions.length + 1 : 1;
        await api.createAuthoringQuestion({
          exam_id: createdExam.id,
          question_number: currentQCount,
          template_type: "structured_subparts",
          stem_text: editingStructuredStem.trim(),
          points: summary.totalRawPoints,
          structured_subparts_json: editingStructuredNodes,
          diagram_url: editingStructuredDiagramUrl || undefined,
          cognitive_level: "understand",
          difficulty: "medium",
        });
        addToast(`Structured Question created and added to Paper II Part A!`, "success");
      }
      await refreshCreatedExam(createdExam.id);
      handleResetStructuredForm();
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to save structured question.", "error");
    } finally {
      setSavingManualStructured(false);
    }
  };

  const handleResetStructuredForm = () => {
    setEditingStructuredQuestionId(null);
    setEditingStructuredStem("");
    setEditingStructuredDiagramUrl("");
    setEditingStructuredNodes([]);
  };

  const handleDuplicateStructuredQuestion = async (q: ALQuestion) => {
    if (!createdExam) return;
    try {
      const nextQNum = (createdExam.questions?.length || 0) + 1;
      const clonedNodes = cloneStructuredTree(q.structured_subparts_json || []);
      await api.createAuthoringQuestion({
        exam_id: createdExam.id,
        question_number: nextQNum,
        template_type: "structured_subparts",
        stem_text: `${q.stem_text} (Copy)`,
        points: q.points || 40,
        structured_subparts_json: clonedNodes,
        diagram_url: q.diagram_url,
        cognitive_level: q.cognitive_level || "understand",
        difficulty: q.difficulty || "medium",
      });
      addToast(`Structured Question ${q.question_number} duplicated as Question ${nextQNum}!`, "success");
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to duplicate structured question.", "error");
    }
  };

  // Manual Essay Authoring State & Handlers
  const [addEssayModalOpen, setAddEssayModalOpen] = useState(false);
  const [isEssayAuthoringActive, setIsEssayAuthoringActive] = useState(false);
  const [editingEssayQuestionId, setEditingEssayQuestionId] = useState<number | null>(null);
  const [essayAuthoringStructure, setEssayAuthoringStructure] = useState<EssayStructureFormat>("single_complete");
  const [essayAuthoringInstruction, setEssayAuthoringInstruction] = useState("Write short notes on the following:");
  const [essayAuthoringStem, setEssayAuthoringStem] = useState("");
  const [essayAuthoringAnswerPoints, setEssayAuthoringAnswerPoints] = useState<EssayAnswerPoint[]>([
    createEmptyAnswerPoint(1, 5),
    createEmptyAnswerPoint(2, 5),
  ]);
  const [essayAuthoringMarkingScheme, setEssayAuthoringMarkingScheme] = useState("");
  const [essayAuthoringSubparts, setEssayAuthoringSubparts] = useState<EssaySubpart[]>([
    createEmptySubpart(0, ""),
    createEmptySubpart(1, ""),
  ]);
  const [essayAuthoringExaminerNotes, setEssayAuthoringExaminerNotes] = useState("");
  const [essayAuthoringRequiresImage, setEssayAuthoringRequiresImage] = useState(false);
  const [essayAuthoringImageDescription, setEssayAuthoringImageDescription] = useState("");
  const [essayAuthoringDiagramUrl, setEssayAuthoringDiagramUrl] = useState("");
  const [savingEssayAuthoring, setSavingEssayAuthoring] = useState(false);

  const [previewEssayModalOpen, setPreviewEssayModalOpen] = useState(false);
  const [previewEssayQuestion, setPreviewEssayQuestion] = useState<any | null>(null);

  const nextEssayQNum = useMemo(() => {
    if (!createdExam || !createdExam.questions || createdExam.questions.length === 0) {
      return paperType === "paper_2_essay" ? 1 : 5;
    }
    const maxQNum = createdExam.questions.reduce((max, q) => Math.max(max, q.question_number || 0), 0);
    return Math.max(paperType === "paper_2_essay" ? 1 : 5, maxQNum + 1);
  }, [createdExam, paperType]);

  const handleOpenAddEssayModal = () => {
    setAddEssayModalOpen(true);
  };

  const handleCreateEssayStructure = (data: { questionNumber: number; structure: EssayStructureFormat; subpartCount?: number }) => {
    setEditingEssayQuestionId(null);
    setIsEssayAuthoringActive(true);
    setEssayAuthoringStructure(data.structure);
    setEssayAuthoringStem("");
    setEssayAuthoringMarkingScheme("");
    setEssayAuthoringExaminerNotes("");
    setEssayAuthoringRequiresImage(false);
    setEssayAuthoringImageDescription("");
    setEssayAuthoringDiagramUrl("");

    if (data.structure === "single_complete") {
      setEssayAuthoringAnswerPoints([
        createEmptyAnswerPoint(1, 5),
        createEmptyAnswerPoint(2, 5),
      ]);
      setEssayAuthoringSubparts([]);
    } else if (data.structure === "multi_part") {
      const count = data.subpartCount || 2;
      const initialSubs = Array.from({ length: count }, (_, i) => createEmptySubpart(i, ""));
      setEssayAuthoringSubparts(initialSubs);
      setEssayAuthoringAnswerPoints([]);
    } else if (data.structure === "short_notes") {
      const count = data.subpartCount || 2;
      const initialSubs = Array.from({ length: count }, (_, i) => createEmptySubpart(i, ""));
      setEssayAuthoringInstruction("Write short notes on the following:");
      setEssayAuthoringSubparts(initialSubs);
      setEssayAuthoringAnswerPoints([]);
    }

    setActiveSectionTab("part_b");
    setTimeout(() => {
      const el = document.getElementById("essay-authoring-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const handleSaveEssayQuestionToPaper = async () => {
    if (!createdExam) return;
    setSavingEssayAuthoring(true);
    try {
      const reindexedSubs = reindexEssaySubparts(essayAuthoringSubparts || []);
      const calculatedPoints = calculateEssayTotalMarks({
        structure_format: essayAuthoringStructure,
        answer_points: essayAuthoringAnswerPoints,
        subparts: reindexedSubs,
      });

      const checklistPayload = {
        structure_format: essayAuthoringStructure,
        structure_type: essayAuthoringStructure,
        instruction: essayAuthoringInstruction,
        stem_text: stripLeadingNumberingPrefix(essayAuthoringStem),
        answer_points: essayAuthoringAnswerPoints,
        criteria: essayAuthoringAnswerPoints,
        marking_scheme: essayAuthoringMarkingScheme,
        subparts: reindexedSubs,
        examiner_notes: essayAuthoringExaminerNotes,
        diagram_requirement: {
          requires_image: essayAuthoringRequiresImage,
          image_description: essayAuthoringImageDescription,
          diagram_url: essayAuthoringDiagramUrl,
        },
      };

      const resolvedStem =
        essayAuthoringStructure === "short_notes"
          ? essayAuthoringInstruction || "Write short notes on the following:"
          : essayAuthoringStem || "Essay Question";

      if (editingEssayQuestionId) {
        const existingQ = createdExam.questions?.find(q => q.id === editingEssayQuestionId);
        const targetQNum = existingQ?.question_number || nextEssayQNum;

        await api.updateAuthoringQuestion(editingEssayQuestionId, {
          stem_text: resolvedStem,
          points: calculatedPoints || 40,
          template_type: "essay_rubric",
          diagram_url: essayAuthoringDiagramUrl,
          requires_image: essayAuthoringRequiresImage,
          image_description: essayAuthoringImageDescription,
          explanation: essayAuthoringExaminerNotes || essayAuthoringMarkingScheme,
          essay_checklist_json: checklistPayload,
        });
        addToast(`Essay Question ${targetQNum} updated successfully!`, "success");
      } else {
        await api.createAuthoringQuestion({
          exam_id: createdExam.id,
          question_number: nextEssayQNum,
          template_type: "essay_rubric",
          stem_text: resolvedStem,
          points: calculatedPoints || 40,
          diagram_url: essayAuthoringDiagramUrl,
          requires_image: essayAuthoringRequiresImage,
          image_description: essayAuthoringImageDescription,
          explanation: essayAuthoringExaminerNotes || essayAuthoringMarkingScheme,
          cognitive_level: "analyze",
          difficulty: "hard",
          essay_checklist_json: checklistPayload,
        });
        addToast(`Essay Question ${nextEssayQNum} saved and attached to Paper II Part B!`, "success");
      }

      setEditingEssayQuestionId(null);
      setIsEssayAuthoringActive(false);
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error("Failed to save essay question:", err);
      addToast(err?.message || "Failed to save essay question.", "error");
    } finally {
      setSavingEssayAuthoring(false);
    }
  };

  const handleEditEssayQuestion = (q: ALQuestion) => {
    const normalized = normalizeLegacyEssayData(q.essay_checklist_json, q.stem_text, q.points);

    setEditingEssayQuestionId(q.id);
    setIsEssayAuthoringActive(true);
    setEssayAuthoringStructure(normalized.structure_format);
    setEssayAuthoringInstruction(normalized.instruction || "Write short notes on the following:");
    setEssayAuthoringStem(normalized.stem_text || q.stem_text || "");
    setEssayAuthoringAnswerPoints(
      normalized.answer_points && normalized.answer_points.length > 0
        ? normalized.answer_points
        : [createEmptyAnswerPoint(1, 5), createEmptyAnswerPoint(2, 5)]
    );
    setEssayAuthoringMarkingScheme(normalized.marking_scheme || "");
    setEssayAuthoringSubparts(
      normalized.subparts && normalized.subparts.length > 0
        ? normalized.subparts
        : [createEmptySubpart(0, ""), createEmptySubpart(1, "")]
    );
    setEssayAuthoringExaminerNotes(normalized.examiner_notes || q.explanation || "");
    setEssayAuthoringRequiresImage(q.requires_image || Boolean(q.diagram_url) || false);
    setEssayAuthoringImageDescription(q.image_description || "");
    setEssayAuthoringDiagramUrl(q.diagram_url || "");

    setActiveSectionTab("part_b");
    setTimeout(() => {
      const el = document.getElementById("essay-authoring-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  const handleResetEssayForm = () => {
    setEditingEssayQuestionId(null);
    setIsEssayAuthoringActive(false);
    setEssayAuthoringStem("");
    setEssayAuthoringMarkingScheme("");
    setEssayAuthoringExaminerNotes("");
    setEssayAuthoringRequiresImage(false);
    setEssayAuthoringImageDescription("");
    setEssayAuthoringDiagramUrl("");
    setEssayAuthoringAnswerPoints([createEmptyAnswerPoint(1, 5), createEmptyAnswerPoint(2, 5)]);
    setEssayAuthoringSubparts([createEmptySubpart(0, ""), createEmptySubpart(1, "")]);
  };

  const handleDuplicateEssayQuestion = async (q: ALQuestion) => {
    if (!createdExam) return;
    try {
      const nextQNum = Math.max(5, (createdExam.questions?.length || 0) + 1);
      await api.createAuthoringQuestion({
        exam_id: createdExam.id,
        question_number: nextQNum,
        template_type: "essay_rubric",
        stem_text: `${q.stem_text} (Copy)`,
        points: q.points || 150,
        diagram_url: q.diagram_url,
        requires_image: q.requires_image,
        image_description: q.image_description,
        explanation: q.explanation,
        cognitive_level: q.cognitive_level || "analyze",
        difficulty: q.difficulty || "hard",
        essay_checklist_json: q.essay_checklist_json,
      });
      addToast(`Essay Question ${q.question_number} duplicated as Question ${nextQNum}!`, "success");
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error("Failed to duplicate essay question:", err);
      addToast(err?.message || "Failed to duplicate essay question.", "error");
    }
  };

  // Structured AI Generation Workspace & Candidate Review Modal State
  const [structuredAiModalOpen, setStructuredAiModalOpen] = useState(false);
  const [structuredReviewModalOpen, setStructuredReviewModalOpen] = useState(false);
  const [generatingStructuredAI, setGeneratingStructuredAI] = useState(false);
  const [structuredAiCandidates, setStructuredAiCandidates] = useState<any[]>([]);

  const handleGenerateStructuredQuestions = async (data: {
    question_count: number;
    course_id: number;
    unit_ids: number[];
    custom_instruction: string;
    custom_blueprints: any[];
    difficulty_mode: string;
    cognitive_mode: string;
  }) => {
    if (!createdExam) return;
    setGeneratingStructuredAI(true);
    try {
      const candidates = await api.generateStructuredQuestions({
        question_count: data.question_count,
        course_id: data.course_id || createdExam.course_id || undefined,
        unit_ids: data.unit_ids,
        custom_instruction: data.custom_instruction,
        custom_blueprints: data.custom_blueprints,
        difficulty_mode: data.difficulty_mode,
        cognitive_mode: data.cognitive_mode,
      });

      if (!candidates || candidates.length === 0) {
        throw new Error("The AI generator returned no structured questions. Your blueprint has been preserved so you can retry.");
      }

      // Count valid vs invalid candidates
      const validCount = candidates.filter((c: any) => c.is_valid !== false && c.status !== "generation_issue").length;
      const invalidCount = candidates.length - validCount;

      if (validCount === 0) {
        throw new Error("All generated questions failed validation. Your blueprint has been preserved so you can retry.");
      }

      setStructuredAiCandidates(candidates);
      setStructuredAiModalOpen(false);
      setStructuredReviewModalOpen(true);

      if (invalidCount > 0) {
        addToast(`Generated ${candidates.length} questions (${validCount} valid, ${invalidCount} need review). Check flagged items in the review workspace.`, "warning");
      } else {
        addToast(`Successfully generated and verified ${candidates.length} structured questions!`, "success");
      }
    } catch (err: any) {
      console.error("Failed to generate structured questions", err);
      addToast(err?.message || "Failed to generate structured questions with AI.", "error");
      throw err;
    } finally {
      setGeneratingStructuredAI(false);
    }
  };


  const handleBatchAcceptStructuredCandidates = async (acceptedCandidates: any[]) => {
    if (!createdExam) return;
    try {
      const res = await api.batchAcceptCandidates(createdExam.id, acceptedCandidates);
      addToast(`Successfully accepted ${res.accepted || acceptedCandidates.length} structured questions into Paper 2A!`, "success");
      await refreshCreatedExam(createdExam.id);
      setActiveSectionTab("part_a");
    } catch (err: any) {
      console.error("Failed to batch accept structured candidates", err);
      addToast(err?.message || "Failed to batch accept structured questions.", "error");
    }
  };

  // Essay AI Blueprint & Generation State
  const [essayAiModalOpen, setEssayAiModalOpen] = useState(false);
  const [finalizedEssayBlueprint, setFinalizedEssayBlueprint] = useState<EssayPaperBlueprint | null>(null);
  const [essayReviewModalOpen, setEssayReviewModalOpen] = useState(false);
  const [essayAiCandidates, setEssayAiCandidates] = useState<any[]>([]);

  const handleEssayBlueprintFinalized = (bp: EssayPaperBlueprint) => {
    setFinalizedEssayBlueprint(bp);
    addToast(`Essay AI Blueprint (${bp.questions.length} questions, ${bp.total_marks} marks) finalized & saved!`, "success");
  };

  const handleCandidatesGeneratedFromModal = (candidates: any[]) => {
    setEssayAiCandidates(candidates);
    setEssayReviewModalOpen(true);
    addToast(`Successfully generated ${candidates.length} A/L Essay questions for review!`, "success");
  };

  const handleBatchAcceptEssayCandidates = async (acceptedCandidates: any[]) => {
    if (!createdExam) return;
    try {
      for (const cand of acceptedCandidates) {
        const nextQNum = (createdExam.questions?.length || 0) + 1;
        const checklistPayload = {
          structure_format: cand.structure_format,
          structure_type: cand.structure_format,
          stem_text: cand.stem_text,
          instruction: cand.instruction,
          marking_scheme: cand.marking_scheme,
          examiner_notes: cand.examiner_notes,
          answer_points: cand.answer_points || [],
          criteria: cand.answer_points || [],
          subparts: cand.subparts || [],
        };

        await api.createAuthoringQuestion({
          exam_id: createdExam.id,
          question_number: nextQNum,
          template_type: "essay_rubric",
          stem_text: cand.stem_text || cand.instruction,
          points: cand.points || 150,
          diagram_url: cand.diagram_url || undefined,
          requires_image: cand.requires_image || false,
          image_description: cand.image_description || undefined,
          explanation: cand.examiner_notes || cand.marking_scheme || undefined,
          cognitive_level: cand.cognitive_level || "analyze",
          difficulty: cand.difficulty || "medium",
          essay_checklist_json: checklistPayload,
        });
      }

      addToast(`Successfully accepted ${acceptedCandidates.length} essay question(s) into Paper II Part B!`, "success");
      await refreshCreatedExam(createdExam.id);
      setActiveSectionTab("part_b");
    } catch (err: any) {
      console.error("Failed to batch accept essay candidates", err);
      addToast(err?.message || "Failed to attach essay questions.", "error");
      throw err;
    }
  };

  const handleEditEssayCandidateInBuilder = (cand: any) => {
    setEditingEssayQuestionId(null);
    setIsEssayAuthoringActive(true);
    setEssayAuthoringStructure(cand.structure_format || "single_complete");
    setEssayAuthoringInstruction(cand.instruction || "Write short notes on the following:");
    setEssayAuthoringStem(cand.stem_text || "");
    setEssayAuthoringMarkingScheme(cand.marking_scheme || "");
    setEssayAuthoringExaminerNotes(cand.examiner_notes || "");
    setEssayAuthoringRequiresImage(cand.requires_image || false);
    setEssayAuthoringImageDescription(cand.image_description || "");
    setEssayAuthoringDiagramUrl(cand.diagram_url || "");
    setEssayAuthoringAnswerPoints(cand.answer_points && cand.answer_points.length > 0 ? cand.answer_points : [createEmptyAnswerPoint(1, 5), createEmptyAnswerPoint(2, 5)]);
    setEssayAuthoringSubparts(cand.subparts && cand.subparts.length > 0 ? cand.subparts : [createEmptySubpart(0, ""), createEmptySubpart(1, "")]);
    setActiveSectionTab("part_b");
    setEssayReviewModalOpen(false);

    setTimeout(() => {
      const el = document.getElementById("essay-authoring-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);

    addToast(`Loaded Essay Question #${cand.question_number} into Question Builder!`, "info");
  };

  // Question Bank Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [bankTargetSection, setBankTargetSection] = useState<"paper_1" | "part_a" | "part_b">("paper_1");
  const [bankQuestions, setBankQuestions] = useState<QuestionVersionResponse[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState<number[]>([]);
  const [importingBank, setImportingBank] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Question Bank Filters
  const [searchBankQuery, setSearchBankQuery] = useState("");
  const [difficultyBankFilter, setDifficultyBankFilter] = useState("all");

  // ─── AI GENERATOR MODAL CONFIGURATION WORKSPACE STATE ───
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiGenMode, setAiGenMode] = useState<"al_preset" | "custom">("al_preset");
  const [aiQuestionCount, setAiQuestionCount] = useState<number>(50);
  const [aiTemplateDist, setAiTemplateDist] = useState<QuestionDistribution>({ ...AL_CERTIFIED_PAPER_1_DISTRIBUTION });
  const [presetConfirmModalOpen, setPresetConfirmModalOpen] = useState(false);

  // Curriculum Scope State (Multi-select Units)
  const [aiSelectedUnitIds, setAiSelectedUnitIds] = useState<number[]>([]);

  // Source Materials State (Primary vs Supporting)
  const [aiPrimaryMaterials, setAiPrimaryMaterials] = useState<string[]>([
    "video_transcripts",
    "lesson_pdfs",
    "teacher_documents",
    "teacher_notes"
  ]);
  const [aiSupportingMaterials, setAiSupportingMaterials] = useState<string[]>([
    "resource_books",
    "syllabus",
    "past_papers",
    "model_papers",
    "marking_schemes"
  ]);

  // Difficulty & Cognitive Level State
  const [aiDifficultyMode, setAiDifficultyMode] = useState<"al_recommended" | "custom_dist" | "easy" | "moderate" | "standard" | "challenging" | "advanced">("al_recommended");
  const [aiDiffDist, setAiDiffDist] = useState<DifficultyDistribution>({ ...AL_DEFAULT_DIFFICULTY_DISTRIBUTION });
  const [showAdvancedCognitive, setShowAdvancedCognitive] = useState(false);
  const [aiCognitiveLevel, setAiCognitiveLevel] = useState<string>("recommended");

  // Generation Options Checkboxes
  const [aiGenOptions, setAiGenOptions] = useState({
    includeDiagrams: true,
    preferApplication: true,
    avoidDuplicates: true,
    usePastPaperStyle: true,
  });

  const [aiCustomInstruction, setAiCustomInstruction] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiLoadingStage, setAiLoadingStage] = useState<string | null>(null);
  const [aiClassifiedError, setAiClassifiedError] = useState<ClassifiedAIError | null>(null);

  // Candidate Review Two-Column Workspace State
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);
  const [candidateReviewModalOpen, setCandidateReviewModalOpen] = useState(false);
  const [selectedCandIdx, setSelectedCandIdx] = useState<number>(0);
  const [reviewFilterTab, setReviewFilterTab] = useState<"all" | "ready" | "needs_image" | "edited" | "accepted" | "rejected">("all");
  const [selectedCandIndices, setSelectedCandIndices] = useState<number[]>([]);
  const [acceptingBatch, setAcceptingBatch] = useState(false);
  const [regeneratingCandId, setRegeneratingCandId] = useState<string | number | null>(null);
  const [candidateEditIdx, setCandidateEditIdx] = useState<number | null>(null);

  // Inline Candidate Editing State inside Review Panel
  const [isEditingCandidate, setIsEditingCandidate] = useState(false);
  const [editCandStem, setEditCandStem] = useState("");
  const [editCandOptions, setEditCandOptions] = useState<string[]>(["", "", "", "", ""]);
  const [editCandCorrectOption, setEditCandCorrectOption] = useState("A");
  const [editCandPoints, setEditCandPoints] = useState<number>(1.0);
  const [editCandExplanation, setEditCandExplanation] = useState("");
  const [editCandStatements, setEditCandStatements] = useState<any[]>([]);
  const [editCandColIHeader, setEditCandColIHeader] = useState("Column I");
  const [editCandColIIHeader, setEditCandColIIHeader] = useState("Column II");
  const [editCandColI, setEditCandColI] = useState<string[]>([]);
  const [editCandColII, setEditCandColII] = useState<string[]>([]);
  const [editCandCombStatements, setEditCandCombStatements] = useState<string[]>([]);
  const [editCandCombChoices, setEditCandCombChoices] = useState<string[]>([]);
  const [editCandSeqItems, setEditCandSeqItems] = useState<string[]>([]);
  const [editCandFormula, setEditCandFormula] = useState("");
  const [editCandGivenValues, setEditCandGivenValues] = useState("");

  // In-Place Question Editing Modal State
  const [editingQuestion, setEditingQuestion] = useState<ALQuestion | null>(null);
  const [editStem, setEditStem] = useState("");
  const [editDiagramUrl, setEditDiagramUrl] = useState("");
  const [editRequiresImage, setEditRequiresImage] = useState(false);
  const [editImageDescription, setEditImageDescription] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editPoints, setEditPoints] = useState<number>(1.0);
  const [editDifficulty, setEditDifficulty] = useState("medium");
  const [editCognitiveLevel, setEditCognitiveLevel] = useState("understand");
  const [editCorrectOption, setEditCorrectOption] = useState("A");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editStatements, setEditStatements] = useState<any[]>([]);
  const [editGridKey, setEditGridKey] = useState<any>(null);
  const [updatingQuestion, setUpdatingQuestion] = useState(false);

  // Paper Validation State
  const [validationResult, setValidationResult] = useState<{ is_valid: boolean; errors: string[]; warnings: string[]; summary: any } | null>(null);
  const [validatingPaper, setValidatingPaper] = useState(false);
  const [validationModalOpen, setValidationModalOpen] = useState(false);

  // Manual Question Inputs
  const [stemText, setStemText] = useState("");
  const [diagramUrl, setDiagramUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [points, setPoints] = useState<number>(1.0);
  const [difficulty, setDifficulty] = useState("medium");
  const [cognitiveLevel, setCognitiveLevel] = useState("understand");

  // Options A-E for Direct MCQ (Clean Empty Placeholders)
  const [options, setOptions] = useState<string[]>(["", "", "", "", ""]);
  const [correctOption, setCorrectOption] = useState("A");

  // Template 2: 1-to-5 Multi-Response Grid Statements (Clean Empty Placeholders)
  const [multiResponseStatements, setMultiResponseStatements] = useState<{ code: string; text: string; isTrue: boolean }[]>([
    { code: "A", text: "", isTrue: false },
    { code: "B", text: "", isTrue: false },
    { code: "C", text: "", isTrue: false },
    { code: "D", text: "", isTrue: false },
    { code: "E", text: "", isTrue: false },
  ]);

  // Template 3: Five-Statement Evaluation (Clean Empty Placeholders)
  const [fiveStatements, setFiveStatements] = useState<string[]>(["", "", "", "", ""]);

  // Template 4: Matrix Matching / Profile Grid (Clean Empty Table Structure & Headers)
  const [colIHeader, setColIHeader] = useState("Column I");
  const [colIIHeader, setColIIHeader] = useState("Column II");
  const [colI, setColI] = useState<string[]>(["", "", ""]);
  const [colII, setColII] = useState<string[]>(["", "", ""]);

  // Template 5: Multi-Variable Selection (Clean Empty Placeholders)
  const [combStatements, setCombStatements] = useState<string[]>(["", "", "", ""]);
  const [combChoices, setCombChoices] = useState<string[]>(["", "", "", "", ""]);

  // Template 6: Sequential / Diagnostic (Clean Empty Placeholders)
  const [seqItems, setSeqItems] = useState<string[]>(["", "", "", ""]);

  // Template 7: Incomplete Stem / Calculation (Clean Empty Placeholders)
  const [calcFormula, setCalcFormula] = useState("");
  const [calcValues, setCalcValues] = useState("");

  // Subparts & Rubric for Paper II
  const [structuredSubparts, setStructuredSubparts] = useState<StructuredSubpartInput[]>([
    { part: "a(i)", prompt: "Define the term organelle in eukaryotic cellular organization.", max_points: 2, lines: 3, expected_keywords: "membrane-bound, subcellular structure, specific function" },
    { part: "a(ii)", prompt: "Describe two structural adaptations of inner mitochondrial membrane for ATP synthesis.", max_points: 4, lines: 5, expected_keywords: "cristae folding, high surface area, electron transport complexes, ATP synthase" },
  ]);
  const [essayInstructions, setEssayInstructions] = useState("Answer in clear structured prose. Illustrate with labeled diagrams where required.");
  const [essayRubric, setEssayRubric] = useState<EssayRubricItemInput[]>([
    { item_number: 1, criterion: "Introduction & Structural Organization", description: "Correct definition of thylakoid architecture and photosystem complexes", points: 5.0 },
    { item_number: 2, criterion: "Non-Cyclic Photophosphorylation Mechanism", description: "Detailed step-by-step electron flow from H2O to NADP+", points: 10.0 },
    { item_number: 3, criterion: "Chemiosmotic ATP Generation", description: "Proton gradient accumulation across thylakoid membrane into lumen", points: 5.0 }
  ]);

  const [savingQuestion, setSavingQuestion] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishConfirmModalOpen, setPublishConfirmModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Controlled Revision State
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionType, setRevisionType] = useState<"single_question" | "paper_wide" | "marking_correction">("single_question");
  const [revisionQuestionNum, setRevisionQuestionNum] = useState<number>(17);
  const [revisionReason, setRevisionReason] = useState("Corrected distractor option B in Question 17.");
  const [revisionNotifyStudents, setRevisionNotifyStudents] = useState(true);
  const [revisingPaper, setRevisingPaper] = useState(false);

  useEffect(() => {
    api.listCourses()
      .then((data) => {
        setCourses(data || []);
        if (data && data.length > 0) {
          setSelectedCourseId(data[0].id);
          api.listUnits(data[0].id).then(uData => {
            const fetchedUnits = uData || [];
            setUnits(fetchedUnits);
            if (fetchedUnits.length > 0) {
              setAiSelectedUnitIds(fetchedUnits.map(u => u.id));
            }
          }).catch(console.error);
        }
      })
      .catch(console.error);

    if (existingExamIdParam) {
      const examId = safeParseInt(existingExamIdParam, 0);
      if (examId > 0) {
        setLoadingExam(true);
        refreshCreatedExam(examId);
      }
    }
  }, [existingExamIdParam]);

  // Protection against accidental page unload during AI generation or when unaccepted candidates exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedAIGeneration = generatingAI || generatingStructuredAI;
      const hasUnacceptedCandidates = (aiCandidates.length > 0 && candidateReviewModalOpen) ||
        (structuredAiCandidates.length > 0 && structuredReviewModalOpen) ||
        (essayAiCandidates.length > 0 && essayReviewModalOpen);

      if (hasUnsavedAIGeneration || hasUnacceptedCandidates) {
        e.preventDefault();
        e.returnValue = "You have unsaved AI-generated questions or active generation in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [generatingAI, generatingStructuredAI, aiCandidates, candidateReviewModalOpen, structuredAiCandidates, structuredReviewModalOpen, essayAiCandidates, essayReviewModalOpen]);

  const refreshCreatedExam = async (examId: number) => {
    try {
      setAutosaveStatus("saving");
      const updated = await api.getALExam(examId);
      setCreatedExam(updated);
      setTitle(updated.title);
      setDescription(updated.description || "");
      setTimeLimit(safeParseInt(updated.time_limit_minutes, 120));
      setMaxAttempts(safeParseInt(updated.max_attempts, 1));
      setAvailableFrom(updated.available_from ? updated.available_from.slice(0, 16) : "");
      setAvailableUntil(updated.available_until ? updated.available_until.slice(0, 16) : "");
      setShowResultImmediately(updated.show_result_immediately ?? true);
      setPaperType(updated.exam_type as any);
      setAutosaveStatus("saved");
    } catch (e) {
      console.error("Failed to refresh exam", e);
      setAutosaveStatus("idle");
    } finally {
      setLoadingExam(false);
    }
  };



  const handleApplyPreset = (mode: ExamPresetMode) => {
    setPresetMode(mode);
    if (mode === "full_paper") {
      setTitle("2026 G.C.E. A/L Biology Full Examination Paper");
      setDescription("Combined Paper 1 (50 MCQs) + Paper 2 Part A (Structured) + Part B (Essay)");
      setPaperType("full_paper");
      setTimeLimit(300);
      setTotalQuestions(60);
      setActiveSectionTab("paper_1");
    } else if (mode === "paper_1_only") {
      setTitle("G.C.E. A/L Biology Paper I (50 MCQ Speed Test)");
      setDescription("50 Multiple Choice Questions (2 Hours Speed Test)");
      setPaperType("paper_1_mcq");
      setTimeLimit(120);
      setTotalQuestions(50);
      setActiveSectionTab("paper_1");
    } else if (mode === "paper_2_only") {
      setTitle("G.C.E. A/L Biology Paper II (Full Theory & Essay)");
      setDescription("Part A Structured Questions (40 Points) + Part B Essay Questions (60 Points)");
      setPaperType("paper_2");
      setTimeLimit(180);
      setTotalQuestions(10);
      setActiveSectionTab("part_a");
    } else if (mode === "paper_2_structured") {
      setTitle("G.C.E. A/L Biology Paper II Part A — Structured Sheet");
      setDescription("4 Structured Questions with subpart line limits & keyword rubrics");
      setPaperType("paper_2_structured");
      setTimeLimit(120);
      setTotalQuestions(4);
      setActiveSectionTab("part_a");
    } else if (mode === "paper_2_essay") {
      setTitle("G.C.E. A/L Biology Paper II Part B — Essay Paper");
      setDescription("Choice of Essay prompts with multi-criterion evaluation rubrics");
      setPaperType("paper_2_essay");
      setTimeLimit(120);
      setTotalQuestions(4);
      setActiveSectionTab("part_b");
    } else {
      setTitle("Custom A/L Biology Modular Assessment");
      setDescription("Teacher-controlled flexible assessment structure");
      setPaperType("full_paper");
      setTimeLimit(60);
      setTotalQuestions(10);
      setActiveSectionTab("paper_1");
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createCustomALExam({
        course_id: typeof selectedCourseId === "number" ? selectedCourseId : undefined,
        title,
        description,
        exam_type: paperType,
        time_limit_minutes: safeParseInt(timeLimit, 120),
        total_questions: safeParseInt(totalQuestions, 50),
        max_attempts: safeParseInt(maxAttempts, 1),
        is_published: false,
        score_multiplier: 1.0,
      });
      setCreatedExam(res);
      addToast(`Assessment "${res.title}" created. Entered Assembly Studio.`, "success");
      router.replace(`/dashboard/teacher/al-exams/create?exam_id=${res.id}`);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to create assessment container.", "error");
    }
  };

  const handleRunValidation = async () => {
    if (!createdExam) return;
    setValidatingPaper(true);
    try {
      const result = await api.validateALExam(createdExam.id);
      setValidationResult(result);
      setValidationModalOpen(true);
    } catch (e: any) {
      console.error(e);
      addToast("Failed to validate paper.", "error");
    } finally {
      setValidatingPaper(false);
    }
  };

  // Check lessons and extracted materials count for selected units (Phase 9)
  const { selectedUnitsData, totalLessonsCount, totalMaterialsCount, lessonsWithMaterialsCount } = useMemo(() => {
    const selUnits = units.filter(u => aiSelectedUnitIds.length === 0 || aiSelectedUnitIds.includes(u.id));
    let lCount = 0;
    let mCount = 0;
    let lWithMCount = 0;
    for (const u of selUnits) {
      for (const l of (u.lessons || [])) {
        lCount += 1;
        const matCount = (l as any).material_count || ((l as any).materials || []).length || 0;
        mCount += matCount;
        if (matCount > 0) lWithMCount += 1;
      }
    }
    return {
      selectedUnitsData: selUnits,
      totalLessonsCount: lCount,
      totalMaterialsCount: mCount,
      lessonsWithMaterialsCount: lWithMCount,
    };
  }, [units, aiSelectedUnitIds]);

  const handleOpenAiModal = (section: "paper_1" | "part_a" | "part_b") => {
    setBankTargetSection(section);
    setAiModalOpen(true);
  };

  const handleGenerateAIQuestions = async () => {
    if (!createdExam) return;
    if (aiDistTotalSum !== 100) {
      addToast(`Distribution total must equal 100% (currently ${aiDistTotalSum}%).`, "error");
      return;
    }

    setGeneratingAI(true);
    setAiClassifiedError(null);
    setAiLoadingStage("Analyzing selected lesson materials...");

    const stageTimer1 = setTimeout(() => setAiLoadingStage("Building question distribution & remainder allocation..."), 1200);
    const stageTimer2 = setTimeout(() => setAiLoadingStage("Generating structured A/L questions via Gemini AI..."), 2500);
    const stageTimer3 = setTimeout(() => setAiLoadingStage("Validating question schemas & 1-to-5 combination keys..."), 4000);

    const targetReqCount = safeParseInt(aiQuestionCount, 50);

    try {
      const targetType = bankTargetSection === "paper_1"
        ? "paper_1_mcq"
        : bankTargetSection === "part_a"
          ? "paper_2_structured"
          : "paper_2_essay";

      const candidates = await api.generateAIQuestions({
        assessment_type: targetType,
        question_count: targetReqCount,
        generation_mode: aiGenMode === "al_preset" ? "al_certified" : "custom",
        subtype_distribution: aiTemplateDist,
        difficulty_distribution: aiDifficultyMode === "al_recommended" 
          ? AL_DEFAULT_DIFFICULTY_DISTRIBUTION 
          : { easy: 0.2, moderate: 0.6, standard: 0.2, challenging: 0.0, advanced: 0.0 },
        course_id: typeof selectedCourseId === "number" ? selectedCourseId : undefined,
        unit_ids: aiSelectedUnitIds.length > 0 ? aiSelectedUnitIds : undefined,
        material_scopes: [...aiPrimaryMaterials, ...aiSupportingMaterials],
        custom_instruction: aiCustomInstruction || undefined,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      if (!candidates || candidates.length === 0) {
        throw new Error("The AI generator returned zero questions. Your configuration has been preserved, so you can safely retry.");
      }

      // Duplicate detection, scientific symbol normalization, and candidate status tagging
      const existingStems = new Set((createdExam.questions || []).map(q => q.stem_text.trim().toLowerCase()));
      const processedCandidates = (candidates || []).map(c => {
        const stemClean = (c.stem_text || "").trim().toLowerCase();
        const isDuplicate = existingStems.has(stemClean);
        const reqImg = bool(c.requires_image || false);
        const hasUrl = !!c.diagram_url;
        return {
          ...c,
          stem_text: normalizeScientificSymbols(c.stem_text),
          explanation: normalizeScientificSymbols(c.explanation),
          options: (c.options || []).map(normalizeScientificSymbols),
          statements_json: (c.statements_json || []).map((s: any) => ({ ...s, text: normalizeScientificSymbols(s.text) })),
          grid_key_json: c.grid_key_json ? {
            ...c.grid_key_json,
            colIHeader: normalizeScientificSymbols(c.grid_key_json.colIHeader),
            colIIHeader: normalizeScientificSymbols(c.grid_key_json.colIIHeader),
            colI: (c.grid_key_json.colI || []).map(normalizeScientificSymbols),
            colII: (c.grid_key_json.colII || []).map(normalizeScientificSymbols),
            formula: normalizeScientificSymbols(c.grid_key_json.formula),
            given_values: normalizeScientificSymbols(c.grid_key_json.given_values),
          } : undefined,
          requires_image: reqImg,
          image_description: normalizeScientificSymbols(c.image_description) || (reqImg ? "Biological diagram / chart representation" : undefined),
          is_duplicate: isDuplicate,
          status: reqImg && !hasUrl ? "needs_image" : "ready"
        };
      });

      setAiCandidates(processedCandidates);
      setSelectedCandIdx(0);
      setIsEditingCandidate(false);
      setAiModalOpen(false);
      setCandidateReviewModalOpen(true);

      if (candidates.length < targetReqCount) {
        addToast(`Generated ${candidates.length} of ${targetReqCount} candidate questions for draft review! Valid candidates preserved.`, "info");
      } else {
        addToast(`Successfully generated ${candidates.length} MCQs for candidate review!`, "success");
      }
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      console.error("MCQ generation failed:", err);
      const classified = classifyAIError(err);
      setAiClassifiedError(classified);
      addToast(classified.message, "error");
    } finally {
      setGeneratingAI(false);
      setAiLoadingStage(null);
    }
  };

  const handleGenerateRemainingQuestions = async () => {
    if (!createdExam) return;
    const targetReqCount = safeParseInt(aiQuestionCount, 50);
    const remainingCount = targetReqCount - aiCandidates.length;
    if (remainingCount <= 0) return;

    setGeneratingAI(true);
    try {
      const candidates = await api.generateAIQuestions({
        assessment_type: "paper_1_mcq",
        question_count: remainingCount,
        generation_mode: aiGenMode === "al_preset" ? "al_certified" : "custom",
        subtype_distribution: aiTemplateDist,
        difficulty_distribution: aiDifficultyMode === "al_recommended" 
          ? AL_DEFAULT_DIFFICULTY_DISTRIBUTION 
          : { easy: 0.2, moderate: 0.6, standard: 0.2, challenging: 0.0, advanced: 0.0 },
        course_id: typeof selectedCourseId === "number" ? selectedCourseId : undefined,
        unit_ids: aiSelectedUnitIds.length > 0 ? aiSelectedUnitIds : undefined,
        material_scopes: [...aiPrimaryMaterials, ...aiSupportingMaterials],
        custom_instruction: aiCustomInstruction || undefined,
      });

      if (candidates && candidates.length > 0) {
        const processedNew = candidates.map((c, idx) => {
          const qNum = aiCandidates.length + idx + 1;
          const reqImg = bool(c.requires_image || false);
          const hasUrl = !!c.diagram_url;
          return {
            ...c,
            candidate_id: `ai_cand_${qNum}`,
            question_number: qNum,
            stem_text: normalizeScientificSymbols(c.stem_text),
            explanation: normalizeScientificSymbols(c.explanation),
            options: (c.options || []).map(normalizeScientificSymbols),
            statements_json: (c.statements_json || []).map((s: any) => ({ ...s, text: normalizeScientificSymbols(s.text) })),
            grid_key_json: c.grid_key_json ? {
              ...c.grid_key_json,
              colIHeader: normalizeScientificSymbols(c.grid_key_json.colIHeader),
              colIIHeader: normalizeScientificSymbols(c.grid_key_json.colIIHeader),
              colI: (c.grid_key_json.colI || []).map(normalizeScientificSymbols),
              colII: (c.grid_key_json.colII || []).map(normalizeScientificSymbols),
              formula: normalizeScientificSymbols(c.grid_key_json.formula),
              given_values: normalizeScientificSymbols(c.grid_key_json.given_values),
            } : undefined,
            requires_image: reqImg,
            image_description: normalizeScientificSymbols(c.image_description) || (reqImg ? "Biological diagram / chart representation" : undefined),
            is_duplicate: false,
            status: reqImg && !hasUrl ? "needs_image" : "ready"
          };
        });

        setAiCandidates(prev => [...prev, ...processedNew]);
        addToast(`Successfully generated ${processedNew.length} remaining question(s)! Total: ${aiCandidates.length + processedNew.length}`, "success");
      }
    } catch (err: any) {
      console.error("Failed to generate remaining questions:", err);
      addToast(err?.message || "Failed to generate remaining questions.", "error");
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleRegenerateSingleCandidate = async (cand: any, idx: number) => {
    const feedback = window.prompt("Enter specific examiner feedback or instruction for regenerating this question:", "");
    if (feedback === null) return;

    setGeneratingAI(true);
    try {
      const regenerated = await api.regenerateAICandidate(cand, feedback || undefined);
      if (regenerated) {
        const qNum = idx + 1;
        const reqImg = bool(regenerated.requires_image || false);
        const hasUrl = !!regenerated.diagram_url;
        const processed = {
          ...regenerated,
          candidate_id: `ai_cand_${qNum}`,
          question_number: qNum,
          stem_text: normalizeScientificSymbols(regenerated.stem_text),
          explanation: normalizeScientificSymbols(regenerated.explanation),
          options: (regenerated.options || []).map(normalizeScientificSymbols),
          statements_json: (regenerated.statements_json || []).map((s: any) => ({ ...s, text: normalizeScientificSymbols(s.text) })),
          requires_image: reqImg,
          image_description: normalizeScientificSymbols(regenerated.image_description) || (reqImg ? "Biological diagram" : undefined),
          status: "edited" as const
        };
        setAiCandidates(prev => {
          const next = [...prev];
          next[idx] = processed;
          return next;
        });
        addToast(`Candidate #${qNum} successfully regenerated with slot preservation!`, "success");
      }
    } catch (err: any) {
      console.error("Failed to regenerate candidate:", err);
      addToast(err?.message || "Failed to regenerate candidate.", "error");
    } finally {
      setGeneratingAI(false);
    }
  };

  // Memoized Paper Quality and Authenticity Audit (Phase 8)
  const paperQualityAudit = useMemo(() => {
    if (!aiCandidates || aiCandidates.length === 0) return null;
    const total = aiCandidates.length;

    // Check syllabus progression
    let prevUnit = 0;
    let syllabusViolations = 0;
    aiCandidates.forEach((c, idx) => {
      const qNum = idx + 1;
      const u = c.unit_number || 1;
      if (qNum === 41) prevUnit = 0;
      if (u < prevUnit && (prevUnit - u) > 1) syllabusViolations++;
      prevUnit = Math.max(prevUnit, u);
    });
    const syllabusScore = Math.max(0, 100 - syllabusViolations * 10);

    // Check answer balance
    const numToLetter: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" };
    const keyCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    aiCandidates.forEach(c => {
      const rawK = String(c.correct_option || "A").toUpperCase().trim();
      const k = numToLetter[rawK] || rawK;
      if (keyCounts[k] !== undefined) keyCounts[k]++;
    });
    const expectedPerKey = total / 5.0;
    const chiSq = Object.values(keyCounts).reduce((sum, count) => sum + Math.pow(count - expectedPerKey, 2) / (expectedPerKey || 1), 0);
    const answerScore = Math.max(0, Math.min(100, Math.round(100 - chiSq * 3.0)));

    // Check consecutive type runs
    let typeRuns = 0;
    for (let i = 2; i < total; i++) {
      if (aiCandidates[i].template_type !== "multi_response_grid" &&
          aiCandidates[i].template_type === aiCandidates[i - 1].template_type &&
          aiCandidates[i - 1].template_type === aiCandidates[i - 2].template_type) {
        typeRuns++;
      }
    }
    const typeScore = Math.max(0, 100 - typeRuns * 10);

    const overallScore = Math.round(0.35 * syllabusScore + 0.35 * answerScore + 0.30 * typeScore);

    const warnings: string[] = [];
    if (syllabusViolations > 0) warnings.push(`Syllabus chronology has ${syllabusViolations} minor unit step backward(s).`);
    if (typeRuns > 0) warnings.push(`Detected ${typeRuns} instances of 3+ consecutive identical question types.`);
    Object.entries(keyCounts).forEach(([k, count]) => {
      if (count > expectedPerKey * 1.8) warnings.push(`Option (${k}) appears with high frequency (${count}/${total}).`);
    });

    return {
      overallScore,
      syllabusScore,
      answerScore,
      typeScore,
      keyCounts,
      warnings,
    };
  }, [aiCandidates]);


  // Helper boolean converter
  const bool = (v: any) => v === true || v === "true" || v === 1;

  // Memoized Hamilton largest-remainder exact question counts calculation
  const calculatedTargetCounts = useMemo(() => {
    return calculateExactQuestionCounts(safeParseInt(aiQuestionCount, 50), aiTemplateDist);
  }, [aiQuestionCount, aiTemplateDist]);

  const aiDistTotalSum = useMemo(() => {
    return Object.values(aiTemplateDist).reduce((sum, v) => sum + (v || 0), 0);
  }, [aiTemplateDist]);

  const filteredCandidates = useMemo(() => {
    return aiCandidates.filter(c => {
      if (reviewFilterTab === "ready") return c.status === "ready" || (!c.requires_image || c.diagram_url);
      if (reviewFilterTab === "needs_image") return c.requires_image && !c.diagram_url;
      if (reviewFilterTab === "edited") return c.status === "edited";
      if (reviewFilterTab === "accepted") return c.status === "accepted";
      if (reviewFilterTab === "rejected") return c.status === "rejected";
      return true;
    });
  }, [aiCandidates, reviewFilterTab]);

  const readyCandidatesCount = useMemo(() => {
    return aiCandidates.filter(c => c.status !== "accepted" && c.status !== "rejected" && (!c.requires_image || c.diagram_url)).length;
  }, [aiCandidates]);

  const needsImageCandidatesCount = useMemo(() => {
    return aiCandidates.filter(c => c.requires_image && !c.diagram_url).length;
  }, [aiCandidates]);

  const editedCandidatesCount = useMemo(() => {
    return aiCandidates.filter(c => c.status === "edited").length;
  }, [aiCandidates]);

  const acceptedCandidatesCount = useMemo(() => {
    return aiCandidates.filter(c => c.status === "accepted").length;
  }, [aiCandidates]);

  const rejectedCandidatesCount = useMemo(() => {
    return aiCandidates.filter(c => c.status === "rejected").length;
  }, [aiCandidates]);

  const activeCandidate = aiCandidates[selectedCandIdx] || null;

  const handleSelectAiPresetMode = (mode: "al_preset" | "custom") => {
    if (mode === "al_preset") {
      const isModified = (Object.keys(AL_CERTIFIED_PAPER_1_DISTRIBUTION) as Array<keyof QuestionDistribution>).some(
        k => aiTemplateDist[k] !== AL_CERTIFIED_PAPER_1_DISTRIBUTION[k]
      );
      if (isModified) {
        setPresetConfirmModalOpen(true);
      } else {
        setAiGenMode("al_preset");
        setAiQuestionCount(50);
        setAiTemplateDist({ ...AL_CERTIFIED_PAPER_1_DISTRIBUTION });
      }
    } else {
      setAiGenMode("custom");
    }
  };

  const handleDistributionChange = (changedKey: keyof QuestionDistribution, newRawValue: number) => {
    if (aiGenMode === "al_preset") return;
    const balanced = redistributeEqualDelta(aiTemplateDist, changedKey, newRawValue);
    setAiTemplateDist(balanced);
  };

  const handleUploadCandidateImage = (candIdx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAiCandidates(prev => prev.map((c, i) => i === candIdx ? { ...c, diagram_url: dataUrl, status: "ready" } : c));
      addToast(`Attached image to Candidate #${candIdx + 1}!`, "success");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCandidateImage = (candIdx: number) => {
    setAiCandidates(prev => prev.map((c, i) => i === candIdx ? { ...c, diagram_url: undefined, status: c.requires_image ? "needs_image" : "ready" } : c));
    addToast(`Removed image from Candidate #${candIdx + 1}.`, "info");
  };

  const handleStartInlineEditCandidate = (cand: any) => {
    setIsEditingCandidate(true);
    setEditCandStem(cand.stem_text || "");
    setEditCandOptions(cand.options ? [...cand.options] : ["", "", "", "", ""]);
    setEditCandCorrectOption(cand.correct_option || "A");
    setEditCandPoints(cand.points || 1.0);
    setEditCandExplanation(cand.explanation || "");
    setEditCandStatements(cand.statements_json ? JSON.parse(JSON.stringify(cand.statements_json)) : [
      { code: "A", text: "", is_true: true },
      { code: "B", text: "", is_true: true },
      { code: "C", text: "", is_true: false },
      { code: "D", text: "", is_true: true },
      { code: "E", text: "", is_true: false },
    ]);
    const gKey = cand.grid_key_json || {};
    setEditCandColIHeader(gKey.colIHeader || "Column I");
    setEditCandColIIHeader(gKey.colIIHeader || "Column II");
    setEditCandColI(gKey.colI ? [...gKey.colI] : ["", "", ""]);
    setEditCandColII(gKey.colII ? [...gKey.colII] : ["", "", ""]);
    setEditCandCombStatements(gKey.statements ? [...gKey.statements] : ["", "", "", ""]);
    setEditCandCombChoices(cand.options ? [...cand.options] : ["", "", "", "", ""]);
    setEditCandSeqItems(gKey.seq_items ? [...gKey.seq_items] : ["", "", "", ""]);
    setEditCandFormula(gKey.formula || "");
    setEditCandGivenValues(gKey.given_values || "");
  };

  const handleSaveInlineCandidateEdit = () => {
    if (!activeCandidate) return;
    const updated = {
      ...activeCandidate,
      stem_text: normalizeScientificSymbols(editCandStem),
      options: editCandOptions.map(normalizeScientificSymbols),
      correct_option: editCandCorrectOption,
      points: editCandPoints,
      explanation: normalizeScientificSymbols(editCandExplanation),
      statements_json: editCandStatements.map(s => ({ ...s, text: normalizeScientificSymbols(s.text) })),
      grid_key_json: {
        ...activeCandidate.grid_key_json,
        colIHeader: normalizeScientificSymbols(editCandColIHeader),
        colIIHeader: normalizeScientificSymbols(editCandColIIHeader),
        colI: editCandColI.map(normalizeScientificSymbols),
        colII: editCandColII.map(normalizeScientificSymbols),
        formula: normalizeScientificSymbols(editCandFormula),
        given_values: normalizeScientificSymbols(editCandGivenValues),
      },
      status: "edited"
    };

    setAiCandidates(prev => prev.map((c, idx) => idx === selectedCandIdx ? updated : c));
    setIsEditingCandidate(false);
    addToast(`Saved changes for Question #${selectedCandIdx + 1}!`, "success");
  };

  const handleAcceptCandidate = async (cand: any) => {
    if (!createdExam) return;
    if (cand.requires_image && !cand.diagram_url) {
      addToast("Accept unavailable until the required image is uploaded.", "error");
      return;
    }
    try {
      const res = await api.batchAcceptCandidates(createdExam.id, [cand]);
      if (res.accepted > 0) {
        addToast("Question accepted successfully!", "success");
        setAiCandidates(prev => prev.map(c => (c.candidate_id || c.stem_text) === (cand.candidate_id || cand.stem_text) ? { ...c, status: "accepted" } : c));
        await refreshCreatedExam(createdExam.id);
      } else {
        addToast("Failed to accept candidate: " + (res.errors?.[0]?.reason || "Validation error"), "error");
      }
    } catch (e: any) {
      console.error(e);
      addToast(e?.message || "Failed to accept candidate.", "error");
    }
  };

  const handleAcceptAllReadyCandidates = async () => {
    if (!createdExam || aiCandidates.length === 0 || acceptingBatch) return;
    const readyBatch = aiCandidates.filter(c => c.status !== "accepted" && c.status !== "rejected" && (!c.requires_image || c.diagram_url));
    
    if (readyBatch.length === 0) {
      addToast("No ready candidates to accept. Please attach required images first.", "warning");
      return;
    }

    setAcceptingBatch(true);
    try {
      const res = await api.batchAcceptCandidates(createdExam.id, readyBatch);
      const acceptedIds = new Set(readyBatch.map(c => c.candidate_id || c.stem_text));
      
      setAiCandidates(prev => prev.map(c => {
        if (acceptedIds.has(c.candidate_id || c.stem_text)) {
          return { ...c, status: "accepted" };
        }
        return c;
      }));

      addToast(`${res.accepted} questions accepted successfully.`, "success");
      setCandidateReviewModalOpen(false);
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to batch accept ready candidates.", "error");
    } finally {
      setAcceptingBatch(false);
    }
  };

  const resetMcqAuthoringState = (newFormat: ALQuestionTemplate) => {
    setActiveMcqFormat(newFormat);
    setStemText("");
    setDiagramUrl("");
    setExplanation("");
    setPoints(1.0);
    setDifficulty("medium");
    setCognitiveLevel("understand");
    setOptions(["", "", "", "", ""]);
    setCorrectOption("A");
    setMultiResponseStatements([
      { code: "A", text: "", isTrue: false },
      { code: "B", text: "", isTrue: false },
      { code: "C", text: "", isTrue: false },
      { code: "D", text: "", isTrue: false },
      { code: "E", text: "", isTrue: false },
    ]);
    setFiveStatements(["", "", "", "", ""]);
    setColIHeader("Column I");
    setColIIHeader("Column II");
    setColI(["", "", ""]);
    setColII(["", "", ""]);
    setCombStatements(["", "", "", ""]);
    setCombChoices(["", "", "", "", ""]);
    setSeqItems(["", "", "", ""]);
    setCalcFormula("");
    setCalcValues("");
  };

  const handleSelectMcqFormatWithConfirmation = (newFormat: ALQuestionTemplate) => {
    const hasContent = stemText.trim() !== "" || options.some(o => o.trim() !== "") || fiveStatements.some(s => s.trim() !== "");
    if (hasContent) {
      if (window.confirm("Changing the question format will clear your current question content. Do you want to continue?")) {
        resetMcqAuthoringState(newFormat);
        setFormatSelectorModalOpen(false);
      }
    } else {
      resetMcqAuthoringState(newFormat);
      setFormatSelectorModalOpen(false);
    }
  };


  const handleEditCandidate = (cand: any, idx: number) => {
    const fmt = (cand.template_type || "generic_mcq") as ALQuestionTemplate;
    setActiveMcqFormat(fmt);
    setStemText(cand.stem_text || "");
    setDiagramUrl(cand.diagram_url || "");
    setExplanation(cand.explanation || "");
    setPoints(safeParseFloat(cand.points, 1.0));
    setCognitiveLevel(cand.cognitive_level || "understand");
    setDifficulty(cand.difficulty || "medium");
    setOptions(cand.options && cand.options.length >= 5 ? cand.options : ["", "", "", "", ""]);
    setCorrectOption(cand.correct_option || "A");

    if (cand.statements_json && Array.isArray(cand.statements_json)) {
      setMultiResponseStatements(cand.statements_json.map((s: any) => ({
        code: s.code || "A",
        text: s.text || "",
        isTrue: !!s.is_true
      })));
    }

    setCandidateEditIdx(idx);
    setCandidateReviewModalOpen(false);
    addToast(`Loaded Candidate #${idx + 1} (${fmt}) into Authoring Form for editing!`, "info");
  };

  const handleOpenBankModal = async (section: "paper_1" | "part_a" | "part_b") => {
    setBankTargetSection(section);
    setImportModalOpen(true);
    setSelectedBankIds([]);
    setLoadingBank(true);
    try {
      const data = await api.getQuestionBank();
      setBankQuestions(data || []);
    } catch (e) {
      console.error(e);
      addToast("Failed to load Question Bank items.", "error");
    } finally {
      setLoadingBank(false);
    }
  };

  const toggleBankSelection = (id: number) => {
    setSelectedBankIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleImportSelectedBankQuestions = async () => {
    if (!createdExam || selectedBankIds.length === 0) return;

    const existingStems = new Set((createdExam.questions || []).map(q => q.stem_text.trim().toLowerCase()));
    const selectedObj = bankQuestions.filter(q => selectedBankIds.includes(q.id));
    const hasDuplicate = selectedObj.some(q => existingStems.has(q.question_text.trim().toLowerCase()));

    if (hasDuplicate && !duplicateWarning) {
      setDuplicateWarning("One or more selected Question Bank items are already included in this assessment paper.");
      return;
    }

    setImportingBank(true);
    setDuplicateWarning(null);
    try {
      await api.importQuestionsToALExam(createdExam.id, selectedBankIds);
      addToast(`Successfully imported ${selectedBankIds.length} question(s) into ${bankTargetSection.toUpperCase()}!`, "success");
      setImportModalOpen(false);
      setSelectedBankIds([]);
      await refreshCreatedExam(createdExam.id);
    } catch (e: any) {
      console.error(e);
      addToast(e?.message || "Failed to import questions from Question Bank.", "error");
    } finally {
      setImportingBank(false);
    }
  };

  // Add MCQ Question with Specific Template Payload
  const handleAddMCQQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdExam) return;

    // Format-Specific Validation
    const missingItems: string[] = [];
    if (!stemText.trim()) missingItems.push("Question Stem");

    if (activeMcqFormat === "generic_mcq" || activeMcqFormat === "incomplete_stem") {
      options.forEach((opt, i) => {
        if (!opt.trim()) missingItems.push(`Option ${String.fromCharCode(65 + i)}`);
      });
      if (!correctOption) missingItems.push("Correct Answer Selection");
    } else if (activeMcqFormat === "five_statement_truth") {
      fiveStatements.forEach((stmt, i) => {
        if (!stmt.trim()) missingItems.push(`Statement ${String.fromCharCode(65 + i)}`);
      });
      if (!correctOption) missingItems.push("Correct Statement Selection");
    } else if (activeMcqFormat === "multi_response_grid") {
      multiResponseStatements.forEach((stmt, i) => {
        if (!stmt.text.trim()) missingItems.push(`Statement ${stmt.code}`);
      });
    } else if (activeMcqFormat === "matching_column") {
      if (colI.some(i => !i.trim()) || colII.some(i => !i.trim())) {
        missingItems.push("All Matrix Column I & II Items");
      }
    } else if (activeMcqFormat === "combination_grid") {
      combStatements.forEach((stmt, i) => {
        if (!stmt.trim()) missingItems.push(`Statement ${String.fromCharCode(65 + i)}`);
      });
      combChoices.forEach((ch, i) => {
        if (!ch.trim()) missingItems.push(`Combination Choice ${i + 1}`);
      });
      if (!correctOption) missingItems.push("Correct Combination Selection");
    } else if (activeMcqFormat === "sequential_diagnostic") {
      seqItems.forEach((item, i) => {
        if (!item.trim()) missingItems.push(`Sequence Item ${i + 1}`);
      });
    }

    if (missingItems.length > 0) {
      addToast(`Question cannot be saved yet. Missing: ${missingItems.slice(0, 3).join(", ")}${missingItems.length > 3 ? "..." : ""}`, "error");
      return;
    }

    setSavingQuestion(true);
    try {
      const currentCount = createdExam.questions?.length || 0;
      let finalOptions = options;
      let finalCorrectOpt = correctOption;
      let statements_json: any = undefined;
      let grid_key_json: any = undefined;

      if (activeMcqFormat === "multi_response_grid") {
        const truthObj = {
          A: multiResponseStatements[0]?.isTrue || false,
          B: multiResponseStatements[1]?.isTrue || false,
          C: multiResponseStatements[2]?.isTrue || false,
          D: multiResponseStatements[3]?.isTrue || false,
          E: multiResponseStatements[4]?.isTrue || false,
        };
        finalCorrectOpt = resolveMultiResponseOption(truthObj);
        finalOptions = [
          "Option 1: Statements A, B, and D are correct",
          "Option 2: Statements A, C, and D are correct",
          "Option 3: Statements A and B only are correct",
          "Option 4: Statements C and D only are correct",
          "Option 5: Any other valid combination"
        ];
        statements_json = multiResponseStatements.map(s => ({ code: s.code, text: s.text, is_true: s.isTrue }));
        grid_key_json = { truth: truthObj, answer_option: finalCorrectOpt };
      } else if (activeMcqFormat === "five_statement_truth") {
        finalOptions = fiveStatements;
      } else if (activeMcqFormat === "matching_column") {
        grid_key_json = { colIHeader, colIIHeader, colI, colII };
      } else if (activeMcqFormat === "combination_grid") {
        statements_json = combStatements.map((text, i) => ({ code: String.fromCharCode(65 + i), text }));
        finalOptions = combChoices;
      } else if (activeMcqFormat === "sequential_diagnostic") {
        statements_json = seqItems.map((text, i) => ({ step: i + 1, text }));
      } else if (activeMcqFormat === "incomplete_stem") {
        grid_key_json = { formula: calcFormula, given_values: calcValues };
      }

      await api.createAuthoringQuestion({
        exam_id: createdExam.id,
        question_number: currentCount + 1,
        template_type: activeMcqFormat,
        stem_text: stemText,
        diagram_url: diagramUrl || undefined,
        explanation: explanation.trim() || undefined,
        points: safeParseFloat(points, 1.0),
        cognitive_level: cognitiveLevel,
        difficulty: difficulty,
        options: finalOptions,
        correct_option: finalCorrectOpt,
        statements_json,
        grid_key_json,
      });

      addToast(`MCQ Question #${currentCount + 1} (${getTemplateBadgeTitle(activeMcqFormat).label}) added!`, "success");
      resetMcqAuthoringState(activeMcqFormat);
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to add question.", "error");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleAddStructuredQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdExam) return;
    if (!stemText.trim()) {
      addToast("Please enter main structured question stem text.", "error");
      return;
    }

    setSavingQuestion(true);
    try {
      const currentCount = createdExam.questions?.length || 0;
      const totalPoints = structuredSubparts.reduce((sum, sp) => sum + safeParseFloat(sp.max_points, 0), 0);

      await api.createAuthoringQuestion({
        exam_id: createdExam.id,
        question_number: currentCount + 1,
        template_type: "structured_subparts" as ALQuestionTemplate,
        stem_text: stemText,
        diagram_url: diagramUrl || undefined,
        explanation: explanation || undefined,
        points: totalPoints > 0 ? totalPoints : 10.0,
        cognitive_level: cognitiveLevel,
        difficulty: difficulty,
        structured_subparts_json: structuredSubparts.map(sp => ({
          part: sp.part,
          prompt: sp.prompt,
          max_points: safeParseFloat(sp.max_points, 1),
          lines: safeParseInt(sp.lines, 2),
          expected_keywords: sp.expected_keywords.split(",").map(k => k.trim()).filter(Boolean)
        })),
      });

      addToast(`Structured Question #${currentCount + 1} added!`, "success");
      setStemText("");
      setDiagramUrl("");
      setExplanation("");
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to add structured question.", "error");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleAddEssayQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdExam) return;
    if (!stemText.trim()) {
      addToast("Please enter main essay prompt text.", "error");
      return;
    }

    setSavingQuestion(true);
    try {
      const currentCount = createdExam.questions?.length || 0;
      const totalPoints = essayRubric.reduce((sum, r) => sum + safeParseFloat(r.points, 0), 0);

      await api.createAuthoringQuestion({
        exam_id: createdExam.id,
        question_number: currentCount + 1,
        template_type: "essay_rubric" as ALQuestionTemplate,
        stem_text: stemText,
        assertion_text: essayInstructions,
        explanation: explanation || undefined,
        points: totalPoints > 0 ? totalPoints : 20.0,
        cognitive_level: cognitiveLevel,
        difficulty: difficulty,
        essay_checklist_json: essayRubric.map(r => ({
          item_number: safeParseInt(r.item_number, 1),
          criterion: r.criterion,
          description: r.description,
          points: safeParseFloat(r.points, 1.0)
        })),
      });

      addToast(`Essay Question #${currentCount + 1} added!`, "success");
      setStemText("");
      setExplanation("");
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to add essay question.", "error");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleOpenEditQuestion = (q: ALQuestion) => {
    setEditingQuestion(q);
    setEditStem(q.stem_text);
    setEditDiagramUrl(q.diagram_url || "");
    setEditRequiresImage(!!q.requires_image || !!q.diagram_url);
    setEditImageDescription(q.image_description || "");
    setEditExplanation(q.explanation || "");
    setEditPoints(safeParseFloat(q.points, 1.0));
    setEditDifficulty(q.difficulty || "medium");
    setEditCognitiveLevel(q.cognitive_level || "understand");
    setEditCorrectOption(q.correct_option || "A");
    setEditOptions(q.options && q.options.length >= 5 ? [...q.options] : ["Choice A", "Choice B", "Choice C", "Choice D", "Choice E"]);
    setEditStatements(q.statements_json ? (Array.isArray(q.statements_json) ? [...q.statements_json] : []) : []);
    setEditGridKey(q.grid_key_json ? JSON.parse(JSON.stringify(q.grid_key_json)) : null);
  };

  const handleUploadQuestionImage = (q: ALQuestion) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !createdExam) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;
        try {
          await api.updateALQuestion(createdExam.id, q.id, {
            diagram_url: dataUrl,
            requires_image: true,
          });
          addToast(`Diagram uploaded for Question #${q.question_number}`, "success");
          await refreshCreatedExam(createdExam.id);
        } catch (err: any) {
          addToast(err?.message || "Failed to upload diagram", "error");
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleSaveQuestionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !createdExam) return;
    setUpdatingQuestion(true);
    try {
      await api.updateALQuestion(createdExam.id, editingQuestion.id, {
        stem_text: editStem,
        diagram_url: editDiagramUrl || undefined,
        requires_image: editRequiresImage,
        image_description: editImageDescription || undefined,
        explanation: editExplanation || undefined,
        points: safeParseFloat(editPoints, 1.0),
        difficulty: editDifficulty,
        cognitive_level: editCognitiveLevel,
        correct_option: editCorrectOption,
        options: editOptions,
        statements_json: editStatements.length > 0 ? editStatements : undefined,
        grid_key_json: editGridKey || undefined,
      });
      addToast("Question updated successfully!", "success");
      setEditingQuestion(null);
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to update question.", "error");
    } finally {
      setUpdatingQuestion(false);
    }
  };

  const handleMoveQuestion = async (qId: number, direction: "up" | "down") => {
    if (!createdExam || !createdExam.questions) return;
    const questionsList = [...createdExam.questions].sort((a, b) => a.question_number - b.question_number);
    const index = questionsList.findIndex(q => q.id === qId);
    if (index < 0) return;

    if (direction === "up" && index > 0) {
      const temp = questionsList[index];
      questionsList[index] = questionsList[index - 1];
      questionsList[index - 1] = temp;
    } else if (direction === "down" && index < questionsList.length - 1) {
      const temp = questionsList[index];
      questionsList[index] = questionsList[index + 1];
      questionsList[index + 1] = temp;
    } else {
      return;
    }

    const reorderedIds = questionsList.map(q => q.id);
    try {
      await api.reorderALExamQuestions(createdExam.id, reorderedIds);
      await refreshCreatedExam(createdExam.id);
      addToast("Question order updated.", "info");
    } catch (e) {
      console.error(e);
      addToast("Failed to reorder questions.", "error");
    }
  };

  const handleRemoveQuestionFromPaper = async (qId: number) => {
    if (!createdExam) return;
    try {
      await api.deleteALQuestion(createdExam.id, qId);
      addToast("Question removed from paper canvas.", "warning");
      await refreshCreatedExam(createdExam.id);
    } catch (e) {
      console.error(e);
      addToast("Failed to remove question.", "error");
    }
  };

  const handleConfirmPublishExam = async () => {
    if (!createdExam) return;
    setPublishing(true);
    try {
      const published = await api.publishALExam(createdExam.id);
      setCreatedExam(published);
      setPublishConfirmModalOpen(false);
      addToast(`Exam "${published.title}" published! Immutable snapshots created for historical integrity.`, "success");
    } catch (e: any) {
      console.error(e);
      addToast(e?.message || "Failed to publish exam.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleExecutePaperRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdExam) return;
    setRevisingPaper(true);
    try {
      const res = await api.reviseALExam(createdExam.id, {
        revision_type: revisionType,
        question_number: revisionType === "single_question" ? safeParseInt(revisionQuestionNum, 1) : undefined,
        reason: revisionReason,
        notify_students: revisionNotifyStudents,
      });
      addToast(
        `Paper revision recorded. ${res.students_notified > 0 ? `${res.students_notified} student(s) notified of Question correction.` : "Audit log updated."}`,
        "success"
      );
      setRevisionModalOpen(false);
      await refreshCreatedExam(createdExam.id);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to execute paper revision.", "error");
    } finally {
      setRevisingPaper(false);
    }
  };

  const paperStats = useMemo(() => {
    if (!createdExam || !createdExam.questions) {
      return { total: 0, mcq: 0, structured: 0, essay: 0, rawPoints: 0 };
    }
    let mcq = 0;
    let structured = 0;
    let essay = 0;
    let rawPoints = 0;

    for (const q of createdExam.questions) {
      rawPoints += safeParseFloat(q.points, 0);
      const t = (q.template_type || "").toLowerCase();
      if (t === "structured_subparts") structured++;
      else if (t === "essay_rubric") essay++;
      else mcq++;
    }

    return { total: createdExam.questions.length, mcq, structured, essay, rawPoints };
  }, [createdExam]);

  // Dynamic Live MCQ Paper Composition Statistics & Advisory Messages
  const mcqCompositionStats = useMemo(() => {
    const counts: Record<string, number> = {
      generic_mcq: 0,
      multi_response_grid: 0,
      five_statement_truth: 0,
      matching_column: 0,
      combination_grid: 0,
      sequential_diagnostic: 0,
      incomplete_stem: 0,
    };

    let totalMcq = 0;
    if (createdExam && createdExam.questions) {
      for (const q of createdExam.questions) {
        const t = (q.template_type || "generic_mcq").toLowerCase();
        if (t in counts) {
          counts[t]++;
          totalMcq++;
        } else if (t !== "structured_subparts" && t !== "essay_rubric") {
          counts["generic_mcq"]++;
          totalMcq++;
        }
      }
    }

    const targetTotal = safeParseInt(createdExam?.total_questions, 50);
    const percentages: Record<string, number> = {};
    for (const key of Object.keys(counts)) {
      percentages[key] = totalMcq > 0 ? Math.round((counts[key] / totalMcq) * 100) : 0;
    }

    let advisoryMessage: string | null = null;
    if (totalMcq >= 5) {
      const genericPct = percentages.generic_mcq || 0;
      if (genericPct > 40) {
        advisoryMessage = `Direct Recall is currently at ${genericPct}% (A/L reference target: 26%). Consider adding Multi-Response, Matrix, or Combination questions to increase paper rigor.`;
      } else if (counts.multi_response_grid === 0 && totalMcq >= 20) {
        advisoryMessage = `A/L Paper I places 1-to-5 Multi-Response Grid questions in Q41–Q50. Consider adding Multi-Response questions.`;
      } else if (counts.matching_column === 0 && totalMcq >= 15) {
        advisoryMessage = `Matrix Matching / Profile Grid is at 0% (A/L reference: 14%). Adding matching grids improves diagnostic coverage.`;
      }
    }

    return { total: totalMcq, targetTotal, counts, percentages, advisoryMessage };
  }, [createdExam]);

  // Section Isolation & Context Engine
  const effectiveExamType: string = useMemo(() => {
    const raw = createdExam?.exam_type || paperType || presetMode || "full_paper";
    return String(raw).toLowerCase();
  }, [createdExam?.exam_type, paperType, presetMode]);

  const allowedSections: ("paper_1" | "part_a" | "part_b")[] = useMemo(() => {
    if (effectiveExamType === "paper_1_mcq" || effectiveExamType === "paper_1_only" || effectiveExamType === "mcq") {
      return ["paper_1"];
    }
    if (effectiveExamType === "paper_2_structured" || effectiveExamType === "structured") {
      return ["part_a"];
    }
    if (effectiveExamType === "paper_2_essay" || effectiveExamType === "essay") {
      return ["part_b"];
    }
    if (effectiveExamType === "paper_2" || effectiveExamType === "paper_2_only") {
      return ["part_a", "part_b"];
    }
    return ["paper_1", "part_a", "part_b"];
  }, [effectiveExamType]);

  // Keep activeSectionTab constrained to allowed sections
  useEffect(() => {
    if (allowedSections.length > 0 && !allowedSections.includes(activeSectionTab as any)) {
      setActiveSectionTab(allowedSections[0]);
    }
  }, [allowedSections, activeSectionTab]);

  // Attached Paper Questions filtered strictly by activeSectionTab
  const sectionQuestions = useMemo(() => {
    if (!createdExam || !createdExam.questions) return [];
    return createdExam.questions
      .slice()
      .filter((q) => {
        const templateType = (q.template_type || "generic_mcq").toLowerCase();
        const isStructured = templateType === "structured_subparts" || Boolean(q.structured_subparts_json && q.structured_subparts_json.length > 0);
        const isEssay = templateType === "essay_rubric" || Boolean(q.essay_checklist_json && q.essay_checklist_json.length > 0);
        const isMcq = !isStructured && !isEssay;

        if (activeSectionTab === "paper_1") return isMcq;
        if (activeSectionTab === "part_a") return isStructured;
        if (activeSectionTab === "part_b") return isEssay;
        return true;
      })
      .sort((a, b) => a.question_number - b.question_number);
  }, [createdExam, activeSectionTab]);

  const filteredBankQuestions = useMemo(() => {
    return bankQuestions.filter(q => {
      const qType = (q.question_type || "").toLowerCase();
      if (bankTargetSection === "paper_1") {
        if (qType.includes("structured") || qType.includes("essay")) return false;
      } else if (bankTargetSection === "part_a") {
        if (!qType.includes("structured")) return false;
      } else if (bankTargetSection === "part_b") {
        if (!qType.includes("essay")) return false;
      }

      if (searchBankQuery.trim()) {
        const query = searchBankQuery.toLowerCase().trim();
        const textMatch = (q.question_text || "").toLowerCase().includes(query);
        const tagMatch = (q.tags || []).some(t => t.toLowerCase().includes(query));
        if (!textMatch && !tagMatch) return false;
      }

      if (difficultyBankFilter !== "all" && (q.difficulty || "").toLowerCase() !== difficultyBankFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [bankQuestions, searchBankQuery, bankTargetSection, difficultyBankFilter]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "4rem" }}>
      {!createdExam ? (
        <div className="card" style={{ padding: "2.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="file-text" size={24} /> CREATE NEW ASSESSMENT
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.2rem 0 0 0" }}>
                Define basic paper identity and assessment container details before entering Assembly Studio.
              </p>
            </div>
          </div>

          {/* 6 Assessment Presets Grid */}
          <div style={{ marginBottom: "1.75rem" }}>
            <label style={{ fontSize: "0.86rem", fontWeight: 700, display: "block", marginBottom: "0.6rem", color: "var(--text-primary)" }}>
              Select Assessment Type:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
              {[
                { id: "full_paper", title: "Full A/L Paper", desc: "Combined 3-Part Exam (P1 + P2-A + P2-B)", icon: "award" },
                { id: "paper_1_only", title: "Paper I — MCQ", desc: "50-Item MCQ Speed Test (2 Hours)", icon: "clipboard" },
                { id: "paper_2_only", title: "Paper II — Full", desc: "Part A Structured + Part B Essay", icon: "layers" },
                { id: "paper_2_structured", title: "Paper II — Part A Structured", desc: "Structured Sheet with line limits", icon: "file-text" },
                { id: "paper_2_essay", title: "Paper II — Part B Essay", desc: "Essay Prompts with Rubrics", icon: "folder" },
                { id: "custom", title: "Custom Assessment", desc: "Teacher-controlled flexible assessment", icon: "grid" },
              ].map((m) => {
                const isSelected = presetMode === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleApplyPreset(m.id as any)}
                    style={{
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: isSelected ? "var(--accent-primary)" : "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                      <SvgIcon name={m.icon as any} size={18} /> {m.title}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                      {m.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleCreateExam} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Exam Title *</label>
                <input
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Target Course *</label>
                <select
                  className="select"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value ? safeParseInt(e.target.value, 0) : "")}
                  required
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Description &amp; Instructions</label>
              <textarea
                rows={2}
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>



            <div style={{ marginTop: "1rem", textAlign: "right" }}>
              <button type="submit" className="btn btn-primary" style={{ padding: "0.75rem 2.25rem", fontSize: "0.95rem" }}>
                Enter Assessment Assembly Studio
              </button>
            </div>
          </form>
        </div>
      ) : loadingExam ? (
        <div className="card" style={{ padding: "3.5rem 1.5rem", textAlign: "center", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SvgIcon name="refresh" size={32} style={{ color: "var(--accent-primary)", marginBottom: "0.75rem" }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.4rem 0" }}>Loading Assessment Assembly Studio...</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>Fetching assessment configuration and question canvas...</p>
        </div>
      ) : createdExam ? (
        /* ─── ASSESSMENT ASSEMBLY STUDIO WORKSPACE ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* COMPACT TOP BANNER: ASSESSMENT OVERVIEW */}
          <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.3rem" }}>
                  <h1 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    ASSESSMENT ASSEMBLY STUDIO
                  </h1>
                  <span className="badge badge-primary">Paper #{createdExam.id}</span>
                  <span className={`badge ${createdExam.is_published ? "badge-success" : "badge-warning"}`}>
                    {createdExam.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  {createdExam.title}
                </div>
              </div>

              {/* Compact Summary Pills */}
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className="badge badge-secondary" style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}>
                  {paperStats.total} Questions
                </span>
                <span className="badge badge-info" style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}>
                  {paperStats.rawPoints} Marks
                </span>
                <span className="badge badge-secondary" style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}>
                  {createdExam.time_limit_minutes} Mins
                </span>
              </div>

              {/* Compact Action Buttons Bar */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" style={{ fontSize: "0.825rem" }} onClick={() => setPreviewModalOpen(true)}>
                  <SvgIcon name="eye" size={14} /> Paper Preview
                </button>

                {!createdExam.is_published ? (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: "0.85rem", fontWeight: 700, padding: "0.4rem 1.1rem" }}
                    onClick={() => setPublishConfirmModalOpen(true)}
                    disabled={publishing || paperStats.total === 0}
                  >
                    <SvgIcon name="check" size={16} /> {publishing ? "Publishing..." : "Publish Paper"}
                  </button>
                ) : (
                  <button
                    className="btn btn-warning"
                    style={{ fontSize: "0.825rem" }}
                    onClick={() => setRevisionModalOpen(true)}
                  >
                    <SvgIcon name="edit" size={14} /> Revise Paper
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PUBLISHED PAPER REVISION SAFEGUARD BANNER */}
          {createdExam.is_published && (
            <div className="card" style={{ padding: "0.85rem 1.25rem", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="alert-triangle" size={16} />
                <span><strong>Published Paper Safeguard Active:</strong> Historical student submissions remain immutable snapshots. Click &quot;Revise Paper&quot; to issue a question correction.</span>
              </div>
              <button className="btn btn-warning" style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }} onClick={() => setRevisionModalOpen(true)}>
                Revise Paper
              </button>
            </div>
          )}

          {/* ASSESSMENT ASSEMBLY STUDIO — ASSESSMENT POLICY CONFIGURATION PANEL */}
          <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isEditingPolicy ? "1.25rem" : "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="settings" size={18} style={{ color: "var(--accent-primary)" }} />
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Assessment Operation Policy &amp; Lifecycle
                </h3>
              </div>

              {!isEditingPolicy ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
                  onClick={handleStartEditPolicy}
                >
                  <SvgIcon name="edit" size={14} /> Edit Policy
                </button>
              ) : null}
            </div>

            {!isEditingPolicy ? (
              /* ─── UNIFIED READ-ONLY DATA VIEW SUMMARY ─── */
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Full-Width Title & Description Summary */}
                <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                      Assessment Name
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {createdExam.title}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                      Description
                    </div>
                    <div style={{ fontSize: "0.85rem", color: createdExam.description ? "var(--text-secondary)" : "var(--text-muted)", fontStyle: createdExam.description ? "normal" : "italic", lineHeight: 1.4 }}>
                      {createdExam.description || "No description provided"}
                    </div>
                  </div>
                </div>

                {/* 4-Grid Operating Parameters Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.85rem" }}>
                  <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      Available From
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {formatPolicyDateTime(createdExam.available_from)}
                    </div>
                  </div>

                  <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      Due Date
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {formatPolicyDateTime(createdExam.available_until)}
                    </div>
                  </div>

                  <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      Time Limit
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {createdExam.time_limit_minutes} minutes
                    </div>
                  </div>

                  <div style={{ padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      Maximum Attempts
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {createdExam.max_attempts || 1} {createdExam.max_attempts === 1 ? "Attempt" : "Attempts"}
                    </div>
                  </div>
                </div>

                {/* Additional Behavioral Policy Summary Badges */}
                <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "0.82rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600, marginRight: "0.4rem" }}>Show Results Immediately:</span>
                    <span className={`badge ${createdExam.show_result_immediately !== false ? "badge-success" : "badge-secondary"}`}>
                      {createdExam.show_result_immediately !== false ? "Yes" : "No"}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600, marginRight: "0.4rem" }}>Shuffle Questions:</span>
                    <span className={`badge ${shuffleQuestions ? "badge-info" : "badge-secondary"}`}>
                      {shuffleQuestions ? "Yes" : "No"}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 600, marginRight: "0.4rem" }}>Shuffle Option Choices:</span>
                    <span className={`badge ${shuffleOptions ? "badge-info" : "badge-secondary"}`}>
                      {shuffleOptions ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* ─── UNIFIED INTERACTIVE EDIT MODE FORM ─── */
              <form onSubmit={handleSavePolicy} style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.1rem", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "2px solid var(--accent-primary)" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-primary)", marginBottom: "0.25rem" }}>
                  Edit Assessment Policy Parameters
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Assessment Name *</label>
                    <input
                      type="text"
                      className="input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                      placeholder="Enter assessment name..."
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Description</label>
                    <input
                      type="text"
                      className="input"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Brief assessment description for students..."
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Time Limit (Minutes) *</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={editTimeLimit}
                      onChange={(e) => setEditTimeLimit(safeParseInt(e.target.value, 120))}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Maximum Attempts *</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={editMaxAttempts}
                      onChange={(e) => setEditMaxAttempts(safeParseInt(e.target.value, 1))}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Available From</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={editAvailableFrom}
                      onChange={(e) => setEditAvailableFrom(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Due Date / Time</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={editAvailableUntil}
                      onChange={(e) => setEditAvailableUntil(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap", paddingTop: "0.75rem", borderTop: "1px dashed var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editShowResultImmediately}
                      onChange={(e) => setEditShowResultImmediately(e.target.checked)}
                    />
                    Show Results Immediately
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editShuffleQuestions}
                      onChange={(e) => setEditShuffleQuestions(e.target.checked)}
                    />
                    Shuffle Question Sequence
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editShuffleOptions}
                      onChange={(e) => setEditShuffleOptions(e.target.checked)}
                    />
                    Shuffle Option Choices
                  </label>

                  <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.82rem", padding: "0.35rem 0.9rem" }}
                      onClick={handleCancelEditPolicy}
                      disabled={savingPolicy}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ fontSize: "0.82rem", padding: "0.35rem 0.95rem" }}
                      disabled={savingPolicy}
                    >
                      <SvgIcon name="save" size={14} /> {savingPolicy ? "Saving Policy..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* MAIN WORKING CANVAS: QUESTION BUILDER AREA */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Header & Source Action Buttons Bar */}
            <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {allowedSections.length === 1 ? (
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {allowedSections[0] === "paper_1" && <><SvgIcon name="clipboard" size={18} /> Paper I &mdash; MCQ Assessment Workspace ({paperStats.mcq} MCQs)</>}
                      {allowedSections[0] === "part_a" && <><SvgIcon name="file-text" size={18} /> Paper II Part A &mdash; Structured Questions Workspace ({paperStats.structured} Questions)</>}
                      {allowedSections[0] === "part_b" && <><SvgIcon name="folder" size={18} /> Paper II Part B &mdash; Essay Questions Workspace ({paperStats.essay} Essays)</>}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {allowedSections.includes("paper_1") && (
                        <button
                          type="button"
                          onClick={() => setActiveSectionTab("paper_1")}
                          className={`btn ${activeSectionTab === "paper_1" ? "btn-primary" : "btn-secondary"}`}
                          style={{ fontSize: "0.85rem" }}
                        >
                          Paper I (MCQs) ({paperStats.mcq})
                        </button>
                      )}
                      {allowedSections.includes("part_a") && (
                        <button
                          type="button"
                          onClick={() => setActiveSectionTab("part_a")}
                          className={`btn ${activeSectionTab === "part_a" ? "btn-primary" : "btn-secondary"}`}
                          style={{ fontSize: "0.85rem" }}
                        >
                          Paper II-A (Structured) ({paperStats.structured})
                        </button>
                      )}
                      {allowedSections.includes("part_b") && (
                        <button
                          type="button"
                          onClick={() => setActiveSectionTab("part_b")}
                          className={`btn ${activeSectionTab === "part_b" ? "btn-primary" : "btn-secondary"}`}
                          style={{ fontSize: "0.85rem" }}
                        >
                          Paper II-B (Essay) ({paperStats.essay})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Contextual Action Bar: Question Bank & AI Generators */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenBankModal(activeSectionTab as any)}
                  >
                    <SvgIcon name="file-text" size={16} /> From Question Bank
                  </button>

                  {activeSectionTab === "paper_1" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", border: "none" }}
                      onClick={() => handleOpenAiModal("paper_1")}
                    >
                      <SvgIcon name="sparkle" size={16} /> Generate MCQs with AI
                    </button>
                  )}

                  {activeSectionTab === "part_a" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", border: "none" }}
                      onClick={() => setStructuredAiModalOpen(true)}
                    >
                      <SvgIcon name="sparkle" size={16} /> Generate Structured with AI
                    </button>
                  )}

                  {activeSectionTab === "part_b" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", border: "none" }}
                      onClick={() => setEssayAiModalOpen(true)}
                    >
                      <SvgIcon name="sparkle" size={16} /> Generate Essays with AI
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* LIVE MCQ PAPER COMPOSITION PANEL */}
            {activeSectionTab === "paper_1" && (
              <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <SvgIcon name="chart" size={18} style={{ color: "var(--accent-primary)" }} />
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>CURRENT PAPER COMPOSITION</h3>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: "0.825rem", padding: "0.3rem 0.65rem" }}>
                    Questions: {mcqCompositionStats.total} / {mcqCompositionStats.targetTotal}
                  </span>
                </div>

                {/* Composition Table comparing Current % vs A/L Reference % */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                        <th style={{ padding: "0.4rem 0.6rem" }}>Question Format</th>
                        <th style={{ padding: "0.4rem 0.6rem" }}>Current Qs</th>
                        <th style={{ padding: "0.4rem 0.6rem" }}>Current %</th>
                        <th style={{ padding: "0.4rem 0.6rem" }}>A/L Ref %</th>
                        <th style={{ padding: "0.4rem 0.6rem" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MCQ_TEMPLATES.map(t => {
                        const count = mcqCompositionStats.counts[t.id] || 0;
                        const pct = mcqCompositionStats.percentages[t.id] || 0;
                        const isBalanced = Math.abs(pct - t.refPct) <= 5;
                        return (
                          <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600, color: "var(--text-primary)" }}>{t.title}</td>
                            <td style={{ padding: "0.45rem 0.6rem" }}>{count}</td>
                            <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700 }}>{pct}%</td>
                            <td style={{ padding: "0.45rem 0.6rem", color: "var(--text-muted)" }}>{t.refPct}%</td>
                            <td style={{ padding: "0.45rem 0.6rem" }}>
                              <span className={`badge ${isBalanced ? "badge-success" : pct > t.refPct ? "badge-warning" : "badge-secondary"}`}>
                                {isBalanced ? "Balanced" : pct > t.refPct ? "Above Ref" : "Under Ref"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Advisory Recommendation (Non-blocking) */}
                {mcqCompositionStats.advisoryMessage && (
                  <div style={{ marginTop: "0.85rem", padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.08)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <SvgIcon name="info" size={16} style={{ color: "var(--accent-primary)" }} />
                    <span><strong>Recommendation:</strong> {mcqCompositionStats.advisoryMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Questions Canvas List (Context-Filtered) */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
                  {activeSectionTab === "paper_1" && `Paper I (MCQ) Questions (${sectionQuestions.length})`}
                  {activeSectionTab === "part_a" && `Paper II Part A (Structured) Questions (${sectionQuestions.length})`}
                  {activeSectionTab === "part_b" && `Paper II Part B (Essay) Questions (${sectionQuestions.length})`}
                </h3>
              </div>

              {sectionQuestions.length === 0 ? (
                <div className="empty-state" style={{ padding: "2.5rem" }}>
                  <SvgIcon name="file-text" size={40} />
                  <h4 style={{ margin: "0.5rem 0 0.25rem 0" }}>
                    {activeSectionTab === "paper_1" && "No MCQ questions attached to Paper I yet"}
                    {activeSectionTab === "part_a" && "No Structured questions attached to Part A yet"}
                    {activeSectionTab === "part_b" && "No Essay questions attached to Part B yet"}
                  </h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    {activeSectionTab === "paper_1" && 'Click "From Question Bank", "Add MCQ", or "Generate MCQs with AI" to add questions.'}
                    {activeSectionTab === "part_a" && 'Click "From Question Bank", "Add Structured Question", or "Generate Structured with AI" to add questions.'}
                    {activeSectionTab === "part_b" && 'Click "From Question Bank", "Add Essay Question", or "Generate Essay Questions with AI" to add questions.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                  {sectionQuestions.map((q, idx) => {
                      const templateType = (q.template_type || "generic_mcq").toLowerCase();
                      const isMultiResponse = templateType === "multi_response_grid";
                      const isFiveStatement = templateType === "five_statement_truth";
                      const isMatrix = templateType === "matching_column";
                      const isCombination = templateType === "combination_grid";
                      const isSequential = templateType === "sequential_diagnostic";
                      const isIncomplete = templateType === "incomplete_stem";
                      const badgeInfo = getTemplateBadgeTitle(templateType);
                      const isStructured = templateType === "structured_subparts" || Boolean(q.structured_subparts_json && q.structured_subparts_json.length > 0);
                      const isEssay = templateType === "essay_rubric" || templateType === "essay" || Boolean(q.essay_checklist_json);

                      if (isStructured) {
                        return (
                          <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <StructuredQuestionPaperRenderer
                              questionNumber={q.question_number}
                              stemText={q.stem_text}
                              parts={q.structured_subparts_json || []}
                              diagramUrl={q.diagram_url}
                              points={q.points || 40}
                            />
                            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", alignItems: "center" }}>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                title="Edit question structure skeleton in popup"
                                onClick={() => {
                                  setEditingStructuredQuestionId(q.id);
                                  setEditingStructuredStem(q.stem_text);
                                  setEditingStructuredDiagramUrl(q.diagram_url || "");
                                  setEditingStructuredNodes(q.structured_subparts_json || []);
                                  setManualStructuredModalOpen(true);
                                }}
                              >
                                <SvgIcon name="grid" size={14} /> Edit Skeleton
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                title="Edit question content in Paper 2A authoring form below"
                                onClick={() => {
                                  setEditingStructuredQuestionId(q.id);
                                  setEditingStructuredStem(q.stem_text);
                                  setEditingStructuredDiagramUrl(q.diagram_url || "");
                                  setEditingStructuredNodes(q.structured_subparts_json || []);
                                  setActiveSectionTab("part_a");
                                  setTimeout(() => {
                                    const el = document.getElementById("structured-authoring-section");
                                    if (el) {
                                      el.scrollIntoView({ behavior: "smooth" });
                                    }
                                  }, 100);
                                }}
                              >
                                <SvgIcon name="edit" size={14} /> Edit Content
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                title="Duplicate complete structured question"
                                onClick={() => handleDuplicateStructuredQuestion(q)}
                              >
                                <SvgIcon name="copy" size={14} /> Duplicate
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => handleUploadQuestionImage(q)}
                              >
                                <SvgIcon name="image" size={14} /> {q.diagram_url ? "Change Image" : "Upload Image"}
                              </button>

                              <button
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "up")}
                                disabled={idx === 0}
                                title="Move Up"
                              >
                                <SvgIcon name="chevron-up" size={14} />
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "down")}
                                disabled={idx === (createdExam.questions?.length || 1) - 1}
                                title="Move Down"
                              >
                                <SvgIcon name="chevron-down" size={14} />
                              </button>

                              <button
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleRemoveQuestionFromPaper(q.id)}
                                title="Remove from paper"
                              >
                                <SvgIcon name="trash" size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (isEssay) {
                        const normalized = normalizeLegacyEssayData(q.essay_checklist_json, q.stem_text, q.points);
                        const structure_type = normalized.structure_format;
                        const subparts = normalized.subparts || [];
                        const instruction = normalized.instruction || "Write short notes on the following:";

                        return (
                          <div
                            key={q.id}
                            className="card"
                            style={{
                              padding: "1.25rem",
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-md)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.75rem",
                            }}
                          >
                            {/* Header: Question Number, Format Badge, Marks, Draft Status */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                                  Q{q.question_number}
                                </span>
                                <span className="badge badge-primary" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                                  {structure_type === "single_complete"
                                    ? "Single Complete Question"
                                    : structure_type === "short_notes"
                                    ? `Short Notes Style (${subparts.length} topics)`
                                    : `Multi-Part Descriptive Subparts (${subparts.length} subparts)`}
                                </span>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span className="badge badge-info" style={{ fontSize: "0.8rem", fontWeight: 800, fontFamily: "monospace" }}>
                                  {q.points || 0} Marks
                                </span>
                                <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                                  Status: Attached
                                </span>
                              </div>
                            </div>

                            {/* Prompt Snippet */}
                            <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                              {structure_type === "short_notes"
                                ? normalizeScientificSymbols(instruction)
                                : normalizeScientificSymbols(stripLeadingNumberingPrefix(q.stem_text || "Essay Question"))}
                            </div>

                            {/* Hierarchical Subparts Preview snippet if multi-part or short-notes */}
                            {(structure_type === "multi_part" || structure_type === "short_notes") && subparts.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", padding: "0.6rem 0.8rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                {subparts.map((sub, sIdx) => {
                                  const subMarks = calculateSubpartMarks(sub);
                                  const hasChildren = sub.children && sub.children.length > 0;
                                  return (
                                    <div key={sub.id || sIdx} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                      <div style={{ fontSize: "0.84rem", display: "flex", justifyContent: "space-between", color: "var(--text-primary)" }}>
                                        <span>
                                          <strong style={{ color: "var(--accent-primary)", marginRight: "0.35rem" }}>{sub.label}</strong>
                                          {normalizeScientificSymbols(stripLeadingNumberingPrefix(sub.prompt || "Sub-question"))}
                                        </span>
                                        {subMarks > 0 && (
                                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                            [{subMarks} marks]
                                          </span>
                                        )}
                                      </div>

                                      {/* Nested (a), (b) level 2 parts */}
                                      {hasChildren && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", paddingLeft: "1.2rem", borderLeft: "2px solid rgba(99, 102, 241, 0.2)" }}>
                                          {sub.children!.map((child, cIdx) => {
                                            const childMarks = calculateSubpartMarks(child);
                                            return (
                                              <div key={child.id || cIdx} style={{ fontSize: "0.8rem", display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                                                <span>
                                                  <strong style={{ color: "var(--accent-primary)", marginRight: "0.3rem" }}>{child.label}</strong>
                                                  {normalizeScientificSymbols(stripLeadingNumberingPrefix(child.prompt))}
                                                </span>
                                                {childMarks > 0 && (
                                                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                                    [{childMarks} marks]
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Contained Diagram Thumbnail if attached */}
                            {q.diagram_url && (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.4rem 0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                <img
                                  src={resolveDiagramImageUrl(q.diagram_url)}
                                  alt={`Diagram for Question ${q.question_number}`}
                                  style={{ maxHeight: "48px", maxWidth: "80px", objectFit: "contain", borderRadius: "3px", border: "1px solid var(--border)", background: "#fff" }}
                                />
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Figure {q.question_number}.1</span>
                                  {q.image_description && <span>: {normalizeScientificSymbols(q.image_description)}</span>}
                                </div>
                              </div>
                            )}

                            {/* Action Buttons Toolbar */}
                            <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", alignItems: "center", paddingTop: "0.4rem", borderTop: "1px dashed var(--border)" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => {
                                  setPreviewEssayQuestion(q);
                                  setPreviewEssayModalOpen(true);
                                }}
                                title="Open student paper preview"
                              >
                                <SvgIcon name="eye" size={14} /> Preview
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => handleEditEssayQuestion(q)}
                                title="Edit content in Paper II Part B authoring form below"
                              >
                                <SvgIcon name="edit" size={14} /> Edit
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => handleDuplicateEssayQuestion(q)}
                                title="Duplicate essay question"
                              >
                                <SvgIcon name="copy" size={14} /> Duplicate
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => handleUploadQuestionImage(q)}
                              >
                                <SvgIcon name="image" size={14} /> {q.diagram_url ? "Change Image" : "Upload Image"}
                              </button>

                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "up")}
                                disabled={idx === 0}
                                title="Move Up"
                              >
                                <SvgIcon name="chevron-up" size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "down")}
                                disabled={idx === sectionQuestions.length - 1}
                                title="Move Down"
                              >
                                <SvgIcon name="chevron-down" size={14} />
                              </button>

                              <button
                                type="button"
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleRemoveQuestionFromPaper(q.id)}
                                title="Remove from paper"
                              >
                                <SvgIcon name="trash" size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={q.id}
                          style={{
                            padding: "1.25rem",
                            borderRadius: "var(--radius-md)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.85rem"
                          }}
                        >
                          {/* Card Header Row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--accent-primary)", minWidth: "32px" }}>
                                Q{q.question_number}
                              </span>
                              <span className={`badge ${badgeInfo.color}`} style={{ fontWeight: 700 }}>
                                {badgeInfo.label}
                              </span>
                              <span className="badge badge-info">{q.points} Mark(s)</span>
                              <span className="badge badge-secondary">{q.difficulty || "medium"}</span>
                              <span className="badge badge-secondary">{q.cognitive_level || "understand"}</span>
                            </div>

                            {/* Question Action Controls */}
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                                onClick={() => handleOpenEditQuestion(q)}
                              >
                                <SvgIcon name="edit" size={14} /> Edit
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                onClick={() => handleUploadQuestionImage(q)}
                              >
                                <SvgIcon name="image" size={14} /> {q.diagram_url ? "Change Image" : "Upload Image"}
                              </button>

                              <button
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "up")}
                                disabled={idx === 0}
                                title="Move Up"
                              >
                                <SvgIcon name="chevron-up" size={14} />
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => handleMoveQuestion(q.id, "down")}
                                disabled={idx === (createdExam.questions?.length || 1) - 1}
                                title="Move Down"
                              >
                                <SvgIcon name="chevron-down" size={14} />
                              </button>

                              <button
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleRemoveQuestionFromPaper(q.id)}
                                title="Remove from paper"
                              >
                                <SvgIcon name="trash" size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Question Stem Text */}
                          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                            {normalizeScientificSymbols(q.stem_text)}
                          </div>

                          {/* Question Diagram / Visual Requirement */}
                          <QuestionDiagramImage
                            diagramUrl={q.diagram_url}
                            requiresImage={q.requires_image}
                            imageDescription={q.image_description}
                            questionNumber={q.question_number}
                            isEditing={false}
                            onUploadImage={() => handleUploadQuestionImage(q)}
                          />

                          {/* Template Format 2: Multi-Response Grid Statements & Key */}
                          {isMultiResponse && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                              {q.statements_json && Array.isArray(q.statements_json) && (
                                <div style={{ background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                                    Statements Evaluation
                                  </div>
                                  {q.statements_json.map((st: any, i: number) => (
                                    <div key={i} style={{ fontSize: "0.84rem", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                                      <span><strong>({st.code || String.fromCharCode(65 + i)})</strong> {st.text}</span>
                                      {st.is_true !== undefined && (
                                        <span className={`badge ${st.is_true ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "0.7rem" }}>
                                          {st.is_true ? "True" : "False"}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div style={{ background: "rgba(99, 102, 241, 0.05)", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                                <strong>Universal 1-to-5 Response Key Mapping:</strong> 1 &rarr; (A, B, D) &middot; 2 &rarr; (A, C, D) &middot; 3 &rarr; (A, B) &middot; 4 &rarr; (C, D) &middot; 5 &rarr; (Other)
                              </div>
                            </div>
                          )}

                          {/* Template Format 4: Matrix Matching Structured Table */}
                          {isMatrix && q.grid_key_json && (q.grid_key_json.colI || q.grid_key_json.col_i) && (
                            <div style={{ background: "var(--bg-card)", padding: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.5rem" }}>
                                MATRIX MATCHING PAIRS TABLE
                              </div>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", fontSize: "0.83rem", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                                      <th style={{ padding: "0.4rem 0.6rem" }}>Column I</th>
                                      <th style={{ padding: "0.4rem 0.6rem" }}>Column II</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(q.grid_key_json.colI || q.grid_key_json.col_i || []).map((item: string, i: number) => {
                                      const col2Arr = q.grid_key_json.colII || q.grid_key_json.col_ii || [];
                                      return (
                                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                          <td style={{ padding: "0.45rem 0.6rem", fontWeight: 600 }}>{item}</td>
                                          <td style={{ padding: "0.45rem 0.6rem" }}>{col2Arr[i] || ""}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Template Format 7: Incomplete Stem / Calculation Formula & Given Box */}
                          {isIncomplete && q.grid_key_json && (
                            <div style={{ background: "var(--bg-card)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: "0.83rem" }}>
                              {q.grid_key_json.formula && <div><strong>Formula / Principle:</strong> {q.grid_key_json.formula}</div>}
                              {q.grid_key_json.given_values && <div style={{ marginTop: "0.25rem" }}><strong>Given Values:</strong> {q.grid_key_json.given_values}</div>}
                            </div>
                          )}

                          {/* Standard 5-Options Grid (A-E) */}
                          {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", margin: "0.2rem 0" }}>
                              {q.options.map((opt: string, i: number) => {
                                const optKey = String.fromCharCode(65 + i);
                                const isCorrect = (q.correct_option || "").toUpperCase() === optKey || q.correct_option === String(i + 1);
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      fontSize: "0.84rem",
                                      padding: "0.4rem 0.65rem",
                                      borderRadius: "var(--radius-sm)",
                                      background: isCorrect ? "rgba(16, 185, 129, 0.12)" : "var(--bg-card)",
                                      border: isCorrect ? "1px solid var(--success)" : "1px solid var(--border)",
                                      color: isCorrect ? "var(--success)" : "var(--text-primary)",
                                      fontWeight: isCorrect ? 700 : 400
                                    }}
                                  >
                                    {opt} {isCorrect && "✓ (Correct Answer)"}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Explanation & Reasoning Model Answer */}
                          {q.explanation && (
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic", borderTop: "1px dashed var(--border)", paddingTop: "0.4rem" }}>
                              <strong>Scientific Model Answer / Reasoning:</strong> {q.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* DEDICATED MANUAL QUESTION BUILDER FOR 7 MCQ FORMATS */}
            {activeSectionTab === "paper_1" && (
              !isMcqAuthoringActive && !editingQuestion ? (
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
                  id="mcq-authoring-section"
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
                    <SvgIcon name="layers" size={28} />
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <h4 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                        Question Builder — Question {((createdExam?.questions?.length || 0) + 1)}
                      </h4>
                      <span className="badge badge-primary">Paper I — MCQ</span>
                    </div>
                    <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "520px", margin: "0 auto", lineHeight: 1.45 }}>
                      No question template loaded yet. Click below to choose from the 7 G.C.E. Advanced Level MCQ formats and begin authoring.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: "0.92rem", padding: "0.6rem 1.4rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
                    onClick={() => setFormatSelectorModalOpen(true)}
                  >
                    <SvgIcon name="plus" size={16} /> Add MCQ Question (Choose Format)
                  </button>
                </div>
              ) : (
                <div className="card" style={{ padding: "1.5rem" }} id="mcq-authoring-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                        Question Builder — Question {editingQuestion ? editingQuestion.question_number : ((createdExam?.questions?.length || 0) + 1)}
                      </h4>
                      <span className="badge badge-primary">Paper I — MCQ</span>
                      <span className="badge badge-secondary">{getTemplateBadgeTitle(activeMcqFormat).label}</span>
                      <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 700 }}>1 Point</span>
                    </div>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }} onClick={() => setFormatSelectorModalOpen(true)}>
                      <SvgIcon name="plus" size={14} /> Add MCQ / Change Format
                    </button>
                  </div>

                  <form onSubmit={handleAddMCQQuestion} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                  {/* Question Stem Input */}
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                      {activeMcqFormat === "multi_response_grid" ? "Question Premise *" : activeMcqFormat === "sequential_diagnostic" ? "Scenario / Diagnostic Premise *" : "Question *"}
                    </label>
                    <textarea
                      rows={2}
                      className="textarea"
                      value={stemText}
                      onChange={(e) => setStemText(e.target.value)}
                      required
                      placeholder={activeMcqFormat === "multi_response_grid" ? "Enter the question premise..." : "Enter the question stem..."}
                    />
                  </div>

                  {/* Optional Diagram URL */}
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Diagram URL (Optional Image)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="https://... or upload diagram image"
                      value={diagramUrl}
                      onChange={(e) => setDiagramUrl(e.target.value)}
                    />
                  </div>

                  {/* TEMPLATE 1: DIRECT FACTUAL RECALL / STANDARD MCQ */}
                  {activeMcqFormat === "generic_mcq" && (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>Options</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {options.map((opt, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          return (
                            <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontWeight: 700, minWidth: "20px" }}>{letter}</span>
                              <input
                                type="text"
                                className="input"
                                value={opt}
                                onChange={(e) => {
                                  const n = [...options];
                                  n[idx] = e.target.value;
                                  setOptions(n);
                                }}
                                placeholder={`Enter option ${letter}...`}
                                style={{ flex: 1 }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Answer *</label>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                          {["A", "B", "C", "D", "E"].map(letter => (
                            <label key={letter} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
                              <input
                                type="radio"
                                name="correct_opt_radio_manual"
                                checked={correctOption === letter}
                                onChange={() => setCorrectOption(letter)}
                              />
                              {letter}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TEMPLATE 2: 1-TO-5 MULTI-RESPONSE GRID */}
                  {activeMcqFormat === "multi_response_grid" && (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>Statements (A – E)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {multiResponseStatements.map((stmt, idx) => (
                          <div key={stmt.code} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span style={{ fontWeight: 700, minWidth: "20px" }}>{stmt.code}</span>
                            <input
                              type="text"
                              className="input"
                              value={stmt.text}
                              onChange={(e) => {
                                const n = [...multiResponseStatements];
                                n[idx].text = e.target.value;
                                setMultiResponseStatements(n);
                              }}
                              placeholder={`Enter statement ${stmt.code}...`}
                              style={{ flex: 1 }}
                            />
                            <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={stmt.isTrue}
                                onChange={(e) => {
                                  const n = [...multiResponseStatements];
                                  n[idx].isTrue = e.target.checked;
                                  setMultiResponseStatements(n);
                                }}
                              />
                              <span className={`badge ${stmt.isTrue ? "badge-success" : "badge-secondary"}`}>
                                {stmt.isTrue ? "True" : "False"}
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Combination *</label>
                        <div className="card" style={{ padding: "0.75rem 1rem", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.85rem" }}>
                          <div><strong>Universal 1-to-5 Response Key Mapping:</strong> 1 &rarr; (A, B, D) &middot; 2 &rarr; (A, C, D) &middot; 3 &rarr; (A, B) &middot; 4 &rarr; (C, D) &middot; 5 &rarr; (Other)</div>
                          <div style={{ marginTop: "0.4rem", color: "var(--accent-primary)", fontWeight: 700 }}>
                            System Resolved Answer Choice: Option {resolveMultiResponseOption({
                              A: multiResponseStatements[0]?.isTrue || false,
                              B: multiResponseStatements[1]?.isTrue || false,
                              C: multiResponseStatements[2]?.isTrue || false,
                              D: multiResponseStatements[3]?.isTrue || false,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TEMPLATE 3: FIVE-STATEMENT EVALUATION */}
                  {activeMcqFormat === "five_statement_truth" && (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>Statements (A – E)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {fiveStatements.map((stmt, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          return (
                            <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontWeight: 700, minWidth: "20px" }}>{letter}</span>
                              <input
                                type="text"
                                className="input"
                                value={stmt}
                                onChange={(e) => {
                                  const n = [...fiveStatements];
                                  n[idx] = e.target.value;
                                  setFiveStatements(n);
                                }}
                                placeholder={`Enter statement ${letter}...`}
                                style={{ flex: 1 }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Statement *</label>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                          {["A", "B", "C", "D", "E"].map(letter => (
                            <label key={letter} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
                              <input
                                type="radio"
                                name="five_correct_radio"
                                checked={correctOption === letter}
                                onChange={() => setCorrectOption(letter)}
                              />
                              {letter}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TEMPLATE 4: MATRIX MATCHING / TABLE QUESTIONS */}
                  {activeMcqFormat === "matching_column" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "0.75rem" }}>
                        <div>
                          <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Column 1 Header</label>
                          <input type="text" className="input" value={colIHeader} onChange={(e) => setColIHeader(e.target.value)} placeholder="Column 1 header (e.g. Structure)" />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Column 2 Header</label>
                          <input type="text" className="input" value={colIIHeader} onChange={(e) => setColIIHeader(e.target.value)} placeholder="Column 2 header (e.g. Function)" />
                        </div>
                      </div>

                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Matrix Rows Table</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {colI.map((item, idx) => (
                          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 40px", gap: "0.6rem", alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              value={item}
                              onChange={(e) => { const n = [...colI]; n[idx] = e.target.value; setColI(n); }}
                              placeholder="Enter item..."
                            />
                            <input
                              type="text"
                              className="input"
                              value={colII[idx] || ""}
                              onChange={(e) => { const n = [...colII]; n[idx] = e.target.value; setColII(n); }}
                              placeholder="Enter matching item..."
                            />
                            <button
                              type="button"
                              className="btn-icon btn-icon-danger"
                              onClick={() => {
                                setColI(prev => prev.filter((_, i) => i !== idx));
                                setColII(prev => prev.filter((_, i) => i !== idx));
                              }}
                              disabled={colI.length <= 1}
                              title="Delete Row"
                            >
                              <SvgIcon name="trash" size={14} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: "0.6rem", fontSize: "0.8rem" }}
                        onClick={() => {
                          setColI(prev => [...prev, ""]);
                          setColII(prev => [...prev, ""]);
                        }}
                      >
                        <SvgIcon name="plus" size={14} /> Add Row
                      </button>
                    </div>
                  )}

                  {/* TEMPLATE 5: MULTI-VARIABLE SELECTION */}
                  {activeMcqFormat === "combination_grid" && (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Statements (A – D)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                        {combStatements.map((stmt, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          return (
                            <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontWeight: 700, minWidth: "20px" }}>{letter}</span>
                              <input
                                type="text"
                                className="input"
                                value={stmt}
                                onChange={(e) => { const n = [...combStatements]; n[idx] = e.target.value; setCombStatements(n); }}
                                placeholder={`Enter statement ${letter}...`}
                                style={{ flex: 1 }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Answer Combinations (1 – 5)</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                        {combChoices.map((ch, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span style={{ fontWeight: 700, minWidth: "20px" }}>{idx + 1}.</span>
                            <input
                              type="text"
                              className="input"
                              value={ch}
                              onChange={(e) => { const n = [...combChoices]; n[idx] = e.target.value; setCombChoices(n); }}
                              placeholder={`Enter combination ${idx + 1} (e.g. A and B only)...`}
                              style={{ flex: 1 }}
                            />
                          </div>
                        ))}
                      </div>

                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Combination *</label>
                      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                        {["1", "2", "3", "4", "5"].map(num => (
                          <label key={num} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
                            <input
                              type="radio"
                              name="comb_correct_radio"
                              checked={correctOption === num}
                              onChange={() => setCorrectOption(num)}
                            />
                            Option {num}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TEMPLATE 6: SEQUENTIAL / DIAGNOSTIC */}
                  {activeMcqFormat === "sequential_diagnostic" && (
                    <div>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Sequence / Diagnostic Items</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {seqItems.map((item, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <span style={{ fontWeight: 700, minWidth: "20px" }}>Step {idx + 1}.</span>
                            <input
                              type="text"
                              className="input"
                              value={item}
                              onChange={(e) => { const n = [...seqItems]; n[idx] = e.target.value; setSeqItems(n); }}
                              placeholder={`Enter step ${idx + 1}...`}
                              style={{ flex: 1 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TEMPLATE 7: INCOMPLETE STEM / CALCULATION */}
                  {activeMcqFormat === "incomplete_stem" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div>
                          <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Formula / Equation Context</label>
                          <input type="text" className="input" value={calcFormula} onChange={(e) => setCalcFormula(e.target.value)} placeholder="Enter formula or calculation principle..." />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Given Numerical Values</label>
                          <input type="text" className="input" value={calcValues} onChange={(e) => setCalcValues(e.target.value)} placeholder="Enter given numerical values..." />
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Completion / Calculated Options (A – E)</label>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {options.map((opt, idx) => {
                            const letter = String.fromCharCode(65 + idx);
                            return (
                              <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                <span style={{ fontWeight: 700, minWidth: "20px" }}>{letter}</span>
                                <input
                                  type="text"
                                  className="input"
                                  value={opt}
                                  onChange={(e) => { const n = [...options]; n[idx] = e.target.value; setOptions(n); }}
                                  placeholder={`Enter calculated option ${letter}...`}
                                  style={{ flex: 1 }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: "1rem" }}>
                          <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Answer *</label>
                          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                            {["A", "B", "C", "D", "E"].map(letter => (
                              <label key={letter} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
                                <input
                                  type="radio"
                                  name="calc_correct_radio"
                                  checked={correctOption === letter}
                                  onChange={() => setCorrectOption(letter)}
                                />
                                {letter}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EXPLANATION (OPTIONAL) */}
                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Explanation (Optional)</label>
                    <textarea
                      rows={2}
                      className="textarea"
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Add an explanation if needed..."
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        title="Remove question template and return to blank state"
                        onClick={() => {
                          setIsMcqAuthoringActive(false);
                          setEditingQuestion(null);
                          resetMcqAuthoringState(activeMcqFormat);
                        }}
                      >
                        Clear Form
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        title="Clear all text fields and reset inputs for this template"
                        onClick={() => {
                          resetMcqAuthoringState(activeMcqFormat);
                          addToast("MCQ text fields reset.", "info");
                        }}
                      >
                        Reset
                      </button>
                    </div>

                    <button type="submit" disabled={savingQuestion} className="btn btn-primary" style={{ padding: "0.6rem 1.8rem", fontWeight: 700 }}>
                      {savingQuestion ? "Saving..." : editingQuestion ? "Update MCQ Question" : "Add MCQ Question to Paper"}
                    </button>
                  </div>
                </form>
              </div>
            ))}

            {activeSectionTab === "part_a" && (
              <div id="structured-authoring-section">
                <StructuredContentAuthoringForm
                  questionNumber={editingStructuredQuestionId ? (createdExam?.questions?.find(q => q.id === editingStructuredQuestionId)?.question_number || 1) : ((createdExam?.questions?.length || 0) + 1)}
                  stemText={editingStructuredStem}
                  onChangeStemText={setEditingStructuredStem}
                  diagramUrl={editingStructuredDiagramUrl}
                  onChangeDiagramUrl={setEditingStructuredDiagramUrl}
                  nodes={editingStructuredNodes}
                  onChangeNodes={setEditingStructuredNodes}
                  onOpenStructureBuilder={() => setManualStructuredModalOpen(true)}
                  onSaveQuestion={handleSaveStructuredQuestionToPaper}
                  onClearForm={handleResetStructuredForm}
                  onResetForm={handleResetStructuredForm}
                  isSubmitting={savingManualStructured}
                  isEditingExisting={Boolean(editingStructuredQuestionId)}
                />
              </div>
            )}

            {activeSectionTab === "part_b" && (
              !isEssayAuthoringActive && !editingEssayQuestionId ? (
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
                  id="essay-authoring-section"
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
                    <SvgIcon name="file-text" size={28} />
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <h4 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                        Question Builder — Question {nextEssayQNum}
                      </h4>
                      <span className="badge badge-primary">Paper II Part B — Essay</span>
                    </div>
                    <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "520px", margin: "0 auto", lineHeight: 1.45 }}>
                      No question structure loaded yet. Click below to choose an essay structure (Single Complete, Multi-Part, or Short Notes) and begin authoring.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: "0.92rem", padding: "0.6rem 1.4rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
                    onClick={() => setAddEssayModalOpen(true)}
                  >
                    <SvgIcon name="plus" size={16} /> Add Essay Question (Choose Structure)
                  </button>
                </div>
              ) : (
                <div id="essay-authoring-section">
                  <EssayContentAuthoringForm
                    questionNumber={editingEssayQuestionId ? (createdExam?.questions?.find(q => q.id === editingEssayQuestionId)?.question_number || nextEssayQNum) : nextEssayQNum}
                    structureFormat={essayAuthoringStructure}
                    onChangeStructureFormat={setEssayAuthoringStructure}
                    instruction={essayAuthoringInstruction}
                    onChangeInstruction={setEssayAuthoringInstruction}
                    stemText={essayAuthoringStem}
                    onChangeStemText={setEssayAuthoringStem}
                    answerPoints={essayAuthoringAnswerPoints}
                    onChangeAnswerPoints={setEssayAuthoringAnswerPoints}
                    markingScheme={essayAuthoringMarkingScheme}
                    onChangeMarkingScheme={setEssayAuthoringMarkingScheme}
                    subparts={essayAuthoringSubparts}
                    onChangeSubparts={setEssayAuthoringSubparts}
                    examinerNotes={essayAuthoringExaminerNotes}
                    onChangeExaminerNotes={setEssayAuthoringExaminerNotes}
                    requiresImage={essayAuthoringRequiresImage}
                    onChangeRequiresImage={setEssayAuthoringRequiresImage}
                    imageDescription={essayAuthoringImageDescription}
                    onChangeImageDescription={setEssayAuthoringImageDescription}
                    diagramUrl={essayAuthoringDiagramUrl}
                    onChangeDiagramUrl={setEssayAuthoringDiagramUrl}
                    onOpenStructureModal={() => setAddEssayModalOpen(true)}
                    onSaveQuestion={handleSaveEssayQuestionToPaper}
                    onClearForm={handleResetEssayForm}
                    isSubmitting={savingEssayAuthoring}
                    isEditingExisting={Boolean(editingEssayQuestionId)}
                  />
                </div>
              )
            )}
          </div>
        </div>
      ) : null}

      {/* SELECT MCQ FORMAT MODAL */}
      {formatSelectorModalOpen && (
        <Modal title="SELECT MCQ FORMAT (7 A/L PAPER I TEMPLATES)" onClose={() => setFormatSelectorModalOpen(false)} maxWidth="750px">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
            {MCQ_TEMPLATES.map(t => (
              <div
                key={t.id}
                onClick={() => {
                  handleSelectMcqFormatWithConfirmation(t.id as any);
                }}
                style={{
                  padding: "1rem",
                  borderRadius: "var(--radius-md)",
                  border: activeMcqFormat === t.id ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                  background: activeMcqFormat === t.id ? "rgba(99, 102, 241, 0.08)" : "var(--bg-secondary)",
                  cursor: "pointer"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                  <SvgIcon name={t.icon as any} size={16} /> {t.title}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.35 }}>{t.desc}</div>
                <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>A/L Target: {t.refPct}%</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* PRESET SWITCH CONFIRMATION DIALOG */}
      {presetConfirmModalOpen && (
        <ConfirmDialog
          title="Restore Official Paper I Distribution?"
          message="Switching to A-Level Biology Paper 1 will restore the official certified Paper I question distribution (26/20/16/14/12/8/4 %) and set question count to 50. Any custom adjustments will be replaced."
          confirmLabel="Use A/L Paper 1"
          cancelLabel="Cancel"
          danger={false}
          onConfirm={() => {
            setAiGenMode("al_preset");
            setAiQuestionCount(50);
            setAiTemplateDist({ ...AL_CERTIFIED_PAPER_1_DISTRIBUTION });
            setPresetConfirmModalOpen(false);
          }}
          onCancel={() => setPresetConfirmModalOpen(false)}
        />
      )}

      {/* ─── FULL FEATURED AI GENERATION CONFIGURATION WORKSPACE MODAL ─── */}
      {aiModalOpen && (
        <Modal title="Generate MCQs with AI — Configuration Workspace" onClose={() => setAiModalOpen(false)} maxWidth="920px">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "75vh", overflowY: "auto", paddingRight: "0.4rem" }}>
            
            {/* 1. GENERATION PRESET */}
            <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
              <label style={{ fontSize: "0.88rem", fontWeight: 700, display: "block", marginBottom: "0.6rem" }}>
                1. GENERATION PRESET
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                <button
                  type="button"
                  onClick={() => handleSelectAiPresetMode("al_preset")}
                  className={`btn ${aiGenMode === "al_preset" ? "btn-primary" : "btn-secondary"}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "0.85rem", height: "auto", textAlign: "left" }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="award" size={16} /> A-Level Biology Paper 1
                  </span>
                  <span style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: "0.2rem" }}>
                    Locked official A/L Paper I distribution (26/20/16/14/12/8/4 %) &middot; 50 MCQs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectAiPresetMode("custom")}
                  className={`btn ${aiGenMode === "custom" ? "btn-primary" : "btn-secondary"}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "0.85rem", height: "auto", textAlign: "left" }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="filter" size={16} /> Custom Assessment
                  </span>
                  <span style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: "0.2rem" }}>
                    Unlocked question count &amp; interactive 100% balancing distribution controls
                  </span>
                </button>
              </div>
            </div>

            {/* 2. TARGET QUESTION COUNT (SYNCHRONIZED RANGE SLIDER & NUMERIC INPUT) */}
            <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <label style={{ fontSize: "0.88rem", fontWeight: 700, margin: 0 }}>
                  2. TARGET QUESTION COUNT
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge badge-info" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                    Target Total: {safeParseInt(aiQuestionCount, 50)} Questions
                  </span>
                  <input
                    type="number"
                    className="input"
                    value={isNaN(aiQuestionCount) ? "" : aiQuestionCount}
                    onChange={(e) => setAiQuestionCount(safeParseInt(e.target.value, 5))}
                    min={5}
                    max={50}
                    style={{ width: "75px", padding: "0.25rem 0.5rem", fontSize: "0.88rem", fontWeight: 700, textAlign: "center" }}
                  />
                </div>
              </div>

              {/* Range Slider Control */}
              <div style={{ padding: "0.5rem 0" }}>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={isNaN(aiQuestionCount) ? 50 : Math.min(50, Math.max(5, aiQuestionCount))}
                  onChange={(e) => setAiQuestionCount(safeParseInt(e.target.value, 50))}
                  style={{ width: "100%", accentColor: "var(--accent-primary)", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.25rem", fontWeight: 600 }}>
                  <span>5 Qs</span>
                  <span>15 Qs</span>
                  <span>25 Qs</span>
                  <span>35 Qs</span>
                  <span>50 Qs</span>
                </div>
              </div>
            </div>

            {/* 3. QUESTION TYPE DISTRIBUTION WORKSPACE (SINGLE COHERENT CONTAINER) */}
            <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.88rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    3. QUESTION TYPE DISTRIBUTION WORKSPACE
                    {aiGenMode === "al_preset" ? (
                      <span className="badge badge-primary" style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <SvgIcon name="lock" size={11} /> Locked by examination preset
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>Interactive 100% Balancing</span>
                    )}
                  </label>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
                    {aiGenMode === "al_preset"
                      ? "Distribution is locked to Sri Lanka G.C.E. A/L Certified Reference standards."
                      : "Adjusting any format automatically rebalances remaining formats to maintain exactly 100%."}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div className={`badge ${aiDistTotalSum === 100 ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}>
                    TOTAL: {aiDistTotalSum}%
                  </div>
                </div>
              </div>

              {/* 100% Visual Segment Allocation Bar */}
              <div style={{ display: "flex", height: "14px", borderRadius: "6px", overflow: "hidden", marginBottom: "1rem", border: "1px solid var(--border)" }}>
                {MCQ_TEMPLATES.map((t, idx) => {
                  const pct = aiTemplateDist[t.id as keyof QuestionDistribution] || 0;
                  const colors = ["#6366f1", "#a855f7", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];
                  return (
                    <div
                      key={t.id}
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: colors[idx % colors.length],
                        transition: "width 0.2s ease"
                      }}
                      title={`${t.title}: ${pct}%`}
                    />
                  );
                })}
              </div>

              {/* Unified Format Rows with Volume Sliders */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {MCQ_TEMPLATES.map(t => {
                  const pctVal = aiTemplateDist[t.id as keyof QuestionDistribution] || 0;
                  const targetCount = calculatedTargetCounts[t.id as keyof QuestionDistribution] || 0;
                  return (
                    <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1.4fr 75px 65px", gap: "0.85rem", alignItems: "center", padding: "0.55rem 0.75rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--text-primary)" }}>{t.title}</div>
                        <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{FORMAT_DISPLAY_NAMES[t.id as keyof QuestionDistribution]?.desc || t.desc}</div>
                      </div>

                      {/* Volume Slider Control */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={pctVal}
                          onChange={(e) => handleDistributionChange(t.id as keyof QuestionDistribution, safeParseInt(e.target.value, 0))}
                          disabled={aiGenMode === "al_preset"}
                          style={{ width: "100%", accentColor: "var(--accent-primary)", cursor: aiGenMode === "al_preset" ? "not-allowed" : "pointer" }}
                        />
                      </div>

                      {/* Numeric Percentage Input */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                        <input
                          type="number"
                          className="input"
                          style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem", textAlign: "center", width: "50px" }}
                          value={pctVal}
                          onChange={(e) => handleDistributionChange(t.id as keyof QuestionDistribution, safeParseInt(e.target.value, 0))}
                          disabled={aiGenMode === "al_preset"}
                          min={0}
                          max={100}
                        />
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>%</span>
                      </div>

                      {/* Target Question Count */}
                      <div style={{ fontSize: "0.84rem", color: "var(--accent-primary)", textAlign: "right", fontWeight: 800 }}>
                        {targetCount} Qs
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. CONTENT SCOPE (CURRICULUM UNITS ONLY) */}
            <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
              <label style={{ fontSize: "0.88rem", fontWeight: 700, display: "block", marginBottom: "0.6rem" }}>
                4. CONTENT SCOPE (UNITS SELECTION)
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Target Course</label>
                  <select
                    className="select"
                    value={selectedCourseId}
                    onChange={(e) => {
                      const cid = safeParseInt(e.target.value, 0);
                      setSelectedCourseId(cid);
                      if (cid > 0) {
                        api.listUnits(cid).then(uData => {
                          const fetchedUnits = uData || [];
                          setUnits(fetchedUnits);
                          setAiSelectedUnitIds(fetchedUnits.map(u => u.id));
                        }).catch(console.error);
                      }
                    }}
                  >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>

                {/* Units Multi-Select Checkboxes */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                      Unit Scope ({aiSelectedUnitIds.length} of {units.length} units selected)
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => {
                        if (aiSelectedUnitIds.length === units.length) {
                          setAiSelectedUnitIds([]);
                        } else {
                          setAiSelectedUnitIds(units.map(u => u.id));
                        }
                      }}
                    >
                      {aiSelectedUnitIds.length === units.length ? "Clear All" : "Select All Units"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", maxHeight: "140px", overflowY: "auto", border: "1px solid var(--border)", padding: "0.6rem", borderRadius: "var(--radius-sm)", background: "var(--bg-card)" }}>
                    {units.map((u, idx) => {
                      const isChecked = aiSelectedUnitIds.includes(u.id);
                      return (
                        <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAiSelectedUnitIds(prev => [...prev, u.id]);
                              } else {
                                setAiSelectedUnitIds(prev => prev.filter(id => id !== u.id));
                              }
                            }}
                          />
                          <span>Unit {idx + 1}: {u.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5 & 6. DIFFICULTY & COGNITIVE LEVEL */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>5. DIFFICULTY PROFILE</label>
                <select className="select" value={aiDifficultyMode} onChange={(e) => setAiDifficultyMode(e.target.value as any)}>
                  <option value="al_recommended">A/L Recommended (15% Easy / 25% Mod / 40% Std / 15% Ch / 5% Adv)</option>
                  <option value="easy">Easy Only</option>
                  <option value="moderate">Moderate Only</option>
                  <option value="standard">Standard A/L Only</option>
                  <option value="challenging">Challenging Only</option>
                  <option value="advanced">Advanced Only</option>
                </select>
              </div>

              <div className="card" style={{ padding: "1.1rem", background: "var(--bg-secondary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0 }}>6. COGNITIVE LEVEL</label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}
                    onClick={() => setShowAdvancedCognitive(!showAdvancedCognitive)}
                  >
                    {showAdvancedCognitive ? "Hide Advanced" : "Advanced"}
                  </button>
                </div>
                <select className="select" value={aiCognitiveLevel} onChange={(e) => setAiCognitiveLevel(e.target.value)}>
                  <option value="recommended">A/L Recommended Distribution</option>
                  <option value="remember">Remember</option>
                  <option value="understand">Understand</option>
                  <option value="apply">Apply</option>
                  <option value="analyze">Analyze</option>
                  <option value="evaluate">Evaluate</option>
                </select>
              </div>
            </div>

            {/* GENERATION SUMMARY PREVIEW CARD (REDESIGNED SINGLE VISUAL HIERARCHY) */}
            <div className="card" style={{ padding: "1.1rem", background: "rgba(99, 102, 241, 0.06)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
              <h5 style={{ fontSize: "0.88rem", fontWeight: 700, margin: "0 0 0.6rem 0", color: "var(--accent-primary)" }}>
                GENERATION SUMMARY PREVIEW
              </h5>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", fontSize: "0.82rem", color: "var(--text-primary)", marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid rgba(99, 102, 241, 0.2)" }}>
                <div><strong>Preset:</strong> {aiGenMode === "al_preset" ? "A-Level Biology Paper 1" : "Custom Assessment"}</div>
                <div><strong>Questions:</strong> {safeParseInt(aiQuestionCount, 50)} MCQs</div>
                <div><strong>Scope:</strong> {aiSelectedUnitIds.length} Unit(s) &middot; A/L Recommended</div>
              </div>

              {/* Cohesive Target Format Breakdown List */}
              <div style={{ fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.2rem" }}>1. Target Generation Distribution</div>
                {MCQ_TEMPLATES.map(t => {
                  const pctVal = aiTemplateDist[t.id as keyof QuestionDistribution] || 0;
                  const targetCount = calculatedTargetCounts[t.id as keyof QuestionDistribution] || 0;
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                      <span style={{ fontWeight: 600 }}>{t.title}</span>
                      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>{pctVal}%</span>
                        <span style={{ fontWeight: 800, color: "var(--accent-primary)" }}>{targetCount} Qs</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Final Assembled Paper Sequence Summary */}
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed rgba(99, 102, 241, 0.2)", fontSize: "0.82rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.35rem" }}>2. Final Assembled Paper Sequence</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0.55rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Q1 – Q40: Interleaved Templates</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>Interleaved Types &bull; Easy &rarr; Hard Curve</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0.55rem", background: "rgba(99, 102, 241, 0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                    <span style={{ fontWeight: 700, color: "var(--accent-primary)" }}>Q41 – Q50: Multi-Response Grid (1-to-5)</span>
                    <span className="badge badge-primary" style={{ fontSize: "0.72rem" }}>Official A/L Standard</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Categorized AI Error Alert */}
            {aiClassifiedError && !generatingAI && (
              <AIGenerationErrorAlert
                error={aiClassifiedError}
                onRetry={handleGenerateAIQuestions}
                onDismiss={() => setAiClassifiedError(null)}
              />
            )}

            {/* LOADING OVERLAY / PROGRESS UI */}
            {generatingAI && (
              <AILoadingProgressBox
                questionType="mcq"
                requestedCount={safeParseInt(aiQuestionCount, 50)}
                loadingStage={aiLoadingStage || "Generating structured MCQs..."}
                subtext="Applying Hamilton integer allocation &amp; 1-to-5 universal combination key resolvers."
              />
            )}

            {/* ACTION BUTTONS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-secondary" onClick={() => setAiModalOpen(false)} disabled={generatingAI}>
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
                onClick={handleGenerateAIQuestions}
                disabled={generatingAI || aiDistTotalSum !== 100 || safeParseInt(aiQuestionCount, 0) <= 0}
              >
                {generatingAI ? (
                  <>
                    <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <SvgIcon name="sparkle" size={16} />
                    <span>Generate {safeParseInt(aiQuestionCount, 50)} MCQs</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </Modal>
      )}

      {/* ─── TWO-COLUMN AI CANDIDATE REVIEW WORKSHOP WORKSPACE ─── */}
      {candidateReviewModalOpen && (
        <Modal
          title={`AI Candidate Review Workshop — ${createdExam?.title || "Paper Assembly"}`}
          onClose={() => setCandidateReviewModalOpen(false)}
          maxWidth="1250px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "72vh" }}>
            
            {/* Top Header Summary & Action Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>AI Candidate Review</span>
                  <span className="badge badge-primary">{aiCandidates.length} Generated</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem", display: "flex", gap: "0.75rem" }}>
                  <span><strong>{readyCandidatesCount}</strong> Ready</span>
                  <span>&middot;</span>
                  <span><strong>{editedCandidatesCount}</strong> Edited</span>
                  <span>&middot;</span>
                  <span style={{ color: needsImageCandidatesCount > 0 ? "var(--warning)" : "inherit" }}><strong>{needsImageCandidatesCount}</strong> Need Image</span>
                  <span>&middot;</span>
                  <span><strong style={{ color: "var(--success)" }}>{acceptedCandidatesCount}</strong> Accepted</span>
                  <span>&middot;</span>
                  <span><strong style={{ color: "var(--danger)" }}>{rejectedCandidatesCount}</strong> Rejected</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                  onClick={() => {
                    if (selectedCandIndices.length === filteredCandidates.length) {
                      setSelectedCandIndices([]);
                    } else {
                      setSelectedCandIndices(filteredCandidates.map((_, i) => i));
                    }
                  }}
                >
                  {selectedCandIndices.length === filteredCandidates.length ? "Deselect All" : "Select All"}
                </button>

                <button
                  className="btn btn-success"
                  style={{ fontSize: "0.82rem", fontWeight: 700, padding: "0.35rem 1rem" }}
                  onClick={handleAcceptAllReadyCandidates}
                  disabled={acceptingBatch || readyCandidatesCount === 0}
                >
                  {acceptingBatch ? "Accepting..." : `Accept All Ready (${readyCandidatesCount})`}
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", color: "var(--danger)", padding: "0.35rem 0.75rem" }}
                  onClick={() => {
                    if (window.confirm("Reject all candidate questions in draft review?")) {
                      setAiCandidates([]);
                      setCandidateReviewModalOpen(false);
                    }
                  }}
                  disabled={acceptingBatch}
                >
                  Reject All
                </button>
              </div>
            </div>

            {/* Filter Tabs Bar */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm) var(--radius-sm) 0 0", padding: "0 0.5rem" }}>
              {[
                { id: "all", label: `All (${aiCandidates.length})` },
                { id: "ready", label: `Ready (${readyCandidatesCount})` },
                { id: "needs_image", label: `Needs Image (${needsImageCandidatesCount})` },
                { id: "edited", label: `Edited (${editedCandidatesCount})` },
                { id: "accepted", label: `Accepted (${acceptedCandidatesCount})` },
                { id: "rejected", label: `Rejected (${rejectedCandidatesCount})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setReviewFilterTab(tab.id as any)}
                  style={{
                    padding: "0.5rem 0.85rem",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    border: "none",
                    borderBottom: reviewFilterTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                    background: "transparent",
                    color: reviewFilterTab === tab.id ? "var(--accent-primary)" : "var(--text-muted)",
                    cursor: "pointer"
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Honest Partial Generation Status Alert */}
            {aiCandidates.length < safeParseInt(aiQuestionCount, 50) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.6rem 0.85rem",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  color: "var(--warning)",
                  margin: "0.5rem 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <SvgIcon name="alert-triangle" size={16} />
                  <span>
                    <strong>Partial Generation State:</strong> {aiCandidates.length} of {safeParseInt(aiQuestionCount, 50)} questions generated. All {aiCandidates.length} valid questions are preserved for review.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.3rem 0.75rem",
                    background: "var(--warning)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                  onClick={handleGenerateRemainingQuestions}
                  disabled={generatingAI}
                >
                  {generatingAI ? "Generating..." : `Generate Remaining ${safeParseInt(aiQuestionCount, 50) - aiCandidates.length}`}
                </button>
              </div>
            )}

            {/* Paper Quality & Authenticity Audit Summary Banner (Phase 8) */}
            {paperQualityAudit && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                  padding: "0.6rem 0.85rem",
                  background: "rgba(99, 102, 241, 0.06)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  margin: "0.4rem 0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <SvgIcon name="shield" size={15} />
                    <span style={{ fontWeight: 800, color: "var(--accent-primary)" }}>
                      Paper Quality &amp; Authenticity Score: {paperQualityAudit.overallScore}%
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    <span>Syllabus Chronology: <strong>{paperQualityAudit.syllabusScore}%</strong></span>
                    <span>&middot;</span>
                    <span>Answer Balance: <strong>{paperQualityAudit.answerScore}%</strong></span>
                    <span>&middot;</span>
                    <span>Type Diversity: <strong>{paperQualityAudit.typeScore}%</strong></span>
                  </div>
                </div>

                {paperQualityAudit.warnings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", marginTop: "0.2rem" }}>
                    {paperQualityAudit.warnings.map((w: string, i: number) => (
                      <div key={i} style={{ color: "var(--warning)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <SvgIcon name="alert-triangle" size={12} />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Two-Column Grid Workspace Area */}
            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1rem", flex: 1, minHeight: 0 }}>
              
              {/* LEFT COLUMN: CANDIDATE NAVIGATION SIDEBAR */}
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {filteredCandidates.map((cand, idx) => {
                    const originalIdx = aiCandidates.indexOf(cand);
                    const isSelected = originalIdx === selectedCandIdx;
                    const isImageRequired = cand.requires_image && !cand.diagram_url;
                    const isAccepted = cand.status === "accepted";
                    const isEdited = cand.status === "edited";
                    const isRejected = cand.status === "rejected";

                    return (
                      <div
                        key={originalIdx}
                        onClick={() => {
                          setSelectedCandIdx(originalIdx);
                          setIsEditingCandidate(false);
                        }}
                        style={{
                          padding: "0.6rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                          background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-card)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent-primary)" }}>
                            Candidate #{originalIdx + 1}
                          </span>
                          <span className={`badge ${isAccepted ? "badge-success" : isRejected ? "badge-secondary" : isEdited ? "badge-info" : isImageRequired ? "badge-warning" : "badge-success"}`} style={{ fontSize: "0.68rem" }}>
                            {isAccepted ? "Accepted" : isRejected ? "Rejected" : isEdited ? "Edited" : isImageRequired ? "Needs Image" : "Ready"}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {normalizeScientificSymbols(cand.stem_text)}
                        </div>

                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", gap: "0.4rem" }}>
                          <span>{getTemplateBadgeTitle(cand.template_type).label}</span>
                          <span>&middot;</span>
                          <span>{cand.difficulty || "medium"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: EXPANDED FULL QUESTION INSPECTION & INLINE EDITOR */}
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", padding: "1.2rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {activeCandidate ? (
                  isEditingCandidate ? (
                    /* ─── TEMPLATE-SPECIFIC INLINE EDITOR PANE ─── */
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.6rem" }}>
                        <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--accent-primary)" }}>
                          Editing Candidate #{selectedCandIdx + 1} ({getTemplateBadgeTitle(activeCandidate.template_type).label})
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button className="btn btn-secondary" style={{ fontSize: "0.78rem" }} onClick={() => setIsEditingCandidate(false)}>
                            Cancel
                          </button>
                          <button className="btn btn-success" style={{ fontSize: "0.78rem", fontWeight: 700 }} onClick={handleSaveInlineCandidateEdit}>
                            Save Changes
                          </button>
                        </div>
                      </div>

                      {/* Stem Textarea */}
                      <div>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Question Stem / Scenario *</label>
                        <textarea
                          rows={3}
                          className="textarea"
                          value={editCandStem}
                          onChange={(e) => setEditCandStem(e.target.value)}
                        />
                      </div>

                      {/* Marks / Points Input */}
                      <div style={{ maxWidth: "200px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Marks / Points</label>
                        <input
                          type="number"
                          step="0.5"
                          className="input"
                          value={isNaN(editCandPoints) ? "" : editCandPoints}
                          onChange={(e) => setEditCandPoints(safeParseFloat(e.target.value, 1.0))}
                        />
                      </div>

                      {/* TEMPLATE-SPECIFIC EDITING CONTROLS */}
                      {activeCandidate.template_type === "generic_mcq" && (
                        <div>
                          <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Options (A – E)</label>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.85rem" }}>
                            {editCandOptions.map((opt, idx) => {
                              const letter = String.fromCharCode(65 + idx);
                              return (
                                <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ fontWeight: 700, width: "20px" }}>{letter}.</span>
                                  <input
                                    type="text"
                                    className="input"
                                    value={opt}
                                    onChange={(e) => { const n = [...editCandOptions]; n[idx] = e.target.value; setEditCandOptions(n); }}
                                    style={{ flex: 1 }}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Correct Option *</label>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            {["A", "B", "C", "D", "E"].map(letter => (
                              <label key={letter} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>
                                <input type="radio" name="inline_correct_radio" checked={editCandCorrectOption === letter} onChange={() => setEditCandCorrectOption(letter)} />
                                Option {letter}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeCandidate.template_type === "multi_response_grid" && (
                        <div>
                          <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Statements A – E &amp; Truth Values</label>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.85rem" }}>
                            {editCandStatements.map((st: any, idx: number) => {
                              const letter = st.code || String.fromCharCode(65 + idx);
                              return (
                                <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ fontWeight: 700, width: "20px" }}>({letter})</span>
                                  <input
                                    type="text"
                                    className="input"
                                    value={st.text}
                                    onChange={(e) => { const n = [...editCandStatements]; n[idx].text = e.target.value; setEditCandStatements(n); }}
                                    style={{ flex: 1 }}
                                  />
                                  <button
                                    type="button"
                                    className={`btn ${st.is_true ? "btn-success" : "btn-secondary"}`}
                                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}
                                    onClick={() => { const n = [...editCandStatements]; n[idx].is_true = !n[idx].is_true; setEditCandStatements(n); }}
                                  >
                                    {st.is_true ? "True" : "False"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Mapped Answer Choice (1 – 5) *</label>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            {["1", "2", "3", "4", "5"].map(num => (
                              <label key={num} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>
                                <input type="radio" name="inline_mr_radio" checked={editCandCorrectOption === num} onChange={() => setEditCandCorrectOption(num)} />
                                Option {num}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeCandidate.template_type === "matching_column" && (
                        <div>
                          <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Matrix Matching Table</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <input type="text" className="input" value={editCandColIHeader} onChange={(e) => setEditCandColIHeader(e.target.value)} placeholder="Column I Header..." />
                            <input type="text" className="input" value={editCandColIIHeader} onChange={(e) => setEditCandColIIHeader(e.target.value)} placeholder="Column II Header..." />
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {editCandColI.map((item, idx) => (
                              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 30px", gap: "0.5rem", alignItems: "center" }}>
                                <input type="text" className="input" value={item} onChange={(e) => { const n = [...editCandColI]; n[idx] = e.target.value; setEditCandColI(n); }} />
                                <input type="text" className="input" value={editCandColII[idx] || ""} onChange={(e) => { const n = [...editCandColII]; n[idx] = e.target.value; setEditCandColII(n); }} />
                                <button type="button" className="btn btn-secondary" style={{ padding: "0.2rem", color: "var(--danger)" }} onClick={() => {
                                  setEditCandColI(prev => prev.filter((_, i) => i !== idx));
                                  setEditCandColII(prev => prev.filter((_, i) => i !== idx));
                                }}>
                                  <SvgIcon name="x" size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}
                            onClick={() => { setEditCandColI(prev => [...prev, ""]); setEditCandColII(prev => [...prev, ""]); }}
                          >
                            <SvgIcon name="plus" size={12} /> Add Row
                          </button>
                        </div>
                      )}

                      {/* Explanation Textarea */}
                      <div>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Explanation / Model Reasoning</label>
                        <textarea
                          rows={2}
                          className="textarea"
                          value={editCandExplanation}
                          onChange={(e) => setEditCandExplanation(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    /* ─── EXPANDED FULL QUESTION INSPECTION PANE ─── */
                    <>
                      {/* Active Candidate Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--accent-primary)" }}>
                            Candidate #{selectedCandIdx + 1}
                          </span>
                          <span className="badge badge-primary">{getTemplateBadgeTitle(activeCandidate.template_type).label}</span>
                          <span className="badge badge-secondary">{activeCandidate.difficulty || "medium"}</span>
                          <span className="badge badge-info">{activeCandidate.cognitive_level || "understand"}</span>
                          {activeCandidate.source_traceability?.has_rag_context ? (
                            <span className="badge badge-success" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.25rem" }} title="Grounded in uploaded teacher lesson materials">
                              <SvgIcon name="file-text" size={11} /> Teacher Material
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.25rem" }} title="Grounded in certified A/L Biology curriculum standards">
                              <SvgIcon name="book" size={11} /> Syllabus Standard
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.78rem", color: "var(--accent-primary)" }}
                            onClick={() => handleRegenerateSingleCandidate(activeCandidate, selectedCandIdx)}
                            disabled={generatingAI}
                          >
                            <SvgIcon name="refresh" size={13} /> Regenerate
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.78rem" }}
                            onClick={() => handleStartInlineEditCandidate(activeCandidate)}
                          >
                            <SvgIcon name="edit" size={14} /> Edit
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.78rem", color: "var(--danger)" }}
                            onClick={() => {
                              setAiCandidates(prev => prev.map((c, i) => i === selectedCandIdx ? { ...c, status: "rejected" } : c));
                            }}
                          >
                            Reject
                          </button>
                          <button
                            className="btn btn-success"
                            style={{ fontSize: "0.78rem", fontWeight: 700 }}
                            onClick={() => handleAcceptCandidate(activeCandidate)}
                            disabled={activeCandidate.requires_image && !activeCandidate.diagram_url}
                          >
                            {activeCandidate.requires_image && !activeCandidate.diagram_url ? "Upload Image First" : "Accept Question"}
                          </button>
                        </div>
                      </div>

                      {/* Stem Text */}
                      <div style={{ fontSize: "1.02rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {normalizeScientificSymbols(activeCandidate.stem_text)}
                      </div>

                      {/* Question Diagram / Image Component */}
                      <QuestionDiagramImage
                        diagramUrl={activeCandidate.diagram_url}
                        requiresImage={activeCandidate.requires_image}
                        imageDescription={activeCandidate.image_description}
                        questionNumber={selectedCandIdx + 1}
                        isEditing={true}
                        onUploadImage={(file) => handleUploadCandidateImage(selectedCandIdx, file)}
                        onRemoveImage={() => handleRemoveCandidateImage(selectedCandIdx)}
                      />

                      {/* MANDATORY CORRECT ANSWER & MARKS DISPLAY */}
                      <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--success)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <SvgIcon name="check" size={16} /> CORRECT ANSWER KEY &amp; MARKS
                          </div>
                          <span className="badge badge-primary" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                            Marks: {activeCandidate.points || 1.0} Mark{(activeCandidate.points || 1) > 1 ? "s" : ""}
                          </span>
                        </div>

                        {activeCandidate.template_type === "multi_response_grid" ? (
                          <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            <div><strong>Correct Statements:</strong> {
                              (activeCandidate.statements_json || [])
                                .filter((s: any) => s.is_true)
                                .map((s: any) => `Statement ${s.code}`)
                                .join(", ") || "Statements A, B and D"
                            }</div>
                            <div style={{ marginTop: "0.2rem", fontWeight: 700, color: "var(--success)" }}>
                              Mapped Answer Option: Option {activeCandidate.correct_option || "1"}
                            </div>
                          </div>
                        ) : activeCandidate.template_type === "matching_column" ? (
                          <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            <strong>Correct Pairings:</strong> Column I items match corresponding Column II rows. Option Choice: Option {activeCandidate.correct_option || "A"}
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--success)" }}>
                            Correct Answer: Option {activeCandidate.correct_option || "A"}
                          </div>
                        )}
                      </div>

                      {/* Multi-Response Grid Detailed Statements Display */}
                      {activeCandidate.template_type === "multi_response_grid" && activeCandidate.statements_json && Array.isArray(activeCandidate.statements_json) && (
                        <div style={{ margin: "0.5rem 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.2rem" }}>
                            STATEMENTS (A – E) &amp; EVALUATED TRUTH VALUES:
                          </div>
                          {activeCandidate.statements_json.map((st: any, i: number) => {
                            const code = st.code || String.fromCharCode(65 + i);
                            const isTrue = !!st.is_true;
                            return (
                              <div
                                key={i}
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--border)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  fontSize: "0.85rem",
                                }}
                              >
                                <div>
                                  <strong>({code})</strong> {normalizeScientificSymbols(st.text || "")}
                                </div>
                                <span
                                  className={`badge ${isTrue ? "badge-success" : "badge-secondary"}`}
                                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                                >
                                  {isTrue ? "TRUE" : "FALSE"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Sequential Diagnostic Steps Display */}
                      {activeCandidate.template_type === "sequential_diagnostic" && activeCandidate.grid_key_json && (
                        <div style={{ margin: "0.5rem 0", padding: "0.75rem", background: "rgba(99, 102, 241, 0.05)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.4rem" }}>
                            SEQUENTIAL EVENT STEPS:
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                            {(activeCandidate.grid_key_json.sequence_steps || []).map((step: string, i: number) => (
                              <div key={i} style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700 }}>{i + 1}</span>
                                <span>{normalizeScientificSymbols(step)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Incomplete Stem / Calculation Box */}
                      {activeCandidate.template_type === "incomplete_stem" && activeCandidate.grid_key_json && (activeCandidate.grid_key_json.formula || activeCandidate.grid_key_json.given_values) && (
                        <div style={{ margin: "0.5rem 0", padding: "0.75rem", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.84rem" }}>
                          {activeCandidate.grid_key_json.formula && (
                            <div><strong>Formula / Relation:</strong> <code>{normalizeScientificSymbols(activeCandidate.grid_key_json.formula)}</code></div>
                          )}
                          {activeCandidate.grid_key_json.given_values && (
                            <div style={{ marginTop: "0.25rem" }}><strong>Given Parameters:</strong> {normalizeScientificSymbols(activeCandidate.grid_key_json.given_values)}</div>
                          )}
                        </div>
                      )}

                      {/* Options / Statements List */}
                      {activeCandidate.options && Array.isArray(activeCandidate.options) && activeCandidate.options.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          {activeCandidate.options.map((opt: string, i: number) => {
                            const optKey = String.fromCharCode(65 + i);
                            const isCorrect = (activeCandidate.correct_option || "").toUpperCase() === optKey || activeCandidate.correct_option === String(i + 1);
                            return (
                              <div
                                key={i}
                                style={{
                                  padding: "0.6rem 0.85rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: isCorrect ? "rgba(16, 185, 129, 0.1)" : "var(--bg-secondary)",
                                  border: isCorrect ? "1px solid var(--success)" : "1px solid var(--border)",
                                  fontSize: "0.88rem",
                                  fontWeight: isCorrect ? 700 : 400,
                                  color: isCorrect ? "var(--success)" : "var(--text-primary)"
                                }}
                              >
                                {normalizeScientificSymbols(opt)} {isCorrect && "✓ (Correct Answer)"}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* HTML Table Renderer for Matrix Matching */}
                      {activeCandidate.template_type === "matching_column" && activeCandidate.grid_key_json && (
                        <div style={{ margin: "0.5rem 0" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border)", fontSize: "0.84rem" }}>
                            <thead>
                              <tr style={{ background: "rgba(99, 102, 241, 0.08)", borderBottom: "1px solid var(--border)" }}>
                                <th style={{ padding: "0.55rem 0.85rem", textAlign: "left", fontWeight: 700, color: "var(--accent-primary)", borderRight: "1px solid var(--border)" }}>
                                  {normalizeScientificSymbols(activeCandidate.grid_key_json.colIHeader || "Column I")}
                                </th>
                                <th style={{ padding: "0.55rem 0.85rem", textAlign: "left", fontWeight: 700, color: "var(--accent-primary)" }}>
                                  {normalizeScientificSymbols(activeCandidate.grid_key_json.colIIHeader || "Column II")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(activeCandidate.grid_key_json.colI || []).map((item: string, i: number) => (
                                <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)" }}>
                                  <td style={{ padding: "0.5rem 0.85rem", borderRight: "1px solid var(--border)", color: "var(--text-primary)" }}>
                                    {normalizeScientificSymbols(item)}
                                  </td>
                                  <td style={{ padding: "0.5rem 0.85rem", color: "var(--text-primary)" }}>
                                    {normalizeScientificSymbols((activeCandidate.grid_key_json.colII || [])[i] || "")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Scientific Explanation */}
                      {activeCandidate.explanation && (
                        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic", borderTop: "1px dashed var(--border)", paddingTop: "0.6rem" }}>
                          <strong>Explanation / Model Reasoning:</strong> {normalizeScientificSymbols(activeCandidate.explanation)}
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <div className="empty-state" style={{ padding: "3rem" }}>
                    <h4>No Candidate Selected</h4>
                    <p>Select a question from the left navigation list to review its details.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </Modal>
      )}
      {/* ─── IN-PLACE QUESTION EDITOR MODAL (PRESERVES TEMPLATE STRUCTURE) ─── */}
      {editingQuestion && (
        <Modal
          title={`Edit Question #${editingQuestion.question_number} — ${getTemplateBadgeTitle(editingQuestion.template_type).label}`}
          onClose={() => setEditingQuestion(null)}
          maxWidth="850px"
        >
          <form onSubmit={handleSaveQuestionEdit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "75vh", overflowY: "auto", paddingRight: "0.5rem" }}>
            
            {/* Format Info Banner */}
            <div className="card" style={{ padding: "0.75rem 1rem", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                <strong>Template Lock Active:</strong> Question template is preserved as <strong>{getTemplateBadgeTitle(editingQuestion.template_type).label}</strong>.
              </div>
              <span className="badge badge-primary">{editingQuestion.template_type}</span>
            </div>

            {/* Stem Text Input */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                Question Stem / Premise Text *
              </label>
              <textarea
                rows={3}
                className="textarea"
                value={editStem}
                onChange={(e) => setEditStem(e.target.value)}
                required
                placeholder="Enter question scenario or problem stem..."
              />
            </div>

            {/* Points, Difficulty, Cognitive Level Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Marks / Points</label>
                <input
                  type="number"
                  step="0.5"
                  className="input"
                  value={isNaN(editPoints) ? "" : editPoints}
                  onChange={(e) => setEditPoints(safeParseFloat(e.target.value, 1.0))}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Difficulty</label>
                <select className="select" value={editDifficulty} onChange={(e) => setEditDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Cognitive Level</label>
                <select className="select" value={editCognitiveLevel} onChange={(e) => setEditCognitiveLevel(e.target.value)}>
                  <option value="remember">Remember</option>
                  <option value="understand">Understand</option>
                  <option value="apply">Apply</option>
                  <option value="analyze">Analyze</option>
                  <option value="evaluate">Evaluate</option>
                </select>
              </div>
            </div>

            {/* Visual Requirement & Image Upload Settings */}
            <div className="card" style={{ padding: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <input
                  type="checkbox"
                  id="edit_req_img"
                  checked={editRequiresImage}
                  onChange={(e) => setEditRequiresImage(e.target.checked)}
                />
                <label htmlFor="edit_req_img" style={{ fontSize: "0.88rem", fontWeight: 700, cursor: "pointer" }}>
                  Requires Biological Diagram / Chart Image
                </label>
              </div>

              {editRequiresImage && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Suggested Visual Description
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={editImageDescription}
                      onChange={(e) => setEditImageDescription(e.target.value)}
                      placeholder="e.g. Cross-sectional diagram of fish gill showing primary filaments..."
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                      Diagram Image URL / Data URL
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={editDiagramUrl}
                      onChange={(e) => setEditDiagramUrl(e.target.value)}
                      placeholder="https://... or upload image asset"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* MCQ Options A-E Editing */}
            {editOptions.length > 0 && (
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                  Options (A – E) &amp; Correct Answer Selection
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {editOptions.map((opt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    return (
                      <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, minWidth: "24px" }}>({letter})</span>
                        <input
                          type="text"
                          className="input"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...editOptions];
                            newOpts[i] = e.target.value;
                            setEditOptions(newOpts);
                          }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", cursor: "pointer", minWidth: "110px" }}>
                          <input
                            type="radio"
                            name="correct_opt_radio"
                            checked={editCorrectOption === letter || editCorrectOption === String(i + 1)}
                            onChange={() => setEditCorrectOption(letter)}
                          />
                          Correct Answer
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Solution Explanation */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                Scientific Model Answer / Solution Reasoning
              </label>
              <textarea
                rows={2}
                className="textarea"
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                placeholder="Explain why the answer is correct..."
              />
            </div>

            {/* Modal Actions Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingQuestion(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={updatingQuestion}>
                {updatingQuestion ? "Saving Changes..." : "Save Question Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* QUESTION BANK SELECTOR MODAL WITH DUPLICATE WARNING */}
      {importModalOpen && (
        <Modal title={`Import Questions into ${bankTargetSection.toUpperCase()}`} onClose={() => setImportModalOpen(false)} maxWidth="900px">
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {duplicateWarning && (
              <div className="badge badge-warning" style={{ padding: "0.6rem", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{duplicateWarning}</span>
                <button className="btn btn-primary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }} onClick={handleImportSelectedBankQuestions}>
                  Add Anyway
                </button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
              <input type="text" className="input" placeholder="Search stem or topic..." value={searchBankQuery} onChange={(e) => setSearchBankQuery(e.target.value)} />
              <div style={{ display: "flex", alignItems: "center", fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                Constraint: {bankTargetSection === "paper_1" ? "MCQ Only" : bankTargetSection === "part_a" ? "Structured Only" : "Essay Only"}
              </div>
              <select className="select" value={difficultyBankFilter} onChange={(e) => setDifficultyBankFilter(e.target.value)}>
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {loadingBank ? (
              <div className="page-loader" style={{ minHeight: "200px" }}><div className="spinner" /></div>
            ) : filteredBankQuestions.length === 0 ? (
              <div className="empty-state" style={{ padding: "2rem" }}>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>No matching questions in Question Bank for this section type constraint.</p>
              </div>
            ) : (
              <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {filteredBankQuestions.map((q) => {
                  const isChecked = selectedBankIds.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleBankSelection(q.id)}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "var(--radius-sm)",
                        background: isChecked ? "rgba(99, 102, 241, 0.1)" : "var(--bg-secondary)",
                        border: isChecked ? "1px solid var(--accent-primary)" : "1px solid var(--border)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem"
                      }}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {q.question_text.slice(0, 140)}...
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                          Type: {q.question_type} &middot; Difficulty: {q.difficulty}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)" }}>Selected {selectedBankIds.length} question(s)</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={() => setImportModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleImportSelectedBankQuestions} disabled={importingBank || selectedBankIds.length === 0}>
                  {importingBank ? "Importing..." : `Add ${selectedBankIds.length} Questions to Section`}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* READ-ONLY PAPER PREVIEW MODAL */}
      {previewModalOpen && createdExam && (
        <Modal title={`Preview: ${createdExam.title}`} onClose={() => setPreviewModalOpen(false)} maxWidth="900px">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxHeight: "80vh", overflowY: "auto", paddingRight: "0.5rem" }}>
            <div style={{ textAlign: "center", borderBottom: "2px solid var(--border)", paddingBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>G.C.E. ADVANCED LEVEL BIOLOGY</h2>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0.3rem 0" }}>{createdExam.title}</h3>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Time Allowed: {createdExam.time_limit_minutes} Minutes &middot; Total Items: {createdExam.questions?.length || 0}
              </div>
            </div>

            {createdExam.questions?.map((q, idx) => {
              const t = (q.template_type || "generic_mcq").toLowerCase();
              const isStructured = t === "structured_subparts" || Boolean(q.structured_subparts_json && q.structured_subparts_json.length > 0);
              const isEssay = t === "essay_rubric" || t === "essay" || Boolean(q.essay_checklist_json);

              if (isStructured) {
                return (
                  <div key={q.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.25rem" }}>
                    <StructuredQuestionPaperRenderer
                      questionNumber={q.question_number}
                      stemText={q.stem_text}
                      parts={q.structured_subparts_json || []}
                      diagramUrl={q.diagram_url}
                      points={q.points || 40}
                    />
                  </div>
                );
              }

              if (isEssay) {
                const ch = q.essay_checklist_json;
                const isObj = ch && typeof ch === "object" && !Array.isArray(ch);
                const subparts = isObj && ch.subparts ? ch.subparts : [];
                const criteria = isObj && ch.criteria ? ch.criteria : isObj && ch.answer_points ? ch.answer_points : Array.isArray(ch) ? ch : [];
                const structure_type = isObj && (ch.structure_format || ch.structure_type) ? (ch.structure_format || ch.structure_type) : subparts.length > 0 ? "multi_part" : "single_complete";
                const topic = isObj && ch.topic ? ch.topic : "Essay Question";
                const instruction = isObj && ch.instruction ? ch.instruction : "Write short notes on the following:";
                const model_answer = isObj && ch.model_answer ? ch.model_answer : "";
                const examiner_notes = isObj && ch.examiner_notes ? ch.examiner_notes : q.explanation || "";

                return (
                  <div key={q.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.25rem" }}>
                    <EssayQuestionPaperRenderer
                      questionNumber={q.question_number}
                      stemText={q.stem_text}
                      points={q.points || 0}
                      structureType={structure_type}
                      instruction={instruction}
                      subparts={subparts}
                      criteria={criteria}
                      markingScheme={ch?.marking_scheme}
                      examinerNotes={examiner_notes}
                      diagramUrl={q.diagram_url}
                      requiresImage={q.requires_image}
                      imageDescription={q.image_description}
                      showTeacherGuide={true}
                    />
                  </div>
                );
              }

              return (
                <div key={q.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.5rem" }}>
                    Q{q.question_number}. {normalizeScientificSymbols(q.stem_text)} ({q.points} Point{q.points === 1 ? "" : "s"})
                  </div>

                  {q.diagram_url && (
                    <div style={{ margin: "0.5rem 0", textAlign: "center" }}>
                      <img
                        src={resolveDiagramImageUrl(q.diagram_url)}
                        alt={`Diagram for Question ${q.question_number}`}
                        style={{ maxWidth: "280px", maxHeight: "180px", objectFit: "contain", borderRadius: "var(--radius-sm)" }}
                      />
                    </div>
                  )}

                  {q.options && q.options.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", paddingLeft: "1rem" }}>
                      {q.options.map((opt, i) => (
                        <div key={i} style={{ fontSize: "0.88rem" }}>
                          ({String.fromCharCode(65 + i)}) {normalizeScientificSymbols(opt)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ textAlign: "right", position: "sticky", bottom: 0, background: "var(--bg-card)", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-secondary" onClick={() => setPreviewModalOpen(false)}>Close Preview</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ADD ESSAY QUESTION STRUCTURE MODAL */}
      {addEssayModalOpen && (
        <AddEssayStructureModal
          isOpen={addEssayModalOpen}
          onClose={() => setAddEssayModalOpen(false)}
          defaultQuestionNumber={nextEssayQNum}
          initialStructure={essayAuthoringStructure}
          onCreateStructure={handleCreateEssayStructure}
        />
      )}

      {/* ESSAY QUESTION STUDENT PAPER PREVIEW MODAL */}
      {previewEssayModalOpen && previewEssayQuestion && (
        <Modal
          title={`Paper II Part B — Essay Question ${previewEssayQuestion.question_number} Student Preview`}
          onClose={() => {
            setPreviewEssayModalOpen(false);
            setPreviewEssayQuestion(null);
          }}
          maxWidth="850px"
        >
          {(() => {
            const normalized = normalizeLegacyEssayData(
              previewEssayQuestion.essay_checklist_json,
              previewEssayQuestion.stem_text,
              previewEssayQuestion.points
            );

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "78vh", overflowY: "auto" }}>
                <EssayQuestionPaperRenderer
                  questionNumber={previewEssayQuestion.question_number}
                  stemText={normalized.stem_text || previewEssayQuestion.stem_text}
                  points={previewEssayQuestion.points || 0}
                  structureType={normalized.structure_format}
                  instruction={normalized.instruction}
                  subparts={normalized.subparts}
                  criteria={normalized.answer_points}
                  markingScheme={normalized.marking_scheme}
                  examinerNotes={normalized.examiner_notes || previewEssayQuestion.explanation || ""}
                  diagramUrl={previewEssayQuestion.diagram_url}
                  requiresImage={previewEssayQuestion.requires_image}
                  imageDescription={previewEssayQuestion.image_description}
                  showTeacherGuide={true}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPreviewEssayModalOpen(false);
                      setPreviewEssayQuestion(null);
                    }}
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ESSAY AI BLUEPRINT & GENERATOR MODAL */}
      {essayAiModalOpen && (
        <EssayAIGeneratorModal
          isOpen={essayAiModalOpen}
          onClose={() => setEssayAiModalOpen(false)}
          assessmentId={createdExam?.id}
          startingQuestionNumber={nextEssayQNum}
          courses={courses}
          initialCourseId={selectedCourseId ? Number(selectedCourseId) : undefined}
          initialUnits={units}
          onBlueprintFinalized={handleEssayBlueprintFinalized}
          onCandidatesGenerated={handleCandidatesGeneratedFromModal}
        />
      )}

      {/* ESSAY CANDIDATE REVIEW WORKSPACE MODAL */}
      {essayReviewModalOpen && essayAiCandidates.length > 0 && (
        <EssayCandidateReviewModal
          isOpen={essayReviewModalOpen}
          onClose={() => setEssayReviewModalOpen(false)}
          candidates={essayAiCandidates}
          onBatchAccept={handleBatchAcceptEssayCandidates}
          onEditCandidateInBuilder={handleEditEssayCandidateInBuilder}
          addToast={addToast}
          courseId={selectedCourseId ? Number(selectedCourseId) : undefined}
          unitIds={units.map((u) => u.id)}
        />
      )}

      {/* CONTROLLED PUBLISHED PAPER REVISION MODAL */}
      {revisionModalOpen && createdExam && (
        <Modal title={`Revise Published Paper: ${createdExam.title}`} onClose={() => setRevisionModalOpen(false)} maxWidth="700px">
          <form onSubmit={handleExecutePaperRevision} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ padding: "0.85rem", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.85rem", color: "var(--text-primary)" }}>
              <SvgIcon name="info" size={16} /> This paper is published. Historical completed student attempts remain immutable. Revision will record an audit trail and notify active students.
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Revision Scope *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                {[
                  { id: "single_question", label: "Single-Question Correction", desc: "Correct specific item (e.g. Q17)" },
                  { id: "marking_correction", label: "Marking Scheme Update", desc: "Update evaluation rubric" },
                  { id: "paper_wide", label: "Paper-Wide Revision", desc: "General update to paper settings" },
                ].map(r => (
                  <div
                    key={r.id}
                    onClick={() => setRevisionType(r.id as any)}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-md)",
                      border: revisionType === r.id ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                      background: revisionType === r.id ? "rgba(99, 102, 241, 0.08)" : "var(--bg-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", color: revisionType === r.id ? "var(--accent-primary)" : "var(--text-primary)" }}>
                      {r.label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {revisionType === "single_question" && (
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Target Question Number</label>
                <input
                  type="number"
                  className="input"
                  value={isNaN(revisionQuestionNum) ? "" : revisionQuestionNum}
                  onChange={(e) => setRevisionQuestionNum(safeParseInt(e.target.value, 1))}
                  min={1}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Revision Reason &amp; Description *</label>
              <textarea
                rows={3}
                className="textarea"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                required
                placeholder="Explain the correction (e.g. Fixed option B in Question 17)..."
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id="notify_chk"
                checked={revisionNotifyStudents}
                onChange={(e) => setRevisionNotifyStudents(e.target.checked)}
              />
              <label htmlFor="notify_chk" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                Send in-app notification to enrolled students regarding this question correction
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRevisionModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={revisingPaper}>
                {revisingPaper ? "Logging Revision..." : "Execute Paper Revision"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MANUAL STRUCTURED QUESTION SKELETON BUILDER MODAL */}
      {manualStructuredModalOpen && (
        <Modal
          title="Structured Question Structure Builder"
          onClose={() => {
            setManualStructuredModalOpen(false);
          }}
          maxWidth="980px"
        >
          <StructuredSkeletonBuilder
            initialNodes={editingStructuredNodes}
            questionNumber={editingStructuredQuestionId ? (createdExam?.questions?.find(q => q.id === editingStructuredQuestionId)?.question_number || 1) : ((createdExam?.questions?.length || 0) + 1)}
            onSaveStructure={handleSaveStructureFromBuilder}
            onCancel={() => {
              setManualStructuredModalOpen(false);
            }}
          />
        </Modal>
      )}

      {/* STRUCTURED AI GENERATION WORKSPACE MODAL */}
      {structuredAiModalOpen && (
        <StructuredAiGenerationModal
          isOpen={structuredAiModalOpen}
          onClose={() => setStructuredAiModalOpen(false)}
          courses={courses}
          initialCourseId={createdExam?.course_id || (typeof selectedCourseId === "number" ? selectedCourseId : undefined)}
          initialUnits={units}
          onGenerate={handleGenerateStructuredQuestions}
          isGenerating={generatingStructuredAI}
        />
      )}

      {/* STRUCTURED CANDIDATE REVIEW WORKSPACE MODAL */}
      {structuredReviewModalOpen && structuredAiCandidates.length > 0 && (
        <StructuredCandidateReviewModal
          isOpen={structuredReviewModalOpen}
          onClose={() => setStructuredReviewModalOpen(false)}
          candidates={structuredAiCandidates}
          onBatchAccept={handleBatchAcceptStructuredCandidates}
          addToast={addToast}
          courseId={createdExam?.course_id || (typeof selectedCourseId === "number" ? selectedCourseId : undefined)}
          unitIds={units.map((u) => u.id)}
        />
      )}

      {/* ESSAY CANDIDATE REVIEW WORKSPACE MODAL */}
      {essayReviewModalOpen && essayAiCandidates.length > 0 && (
        <EssayCandidateReviewModal
          isOpen={essayReviewModalOpen}
          onClose={() => setEssayReviewModalOpen(false)}
          candidates={essayAiCandidates}
          onBatchAccept={handleBatchAcceptEssayCandidates}
          onEditCandidateInBuilder={handleEditEssayCandidateInBuilder}
          addToast={addToast}
          courseId={createdExam?.course_id || (typeof selectedCourseId === "number" ? selectedCourseId : undefined)}
          unitIds={units.map((u) => u.id)}
        />
      )}

      {/* CONFIRM PUBLISH MODAL */}
      {publishConfirmModalOpen && (
        <ConfirmDialog
          title="Publish Assessment Paper?"
          message="Once published, this paper becomes available according to schedule, and question content will be frozen into an immutable snapshot."
          confirmLabel={publishing ? "Publishing..." : "Publish Assessment"}
          danger={false}
          loading={publishing}
          onConfirm={handleConfirmPublishExam}
          onCancel={() => setPublishConfirmModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function TeacherExamCreatePage() {
  return (
    <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}>
      <TeacherExamCreateContent />
    </Suspense>
  );
}
