"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api, {
  ALExam,
  ALStudentSubmission,
  ExamFoundationOverview,
  MCQExamAnalyticsReport,
  MCQItemMetric,
  StructuredExamAnalyticsReport,
  StructuredSubpartMetric,
  EssayExamAnalyticsReport,
  DataQualityReport,
} from "@/lib/api";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";

type AnalyticsTab = "overview" | "mcq" | "structured" | "essay" | "cognitive" | "students" | "data_quality";

export default function TeacherAssessmentAnalyticsPage() {
  return (
    <Suspense fallback={<div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>}>
      <TeacherAssessmentAnalyticsContent />
    </Suspense>
  );
}

function TeacherAssessmentAnalyticsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();

  const examIdParam = searchParams.get("exam_id");
  const [examId, setExamId] = useState<number | null>(examIdParam ? parseInt(examIdParam, 10) : null);
  const [allExams, setAllExams] = useState<ALExam[]>([]);
  const [currentExam, setCurrentExam] = useState<ALExam | null>(null);

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [tabLoading, setTabLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data states
  const [foundationData, setFoundationData] = useState<ExamFoundationOverview | null>(null);
  const [mcqReport, setMcqReport] = useState<MCQExamAnalyticsReport | null>(null);
  const [structuredReport, setStructuredReport] = useState<StructuredExamAnalyticsReport | null>(null);
  const [essayReport, setEssayReport] = useState<EssayExamAnalyticsReport | null>(null);
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);
  const [studentSubmissions, setStudentSubmissions] = useState<ALStudentSubmission[]>([]);

  // Filters & Question Detail Modal
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [cognitiveFilter, setCognitiveFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [attentionFilter, setAttentionFilter] = useState<"all" | "high_attention" | "review" | "on_track" | "no_data">("all");
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<MCQItemMetric | null>(null);

  // Student table sorting
  const [studentSortBy, setStudentSortBy] = useState<"score" | "percentage" | "name" | "status">("score");
  const [studentSortOrder, setStudentSortOrder] = useState<"asc" | "desc">("desc");

  // Load list of exams
  useEffect(() => {
    api.listALExams()
      .then((exams) => {
        setAllExams(exams);
        if (!examId && exams.length > 0) {
          setExamId(exams[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load exams list:", err);
      });
  }, [examId]);

  // Load analytics when examId changes
  useEffect(() => {
    if (!examId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    Promise.all([
      api.getALExam(examId).catch(() => null),
      api.getExamFoundationAnalytics(examId).catch(() => null),
      api.getMCQExamAnalytics(examId).catch(() => null),
      api.getStructuredExamAnalytics(examId).catch(() => null),
      api.getEssayExamAnalytics(examId).catch(() => null),
      api.getExamDataQuality(examId).catch(() => null),
      api.listALExamSubmissions(examId).catch(() => []),
    ])
      .then(([examRes, fdRes, mcqRes, strRes, esyRes, dqRes, subsRes]) => {
        setCurrentExam(examRes);
        setFoundationData(fdRes?.data || null);
        setMcqReport(mcqRes?.data || null);
        setStructuredReport(strRes?.data || null);
        setEssayReport(esyRes?.data || null);
        setDataQualityReport(dqRes?.data || null);
        setStudentSubmissions(subsRes || []);

        // Default to appropriate tab if exam has only structured or essay
        if (examRes) {
          if (examRes.exam_type === "paper_2_structured" && activeTab === "mcq") {
            setActiveTab("structured");
          } else if (examRes.exam_type === "paper_2_essay" && activeTab === "mcq") {
            setActiveTab("essay");
          }
        }
      })
      .catch((err) => {
        console.error("Error loading exam analytics:", err);
        setErrorMessage("Assessment analytics could not be loaded. Your assessment data is safe. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [examId]);

  // Handler to switch exam
  const handleExamChange = (newExamId: number) => {
    setExamId(newExamId);
    router.push(`/dashboard/teacher/al-exams/analytics?exam_id=${newExamId}`);
  };

  // Helper for Attention Indicator
  const getQuestionAttentionStatus = (q: MCQItemMetric): { status: "HIGH ATTENTION" | "REVIEW" | "ON TRACK" | "NO DATA"; reason: string; badgeClass: string } => {
    if (!q.total_attempts || q.total_attempts === 0) {
      return { status: "NO DATA", reason: "No attempts yet", badgeClass: "badge-secondary" };
    }
    const p = q.difficulty_index_p ?? 1.0;
    const d = q.discrimination.valid ? (q.discrimination.value ?? 0.0) : 0.0;
    const unansweredPct = (q.unanswered_count / q.total_attempts) * 100;

    if (p < 0.25 || (q.discrimination.valid && d < 0.0) || unansweredPct > 40) {
      return { status: "HIGH ATTENTION", reason: p < 0.25 ? "Extremely low success rate" : d < 0.0 ? "Negative discrimination index" : "High unanswered rate", badgeClass: "badge-error" };
    }
    if (p < 0.40 || p > 0.90 || (q.discrimination.valid && d < 0.20) || q.option_distribution.some(o => o.is_non_functional_distractor)) {
      return { status: "REVIEW", reason: p < 0.40 ? "Difficult item" : p > 0.90 ? "High mastery / low discrimination" : "Check distractor engagement", badgeClass: "badge-warning" };
    }
    return { status: "ON TRACK", reason: "Standard response curve", badgeClass: "badge-success" };
  };

  // Helper for Difficulty Band Interpretation
  const getDifficultyBand = (pVal?: number | null) => {
    if (pVal == null) return { label: "No Data", color: "#64748B", bg: "rgba(100,116,139,0.12)" };
    if (pVal < 0.30) return { label: "Very Difficult", color: "#DC2626", bg: "rgba(220,38,38,0.12)" };
    if (pVal < 0.50) return { label: "Difficult", color: "#D97706", bg: "rgba(217,119,6,0.12)" };
    if (pVal < 0.70) return { label: "Moderate", color: "#2563EB", bg: "rgba(37,99,235,0.12)" };
    if (pVal < 0.85) return { label: "Easy", color: "#059669", bg: "rgba(5,150,105,0.12)" };
    return { label: "Very Easy", color: "#10B981", bg: "rgba(16,185,129,0.12)" };
  };

  // Filtered MCQ Questions
  const filteredMCQQuestions = useMemo(() => {
    if (!mcqReport?.questions) return [];
    return mcqReport.questions.filter((q) => {
      if (searchQuery.trim()) {
        const qNumMatch = q.question_number.toString() === searchQuery.trim();
        const stemMatch = q.stem_summary.toLowerCase().includes(searchQuery.toLowerCase());
        if (!qNumMatch && !stemMatch) return false;
      }
      if (typeFilter !== "all" && q.template_type.toLowerCase() !== typeFilter.toLowerCase()) return false;
      if (cognitiveFilter !== "all" && q.cognitive_level.toLowerCase() !== cognitiveFilter.toLowerCase()) return false;
      if (difficultyFilter !== "all" && q.difficulty.toLowerCase() !== difficultyFilter.toLowerCase()) return false;
      if (attentionFilter !== "all") {
        const att = getQuestionAttentionStatus(q);
        if (attentionFilter === "high_attention" && att.status !== "HIGH ATTENTION") return false;
        if (attentionFilter === "review" && att.status !== "REVIEW") return false;
        if (attentionFilter === "on_track" && att.status !== "ON TRACK") return false;
        if (attentionFilter === "no_data" && att.status !== "NO DATA") return false;
      }
      return true;
    });
  }, [mcqReport, searchQuery, typeFilter, cognitiveFilter, difficultyFilter, attentionFilter]);

  // Sorted Student Submissions
  const sortedStudents = useMemo(() => {
    const subs = [...studentSubmissions];
    subs.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      if (studentSortBy === "score") {
        valA = a.scaled_score ?? a.raw_score ?? 0;
        valB = b.scaled_score ?? b.raw_score ?? 0;
      } else if (studentSortBy === "percentage") {
        valA = a.percentage ?? 0;
        valB = b.percentage ?? 0;
      } else if (studentSortBy === "name") {
        valA = (a.student_name || `Student ${a.student_id}`).toLowerCase();
        valB = (b.student_name || `Student ${b.student_id}`).toLowerCase();
      } else if (studentSortBy === "status") {
        valA = a.status || "";
        valB = b.status || "";
      }
      if (valA < valB) return studentSortOrder === "asc" ? -1 : 1;
      if (valA > valB) return studentSortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return subs;
  }, [studentSubmissions, studentSortBy, studentSortOrder]);

  if (loading) {
    return (
      <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 1rem 3rem 1rem", boxSizing: "border-box" }}>
        <div className="page-loader" style={{ minHeight: "50vh" }}>
          <div className="spinner" />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading assessment analytics workstation...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !currentExam) {
    return (
      <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "2rem 1rem", boxSizing: "border-box" }}>
        <div className="card" style={{ padding: "2rem", textAlign: "center", border: "1px solid var(--border-subtle)" }}>
          <span style={{ display: "inline-flex", padding: "1rem", borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", marginBottom: "1rem" }}>
            <SvgIcon name="alert-triangle" size={32} />
          </span>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>Analytics Unavailable</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto 1.5rem auto" }}>
            {errorMessage || "The requested examination could not be found or you do not have permission to view its analytics."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Try Again</button>
            <Link href="/dashboard/teacher/al-exams" className="btn btn-secondary">Return to Assessments</Link>
          </div>
        </div>
      </div>
    );
  }

  const hasSubmissions = (foundationData?.total_submissions || 0) > 0;
  const isMcqExam = currentExam.exam_type === "paper_1_mcq";
  const isStructuredExam = currentExam.exam_type === "paper_2_structured";
  const isEssayExam = currentExam.exam_type === "paper_2_essay";

  return (
    <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 0.5rem 3rem 0.5rem", boxSizing: "border-box", overflowX: "hidden" }}>
      {/* ──────────────── BREADCRUMB & HEADER ──────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
          <Link href="/dashboard/teacher" style={{ color: "inherit", textDecoration: "none" }}>Dashboard</Link>
          <span>/</span>
          <Link href="/dashboard/teacher/al-exams" style={{ color: "inherit", textDecoration: "none" }}>A/L Examinations</Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Assessment Analytics</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>{currentExam.title}</h1>
              <span className={`badge ${currentExam.exam_type === "paper_1_mcq" ? "badge-blue" : currentExam.exam_type === "paper_2_structured" ? "badge-purple" : "badge-amber"}`} style={{ fontSize: "0.725rem", fontWeight: 700, padding: "0.2rem 0.5rem" }}>
                {currentExam.exam_type === "paper_1_mcq" ? "Paper I — MCQ" : currentExam.exam_type === "paper_2_structured" ? "Paper II-A — Structured" : "Paper II-B — Essay"}
              </span>
              <span className={`badge ${currentExam.is_published ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.725rem" }}>
                {currentExam.is_published ? "Published" : "Draft"}
              </span>
            </div>
            <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "3px 0 0 0" }}>
              Psychometric item diagnostics, score distribution curves, structured mark loss hierarchy, and student response intelligence.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            {allExams.length > 1 && (
              <select
                value={examId || ""}
                onChange={(e) => handleExamChange(Number(e.target.value))}
                className="form-select"
                style={{ fontSize: "0.85rem", minWidth: "200px", height: "36px" }}
              >
                {allExams.map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            )}

            <Link
              href={`/dashboard/teacher/al-exams/create?exam_id=${currentExam.id}`}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", height: "36px" }}
            >
              <SvgIcon name="edit" size={14} /> Open Paper
            </Link>

            <Link
              href={`/dashboard/teacher/al-exams/marking`}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", height: "36px" }}
            >
              <SvgIcon name="check-circle" size={14} /> Marking Studio
            </Link>
          </div>
        </div>
      </div>

      {/* ──────────────── WORKSTATION NAVIGATION TABS ──────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "1.5rem", gap: "0.4rem", flexWrap: "wrap" }}>
        {([
          { key: "overview" as AnalyticsTab, label: "Overview & Score Curves", icon: "bar-chart" as IconName, count: foundationData?.total_submissions, alert: undefined, hidden: false },
          { key: "mcq" as AnalyticsTab, label: `MCQ Item Analysis (${mcqReport?.questions?.length || 0})`, icon: "check-circle" as IconName, hidden: !isMcqExam, count: undefined, alert: undefined },
          { key: "structured" as AnalyticsTab, label: `Structured Question Analysis (${structuredReport?.questions?.length || 0})`, icon: "layers" as IconName, hidden: !isStructuredExam, count: undefined, alert: undefined },
          { key: "essay" as AnalyticsTab, label: `Essay Criteria Performance (${essayReport?.questions?.length || 0})`, icon: "file-text" as IconName, hidden: !isEssayExam, count: undefined, alert: undefined },
          { key: "cognitive" as AnalyticsTab, label: "Cognitive & Taxonomy", icon: "sparkles" as IconName, hidden: !isMcqExam, count: undefined, alert: undefined },
          { key: "students" as AnalyticsTab, label: `Student Roster (${studentSubmissions.length})`, icon: "users" as IconName, count: undefined, alert: undefined, hidden: false },
        ] as Array<{ key: AnalyticsTab; label: string; icon: IconName; count?: number; hidden?: boolean; alert?: number }>).filter(t => !t.hidden).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.55rem 0.95rem",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.825rem",
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "var(--accent-primary)" : "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            <SvgIcon name={tab.icon} size={15} />
            {tab.label}
            {tab.alert != null && tab.alert > 0 && (
              <span className="badge badge-error" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                {tab.alert} issues
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ──────────────── TAB CONTENT ──────────────── */}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW & SCORE DISTRIBUTION
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary KPI Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem" }}>
            {[
              { label: "Total Submissions", value: foundationData?.total_submissions || 0, icon: "users" as IconName, color: "#2563EB", sub: `${foundationData?.teacher_verified_count || 0} teacher verified` },
              { label: "Class Average Score", value: foundationData?.average_percentage != null ? `${foundationData.average_percentage}%` : "—", icon: "award" as IconName, color: "#10B981", sub: `Raw: ${foundationData?.average_raw_score ?? 0} pts` },
              { label: "Median Score", value: foundationData?.median_percentage != null ? `${foundationData.median_percentage}%` : "—", icon: "bar-chart" as IconName, color: "#8B5CF6", sub: "50th percentile" },
              { label: "Score Range", value: foundationData?.highest_percentage != null ? `${foundationData.lowest_percentage}% – ${foundationData.highest_percentage}%` : "—", icon: "trending-up" as IconName, color: "#F59E0B", sub: "Min to Max spread" },
              { label: "Total Questions", value: currentExam.total_questions || foundationData?.total_questions || 0, icon: "clipboard" as IconName, color: "#06B6D4", sub: `${currentExam.time_limit_minutes} min limit` },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "1.1rem", display: "flex", alignItems: "center", gap: "0.85rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: c.color + "14", flexShrink: 0 }}>
                  <SvgIcon name={c.icon} size={22} style={{ color: c.color }} />
                </span>
                <div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>{c.value}</div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>{c.label}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{c.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {!hasSubmissions ? (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center", border: "1px solid var(--border-subtle)" }}>
              <span style={{ display: "inline-flex", padding: "1rem", borderRadius: "50%", background: "rgba(37, 99, 235, 0.1)", color: "#2563EB", marginBottom: "1rem" }}>
                <SvgIcon name="clipboard" size={32} />
              </span>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "var(--text-primary)" }}>No Student Attempts Available Yet</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: "480px", margin: "0 auto" }}>
                Once students complete this assessment, detailed score distributions, grade curves, item difficulty indices, and diagnostic reports will populate here.
              </p>
            </div>
          ) : (
            <>
              {/* Score Distribution & Standard Grade Curves */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
                {/* 5-Bucket Score Distribution Histogram */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Class Score Distribution</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>5-Bucket performance density</p>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: "0.72rem" }}>
                      Mean: {foundationData?.average_percentage}%
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {Object.entries(foundationData?.score_distribution_buckets || {}).map(([bucket, count]) => {
                      const total = foundationData?.total_submissions || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={bucket}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{bucket}</span>
                            <span style={{ color: "var(--text-muted)" }}>{count} students ({pct}%)</span>
                          </div>
                          <div style={{ width: "100%", height: "10px", background: "var(--bg-secondary)", borderRadius: "999px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: bucket.includes("81") || bucket.includes("61") ? "#10B981" : bucket.includes("41") ? "#2563EB" : bucket.includes("21") ? "#F59E0B" : "#EF4444", borderRadius: "999px", transition: "width 0.4s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Standard A/L Grade Distribution Cards */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>G.C.E. A/L Grade Distribution</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>National benchmark standard grading</p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 75px), 1fr))", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {[
                      { grade: "A", label: "≥ 75%", count: foundationData?.grade_distribution?.["A"] || 0, color: "#10B981" },
                      { grade: "B", label: "65–74%", count: foundationData?.grade_distribution?.["B"] || 0, color: "#2563EB" },
                      { grade: "C", label: "55–64%", count: foundationData?.grade_distribution?.["C"] || 0, color: "#8B5CF6" },
                      { grade: "S", label: "35–54%", count: foundationData?.grade_distribution?.["S"] || 0, color: "#F59E0B" },
                      { grade: "F", label: "< 35%", count: foundationData?.grade_distribution?.["F"] || 0, color: "#EF4444" },
                    ].map((g) => (
                      <div key={g.grade} style={{ padding: "0.85rem 0.4rem", textAlign: "center", borderRadius: "var(--radius-md)", background: g.color + "10", border: `1px solid ${g.color}30` }}>
                        <div style={{ fontSize: "1.35rem", fontWeight: 800, color: g.color }}>{g.grade}</div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: "2px 0" }}>{g.count}</div>
                        <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>{g.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Context-Sensitive Challenge & Mastery Highlights */}
              {isMcqExam && mcqReport && (mcqReport.hardest_questions.length > 0 || mcqReport.easiest_questions.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
                  {/* Hardest Questions */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#EF4444" }}><SvgIcon name="alert-triangle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Most Challenging Questions (Lowest p-value)</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {mcqReport.hardest_questions.slice(0, 3).map((hq) => (
                        <div key={hq.question_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>Q{hq.question_number}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", flex: 1, margin: "0 0.75rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{hq.stem_summary}</span>
                          <span className="badge badge-error" style={{ fontSize: "0.72rem" }}>
                            {hq.percentage_score != null ? `${hq.percentage_score}% success` : `p = ${hq.difficulty_index_p}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Easiest Questions */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#10B981" }}><SvgIcon name="check-circle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Highest Mastery Questions (Highest p-value)</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {mcqReport.easiest_questions.slice(0, 3).map((eq) => (
                        <div key={eq.question_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>Q{eq.question_number}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", flex: 1, margin: "0 0.75rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{eq.stem_summary}</span>
                          <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>
                            {eq.percentage_score != null ? `${eq.percentage_score}% success` : `p = ${eq.difficulty_index_p}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isStructuredExam && structuredReport && structuredReport.subpart_loss_ranking.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#EF4444" }}><SvgIcon name="alert-triangle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Highest Mark-Loss Subparts</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {structuredReport.subpart_loss_ranking.slice(0, 3).map((sub) => (
                        <div key={sub.node_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>{sub.display_label}</span>
                          <span className="badge badge-error" style={{ fontSize: "0.72rem" }}>{sub.loss_rate_percentage}% loss</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#10B981" }}><SvgIcon name="check-circle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Highest Attainment Subparts</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {[...structuredReport.subpart_loss_ranking].reverse().slice(0, 3).map((sub) => (
                        <div key={sub.node_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>{sub.display_label}</span>
                          <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>{sub.percentage_achieved ?? 0}% attained</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isEssayExam && essayReport && essayReport.most_omitted_criteria.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#F59E0B" }}><SvgIcon name="alert-triangle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Most Frequently Omitted Criteria</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {essayReport.most_omitted_criteria.slice(0, 3).map((c, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", flex: 1, marginRight: "0.5rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>Q{c.question_number} #{c.item_number} — {c.criterion_text}</span>
                          <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>{c.omission_frequency_percentage}% omitted</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                      <span style={{ color: "#10B981" }}><SvgIcon name="check-circle" size={16} /></span>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Highest Mastery Criteria</h4>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {[...essayReport.most_omitted_criteria].sort((a, b) => (b.success_percentage ?? 0) - (a.success_percentage ?? 0)).slice(0, 3).map((c, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", flex: 1, marginRight: "0.5rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>Q{c.question_number} #{c.item_number} — {c.criterion_text}</span>
                          <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>{c.success_percentage ?? 0}% success</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: MCQ ITEM ANALYSIS (PAPER I)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "mcq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Filters Bar */}
          <div className="card" style={{ padding: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", border: "1px solid var(--border-subtle)" }}>
            <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
              <input
                type="text"
                placeholder="Search question # or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ width: "100%", fontSize: "0.85rem", paddingLeft: "2rem" }}
              />
              <span style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                <SvgIcon name="search" size={14} />
              </span>
            </div>

            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="form-select" style={{ fontSize: "0.825rem", minWidth: "150px" }}>
              <option value="all">All Formats</option>
              <option value="generic_mcq">Direct Factual</option>
              <option value="multi_response_grid">Multiple Response Grid</option>
              <option value="five_statement_truth">5-Statement Truth</option>
              <option value="matching_column">Matrix Matching</option>
              <option value="combination_grid">Multi-Variable</option>
              <option value="sequential_diagnostic">Sequential Diagnostic</option>
            </select>

            <select value={cognitiveFilter} onChange={(e) => setCognitiveFilter(e.target.value)} className="form-select" style={{ fontSize: "0.825rem", minWidth: "140px" }}>
              <option value="all">All Cognitive</option>
              <option value="remember">Remember</option>
              <option value="understand">Understand</option>
              <option value="apply">Apply</option>
              <option value="analyze">Analyze</option>
              <option value="evaluate">Evaluate</option>
            </select>

            <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} className="form-select" style={{ fontSize: "0.825rem", minWidth: "130px" }}>
              <option value="all">All Difficulty</option>
              <option value="easy">Configured Easy</option>
              <option value="medium">Configured Medium</option>
              <option value="hard">Configured Hard</option>
            </select>

            <select value={attentionFilter} onChange={(e) => setAttentionFilter(e.target.value as any)} className="form-select" style={{ fontSize: "0.825rem", minWidth: "140px" }}>
              <option value="all">All Attention</option>
              <option value="high_attention">High Attention</option>
              <option value="review">Review Needed</option>
              <option value="on_track">On Track Items</option>
              <option value="no_data">No Data (Unattempted)</option>
            </select>
          </div>

          {/* MCQ Items Psychometric Table */}
          <div className="card" style={{ overflowX: "auto", padding: 0, border: "1px solid var(--border-subtle)" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", width: "50px" }}>#</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Question Stem</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Format / Taxonomy</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Cognitive</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Attempts</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Difficulty (p)</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Discrimination (d)</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Attention Status</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Option Distribution</th>
                </tr>
              </thead>
              <tbody>
                {filteredMCQQuestions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No MCQ items match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMCQQuestions.map((q) => {
                    const diffBand = getDifficultyBand(q.difficulty_index_p);
                    const attention = getQuestionAttentionStatus(q);
                    const hasDistractorWarning = q.option_distribution.some(o => o.is_non_functional_distractor);

                    return (
                      <tr key={q.question_id} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          Q{q.question_number}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", maxWidth: "280px" }}>
                          <div style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", color: "var(--text-primary)", fontWeight: 500 }}>
                            {q.stem_summary}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            KEY: <strong>Option ({q.correct_option || "—"})</strong>
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span className="badge badge-secondary" style={{ fontSize: "0.7rem", textTransform: "capitalize" }}>
                            {q.template_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                            {q.cognitive_level}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{q.total_attempts}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{q.correct_count} correct</div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <div style={{ display: "inline-block", padding: "0.2rem 0.5rem", borderRadius: "var(--radius-sm)", background: diffBand.bg, color: diffBand.color, fontWeight: 700, fontSize: "0.75rem" }}>
                            {q.difficulty_index_p != null ? `p = ${q.difficulty_index_p.toFixed(2)}` : "—"}
                          </div>
                          <div style={{ fontSize: "0.675rem", color: diffBand.color, marginTop: "2px", fontWeight: 600 }}>
                            {diffBand.label}
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          {q.discrimination.valid && q.discrimination.value != null ? (
                            <div>
                              <div style={{ fontWeight: 700, color: q.discrimination.value >= 0.3 ? "#10B981" : q.discrimination.value >= 0.1 ? "#F59E0B" : "#EF4444", fontSize: "0.8rem" }}>
                                {q.discrimination.value > 0 ? `+${q.discrimination.value.toFixed(2)}` : q.discrimination.value.toFixed(2)}
                              </div>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>
                                {q.discrimination.value >= 0.4 ? "Strong" : q.discrimination.value >= 0.2 ? "Moderate" : "Weak"}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }} title={q.discrimination.reason || "Need N ≥ 10"}>
                              Insufficient N
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <span className={`badge ${attention.badgeClass}`} style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }} title={attention.reason}>
                            {attention.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                            onClick={() => setSelectedQuestionForDetail(q)}
                          >
                            Inspect (A–E)
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: STRUCTURED HIERARCHY (PAPER II-A)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "structured" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Subpart Mark Loss Ranking Banner */}
          {structuredReport && structuredReport.subpart_loss_ranking.length > 0 && (
            <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                <span style={{ color: "#EF4444" }}><SvgIcon name="alert-triangle" size={18} /></span>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Highest Subpart Mark-Loss Leaderboard</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Specific subparts where students lost the largest portion of marks</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
                {structuredReport.subpart_loss_ranking.slice(0, 4).map((sub, idx) => (
                  <div key={sub.node_id} style={{ padding: "0.85rem 1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{sub.display_label}</span>
                      <span className="badge badge-error" style={{ fontSize: "0.7rem", fontWeight: 700 }}>{sub.loss_rate_percentage}% lost</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Avg: {sub.awarded_points_avg ?? 0} / {sub.maximum_points} pts ({sub.total_attempts} attempts)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hierarchical Tree Renderers per Structured Question */}
          {structuredReport?.questions.map((sq) => (
            <div key={sq.question_id} className="card" style={{ padding: "1.35rem", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="badge badge-purple" style={{ fontWeight: 700 }}>Question {sq.question_number}</span>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{sq.stem_summary}</h3>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    Total: {sq.total_points} marks • {sq.total_attempts} attempts • Class Average: {sq.average_score ?? 0} ({sq.average_percentage ?? 0}%)
                  </div>
                </div>
              </div>

              {/* Recursive Render of Subparts */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {sq.hierarchy.map((node) => (
                  <StructuredSubpartNodeView key={node.node_id} node={node} level={0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 4: ESSAY RUBRIC & CRITERIA (PAPER II-B)
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "essay" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Most Frequently Omitted Criteria */}
          {essayReport && essayReport.most_omitted_criteria.length > 0 && (
            <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                <span style={{ color: "var(--warning)" }}><SvgIcon name="file-text" size={18} /></span>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Marking Scheme Criteria Omission Frequency</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Specific scientific points most frequently omitted by candidates</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
                {essayReport.most_omitted_criteria.slice(0, 4).map((c, idx) => (
                  <div key={idx} style={{ padding: "0.85rem 1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>Q{c.question_number} — Criterion #{c.item_number}</span>
                      <span className="badge badge-warning" style={{ fontSize: "0.7rem", fontWeight: 700 }}>{c.omission_frequency_percentage}% omitted</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      &ldquo;{c.criterion_text}&rdquo;
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Avg: {c.average_awarded_points ?? 0}/{c.max_points} pts • Success: {c.success_percentage ?? 0}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Essay Questions Detail Table */}
          {essayReport?.questions.map((eq) => (
            <div key={eq.question_id} className="card" style={{ padding: "1.35rem", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="badge badge-amber" style={{ fontWeight: 700 }}>Essay Question {eq.question_number}</span>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{eq.stem_summary}</h3>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    Total: {eq.total_points} marks • Class Average: {eq.average_score ?? 0} ({eq.average_percentage ?? 0}%) • {eq.criteria_count} marking criteria
                  </div>
                </div>
              </div>

              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "0.6rem 0.8rem", width: "40px" }}>#</th>
                    <th style={{ padding: "0.6rem 0.8rem" }}>Evaluation Marking Criterion</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "center", width: "80px" }}>Max Pts</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "center", width: "100px" }}>Avg Awarded</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "center", width: "110px" }}>Success Rate</th>
                    <th style={{ padding: "0.6rem 0.8rem", textAlign: "center", width: "120px" }}>Omission Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {eq.criteria.map((c) => (
                    <tr key={c.item_number} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>{c.item_number}</td>
                      <td style={{ padding: "0.6rem 0.8rem", color: "var(--text-primary)" }}>{c.criterion_text}</td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 600 }}>{c.max_points}</td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700, color: "var(--accent-primary)" }}>{c.average_awarded_points ?? 0}</td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                        <span className={`badge ${(c.success_percentage ?? 0) >= 70 ? "badge-success" : (c.success_percentage ?? 0) >= 40 ? "badge-info" : "badge-warning"}`} style={{ fontSize: "0.72rem" }}>
                          {c.success_percentage ?? 0}%
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                        <span className={`badge ${(c.omission_frequency_percentage ?? 0) >= 60 ? "badge-error" : (c.omission_frequency_percentage ?? 0) >= 30 ? "badge-warning" : "badge-secondary"}`} style={{ fontSize: "0.72rem" }}>
                          {c.omission_frequency_percentage ?? 0}% omitted
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 5: COGNITIVE & TAXONOMY INTELLIGENCE
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "cognitive" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
            {/* Cognitive Taxonomy Breakdown */}
            <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border-subtle)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Cognitive Level Performance</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1.2rem 0" }}>Bloom's revised taxonomy mastery curves</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {Object.entries(mcqReport?.cognitive_level_breakdown || {}).map(([cog, data]: [string, any]) => (
                  <div key={cog}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>{cog} ({data.question_count} questions)</span>
                      <span style={{ color: "var(--text-muted)" }}>{data.success_rate_percentage ?? 0}% success</span>
                    </div>
                    <div style={{ width: "100%", height: "10px", background: "var(--bg-secondary)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${data.success_rate_percentage ?? 0}%`, height: "100%", background: (data.success_rate_percentage ?? 0) >= 70 ? "#10B981" : (data.success_rate_percentage ?? 0) >= 45 ? "#2563EB" : "#EF4444", borderRadius: "999px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Question Format Performance Breakdown */}
            <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border-subtle)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Question Format Performance</h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1.2rem 0" }}>Mastery across authentic A/L question profiles</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {Object.entries(mcqReport?.template_type_breakdown || {}).map(([tmpl, data]: [string, any]) => (
                  <div key={tmpl}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>{tmpl.replace(/_/g, " ")} ({data.question_count} Qs)</span>
                      <span style={{ color: "var(--text-muted)" }}>{data.success_rate_percentage ?? 0}% success</span>
                    </div>
                    <div style={{ width: "100%", height: "10px", background: "var(--bg-secondary)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${data.success_rate_percentage ?? 0}%`, height: "100%", background: "#8B5CF6", borderRadius: "999px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 6: STUDENT PERFORMANCE ROSTER
         ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "students" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border-subtle)" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", cursor: "pointer" }} onClick={() => { setStudentSortBy("name"); setStudentSortOrder(o => o === "asc" ? "desc" : "asc"); }}>
                    Student Name {studentSortBy === "name" && (studentSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", cursor: "pointer" }} onClick={() => { setStudentSortBy("score"); setStudentSortOrder(o => o === "asc" ? "desc" : "asc"); }}>
                    Score {studentSortBy === "score" && (studentSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", cursor: "pointer" }} onClick={() => { setStudentSortBy("percentage"); setStudentSortOrder(o => o === "asc" ? "desc" : "asc"); }}>
                    Percentage {studentSortBy === "percentage" && (studentSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Grade</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", cursor: "pointer" }} onClick={() => { setStudentSortBy("status"); setStudentSortOrder(o => o === "asc" ? "desc" : "asc"); }}>
                    Status {studentSortBy === "status" && (studentSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Submitted At</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No student submissions found for this assessment.
                    </td>
                  </tr>
                ) : (
                  sortedStudents.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.student_name || "Enrolled Candidate"}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.student_email || `ID: ${s.student_id}`}</div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 700, color: "var(--accent-primary)" }}>
                        {s.scaled_score ?? s.raw_score ?? "—"} pts
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
                          {s.percentage != null ? `${s.percentage}%` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <span className={`badge ${s.grade === "A" ? "badge-success" : s.grade === "B" || s.grade === "C" ? "badge-blue" : s.grade === "S" ? "badge-warning" : "badge-error"}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                          {s.grade || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <span className={`badge ${s.status === "teacher_verified" ? "badge-success" : s.status === "ai_graded" ? "badge-purple" : s.status === "submitted" ? "badge-blue" : "badge-warning"}`} style={{ fontSize: "0.7rem" }}>
                          {s.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "In Progress"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        <Link href={`/dashboard/teacher/al-exams/grade/${s.id}`} className="btn btn-secondary btn-sm" style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}>
                          Inspect Submission
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────── QUESTION DETAIL MODAL (OPTION DISTRIBUTION & DISTRACTOR EFFICIENCY) ──────────────── */}
      {selectedQuestionForDetail && (
        <Modal
          onClose={() => setSelectedQuestionForDetail(null)}
          title={`Question ${selectedQuestionForDetail.question_number} — Option Distribution & Distractor Diagnostics`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                Stem Summary:
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {selectedQuestionForDetail.stem_summary}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>Format: {selectedQuestionForDetail.template_type}</span>
                <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>Cognitive: {selectedQuestionForDetail.cognitive_level}</span>
                <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>Configured: {selectedQuestionForDetail.difficulty}</span>
                <span className="badge badge-success" style={{ fontSize: "0.7rem", fontWeight: 700 }}>KEY: Option ({selectedQuestionForDetail.correct_option})</span>
              </div>
            </div>

            {/* 5-Option Selection Distribution Breakdown */}
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
                Option Choice Frequencies (A–E) across {selectedQuestionForDetail.total_attempts} Student Attempts
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {selectedQuestionForDetail.option_distribution.map((opt) => (
                  <div key={opt.option_key} style={{ padding: "0.65rem 0.85rem", background: opt.is_correct ? "rgba(16, 185, 129, 0.08)" : opt.is_non_functional_distractor ? "rgba(245, 158, 11, 0.08)" : "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: `1px solid ${opt.is_correct ? "#10B98150" : "var(--border-subtle)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <strong style={{ color: opt.is_correct ? "#10B981" : "var(--text-primary)" }}>Option ({opt.option_key})</strong>
                        {opt.is_correct && <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>CORRECT ANSWER</span>}
                        {opt.is_non_functional_distractor && <span className="badge badge-warning" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>POTENTIALLY WEAK DISTRACTOR (&lt; 5%)</span>}
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{opt.count} students ({opt.percentage ?? 0}%)</span>
                    </div>
                    <div style={{ width: "100%", height: "8px", background: "var(--bg-card)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${opt.percentage ?? 0}%`, height: "100%", background: opt.is_correct ? "#10B981" : opt.is_non_functional_distractor ? "#F59E0B" : "#2563EB", borderRadius: "999px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedQuestionForDetail(null)}>Close Diagnostics</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Helper Component: Recursive Structured Node View
// ──────────────────────────────────────────────
function StructuredSubpartNodeView({ node, level }: { node: StructuredSubpartMetric; level: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isHardLoss = (node.loss_rate_percentage ?? 0) >= 50;

  return (
    <div style={{ marginLeft: `${level * 18}px`, paddingLeft: "12px", borderLeft: `2px solid ${isHardLoss ? "#EF4444" : "var(--border)"}`, marginBottom: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasChildren && (
            <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}>
              {collapsed ? "▶" : "▼"}
            </button>
          )}
          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{node.display_label}</span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Max: {node.maximum_points} pts</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Avg: <strong>{node.awarded_points_avg ?? 0} pts</strong> ({node.percentage_achieved ?? 0}%)
          </span>
          {node.loss_rate_percentage != null && (
            <span className={`badge ${isHardLoss ? "badge-error" : "badge-secondary"}`} style={{ fontSize: "0.7rem" }}>
              {node.loss_rate_percentage}% loss
            </span>
          )}
        </div>
      </div>

      {!collapsed && hasChildren && (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {node.children.map((child) => (
            <StructuredSubpartNodeView key={child.node_id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
