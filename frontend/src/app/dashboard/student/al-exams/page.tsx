"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import api, { ALExam, ALStudentSubmission } from "@/lib/api";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

function StudentExamStudioContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") || "all";

  const [activeTab, setActiveTab] = useState<string>(initialType);
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "active" | "expired">("all");
  const [submissionFilter, setSubmissionFilter] = useState<"all" | "teacher_verified" | "ai_graded" | "pending">("all");
  
  const [exams, setExams] = useState<ALExam[]>([]);
  const [submissions, setSubmissions] = useState<ALStudentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [examsData, subsData] = await Promise.all([
        api.listALExams(),
        api.getMyALSubmissions().catch(() => [])
      ]);
      setExams(examsData || []);
      setSubmissions(subsData || []);
    } catch (err: any) {
      addToast(err.message || "Failed to load exams data", "error");
    } finally {
      setLoading(false);
    }
  };

  // Map of exam_id to student's latest submission
  const submissionsByExamId: Record<number, ALStudentSubmission> = {};
  submissions.forEach((s) => {
    const sDate = s.started_at ? new Date(s.started_at).getTime() : 0;
    const prevDate = submissionsByExamId[s.exam_id]?.started_at ? new Date(submissionsByExamId[s.exam_id].started_at!).getTime() : 0;
    if (!submissionsByExamId[s.exam_id] || sDate > prevDate) {
      submissionsByExamId[s.exam_id] = s;
    }
  });

  // Filter exams by Paper Type
  const filteredExams = exams.filter((e) => {
    if (activeTab !== "all") {
      if (activeTab === "full_paper") {
        if ((e.exam_type as string) !== "full_paper" && (e.exam_type as string) !== "full_exam") return false;
      } else if (e.exam_type !== activeTab) {
        return false;
      }
    }

    // Availability filter (e.g. deadline or active status)
    if (availabilityFilter === "active") {
      if (e.is_published === false) return false;
    } else if (availabilityFilter === "expired") {
      // In this context, if exam has an expired deadline or is archived
      return false; // placeholder for expired criteria
    }

    return true;
  });

  // Filter submissions
  const filteredSubmissions = submissions.filter((s) => {
    if (submissionFilter === "all") return true;
    if (submissionFilter === "teacher_verified") return s.status === "teacher_verified";
    if (submissionFilter === "ai_graded") return s.status === "ai_graded";
    if (submissionFilter === "pending") return s.status === "submitted" || s.status === "in_progress";
    return true;
  });

  const getTabBadge = (type: string) => {
    if (type === "paper_1_mcq") return { label: "Paper I — MCQ", color: "badge-info", icon: "clipboard" as IconName };
    if (type === "paper_2_structured") return { label: "Paper II-A — Structured", color: "badge-purple", icon: "layers" as IconName };
    if (type === "paper_2_essay") return { label: "Paper II-B — Essay", color: "badge-warning", icon: "file-text" as IconName };
    if (type === "full_paper" || type === "full_exam") return { label: "Full Examination", color: "badge-success", icon: "book-open" as IconName };
    return { label: "Standard Paper", color: "badge-secondary", icon: "file-text" as IconName };
  };

  const getSubmissionStatusBadge = (status: string) => {
    switch (status) {
      case "teacher_verified":
        return { label: "Teacher Verified", className: "badge-success", icon: "check-circle" as IconName };
      case "ai_graded":
        return { label: "AI Evaluated", className: "badge-info", icon: "sparkle" as IconName };
      case "submitted":
        return { label: "Awaiting Teacher Review", className: "badge-warning", icon: "clock" as IconName };
      case "in_progress":
        return { label: "In Progress", className: "badge-secondary", icon: "edit" as IconName };
      default:
        return { label: status.replace(/_/g, " "), className: "badge-secondary", icon: "file-text" as IconName };
    }
  };

  const getGradeColor = (grade?: string | null) => {
    if (!grade) return "var(--text-muted)";
    const g = grade.toUpperCase();
    if (g === "A") return "var(--success)";
    if (g === "B") return "var(--accent-primary)";
    if (g === "C") return "var(--warning)";
    if (g === "S") return "#F59E0B";
    return "var(--error)";
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "1.5rem" }}>
      {/* ─── Header Banner ─── */}
      <div style={{
        marginBottom: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 0.4rem 0" }}>
            G.C.E. A/L Biology Examination Studio
          </h1>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0, maxWidth: "800px", lineHeight: 1.5 }}>
            Practice standardized G.C.E. Advanced Level Paper I (50 MCQ speed &amp; negative-marking practice), Paper II-A (Structured Dotted-Line Answer Sheets), and Paper II-B (Section-by-Section Essay Studio).
          </p>
        </div>

        {/* Quick Stats Pill */}
        <div style={{
          display: "flex",
          gap: "1rem",
          background: "var(--bg-card)",
          padding: "0.75rem 1.25rem",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)"
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent-primary)" }}>{exams.length}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Papers</div>
          </div>
          <div style={{ width: "1px", background: "var(--border)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--success)" }}>{submissions.length}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Attempts</div>
          </div>
        </div>
      </div>

      {/* ─── Paper Type Filter Tabs & Availability Bar ─── */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        borderBottom: "1px solid var(--border)",
        marginBottom: "2rem"
      }}>
        {/* Paper Types */}
        <div style={{ display: "flex", gap: "0.25rem", overflowX: "auto" }}>
          {[
            { id: "all", label: "All Papers", count: exams.length, icon: "layers" as IconName },
            { id: "full_paper", label: "Full Papers", count: exams.filter((e) => (e.exam_type as string) === "full_paper" || (e.exam_type as string) === "full_exam").length, icon: "book-open" as IconName },
            { id: "paper_1_mcq", label: "Paper I (MCQ)", count: exams.filter((e) => e.exam_type === "paper_1_mcq").length, icon: "clipboard" as IconName },
            { id: "paper_2_structured", label: "Paper II-A (Structured)", count: exams.filter((e) => e.exam_type === "paper_2_structured").length, icon: "edit" as IconName },
            { id: "paper_2_essay", label: "Paper II-B (Essay)", count: exams.filter((e) => e.exam_type === "paper_2_essay").length, icon: "file-text" as IconName },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "0.75rem 1.1rem",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
                  color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease"
                }}
              >
                <SvgIcon name={tab.icon} size={15} />
                {tab.label}
                <span className="badge badge-secondary" style={{ fontSize: "0.68rem", padding: "0.15rem 0.4rem" }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Availability Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Availability:</span>
          <div style={{ display: "flex", gap: "0.25rem", background: "var(--bg-secondary)", padding: "0.2rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            {[
              { id: "all" as const, label: "All Papers" },
              { id: "active" as const, label: "Active Papers" },
              { id: "expired" as const, label: "Expired Papers" }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAvailabilityFilter(f.id)}
                style={{
                  padding: "0.25rem 0.65rem",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: availabilityFilter === f.id ? "var(--bg-card)" : "transparent",
                  color: availabilityFilter === f.id ? "var(--text-primary)" : "var(--text-muted)",
                  fontWeight: availabilityFilter === f.id ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  boxShadow: availabilityFilter === f.id ? "var(--shadow-sm)" : "none"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Available Exam Grid ─── */}
      <div style={{ marginBottom: "3.5rem" }}>
        {loading ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
            <div className="spinner" style={{ width: "28px", height: "28px", margin: "0 auto 1rem" }} />
            Loading Examination Studio...
          </div>
        ) : filteredExams.length === 0 ? (
          <div
            style={{
              padding: "3.5rem 2rem",
              background: "var(--bg-card)",
              border: "1px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(37, 99, 235, 0.1)",
                color: "var(--accent-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <SvgIcon name="file-text" size={28} />
            </div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
              No Examination Papers Available
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "450px", margin: "0 auto" }}>
              No examination papers match the selected criteria. Check back soon for newly published papers.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.5rem" }}>
            {filteredExams.map((exam) => {
              const badge = getTabBadge(exam.exam_type);
              const prevSub = submissionsByExamId[exam.id];

              return (
                <div
                  key={exam.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "var(--shadow-sm)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "0.5rem" }}>
                      <span className={`badge ${badge.color}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        <SvgIcon name={badge.icon} size={12} />
                        {badge.label}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <SvgIcon name="clock" size={13} />
                        {exam.time_limit_minutes} Mins
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem", lineHeight: 1.35 }}>
                      {exam.title}
                    </h3>

                    {exam.description && (
                      <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {exam.description}
                      </p>
                    )}
                  </div>

                  <div>
                    {/* Previous Attempt Summary if Available */}
                    {prevSub && (
                      <div style={{
                        padding: "0.6rem 0.8rem",
                        background: "var(--bg-secondary)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        marginBottom: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Last Attempt:</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: getGradeColor(prevSub.grade) }}>
                            {prevSub.percentage ? `${prevSub.percentage.toFixed(1)}%` : "Submitted"}
                          </span>
                          {prevSub.grade && (
                            <span className="badge badge-purple" style={{ fontSize: "0.68rem", fontWeight: 800 }}>
                              Grade: {prevSub.grade}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                        {exam.total_questions || 0} Questions
                      </div>

                      <Link
                        href={`/dashboard/student/al-exams/${exam.id}`}
                        className="btn btn-primary"
                        style={{ fontSize: "0.85rem", padding: "0.45rem 1.15rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem" }}
                      >
                        <span>{prevSub ? "Retake / Review Paper" : "Attempt Paper"}</span>
                        <SvgIcon name="arrow-right" size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: MY SUBMISSIONS & GRADED PAPERS WORKSTATION
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        marginTop: "3rem",
        paddingTop: "2rem",
        borderTop: "1px solid var(--border)"
      }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem"
        }}>
          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "0 0 0.25rem 0" }}>
              My Submissions &amp; Graded Question Papers
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
              Track grading progress, view teacher feedback, and review question-by-question scoring across all your completed A/L attempts.
            </p>
          </div>

          {/* Submission Filter Buttons */}
          <div style={{ display: "flex", gap: "0.35rem", background: "var(--bg-secondary)", padding: "0.25rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            {[
              { id: "all" as const, label: "All Attempts" },
              { id: "teacher_verified" as const, label: "Teacher Verified" },
              { id: "ai_graded" as const, label: "AI Evaluated" },
              { id: "pending" as const, label: "Pending Review" }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSubmissionFilter(f.id)}
                style={{
                  padding: "0.3rem 0.75rem",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: submissionFilter === f.id ? "var(--bg-card)" : "transparent",
                  color: submissionFilter === f.id ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: submissionFilter === f.id ? 700 : 500,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  boxShadow: submissionFilter === f.id ? "var(--shadow-sm)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submissions List Table / Card View */}
        {filteredSubmissions.length === 0 ? (
          <div style={{
            padding: "3rem 2rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            textAlign: "center"
          }}>
            <SvgIcon name="clipboard" size={32} style={{ color: "var(--text-muted)", opacity: 0.5, margin: "0 auto 0.75rem" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
              No Submissions Found
            </h3>
            <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: 0 }}>
              {submissions.length === 0
                ? "You haven't attempted any A/L Examination papers yet. Choose a paper above to start practicing!"
                : "No submissions match the current status filter."}
            </p>
          </div>
        ) : (
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            boxShadow: "var(--shadow-sm)"
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700, color: "var(--text-secondary)" }}>Paper Title &amp; Type</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Date Attempted</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Grading Status</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Marks / Scaled Score</th>
                    <th style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--text-secondary)" }}>Letter Grade</th>
                    <th style={{ padding: "0.85rem 1.25rem", fontWeight: 700, color: "var(--text-secondary)", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((sub) => {
                    const statusBadge = getSubmissionStatusBadge(sub.status);
                    const formattedDate = sub.started_at
                      ? new Date(sub.started_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Recently";

                    return (
                      <tr key={sub.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s ease" }}>
                        {/* Paper Title & Type */}
                        <td style={{ padding: "1rem 1.25rem" }}>
                          <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                            {sub.exam_title || `Examination #${sub.exam_id}`}
                          </div>
                          <span className="badge badge-secondary" style={{ fontSize: "0.68rem" }}>
                            {sub.exam_type ? sub.exam_type.replace(/_/g, " ").toUpperCase() : "A/L EXAM"}
                          </span>
                        </td>

                        {/* Date Attempted */}
                        <td style={{ padding: "1rem 1rem", color: "var(--text-secondary)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                          {formattedDate}
                        </td>

                        {/* Grading Status */}
                        <td style={{ padding: "1rem 1rem" }}>
                          <span className={`badge ${statusBadge.className}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", fontWeight: 600 }}>
                            <SvgIcon name={statusBadge.icon} size={13} />
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* Marks */}
                        <td style={{ padding: "1rem 1rem" }}>
                          {sub.status === "in_progress" ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Not submitted yet</span>
                          ) : (
                            <div>
                              <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>
                                {sub.scaled_score != null ? sub.scaled_score.toFixed(1) : sub.raw_score != null ? sub.raw_score.toFixed(1) : "--"}
                              </strong>
                              {sub.percentage != null && (
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "4px" }}>
                                  ({sub.percentage.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Letter Grade */}
                        <td style={{ padding: "1rem 1rem" }}>
                          {sub.grade ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.2rem 0.6rem",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border)",
                                fontWeight: 800,
                                fontSize: "0.85rem",
                                color: getGradeColor(sub.grade)
                              }}
                            >
                              Grade {sub.grade}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Pending</span>
                          )}
                        </td>

                        {/* Action Link */}
                        <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                          <Link
                            href={`/dashboard/student/al-exams/${sub.exam_id}`}
                            className="btn btn-secondary"
                            style={{
                              fontSize: "0.78rem",
                              padding: "0.35rem 0.85rem",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem"
                            }}
                          >
                            <span>{sub.status === "in_progress" ? "Continue Attempt" : "Review Paper & Marks"}</span>
                            <SvgIcon name="arrow-right" size={13} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentExamStudioPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center" }}>Loading Exams Studio...</div>}>
      <StudentExamStudioContent />
    </Suspense>
  );
}
