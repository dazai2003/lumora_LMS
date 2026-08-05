"use client";

import React, { useState, useEffect } from "react";
import api, { GradingQueueItem, AttemptDetail, AttemptDetailAnswer } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SkeletonGradingQueue } from "@/components/ui/Skeleton";
import { SvgIcon } from "@/components/SvgIcon";

export default function GradingQueuePage() {
  const { addToast } = useToast();
  const [attempts, setAttempts] = useState<GradingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<AttemptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [tabFilter, setTabFilter] = useState<"pending" | "graded" | "all">("pending");

  // Grading state per answer
  const [gradingStates, setGradingStates] = useState<Record<number, {
    is_correct: boolean;
    points_earned: number;
    teacher_note: string;
  }>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getGradingQueue();
      setAttempts(data || []);
    } catch {
      addToast("Could not load grading queue.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive unique courses for filter
  const courseNames = Array.from(new Set(attempts.map(a => a.course_title))).sort();

  // Filter by course and status tab, then group by quiz
  const filtered = attempts.filter(a => {
    const matchesCourse = courseFilter === "all" || a.course_title === courseFilter;
    const isPending = a.is_pending_review ?? (a.pending_short_answers_count > 0 || a.integrity_warnings > 0 || a.flagged_answers_count > 0);
    const matchesTab = tabFilter === "all" || (tabFilter === "pending" ? isPending : !isPending);
    return matchesCourse && matchesTab;
  });
  const groupedByQuiz: Record<string, { quiz_title: string; course_title: string; quiz_id: number; items: GradingQueueItem[] }> = {};
  for (const a of filtered) {
    const key = `${a.quiz_id}`;
    if (!groupedByQuiz[key]) {
      groupedByQuiz[key] = { quiz_title: a.quiz_title, course_title: a.course_title, quiz_id: a.quiz_id, items: [] };
    }
    groupedByQuiz[key].items.push(a);
  }
  const quizGroups = Object.values(groupedByQuiz);

  const handleExpand = async (a: GradingQueueItem) => {
    if (expandedId === a.attempt_id) {
      setExpandedId(null);
      setAttemptDetail(null);
      return;
    }

    setExpandedId(a.attempt_id);
    setLoadingDetail(true);
    setAttemptDetail(null);

    try {
      const detail = await api.getAttemptDetail(a.quiz_id, a.attempt_id);
      setAttemptDetail(detail);

      // Initialize grading states for answers that need grading
      const states: typeof gradingStates = {};
      for (const ans of detail.answers) {
        if (ans.is_correct === null || ans.is_correct === undefined || ans.is_flagged) {
          states[ans.id] = {
            is_correct: ans.is_correct ?? false,
            points_earned: ans.points_earned ?? 0,
            teacher_note: ans.teacher_note || "",
          };
        }
      }
      setGradingStates(states);
    } catch {
      addToast("Failed to load attempt details.", "error");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveGrade = async (answerId: number) => {
    const state = gradingStates[answerId];
    if (!state) return;

    setSavingAnswerId(answerId);
    try {
      await api.moderateQuizAnswer(answerId, {
        is_correct: state.is_correct,
        points_earned: state.points_earned,
        teacher_note: state.teacher_note || undefined,
      });
      addToast("Grade saved successfully!", "success");

      // Refresh data
      await loadData();
      if (expandedId) {
        const current = attempts.find(a => a.attempt_id === expandedId);
        if (current) {
          const detail = await api.getAttemptDetail(current.quiz_id, current.attempt_id);
          setAttemptDetail(detail);
        }
      }
    } catch {
      addToast("Failed to save grade.", "error");
    } finally {
      setSavingAnswerId(null);
    }
  };

  const updateGradingState = (answerId: number, updates: Partial<typeof gradingStates[number]>) => {
    setGradingStates(prev => ({
      ...prev,
      [answerId]: { ...prev[answerId], ...updates }
    }));
  };

  const getAnswerStatusIcon = (ans: AttemptDetailAnswer) => {
    if (ans.is_correct === null || ans.is_correct === undefined) return { icon: "clock", color: "#F59E0B", label: "Pending" };
    if (ans.is_flagged) return { icon: "alert-triangle", color: "#EF4444", label: "Flagged" };
    if (ans.is_overridden) return { icon: "check-circle", color: "#8B5CF6", label: "Overridden" };
    if (ans.is_correct) return { icon: "check-circle", color: "#10B981", label: "Correct" };
    return { icon: "x", color: "#EF4444", label: "Incorrect" };
  };

  if (loading) {
    return <SkeletonGradingQueue />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Grading Queue</h1>
        <p>Review attempts with integrity warnings or pending short answer grades.</p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-primary)" }}>{filtered.length}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Pending Reviews</div>
        </div>
        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#F59E0B" }}>
            {filtered.reduce((s, a) => s + a.pending_short_answers_count, 0)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Short Answers to Grade</div>
        </div>
        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#EF4444" }}>
            {filtered.reduce((s, a) => s + a.integrity_warnings, 0)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Integrity Warnings</div>
        </div>
      </div>

      {/* Status Category Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.5rem" }}>
        <button
          className={`btn-sm ${tabFilter === "pending" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTabFilter("pending")}
          style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          <SvgIcon name="clock" size={14} />
          <span>Pending Review ({attempts.filter(a => a.is_pending_review ?? (a.pending_short_answers_count > 0 || a.integrity_warnings > 0 || a.flagged_answers_count > 0)).length})</span>
        </button>
        <button
          className={`btn-sm ${tabFilter === "graded" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTabFilter("graded")}
          style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          <SvgIcon name="check-circle" size={14} />
          <span>Graded & Completed History ({attempts.filter(a => !(a.is_pending_review ?? (a.pending_short_answers_count > 0 || a.integrity_warnings > 0 || a.flagged_answers_count > 0))).length})</span>
        </button>
        <button
          className={`btn-sm ${tabFilter === "all" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTabFilter("all")}
          style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          <SvgIcon name="layers" size={14} />
          <span>All Submissions ({attempts.length})</span>
        </button>
      </div>

      {/* Course Filter */}
      {courseNames.length > 1 && (
        <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Filter by Course:</span>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setCourseFilter("all")}
              style={{
                padding: "0.35rem 0.85rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 500,
                border: courseFilter === "all" ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                background: courseFilter === "all" ? "rgba(99,102,241,0.08)" : "transparent",
                color: courseFilter === "all" ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
            >
              All ({attempts.length})
            </button>
            {courseNames.map(c => {
              const count = attempts.filter(a => a.course_title === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setCourseFilter(c)}
                  style={{
                    padding: "0.35rem 0.85rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 500,
                    border: courseFilter === c ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                    background: courseFilter === c ? "rgba(99,102,241,0.08)" : "transparent",
                    color: courseFilter === c ? "var(--accent-primary)" : "var(--text-secondary)",
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                >
                  {c} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped Queue */}
      {filtered.length === 0 ? (
        <div className="card empty-state" style={{ padding: "4rem" }}>
          <SvgIcon name="check-circle" className="empty-state-icon" style={{ opacity: 0.4, color: "var(--success)" }} />
          <div className="empty-state-title">You're all caught up!</div>
          <div className="empty-state-desc">No pending grading or integrity reviews.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {quizGroups.map(group => (
            <div key={group.quiz_id}>
              {/* Quiz Group Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "0.75rem", padding: "0 0.25rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <SvgIcon name="clipboard" size={18} style={{ color: "var(--accent-primary)" }} />
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {group.quiz_title}
                  </h3>
                  <span style={{
                    fontSize: "0.7rem", fontWeight: 600, padding: "3px 10px", borderRadius: 12,
                    background: "rgba(99,102,241,0.08)", color: "var(--accent-primary)",
                  }}>
                    {group.course_title}
                  </span>
                </div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                  {group.items.length} attempt{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Attempts within group */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {group.items.map(a => {
            const isExpanded = expandedId === a.attempt_id;
            return (
              <div key={a.attempt_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header Row */}
                <div
                  onClick={() => handleExpand(a)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "1.25rem 1.5rem", cursor: "pointer",
                    transition: "background 0.15s ease",
                    background: isExpanded ? "var(--bg-primary)" : "transparent",
                  }}
                  onMouseEnter={(e) => !isExpanded && ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-primary)")}
                  onMouseLeave={(e) => !isExpanded && ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: a.integrity_warnings > 0 ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <SvgIcon
                        name={a.integrity_warnings > 0 ? "alert-triangle" : "file-text"}
                        size={20}
                        style={{ color: a.integrity_warnings > 0 ? "#EF4444" : "#6366F1" }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                        {a.student_name}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span>{a.quiz_title}</span>
                        <span>·</span>
                        <span>{a.course_title}</span>
                        <span>·</span>
                        <span>{new Date(a.submitted_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    {a.pending_short_answers_count > 0 && (
                      <span className="badge badge-warning" style={{ fontSize: "0.7rem" }}>
                        {a.pending_short_answers_count} Pending
                      </span>
                    )}
                    {a.flagged_answers_count > 0 && (
                      <span className="badge badge-error" style={{ fontSize: "0.7rem" }}>
                        {a.flagged_answers_count} Flagged
                      </span>
                    )}
                    {a.integrity_warnings > 0 && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "0.25rem",
                        color: "#EF4444", background: "rgba(239,68,68,0.1)",
                        padding: "4px 8px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 600,
                      }}>
                        <SvgIcon name="alert-triangle" size={12} /> {a.integrity_warnings}
                      </span>
                    )}
                    <div style={{ textAlign: "right", minWidth: 60 }}>
                      <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {a.score}/{a.total_points}
                      </div>
                    </div>
                    <SvgIcon
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      style={{ color: "var(--text-muted)" }}
                    />
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div
                    className="animate-fade-in"
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      padding: "1.5rem",
                      background: "var(--bg-body)",
                    }}
                  >
                    {/* Integrity Events */}
                    {a.events && a.events.length > 0 && (
                      <div style={{
                        marginBottom: "1.5rem", padding: "1rem",
                        background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                        borderRadius: "var(--radius-md)",
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: "0.5rem",
                          fontSize: "0.85rem", fontWeight: 600, color: "#EF4444", marginBottom: "0.75rem",
                        }}>
                          <SvgIcon name="alert-triangle" size={16} /> Integrity Violations ({a.events.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {a.events.map((e, idx) => (
                            <span key={idx} style={{
                              padding: "0.3rem 0.6rem", borderRadius: "var(--radius-sm)",
                              background: "rgba(239,68,68,0.08)", color: "#EF4444",
                              fontSize: "0.75rem", fontWeight: 500,
                            }}>
                              {e.event_type.replace(/_/g, " ")} — {new Date(e.timestamp).toLocaleTimeString()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Answers */}
                    {loadingDetail ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem" }}>
                        <div className="spinner" />
                      </div>
                    ) : attemptDetail ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        {attemptDetail.answers.map((ans, idx) => {
                          const status = getAnswerStatusIcon(ans);
                          const needsGrading = (ans.is_correct === null || ans.is_correct === undefined) || ans.is_flagged;
                          const gradingState = gradingStates[ans.id];

                          return (
                            <div
                              key={ans.id}
                              style={{
                                border: `1px solid ${needsGrading ? "rgba(245,158,11,0.3)" : "var(--border-subtle)"}`,
                                borderRadius: "var(--radius-md)",
                                overflow: "hidden",
                                background: needsGrading ? "rgba(245,158,11,0.02)" : "var(--bg-card)",
                              }}
                            >
                              {/* Question header */}
                              <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "0.875rem 1.25rem",
                                borderBottom: "1px solid var(--border-subtle)",
                                background: "var(--bg-primary)",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{
                                    width: 24, height: 24, borderRadius: "50%",
                                    background: status.color + "18", color: status.color,
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "0.7rem", fontWeight: 700,
                                  }}>
                                    {idx + 1}
                                  </span>
                                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", textTransform: "uppercase" }}>
                                    {(ans.question_type || "").replace("_", " ")}
                                  </span>
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    ({ans.max_points} pts)
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <SvgIcon name={status.icon as any} size={14} style={{ color: status.color }} />
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: status.color }}>{status.label}</span>
                                </div>
                              </div>

                              <div style={{ padding: "1.25rem" }}>
                                {/* Question text */}
                                <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "1rem", lineHeight: 1.6 }}>
                                  {ans.question_text}
                                </div>

                                {/* Student answer vs correct answer */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: needsGrading ? "1.25rem" : 0 }}>
                                  <div>
                                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
                                      Student's Answer
                                    </div>
                                    <div style={{
                                      padding: "0.75rem", borderRadius: "var(--radius-sm)",
                                      background: ans.is_correct === true ? "rgba(16,185,129,0.06)" : ans.is_correct === false ? "rgba(239,68,68,0.06)" : "var(--bg-primary)",
                                      border: `1px solid ${ans.is_correct === true ? "rgba(16,185,129,0.2)" : ans.is_correct === false ? "rgba(239,68,68,0.2)" : "var(--border-subtle)"}`,
                                      fontSize: "0.9rem", color: "var(--text-primary)",
                                    }}>
                                      {ans.student_answer || <em style={{ color: "var(--text-muted)" }}>No answer</em>}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
                                      Expected Answer
                                    </div>
                                    <div style={{
                                      padding: "0.75rem", borderRadius: "var(--radius-sm)",
                                      background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
                                      fontSize: "0.9rem", color: "#059669",
                                    }}>
                                      {ans.correct_answer || "N/A"}
                                    </div>
                                  </div>
                                </div>

                                {/* Grading form for pending/flagged answers */}
                                {needsGrading && gradingState && (
                                  <div style={{
                                    padding: "1.25rem", borderRadius: "var(--radius-md)",
                                    background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
                                  }}>
                                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-primary)", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      <SvgIcon name="edit" size={14} /> Grade This Answer
                                    </div>

                                    {/* Correct/Incorrect toggle */}
                                    <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                                      <button
                                        onClick={() => updateGradingState(ans.id, { is_correct: true, points_earned: ans.max_points })}
                                        style={{
                                          flex: 1, padding: "0.75rem", borderRadius: "var(--radius-sm)",
                                          border: `2px solid ${gradingState.is_correct ? "#10B981" : "var(--border-subtle)"}`,
                                          background: gradingState.is_correct ? "rgba(16,185,129,0.08)" : "transparent",
                                          color: gradingState.is_correct ? "#10B981" : "var(--text-secondary)",
                                          fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                                          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                                        }}
                                      >
                                        <SvgIcon name="check-circle" size={16} /> Correct
                                      </button>
                                      <button
                                        onClick={() => updateGradingState(ans.id, { is_correct: false, points_earned: 0 })}
                                        style={{
                                          flex: 1, padding: "0.75rem", borderRadius: "var(--radius-sm)",
                                          border: `2px solid ${!gradingState.is_correct ? "#EF4444" : "var(--border-subtle)"}`,
                                          background: !gradingState.is_correct ? "rgba(239,68,68,0.08)" : "transparent",
                                          color: !gradingState.is_correct ? "#EF4444" : "var(--text-secondary)",
                                          fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                                          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                                        }}
                                      >
                                        <SvgIcon name="x" size={16} /> Incorrect
                                      </button>
                                    </div>

                                    {/* Points slider */}
                                    <div style={{ marginBottom: "1rem" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                                        <label style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)" }}>
                                          Points Awarded
                                        </label>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                                          {gradingState.points_earned} / {ans.max_points}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min={0}
                                        max={ans.max_points}
                                        step={0.5}
                                        value={gradingState.points_earned}
                                        onChange={(e) => updateGradingState(ans.id, { points_earned: parseFloat(e.target.value) })}
                                        style={{ width: "100%", accentColor: "var(--accent-primary)" }}
                                      />
                                    </div>

                                    {/* Teacher note */}
                                    <div style={{ marginBottom: "1rem" }}>
                                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                                        Feedback Note (optional)
                                      </label>
                                      <textarea
                                        className="input"
                                        rows={2}
                                        value={gradingState.teacher_note}
                                        onChange={(e) => updateGradingState(ans.id, { teacher_note: e.target.value })}
                                        placeholder="Add feedback for the student..."
                                        style={{ fontSize: "0.85rem", resize: "vertical" }}
                                      />
                                    </div>

                                    <button
                                      className="btn-primary"
                                      onClick={() => handleSaveGrade(ans.id)}
                                      disabled={savingAnswerId === ans.id}
                                      style={{ padding: "0.6rem 1.5rem", fontSize: "0.85rem", width: "100%" }}
                                    >
                                      {savingAnswerId === ans.id ? "Saving..." : "Save Grade"}
                                    </button>
                                  </div>
                                )}

                                {/* Already graded teacher note */}
                                {!needsGrading && ans.teacher_note && (
                                  <div style={{
                                    marginTop: "0.75rem", padding: "0.75rem",
                                    background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)",
                                    borderRadius: "var(--radius-sm)", fontSize: "0.85rem",
                                  }}>
                                    <span style={{ fontWeight: 600, color: "#6366F1", fontSize: "0.75rem" }}>Teacher Note: </span>
                                    <span style={{ color: "var(--text-secondary)" }}>{ans.teacher_note}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        Failed to load attempt details.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
