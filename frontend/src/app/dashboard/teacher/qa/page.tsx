"use client";

import React, { useState, useEffect } from "react";
import api, { TeacherQuestionView } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/ui/Toast";
import { SkeletonStatCard, SkeletonTableRow } from "@/components/ui/Skeleton";
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

  const handleSubmitModeration = async (aiResponseId: number) => {
    if (!aiResponseId) return;
    setSubmitting(true);
    try {
      await api.moderateAIResponse(aiResponseId, {
        is_flagged: isFlagged,
        correction_text: correctionText,
      });
      // Optimistically update
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

  // Derived metrics
  const totalQuestions = questions.length;
  const avgConfidence = totalQuestions > 0 
    ? questions.reduce((sum, q) => sum + (q.confidence_score || 0), 0) / totalQuestions 
    : 0;
  const totalCorrections = questions.filter(q => q.teacher_correction).length;

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

  const getConfidenceColor = (score: number | undefined | null) => {
    if (score === undefined || score === null) return "var(--text-muted)";
    if (score >= 0.7) return "var(--success)";
    if (score >= 0.4) return "var(--warning)";
    return "var(--error)";
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h1>Q&A Moderation</h1>
          <p>Loading questions...</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
              <SkeletonTableRow columns={5} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Q&A Moderation</h1>
        <p>Review, flag, and correct AI Tutor responses across your courses</p>
      </div>

      {/* Filters & Search */}
      <div className="card" style={{ marginBottom: "1.5rem", padding: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="input"
            placeholder="Search questions or students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ minWidth: "250px", flex: 1 }}
          />
          <select 
            className="input" 
            value={courseFilter} 
            onChange={(e) => setCourseFilter(e.target.value)}
            style={{ minWidth: "200px" }}
          >
            <option value="all">All Courses</option>
            {uniqueCourses.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {[
              { id: "all", label: "All Questions" },
              { id: "low_confidence", label: "Low Confidence" },
              { id: "flagged", label: "Flagged" },
              { id: "corrected", label: "Corrected" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: filter === f.id ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  background: filter === f.id ? "rgba(99,102,241,0.15)" : "transparent",
                  color: filter === f.id ? "var(--accent-primary)" : "var(--text-muted)",
                  transition: "all 0.2s"
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inline Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Showing <strong>{filteredQuestions.length}</strong> of {totalQuestions} questions
        </span>
      </div>

      {/* Data Table */}
      <div className="card" style={{ padding: 0, overflow: "x-auto" }}>
        {filteredQuestions.length === 0 ? (
          <div className="empty-state">
            <SvgIcon name="message-circle" className="empty-state-icon" />
            <div className="empty-state-title">No questions found</div>
            <div className="empty-state-desc">Try adjusting your search or filters.</div>
          </div>
        ) : (
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th style={{ padding: "1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-card)" }}>Student & Course</th>
                <th style={{ padding: "1rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-card)" }}>Question Snippet</th>
                <th style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-card)" }}>AI Confidence</th>
                <th style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-card)" }}>Status</th>
                <th style={{ padding: "1rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, zIndex: 10, background: "var(--bg-card)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map(q => (
                <React.Fragment key={q.question_id}>
                  {/* Main Row */}
                  <tr 
                    style={{ 
                      background: expandedRowId === q.question_id ? "var(--bg-card-hover)" : "transparent",
                      transition: "background 0.2s"
                    }}
                  >
                    <td style={{ padding: "1rem" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{q.student_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{q.course_title}</div>
                    </td>
                    <td style={{ padding: "1rem", maxWidth: "300px" }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
                        {q.question_text}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {new Date(q.asked_at).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      {q.confidence_score !== null && q.confidence_score !== undefined ? (
                        <span style={{ 
                          padding: "4px 8px", 
                          borderRadius: "12px", 
                          fontSize: "0.75rem", 
                          fontWeight: 600,
                          background: `${getConfidenceColor(q.confidence_score)}20`,
                          color: getConfidenceColor(q.confidence_score),
                          border: `1px solid ${getConfidenceColor(q.confidence_score)}`
                        }}>
                          {(q.confidence_score * 100).toFixed(0)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                        {q.is_flagged && <span style={{ padding: "2px 6px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 600 }}>FLAGGED</span>}
                        {q.teacher_correction && <span style={{ padding: "2px 6px", background: "rgba(52, 211, 153, 0.15)", color: "#34d399", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 600 }}>CORRECTED</span>}
                        {!q.is_flagged && !q.teacher_correction && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <button 
                        onClick={() => handleExpand(q)}
                        className={expandedRowId === q.question_id ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
                      >
                        {expandedRowId === q.question_id ? "Close" : "Review"}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Moderation Panel */}
                  {expandedRowId === q.question_id && (
                    <tr style={{ background: "var(--bg-input)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <td colSpan={5} style={{ padding: "1.5rem" }}>
                        <div className="animate-fade-in" style={{ display: "flex", gap: "2rem" }}>
                          
                          {/* Left Col: Q & A Context */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ marginBottom: "1.5rem" }}>
                              <h4 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                                Student Question
                              </h4>
                              <div style={{ padding: "1rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                                {q.question_text}
                              </div>
                            </div>

                            <div>
                              <h4 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                                AI Response
                              </h4>
                              <div style={{ 
                                padding: "1rem", 
                                background: "rgba(255,255,255,0.02)", 
                                borderRadius: "8px", 
                                border: "1px solid var(--border-subtle)", 
                                color: "var(--text-secondary)",
                                fontSize: "0.9rem",
                                maxHeight: "300px",
                                overflowY: "auto"
                              }}>
                                {q.response_text ? (
                                  <ReactMarkdown 
                                    components={{
                                      p: ({node, ...props}) => <p style={{ marginBottom: "0.5rem" }} {...props} />,
                                      pre: ({node, ...props}) => <pre style={{ background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "8px", overflowX: "auto", marginBottom: "1rem" }} {...props} />,
                                      code: ({node, ...props}) => <code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 4px", borderRadius: "4px", fontSize: "0.85em" }} {...props} />,
                                    }}
                                  >
                                    {q.response_text}
                                  </ReactMarkdown>
                                ) : "No AI response recorded."}
                              </div>
                            </div>
                          </div>

                          {/* Right Col: Moderation Actions */}
                          <div style={{ flex: "0 0 350px" }}>
                            <div className="card" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)" }}>
                              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span>Moderation Actions</span>
                              </h3>
                              
                              {/* Flag Toggle */}
                              <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", marginBottom: "1.5rem", padding: "0.75rem", background: isFlagged ? "rgba(239, 68, 68, 0.1)" : "rgba(255,255,255,0.03)", borderRadius: "6px", border: isFlagged ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border-subtle)", transition: "all 0.2s" }}>
                                <input 
                                  type="checkbox" 
                                  checked={isFlagged}
                                  onChange={(e) => setIsFlagged(e.target.checked)}
                                  style={{ width: "16px", height: "16px", accentColor: "#ef4444", cursor: "pointer" }}
                                />
                                <span style={{ fontSize: "0.9rem", color: isFlagged ? "#ef4444" : "var(--text-primary)", fontWeight: isFlagged ? 600 : 400 }}>
                                  Flag as Inaccurate / Inappropriate
                                </span>
                              </label>

                              {/* Correction Box */}
                              <div style={{ marginBottom: "1.5rem" }}>
                                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 500 }}>
                                  Teacher Override / Note to Student:
                                </label>
                                <textarea
                                  className="input"
                                  placeholder="Type your correction or note here. This will be shown to the student above the AI's answer..."
                                  value={correctionText}
                                  onChange={(e) => setCorrectionText(e.target.value)}
                                  style={{ width: "100%", height: "120px", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", padding: "0.75rem" }}
                                />
                              </div>

                              <button 
                                onClick={() => handleSubmitModeration(q.ai_response_id!)}
                                disabled={submitting || (!isFlagged && !correctionText && !q.is_flagged && !q.teacher_correction)} // disable if no changes made and none existed
                                className="btn-primary"
                                style={{ width: "100%", padding: "0.75rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
                              >
                                {submitting ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "Save Moderation"}
                              </button>
                            </div>
                          </div>

                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
