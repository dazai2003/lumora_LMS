"use client";

import React, { useState, useEffect } from "react";
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
  const [filter, setFilter] = useState<"all" | "low_confidence" | "flagged" | "corrected">("all");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setQuestions(prev => prev.map(q => 
        q.ai_response_id === aiResponseId 
          ? { ...q, is_flagged: isFlagged, teacher_correction: correctionText }
          : q
      ));
      setExpandedRowId(null);
      addToast("Moderation saved successfully!", "success");
    } catch {
      addToast("Failed to submit moderation. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics
  const totalQuestions = questions.length;
  const lowConfidenceCount = questions.filter(q => q.confidence_score !== undefined && q.confidence_score !== null && q.confidence_score < 0.7).length;
  const flaggedCount = questions.filter(q => q.is_flagged).length;
  const correctedCount = questions.filter(q => q.teacher_correction).length;

  // Filtering
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = (q.question_text || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (q.student_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (q.course_title || "").toLowerCase().includes(searchTerm.toLowerCase());
                          
    if (!matchesSearch) return false;
    
    if (courseFilter !== "all" && q.course_title !== courseFilter) return false;

    if (filter === "low_confidence") return q.confidence_score !== undefined && q.confidence_score !== null && q.confidence_score < 0.7;
    if (filter === "flagged") return q.is_flagged;
    if (filter === "corrected") return !!q.teacher_correction;
    
    return true;
  });

  const uniqueCourses = Array.from(new Set(questions.map(q => q.course_title).filter(Boolean)));

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
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header & Metrics */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Q&A Moderation</h1>
          <p>Review, flag, and correct AI Tutor responses generated for your students</p>
        </div>

        {/* Action Button */}
        <button className="btn-secondary" onClick={loadData} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <SvgIcon name="refresh" size={14} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(99,102,241,0.15)", color: "var(--accent-primary)" }}>
            <SvgIcon name="help-circle" size={22} />
          </div>
          <div>
            <div className="stat-value">{totalQuestions}</div>
            <div className="stat-label">Total Inquiries</div>
          </div>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
            <SvgIcon name="alert-triangle" size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "#f59e0b" }}>{lowConfidenceCount}</div>
            <div className="stat-label">Low Confidence (&lt;70%)</div>
          </div>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
            <SvgIcon name="flag" size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "#ef4444" }}>{flaggedCount}</div>
            <div className="stat-label">Flagged Answers</div>
          </div>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ padding: "0.6rem", borderRadius: "10px", background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
            <SvgIcon name="check-circle" size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: "#10b981" }}>{correctedCount}</div>
            <div className="stat-label">Teacher Corrected</div>
          </div>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: "340px" }}>
            <SvgIcon name="search" size={15} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              className="input"
              placeholder="Search question, student, or course..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: "2.4rem", fontSize: "0.85rem", width: "100%" }}
            />
          </div>

          <div className="tabs" style={{ marginBottom: 0 }}>
            {[
              { id: "all", label: `All (${totalQuestions})` },
              { id: "low_confidence", label: `Low Confidence (${lowConfidenceCount})` },
              { id: "flagged", label: `Flagged (${flaggedCount})` },
              { id: "corrected", label: `Corrected (${correctedCount})` },
            ].map((f) => (
              <button
                key={f.id}
                className={`tab ${filter === f.id ? "tab-active" : ""}`}
                onClick={() => setFilter(f.id as any)}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {uniqueCourses.length > 0 && (
          <select
            className="input"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            style={{ fontSize: "0.85rem", width: "auto", minWidth: "160px" }}
          >
            <option value="all">All Courses</option>
            {uniqueCourses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main Table View */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {filteredQuestions.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem" }}>
            <SvgIcon name="message-circle" size={40} style={{ opacity: 0.3, marginBottom: "1rem" }} />
            <div className="empty-state-title">No Q&A Inquiries Found</div>
            <div className="empty-state-desc">No student questions match your selected search or filter criteria.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-body)" }}>
                <th style={{ padding: "1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Student & Course</th>
                <th style={{ padding: "1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Question Snippet</th>
                <th style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>AI Confidence</th>
                <th style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "1rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map(q => {
                const confBadge = getConfidenceBadge(q.confidence_score);
                const isExpanded = expandedRowId === q.question_id;

                return (
                  <React.Fragment key={q.question_id}>
                    <tr 
                      style={{ 
                        borderBottom: "1px solid var(--border-subtle, var(--border))",
                        background: isExpanded ? "rgba(99, 102, 241, 0.06)" : "transparent",
                        transition: "background 0.2s"
                      }}
                    >
                      <td style={{ padding: "1rem" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{q.student_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--accent-primary)", marginTop: "0.15rem" }}>{q.course_title}</div>
                      </td>

                      <td style={{ padding: "1rem", maxWidth: "320px" }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)", fontWeight: 500 }}>
                          {q.question_text}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                          {new Date(q.asked_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </td>

                      <td style={{ padding: "1rem", textAlign: "center" }}>
                        <span className={`badge ${confBadge.style}`}>
                          {confBadge.label}
                        </span>
                      </td>

                      <td style={{ padding: "1rem", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", flexWrap: "wrap" }}>
                          {q.is_flagged && <span className="badge badge-error">FLAGGED</span>}
                          {q.teacher_correction && <span className="badge badge-success">CORRECTED</span>}
                          {!q.is_flagged && !q.teacher_correction && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Normal</span>}
                        </div>
                      </td>

                      <td style={{ padding: "1rem", textAlign: "right" }}>
                        <button 
                          onClick={() => handleExpand(q)}
                          className={isExpanded ? "btn-secondary" : "btn-primary"}
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                        >
                          {isExpanded ? "Close" : "Review"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Review Panel */}
                    {isExpanded && (
                      <tr style={{ background: "var(--bg-body)", borderBottom: "1px solid var(--border)" }}>
                        <td colSpan={5} style={{ padding: "1.25rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                              {/* Student Question */}
                              <div style={{ background: "var(--bg-card)", padding: "1rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-primary)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <SvgIcon name="help-circle" size={14} />
                                  Student Question
                                </div>
                                <div style={{ color: "var(--text-primary)", fontSize: "0.95rem", lineHeight: 1.5, fontWeight: 500 }}>
                                  {q.question_text}
                                </div>
                              </div>

                              {/* Original AI Response */}
                              <div style={{ background: "var(--bg-card)", padding: "1rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <SvgIcon name="sparkle" size={14} />
                                  Generated AI Answer
                                </div>
                                <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, maxHeight: "180px", overflowY: "auto" }}>
                                  <ReactMarkdown>{q.response_text || "No AI response recorded."}</ReactMarkdown>
                                </div>
                              </div>
                            </div>

                            {/* Moderation Form */}
                            <div style={{ background: "var(--bg-card)", padding: "1.25rem", borderRadius: "10px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <SvgIcon name="edit" size={16} style={{ color: "var(--accent-primary)" }} />
                                Teacher Review & Correction
                              </h4>

                              <div>
                                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                                  Correction or Supplemental Explanation (Visible to Student):
                                </label>
                                <textarea
                                  className="input-field"
                                  placeholder="Type the corrected or improved answer here..."
                                  value={correctionText}
                                  onChange={(e) => setCorrectionText(e.target.value)}
                                  rows={3}
                                  style={{ width: "100%", fontSize: "0.9rem" }}
                                />
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500 }}>
                                  <input
                                    type="checkbox"
                                    checked={isFlagged}
                                    onChange={(e) => setIsFlagged(e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: "#ef4444" }}
                                  />
                                  <span>Flag this AI answer as inaccurate or misleading</span>
                                </label>

                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  <button
                                    className="btn-secondary"
                                    onClick={() => setExpandedRowId(null)}
                                    style={{ fontSize: "0.85rem" }}
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    className="btn-primary"
                                    disabled={submitting}
                                    onClick={() => handleSubmitModeration(q.ai_response_id)}
                                    style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                                  >
                                    {submitting ? (
                                      <SvgIcon name="refresh" className="spin" size={14} />
                                    ) : (
                                      <>
                                        <SvgIcon name="check" size={14} />
                                        <span>Save Moderation</span>
                                      </>
                                    )}
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
