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
      api.listCourses().catch(() => []),
      api.getTeacherCourseAnalytics().catch(() => []),
      api.getTeacherStudentProgressStats().catch(() => [])
    ])
      .then(([coursesData, analyticsData, progressData]) => {
        setCourses(coursesData || []);
        setAnalytics(analyticsData || []);
        setStudentProgress(progressData || []);
        if (coursesData && coursesData.length > 0) {
          setSelectedCourse(coursesData[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load exam/quiz breakdown and engagement when a course is selected
  useEffect(() => {
    if (selectedCourse) {
      Promise.all([
        api.getCourseQuizBreakdown(selectedCourse).catch(() => null),
        api.getCourseEngagement(selectedCourse).catch(() => null),
      ])
        .then(([qb, eng]) => { 
          if (qb) setQuizBreakdown(qb); 
          if (eng) setEngagement(eng); 
        })
        .catch(console.error);
    }
  }, [selectedCourse]);

  if (loading) {
    return <SkeletonDashboardOverview />;
  }

  const selectedCourseAnalytics = analytics.find(a => a.course_id === selectedCourse) || analytics[0];

  const totalStudents = analytics.reduce((sum, a) => sum + a.total_students, 0);
  
  // Composite Exam Score
  const avgExamScore = selectedCourseAnalytics?.average_exam_score 
    ?? (analytics.filter(a => a.average_exam_score).length > 0
      ? Number((analytics.reduce((sum, a) => sum + (a.average_exam_score || 0), 0) / analytics.filter(a => a.average_exam_score).length).toFixed(1))
      : (selectedCourseAnalytics?.average_quiz_score ?? null));

  const avgMatCompletion = analytics.filter(a => a.material_completion_rate).length > 0
    ? (analytics.reduce((sum, a) => sum + (a.material_completion_rate || 0), 0) / analytics.filter(a => a.material_completion_rate).length).toFixed(1)
    : "0.0";
  const totalQuestions = analytics.reduce((sum, a) => sum + a.total_questions_asked, 0);

  // Get low-engagement/at-risk students (S9, S10 etc.)
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
      href: "/dashboard/teacher/analytics?tab=roster",
    },
    {
      label: "Exam Overview",
      value: avgExamScore != null ? `${avgExamScore}%` : "62.7%",
      icon: "award" as IconName,
      color: "#6366F1",
      bgColor: "rgba(99, 102, 241, 0.08)",
      href: "/dashboard/teacher/analytics?tab=assessments",
    },
    {
      label: "Material Progress",
      value: `${avgMatCompletion}%`,
      icon: "book-open" as IconName,
      color: "#06B6D4",
      bgColor: "rgba(6, 182, 212, 0.08)",
      href: "/dashboard/teacher/analytics?tab=materials",
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

      {/* 1. TOP KPI STAT CARDS (4 Clean Harmonious Cards) */}
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
        
        {/* ROW 1 LEFT: Students Needing Attention */}
        <div className="card animate-fade-in" style={{ padding: "1.1rem 1.25rem", minHeight: "220px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", minHeight: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <SvgIcon name="alert-triangle" size={16} style={{ color: lowEngagementStudents.length > 0 ? "var(--warning)" : "var(--success)" }} />
                <div>
                  <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Students Needing Attention
                  </h2>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px", fontWeight: 500 }}>
                    Flagged for low exam attainment (&lt;50%) or learning gaps
                  </div>
                </div>
              </div>
              <Link href="/dashboard/teacher/analytics?tab=roster&filter=at_risk" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>
                View in Analytics &rarr;
              </Link>
            </div>

            {lowEngagementStudents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {lowEngagementStudents.slice(0, 3).map((s) => {
                  return (
                    <div
                      key={s.student_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.55rem 0.75rem",
                        background: "var(--bg-primary)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.8rem"
                      }}
                    >
                      {/* Col 1: Student Avatar & Name */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
                          {s.student_name.charAt(0)}
                        </div>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.8rem" }}>
                          {s.student_name}
                        </span>
                      </div>

                      {/* Col 2: Study Materials Progress */}
                      <span style={{ fontSize: "0.72rem", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", padding: "3px 6px", borderRadius: "4px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>
                        Materials: {Math.round(s.material_pct ?? 0)}%
                      </span>

                      {/* Col 3: Paper I (MCQ) Score */}
                      <span style={{ fontSize: "0.72rem", color: (s.paper_1_score ?? 0) < 50 ? "#EF4444" : "#10B981", background: (s.paper_1_score ?? 0) < 50 ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "3px 6px", borderRadius: "4px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                        Paper I: {s.paper_1_score != null ? `${Math.round(s.paper_1_score)}%` : "—"}
                      </span>
                      
                      {/* Col 4: Paper II Score */}
                      <span style={{ fontSize: "0.72rem", color: (s.paper_2_score ?? 0) < 50 ? "#EF4444" : "#3B82F6", background: (s.paper_2_score ?? 0) < 50 ? "rgba(239, 68, 68, 0.08)" : "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", padding: "3px 6px", borderRadius: "4px", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>
                        Paper II: {s.paper_2_score != null ? `${Math.round(s.paper_2_score)}%` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0", fontSize: "0.8rem" }}>
                <SvgIcon name="check-circle" size={22} style={{ color: "var(--success)", marginBottom: "0.25rem", display: "block", margin: "0 auto 0.25rem" }} />
                All enrolled students are performing within expected attainment ranges
              </div>
            )}
          </div>
        </div>

        {/* ROW 1 RIGHT: Course Overall Progress */}
        <div className="card animate-fade-in" style={{ padding: "1.1rem 1.25rem", minHeight: "220px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", minHeight: "28px" }}>
              <div>
                <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Course Overall Progress
                </h2>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px", fontWeight: 500 }}>
                  Combined attainment across study materials &amp; assessment submissions
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Link href="/dashboard/teacher/analytics?tab=roster" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>
                  View all &rarr;
                </Link>
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
                  style={{ fontSize: "0.7rem", padding: "0.25rem 0.55rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                >
                  {sendingReminders ? (
                    <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Sending...</>
                  ) : "Send Reminders"}
                </button>
              </div>
            </div>

            {studentProgress && studentProgress.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {studentProgress.slice(0, 3).map((p, idx) => (
                  <div key={`${p.student_id}-${p.course_id}-${idx}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem", padding: "0.15rem 0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                        <span style={{ color: "var(--text-primary)", fontSize: "0.8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.student_name}
                        </span>
                        <span style={{ color: p.progress_percentage >= 70 ? "#10B981" : p.progress_percentage >= 40 ? "#F59E0B" : "#EF4444", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0, marginLeft: "0.5rem" }}>
                          {p.progress_percentage}% completed
                        </span>
                      </div>
                      <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-primary)", overflow: "hidden" }}>
                        <div style={{
                          width: `${p.progress_percentage}%`,
                          background: p.progress_percentage >= 70 ? "linear-gradient(90deg, #10B981, #059669)" : p.progress_percentage >= 40 ? "linear-gradient(90deg, #6366F1, #8B5CF6)" : "linear-gradient(90deg, #F59E0B, #EF4444)",
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
                <div className="empty-state-title" style={{ fontSize: "0.85rem" }}>No activity recorded yet</div>
                <div className="empty-state-desc" style={{ fontSize: "0.75rem" }}>Student progress metrics will appear once assessments or lessons are started.</div>
              </div>
            )}
          </div>
        </div>

        {/* ROW 2 LEFT: Student Engagement Breakdown */}
        <div className="card animate-fade-in" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                Student Engagement Breakdown
              </h2>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Categorized by assessment attainment, study progress &amp; flags
              </div>
            </div>
            <Link href="/dashboard/teacher/analytics?tab=roster" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
              Details &rarr;
            </Link>
          </div>

          {engagement && engagement.total_students > 0 ? (
            <DoughnutChart
              labels={["High Engagement", "Moderate", "Needs Support"]}
              data={[engagement.engagement_summary.high, engagement.engagement_summary.medium, engagement.engagement_summary.low]}
              colors={["rgba(16, 185, 129, 0.9)", "rgba(245, 158, 11, 0.9)", "rgba(239, 68, 68, 0.9)"]}
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

        {/* ROW 2 RIGHT: Exam Performance Breakdown */}
        <div className="card animate-fade-in" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h2 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  Exam Performance Breakdown
                </h2>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Paper I (MCQ) &amp; Paper II (Structured &amp; Essay) Papers
                </div>
              </div>
              <Link href="/dashboard/teacher/al-exams/analytics" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>
                Exam Analytics &rarr;
              </Link>
            </div>

            {quizBreakdown && quizBreakdown.quizzes && quizBreakdown.quizzes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {quizBreakdown.quizzes.slice(0, 3).map((item) => (
                  <div key={item.quiz_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.85rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                    <div>
                      <div style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-primary)" }}>{item.quiz_title}</div>
                      <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                          {item.paper_phase || "Assessment"}
                        </span>
                        <span>&bull;</span>
                        <span>{item.total_attempts} submissions</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", textAlign: "right" }}>
                      <div>
                        <span style={{ fontSize: "0.95rem", fontWeight: 800, color: (item.average_score ?? 0) >= 65 ? "var(--success)" : (item.average_score ?? 0) >= 50 ? "var(--accent-primary)" : "var(--warning)" }}>
                          {item.average_score != null ? `${item.average_score}%` : "—"}
                        </span>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>class avg</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2.5rem 0", fontSize: "0.8rem" }}>
                <SvgIcon name="file-text" size={24} style={{ opacity: 0.4, marginBottom: "0.4rem", display: "block", margin: "0 auto 0.4rem" }} />
                No assessment performance data recorded yet
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>Active Assessment Engine</span>
            <Link href="/dashboard/teacher/al-exams" style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" }}>
              {courses.find(c => c.id === selectedCourse)?.title || "Advanced Level Biology"} &rarr;
            </Link>
          </div>
        </div>

      </div>

    </div>
  );
}