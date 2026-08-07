"use client";

import { useState, useEffect } from "react";
import api, { Course, FullCourseAnalytics } from "@/lib/api";
import BarChart from "@/components/charts/BarChart";
import DoughnutChart from "@/components/charts/DoughnutChart";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import Modal from "@/components/Modal";

type AnalyticsTab = "overview" | "coursework" | "roster" | "ai_insights";

export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [fullAnalytics, setFullAnalytics] = useState<FullCourseAnalytics | null>(null);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<"all" | "at_risk" | "moderate" | "healthy">("all");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const filterParam = searchParams.get("filter");
    if (tabParam === "roster" || tabParam === "coursework" || tabParam === "overview" || tabParam === "ai_insights") {
      setActiveTab(tabParam as AnalyticsTab);
    }
    if (filterParam === "at_risk" || filterParam === "moderate" || filterParam === "healthy" || filterParam === "all") {
      setRosterFilter(filterParam as any);
    }
  }, [searchParams]);

  // Topic Drill-Down Modal States
  const [selectedTopicModal, setSelectedTopicModal] = useState<string | null>(null);
  const [topicQuestions, setTopicQuestions] = useState<any[]>([]);
  const [loadingTopicQuestions, setLoadingTopicQuestions] = useState(false);

  const openTopicModal = async (topic: string) => {
    if (!selectedCourse) return;
    setSelectedTopicModal(topic);
    setLoadingTopicQuestions(true);
    try {
      const data = await api.getQuestionsByTopic(selectedCourse, topic);
      setTopicQuestions(data || []);
    } catch (e) {
      console.error(e);
      addToast("Failed to load student questions for topic", "error");
    } finally {
      setLoadingTopicQuestions(false);
    }
  };

  useEffect(() => {
    api.listCourses()
      .then((c) => {
        setCourses(c);
        if (c.length > 0) setSelectedCourse(c[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      setAnalyticsLoading(true);
      api.getFullCourseAnalytics(selectedCourse)
        .then(setFullAnalytics)
        .catch((err) => {
          console.error(err);
          addToast("Failed to load analytics for selected course", "error");
        })
        .finally(() => setAnalyticsLoading(false));
    }
  }, [selectedCourse]);

  const handleSendReminders = async () => {
    setSendingReminder(true);
    try {
      const res = await api.sendProgressReminders();
      addToast(res.message || "Reminders sent successfully!", "success");
    } catch {
      addToast("Failed to send reminders", "error");
    } finally {
      setSendingReminder(false);
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  const summary = fullAnalytics?.summary;
  const roster = fullAnalytics?.student_roster || [];
  const filteredRoster = roster.filter(s => rosterFilter === "all" ? true : s.risk_level === rosterFilter);

  const riskBadgeStyles: Record<string, { bg: string; text: string; label: string }> = {
    at_risk: { bg: "rgba(239,68,68,0.12)", text: "#EF4444", label: "At Risk" },
    moderate: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", label: "Moderate" },
    healthy: { bg: "rgba(16,185,129,0.12)", text: "#10B981", label: "Healthy" },
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      {/* Top Header & Course Selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Learning Analytics Workstation</h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
            Multi-dimensional insights: Coursework grades, Quiz distributions, Material completion & AI student risk intelligence
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {courses.length > 0 && (
            <select
              value={selectedCourse || ""}
              onChange={(e) => setSelectedCourse(Number(e.target.value))}
              className="form-select"
              style={{ minWidth: "220px", fontSize: "0.85rem" }}
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}

          <button
            className="btn-secondary btn-sm"
            onClick={handleSendReminders}
            disabled={sendingReminder}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
          >
            <SvgIcon name="bell" size={14} />
            {sendingReminder ? "Sending..." : "Nudge Low Progress Students"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "1.5rem", gap: "0.5rem" }}>
        {[
          { key: "overview" as AnalyticsTab, label: "Overview & Performance", icon: "bar-chart" as const },
          { key: "coursework" as AnalyticsTab, label: `Coursework Analytics (${fullAnalytics?.coursework_breakdown?.length || 0})`, icon: "file-text" as const },
          { key: "roster" as AnalyticsTab, label: `Student Risk Roster (${roster.length})`, icon: "users" as const, alert: summary?.at_risk_students_count },
          { key: "ai_insights" as AnalyticsTab, label: "AI Insights & Confusion Topics", icon: "sparkles" as const },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.6rem 1rem",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "var(--accent-primary)" : "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s",
            }}
          >
            <SvgIcon name={tab.icon} size={15} />
            {tab.label}
            {tab.alert != null && tab.alert > 0 && (
              <span className="badge badge-error" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                {tab.alert} at risk
              </span>
            )}
          </button>
        ))}
      </div>

      {analyticsLoading ? (
        <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      ) : summary ? (
        <>
          {/* ═══════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW & PERFORMANCE
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Summary KPI Cards Bar */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                {[
                  { label: "Enrolled Students", value: summary.total_students, icon: "users" as const, color: "#2563EB", sub: "Active learners" },
                  { label: "Avg Quiz Score", value: `${summary.average_quiz_score}%`, icon: "check-circle" as const, color: "#10B981", sub: `${fullAnalytics?.quiz_breakdown?.length || 0} quizzes` },
                  { label: "Avg Coursework Mark", value: `${summary.average_coursework_score}%`, icon: "award" as const, color: "#8B5CF6", sub: `${fullAnalytics?.coursework_breakdown?.length || 0} assignments` },
                  { label: "Material Completion", value: `${summary.material_completion_rate}%`, icon: "book-open" as const, color: "#F59E0B", sub: `${fullAnalytics?.material_breakdown?.total_materials || 0} materials` },
                  { label: "At-Risk Students", value: summary.at_risk_students_count, icon: "alert-triangle" as const, color: summary.at_risk_students_count > 0 ? "#EF4444" : "#10B981", sub: "Needs intervention" },
                ].map((card) => (
                  <div key={card.label} className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", border: "1px solid var(--border-subtle)" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: "var(--radius-md)", background: card.color + "14", flexShrink: 0 }}>
                      <SvgIcon name={card.icon} size={20} style={{ color: card.color }} />
                    </span>
                    <div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>{card.value}</div>
                      <div style={{ fontSize: "0.775rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>{card.label}</div>
                      <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>{card.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Quiz Score Distribution */}
                <div className="card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Quiz Score Performance</h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Avg Score &amp; High/Low Range</span>
                  </div>
                  {fullAnalytics.quiz_breakdown.length > 0 ? (
                    <BarChart
                      labels={fullAnalytics.quiz_breakdown.map(q => {
                        const title = q.quiz_title || (q as any).title || "Quiz";
                        return title.length > 14 ? title.slice(0, 14) + "…" : title;
                      })}
                      datasets={[
                        { label: "Avg Score (%)", data: fullAnalytics.quiz_breakdown.map(q => q.average_score || 0), backgroundColor: "rgba(37, 99, 235, 0.7)" },
                        { label: "Highest (%)", data: fullAnalytics.quiz_breakdown.map(q => q.highest_score || 0), backgroundColor: "rgba(16, 185, 129, 0.7)" },
                        { label: "Lowest (%)", data: fullAnalytics.quiz_breakdown.map(q => q.lowest_score || 0), backgroundColor: "rgba(239, 68, 68, 0.7)" },
                      ]}
                    />
                  ) : (
                    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No quizzes created yet for this course.
                    </div>
                  )}
                </div>

                {/* Material Engagement Breakdown */}
                <div className="card" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Material Completion by Type</h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Overall: {fullAnalytics.material_breakdown.overall_completion_pct}%</span>
                  </div>
                  {Object.keys(fullAnalytics.material_breakdown.by_type || {}).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <DoughnutChart
                        labels={Object.keys(fullAnalytics.material_breakdown.by_type).map(t => t.toUpperCase() + " Materials")}
                        data={Object.values(fullAnalytics.material_breakdown.by_type).map(t => t.completion_pct)}
                        colors={["#2563EB", "#10B981", "#8B5CF6", "#F59E0B"]}
                        centerLabel={`${fullAnalytics.material_breakdown.overall_completion_pct}%`}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        {Object.entries(fullAnalytics.material_breakdown.by_type).map(([mType, stat]) => (
                          <div key={mType} style={{ background: "var(--bg-tertiary)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)", fontSize: "0.75rem" }}>
                            <div style={{ fontWeight: 600, textTransform: "uppercase", color: "var(--text-secondary)" }}>{mType} ({stat.count})</div>
                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>{stat.completion_pct}% completed</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No materials published yet for this course.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 2: COURSEWORK ANALYTICS
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "coursework" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Coursework &amp; Assignment Breakdown</h3>
                    <p style={{ fontSize: "0.775rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Submission metrics, average marks, and late submissions</p>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => router.push("/dashboard/teacher/assignments")}>
                    Open SpeedGrader
                  </button>
                </div>

                {fullAnalytics.coursework_breakdown.length === 0 ? (
                  <div className="empty-state" style={{ padding: "3rem" }}>
                    <SvgIcon name="file-text" className="empty-state-icon" style={{ opacity: 0.35, width: 44, height: 44 }} />
                    <div className="empty-state-title" style={{ marginTop: "0.75rem" }}>No coursework assignments</div>
                    <div className="empty-state-desc">Create assignments to start tracking coursework submission analytics.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Assignment Title</th>
                          <th style={{ textAlign: "center" }}>Max Marks</th>
                          <th style={{ textAlign: "center" }}>Total Submitted</th>
                          <th style={{ textAlign: "center" }}>Submission Rate</th>
                          <th style={{ textAlign: "center" }}>Late Submissions</th>
                          <th style={{ textAlign: "center" }}>Avg Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fullAnalytics.coursework_breakdown.map((cw) => (
                          <tr key={cw.assignment_id}>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cw.title}</td>
                            <td style={{ textAlign: "center" }}>{cw.max_marks} pts</td>
                            <td style={{ textAlign: "center" }}>{cw.total_submitted} / {summary.total_students}</td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{
                                background: cw.submission_rate_pct >= 80 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                                color: cw.submission_rate_pct >= 80 ? "#10B981" : "#F59E0B",
                                padding: "2px 8px", borderRadius: "12px", fontSize: "0.775rem", fontWeight: 600
                              }}>
                                {cw.submission_rate_pct}%
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {cw.late_count > 0 ? (
                                <span style={{ color: "var(--color-error)", fontWeight: 600, fontSize: "0.8rem" }}>
                                  {cw.late_count} late
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>0</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{
                                background: cw.average_pct >= 60 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                color: cw.average_pct >= 60 ? "#10B981" : "#EF4444",
                                padding: "3px 10px", borderRadius: "12px", fontSize: "0.825rem", fontWeight: 700
                              }}>
                                {cw.average_marks} / {cw.max_marks} ({cw.average_pct}%)
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 3: STUDENT RISK ROSTER & INTELLIGENCE
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "roster" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Student Performance &amp; Risk Intelligence</h3>
                    <p style={{ fontSize: "0.775rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                      Composite score calculated from Coursework (35%), Quizzes (35%), Material Completion (20%), and AI Questions (10%)
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>Filter Risk:</span>
                    <select
                      className="form-select"
                      value={rosterFilter}
                      onChange={(e) => setRosterFilter(e.target.value as any)}
                      style={{ fontSize: "0.8rem", padding: "4px 8px" }}
                    >
                      <option value="all">All Students ({roster.length})</option>
                      <option value="at_risk">At Risk Only ({summary.at_risk_students_count})</option>
                      <option value="moderate">Moderate</option>
                      <option value="healthy">Healthy</option>
                    </select>
                  </div>
                </div>

                {filteredRoster.length === 0 ? (
                  <div className="empty-state" style={{ padding: "3rem" }}>
                    <SvgIcon name="users" className="empty-state-icon" style={{ opacity: 0.35, width: 44, height: 44 }} />
                    <div className="empty-state-title" style={{ marginTop: "0.75rem" }}>No matching students</div>
                    <div className="empty-state-desc">Try clearing your risk filter.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th style={{ textAlign: "center" }}>Quiz Avg</th>
                          <th style={{ textAlign: "center" }}>Coursework Avg</th>
                          <th style={{ textAlign: "center" }}>Material Completion</th>
                          <th style={{ textAlign: "center" }}>AI Questions</th>
                          <th style={{ textAlign: "center" }}>Composite Score</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoster.map((s) => {
                          const badge = riskBadgeStyles[s.risk_level] || riskBadgeStyles.healthy;
                          return (
                            <tr
                              key={s.student_id}
                              onClick={() => router.push(`/dashboard/teacher/analytics/student/${s.student_id}?courseId=${selectedCourse}&name=${encodeURIComponent(s.student_name)}`)}
                              style={{ cursor: "pointer", transition: "background 0.15s ease" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-primary)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                            >
                              <td>
                                <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>{s.student_name}</div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.email}</div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {s.quiz_avg != null ? `${s.quiz_avg}%` : "—"}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {s.coursework_avg != null ? `${s.coursework_avg}%` : "—"}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span style={{ fontWeight: 600 }}>{s.material_completion_pct}%</span>
                              </td>
                              <td style={{ textAlign: "center" }}>{s.ai_questions_asked}</td>
                              <td style={{ textAlign: "center" }}>
                                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: s.composite_score >= 70 ? "#10B981" : s.composite_score >= 50 ? "#F59E0B" : "#EF4444" }}>
                                  {s.composite_score}%
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span style={{ background: badge.bg, color: badge.text, padding: "3px 10px", borderRadius: "12px", fontSize: "0.725rem", fontWeight: 700 }}>
                                  {badge.label}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <SvgIcon name="chevron-right" size={15} style={{ color: "var(--text-muted)" }} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 4: AI INSIGHTS & CONFUSION TOPICS
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "ai_insights" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
              {/* Top Confusion Areas */}
              <div className="card" style={{ padding: "1.25rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "1rem", color: "var(--text-primary)" }}>
                  Top Student Confusion Topics
                </h3>
                {fullAnalytics.top_confusion_areas.length === 0 ? (
                  <div className="empty-state" style={{ padding: "2rem" }}>
                    <SvgIcon name="sparkles" className="empty-state-icon" style={{ opacity: 0.35 }} />
                    <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No confusion topics detected</div>
                    <div className="empty-state-desc" style={{ fontSize: "0.775rem" }}>Questions asked by students will populate this AI topic map.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {fullAnalytics.top_confusion_areas.map((area, idx) => (
                      <div
                        key={idx}
                        onClick={() => openTopicModal(area.topic)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "0.7rem 0.85rem", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
                          cursor: "pointer", transition: "all 0.2s ease", border: "1px solid var(--border-subtle)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--accent-primary)";
                          e.currentTarget.style.background = "var(--bg-card-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border-subtle)";
                          e.currentTarget.style.background = "var(--bg-tertiary)";
                        }}
                        title="Click to inspect underlying student questions & AI answers"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <SvgIcon name="search" size={14} style={{ color: "var(--accent-primary)" }} />
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.835rem" }}>{area.topic}</span>
                        </div>
                        <span className="badge badge-info" style={{ fontSize: "0.725rem", fontWeight: 700 }}>
                          {area.count} {area.count === 1 ? "query" : "queries"} →
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Executive AI Insights Brief */}
              <div className="card shadow-sm" style={{ padding: "1.35rem", display: "flex", flexDirection: "column", gap: "1rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.15))", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <SvgIcon name="sparkles" size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                      AI Pedagogical Executive Brief
                    </h3>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>Automated synthesis of student queries & material flags</div>
                  </div>
                </div>

                <div style={{ padding: "0.9rem", borderRadius: "var(--radius-md)", background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.08))", border: "1px solid rgba(124,58,237,0.18)", fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--text-primary)" }}>Primary Learning Bottleneck:</strong> Analysis indicates primary student questions focus on <em>Metabolism & Bioenergetics</em> and <em>Viruses vs Living Systems</em>.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <SvgIcon name="check-circle" size={14} style={{ color: "#10B981" }} />
                    <span>Recommended Lecture Review Plan:</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                    <li>Dedicate 5 minutes in next live session to reviewing Anabolism vs Catabolism chemical pathways.</li>
                    <li>Clarify why viruses lack independent cellular respiration.</li>
                    <li>Inspect detailed student queries by clicking any confusion topic on the left.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
          No analytics data available for this course.
        </div>
      )}

      {/* CONFUSION TOPIC DRILL-DOWN INSPECTION MODAL */}
      {selectedTopicModal && (
        <Modal
          title={`Confusion Topic Inspection: ${selectedTopicModal}`}
          onClose={() => setSelectedTopicModal(null)}
          maxWidth="720px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }} className="animate-fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.85rem 1.1rem", borderRadius: "var(--radius-md)", background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(124,58,237,0.12) 100%)", border: "1px solid rgba(124,58,237,0.2)" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Student Confusion Analytics
                </div>
                <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  {selectedTopicModal}
                </h4>
              </div>
              <span className="badge badge-info" style={{ fontSize: "0.775rem", fontWeight: 800, padding: "0.3rem 0.75rem" }}>
                {topicQuestions.length} {topicQuestions.length === 1 ? "Student Question" : "Student Questions"}
              </span>
            </div>

            {loadingTopicQuestions ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading student queries for this topic...
              </div>
            ) : topicQuestions.length === 0 ? (
              <div className="empty-state" style={{ padding: "2rem" }}>
                <div className="empty-state-title" style={{ fontSize: "0.9rem" }}>No detailed queries found</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "480px", overflowY: "auto", paddingRight: "0.25rem" }}>
                {topicQuestions.map((q) => (
                  <div key={q.id} className="card shadow-sm" style={{ padding: "1.1rem", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    
                    {/* Student Info Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: q.avatar_url ? `url(${q.avatar_url}) center/cover` : "var(--accent-primary)",
                          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: "0.9rem", border: "2px solid var(--border-subtle)"
                        }}>
                          {!q.avatar_url && (q.student_name?.charAt(0)?.toUpperCase() || "S")}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)" }}>{q.student_name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{q.student_email}</div>
                        </div>
                      </div>

                      <span style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>
                        {(q.asked_at || q.created_at) ? new Date(q.asked_at || q.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>

                    {/* Student Question Text */}
                    <div style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-sm)", background: "var(--bg-tertiary)", borderLeft: "3px solid var(--accent-primary)", fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 600 }}>
                      "{q.question_text}"
                    </div>

                    {/* AI Answer Preview */}
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-card-hover)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.3rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <SvgIcon name="sparkles" size={13} />
                        <span>AI Tutor Response Provided to Student:</span>
                      </div>
                      <div style={{ lineHeight: 1.5, maxHeight: "120px", overflowY: "auto" }}>
                        {q.ai_response}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
