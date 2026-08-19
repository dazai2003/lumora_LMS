"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import api, {
  Course,
  StudentPersonalMasteryReport,
  StudentPersonalLearningIntelligenceReport,
  StudentSyllabusUnitMastery,
  QuestionTypeMasteryItem,
} from "@/lib/api";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

type StudentAnalyticsTab = "overview" | "assessments" | "syllabus" | "taxonomy" | "support" | "intelligence" | "revision";
type AssessmentSubTab = "mcq" | "structured" | "essay";
type TaxonomyPhaseTab = "all" | "mcq" | "structured" | "essay" | "cognitive";

export default function StudentAnalyticsPage() {
  return (
    <Suspense fallback={<div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>}>
      <StudentAnalyticsContent />
    </Suspense>
  );
}

function StudentAnalyticsContent() {
  const { addToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<StudentAnalyticsTab>("overview");
  const [assessmentSubTab, setAssessmentSubTab] = useState<AssessmentSubTab>("mcq");
  const [taxonomyPhaseTab, setTaxonomyPhaseTab] = useState<TaxonomyPhaseTab>("all");
  const [expandedUnitId, setExpandedUnitId] = useState<number | null>(null);
  
  const [report, setReport] = useState<StudentPersonalMasteryReport | null>(null);
  const [intelReport, setIntelReport] = useState<StudentPersonalLearningIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Load enrolled courses
  useEffect(() => {
    api.getMyEnrolledCourses()
      .then((c) => {
        const regularCourses = (c || []).filter((item: Course) => {
          const title = (item.title || "").toLowerCase();
          const subject = (item.subject || "").toLowerCase();
          return !title.includes("examination papers") && !title.includes("g.c.e. a/l examination papers") && subject !== "a/l exam papers";
        });
        setCourses(regularCourses);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load personal mastery and learning intelligence reports
  useEffect(() => {
    setAnalyticsLoading(true);
    Promise.all([
      api.getStudentPersonalMastery(selectedCourse || undefined).catch(() => null),
      api.getStudentLearningIntelligence(selectedCourse || undefined).catch(() => null),
    ])
      .then(([masteryRes, intelRes]) => {
        setReport(masteryRes?.data || null);
        setIntelReport(intelRes?.data || null);
      })
      .catch((err) => {
        console.error("Failed to load personal analytics:", err);
        addToast("Failed to load personal analytics", "error");
      })
      .finally(() => setAnalyticsLoading(false));
  }, [selectedCourse, addToast]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "Strong":
        return <span className="badge badge-success" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Strong</span>;
      case "Developing":
        return <span className="badge badge-info" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Developing</span>;
      case "Needs Revision":
        return <span className="badge badge-warning" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Needs Revision</span>;
      case "Early Data":
      case "Early Evidence":
        return <span className="badge badge-secondary" style={{ fontSize: "0.72rem", fontWeight: 600, background: "rgba(59, 130, 246, 0.12)", color: "var(--accent-primary)" }}>Early Evidence</span>;
      case "Studied — Awaiting Assessment":
        return <span className="badge badge-secondary" style={{ fontSize: "0.72rem", fontWeight: 600, background: "rgba(16, 185, 129, 0.12)", color: "#10B981" }}>Studied (No Exam)</span>;
      case "Not Attempted":
      case "Not Started":
      case "No Data":
      default:
        return <span className="badge badge-secondary" style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--text-muted)" }}>{status || "Not Started"}</span>;
    }
  };

  const isCompletelyInactive = !report || (
    report.assessments_completed === 0 &&
    report.materials_completed === 0 &&
    (!report.personal_flags || report.personal_flags.length === 0) &&
    (!report.personal_ai_topics || report.personal_ai_topics.length === 0)
  );

  function formatUnitBadge(unitStr: string | undefined | null): { badge: string; subtitle: string } {
    if (!unitStr || unitStr === "Not Assessed" || unitStr === "Awaiting Data") {
      return { badge: "Not Assessed", subtitle: "Requires completed exams" };
    }
    if (unitStr === "On Track") {
      return { badge: "On Track", subtitle: "No weak areas detected" };
    }
    const match = unitStr.match(/Unit\s*0?(\d+)(?:\s*[:\-]\s*(.*))?/i);
    if (match) {
      const num = match[1].padStart(2, "0");
      const sub = match[2]?.trim() || `Unit ${num}`;
      return { badge: `Unit: ${num}`, subtitle: sub };
    }
    return { badge: unitStr.length > 14 ? unitStr.slice(0, 14) + "…" : unitStr, subtitle: unitStr };
  }

  const strongestUnit = formatUnitBadge(report?.strongest_unit);
  const revisionUnit = formatUnitBadge(report?.revision_priority_unit || (report?.assessments_completed ? "On Track" : "Awaiting Data"));

  if (loading) {
    return (
      <div style={{ width: "100%", padding: "0 0 2rem 0", boxSizing: "border-box" }}>
        <div className="page-loader" style={{ minHeight: "60vh" }}>
          <div className="spinner" />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading your academic analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 0 2rem 0", boxSizing: "border-box", minWidth: 0 }}>
      {/* ──────────────── HEADER & COURSE SELECTOR ──────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            <Link href="/dashboard/student" style={{ color: "inherit", textDecoration: "none" }}>Dashboard</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Personal Analytics</span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Student Academic Analytics &amp; Personal Mastery
          </h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Transparent assessment deep dives, syllabus unit question scoring, question formats taxonomy, and learning support flags.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedCourse || ""}
            onChange={(e) => setSelectedCourse(e.target.value ? Number(e.target.value) : null)}
            className="form-select"
            style={{ minWidth: "180px", fontSize: "0.825rem", height: "38px" }}
          >
            <option value="">All Enrolled Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>

          <Link
            href="/dashboard/student/al-exams"
            className="btn btn-primary btn-sm"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.825rem", height: "38px", padding: "0 0.9rem" }}
          >
            <SvgIcon name="award" size={15} />
            Exam Practice
          </Link>
        </div>
      </div>

      {/* ──────────────── TAB WORKSTATION NAVIGATOR ──────────────── */}
      <div style={{
        display: "flex",
        gap: "0.35rem",
        borderBottom: "1px solid var(--border)",
        marginBottom: "1.25rem",
        overflowX: "auto",
        width: "100%",
        maxWidth: "100%",
        scrollbarWidth: "thin",
        paddingBottom: "1px",
        boxSizing: "border-box",
      }}>
        {[
          { key: "overview" as StudentAnalyticsTab, label: "Overview & Activity", icon: "activity" as IconName },
          { key: "assessments" as StudentAnalyticsTab, label: "Assessment Deep Dive", icon: "award" as IconName },
          { key: "syllabus" as StudentAnalyticsTab, label: "Syllabus Units Mastery", icon: "layers" as IconName },
          { key: "taxonomy" as StudentAnalyticsTab, label: "Question Formats & Skills", icon: "check-circle" as IconName },
          { key: "support" as StudentAnalyticsTab, label: "Learning Support & Flags", icon: "flag" as IconName },
          { key: "intelligence" as StudentAnalyticsTab, label: "Learning Intelligence", icon: "sparkles" as IconName },
          { key: "revision" as StudentAnalyticsTab, label: "Targeted Revision", icon: "target" as IconName },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "0.65rem 1rem",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
                color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <SvgIcon name={tab.icon} size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {analyticsLoading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          Calculating personalized analytics metrics...
        </div>
      ) : (
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          {/* ═══════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW & ACTIVITY
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Inactivity Notice (when zero activity exists) */}
              {isCompletelyInactive && (
                <div style={{ padding: "1.25rem 1.5rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                    <SvgIcon name="info" size={18} style={{ color: "var(--accent-primary)" }} />
                    No learning or assessment activity recorded yet
                  </div>
                  <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "0 0 1rem 0", lineHeight: 1.5 }}>
                    Your personal learning analytics will appear as you study lesson materials and complete practice assessments.
                  </p>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <Link href="/dashboard/student/courses" className="btn btn-primary btn-sm" style={{ fontSize: "0.8rem" }}>
                      Open Course Materials
                    </Link>
                    <Link href="/dashboard/student/al-exams" className="btn btn-secondary btn-sm" style={{ fontSize: "0.8rem" }}>
                      Take Practice Exam
                    </Link>
                  </div>
                </div>
              )}

              {/* Primary KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.85rem" }}>
                {[
                  {
                    label: "Assessment Attainment",
                    value: report?.average_assessment_percentage != null ? `${report.average_assessment_percentage}%` : "No Data",
                    icon: "award" as IconName,
                    color: "#2563EB",
                    sub: report?.assessments_completed ? `${report.assessments_completed} completed exams` : "0 exams attempted"
                  },
                  {
                    label: "Material Progress",
                    value: report?.material_completion_percentage != null ? `${report.material_completion_percentage}%` : "0%",
                    icon: "book-open" as IconName,
                    color: "#10B981",
                    sub: `${report?.materials_completed || 0}/${report?.materials_total || 0} materials completed`
                  },
                  {
                    label: "Strongest Syllabus Unit",
                    value: strongestUnit.badge,
                    icon: "check-circle" as IconName,
                    color: "#8B5CF6",
                    sub: strongestUnit.subtitle
                  },
                  {
                    label: "Revision Focus",
                    value: revisionUnit.badge,
                    icon: "alert-triangle" as IconName,
                    color: report?.revision_priority_unit ? "#F59E0B" : "#10B981",
                    sub: revisionUnit.subtitle
                  },
                ].map((card) => (
                  <div key={card.label} className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.85rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: "var(--radius-md)", background: card.color + "12", flexShrink: 0 }}>
                      <SvgIcon name={card.icon} size={20} style={{ color: card.color }} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {card.value}
                      </div>
                      <div style={{ fontSize: "0.775rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "3px" }}>{card.label}</div>
                      <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", marginTop: "1px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{card.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 2-Column Responsive Layout: Score Trend (Left) & Personal Signals (Right) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "1rem", alignItems: "stretch" }}>
                {/* Performance Trend Progress */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Recent Assessment Score Progression</h3>
                      <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>{(report?.performance_trend || []).length} Attempts</span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Chronological exam attainment scores across your recent attempts</p>
                  </div>

                  {(report?.performance_trend || []).length < 2 ? (
                    <div style={{ padding: "1.75rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.825rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      Complete 2 or more assessments to generate your performance score trend.
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", height: "135px", padding: "0.75rem 0.5rem 0.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      {report?.performance_trend.map((pt, idx) => (
                        <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 800, color: pt.percentage >= 75 ? "#10B981" : pt.percentage >= 50 ? "#2563EB" : "#F59E0B", marginBottom: "4px" }}>
                            {pt.percentage}%
                          </div>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: "42px",
                              height: `${Math.max(16, (pt.percentage / 100) * 75)}px`,
                              background: pt.percentage >= 75 ? "#10B981" : pt.percentage >= 50 ? "#2563EB" : "#F59E0B",
                              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                              transition: "height 0.3s ease"
                            }}
                            title={`${pt.exam_title}: ${pt.percentage}%`}
                          />
                          <div style={{ fontSize: "0.675rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                            {pt.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Personal Learning Signals */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.95rem", color: "var(--accent-primary)", marginBottom: "0.25rem" }}>
                    <SvgIcon name="sparkles" size={17} />
                    Personal Learning Signals
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.85rem 0" }}>
                    AI-analyzed cognitive cues and actionable observations from your study history
                  </p>

                  {report?.personal_signals && report.personal_signals.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, justifyContent: "center" }}>
                      {report.personal_signals.map((sig, idx) => (
                        <div key={idx} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                          <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>•</span>
                          <span style={{ lineHeight: 1.4 }}>{sig}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "1.75rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.825rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      Study lessons and complete quizzes to generate personalized learning signals.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 2: ASSESSMENT DEEP DIVE (MCQ, STRUCTURED, ESSAY)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "assessments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Sub-navigation */}
              <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
                {[
                  { key: "mcq" as AssessmentSubTab, label: "Paper I MCQ Performance" },
                  { key: "structured" as AssessmentSubTab, label: "Paper II Part A: Structured" },
                  { key: "essay" as AssessmentSubTab, label: "Paper II Part B: Essay" },
                ].map((sTab) => (
                  <button
                    key={sTab.key}
                    onClick={() => setAssessmentSubTab(sTab.key)}
                    className={`btn btn-sm ${assessmentSubTab === sTab.key ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: "0.8rem" }}
                  >
                    {sTab.label}
                  </button>
                ))}
              </div>

              {/* Sub-tab 1: MCQ Performance */}
              {assessmentSubTab === "mcq" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.75rem" }}>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total MCQs Attempted</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {report?.mcq_deep_dive?.total_attempted || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Correct Answers</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#10B981", marginTop: "2px" }}>
                        {report?.mcq_deep_dive?.correct_count || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Incorrect / Missed</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#EF4444", marginTop: "2px" }}>
                        {report?.mcq_deep_dive?.incorrect_count || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Overall MCQ Accuracy</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: (report?.mcq_deep_dive?.accuracy_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                        {report?.mcq_deep_dive?.accuracy_percentage != null ? `${report.mcq_deep_dive.accuracy_percentage}%` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Difficulty Breakdown (Normalized Easy, Medium, Hard) */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                    <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>Accuracy by Difficulty Level</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.75rem" }}>
                      {(["Easy", "Medium", "Hard"] as const).map((level) => {
                        const d = (report?.mcq_deep_dive?.difficulty_breakdown || []).find(b => b.difficulty.toLowerCase() === level.toLowerCase()) || {
                          difficulty: level,
                          attempts: 0,
                          correct: 0,
                          accuracy_percentage: null
                        };
                        return (
                          <div key={level} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{level}</span>
                              <span style={{ fontWeight: 800, fontSize: "0.85rem", color: d.accuracy_percentage != null ? ((d.accuracy_percentage >= 70) ? "#10B981" : "#F59E0B") : "var(--text-muted)" }}>
                                {d.accuracy_percentage != null ? `${d.accuracy_percentage}%` : "Not Attempted"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {d.correct} correct / {d.attempts} attempts
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Structured Performance */}
              {assessmentSubTab === "structured" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Structured Questions Attempted</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {report?.structured_deep_dive?.questions_attempted || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Marks Obtained / Max</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {report?.structured_deep_dive?.total_earned_marks || 0} / {report?.structured_deep_dive?.total_max_marks || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Average Attainment %</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: (report?.structured_deep_dive?.average_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                        {report?.structured_deep_dive?.average_percentage != null ? `${report.structured_deep_dive.average_percentage}%` : "No Data"}
                      </div>
                    </div>
                  </div>

                  {(!report?.structured_deep_dive?.questions || report.structured_deep_dive.questions.length === 0) ? (
                    <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      No structured question attempts recorded yet.
                    </div>
                  ) : (
                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.75rem 1rem" }}>Question</th>
                            <th style={{ padding: "0.75rem 1rem" }}>Exam</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Marks Earned / Max</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.structured_deep_dive.questions.map((q, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                Structured Question #{q.question_number}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>
                                {q.exam_title}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 600 }}>
                                {q.earned_marks} / {q.max_marks}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 800, color: q.percentage >= 70 ? "#10B981" : "#2563EB" }}>
                                {q.percentage}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: Essay Performance */}
              {assessmentSubTab === "essay" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Essay Questions Completed</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {report?.essay_deep_dive?.essays_attempted || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Marks Obtained / Max</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {report?.essay_deep_dive?.total_earned_marks || 0} / {report?.essay_deep_dive?.total_max_marks || 0}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Average Essay Attainment %</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: (report?.essay_deep_dive?.average_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                        {report?.essay_deep_dive?.average_percentage != null ? `${report.essay_deep_dive.average_percentage}%` : "No Data"}
                      </div>
                    </div>
                  </div>

                  {(!report?.essay_deep_dive?.questions || report.essay_deep_dive.questions.length === 0) ? (
                    <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      No essay question submissions recorded yet.
                    </div>
                  ) : (
                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.75rem 1rem" }}>Question</th>
                            <th style={{ padding: "0.75rem 1rem" }}>Exam</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Marks Earned / Max</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.essay_deep_dive.questions.map((q, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                Essay Question #{q.question_number}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>
                                {q.exam_title}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 600 }}>
                                {q.earned_marks} / {q.max_marks}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 800, color: q.percentage >= 70 ? "#10B981" : "#2563EB" }}>
                                {q.percentage}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 3: SYLLABUS UNIT QUESTION-BY-TYPE BREAKDOWN
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "syllabus" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                Click any syllabus unit below to expand and view how you scored across <strong>MCQ Types</strong>, <strong>Structured Types</strong>, and <strong>Essay Types</strong> within that specific unit.
              </div>

              {(report?.syllabus_unit_mastery || []).length === 0 ? (
                <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  No syllabus units found for the selected course filter.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {report?.syllabus_unit_mastery.map((u) => {
                    const isExpanded = expandedUnitId === u.unit_id;
                    return (
                      <div
                        key={u.unit_id}
                        className="card"
                        style={{
                          padding: "1.1rem 1.25rem",
                          border: isExpanded ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                          background: "var(--bg-card)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {/* Header Row */}
                        <div
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", flexWrap: "wrap", gap: "0.75rem" }}
                          onClick={() => setExpandedUnitId(isExpanded ? null : u.unit_id)}
                        >
                          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{u.unit_title}</h3>
                              {renderStatusBadge(u.mastery_status)}
                            </div>
                            <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "3px" }}>
                              {u.data_source_note} • {u.material_completion_percentage != null ? `${u.material_completion_percentage}% materials completed` : "0% completed"}
                            </div>
                          </div>

                          {/* Quick Scores Summary */}
                          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>Unit Mastery</div>
                              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: (u.assessment_mastery_percentage ?? 0) >= 75 ? "#10B981" : (u.assessment_mastery_percentage ?? 0) >= 50 ? "#2563EB" : (u.assessment_mastery_percentage != null ? "#F59E0B" : "var(--text-muted)") }}>
                                {u.assessment_mastery_percentage != null ? `${u.assessment_mastery_percentage}%` : "—"}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>MCQ</div>
                              <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{u.mcq_percentage != null ? `${u.mcq_percentage}%` : "—"}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>Structured</div>
                              <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{u.structured_percentage != null ? `${u.structured_percentage}%` : "—"}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>Essay</div>
                              <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{u.essay_percentage != null ? `${u.essay_percentage}%` : "—"}</div>
                            </div>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedUnitId(isExpanded ? null : u.unit_id);
                              }}
                            >
                              {isExpanded ? "Collapse" : "View Breakdown"}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Question Formats Breakdown */}
                        {isExpanded && (
                          <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {/* 3 Paper Breakdown Columns */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "1rem" }}>
                              {/* 1. MCQ Breakdown in Unit */}
                              <div style={{ padding: "0.9rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                  <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>Paper I: MCQ Types</strong>
                                  <span style={{ fontWeight: 800, fontSize: "0.85rem", color: (u.mcq_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB" }}>
                                    {u.mcq_percentage != null ? `${u.mcq_percentage}%` : "Not Attempted"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                                  {u.mcq_breakdown?.correct || 0} correct / {u.mcq_breakdown?.attempts || 0} total attempts
                                </div>
                                {(!u.mcq_breakdown?.formats || u.mcq_breakdown.formats.length === 0) ? (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>No MCQs attempted from this unit</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                    {u.mcq_breakdown.formats.map((fmt) => (
                                      <div key={fmt.format_key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
                                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{fmt.format_name}</span>
                                        <span style={{ fontWeight: 700, color: (fmt.percentage ?? 0) >= 70 ? "#10B981" : "#F59E0B" }}>
                                          {fmt.percentage != null ? `${fmt.percentage}% (${fmt.correct}/${fmt.attempts})` : "—"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 2. Structured Breakdown in Unit */}
                              <div style={{ padding: "0.9rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                  <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>Paper II Part A: Structured Types</strong>
                                  <span style={{ fontWeight: 800, fontSize: "0.85rem", color: (u.structured_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB" }}>
                                    {u.structured_percentage != null ? `${u.structured_percentage}%` : "Not Attempted"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                                  {u.structured_breakdown?.earned_marks || 0} / {u.structured_breakdown?.max_marks || 0} marks earned
                                </div>
                                {(!u.structured_breakdown?.formats || u.structured_breakdown.formats.length === 0) ? (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>No structured questions attempted from this unit</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                    {u.structured_breakdown.formats.map((fmt) => (
                                      <div key={fmt.format_key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
                                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{fmt.format_name}</span>
                                        <span style={{ fontWeight: 700, color: (fmt.percentage ?? 0) >= 70 ? "#10B981" : "#F59E0B" }}>
                                          {fmt.percentage != null ? `${fmt.percentage}%` : "—"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 3. Essay Breakdown in Unit */}
                              <div style={{ padding: "0.9rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                  <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>Paper II Part B: Essay Types</strong>
                                  <span style={{ fontWeight: 800, fontSize: "0.85rem", color: (u.essay_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB" }}>
                                    {u.essay_percentage != null ? `${u.essay_percentage}%` : "Not Attempted"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                                  {u.essay_breakdown?.earned_marks || 0} / {u.essay_breakdown?.max_marks || 0} marks earned
                                </div>
                                {(!u.essay_breakdown?.formats || u.essay_breakdown.formats.length === 0) ? (
                                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>No essay questions attempted from this unit</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                    {u.essay_breakdown.formats.map((fmt) => (
                                      <div key={fmt.format_key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
                                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{fmt.format_name}</span>
                                        <span style={{ fontWeight: 700, color: (fmt.percentage ?? 0) >= 70 ? "#10B981" : "#F59E0B" }}>
                                          {fmt.percentage != null ? `${fmt.percentage}%` : "—"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 4: QUESTION FORMATS & COGNITIVE SKILLS TAXONOMY
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "taxonomy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Paper Phases Summary Banner */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "0.75rem" }}>
                <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Paper I: MCQ Paper</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: (report?.mcq_deep_dive?.accuracy_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                    {report?.mcq_deep_dive?.accuracy_percentage != null ? `${report.mcq_deep_dive.accuracy_percentage}%` : "Not Attempted"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>9 Canonical A/L Question Templates</div>
                </div>

                <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Paper II Part A: Structured</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: (report?.structured_deep_dive?.average_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                    {report?.structured_deep_dive?.average_percentage != null ? `${report.structured_deep_dive.average_percentage}%` : "Not Attempted"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>8 Structured Question Templates</div>
                </div>

                <div className="card" style={{ padding: "1rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Paper II Part B: Essay</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: (report?.essay_deep_dive?.average_percentage ?? 0) >= 70 ? "#10B981" : "#2563EB", marginTop: "2px" }}>
                    {report?.essay_deep_dive?.average_percentage != null ? `${report.essay_deep_dive.average_percentage}%` : "Not Attempted"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>4 Comprehensive Essay Templates</div>
                </div>
              </div>

              {/* Sub-phase Switcher */}
              <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", flexWrap: "wrap" }}>
                {[
                  { key: "all" as TaxonomyPhaseTab, label: "All Question Formats" },
                  { key: "mcq" as TaxonomyPhaseTab, label: `Paper I: MCQs (${report?.mcq_formats?.length || 9})` },
                  { key: "structured" as TaxonomyPhaseTab, label: `Paper II Part A: Structured (${report?.structured_formats?.length || 8})` },
                  { key: "essay" as TaxonomyPhaseTab, label: `Paper II Part B: Essay (${report?.essay_formats?.length || 4})` },
                  { key: "cognitive" as TaxonomyPhaseTab, label: "Bloom's Cognitive Taxonomy (5 Levels)" },
                ].map((sTab) => (
                  <button
                    key={sTab.key}
                    onClick={() => setTaxonomyPhaseTab(sTab.key)}
                    className={`btn btn-sm ${taxonomyPhaseTab === sTab.key ? "btn-primary" : "btn-secondary"}`}
                    style={{ fontSize: "0.8rem" }}
                  >
                    {sTab.label}
                  </button>
                ))}
              </div>

              {/* 1. MCQ Formats Section */}
              {(taxonomyPhaseTab === "all" || taxonomyPhaseTab === "mcq") && (
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Paper I: MCQ Question Formats</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Accuracy across all 9 canonical G.C.E. A/L multiple-choice templates</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.75rem" }}>
                    {(report?.mcq_formats || []).map((qt) => (
                      <div key={qt.template_type} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{qt.template_name}</span>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{qt.accuracy_percentage != null ? `${qt.accuracy_percentage}%` : "—"}</span>
                            {renderStatusBadge(qt.mastery_status)}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{qt.correct_count} correct / {qt.attempts_count} attempts</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Structured Formats Section */}
              {(taxonomyPhaseTab === "all" || taxonomyPhaseTab === "structured") && (
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Paper II Part A: Structured Question Formats</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Attainment across all 8 canonical structured subpart templates</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.75rem" }}>
                    {(report?.structured_formats || []).map((qt) => (
                      <div key={qt.template_type} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{qt.template_name}</span>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{qt.accuracy_percentage != null ? `${qt.accuracy_percentage}%` : "—"}</span>
                            {renderStatusBadge(qt.mastery_status)}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{qt.attempts_count} questions attempted</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Essay Formats Section */}
              {(taxonomyPhaseTab === "all" || taxonomyPhaseTab === "essay") && (
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Paper II Part B: Essay Question Formats</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Attainment across descriptive, comparative, and experimental essay templates</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.75rem" }}>
                    {(report?.essay_formats || []).map((qt) => (
                      <div key={qt.template_type} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{qt.template_name}</span>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{qt.accuracy_percentage != null ? `${qt.accuracy_percentage}%` : "—"}</span>
                            {renderStatusBadge(qt.mastery_status)}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{qt.attempts_count} essays evaluated</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Cognitive Taxonomy Section */}
              {(taxonomyPhaseTab === "all" || taxonomyPhaseTab === "cognitive") && (
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Bloom's Revised Cognitive Taxonomy</h3>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Attainment across Remember, Understand, Apply, Analyze, and Evaluate levels</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                    {(report?.cognitive_skills_mastery || []).map((cog) => (
                      <div key={cog.cognitive_level} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{cog.cognitive_level}</span>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>{cog.accuracy_percentage != null ? `${cog.accuracy_percentage}%` : "—"}</span>
                            {renderStatusBadge(cog.mastery_status)}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{cog.correct_count} correct / {cog.attempts_count} attempts</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 5: LEARNING SUPPORT & MY FLAGS (WITH TEACHER REPLIES)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "support" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* My Learning Flags Card */}
              <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>My Learning Difficulty Flags &amp; Teacher Replies</h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Flags you raised on confusing materials and feedback replies from your teachers</p>
                  </div>
                  <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                    {report?.personal_flags?.length || 0} Total Flags
                  </span>
                </div>

                {(report?.personal_flags || []).length === 0 ? (
                  <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    You haven't flagged any learning materials yet. While studying, click "Flag Difficulty" on confusing slides or video timestamps.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {report?.personal_flags.map((f) => (
                      <div
                        key={f.flag_id}
                        style={{
                          padding: "1rem 1.25rem",
                          background: "var(--bg-secondary)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {/* Flag Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>{f.material_title}</strong>
                            <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>
                              {f.context_value}
                            </span>
                          </div>
                          <span
                            className={`badge ${f.is_resolved ? (f.teacher_reply ? "badge-success" : "badge-info") : "badge-warning"}`}
                            style={{ fontSize: "0.725rem", fontWeight: 600 }}
                          >
                            {f.status_label || (f.is_resolved ? "Resolved" : "Open (Awaiting Teacher Review)")}
                          </span>
                        </div>

                        {/* Student Comment */}
                        <div style={{ fontSize: "0.825rem", color: "var(--text-primary)", background: "var(--bg-card)", padding: "0.65rem 0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", marginBottom: f.teacher_reply ? "0.75rem" : "0" }}>
                          <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "2px" }}>YOUR QUESTION / NOTE:</div>
                          &ldquo;{f.comment}&rdquo;
                        </div>

                        {/* Teacher Reply Back */}
                        {f.teacher_reply && (
                          <div style={{ padding: "0.75rem 0.9rem", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#10B981", fontWeight: 700, fontSize: "0.775rem", marginBottom: "3px" }}>
                              <SvgIcon name="check-circle" size={14} />
                              TEACHER RESOLUTION &amp; GUIDANCE:
                            </div>
                            <div style={{ fontSize: "0.825rem", color: "var(--text-primary)", lineHeight: 1.45 }}>
                              {f.teacher_reply}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ask AI History Card */}
              <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Ask AI Inquiry Topics</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1.2rem 0" }}>Core subject concepts where you frequently consulted the AI Tutor</p>

                {(report?.personal_ai_topics || []).length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    You haven't asked any questions to Ask AI yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                    {report?.personal_ai_topics.map((top, idx) => (
                      <div key={idx} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>{top.topic}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{top.count} inquiries asked</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 6: LEARNING INTELLIGENCE & HOTSPOTS
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "intelligence" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Executive Narrative */}
              {intelReport?.personal_executive_narrative && (
                <div style={{ padding: "1.1rem 1.3rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-primary)", marginBottom: "0.3rem" }}>
                    <SvgIcon name="sparkles" size={17} />
                    Personal Learning Intelligence Narrative
                  </div>
                  <p style={{ fontSize: "0.825rem", color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
                    {intelReport.personal_executive_narrative}
                  </p>
                </div>
              )}

              {/* Personal Hotspots */}
              <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Personal Learning Hotspots</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1.2rem 0" }}>Evidence synthesis connecting your difficulty flags, Ask AI questions, and exam scores</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {(intelReport?.personal_hotspots || []).length === 0 ? (
                    <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      Zero learning hotspots identified.
                    </div>
                  ) : (
                    intelReport?.personal_hotspots.map((h) => {
                      const badgeClass = h.priority_level === "HIGH_PRIORITY" ? "badge-error" : h.priority_level === "MONITORING" ? "badge-warning" : h.priority_level === "HEALTHY" ? "badge-success" : "badge-secondary";

                      return (
                        <div key={h.hotspot_id} style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{h.unit_title}</strong>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              {h.evidence_state && (
                                <span className="badge badge-secondary" style={{ fontSize: "0.68rem" }}>
                                  {h.evidence_state.replace(/_/g, " ")}
                                </span>
                              )}
                              <span className={`badge ${badgeClass}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                {h.priority_level.replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "6px" }}>
                            {h.neutral_insight}
                          </div>
                          {h.evidence_points.length > 0 && (
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                              {h.evidence_points.map((pt, pIdx) => (
                                <span key={pIdx} className="badge badge-secondary" style={{ fontSize: "0.675rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                                  • {pt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Format Divergence & Cognitive Attenuation Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1.25rem" }}>
                {/* Format Divergence */}
                <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Question Format Divergence</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Factual recall vs applied multi-variable performance differences</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(intelReport?.question_format_divergence || []).length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        No significant question format divergence detected.
                      </div>
                    ) : (
                      intelReport?.question_format_divergence.map((qf, idx) => (
                        <div key={idx} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{qf.unit_title}</span>
                            <span className="badge badge-info" style={{ fontSize: "0.68rem" }}>Format Gap</span>
                          </div>
                          <div style={{ fontSize: "0.775rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{qf.insight}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cognitive Attenuation */}
                <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Cognitive Depth Attenuation</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Recall vs analytical problem solving accuracy</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(intelReport?.cognitive_attenuation || []).length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        Consistent performance across Bloom cognitive levels.
                      </div>
                    ) : (
                      intelReport?.cognitive_attenuation.map((cg, idx) => (
                        <div key={idx} style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{cg.unit_title}</span>
                            <span className="badge badge-purple" style={{ fontSize: "0.68rem" }}>Cognitive Shift</span>
                          </div>
                          <div style={{ fontSize: "0.775rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{cg.insight}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 7: TARGETED REVISION GUIDANCE
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "revision" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div className="card" style={{ padding: "1.35rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Targeted Revision Priorities</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1.2rem 0" }}>Evidence-based recommendations derived from your completed assessment attempts</p>

                {(report?.revision_priorities || []).length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    {report?.assessments_completed === 0
                      ? "No assessment performance is available yet. Complete an assessment to identify your strongest and weakest areas."
                      : "You are performing well across all evaluated syllabus units. Continue routine revision."}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {report?.revision_priorities.map((rev) => (
                      <div key={rev.priority_rank} style={{ padding: "1rem 1.15rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            Priority #{rev.priority_rank}: {rev.unit_title}
                          </span>
                          {rev.current_performance_percentage != null && (
                            <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>
                              Attainment: {rev.current_performance_percentage}%
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "4px", lineHeight: 1.45 }}>
                          {rev.evidence_rationale}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                          Suggested Action: {rev.suggested_action}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
