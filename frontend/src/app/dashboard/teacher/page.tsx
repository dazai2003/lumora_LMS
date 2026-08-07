"use client";

import { useState, useEffect } from "react";
import api, { CourseAnalytics, Course, QuizBreakdown, CourseEngagement, StudentCourseProgressResponse } from "@/lib/api";
import DoughnutChart from "@/components/charts/DoughnutChart";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { SkeletonDashboardOverview } from "@/components/ui/Skeleton";

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [analytics, setAnalytics] = useState<CourseAnalytics[]>([]);
  const [quizBreakdown, setQuizBreakdown] = useState<QuizBreakdown | null>(null);
  const [engagement, setEngagement] = useState<CourseEngagement | null>(null);
  const [studentProgress, setStudentProgress] = useState<StudentCourseProgressResponse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminders, setSendingReminders] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.listCourses(),
      api.getTeacherCourseAnalytics(),
      api.getTeacherStudentProgressStats()
    ])
      .then(([coursesData, analyticsData, progressData]) => {
        setCourses(coursesData);
        setAnalytics(analyticsData);
        setStudentProgress(progressData);
        if (coursesData.length > 0) {
          setSelectedCourse(coursesData[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load quiz breakdown and engagement when a course is selected
  useEffect(() => {
    if (selectedCourse) {
      Promise.all([
        api.getCourseQuizBreakdown(selectedCourse),
        api.getCourseEngagement(selectedCourse),
      ])
        .then(([qb, eng]) => { setQuizBreakdown(qb); setEngagement(eng); })
        .catch(console.error);
    }
  }, [selectedCourse]);

  if (loading) {
    return <SkeletonDashboardOverview />;
  }

  const totalStudents = analytics.reduce((sum, a) => sum + a.total_students, 0);
  const avgScore = analytics.filter(a => a.average_quiz_score).length > 0
    ? (analytics.reduce((sum, a) => sum + (a.average_quiz_score || 0), 0) / analytics.filter(a => a.average_quiz_score).length).toFixed(1)
    : "N/A";
  const avgCwScore = analytics.filter(a => a.average_coursework_score).length > 0
    ? (analytics.reduce((sum, a) => sum + (a.average_coursework_score || 0), 0) / analytics.filter(a => a.average_coursework_score).length).toFixed(1)
    : "N/A";
  const avgMatCompletion = analytics.filter(a => a.material_completion_rate).length > 0
    ? (analytics.reduce((sum, a) => sum + (a.material_completion_rate || 0), 0) / analytics.filter(a => a.material_completion_rate).length).toFixed(1)
    : "N/A";
  const totalQuestions = analytics.reduce((sum, a) => sum + a.total_questions_asked, 0);

  // Engagement level colors
  const engColors = {
    high: { bg: "rgba(16,185,129,0.08)", text: "#10B981", label: "High" },
    medium: { bg: "rgba(245,158,11,0.08)", text: "#F59E0B", label: "Medium" },
    low: { bg: "rgba(239,68,68,0.08)", text: "#EF4444", label: "Low" },
  };

  // Get low-engagement students for attention list (max 3 for compact view)
  const lowEngagementStudents = engagement?.students.filter(s => s.engagement_level === "low") || [];

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const kpiCards = [
    {
      label: "Total Students",
      value: totalStudents,
      icon: "users" as IconName,
      color: "#10B981",
      bgColor: "rgba(16, 185, 129, 0.08)",
      href: "/dashboard/teacher/analytics",
    },
    {
      label: "Avg Quiz Score",
      value: `${avgScore}${avgScore !== "N/A" ? "%" : ""}`,
      icon: "bar-chart" as IconName,
      color: "#F59E0B",
      bgColor: "rgba(245, 158, 11, 0.08)",
      href: "/dashboard/teacher/analytics",
    },
    {
      label: "Avg Coursework Mark",
      value: `${avgCwScore}${avgCwScore !== "N/A" ? "%" : ""}`,
      icon: "award" as IconName,
      color: "#8B5CF6",
      bgColor: "rgba(139, 92, 246, 0.08)",
      href: "/dashboard/teacher/assignments",
    },
    {
      label: "Material Progress",
      value: `${avgMatCompletion}${avgMatCompletion !== "N/A" ? "%" : ""}`,
      icon: "book-open" as IconName,
      color: "#06B6D4",
      bgColor: "rgba(6, 182, 212, 0.08)",
      href: "/dashboard/teacher/analytics",
    },
    {
      label: "Questions Asked",
      value: totalQuestions,
      icon: "message-circle" as IconName,
      color: "#EC4899",
      bgColor: "rgba(236, 72, 153, 0.08)",
      href: "/dashboard/teacher/qa",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "1400px", margin: "0 auto" }}>
      
      {/* Top Header Strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{greeting}</h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Here&apos;s what&apos;s happening across your courses today</p>
        </div>

        {courses.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Course:</label>
            <select
              value={selectedCourse || ""}
              onChange={(e) => setSelectedCourse(Number(e.target.value))}
              className="form-select"
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem", borderRadius: "var(--radius-sm)" }}
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 1. TOP KPI STAT CARDS (1 Row, 4 Cards) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        {kpiCards.map((card, idx) => (
          <Link key={idx} href={card.href} className="card animate-fade-in" style={{ padding: "1rem 1.25rem", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.25rem" }}>{card.label}</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{card.value}</div>
            </div>
            <div style={{ width: "38px", height: "38px", borderRadius: "var(--radius-sm)", background: card.bgColor, color: card.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name={card.icon} size={18} />
            </div>
          </Link>
        ))}
      </div>

      {/* 2. MAIN CONTENT GRID (2 Equal Balanced Columns) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "1.25rem" }}>
        
        {/* ROW 1 LEFT: Students Needing Attention (Strict Height Match) */}
        <div className="card animate-fade-in" style={{ padding: "1.1rem 1.25rem", minHeight: "190px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", minHeight: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <SvgIcon name="alert-triangle" size={15} style={{ color: lowEngagementStudents.length > 0 ? "var(--warning)" : "var(--success)" }} />
                <div>
                  <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Students Needing Attention
                  </h2>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px", fontWeight: 500 }}>
                    Flagged for low overall course activity & incomplete tasks
                  </div>
                </div>
              </div>
              {engagement && engagement.students.length > 0 && (
                <Link href="/dashboard/teacher/analytics?tab=roster&filter=at_risk" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
                  View all
                </Link>
              )}
            </div>
            {lowEngagementStudents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {lowEngagementStudents.slice(0, 3).map((s) => {
                  return (
                    <div
                      key={s.student_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.65rem",
                        background: "var(--bg-primary)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem"
                      }}
                    >
                      {/* Col 1: Student Avatar & Name */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>
                          {s.student_name.charAt(0)}
                        </div>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.78rem" }}>
                          {s.student_name}
                        </span>
                      </div>

                      {/* Col 2: Study Materials Progress */}
                      <span style={{ fontSize: "0.71rem", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>
                        Materials: {s.completed_materials ?? 0}/{s.total_materials ?? 0} ({Math.round(s.material_pct ?? 0)}%)
                      </span>

                      {/* Col 3: Quiz Progress */}
                      <span style={{ fontSize: "0.71rem", color: "var(--accent-primary)", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.25)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>
                        Quiz: {s.quizzes_taken ?? 0}/{s.total_quizzes ?? 0} ({Math.round(s.quiz_completion_pct ?? 0)}%)
                      </span>
                      
                      {/* Col 4: Coursework Progress */}
                      <span style={{ fontSize: "0.71rem", color: "#D97706", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>
                        Coursework: {s.coursework_submitted ?? 0}/{s.total_coursework ?? 0} ({Math.round(s.coursework_pct ?? 0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "1rem 0", fontSize: "0.8rem" }}>
                <SvgIcon name="check-circle" size={20} style={{ color: "var(--success)", marginBottom: "0.25rem", display: "block", margin: "0 auto 0.25rem" }} />
                All students are on track
              </div>
            )}
          </div>
        </div>

        {/* ROW 1 RIGHT: Coursework Progress (Strict Height Match) */}
        <div className="card animate-fade-in" style={{ padding: "1.1rem 1.25rem", minHeight: "190px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", minHeight: "28px" }}>
              <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                Coursework Progress
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {studentProgress && studentProgress.length > 3 && (
                  <Link href="/dashboard/teacher/analytics" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
                    View all
                  </Link>
                )}
                <button
                  disabled={sendingReminders}
                  onClick={async () => {
                    setSendingReminders(true);
                    try {
                      const res = await api.sendProgressReminders();
                      if (res.message.includes("0 reminders")) {
                        addToast(res.message, "info");
                      } else {
                        addToast(res.message, "success");
                      }
                    } catch (err) {
                      console.error(err);
                      addToast("Failed to send reminders", "error");
                    } finally {
                      setSendingReminders(false);
                    }
                  }}
                  className="btn-secondary"
                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                >
                  {sendingReminders ? (
                    <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Sending...</>
                  ) : "Send Reminders"}
                </button>
              </div>
            </div>
            {studentProgress && studentProgress.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {studentProgress.slice(0, 3).map((p, idx) => (
                  <div key={`${p.student_id}-${p.course_id}-${idx}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem", padding: "0.2rem 0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                        <span style={{ color: "var(--text-primary)", fontSize: "0.775rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.student_name}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.725rem", flexShrink: 0, marginLeft: "0.5rem" }}>{p.progress_percentage}%</span>
                      </div>
                      <div style={{ height: "5px", borderRadius: "3px", background: "var(--bg-primary)", overflow: "hidden" }}>
                        <div style={{
                          width: `${p.progress_percentage}%`,
                          background: p.progress_percentage === 100 ? "var(--success)" : p.progress_percentage >= 50 ? "var(--accent-primary)" : "var(--warning)",
                          height: "100%",
                          borderRadius: "3px",
                          transition: "width 0.5s ease"
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: "1rem 0" }}>
                <SvgIcon name="target" className="empty-state-icon" style={{ opacity: 0.4, width: 24, height: 24 }} />
                <div className="empty-state-title" style={{ fontSize: "0.85rem" }}>No coursework data</div>
                <div className="empty-state-desc" style={{ fontSize: "0.75rem" }}>Students haven't started coursework yet.</div>
              </div>
            )}
          </div>
        </div>

        {/* ROW 2 LEFT: Student Engagement (Increased Height From Downside) */}
        <div className="card animate-fade-in" style={{ padding: "1.25rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
            Student Engagement Breakdown
          </h2>
          {engagement && engagement.total_students > 0 ? (
            <DoughnutChart
              labels={["High", "Medium", "Low"]}
              data={[engagement.engagement_summary.high, engagement.engagement_summary.medium, engagement.engagement_summary.low]}
              colors={["rgba(16, 185, 129, 0.85)", "rgba(245, 158, 11, 0.85)", "rgba(239, 68, 68, 0.85)"]}
              centerLabel={`${engagement.total_students} Students`}
              height={210}
            />
          ) : (
            <div className="empty-state" style={{ height: 210, justifyContent: "center", padding: "1rem" }}>
              <SvgIcon name="users" className="empty-state-icon" style={{ opacity: 0.4, width: 28, height: 28 }} />
              <div className="empty-state-title" style={{ fontSize: "0.85rem" }}>No student data</div>
              <div className="empty-state-desc" style={{ fontSize: "0.75rem" }}>No students enrolled yet.</div>
            </div>
          )}
        </div>

        {/* ROW 2 RIGHT: Quiz Performance Insights for Selected Course */}
        <div className="card animate-fade-in" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                Quiz Performance Overview
              </h2>
              <Link href="/dashboard/teacher/analytics" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
                Analytics →
              </Link>
            </div>

            {quizBreakdown && quizBreakdown.quizzes && quizBreakdown.quizzes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {quizBreakdown.quizzes.slice(0, 3).map((quiz) => (
                  <div key={quiz.quiz_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)" }}>
                    <div>
                      <div style={{ fontSize: "0.825rem", fontWeight: 500, color: "var(--text-primary)" }}>{quiz.quiz_title}</div>
                      <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>{quiz.total_attempts} attempts</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.825rem", fontWeight: 600, color: (quiz.average_score ?? 0) >= 70 ? "var(--success)" : "var(--warning)" }}>
                        {quiz.average_score != null ? `${Math.round(quiz.average_score)}%` : "—"}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>avg</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2.5rem 0", fontSize: "0.8rem" }}>
                <SvgIcon name="file-text" size={24} style={{ opacity: 0.4, marginBottom: "0.4rem", display: "block", margin: "0 auto 0.4rem" }} />
                No quiz performance data recorded yet
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", marginTop: "0.75rem", display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>Selected Course Performance</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {courses.find(c => c.id === selectedCourse)?.title || "All Courses"}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}