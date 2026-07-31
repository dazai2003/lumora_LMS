"use client";

import { useState, useEffect, use, useCallback } from "react";
import api, {
  Course,
  Quiz,
  QuizDetail,
  QuizAttempt,
  Lesson,
  TeacherQuestionView,
  StudentCourseProgressResponse,
  EngagementStudent,
} from "@/lib/api";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SvgIcon } from "@/components/SvgIcon";
import LineChart from "@/components/charts/LineChart";
import BarChart from "@/components/charts/BarChart";
import DoughnutChart from "@/components/charts/DoughnutChart";

// ─── Types ──────────────────────────────────
interface StudentQuizResult {
  quiz: Quiz;
  attempt: QuizAttempt | null;
}

interface ExpandedQuizData {
  detail: QuizDetail;
  attempt: QuizAttempt;
}

// ─── Skeleton ───────────────────────────────
function Skeleton({ width = "100%", height = 16 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-primary)",
        animation: "pulse 1.5s infinite",
      }}
    />
  );
}

// ─── Main Component ─────────────────────────
export default function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId: rawId } = use(params);
  const studentId = parseInt(rawId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const courseId = parseInt(searchParams.get("courseId") || "0");
  const studentName = searchParams.get("name") || `Student #${studentId}`;

  const [activeTab, setActiveTab] = useState<"overview" | "quizzes" | "qa" | "materials">("overview");

  // Data states
  const [course, setCourse] = useState<Course | null>(null);
  const [engagement, setEngagement] = useState<EngagementStudent | null>(null);
  const [progress, setProgress] = useState<StudentCourseProgressResponse | null>(null);
  const [quizResults, setQuizResults] = useState<StudentQuizResult[]>([]);
  const [qaHistory, setQaHistory] = useState<TeacherQuestionView[]>([]);

  // Loading states
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingQA, setLoadingQA] = useState(true);

  // Expanded quiz detail (on-demand)
  const [expandedQuizId, setExpandedQuizId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<ExpandedQuizData | null>(null);
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  // Q&A filter
  const [qaFilter, setQaFilter] = useState("");

  // ─── Data Loading ─────────────────────────
  useEffect(() => {
    if (!courseId) return;

    // Load core data in parallel
    Promise.all([
      api.getCourse(courseId),
      api.getCourseEngagement(courseId),
      api.getTeacherStudentProgressStats(),
    ])
      .then(([courseData, engData, progressData]) => {
        setCourse(courseData);

        // Find this student in engagement data
        const studentEng = engData.students.find(
          (s: EngagementStudent) => s.student_id === studentId
        );
        setEngagement(studentEng || null);

        // Find this student's progress for this course
        const studentProg = progressData.find(
          (p: StudentCourseProgressResponse) =>
            p.student_id === studentId && p.course_id === courseId
        );
        setProgress(studentProg || null);
      })
      .catch(console.error)
      .finally(() => setLoadingCore(false));

    // Load quiz data
    loadQuizData();

    // Load Q&A data
    api
      .getTeacherAllQuestions()
      .then((questions) => {
        // Filter by student name and course
        const filtered = questions.filter(
          (q) =>
            q.student_name === studentName &&
            q.course_title === course?.title
        );
        setQaHistory(filtered.length > 0 ? filtered : questions.filter((q) => q.student_name === studentName));
      })
      .catch(console.error)
      .finally(() => setLoadingQA(false));
  }, [courseId, studentId]);

  // Reload Q&A filtering once course is loaded
  useEffect(() => {
    if (!course) return;
    api
      .getTeacherAllQuestions()
      .then((questions) => {
        const filtered = questions.filter(
          (q) => q.student_name === studentName && q.course_title === course.title
        );
        setQaHistory(filtered);
      })
      .catch(console.error)
      .finally(() => setLoadingQA(false));
  }, [course, studentName]);

  const loadQuizData = useCallback(async () => {
    if (!courseId) return;
    setLoadingQuizzes(true);
    try {
      const lessons = await api.listLessons(courseId);
      const allQuizzes: Quiz[] = [];
      for (const lesson of lessons) {
        const quizzes = await api.listQuizzes(lesson.id);
        allQuizzes.push(...quizzes);
      }

      // For each quiz, get attempts and find this student's
      const results: StudentQuizResult[] = [];
      for (const quiz of allQuizzes) {
        try {
          const attempts = await api.getQuizAttempts(quiz.id);
          const studentAttempt = attempts.find((a) => a.student_id === studentId) || null;
          results.push({ quiz, attempt: studentAttempt });
        } catch {
          results.push({ quiz, attempt: null });
        }
      }

      results.sort((a, b) => {
        // Completed first, then by quiz title
        if (a.attempt && !b.attempt) return -1;
        if (!a.attempt && b.attempt) return 1;
        return a.quiz.title.localeCompare(b.quiz.title);
      });

      setQuizResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [courseId, studentId]);

  const handleExpandQuiz = async (quizId: number, attempt: QuizAttempt) => {
    if (expandedQuizId === quizId) {
      setExpandedQuizId(null);
      setExpandedData(null);
      return;
    }
    setExpandedQuizId(quizId);
    setLoadingExpanded(true);
    try {
      const detail = await api.getQuiz(quizId);
      setExpandedData({ detail, attempt });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingExpanded(false);
    }
  };

  // ─── Derived Data ─────────────────────────
  const completedQuizzes = quizResults.filter((r) => r.attempt !== null);
  const avgQuizScore =
    completedQuizzes.length > 0
      ? completedQuizzes.reduce((sum, r) => sum + (r.attempt?.percentage || 0), 0) / completedQuizzes.length
      : null;

  // Score trend for chart
  const scoreTrend = completedQuizzes
    .filter((r) => r.attempt?.completed_at)
    .sort((a, b) => new Date(a.attempt!.completed_at!).getTime() - new Date(b.attempt!.completed_at!).getTime())
    .map((r) => ({
      label: r.quiz.title.length > 18 ? r.quiz.title.slice(0, 18) + "…" : r.quiz.title,
      score: Math.round(r.attempt!.percentage || 0),
    }));

  // Q&A topics for chart
  const topicCounts: Record<string, number> = {};
  qaHistory.forEach((q) => {
    const topic = q.course_title || "General";
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  const filteredQA = qaFilter
    ? qaHistory.filter(
        (q) =>
          q.question_text.toLowerCase().includes(qaFilter.toLowerCase()) ||
          (q.course_title && q.course_title.toLowerCase().includes(qaFilter.toLowerCase()))
      )
    : qaHistory;

  // ─── Engagement Color ─────────────────────
  const engColor = (level: string) => {
    switch (level) {
      case "high": return { bg: "rgba(16,185,129,0.1)", text: "#10B981", label: "High" };
      case "medium": return { bg: "rgba(245,158,11,0.1)", text: "#F59E0B", label: "Medium" };
      case "low": return { bg: "rgba(239,68,68,0.1)", text: "#EF4444", label: "Low" };
      default: return { bg: "var(--bg-primary)", text: "var(--text-muted)", label: "Unknown" };
    }
  };

  // ─── Render ───────────────────────────────
  if (!courseId) {
    return (
      <div className="card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <div className="empty-state">
          <SvgIcon name="alert-triangle" style={{ width: 40, height: 40, opacity: 0.35 }} />
          <div className="empty-state-title">Missing Course Context</div>
          <div className="empty-state-desc">Please navigate here from the Learning Analytics page.</div>
        </div>
      </div>
    );
  }

  const engInfo = engagement ? engColor(engagement.engagement_level) : engColor("unknown");

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/teacher/analytics">Learning Analytics</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Student Profile</span>
      </div>

      {/* ─── Header ────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {/* Avatar */}
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: "1.25rem",
              flexShrink: 0,
            }}
          >
            {studentName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.2rem" }}>
              <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>{studentName}</h1>
              {engagement && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: engInfo.bg,
                    color: engInfo.text,
                  }}
                >
                  {engInfo.label} Engagement
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--text-muted)", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              {loadingCore ? (
                <Skeleton width={200} height={14} />
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="book" size={13} /> {course?.title || "Course"}
                  </span>
                  {engagement && (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <SvgIcon name="calendar" size={13} /> Enrolled {new Date(engagement.enrolled_at).toLocaleDateString()}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            onClick={() => {
              if (course) {
                router.push(`/dashboard/teacher/inbox?student_id=${studentId}&course_id=${course.id}&student_name=${encodeURIComponent(studentName)}&course_title=${encodeURIComponent(course.title)}`);
              }
            }}
            className="btn-primary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            disabled={!course}
          >
            <SvgIcon name="message-circle" size={14} /> Message Student
          </button>
          
          <Link
            href="/dashboard/teacher/analytics"
            className="btn-secondary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <SvgIcon name="arrow-left" size={14} /> Back to Analytics
          </Link>
        </div>
      </div>

      {/* ─── Summary Metrics Strip ─────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          {
            icon: "clipboard" as const,
            label: "Quizzes Taken",
            value: loadingQuizzes ? "…" : completedQuizzes.length,
            total: loadingQuizzes ? "" : `/ ${quizResults.length}`,
            color: "#2563EB",
          },
          {
            icon: "bar-chart" as const,
            label: "Average Score",
            value: loadingQuizzes
              ? "…"
              : avgQuizScore != null
              ? Math.round(avgQuizScore) + "%"
              : "N/A",
            total: "",
            color: avgQuizScore != null && avgQuizScore >= 60 ? "#10B981" : "#F59E0B",
          },
          {
            icon: "message-circle" as const,
            label: "AI Questions Asked",
            value: loadingQA ? "…" : qaHistory.length,
            total: "",
            color: "#8B5CF6",
          },
          {
            icon: "layers" as const,
            label: "Materials Completed",
            value: loadingCore
              ? "…"
              : progress
              ? `${progress.completed_materials}/${progress.total_materials}`
              : "N/A",
            total: loadingCore
              ? ""
              : progress
              ? `(${Math.round(progress.progress_percentage)}%)`
              : "",
            color: "#06B6D4",
          },
        ].map((m) => (
          <div key={m.label} className="stat-card-compact animate-fade-in">
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "var(--radius-sm)",
                background: m.color + "12",
                flexShrink: 0,
              }}
            >
              <SvgIcon name={m.icon} size={18} style={{ color: m.color }} />
            </span>
            <div>
              <div className="stat-value" style={{ fontSize: "1.15rem" }}>
                {m.value}{" "}
                {m.total && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>{m.total}</span>
                )}
              </div>
              <div className="stat-label">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Tab Navigation ───────────────── */}
      <div className="tabs" style={{ marginBottom: "1.5rem" }}>
        {(
          [
            { key: "overview", label: "Overview", icon: "grid" },
            { key: "quizzes", label: "Quiz Results", icon: "clipboard" },
            { key: "qa", label: "Q&A History", icon: "message-circle" },
            { key: "materials", label: "Material Progress", icon: "layers" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.key as any)}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <SvgIcon name={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Overview ───────────────── */}
      {activeTab === "overview" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Score Trend Chart */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Quiz Score Trend</h2>
            {loadingQuizzes ? (
              <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="spinner" />
              </div>
            ) : scoreTrend.length >= 2 ? (
              <LineChart
                labels={scoreTrend.map((s) => s.label)}
                datasets={[
                  {
                    label: "Score (%)",
                    data: scoreTrend.map((s) => s.score),
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                  },
                ]}
                height={260}
              />
            ) : (
              <div
                style={{
                  height: 200,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                <SvgIcon name="trending-up" size={32} style={{ opacity: 0.25, marginBottom: "0.5rem" }} />
                {completedQuizzes.length === 0
                  ? "No quiz attempts yet — score trend will appear here."
                  : "Need at least 2 quiz attempts to show a trend line."}
              </div>
            )}
          </div>

          {/* Two-column: Quiz Performance + Activity Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Quiz Performance Breakdown */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Quiz Performance</h2>
              {loadingQuizzes ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} height={40} />
                  ))}
                </div>
              ) : quizResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No quizzes available in this course.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {quizResults.slice(0, 6).map((r) => {
                    const pct = r.attempt?.percentage;
                    const scoreColor = pct != null ? (pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444") : "var(--text-muted)";
                    return (
                      <div
                        key={r.quiz.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.6rem 0.75rem",
                          background: "var(--bg-primary)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.825rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
                          <SvgIcon
                            name={r.attempt ? "check-circle" : "clock"}
                            size={15}
                            style={{ color: r.attempt ? "#10B981" : "var(--text-muted)", flexShrink: 0 }}
                          />
                          <span style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {r.quiz.title}
                            <span style={{ 
                              fontSize: "0.6rem", 
                              padding: "0.15rem 0.35rem", 
                              borderRadius: "12px", 
                              background: r.quiz.status === "published" ? "rgba(16,185,129,0.1)" : r.quiz.status === "draft" ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)",
                              color: r.quiz.status === "published" ? "#10B981" : r.quiz.status === "draft" ? "#F59E0B" : "#6B7280",
                              textTransform: "uppercase"
                            }}>
                              {r.quiz.status}
                            </span>
                          </span>
                        </div>
                        {r.attempt ? (
                          <span style={{ fontWeight: 600, color: scoreColor, flexShrink: 0 }}>
                            {Math.round(pct!)}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontStyle: "italic", flexShrink: 0 }}>
                            Not attempted
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {quizResults.length > 6 && (
                    <button
                      className="btn-secondary"
                      onClick={() => setActiveTab("quizzes")}
                      style={{ padding: "0.4rem 0.75rem", fontSize: "0.775rem", alignSelf: "flex-start", marginTop: "0.25rem" }}
                    >
                      View All {quizResults.length} Quizzes →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Activity Summary */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Engagement Summary</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Material Progress Bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Material Completion</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {progress ? `${Math.round(progress.progress_percentage)}%` : "N/A"}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${progress?.progress_percentage || 0}%`,
                        background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>

                {/* AI Engagement */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>AI Questions Asked</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{qaHistory.length}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min((qaHistory.length / 20) * 100, 100)}%`,
                        background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Quiz Completion */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Quiz Completion</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {completedQuizzes.length}/{quizResults.length}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${quizResults.length > 0 ? (completedQuizzes.length / quizResults.length) * 100 : 0}%`,
                        background: "linear-gradient(90deg, #10B981, #34d399)",
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Engagement Level */}
                {engagement && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "var(--radius-sm)",
                      background: engInfo.bg,
                      marginTop: "0.5rem",
                    }}
                  >
                    <SvgIcon name="activity" size={16} style={{ color: engInfo.text }} />
                    <div>
                      <div style={{ fontSize: "0.825rem", fontWeight: 600, color: engInfo.text }}>
                        {engInfo.label} Engagement Level
                      </div>
                      <div style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>
                        Based on quiz activity and Q&A participation
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Q&A Questions (compact preview) */}
          {qaHistory.length > 0 && (
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>Recent AI Questions</h2>
                <button
                  className="btn-secondary"
                  onClick={() => setActiveTab("qa")}
                  style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                >
                  View All →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {qaHistory.slice(0, 4).map((q) => (
                  <div
                    key={q.question_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.55rem 0.75rem",
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-sm)",
                      gap: "1rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.825rem",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {q.question_text}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>
                      {new Date(q.asked_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: Quiz Results ────────────── */}
      {activeTab === "quizzes" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              Quiz Results
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                ({completedQuizzes.length} completed of {quizResults.length})
              </span>
            </h2>
          </div>

          {loadingQuizzes ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={64} />
              ))}
            </div>
          ) : quizResults.length === 0 ? (
            <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="clipboard" style={{ width: 40, height: 40, opacity: 0.3 }} />
                <div className="empty-state-title">No Quizzes Found</div>
                <div className="empty-state-desc">There are no quizzes in this course yet.</div>
              </div>
            </div>
          ) : (
            quizResults.map((r) => {
              const isExpanded = expandedQuizId === r.quiz.id;
              const pct = r.attempt?.percentage;
              const scoreColor = pct != null ? (pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444") : "var(--text-muted)";

              return (
                <div key={r.quiz.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* Quiz Row */}
                  <div
                    onClick={() => r.attempt && handleExpandQuiz(r.quiz.id, r.attempt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "1rem 1.25rem",
                      cursor: r.attempt ? "pointer" : "default",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => r.attempt && ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-primary)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "var(--radius-sm)",
                          background: r.attempt ? scoreColor + "12" : "var(--bg-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <SvgIcon
                          name={r.attempt ? "check-circle" : "clock"}
                          size={18}
                          style={{ color: r.attempt ? scoreColor : "var(--text-muted)" }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {r.quiz.title}
                          <span style={{ 
                            fontSize: "0.65rem", 
                            padding: "0.15rem 0.4rem", 
                            borderRadius: "12px", 
                            background: r.quiz.status === "published" ? "rgba(16,185,129,0.1)" : r.quiz.status === "draft" ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)",
                            color: r.quiz.status === "published" ? "#10B981" : r.quiz.status === "draft" ? "#F59E0B" : "#6B7280",
                            textTransform: "uppercase"
                          }}>
                            {r.quiz.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {r.quiz.question_count || 0} questions
                          {r.quiz.time_limit_minutes && ` · ${r.quiz.time_limit_minutes} min`}
                          {r.attempt?.completed_at && ` · Submitted ${new Date(r.attempt.completed_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
                      {r.attempt ? (
                        <>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: scoreColor }}>
                              {Math.round(pct!)}%
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {r.attempt.score}/{r.attempt.total_points} pts
                            </div>
                          </div>
                          <SvgIcon
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={16}
                            style={{ color: "var(--text-muted)" }}
                          />
                        </>
                      ) : (
                        <span
                          className="badge badge-warning"
                          style={{ fontSize: "0.7rem" }}
                        >
                          Not Attempted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded: Question-level answers */}
                  {isExpanded && (
                    <div
                      className="animate-fade-in"
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                        padding: "1rem 1.25rem",
                        background: "var(--bg-primary)",
                      }}
                    >
                      {loadingExpanded ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
                          <div className="spinner" />
                        </div>
                      ) : expandedData ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          {expandedData.detail.questions
                            .sort((a, b) => a.order - b.order)
                            .map((question) => {
                              const answer = expandedData.attempt.answers?.find(
                                (a) => a.question_id === question.id
                              );
                              const isCorrect = answer?.is_correct;

                              return (
                                <div
                                  key={question.id}
                                  style={{
                                    display: "flex",
                                    gap: "0.75rem",
                                    padding: "0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: "var(--bg-secondary)",
                                    border: `1px solid ${isCorrect ? "rgba(16,185,129,0.2)" : isCorrect === false ? "rgba(239,68,68,0.2)" : "var(--border-subtle)"}`,
                                  }}
                                >
                                  {/* Status indicator */}
                                  <div
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "var(--radius-full)",
                                      background: isCorrect
                                        ? "rgba(16,185,129,0.15)"
                                        : isCorrect === false
                                        ? "rgba(239,68,68,0.15)"
                                        : "var(--bg-primary)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                      marginTop: "2px",
                                    }}
                                  >
                                    <SvgIcon
                                      name={isCorrect ? "check" : isCorrect === false ? "x" : "clock"}
                                      size={13}
                                      style={{
                                        color: isCorrect
                                          ? "#10B981"
                                          : isCorrect === false
                                          ? "#EF4444"
                                          : "var(--text-muted)",
                                      }}
                                    />
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "0.825rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                                      <span style={{ color: "var(--text-muted)", marginRight: "0.35rem" }}>Q{question.order}.</span>
                                      {question.question_text}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.775rem" }}>
                                      <span>
                                        <strong style={{ color: "var(--text-muted)" }}>Student:</strong>{" "}
                                        <span style={{ color: isCorrect ? "#10B981" : isCorrect === false ? "#EF4444" : "var(--text-primary)" }}>
                                          {answer?.student_answer || "—"}
                                        </span>
                                      </span>
                                      {isCorrect === false && question.correct_answer && (
                                        <span>
                                          <strong style={{ color: "var(--text-muted)" }}>Correct:</strong>{" "}
                                          <span style={{ color: "#10B981" }}>{question.correct_answer}</span>
                                        </span>
                                      )}
                                      <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                                        {answer?.points_earned ?? 0}/{question.points} pts
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── TAB: Q&A History ────────────── */}
      {activeTab === "qa" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              Q&A History
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                ({filteredQA.length} questions)
              </span>
            </h2>
            <div style={{ position: "relative", width: "100%", maxWidth: "300px" }}>
              <SvgIcon
                name="search"
                size={15}
                style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search questions..."
                value={qaFilter}
                onChange={(e) => setQaFilter(e.target.value)}
                style={{ paddingLeft: "2.2rem", fontSize: "0.85rem" }}
              />
            </div>
          </div>

          {loadingQA ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={80} />
              ))}
            </div>
          ) : filteredQA.length === 0 ? (
            <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="message-circle" style={{ width: 40, height: 40, opacity: 0.3 }} />
                <div className="empty-state-title">
                  {qaFilter ? "No matching questions" : "No AI Questions Asked"}
                </div>
                <div className="empty-state-desc">
                  {qaFilter
                    ? "Try adjusting your search filter."
                    : "This student hasn't asked any AI questions in this course yet."}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredQA.map((q) => (
                <div
                  key={q.question_id}
                  className="card"
                  style={{ padding: "1rem 1.25rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", gap: "0.75rem" }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>
                      {q.question_text}
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0, alignItems: "center" }}>
                      {q.confidence_score != null && (
                        <span
                          className={`badge ${q.confidence_score >= 0.7 ? "badge-success" : q.confidence_score >= 0.4 ? "badge-warning" : "badge-error"}`}
                          style={{ fontSize: "0.65rem" }}
                        >
                          {Math.round(q.confidence_score * 100)}% conf
                        </span>
                      )}
                      {q.is_flagged && (
                        <span className="badge badge-error" style={{ fontSize: "0.65rem" }}>
                          Flagged
                        </span>
                      )}
                    </div>
                  </div>

                  {q.response_text && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        padding: "0.6rem 0.75rem",
                        background: "var(--bg-primary)",
                        borderRadius: "var(--radius-sm)",
                        borderLeft: "3px solid rgba(139, 92, 246, 0.4)",
                        marginBottom: "0.5rem",
                        maxHeight: "120px",
                        overflow: "hidden",
                      }}
                    >
                      {q.response_text.length > 300 ? q.response_text.slice(0, 300) + "…" : q.response_text}
                    </div>
                  )}

                  {q.teacher_correction && (
                    <div
                      style={{
                        fontSize: "0.775rem",
                        color: "#F59E0B",
                        padding: "0.5rem 0.75rem",
                        background: "rgba(245, 158, 11, 0.06)",
                        borderRadius: "var(--radius-sm)",
                        borderLeft: "3px solid #F59E0B",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>Teacher Correction:</strong> {q.teacher_correction}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.725rem", color: "var(--text-muted)" }}>
                    <span>{new Date(q.asked_at).toLocaleString()}</span>
                    {q.course_title && <span>· {q.course_title}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: Material Progress ──────── */}
      {activeTab === "materials" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Material Progress</h2>

          {loadingCore ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={60} />
              ))}
            </div>
          ) : (
            <>
              {/* Progress Summary Card */}
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                  {/* Doughnut */}
                  <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                    <DoughnutChart
                      labels={["Completed", "Remaining"]}
                      data={[
                        progress?.completed_materials || 0,
                        Math.max((progress?.total_materials || 0) - (progress?.completed_materials || 0), 0),
                      ]}
                      colors={["rgba(99, 102, 241, 0.8)", "rgba(100, 116, 139, 0.15)"]}
                      centerLabel={`${Math.round(progress?.progress_percentage || 0)}%`}
                    />
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                      Course Material Completion
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                      <div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#6366f1" }}>
                          {progress?.completed_materials ?? 0}
                        </div>
                        <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>Completed</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          {progress?.total_materials ?? 0}
                        </div>
                        <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>Total Materials</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: (progress?.progress_percentage ?? 0) >= 80 ? "#10B981" : "#F59E0B" }}>
                          {Math.round(progress?.progress_percentage ?? 0)}%
                        </div>
                        <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>Progress</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info notice */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.85rem 1rem",
                  background: "rgba(37, 99, 235, 0.05)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(37, 99, 235, 0.12)",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                }}
              >
                <SvgIcon name="info" size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                <span>
                  Individual material-level breakdown (e.g., how long a student viewed a specific PDF or video) is tracked per-session on the student side.
                  The aggregate completion count above reflects materials this student has marked as completed within this course.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
