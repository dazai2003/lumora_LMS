"use client";

import React, { useState, useEffect, useMemo } from "react";
import api, { TeacherQuestionView } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/ui/Toast";
import { SkeletonQAModeration } from "@/components/ui/Skeleton";
import { SvgIcon } from "@/components/SvgIcon";

export default function QAModerationPage() {
  const { addToast } = useToast();
  const [questions, setQuestions] = useState<TeacherQuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "flagged" | "low_confidence" | "resolved">("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  // Expanded row state
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Moderation form state
  const [correctionText, setCorrectionText] = useState("");
  const [isFlagged, setIsFlagged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getTeacherAllQuestions();
      setQuestions(data || []);
    } catch {
      addToast("Could not load Q&A questions.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExpand = (q: TeacherQuestionView) => {
    if (expandedRowId === q.question_id) {
      setExpandedRowId(null);
    } else {
      setExpandedRowId(q.question_id);
      setCorrectionText(q.teacher_correction || "");
      setIsFlagged(q.is_flagged || false);
    }
  };

  const handleSubmitModeration = async (aiResponseId?: number) => {
    if (!aiResponseId) return;
    setSubmitting(true);
    try {
      await api.moderateAIResponse(aiResponseId, {
        is_flagged: isFlagged,
        correction_text: correctionText,
      });
      setQuestions((prev) =>
        prev.map((q) =>
          q.ai_response_id === aiResponseId
            ? { ...q, is_flagged: isFlagged, teacher_correction: correctionText }
            : q
        )
      );
      setExpandedRowId(null);
      addToast("Inquiry moderated and marked as Resolved!", "success");
    } catch {
      addToast("Failed to submit moderation. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics calculation
  const totalQuestions = questions.length;
  const resolvedCount = useMemo(() => {
    return questions.filter((q) => !!q.teacher_correction?.trim()).length;
  }, [questions]);
  const pendingCount = totalQuestions - resolvedCount;
  const flaggedCount = useMemo(() => {
    return questions.filter((q) => q.is_flagged).length;
  }, [questions]);
  const lowConfidenceCount = useMemo(() => {
    return questions.filter(
      (q) => q.confidence_score !== undefined && q.confidence_score !== null && q.confidence_score < 0.7
    ).length;
  }, [questions]);

  // Filtering
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        (q.question_text || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.student_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.course_title || "").toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (courseFilter !== "all" && q.course_title !== courseFilter) return false;

      const isResolved = !!q.teacher_correction?.trim();

      if (filter === "pending") return !isResolved;
      if (filter === "resolved") return isResolved;
      if (filter === "flagged") return q.is_flagged;
      if (filter === "low_confidence")
        return q.confidence_score !== undefined && q.confidence_score !== null && q.confidence_score < 0.7;

      return true;
    });
  }, [questions, searchTerm, courseFilter, filter]);

  const uniqueCourses = Array.from(new Set(questions.map((q) => q.course_title).filter(Boolean)));

  const getConfidenceBadge = (score: number | undefined | null) => {
    if (score === undefined || score === null) return { label: "N/A", style: "badge-secondary" };
    const pct = (score * 100).toFixed(0) + "%";
    if (score >= 0.7) return { label: pct, style: "badge-success" };
    if (score >= 0.4) return { label: pct, style: "badge-warning" };
    return { label: pct, style: "badge-error" };
  };

  if (loading) {
    return <SkeletonQAModeration />;
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "1300px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <SvgIcon name="scale" size={24} /> Q&amp;A Moderation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
            Review, audit, and provide authoritative teacher corrections for AI Tutor student inquiries
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadData} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <SvgIcon name="refresh" size={14} />
          <span>Refresh Inquiries</span>
        </button>
      </div>

      {/* KPI Metrics Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className="card" style={{ padding: "1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Inquiries</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>{totalQuestions}</div>
        </div>

        <div className="card" style={{ padding: "1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--warning)", textTransform: "uppercase" }}>Pending Review</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--warning)", marginTop: "2px" }}>{pendingCount}</div>
        </div>

        <div className="card" style={{ padding: "1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#EF4444", textTransform: "uppercase" }}>Flagged Content</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#EF4444", marginTop: "2px" }}>{flaggedCount}</div>
        </div>

        <div className="card" style={{ padding: "1rem 1.25rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--success)", textTransform: "uppercase" }}>Resolved &amp; Corrected</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--success)", marginTop: "2px" }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: "300px" }}>
            <SvgIcon name="search" size={15} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              className="input"
              placeholder="Search inquiry, student, or topic..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: "2.4rem", fontSize: "0.85rem", width: "100%", height: "36px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${totalQuestions})` },
              { id: "pending", label: `Pending Review (${pendingCount})` },
              { id: "flagged", label: `Flagged (${flaggedCount})` },
              { id: "low_confidence", label: `Low Confidence (${lowConfidenceCount})` },
              { id: "resolved", label: `Resolved (${resolvedCount})` },
            ].map((f) => {
              const isSel = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as any)}
                  className={`btn btn-sm ${isSel ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {uniqueCourses.length > 0 && (
          <select
            className="input"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            style={{ fontSize: "0.85rem", width: "auto", minWidth: "160px", height: "36px" }}
          >
            <option value="all">All Courses</option>
            {uniqueCourses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main Table View */}
      <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        {filteredQuestions.length === 0 ? (
          <div className="empty-state" style={{ padding: "3.5rem 1.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
              <SvgIcon name="message-circle" size={40} style={{ opacity: 0.35 }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>No Q&amp;A Inquiries Found</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2px" }}>
              {filter === "resolved"
                ? "No teacher-resolved inquiries recorded yet."
                : "No student questions match your selected search or filter criteria."}
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>Student &amp; Course</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>Question Stem</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>Confidence</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((q) => {
                const confBadge = getConfidenceBadge(q.confidence_score);
                const isExpanded = expandedRowId === q.question_id;
                const isResolved = !!q.teacher_correction?.trim();

                return (
                  <React.Fragment key={q.question_id}>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isExpanded ? "var(--bg-primary)" : "transparent",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <td style={{ padding: "0.9rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {q.student_name || "Enrolled Learner"}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {q.course_title || "General Course"}
                        </div>
                      </td>

                      <td style={{ padding: "0.9rem 1rem", maxWidth: "380px" }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.4 }}>
                          {q.question_text.length > 110 ? `${q.question_text.slice(0, 110)}...` : q.question_text}
                        </div>
                      </td>

                      <td style={{ padding: "0.9rem 1rem", textAlign: "center" }}>
                        <span className={`badge ${confBadge.style}`} style={{ fontWeight: 700, fontSize: "0.74rem" }}>
                          {confBadge.label}
                        </span>
                      </td>

                      <td style={{ padding: "0.9rem 1rem", textAlign: "center" }}>
                        {isResolved ? (
                          <span className="badge badge-success" style={{ fontWeight: 700, fontSize: "0.72rem" }}>
                            RESOLVED
                          </span>
                        ) : q.is_flagged ? (
                          <span className="badge badge-error" style={{ fontWeight: 700, fontSize: "0.72rem" }}>
                            FLAGGED
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontWeight: 700, fontSize: "0.72rem" }}>
                            PENDING
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "0.9rem 1rem", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
                          onClick={() => handleExpand(q)}
                        >
                          {isExpanded ? "Close" : isResolved ? "View Review" : "Moderate & Review"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Review & Correction Panel */}
                    {isExpanded && (
                      <tr style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}>
                        <td colSpan={5} style={{ padding: "1.25rem 1.5rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {/* Question & AI Response Comparison */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
                              {/* Student Question */}
                              <div style={{ background: "var(--bg-card)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-primary)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <SvgIcon name="help-circle" size={14} /> Student Question
                                </div>
                                <div style={{ color: "var(--text-primary)", fontSize: "0.92rem", lineHeight: 1.5, fontWeight: 500 }}>
                                  {q.question_text}
                                </div>
                              </div>

                              {/* AI Response */}
                              <div style={{ background: "var(--bg-card)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <SvgIcon name="sparkle" size={14} /> AI Tutor Generated Answer
                                </div>
                                <div style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, maxHeight: "180px", overflowY: "auto" }}>
                                  <ReactMarkdown>{q.response_text || "No AI response recorded."}</ReactMarkdown>
                                </div>
                              </div>
                            </div>

                            {/* Existing Teacher Authoritative Correction (if resolved) */}
                            {q.teacher_correction && (
                              <div style={{ padding: "0.9rem 1.1rem", background: "rgba(16, 185, 129, 0.05)", borderRadius: "var(--radius-md)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                                  <SvgIcon name="check-circle" size={14} /> Published Teacher Review &amp; Correction
                                </div>
                                <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                                  {q.teacher_correction}
                                </div>
                              </div>
                            )}

                            {/* Moderation & Edit Form */}
                            <div style={{ background: "var(--bg-card)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <SvgIcon name="edit" size={16} /> Teacher Review &amp; Correction Editor
                              </h4>

                              <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                                  Correction or Authoritative Explanation (Dispatched to Student):
                                </label>
                                <textarea
                                  className="form-input"
                                  placeholder="Type the corrected or authoritative explanation here..."
                                  value={correctionText}
                                  onChange={(e) => setCorrectionText(e.target.value)}
                                  rows={3}
                                  style={{ width: "100%", fontSize: "0.88rem", padding: "0.6rem" }}
                                />
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 600 }}>
                                  <input
                                    type="checkbox"
                                    checked={isFlagged}
                                    onChange={(e) => setIsFlagged(e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: "#EF4444" }}
                                  />
                                  <span>Flag AI answer as inaccurate or misleading</span>
                                </label>

                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setExpandedRowId(null)}
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={submitting}
                                    onClick={() => handleSubmitModeration(q.ai_response_id)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                                  >
                                    <SvgIcon name="check-circle" size={15} />
                                    <span>{submitting ? "Saving..." : "Resolve & Save Correction"}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
