"use client";

import { useState } from "react";
import Link from "next/link";
import { ALExam, Course } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";

interface ALExamPaperCardProps {
  exam: ALExam;
  courses?: Course[];
  onPreview?: (exam: ALExam) => void;
  onEditSettings: (exam: ALExam) => void;
  onDelete: (exam: ALExam) => void;
  onDuplicate: (exam: ALExam) => void;
  onToast: (msg: string, type: "info" | "success" | "warning" | "error") => void;
}

export default function ALExamPaperCard({
  exam,
  courses = [],
  onPreview,
  onEditSettings,
  onDelete,
  onDuplicate,
  onToast,
}: ALExamPaperCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // 1. Assessment Family Badge Information
  const getFamilyBadge = (type: string) => {
    switch (type) {
      case "paper_1_mcq":
        return { label: "MCQ", fullName: "Paper I — MCQ", badgeClass: "badge-blue" };
      case "paper_2_structured":
        return { label: "STRUCTURED", fullName: "Paper II-A — Structured", badgeClass: "badge-purple" };
      case "paper_2_essay":
        return { label: "ESSAY", fullName: "Paper II-B — Essay", badgeClass: "badge-amber" };
      default:
        return { label: "PAPER 2", fullName: "Paper II — Full", badgeClass: "badge-green" };
    }
  };

  const familyBadge = getFamilyBadge(exam.exam_type);

  // 2. Publication / Date Status
  const isExpired = exam.available_until ? new Date(exam.available_until) < new Date() : false;

  const getStatusBadge = () => {
    if (isExpired) {
      return { label: "Expired", badgeClass: "badge-error" };
    }
    if (exam.is_published) {
      return { label: "Published", badgeClass: "badge-success" };
    }
    return { label: "Draft", badgeClass: "badge-warning" };
  };

  const statusBadge = getStatusBadge();

  // 3. Course Name & Subtitle
  const courseName = courses.find((c) => c.id === exam.course_id)?.title || "Advanced Level Biology";

  // 4. Calculate Total Marks & Question Count
  const totalQuestions = exam.questions?.length || exam.total_questions || 0;
  const totalMarks = exam.questions && exam.questions.length > 0
    ? exam.questions.reduce((acc, q) => acc + (q.points || 1.0), 0)
    : totalQuestions;

  // 5. Format Date Helper
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return null;
    }
  };

  const availableFromStr = formatDate(exam.available_from);
  const availableUntilStr = formatDate(exam.available_until);

  // 6. Extract Unique Question Types
  const questionTypeBadges = (() => {
    if (!exam.questions || exam.questions.length === 0) {
      if (exam.exam_type === "paper_1_mcq") return ["Direct Factual", "Multi-Response", "5-Statement"];
      if (exam.exam_type === "paper_2_structured") return ["Structured Subparts"];
      if (exam.exam_type === "paper_2_essay") return ["Essay Prompts"];
      return ["Structured", "Essay"];
    }

    const typeMap: Record<string, string> = {
      generic_mcq: "Direct Factual",
      multi_response_grid: "Multi-Response",
      five_statement_truth: "5-Statement",
      matching_column: "Matrix Matching",
      combination_grid: "Multi-Variable",
      sequential_diagnostic: "Sequential",
      incomplete_stem: "Incomplete Stem",
      structured_subparts: "Structured",
      essay_rubric: "Essay",
    };

    const types = new Set<string>();
    exam.questions.forEach((q) => {
      const tKey = (q.template_type || "generic_mcq").toLowerCase();
      types.add(typeMap[tKey] || "Standard MCQ");
    });

    return Array.from(types);
  })();

  const visibleBadges = questionTypeBadges.slice(0, 3);
  const remainingBadgeCount = Math.max(0, questionTypeBadges.length - 3);

  return (
    <div
      className="card paper-card-item"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1.35rem",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "var(--shadow-sm)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
      }}
    >
      <div>
        {/* HEADER ROW: BADGES & OVERFLOW MENU */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
            <span className={`badge ${familyBadge.badgeClass}`} style={{ fontWeight: 800, fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}>
              {familyBadge.label}
            </span>
            <span className={`badge ${statusBadge.badgeClass}`} style={{ fontWeight: 700, fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}>
              {statusBadge.label}
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              style={{ width: "30px", height: "30px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setMenuOpen(!menuOpen)}
              title="More Actions"
            >
              <SvgIcon name="chevrons-up-down" size={14} />
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: "0.35rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-md)",
                  zIndex: 50,
                  minWidth: "175px",
                  display: "flex",
                  flexDirection: "column",
                  padding: "0.35rem",
                }}
              >
                {onPreview && (
                  <button
                    style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-sm)" }}
                    onClick={() => { setMenuOpen(false); onPreview(exam); }}
                  >
                    <SvgIcon name="eye" size={14} /> Preview Paper
                  </button>
                )}

                <button
                  style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-sm)" }}
                  onClick={() => { setMenuOpen(false); onEditSettings(exam); }}
                >
                  <SvgIcon name="settings" size={14} /> Edit Settings
                </button>

                <button
                  style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-sm)" }}
                  onClick={() => { setMenuOpen(false); onDuplicate(exam); }}
                >
                  <SvgIcon name="layers" size={14} /> Duplicate Paper
                </button>

                <Link
                  href="/dashboard/teacher/al-exams/marking"
                  style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", textDecoration: "none", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-sm)" }}
                  onClick={() => setMenuOpen(false)}
                >
                  <SvgIcon name="check-circle" size={14} /> Marking Studio
                </Link>

                <button
                  style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "var(--danger)", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-sm)" }}
                  onClick={() => { setMenuOpen(false); onDelete(exam); }}
                >
                  <SvgIcon name="trash" size={14} /> Delete Paper
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TITLE & SUBTITLE */}
        <div style={{ marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.25rem 0", lineHeight: 1.35 }}>
            {exam.title}
          </h3>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {courseName} &bull; {familyBadge.fullName}
          </div>
        </div>

        {/* COMPACT STATISTICS GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "0.5rem",
            padding: "0.75rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            marginBottom: "0.85rem",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--accent-primary)" }}>{totalQuestions}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>Questions</div>
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{totalMarks}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>Marks</div>
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{exam.time_limit_minutes}m</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>Duration</div>
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{exam.max_attempts || 1}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>Attempt</div>
          </div>
        </div>

        {/* SCHEDULING / DUE DATE ROW */}
        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: "0.85rem", padding: "0 0.2rem" }}>
          <span>
            <strong style={{ color: "var(--text-muted)" }}>Available:</strong> {availableFromStr || "Immediate"}
          </span>
          <span>
            <strong style={{ color: "var(--text-muted)" }}>Due:</strong> {availableUntilStr || "No due date"}
          </span>
        </div>

        {/* QUESTION TYPE BADGES */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Question Formats
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {visibleBadges.map((b, idx) => (
              <span key={idx} className="badge badge-secondary" style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.2rem 0.45rem" }}>
                {b}
              </span>
            ))}
            {remainingBadgeCount > 0 && (
              <span className="badge badge-info" style={{ fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.45rem" }} title={questionTypeBadges.slice(3).join(", ")}>
                +{remainingBadgeCount} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER ACTION BAR */}
      <div style={{ paddingTop: "0.85rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <Link
          href={`/dashboard/teacher/al-exams/create?exam_id=${exam.id}`}
          className="btn btn-primary"
          style={{ flex: 1, height: "34px", fontSize: "0.82rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}
        >
          <SvgIcon name="file-text" size={14} /> Open Paper
        </Link>

        <Link
          href={`/dashboard/teacher/al-exams/create?exam_id=${exam.id}`}
          className="btn btn-secondary"
          style={{ height: "34px", fontSize: "0.82rem", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0 0.85rem" }}
        >
          <SvgIcon name="edit" size={14} /> Edit
        </Link>

        <Link
          href={`/dashboard/teacher/al-exams/analytics?exam_id=${exam.id}`}
          className="btn btn-secondary"
          style={{ height: "34px", fontSize: "0.82rem", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0 0.85rem" }}
          title="Performance Analytics"
        >
          <SvgIcon name="chart" size={14} /> Analytics
        </Link>
      </div>
    </div>
  );
}

export function ALExamPaperCardSkeleton() {
  return (
    <div
      className="card"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "1.35rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        opacity: 0.7,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ width: "80px", height: "20px", background: "var(--bg-secondary)", borderRadius: "4px" }} />
        <div style={{ width: "60px", height: "20px", background: "var(--bg-secondary)", borderRadius: "4px" }} />
      </div>
      <div style={{ width: "70%", height: "24px", background: "var(--bg-secondary)", borderRadius: "4px" }} />
      <div style={{ width: "40%", height: "14px", background: "var(--bg-secondary)", borderRadius: "4px" }} />
      <div style={{ height: "54px", background: "var(--bg-secondary)", borderRadius: "6px" }} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1, height: "34px", background: "var(--bg-secondary)", borderRadius: "6px" }} />
        <div style={{ width: "70px", height: "34px", background: "var(--bg-secondary)", borderRadius: "6px" }} />
      </div>
    </div>
  );
}
