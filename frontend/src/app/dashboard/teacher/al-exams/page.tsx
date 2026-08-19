"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api, { ALExam, Course } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ALExamPaperCard, { ALExamPaperCardSkeleton } from "@/components/al-exams/ALExamPaperCard";
import MCQQuestionPaperRenderer from "@/components/al-exams/MCQQuestionPaperRenderer";
import StructuredQuestionPaperRenderer from "@/components/al-exams/StructuredQuestionPaperRenderer";
import EssayQuestionPaperRenderer from "@/components/al-exams/EssayQuestionPaperRenderer";
import { normalizeLegacyEssayData } from "@/lib/alEssayTreeUtils";

function TeacherExamEngineContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialType = searchParams.get("type") || "all";

  const [exams, setExams] = useState<ALExam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const { addToast } = useToast();

  // Search & Filter Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "draft" | "published">("all");
  const [typeFilter, setTypeFilter] = useState<string>(initialType);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");

  // Modal States
  const [previewExam, setPreviewExam] = useState<ALExam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ALExam | null>(null);
  const [deleteBankedQuestions, setDeleteBankedQuestions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeMenuExamId, setActiveMenuExamId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  // Policy Settings Modal State
  const [editSettingsExam, setEditSettingsExam] = useState<ALExam | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTimeLimit, setEditTimeLimit] = useState(120);
  const [editMaxAttempts, setEditMaxAttempts] = useState(1);
  const [editDifficultyPolicy, setEditDifficultyPolicy] = useState("mixed");
  const [editAvailableFrom, setEditAvailableFrom] = useState("");
  const [editAvailableUntil, setEditAvailableUntil] = useState("");
  const [editShowResult, setEditShowResult] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleOpenEditSettings = (exam: ALExam) => {
    setEditSettingsExam(exam);
    setEditTitle(exam.title);
    setEditDescription(exam.description || "");
    setEditInstructions(exam.instructions || "");
    setEditTimeLimit(exam.time_limit_minutes || 120);
    setEditMaxAttempts(exam.max_attempts || 1);
    setEditDifficultyPolicy(exam.difficulty_policy || "mixed");
    setEditAvailableFrom(exam.available_from ? exam.available_from.slice(0, 16) : "");
    setEditAvailableUntil(exam.available_until ? exam.available_until.slice(0, 16) : "");
    setEditShowResult(exam.show_result_immediately ?? true);
  };

  const handleSaveAssessmentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSettingsExam) return;
    if (editTimeLimit <= 0) {
      addToast("Duration must be greater than 0 minutes.", "error");
      return;
    }
    if (editMaxAttempts < 1) {
      addToast("Maximum attempts must be at least 1.", "error");
      return;
    }
    if (editAvailableFrom && editAvailableUntil && editAvailableUntil < editAvailableFrom) {
      addToast("End time must be after start time.", "error");
      return;
    }

    setSavingSettings(true);
    try {
      const updated = await api.updateALExam(editSettingsExam.id, {
        title: editTitle,
        description: editDescription || undefined,
        instructions: editInstructions || undefined,
        time_limit_minutes: editTimeLimit,
        max_attempts: editMaxAttempts,
        difficulty_policy: editDifficultyPolicy,
        available_from: editAvailableFrom ? new Date(editAvailableFrom).toISOString() : undefined,
        available_until: editAvailableUntil ? new Date(editAvailableUntil).toISOString() : undefined,
        show_result_immediately: editShowResult,
      });
      addToast(`Assessment policy updated for "${updated.title}"!`, "success");
      setExams(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
      setEditSettingsExam(null);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to update assessment settings.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    fetchExams();
    api.listCourses().then((data) => setCourses(data || [])).catch(console.error);
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      setErrorState(null);
      const data = await api.listALExams();
      setExams(data || []);
    } catch (err: any) {
      console.error(err);
      setErrorState(err.message || "Failed to load examination papers.");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateExam = async (exam: ALExam) => {
    setDuplicatingId(exam.id);
    try {
      const duplicated = await api.duplicateALExam(exam.id);
      addToast(`Created duplicate draft: "${duplicated.title}"`, "success");
      await fetchExams();
      router.push(`/dashboard/teacher/al-exams/create?exam_id=${duplicated.id}`);
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to duplicate assessment.", "error");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const targetTitle = deleteTarget.title;
    setDeleting(true);
    try {
      await api.deleteALExam(targetId, deleteBankedQuestions);
      if (deleteBankedQuestions) {
        addToast(`Assessment "${targetTitle}" and its questions were permanently removed from the paper library and Question Bank.`, "warning");
      } else {
        addToast(`Assessment "${targetTitle}" removed from paper library. Questions remain preserved in Question Bank.`, "info");
      }
      setExams((prev) => prev.filter((e) => e.id !== targetId));
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to delete examination paper.", "error");
    } finally {
      setDeleteTarget(null);
      setDeleting(false);
      setDeleteBankedQuestions(false);
    }
  };

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      // Status Tab
      if (statusTab === "draft" && e.is_published) return false;
      if (statusTab === "published" && !e.is_published) return false;

      // Type Filter
      if (typeFilter !== "all" && e.exam_type !== typeFilter) return false;

      // Course Filter
      if (typeof selectedCourseFilter === "number" && e.course_id !== selectedCourseFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchDesc = (e.description || "").toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });
  }, [exams, statusTab, typeFilter, selectedCourseFilter, searchQuery, sortBy]);

  const getBadgeInfo = (type: string) => {
    if (type === "paper_1_mcq") return { label: "Paper I — 50 MCQ", color: "badge-blue", icon: "clipboard" as const };
    if (type === "paper_2_structured") return { label: "Paper II-A — Structured", color: "badge-purple", icon: "layers" as const };
    if (type === "paper_2_essay") return { label: "Paper II-B — Essay", color: "badge-amber", icon: "folder" as const };
    return { label: "Full A/L Paper", color: "badge-green", icon: "award" as const };
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* ─── Standardized Lumora Header Banner ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <SvgIcon name="award" size={24} /> EXAM ENGINE
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
            Assessment Creation &amp; Examination Management
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/dashboard/teacher/al-exams/create" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 1.25rem", fontSize: "0.9rem" }}>
            <SvgIcon name="plus" size={18} /> Create New Assessment
          </Link>
        </div>
      </div>

      {/* ─── Search & Status Controls Bar ─── */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Status Tabs */}
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {[
              { id: "all", label: "All Papers", count: exams.length },
              { id: "draft", label: "Drafts", count: exams.filter(e => !e.is_published).length },
              { id: "published", label: "Published", count: exams.filter(e => e.is_published).length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id as any)}
                className={`btn ${statusTab === tab.id ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem" }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Search, Type Filter & Sorting */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
            <input
              type="text"
              className="input"
              style={{ maxWidth: "240px", fontSize: "0.85rem" }}
              placeholder="Search paper title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="select"
              style={{ maxWidth: "190px", fontSize: "0.85rem" }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Paper Types</option>
              <option value="paper_1_mcq">Paper I — MCQ</option>
              <option value="paper_2_structured">Paper II-A — Structured</option>
              <option value="paper_2_essay">Paper II-B — Essay</option>
            </select>

            <select
              className="select"
              style={{ maxWidth: "160px", fontSize: "0.85rem" }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="title">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Exam Grid Container ─── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "1.5rem" }}>
          <ALExamPaperCardSkeleton />
          <ALExamPaperCardSkeleton />
          <ALExamPaperCardSkeleton />
        </div>
      ) : errorState ? (
        <div
          className="card"
          style={{
            padding: "3.5rem 2rem",
            textAlign: "center",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <SvgIcon name="alert-triangle" size={28} style={{ color: "var(--danger)" }} />
          </div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
            Unable to Load Examination Papers
          </h3>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "520px", margin: "0 auto 1.5rem", lineHeight: 1.5 }}>
            {errorState}
          </p>
          <button className="btn btn-primary" onClick={fetchExams} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="refresh" size={16} /> Retry Connection
          </button>
        </div>
      ) : filteredExams.length === 0 ? (
        <div
          style={{
            padding: "3.5rem 2rem",
            background: "var(--bg-card)",
            border: "2px dashed var(--border)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(37, 99, 235, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <SvgIcon name="file-text" size={32} style={{ color: "var(--accent-primary)" }} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
            No Assessment Papers Found
          </h3>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "450px", margin: "0 auto 1.5rem", lineHeight: 1.5 }}>
            Use the Assessment Assembly Workspace to assemble full A/L Papers, MCQ speed drills, or Paper II essay rubrics.
          </p>
          <Link href="/dashboard/teacher/al-exams/create" className="btn btn-primary">
            Assemble First Exam Paper
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "1.5rem" }}>
          {filteredExams.map((exam) => (
            <ALExamPaperCard
              key={exam.id}
              exam={exam}
              courses={courses}
              onPreview={setPreviewExam}
              onEditSettings={handleOpenEditSettings}
              onDelete={setDeleteTarget}
              onDuplicate={handleDuplicateExam}
              onToast={addToast}
            />
          ))}
        </div>
      )}

      {/* ─── ASSESSMENT POLICY SETTINGS MODAL ─── */}
      {editSettingsExam && (
        <Modal title={`Edit Assessment Policy: ${editSettingsExam.title}`} onClose={() => setEditSettingsExam(null)} maxWidth="700px">
          <form onSubmit={handleSaveAssessmentSettings} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Assessment Title *</label>
              <input type="text" className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Duration (Minutes) *</label>
                <input type="number" min="1" className="input" value={editTimeLimit} onChange={(e) => setEditTimeLimit(parseInt(e.target.value, 10) || 120)} required />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Maximum Attempts *</label>
                <input type="number" min="1" className="input" value={editMaxAttempts} onChange={(e) => setEditMaxAttempts(parseInt(e.target.value, 10) || 1)} required />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Difficulty Policy</label>
                <select className="select" value={editDifficultyPolicy} onChange={(e) => setEditDifficultyPolicy(e.target.value)}>
                  <option value="mixed">Mixed (20% Easy / 60% Med / 20% Hard)</option>
                  <option value="easy">Easy Only</option>
                  <option value="medium">Medium Only</option>
                  <option value="hard">Hard Only</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Result Visibility</label>
                <select className="select" value={editShowResult ? "yes" : "no"} onChange={(e) => setEditShowResult(e.target.value === "yes")}>
                  <option value="yes">Show Result Immediately Upon Submission</option>
                  <option value="no">Hide Results Until Manual Release</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Available From</label>
                <input type="datetime-local" className="input" value={editAvailableFrom} onChange={(e) => setEditAvailableFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Available Until</label>
                <input type="datetime-local" className="input" value={editAvailableUntil} onChange={(e) => setEditAvailableUntil(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>Description &amp; Instructions</label>
              <textarea rows={3} className="textarea" value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} placeholder="Assessment guidelines, permitted materials, or candidate instructions..." />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditSettingsExam(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={savingSettings}>{savingSettings ? "Saving Settings..." : "Save Policy Changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── High-Fidelity Paper Preview Modal ─── */}
      {previewExam && (
        <Modal title={`Examination Paper Preview: ${previewExam.title}`} onClose={() => setPreviewExam(null)} maxWidth="950px">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Examination Official Header */}
            <div style={{ textAlign: "center", borderBottom: "2px solid var(--border)", paddingBottom: "1.25rem", background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "var(--accent-primary)", marginBottom: "0.25rem" }}>
                National Evaluation Standards &bull; Sri Lanka G.C.E. Advanced Level
              </div>
              <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: "0.25rem 0", color: "var(--text-primary)" }}>
                {previewExam.title}
              </h2>
              <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <span><strong>Type:</strong> {previewExam.exam_type?.toUpperCase()}</span>
                <span>&bull;</span>
                <span><strong>Time Allowed:</strong> {previewExam.time_limit_minutes} Minutes</span>
                <span>&bull;</span>
                <span><strong>Total Items:</strong> {previewExam.questions?.length || 0} Questions</span>
              </div>
            </div>

            {!previewExam.questions || previewExam.questions.length === 0 ? (
              <div className="empty-state" style={{ padding: "3rem", textAlign: "center" }}>
                <SvgIcon name="file-text" size={40} style={{ color: "var(--text-muted)", margin: "0 auto 0.75rem" }} />
                <h4 style={{ margin: "0 0 0.5rem 0" }}>No Questions Attached</h4>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  This assessment draft does not have questions attached yet. Open the paper in Assembly Studio to add or generate items.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {previewExam.questions.map((q, idx) => {
                  const isPartBTransition = idx === 40 && previewExam.questions && previewExam.questions.length === 50;
                  const templateType = (q.template_type || "generic_mcq").toLowerCase();
                  const isStructured = templateType === "structured_subparts" || Boolean(q.structured_subparts_json && q.structured_subparts_json.length > 0);
                  const isEssay = templateType === "essay_rubric" || templateType === "essay" || Boolean(q.essay_checklist_json);

                  return (
                    <React.Fragment key={q.id || idx}>
                      {/* Section Transition Header for Standard 50Q Paper I */}
                      {idx === 0 && previewExam.questions && previewExam.questions.length === 50 && (
                        <div style={{ padding: "0.6rem 1rem", background: "rgba(99, 102, 241, 0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                          PART A &mdash; QUESTIONS 1 TO 40 (Single-Response Questions)
                        </div>
                      )}

                      {isPartBTransition && (
                        <div style={{ padding: "0.6rem 1rem", background: "rgba(99, 102, 241, 0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)", marginTop: "0.75rem" }}>
                          PART B &mdash; QUESTIONS 41 TO 50 (Multi-Response & Combination Grids)
                        </div>
                      )}

                      {/* Question Rendering by Family */}
                      {isStructured ? (
                        <StructuredQuestionPaperRenderer
                          questionNumber={q.question_number || idx + 1}
                          stemText={q.stem_text}
                          parts={q.structured_subparts_json || []}
                          diagramUrl={q.diagram_url}
                          points={q.points || 40}
                        />
                      ) : isEssay ? (
                        (() => {
                          const normalized = normalizeLegacyEssayData(q.essay_checklist_json, q.stem_text, q.points);
                          return (
                            <EssayQuestionPaperRenderer
                              questionNumber={q.question_number || idx + 1}
                              stemText={q.stem_text}
                              points={q.points || 40}
                              structureType={normalized.structure_format}
                              instruction={normalized.instruction}
                              subparts={normalized.subparts}
                              criteria={normalized.criteria}
                              diagramUrl={q.diagram_url}
                              showTeacherGuide={true}
                            />
                          );
                        })()
                      ) : (
                        <MCQQuestionPaperRenderer
                          question={q}
                          isTeacherPreview={true}
                          showTeacherMetadata={true}
                          showCorrectAnswer={true}
                          disabled={true}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <div style={{ textAlign: "right", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <button className="btn btn-secondary" onClick={() => setPreviewExam(null)}>Close Paper Preview</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Delete Confirmation Modal with Question Bank Options ─── */}
      {deleteTarget && (
        <Modal
          title="Delete Assessment Paper"
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          maxWidth="560px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.25rem 0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", padding: "0.85rem 1rem", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "var(--radius-md)" }}>
              <SvgIcon name="alert-triangle" size={24} style={{ color: "var(--error)", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <h4 style={{ margin: "0 0 0.25rem", color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 700 }}>
                  Confirm Deletion of &ldquo;{deleteTarget.title}&rdquo;
                </h4>
                <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                  You are about to delete this {deleteTarget.exam_type?.toUpperCase()} assessment ({deleteTarget.questions?.length || 0} questions).
                </p>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.6rem" }}>
                What would you like to do with the questions from this paper?
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {/* Option 1: Keep questions in Question Bank (Recommended) */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: !deleteBankedQuestions ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: !deleteBankedQuestions ? "rgba(37, 99, 235, 0.04)" : "var(--bg-card)",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="radio"
                    name="qbAction"
                    checked={!deleteBankedQuestions}
                    onChange={() => setDeleteBankedQuestions(false)}
                    style={{ marginTop: "3px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                      Keep Questions in Question Bank (Recommended)
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>
                      Deletes this assessment paper container, but preserves all questions in your Question Bank for future exams and assignments.
                    </div>
                  </div>
                </label>

                {/* Option 2: Delete questions from Question Bank */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: deleteBankedQuestions ? "2px solid var(--error)" : "1px solid var(--border)",
                    background: deleteBankedQuestions ? "rgba(239, 68, 68, 0.04)" : "var(--bg-card)",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="radio"
                    name="qbAction"
                    checked={deleteBankedQuestions}
                    onChange={() => setDeleteBankedQuestions(true)}
                    style={{ marginTop: "3px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--error)" }}>
                      Permanently Delete Associated Questions
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>
                      Deletes this assessment paper AND permanently deletes all its associated questions from your Question Bank.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.85rem", marginTop: "0.25rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={handleDeleteExam}
                style={{
                  background: "var(--error)",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                {deleting ? "Deleting..." : deleteBankedQuestions ? "Delete Paper & Questions" : "Delete Paper (Keep Questions)"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function TeacherExamEnginePage() {
  return (
    <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}>
      <TeacherExamEngineContent />
    </Suspense>
  );
}
