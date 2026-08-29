"use client";

/**
 * Lumora Teacher Marking Studio & SpeedGrader Queue.
 * 
 * Central dispatch console where educators review, override, and verify student assessment attempts.
 * 
 * Key Design Decisions & Notes:
 * 1. Pending-First Queue Sorting:
 *    - Unreviewed submissions (status !== 'teacher_verified') are strictly sorted to the top of the queue.
 *    - Ensures teachers immediately see pending items before previously certified submissions.
 * 2. Authentic A/L Grading Scale:
 *    - Distinction (A): >= 75%
 *    - Very Good Pass (B): >= 65%
 *    - Credit Pass (C): >= 55%
 *    - Ordinary Pass (S): >= 35%
 *    - Fail (F): < 35%
 * 3. Filter Matrix:
 *    - Supports multi-dimensional filtering by Verification Status, Paper Type, Score Range, and Student Name.
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import api, { ALStudentSubmission, ALExam } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";

type StatusFilterType = "all" | "pending" | "teacher_verified";
type PaperTypeFilter = "all" | "paper_1_mcq" | "paper_2_structured" | "paper_2_essay" | "full_paper";
type ScoreRangeFilter = "all" | "distinction" | "merit" | "credit" | "ordinary" | "needs_support";
type SortOrderType = "newest" | "oldest" | "score_desc" | "score_asc" | "student_asc" | "student_desc";

function getSubmissionPaperType(sub: ALStudentSubmission, examsMap: Record<number, ALExam>): string {
  if (sub.exam_type) return sub.exam_type;
  if (examsMap[sub.exam_id]?.exam_type) return examsMap[sub.exam_id].exam_type;
  const title = (sub.exam_title || "").toLowerCase();
  if (title.includes("paper 1") || title.includes("paper i") || title.includes("mcq")) return "paper_1_mcq";
  if (title.includes("paper 2 part a") || title.includes("structured")) return "paper_2_structured";
  if (title.includes("paper 2 part b") || title.includes("essay")) return "paper_2_essay";
  return "full_paper";
}

function getSubmissionGrade(sub: ALStudentSubmission): { grade: string; badgeClass: string; color: string; percentage: number } {
  const pct = sub.percentage ?? sub.score_percentage ?? (sub.max_score ? Math.round(((sub.scaled_score || 0) / sub.max_score) * 100) : 0);
  if (pct >= 75) return { grade: "Grade A", badgeClass: "badge-success", color: "#10B981", percentage: pct };
  if (pct >= 65) return { grade: "Grade B", badgeClass: "badge-info", color: "#3B82F6", percentage: pct };
  if (pct >= 55) return { grade: "Grade C", badgeClass: "badge-purple", color: "#8B5CF6", percentage: pct };
  if (pct >= 40) return { grade: "Grade S", badgeClass: "badge-warning", color: "#F59E0B", percentage: pct };
  return { grade: "Grade F", badgeClass: "badge-error", color: "#EF4444", percentage: pct };
}

function parseUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  let s = String(dateStr).trim();
  if (!s) return null;
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s) && !/[+-]\d{4}$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = parseUtcDate(dateStr);
    if (!d) return "";
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - d.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

export default function TeacherMarkingStudioPage() {
  const { addToast } = useToast();
  const [submissions, setSubmissions] = useState<ALStudentSubmission[]>([]);
  const [exams, setExams] = useState<ALExam[]>([]);
  const [loading, setLoading] = useState(true);

  // Multi-dimensional filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("all");
  const [paperTypeFilter, setPaperTypeFilter] = useState<PaperTypeFilter>("all");
  const [examFilter, setExamFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreRangeFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrderType>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchSubmissions();
    fetchExams();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const data = await api.getPendingTeacherReviews("all");
      setSubmissions(data || []);
    } catch (err: any) {
      console.error("Failed to load submissions for Marking Studio", err);
      addToast(err?.message || "Failed to load submissions for Marking Studio", "error");
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchExams = async () => {
    try {
      const data = await api.listALExams();
      setExams(data || []);
    } catch (err) {
      console.error("Failed to load exams list", err);
    }
  };

  const examsMap = useMemo(() => {
    const map: Record<number, ALExam> = {};
    exams.forEach(e => { map[e.id] = e; });
    return map;
  }, [exams]);

  // Metric calculation counts
  const counts = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let mcq = 0;
    let structured = 0;
    let essay = 0;
    let full = 0;

    submissions.forEach(s => {
      if (s.status === "teacher_verified") {
        verified++;
      } else {
        pending++;
      }

      const pType = getSubmissionPaperType(s, examsMap);
      if (pType === "paper_1_mcq") mcq++;
      else if (pType === "paper_2_structured") structured++;
      else if (pType === "paper_2_essay") essay++;
      else full++;
    });

    return {
      total: submissions.length,
      pending,
      verified,
      mcq,
      structured,
      essay,
      full,
    };
  }, [submissions, examsMap]);

  // Filter and sort logic
  const filteredSubmissions = useMemo(() => {
    let result = submissions.filter((sub) => {
      // 1. Status Filter
      if (statusFilter === "pending") {
        if (sub.status === "teacher_verified") return false;
      } else if (statusFilter === "teacher_verified") {
        if (sub.status !== "teacher_verified") return false;
      }

      // 2. Paper Type Filter
      if (paperTypeFilter !== "all") {
        const pType = getSubmissionPaperType(sub, examsMap);
        if (pType !== paperTypeFilter) return false;
      }

      // 3. Exam Filter
      if (examFilter !== "all" && sub.exam_id !== Number(examFilter)) {
        return false;
      }

      // 4. Score Range Filter
      const gradeInfo = getSubmissionGrade(sub);
      if (scoreFilter === "distinction" && gradeInfo.percentage < 75) return false;
      if (scoreFilter === "merit" && (gradeInfo.percentage < 65 || gradeInfo.percentage >= 75)) return false;
      if (scoreFilter === "credit" && (gradeInfo.percentage < 55 || gradeInfo.percentage >= 65)) return false;
      if (scoreFilter === "ordinary" && (gradeInfo.percentage < 40 || gradeInfo.percentage >= 55)) return false;
      if (scoreFilter === "needs_support" && gradeInfo.percentage >= 40) return false;

      // 5. Search Query (student name, email, exam title, submission ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const sName = (sub.student_name || "").toLowerCase();
        const sEmail = (sub.student_email || "").toLowerCase();
        const eTitle = (sub.exam_title || "").toLowerCase();
        const idStr = String(sub.id);
        if (!sName.includes(q) && !sEmail.includes(q) && !eTitle.includes(q) && !idStr.includes(q)) {
          return false;
        }
      }

      return true;
    });

    // Sort order with UNREVIEWED / PENDING SUBMISSIONS ALWAYS FIRST AT THE TOP
    result.sort((a, b) => {
      const isPendingA = a.status !== "teacher_verified";
      const isPendingB = b.status !== "teacher_verified";

      // 1. Pending / Unreviewed submissions always float to the top
      if (isPendingA !== isPendingB) {
        return isPendingA ? -1 : 1;
      }

      // 2. Secondary sorting within each group based on user preference
      if (sortOrder === "newest") {
        const dateA = new Date(a.submitted_at || a.started_at || 0).getTime();
        const dateB = new Date(b.submitted_at || b.started_at || 0).getTime();
        return dateB - dateA;
      } else if (sortOrder === "oldest") {
        const dateA = new Date(a.submitted_at || a.started_at || 0).getTime();
        const dateB = new Date(b.submitted_at || b.started_at || 0).getTime();
        return dateA - dateB;
      } else if (sortOrder === "score_desc") {
        const scoreA = a.scaled_score ?? a.raw_score ?? 0;
        const scoreB = b.scaled_score ?? b.raw_score ?? 0;
        return scoreB - scoreA;
      } else if (sortOrder === "score_asc") {
        const scoreA = a.scaled_score ?? a.raw_score ?? 0;
        const scoreB = b.scaled_score ?? b.raw_score ?? 0;
        return scoreA - scoreB;
      } else if (sortOrder === "student_asc") {
        const nameA = (a.student_name || a.student_email || "").toLowerCase();
        const nameB = (b.student_name || b.student_email || "").toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortOrder === "student_desc") {
        const nameA = (a.student_name || a.student_email || "").toLowerCase();
        const nameB = (b.student_name || b.student_email || "").toLowerCase();
        return nameB.localeCompare(nameA);
      }
      return 0;
    });

    return result;
  }, [submissions, examsMap, statusFilter, paperTypeFilter, examFilter, scoreFilter, searchQuery, sortOrder]);

  const hasActiveFilters = statusFilter !== "all" || paperTypeFilter !== "all" || examFilter !== "all" || scoreFilter !== "all" || searchQuery.trim().length > 0;

  const resetAllFilters = () => {
    setStatusFilter("all");
    setPaperTypeFilter("all");
    setExamFilter("all");
    setScoreFilter("all");
    setSearchQuery("");
    setSortOrder("newest");
  };

  return (
    <div style={{ width: "100%", margin: 0, paddingBottom: "3rem", boxSizing: "border-box" }}>
      {/* ──────────────── HEADER ──────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            <Link href="/dashboard/teacher" style={{ color: "inherit", textDecoration: "none" }}>Teacher Portal</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Marking Studio</span>
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.6rem", letterSpacing: "-0.01em" }}>
            <SvgIcon name="check-circle" size={24} style={{ color: "var(--accent-primary)" }} /> Marking Studio &amp; Verification Hub
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>
            Review candidate answer scripts, evaluate subparts and itemized essay points, and publish verified academic results.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={fetchSubmissions}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.825rem", height: "38px" }}
          >
            <SvgIcon name="refresh" size={14} className={loading ? "spin" : ""} />
            Refresh Queue
          </button>
          <Link
            href="/dashboard/teacher/al-exams"
            className="btn btn-primary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.825rem", height: "38px" }}
          >
            <SvgIcon name="award" size={15} />
            Exam Management
          </Link>
        </div>
      </div>

      {/* ──────────────── KPI STATS OVERVIEW CARDS ──────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.85rem", marginBottom: "1.25rem" }}>
        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: "rgba(59, 130, 246, 0.1)", color: "#3B82F6", flexShrink: 0 }}>
            <SvgIcon name="file-text" size={22} />
          </span>
          <div>
            <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Total Submissions
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>
              {counts.total}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>Across all active exam papers</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: "rgba(245, 158, 11, 0.1)", color: "#F59E0B", flexShrink: 0 }}>
            <SvgIcon name="clock" size={22} />
          </span>
          <div>
            <div style={{ fontSize: "0.725rem", color: "#F59E0B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Pending Teacher Marking
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#F59E0B", lineHeight: 1.1, marginTop: "2px" }}>
              {counts.pending}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>Awaiting teacher manual evaluation</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.1)", color: "#10B981", flexShrink: 0 }}>
            <SvgIcon name="check-circle" size={22} />
          </span>
          <div>
            <div style={{ fontSize: "0.725rem", color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Verified &amp; Published
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10B981", lineHeight: 1.1, marginTop: "2px" }}>
              {counts.verified}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>Official grades released to students</div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-md)", background: "rgba(139, 92, 246, 0.1)", color: "#8B5CF6", flexShrink: 0 }}>
            <SvgIcon name="layers" size={22} />
          </span>
          <div>
            <div style={{ fontSize: "0.725rem", color: "#8B5CF6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Format Breakdown
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2, marginTop: "2px" }}>
              {counts.mcq} MCQ • {counts.structured} Str • {counts.essay} Ess
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>Paper I &amp; Paper II submissions</div>
          </div>
        </div>
      </div>

      {/* ──────────────── ENHANCED MULTI-LEVEL FILTER CONTROL WORKSTATION ──────────────── */}
      <div className="card" style={{ padding: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Tier 1: Primary Status Tabs & Paper Type Filters */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.85rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.85rem" }}>
          {/* Status Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginRight: "4px" }}>Status:</span>
            {[
              { id: "all" as StatusFilterType, label: "All Submissions", count: counts.total },
              { id: "pending" as StatusFilterType, label: "Pending Teacher Marking", count: counts.pending, alert: counts.pending > 0 },
              { id: "teacher_verified" as StatusFilterType, label: "Teacher Verified & Published", count: counts.verified },
            ].map((st) => {
              const isSelected = statusFilter === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: isSelected ? "var(--accent-primary)" : "var(--bg-secondary)",
                    color: isSelected ? "#FFFFFF" : "var(--text-primary)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  {st.label}
                  <span
                    style={{
                      padding: "0.1rem 0.4rem",
                      borderRadius: "100px",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      background: isSelected ? "rgba(255, 255, 255, 0.25)" : "var(--bg-card)",
                      color: isSelected ? "#FFFFFF" : "var(--text-muted)",
                    }}
                  >
                    {st.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: "relative", minWidth: "240px", flex: "1 1 auto", maxWidth: "320px" }}>
            <SvgIcon name="search" size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search candidate, email, exam..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "32px", fontSize: "0.825rem", height: "36px", width: "100%" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", padding: "2px" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Paper Types, Exam Paper Select, Performance Range, and Sort Dropdowns */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", justifyContent: "space-between" }}>
          {/* Paper Type Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginRight: "4px" }}>Paper Type:</span>
            {[
              { id: "all" as PaperTypeFilter, label: "All Papers" },
              { id: "paper_1_mcq" as PaperTypeFilter, label: "Paper I (MCQ)", count: counts.mcq },
              { id: "paper_2_structured" as PaperTypeFilter, label: "Paper II-A (Structured)", count: counts.structured },
              { id: "paper_2_essay" as PaperTypeFilter, label: "Paper II-B (Essay)", count: counts.essay },
            ].map((pt) => {
              const isSelected = paperTypeFilter === pt.id;
              return (
                <button
                  key={pt.id}
                  onClick={() => setPaperTypeFilter(pt.id)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "100px",
                    fontSize: "0.78rem",
                    fontWeight: isSelected ? 700 : 500,
                    border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: isSelected ? "rgba(59, 130, 246, 0.12)" : "var(--bg-secondary)",
                    color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {pt.label}
                </button>
              );
            })}
          </div>

          {/* Selectors Group */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            {/* Exam Paper Dropdown */}
            <select
              className="form-select"
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              style={{ fontSize: "0.8rem", height: "34px", width: "auto", minWidth: "180px", maxWidth: "260px" }}
            >
              <option value="all">All Exam Papers ({exams.length})</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id.toString()}>
                  {ex.title}
                </option>
              ))}
            </select>

            {/* Score / Grade Performance Filter */}
            <select
              className="form-select"
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as ScoreRangeFilter)}
              style={{ fontSize: "0.8rem", height: "34px", width: "auto", minWidth: "160px" }}
            >
              <option value="all">All Performance Ranges</option>
              <option value="distinction">Grade A (≥ 75% Distinction)</option>
              <option value="merit">Grade B (65% – 74% Merit)</option>
              <option value="credit">Grade C (55% – 64% Credit)</option>
              <option value="ordinary">Grade S (35% – 54% Pass)</option>
              <option value="needs_support">Grade F (&lt; 35% Needs Support)</option>
            </select>

            {/* Sort Order Dropdown */}
            <select
              className="form-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrderType)}
              style={{ fontSize: "0.8rem", height: "34px", width: "auto", minWidth: "160px" }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="score_desc">Highest Marks First</option>
              <option value="score_asc">Lowest Marks First (Needs Attention)</option>
              <option value="student_asc">Candidate Name (A → Z)</option>
              <option value="student_desc">Candidate Name (Z → A)</option>
            </select>
          </div>
        </div>

        {/* Tier 3: Active Filters & Results Summary Strip */}
        {hasActiveFilters && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.78rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Active Filters:</span>

              {statusFilter !== "all" && (
                <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  Status: {statusFilter.replace(/_/g, " ")}
                  <button type="button" onClick={() => setStatusFilter("all")} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                </span>
              )}

              {paperTypeFilter !== "all" && (
                <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  Type: {paperTypeFilter.replace(/_/g, " ")}
                  <button type="button" onClick={() => setPaperTypeFilter("all")} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                </span>
              )}

              {examFilter !== "all" && (
                <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  Exam: {examsMap[Number(examFilter)]?.title || `Exam #${examFilter}`}
                  <button type="button" onClick={() => setExamFilter("all")} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                </span>
              )}

              {scoreFilter !== "all" && (
                <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  Range: {scoreFilter.replace(/_/g, " ")}
                  <button type="button" onClick={() => setScoreFilter("all")} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                </span>
              )}

              {searchQuery && (
                <span className="badge badge-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  Query: &ldquo;{searchQuery}&rdquo;
                  <button type="button" onClick={() => setSearchQuery("")} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }}>✕</button>
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)" }}>
                Showing <strong>{filteredSubmissions.length}</strong> of {submissions.length} submissions
              </span>
              <button
                type="button"
                onClick={resetAllFilters}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.725rem", padding: "0.2rem 0.55rem" }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ──────────────── SUBMISSIONS WORKSTATION QUEUE ──────────────── */}
      {loading ? (
        <div className="page-loader" style={{ minHeight: "40vh" }}>
          <div className="spinner" />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading marking workstation queue...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="card" style={{ padding: "3.5rem 1.5rem", textAlign: "center", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>
            <SvgIcon name="check-circle" size={48} />
          </div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "var(--text-primary)" }}>No Submissions Match Your Criteria</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0 0 1.25rem 0", maxWidth: "480px", marginLeft: "auto", marginRight: "auto" }}>
            {hasActiveFilters
              ? "Try resetting your search query, status tabs, or paper type filters to view other candidate submissions."
              : "All student submissions have been verified and processed."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <SvgIcon name="refresh" size={14} /> Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {filteredSubmissions.map((sub) => {
            const isVerified = sub.status === "teacher_verified";
            const studentDisplayName = sub.student_name || (sub.student_email ? sub.student_email.split("@")[0] : `Candidate #${sub.student_id}`);
            const examTitle = sub.exam_title || `Examination #${sub.exam_id}`;
            const paperType = getSubmissionPaperType(sub, examsMap);
            const gradeInfo = getSubmissionGrade(sub);
            const initial = (studentDisplayName.charAt(0) || "S").toUpperCase();
            const relTime = formatRelativeTime(sub.submitted_at || sub.started_at);

            return (
              <div
                key={sub.id}
                className="card"
                style={{
                  padding: "1.2rem 1.4rem",
                  background: "var(--bg-card)",
                  border: isVerified ? "1px solid var(--border)" : "1px solid rgba(245, 158, 11, 0.4)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1.25rem",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Left: Avatar & Candidate / Paper Info */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: "280px" }}>
                  {/* Candidate Avatar Initials */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: isVerified ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)",
                      color: isVerified ? "#10B981" : "var(--accent-primary)",
                      fontWeight: 800,
                      fontSize: "1.05rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: isVerified ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(59, 130, 246, 0.25)",
                    }}
                  >
                    {initial}
                  </div>

                  {/* Details */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                      <span className={`badge ${isVerified ? "badge-success" : "badge-warning"}`} style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.02em" }}>
                        {isVerified ? "TEACHER VERIFIED" : "PENDING TEACHER MARKING"}
                      </span>

                      {/* Paper Type Badge */}
                      <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                        {paperType === "paper_1_mcq" ? "Paper I (MCQ)" : paperType === "paper_2_structured" ? "Paper II-A (Structured)" : paperType === "paper_2_essay" ? "Paper II-B (Essay)" : "Full Exam"}
                      </span>

                      <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                        Submission #{sub.id}
                      </span>

                      {relTime && (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <SvgIcon name="clock" size={12} /> {relTime}
                        </span>
                      )}
                    </div>

                    <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                      {studentDisplayName}
                    </div>

                    <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "2px", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                        {examTitle}
                      </span>
                      {sub.student_email && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
                          • {sub.student_email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Scores, Grade Badge, and Action Button */}
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexShrink: 0 }}>
                  {/* Grade Badge */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      {isVerified || paperType === "paper_1_mcq" ? "Official Grade" : "Marking Status"}
                    </div>
                    {isVerified || paperType === "paper_1_mcq" ? (
                      <span className={`badge ${gradeInfo.badgeClass}`} style={{ fontSize: "0.825rem", fontWeight: 800, marginTop: "2px" }}>
                        {gradeInfo.grade}
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: "0.75rem", fontWeight: 700, marginTop: "2px" }}>
                        Needs Marking
                      </span>
                    )}
                  </div>

                  {/* Scaled Marks */}
                  <div style={{ textAlign: "right", minWidth: "85px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Score
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {isVerified || paperType === "paper_1_mcq" ? (
                        <>
                          {sub.scaled_score ?? sub.raw_score ?? 0.0}
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                            {sub.max_score ? ` / ${sub.max_score}` : " pts"}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: "0.95rem", color: "var(--warning)", fontWeight: 700 }}>
                          Awaiting Marks
                        </span>
                      )}
                    </div>
                    {(isVerified || paperType === "paper_1_mcq") && gradeInfo.percentage > 0 && (
                      <div style={{ fontSize: "0.725rem", fontWeight: 700, color: gradeInfo.color }}>
                        {gradeInfo.percentage}% Attainment
                      </div>
                    )}
                  </div>

                  {/* Action Link */}
                  <Link
                    href={`/dashboard/teacher/al-exams/grade/${sub.id}`}
                    className={`btn btn-sm ${isVerified ? "btn-secondary" : "btn-primary"}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      padding: "0.55rem 1.15rem",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <SvgIcon name="check-circle" size={15} />
                    {isVerified ? "Review Marks" : "Mark Script"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
