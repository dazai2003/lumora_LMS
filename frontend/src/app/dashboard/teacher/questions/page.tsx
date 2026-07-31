"use client";

import { useState, useEffect } from "react";
import api, { TeacherQuestionView } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";

export default function TeacherQuestionsPage() {
  const [questions, setQuestions] = useState<TeacherQuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "answered" | "unanswered">("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    api.getTeacherAllQuestions().then(setQuestions).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = questions.filter((q) => {
    if (filter === "answered" && !q.is_answered) return false;
    if (filter === "unanswered" && q.is_answered) return false;
    if (courseFilter !== "all" && q.course_title !== courseFilter) return false;
    if (searchQuery) {
      const qLower = searchQuery.toLowerCase();
      if (!q.question_text.toLowerCase().includes(qLower) && !q.student_name.toLowerCase().includes(qLower)) return false;
    }
    return true;
  });

  const uniqueCourses = Array.from(new Set(questions.map(q => q.course_title))).sort();

  const confidenceBadge = (score?: number) => {
    if (!score) return "badge-error";
    if (score >= 0.7) return "badge-success";
    if (score >= 0.4) return "badge-warning";
    return "badge-error";
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Student Questions</h1>
          <p>Monitor what students are asking the AI tutor</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.85rem" }}>
          <div className="stat-card" style={{ padding: "0.5rem 1rem", minWidth: "auto" }}>
            <div className="stat-value" style={{ fontSize: "1.25rem" }}>{questions.length}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-card" style={{ padding: "0.5rem 1rem", minWidth: "auto" }}>
            <div className="stat-value" style={{ fontSize: "1.25rem", color: "var(--success)" }}>{questions.filter(q => q.is_answered).length}</div>
            <div className="stat-label">Answered</div>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div className="tabs">
          {(["all", "answered", "unanswered"] as const).map((f) => {
            const count = questions.filter(q => {
              if (courseFilter !== "all" && q.course_title !== courseFilter) return false;
              if (f === "answered") return q.is_answered;
              if (f === "unanswered") return !q.is_answered;
              if (searchQuery) {
                const qLower = searchQuery.toLowerCase();
                if (!q.question_text.toLowerCase().includes(qLower) && !q.student_name.toLowerCase().includes(qLower)) return false;
              }
              return true;
            }).length;
            return (
              <button key={f} className={`tab ${filter === f ? "tab-active" : ""}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "1rem", flex: 1, justifyContent: "flex-end", maxWidth: "500px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <SvgIcon name="search" size={16} style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Search questions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "2.5rem", width: "100%" }}
            />
          </div>
          {uniqueCourses.length > 1 && (
            <select 
              className="select" 
              style={{ width: "200px" }}
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All Courses</option>
              {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((q) => (
            <div
              key={q.question_id}
              className="card"
              style={{ cursor: "pointer", transition: "all 0.15s ease" }}
              onClick={() => setExpandedId(expandedId === q.question_id ? null : q.question_id)}
            >
              {/* Question Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: "0.95rem", marginBottom: "0.5rem", lineHeight: 1.5 }}>
                    {q.question_text}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <span>{q.student_name}</span>
                    <span>&middot;</span>
                    <span className="badge badge-info">{q.course_title}</span>
                    <span>&middot;</span>
                    <span>{new Date(q.asked_at).toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
                  {q.confidence_score !== undefined && q.confidence_score !== null && (
                    <span className={`badge ${confidenceBadge(q.confidence_score)}`}>
                      {(q.confidence_score * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className={`badge ${q.is_answered ? "badge-success" : "badge-warning"}`}>
                    {q.is_answered ? "Answered" : "Pending"}
                  </span>
                </div>
              </div>

              {/* Expanded AI Response */}
              {expandedId === q.question_id && q.response_text && (
                <div
                  className="animate-fade-in"
                  style={{
                    marginTop: "1rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-primary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    AI Response
                  </div>
                  {q.response_text}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <SvgIcon name="message-circle" className="empty-state-icon" style={{ opacity: 0.4 }} />
            <div className="empty-state-title">No questions yet</div>
            <div className="empty-state-desc">
              {filter !== "all" ? "No questions match this filter." : "Students haven't asked any questions yet. Once they use the Ask AI feature, their questions will appear here."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
