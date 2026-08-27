"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import api, { QuestionVersionResponse, QuestionAnalyticsResponse, QuestionBankGroup, Course, UnitWithLessons } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import QuestionPromptRenderer from "@/components/QuestionPromptRenderer";

export default function QuestionBankPage() {
  const { addToast } = useToast();
  const [questions, setQuestions] = useState<QuestionVersionResponse[]>([]);
  const [paperGroups, setPaperGroups] = useState<QuestionBankGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Course, Unit, Lesson metadata for hierarchy filtering
  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<QuestionVersionResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // AI Actions state
  const [improveModalOpen, setImproveModalOpen] = useState(false);
  const [selectedQuestionForAI, setSelectedQuestionForAI] = useState<number | null>(null);
  const [improveInstructions, setImproveInstructions] = useState<string[]>([]);
  const [customInstruction, setCustomInstruction] = useState("");
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // Duplicate Detection state
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatesList, setDuplicatesList] = useState<{ originalId: number; text: string; duplicates: any[] }[]>([]);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  
  // Analytics & Responses Modal state
  const [analytics, setAnalytics] = useState<Record<number, QuestionAnalyticsResponse>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<number | null>(null);
  const [viewAllModalQuestion, setViewAllModalQuestion] = useState<QuestionVersionResponse | null>(null);

  // ─── Filter State ───
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");             // all | mcq | structured | essay
  const [mcqSubtypeFilter, setMcqSubtypeFilter] = useState<string>("all"); // all | generic_mcq | assertion_reason | five_statement_truth | matching_column | diagram_based | experimental_procedure | combination_grid
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all"); // all | easy | medium | hard
  const [cognitiveFilter, setCognitiveFilter] = useState<string>("all");   // all | remember | understand | apply | analyze | evaluate
  const [statusFilter, setStatusFilter] = useState<string>("all");       // all | draft | review | finalized | archived
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Expanded card state
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchQuestions();
    fetchCourses();
  }, []);

  // Fetch Units when Course selection changes
  useEffect(() => {
    if (courseFilter !== "all") {
      const courseId = Number(courseFilter);
      api.listUnits(courseId)
        .then(setUnits)
        .catch((err) => {
          console.error("Failed to load units for course", err);
          setUnits([]);
        });
    } else {
      setUnits([]);
    }
  }, [courseFilter]);

  const fetchCourses = async () => {
    try {
      const data = await api.listCourses();
      setCourses(data || []);
    } catch (e) {
      console.error("Failed to fetch courses for filters", e);
    }
  };

  const fetchQuestions = () => {
    setLoading(true);
    api.getQuestionBank()
      .then(setQuestions)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Reset Dependent Filters on Parent Filter Change
  const handleCourseChange = (newCourseId: string) => {
    setCourseFilter(newCourseId);
    setUnitFilter("all");
    setLessonFilter("all");
  };

  const handleUnitChange = (newUnitId: string) => {
    setUnitFilter(newUnitId);
    setLessonFilter("all");
  };

  const handleTypeChange = (newType: string) => {
    setTypeFilter(newType);
    if (newType === "structured" || newType === "essay") {
      setMcqSubtypeFilter("all");
    }
  };

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setMcqSubtypeFilter("all");
    setCourseFilter("all");
    setUnitFilter("all");
    setLessonFilter("all");
    setDifficultyFilter("all");
    setCognitiveFilter("all");
    setStatusFilter("all");
  };

  const handleExpand = async (qId: number) => {
    if (expandedId === qId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(qId);
    
    const version = questions.find(q => q.id === qId);
    const parentQuestionId = version?.question_id ?? qId;
    
    if (!analytics[qId]) {
      setLoadingAnalytics(qId);
      try {
        const data = await api.getQuestionAnalytics(parentQuestionId);
        setAnalytics(prev => ({ ...prev, [qId]: data }));
      } catch (e) {
        console.error("Failed to load analytics", e);
      } finally {
        setLoadingAnalytics(null);
      }
    }
  };

  const handleImproveClick = (qId: number) => {
    setSelectedQuestionForAI(qId);
    setImproveInstructions([]);
    setCustomInstruction("");
    setImproveModalOpen(true);
  };

  const toggleImproveInstruction = (instruction: string) => {
    setImproveInstructions(prev => 
      prev.includes(instruction) 
        ? prev.filter(i => i !== instruction)
        : [...prev, instruction]
    );
  };

  const submitImprovement = async () => {
    if (!selectedQuestionForAI) return;
    
    const finalInstructions = [...improveInstructions];
    if (customInstruction.trim()) {
      finalInstructions.push(customInstruction.trim());
    }
    
    if (finalInstructions.length === 0) {
      addToast("Please select or enter at least one instruction", "warning");
      return;
    }

    setIsProcessingAI(true);
    try {
      await api.improveQuestion(selectedQuestionForAI, finalInstructions);
      addToast("Question improved successfully! A new version was created.", "success");
      setImproveModalOpen(false);
      fetchQuestions();
    } catch (e: any) {
      addToast(e.message || "Failed to improve question", "error");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteBankQuestion(deleteTarget.question_id || deleteTarget.id);
      addToast("Question deleted from Question Bank", "success");
      setDeleteTarget(null);
      fetchQuestions();
    } catch (err) {
      console.error("Failed to delete question", err);
      addToast("Failed to delete question", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleScanDuplicates = async () => {
    setIsScanningDuplicates(true);
    setDuplicateModalOpen(true);
    setDuplicatesList([]);
    
    try {
      const selectedLessonId = lessonFilter !== "all" ? Number(lessonFilter) : undefined;
      const res = await api.scanDuplicateQuestions(selectedLessonId);
      setDuplicatesList(res.duplicate_groups || []);
    } catch (e: any) {
      addToast(e.message || "Failed to scan duplicates", "error");
      setDuplicateModalOpen(false);
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return "badge-info";
    switch (status.toLowerCase()) {
      case "validated": 
      case "approved":
      case "finalized": return "badge-success";
      case "review_recommended": 
      case "pending_review": return "badge-warning";
      case "potential_issue": 
      case "rejected": return "badge-error";
      default: return "badge-info";
    }
  };

  const getCognitiveBadge = (level: string | null | undefined) => {
    if (!level) return "badge-secondary";
    const l = level.toLowerCase();
    if (l === "remember" || l === "knowledge") return "badge-info";
    if (l === "understand" || l === "comprehension") return "badge-success";
    if (l === "apply" || l === "application") return "badge-warning";
    if (l === "analyze" || l === "analysis" || l === "evaluate") return "badge-error";
    return "badge-secondary";
  };

  // Lessons derived from currently selected unit or all lessons in loaded units
  const availableLessons = useMemo(() => {
    if (unitFilter !== "all") {
      const selectedUnit = units.find(u => u.id === Number(unitFilter));
      return selectedUnit?.lessons || [];
    }
    // Aggregate lessons from all units in selected course
    return units.flatMap(u => u.lessons || []);
  }, [unitFilter, units]);

  // Filtered Lessons from questions as fallback if course/units not loaded
  const fallbackLessons = useMemo(() => {
    return Array.from(
      new Map(
        questions
          .filter(q => q.lesson_id != null)
          .map(q => [q.lesson_id, q.lesson_title])
      ).entries()
    );
  }, [questions]);

  // ─── Main Filtering Pipeline ───
  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      // 1. Text Search (Stem, Title, Explanation, Tags)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const textMatch = (q.question_text || "").toLowerCase().includes(query);
        const explanationMatch = (q.explanation || "").toLowerCase().includes(query);
        const tagMatch = (q.tags || []).some(t => t.toLowerCase().includes(query));
        const refMatch = (q.source_reference || "").toLowerCase().includes(query);
        if (!textMatch && !explanationMatch && !tagMatch && !refMatch) return false;
      }

      // 2. Question Type Filter (mcq, structured, essay)
      if (typeFilter !== "all") {
        const qType = (q.question_type || "").toLowerCase();
        const tags = q.tags || [];
        if (typeFilter === "mcq") {
          const isMCQ = qType === "mcq" || qType === "paper_1_mcq" || tags.includes("paper_1_mcq") || tags.includes("mcq");
          if (!isMCQ) return false;
        } else if (typeFilter === "structured") {
          const isStructured = qType === "structured" || qType === "paper_2_structured" || tags.includes("paper_2_structured");
          if (!isStructured) return false;
        } else if (typeFilter === "essay") {
          const isEssay = qType === "essay" || qType === "paper_2_essay" || tags.includes("paper_2_essay");
          if (!isEssay) return false;
        }
      }

      // 3. MCQ Subtype Filter (Generic, Assertion-Reason, 5-Statement, Matching, Diagram, Experimental, Grid)
      if (mcqSubtypeFilter !== "all" && (typeFilter === "all" || typeFilter === "mcq")) {
        const tags = q.tags || [];
        const qText = (q.question_text || "").toLowerCase();
        const subMatch = tags.includes(mcqSubtypeFilter) || qText.includes(mcqSubtypeFilter);
        if (!subMatch) return false;
      }

      // 4. Hierarchical Lesson / Unit Filter
      if (lessonFilter !== "all") {
        if (q.lesson_id?.toString() !== lessonFilter) return false;
      } else if (unitFilter !== "all") {
        const validLessonIds = new Set(availableLessons.map(l => l.id));
        if (q.lesson_id && !validLessonIds.has(q.lesson_id)) return false;
      }

      // 5. Difficulty Filter
      if (difficultyFilter !== "all") {
        if ((q.difficulty || "").toLowerCase() !== difficultyFilter.toLowerCase()) return false;
      }

      // 6. Cognitive Level Filter
      if (cognitiveFilter !== "all") {
        const qCognitive = (q.cognitive_level || "").toLowerCase();
        const target = cognitiveFilter.toLowerCase();
        const isMatch = qCognitive === target ||
          (target === "remember" && qCognitive === "knowledge") ||
          (target === "understand" && qCognitive === "comprehension") ||
          (target === "apply" && qCognitive === "application") ||
          (target === "analyze" && qCognitive === "analysis");
        if (!isMatch) return false;
      }

      // 7. Question Status Filter (draft, review, finalized, archived)
      if (statusFilter !== "all") {
        const approval = (q.teacher_approval_status || "").toLowerCase();
        const validation = (q.ai_validation_status || "").toLowerCase();

        if (statusFilter === "draft" && approval !== "draft" && validation !== "pending") return false;
        if (statusFilter === "review" && approval !== "pending_review" && validation !== "review_recommended" && validation !== "potential_issue") return false;
        if (statusFilter === "finalized" && approval !== "approved" && approval !== "finalized" && validation !== "validated") return false;
        if (statusFilter === "archived" && approval !== "archived" && approval !== "rejected") return false;
      }

      return true;
    });
  }, [questions, searchQuery, typeFilter, mcqSubtypeFilter, courseFilter, unitFilter, lessonFilter, availableLessons, difficultyFilter, cognitiveFilter, statusFilter]);

  // Active Filter Chips List for easy removable indicators
  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; clear: () => void }[] = [];

    if (searchQuery.trim()) {
      chips.push({ id: "search", label: `Search: "${searchQuery}"`, clear: () => setSearchQuery("") });
    }
    if (typeFilter !== "all") {
      const typeLabel = typeFilter === "mcq" ? "MCQ" : typeFilter === "structured" ? "Structured" : "Essay";
      chips.push({ id: "type", label: `Type: ${typeLabel}`, clear: () => handleTypeChange("all") });
    }
    if (mcqSubtypeFilter !== "all") {
      const subtypeLabels: Record<string, string> = {
        generic_mcq: "Generic MCQ",
        assertion_reason: "Assertion–Reason",
        five_statement_truth: "Five Statement",
        matching_column: "Matching Column",
        diagram_based: "Diagram Based",
        experimental_procedure: "Experimental",
        combination_grid: "Combination Grid",
      };
      chips.push({ id: "subtype", label: `Subtype: ${subtypeLabels[mcqSubtypeFilter] || mcqSubtypeFilter}`, clear: () => setMcqSubtypeFilter("all") });
    }
    if (courseFilter !== "all") {
      const c = courses.find(cr => cr.id === Number(courseFilter));
      chips.push({ id: "course", label: `Course: ${c?.title || courseFilter}`, clear: () => handleCourseChange("all") });
    }
    if (unitFilter !== "all") {
      const u = units.find(un => un.id === Number(unitFilter));
      chips.push({ id: "unit", label: `Unit: ${u?.title || unitFilter}`, clear: () => handleUnitChange("all") });
    }
    if (lessonFilter !== "all") {
      const l = availableLessons.find(ls => ls.id === Number(lessonFilter));
      const fallbackTitle = fallbackLessons.find(([id]) => id === Number(lessonFilter))?.[1];
      chips.push({ id: "lesson", label: `Lesson: ${l?.title || fallbackTitle || lessonFilter}`, clear: () => setLessonFilter("all") });
    }
    if (difficultyFilter !== "all") {
      chips.push({ id: "difficulty", label: `Difficulty: ${difficultyFilter.toUpperCase()}`, clear: () => setDifficultyFilter("all") });
    }
    if (cognitiveFilter !== "all") {
      chips.push({ id: "cognitive", label: `Cognitive: ${cognitiveFilter.toUpperCase()}`, clear: () => setCognitiveFilter("all") });
    }
    if (statusFilter !== "all") {
      chips.push({ id: "status", label: `Status: ${statusFilter.toUpperCase()}`, clear: () => setStatusFilter("all") });
    }

    return chips;
  }, [searchQuery, typeFilter, mcqSubtypeFilter, courseFilter, unitFilter, lessonFilter, difficultyFilter, cognitiveFilter, statusFilter, courses, units, availableLessons, fallbackLessons]);

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SvgIcon name="file-text" size={24} /> QUESTION BANK
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.2rem 0 0 0" }}>
            Centralized A/L Question Repository
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button 
            className="btn btn-secondary"
            onClick={handleScanDuplicates}
            disabled={isScanningDuplicates}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}
          >
            <SvgIcon name="layers" size={16} /> 
            {isScanningDuplicates ? "Scanning..." : "Scan for Duplicates"}
          </button>
        </div>
      </div>

      {/* ─── Compact Filter Bar ─── */}
      <div 
        className="card" 
        style={{ 
          padding: "1.25rem", 
          marginBottom: "1.5rem", 
          background: "var(--bg-card)", 
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }}
      >
        {/* Top Search Field */}
        <div style={{ position: "relative", width: "100%" }}>
          <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <SvgIcon name="file-text" size={18} />
          </span>
          <input
            type="text"
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions by stem, topic, or keyword..."
            style={{
              paddingLeft: "2.5rem",
              paddingRight: searchQuery ? "2.5rem" : "1rem",
              fontSize: "0.92rem",
              width: "100%",
              borderRadius: "var(--radius-md)"
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "1.1rem",
                padding: 0
              }}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Primary Filter Control Bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem", alignItems: "center" }}>
          {/* Question Type */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
              Question Type
            </label>
            <select
              className="select"
              value={typeFilter}
              onChange={(e) => handleTypeChange(e.target.value)}
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="all">All Question Types</option>
              <option value="mcq">MCQ (Paper I)</option>
              <option value="structured">Structured (Paper II-A)</option>
              <option value="essay">Essay (Paper II-B)</option>
            </select>
          </div>

          {/* Course */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
              Course
            </label>
            <select
              className="select"
              value={courseFilter}
              onChange={(e) => handleCourseChange(e.target.value)}
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="all">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id.toString()}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Unit (Dependent on Course) */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
              Unit
            </label>
            <select
              className="select"
              value={unitFilter}
              onChange={(e) => handleUnitChange(e.target.value)}
              disabled={courseFilter === "all" || units.length === 0}
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="all">{courseFilter === "all" ? "Select Course First" : "All Units"}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id.toString()}>{u.title}</option>
              ))}
            </select>
          </div>

          {/* Difficulty */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
              Difficulty
            </label>
            <select
              className="select"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
              Status
            </label>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="review">Review Recommended</option>
              <option value="finalized">Finalized &amp; Validated</option>
              <option value="archived">Archived / Rejected</option>
            </select>
          </div>
        </div>

        {/* Secondary Toggle Row: More Filters & Clear All */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.75rem" }}>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowMoreFilters(prev => !prev)}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <SvgIcon name="sparkle" size={14} />
            {showMoreFilters ? "Hide Advanced Filters ▲" : "More Filters ▼"}
          </button>

          {activeChips.length > 0 && (
            <button
              className="btn-secondary btn-sm"
              onClick={handleClearAllFilters}
              style={{ fontSize: "0.82rem", color: "var(--danger)" }}
            >
              Clear All Filters
            </button>
          )}
        </div>

        {/* Contextual Advanced Filter Drawer (More Filters) */}
        {showMoreFilters && (
          <div 
            className="animate-fade-in" 
            style={{ 
              padding: "1rem", 
              background: "var(--bg-secondary)", 
              borderRadius: "var(--radius-md)", 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
              gap: "1rem",
              border: "1px solid var(--border)"
            }}
          >
            {/* MCQ Subtype Filter — Visible ONLY when Question Type is MCQ or All */}
            {(typeFilter === "all" || typeFilter === "mcq") && (
              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
                  MCQ Subtype (A/L Templates)
                </label>
                <select
                  className="select"
                  value={mcqSubtypeFilter}
                  onChange={(e) => setMcqSubtypeFilter(e.target.value)}
                  style={{ width: "100%", fontSize: "0.85rem" }}
                >
                  <option value="all">All MCQ Subtypes</option>
                  <option value="generic_mcq">1. Generic MCQ</option>
                  <option value="assertion_reason">2. Assertion–Reason</option>
                  <option value="five_statement_truth">3. Five Statement</option>
                  <option value="matching_column">4. Matching Column</option>
                  <option value="diagram_based">5. Diagram Based</option>
                  <option value="experimental_procedure">6. Experimental Procedure</option>
                  <option value="combination_grid">7. Combination Grid (Q41–50)</option>
                </select>
              </div>
            )}

            {/* Lesson Filter (Dependent on Course/Unit) */}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
                Lesson
              </label>
              <select
                className="select"
                value={lessonFilter}
                onChange={(e) => setLessonFilter(e.target.value)}
                style={{ width: "100%", fontSize: "0.85rem" }}
              >
                <option value="all">All Lessons</option>
                {availableLessons.length > 0 ? (
                  availableLessons.map((l) => (
                    <option key={l.id} value={l.id.toString()}>{l.title}</option>
                  ))
                ) : (
                  fallbackLessons.map(([id, title]) => (
                    <option key={id} value={id?.toString()}>{title || `Lesson ${id}`}</option>
                  ))
                )}
              </select>
            </div>

            {/* Cognitive Level Filter */}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem", display: "block" }}>
                Cognitive Level (Taxonomy)
              </label>
              <select
                className="select"
                value={cognitiveFilter}
                onChange={(e) => setCognitiveFilter(e.target.value)}
                style={{ width: "100%", fontSize: "0.85rem" }}
              >
                <option value="all">All Cognitive Levels</option>
                <option value="remember">Remember / Knowledge</option>
                <option value="understand">Understand / Comprehension</option>
                <option value="apply">Apply / Application</option>
                <option value="analyze">Analyze / Analysis</option>
                <option value="evaluate">Evaluate</option>
              </select>
            </div>
          </div>
        )}

        {/* Active Filter Chips Display Bar */}
        {activeChips.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", paddingTop: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Active Filters:
            </span>
            {activeChips.map((chip) => (
              <span
                key={chip.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.25rem 0.65rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent-primary)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: "1px solid rgba(99, 102, 241, 0.3)"
                }}
              >
                {chip.label}
                <button
                  onClick={chip.clear}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-primary)",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: 0,
                    fontSize: "0.95rem",
                    lineHeight: 1
                  }}
                  title="Remove filter"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─── Result Count Bar ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>
          Showing {filteredQuestions.length} {filteredQuestions.length === 1 ? "question" : "questions"}
        </div>
      </div>

      {/* ─── Question List View ─── */}
      {loading ? (
        <div className="page-loader" style={{ minHeight: "40vh" }}><div className="spinner" /></div>
      ) : filteredQuestions.length === 0 ? (
        <div className="card" style={{ padding: "3rem 2rem", textAlign: "center" }}>
          <div className="empty-state">
            <div className="empty-icon"><SvgIcon name="file-text" size={48} /></div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
              No questions found
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "450px", margin: "0 auto 1.5rem" }}>
              Try removing one or more filters or changing your search terms to view available questions.
            </p>
            {activeChips.length > 0 && (
              <button className="btn btn-primary" onClick={handleClearAllFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {filteredQuestions.map((q) => {
            const qTypeLower = (q.question_type || "").toLowerCase();
            const tags = q.tags || [];
            const text = q.question_text || "";
            const textLower = text.toLowerCase();

            const isMcq = qTypeLower.includes("mcq") || tags.some(t => t.toLowerCase().includes("mcq"));
            const isStructured = qTypeLower.includes("structured") || qTypeLower === "short_answer" || tags.some(t => t.toLowerCase().includes("structured"));
            const isEssay = qTypeLower.includes("essay") || tags.some(t => t.toLowerCase().includes("essay"));

            // 1. Exam Paper Name & Paper Type
            const paperType = isMcq ? "Paper 1" : "Paper 2";
            let examPaperName = q.source_reference || "";
            if (!examPaperName) {
              if (isMcq) examPaperName = "G.C.E. A/L 2024 Biology Model Paper I (MCQ)";
              else if (isStructured) examPaperName = "G.C.E. A/L 2024 Biology Model Paper II (Part A - Structured)";
              else if (isEssay) examPaperName = "G.C.E. A/L 2024 Biology Model Paper II (Part B - Essay)";
              else examPaperName = "G.C.E. Advanced Level Examination";
            }

            // 2. Kind / Category
            const formatCategory = isMcq ? "MCQ" : isStructured ? "Structured" : isEssay ? "Essay" : "Assessment";

            // 3. Question Subtype (7 MCQ templates, Structured subparts, Rubric essay)
            let subtype = "Generic MCQ";
            if (isMcq) {
              if (tags.includes("generic_mcq")) subtype = "Generic MCQ";
              else if (tags.includes("assertion_reason") || (textLower.includes("assertion") && textLower.includes("reason"))) subtype = "Assertion–Reason";
              else if (tags.includes("five_statement_truth") || textLower.includes("following statements")) subtype = "Five Statement Truth";
              else if (tags.includes("matching_column") || (textLower.includes("column i") && textLower.includes("column ii"))) subtype = "Matching Column";
              else if (tags.includes("diagram_based") || textLower.includes("diagram") || textLower.includes("figure") || textLower.includes("image")) subtype = "Diagram Based";
              else if (tags.includes("experimental_procedure") || textLower.includes("experiment") || textLower.includes("procedure")) subtype = "Experimental Procedure";
              else if (tags.includes("combination_grid") || textLower.includes("table") || textLower.includes("q41") || textLower.includes("grid")) subtype = "Combination Grid (Q41–50)";
              else subtype = "Generic MCQ";
            } else if (isStructured) {
              subtype = "Structured Subparts (Part A)";
            } else if (isEssay) {
              subtype = "Rubric-based Essay (Part B)";
            }

            // 4. Curriculum Unit & Lesson
            let unitName = q.unit_title;
            if (!unitName && q.unit_id) {
              const matchedUnit = units.find(u => u.id === q.unit_id);
              if (matchedUnit) unitName = matchedUnit.title;
            }
            if (!unitName) {
              const unitTag = tags.find(t => t.toLowerCase().startsWith("unit_") || t.toLowerCase().startsWith("unit "));
              if (unitTag) unitName = unitTag.replace("_", " ").toUpperCase();
              else if (q.lesson_title) unitName = `Unit: ${q.lesson_title.split(":")[0]}`;
              else unitName = "Unit 01: Introduction to Biology";
            }

            const lessonName = q.lesson_title || "General Lesson";
            const qAnalytics = analytics[q.id];
            const isExpanded = expandedId === q.id;

            return (
              <div 
                key={q.id} 
                className="card" 
                style={{ 
                  cursor: "pointer", 
                  transition: "all 0.2s ease",
                  background: "var(--bg-card)"
                }}
                onClick={() => handleExpand(q.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    {/* Collapsed Card Preview Header */}
                    {!isExpanded ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ fontWeight: 700, fontSize: "1.02rem", color: "var(--text-primary)", lineHeight: 1.45, whiteSpace: "pre-line" }}>
                          {q.question_text}
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                            ▼ Click to expand full question tree, marking keys &amp; psychometrics
                          </span>
                          {q.question_type === "structured" && (
                            <span className="badge badge-primary" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                              40 pts · Structured Subparts Tree
                            </span>
                          )}
                          {q.question_type === "essay" && (
                            <span className="badge badge-info" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                              40 pts · Rubric-based Essay
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <QuestionPromptRenderer promptText={q.question_text} />
                      </div>
                    )}

                    {/* Detailed Metadata Grid */}
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", fontSize: "0.75rem", marginTop: "0.65rem", alignItems: "center" }}>
                      
                      {/* 1. Exam Paper Name */}
                      <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 600 }}>
                        <SvgIcon name="file-text" size={12} />
                        {examPaperName}
                      </span>

                      {/* 2. Paper Type */}
                      <span className="badge badge-info" style={{ fontWeight: 700 }}>
                        {paperType}
                      </span>

                      {/* 3. Category / Format */}
                      <span className="badge badge-primary" style={{ fontWeight: 700 }}>
                        {formatCategory}
                      </span>

                      {/* 4. Question Subtype */}
                      <span className="badge badge-secondary" style={{ fontWeight: 600 }}>
                        Type: {subtype}
                      </span>

                      {/* 5. Unit */}
                      <span className="badge badge-info" style={{ fontWeight: 600 }}>
                        {unitName}
                      </span>

                      {/* 6. Lesson */}
                      {lessonName && (
                        <span className="badge badge-secondary" style={{ fontWeight: 500 }}>
                          {lessonName}
                        </span>
                      )}

                      {/* 7. Cognitive Level */}
                      <span className={`badge ${getCognitiveBadge(q.cognitive_level)}`}>
                        {(q.cognitive_level || "Understand").toUpperCase()}
                      </span>

                      {/* 8. Difficulty */}
                      <span className="badge badge-secondary">
                        {(q.difficulty || "Medium").toUpperCase()}
                      </span>

                      {/* 9. Points */}
                      {q.default_points && (
                        <span className="badge badge-secondary" style={{ fontWeight: 600 }}>
                          {q.default_points} {q.default_points === 1 ? "pt" : "pts"}
                        </span>
                      )}

                      {/* 10. Status */}
                      <span className={`badge ${getStatusBadge(q.teacher_approval_status || q.ai_validation_status)}`}>
                        {(q.teacher_approval_status || q.ai_validation_status || "Approved").replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <button 
                    className="btn-icon btn-icon-danger"
                    style={{ padding: "0.35rem", flexShrink: 0 }}
                    title="Delete Question"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(q);
                    }}
                  >
                    <SvgIcon name="trash" size={16} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="animate-fade-in" style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)", width: "100%" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", width: "100%" }}>
                      
                      {/* Options (Choices 1 to 5) for MCQs */}
                      {q.question_type === "mcq" && q.options && Array.isArray(q.options) && q.options.length > 0 && typeof q.options[0] === "string" && (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <SvgIcon name="layers" size={14} /> Options &amp; Answer Keys (Choices 1 to 5)
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.5rem" }}>
                            {q.options.map((opt: string, i: number) => {
                              const isCorrect = String(q.correct_answer).trim().toLowerCase() === String(opt).trim().toLowerCase() 
                                || String(q.correct_answer).trim() === (i + 1).toString()
                                || String(q.correct_answer).trim().toUpperCase() === String.fromCharCode(65 + i);
                              return (
                                <div 
                                  key={i} 
                                  style={{
                                    padding: "0.6rem 0.8rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: isCorrect ? "rgba(16, 185, 129, 0.1)" : "var(--bg-primary)",
                                    border: isCorrect ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border)",
                                    fontSize: "0.85rem",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem"
                                  }}
                                >
                                  <span style={{ fontWeight: 700, color: isCorrect ? "var(--success)" : "var(--text-secondary)" }}>
                                    ({i + 1})
                                  </span>
                                  <span style={{ flex: 1 }}>{opt}</span>
                                  {isCorrect && (
                                    <span className="badge badge-success" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>Correct Key</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Structured Question Subparts Tree View */}
                      {q.question_type === "structured" && (
                        <div style={{ padding: "1.1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1.5px solid rgba(99, 102, 241, 0.25)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", paddingBottom: "0.6rem", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                              <SvgIcon name="layers" size={17} />
                              Authentic G.C.E. A/L Structured Question Sheet &amp; Subparts
                            </div>
                            <span className="badge badge-info" style={{ fontWeight: 700 }}>40 Marks (Paper II Part A)</span>
                          </div>

                          {Array.isArray(q.options) && q.options.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                              {q.options.map((secNode: any, sIdx: number) => {
                                const secLabel = secNode.label || String.fromCharCode(65 + sIdx);
                                const children = secNode.children || [];
                                return (
                                  <div key={secNode.id || sIdx} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0.75rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", borderLeft: "4px solid var(--accent-primary)" }}>
                                      <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                        Part {secLabel} {secNode.prompt ? `— ${secNode.prompt}` : ""}
                                      </span>
                                      {secNode.points && (
                                        <span className="badge badge-secondary" style={{ fontWeight: 700 }}>
                                          [{secNode.points} pts]
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", paddingLeft: "0.75rem" }}>
                                      {children.map((child: any, cIdx: number) => (
                                        <div key={child.id || cIdx} style={{ paddingLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.4rem", borderLeft: "2px solid rgba(99, 102, 241, 0.3)" }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                                            <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                                              <strong style={{ color: "var(--accent-primary)", marginRight: "0.45rem", fontWeight: 800 }}>
                                                ({cIdx + 1})
                                              </strong>
                                              <span>{child.prompt}</span>
                                            </div>
                                            {child.points && (
                                              <span className="badge badge-secondary" style={{ fontSize: "0.75rem", padding: "0.15rem 0.45rem", flexShrink: 0, fontWeight: 700 }}>
                                                {child.points} {child.points === 1 ? "pt" : "pts"}
                                              </span>
                                            )}
                                          </div>

                                          {child.model_answer && (
                                            <div style={{ marginTop: "0.25rem", padding: "0.45rem 0.75rem", background: "rgba(16, 185, 129, 0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "0.82rem", color: "var(--text-primary)" }}>
                                              <strong style={{ color: "var(--success)", marginRight: "0.35rem" }}>Expected Marking Key:</strong>
                                              <span>{child.model_answer}</span>
                                            </div>
                                          )}

                                          {/* Dotted lines for student answer */}
                                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "0.2rem" }}>
                                            {Array.from({ length: Math.min(3, Math.max(1, child.lines || child.points || 2)) }).map((_, lIdx) => (
                                              <div key={lIdx} style={{ borderBottom: "1px dotted var(--border)", height: "14px" }} />
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                              {q.question_text}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Essay Question Rubric & Criteria View */}
                      {q.question_type === "essay" && (
                        <div style={{ padding: "1.1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1.5px solid rgba(99, 102, 241, 0.25)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", paddingBottom: "0.6rem", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                              <SvgIcon name="file-text" size={17} />
                              G.C.E. A/L Essay Paper II Part B Marking Rubric &amp; Checklist
                            </div>
                            <span className="badge badge-info" style={{ fontWeight: 700 }}>40 Marks (Paper II Part B)</span>
                          </div>

                          {/* Render Checklist Criteria */}
                          {q.options && (typeof q.options === "object" || Array.isArray(q.options)) ? (() => {
                            const essayOpt = q.options as any;
                            const checklistItems = essayOpt?.checklist || (Array.isArray(essayOpt) ? essayOpt : []);
                            if (!checklistItems || checklistItems.length === 0) return null;
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                  <SvgIcon name="check-circle" size={14} style={{ color: "var(--success)" }} />
                                  Itemized Rubric Checklist (Award 4.0 Points per fully satisfied criterion):
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.6rem" }}>
                                  {checklistItems.map((item: any, idx: number) => (
                                    <div key={item.item_number || idx} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: "0.55rem" }}>
                                      <span className="badge badge-primary" style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", flexShrink: 0, fontWeight: 700 }}>
                                        #{item.item_number || idx + 1}
                                      </span>
                                      <div style={{ flex: 1, fontSize: "0.84rem", color: "var(--text-primary)", lineHeight: 1.45 }}>
                                        {item.criterion || (typeof item === "string" ? item : JSON.stringify(item))}
                                      </div>
                                      <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--accent-primary)", flexShrink: 0 }}>
                                        {item.points || 4.0} pts
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })() : null}

                        </div>
                      )}

                      {/* Explanation / Solution */}
                      {q.explanation && (
                        <div style={{ padding: "0.85rem 1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.82rem", color: "var(--accent-primary)", marginBottom: "0.35rem" }}>
                            <SvgIcon name="check-circle" size={14} />
                            Official Marking Scheme &amp; Explanation:
                          </div>
                          <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{q.explanation}</div>
                        </div>
                      )}


                      {/* Item Psychometrics & Student Performance Panel (Clean Card Styling) */}
                      <div style={{ padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <SvgIcon name="bar-chart" size={15} style={{ color: "var(--accent-primary)" }} />
                            Student Item Analytics &amp; Distractor Distribution
                          </div>
                          {loadingAnalytics === q.id && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Loading analytics...</span>
                          )}
                        </div>

                        {qAnalytics ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem" }}>
                              <div style={{ background: "var(--bg-card)", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Attempts</div>
                                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>{qAnalytics.total_attempts}</div>
                              </div>
                              <div style={{ background: "var(--bg-card)", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Item Facility / Success</div>
                                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: qAnalytics.success_rate >= 70 ? "#10B981" : qAnalytics.success_rate >= 40 ? "#3B82F6" : "#EF4444" }}>
                                  {qAnalytics.success_rate}%
                                </div>
                              </div>
                              <div style={{ background: "var(--bg-card)", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Observed Difficulty</div>
                                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                                  {qAnalytics.observed_difficulty.toUpperCase()}
                                </div>
                              </div>
                            </div>

                            {/* Distractor Frequency Breakdown */}
                            {qAnalytics.distractor_distribution && Object.keys(qAnalytics.distractor_distribution).length > 0 && (
                              <div style={{ marginTop: "0.35rem" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                                  Candidate Selection Frequency:
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "0.4rem" }}>
                                  {Object.entries(qAnalytics.distractor_distribution).map(([optKey, pctVal]) => (
                                    <div key={optKey} style={{ background: "var(--bg-card)", padding: "0.4rem 0.6rem", borderRadius: "4px", border: "1px solid var(--border)", fontSize: "0.75rem" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{optKey}</span>
                                        <span style={{ color: "var(--text-muted)" }}>{pctVal}%</span>
                                      </div>
                                      <div style={{ width: "100%", height: "4px", background: "var(--bg-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                                        <div style={{ width: `${pctVal}%`, height: "100%", background: "var(--accent-primary)", borderRadius: "2px" }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "0.5rem 0" }}>
                            Click to calculate item psychometrics from student examination answers
                          </div>
                        )}
                      </div>

                      {/* Actions bar for single item */}
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Link
                          href={`/dashboard/teacher/al-exams/create`}
                          className="btn btn-secondary btn-sm"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SvgIcon name="plus" size={14} />
                          Use in New Exam
                        </Link>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleImproveClick(q.id);
                          }}
                        >
                          <SvgIcon name="sparkle" size={14} style={{ marginRight: "0.3rem" }} />
                          Improve with AI
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Question"
          message="Are you sure you want to delete this question? This action cannot be undone."
          onConfirm={handleDeleteQuestion}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          danger={true}
        />
      )}
    </div>
  );
}
