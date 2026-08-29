"use client";

import { useState, useEffect, use, useCallback } from "react";
import api, {
  Course,
  ALExam,
  ALStudentSubmission,
  Lesson,
  TeacherQuestionView,
  StudentCourseProgressResponse,
  EngagementStudent,
} from "@/lib/api";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import LineChart from "@/components/charts/LineChart";
import BarChart from "@/components/charts/BarChart";
import DoughnutChart from "@/components/charts/DoughnutChart";

// ─── Types ──────────────────────────────────
interface StudentExamResult {
  exam: ALExam;
  submission: ALStudentSubmission | null;
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

  const [activeTab, setActiveTab] = useState<"overview" | "exams" | "qa" | "materials">("overview");

  // Data states
  const [course, setCourse] = useState<Course | null>(null);
  const [engagement, setEngagement] = useState<EngagementStudent | null>(null);
  const [progress, setProgress] = useState<StudentCourseProgressResponse | null>(null);
  const [examResults, setExamResults] = useState<StudentExamResult[]>([]);
  const [qaHistory, setQaHistory] = useState<TeacherQuestionView[]>([]);

  // Loading states
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingQA, setLoadingQA] = useState(true);

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

    // Load exam data
    loadExamData();

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

  const loadExamData = useCallback(async () => {
    if (!courseId) return;
    setLoadingExams(true);
    try {
      const exams = await api.listALExams(courseId);
      const results: StudentExamResult[] = [];

      for (const ex of exams) {
        try {
          const subs = await api.listALExamSubmissions(ex.id);
          const studentSub = subs.find((s: any) => s.student_id === studentId || s.user_id === studentId) || null;
          results.push({
            exam: ex,
            submission: studentSub,
          });
        } catch {
          results.push({
            exam: ex,
            submission: null,
          });
        }
      }
      setExamResults(results);
    } catch (err) {
      console.error(err);
      setExamResults([]);
    } finally {
      setLoadingExams(false);
    }
  }, [courseId, studentId]);

  // ─── Derived Data ─────────────────────────
  const completedExams = examResults.filter((r) => r.submission !== null);
  const avgExamScore =
    completedExams.length > 0
      ? completedExams.reduce((sum, r) => sum + (r.submission?.scaled_score ?? r.submission?.percentage ?? r.submission?.total_score ?? 0), 0) / completedExams.length
      : null;

  // Score trend for chart
  const scoreTrend = completedExams
    .filter((r) => r.submission?.submitted_at)
    .sort((a, b) => new Date(a.submission!.submitted_at!).getTime() - new Date(b.submission!.submitted_at!).getTime())
    .map((r) => ({
      label: r.exam.title.length > 18 ? r.exam.title.slice(0, 18) + "…" : r.exam.title,
      score: Math.round(r.submission?.scaled_score ?? r.submission?.percentage ?? r.submission?.total_score ?? 0),
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

  const statCards: Array<{ label: string; value: string | number; total?: string; icon: IconName; color: string; sub: string }> = [
    {
      label: "Material Completion",
      value: loadingCore ? "…" : progress ? `${Math.round(progress.progress_percentage)}%` : "0%",
      icon: "layers",
      color: "#6366f1",
      sub: progress ? `${progress.completed_materials}/${progress.total_materials} materials` : "",
    },
    {
      label: "A/L Exams Taken",
      value: loadingExams ? "…" : completedExams.length,
      total: loadingExams ? "" : `/ ${examResults.length}`,
      icon: "award",
      color: "#10B981",
      sub: "Examination attempts",
    },
    {
      label: "Average Exam Score",
      value: loadingExams
        ? "…"
        : avgExamScore != null
        ? Math.round(avgExamScore) + "%"
        : "N/A",
      icon: "percent",
      color: avgExamScore != null && avgExamScore >= 60 ? "#10B981" : "#F59E0B",
      sub: avgExamScore != null ? (avgExamScore >= 75 ? "Distinction level" : avgExamScore >= 60 ? "Proficient" : "Needs reinforcement") : "No submissions yet",
    },
    {
      label: "AI Questions Asked",
      value: loadingQA ? "…" : qaHistory.length,
      icon: "sparkle",
      color: "#8b5cf6",
      sub: `${topicCounts[course?.title || ""] || qaHistory.length} in this course`,
    },
  ];

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
              fontSize: "1.25rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {studentName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{studentName}</h1>
              {engagement && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "var(--radius-full)",
                    background: engInfo.bg,
                    color: engInfo.text,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {engInfo.label} Engagement
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Enrolled in <strong style={{ color: "var(--text-secondary)" }}>{course?.title || `Course #${courseId}`}</strong>
              {engagement?.enrolled_at && ` · Enrolled ${new Date(engagement.enrolled_at).toLocaleDateString()}`}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-secondary"
            onClick={() => router.push(`/dashboard/teacher/inbox?studentId=${studentId}`)}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.825rem" }}
          >
            <SvgIcon name="mail" size={15} />
            Message Student
          </button>
          <button
            className="btn-secondary"
            onClick={() => setActiveTab("qa")}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.825rem" }}
          >
            <SvgIcon name="message-circle" size={15} />
            View Q&A ({qaHistory.length})
          </button>
        </div>
      </div>

      {/* ─── Metric Cards ──────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {statCards.map((m, idx) => (
          <div key={idx} className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: `${m.color}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SvgIcon name={m.icon} size={18} style={{ color: m.color }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>
                {m.value}
                {m.total && <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--text-muted)" }}>{m.total}</span>}
              </div>
              <div className="stat-label" style={{ marginTop: "0.25rem" }}>{m.label}</div>
              {m.sub && <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{m.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Tab Navigation ───────────────── */}
      <div className="tabs" style={{ marginBottom: "1.5rem" }}>
        {[
          { key: "overview", label: "Overview", icon: "grid" as const },
          { key: "exams", label: "A/L Exam Submissions", icon: "award" as const },
          { key: "qa", label: "Q&A History", icon: "message-circle" as const },
          { key: "materials", label: "Material Progress", icon: "layers" as const },
        ].map((tab) => (
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
            <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>A/L Exam Performance Trend</h2>
            {loadingExams ? (
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
                {completedExams.length === 0
                  ? "No exam submissions yet — score progression will appear here."
                  : "Need at least 2 completed exam submissions to display a trend line."}
              </div>
            )}
          </div>

          {/* Two-column: Exam Performance + Activity Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Exam Performance Breakdown */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Recent A/L Exam Submissions</h2>
              {loadingExams ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} height={40} />
                  ))}
                </div>
              ) : examResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No examination papers assigned to this course yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {examResults.slice(0, 6).map((r) => {
                    const score = r.submission?.scaled_score ?? r.submission?.percentage ?? r.submission?.total_score;
                    const scoreColor = score != null ? (score >= 70 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444") : "var(--text-muted)";
                    return (
                      <div
                        key={r.exam.id}
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
                            name={r.submission ? "check-circle" : "clock"}
                            size={15}
                            style={{ color: r.submission ? "#10B981" : "var(--text-muted)", flexShrink: 0 }}
                          />
                          <span style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.exam.title}
                          </span>
                        </div>
                        {r.submission ? (
                          <span style={{ fontWeight: 600, color: scoreColor, flexShrink: 0 }}>
                            {Math.round(score!)}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontStyle: "italic", flexShrink: 0 }}>
                            Not attempted
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {examResults.length > 6 && (
                    <button
                      className="btn-secondary"
                      onClick={() => setActiveTab("exams")}
                      style={{ padding: "0.4rem 0.75rem", fontSize: "0.775rem", alignSelf: "flex-start", marginTop: "0.25rem" }}
                    >
                      View All {examResults.length} Papers →
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

                {/* Exam Completion */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Exam Submissions</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {completedExams.length}/{examResults.length}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${examResults.length > 0 ? (completedExams.length / examResults.length) * 100 : 0}%`,
                        background: "linear-gradient(90deg, #10B981, #34d399)",
                        borderRadius: 4,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: A/L Exam Submissions ──────── */}
      {activeTab === "exams" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              A/L Examination Submissions
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                ({completedExams.length} submitted of {examResults.length} papers)
              </span>
            </h2>
          </div>

          {loadingExams ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={64} />
              ))}
            </div>
          ) : examResults.length === 0 ? (
            <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="award" style={{ width: 40, height: 40, opacity: 0.3 }} />
                <div className="empty-state-title">No Exam Papers Found</div>
                <div className="empty-state-desc">There are no examination papers created in this course yet.</div>
              </div>
            </div>
          ) : (
            examResults.map((r) => {
              const score = r.submission?.scaled_score ?? r.submission?.percentage ?? r.submission?.total_score;
              const scoreColor = score != null ? (score >= 70 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444") : "var(--text-muted)";

              return (
                <div key={r.exam.id} className="card" style={{ padding: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "var(--radius-sm)",
                        background: r.submission ? "rgba(16,185,129,0.1)" : "var(--bg-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <SvgIcon
                        name={r.submission ? "check-circle" : "clock"}
                        size={20}
                        style={{ color: r.submission ? "#10B981" : "var(--text-muted)" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {r.exam.title}
                        <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: "12px", background: "rgba(99,102,241,0.1)", color: "#6366f1", textTransform: "uppercase" }}>
                          {r.exam.exam_type?.replace(/_/g, " ") || "A/L Paper"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        {r.exam.time_limit_minutes ? `${r.exam.time_limit_minutes} mins` : "Standard duration"}
                        {r.submission?.submitted_at && ` · Submitted on ${new Date(r.submission.submitted_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                    {r.submission ? (
                      <>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: scoreColor }}>
                            {Math.round(score!)}%
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                            {r.submission.status?.replace(/_/g, " ") || "Submitted"}
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/teacher/al-exams/grade/${r.submission.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
                        >
                          <SvgIcon name="check-circle" size={14} /> Open SpeedGrader
                        </Link>
                      </>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: "0.75rem" }}>
                        Not Attempted
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── TAB: Q&A History ──────────────── */}
      {activeTab === "qa" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              Student Q&A History
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                ({filteredQA.length} questions)
              </span>
            </h2>
            <input
              type="text"
              placeholder="Filter questions..."
              value={qaFilter}
              onChange={(e) => setQaFilter(e.target.value)}
              className="input"
              style={{ maxWidth: 260, fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
            />
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
                <div className="empty-state-title">No Questions Found</div>
                <div className="empty-state-desc">This student has not asked any questions in this course yet.</div>
              </div>
            </div>
          ) : (
            filteredQA.map((q) => (
              <div key={q.question_id} className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    {q.question_text}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {new Date(q.asked_at).toLocaleDateString()}
                  </span>
                </div>
                {q.response_text && (
                  <div style={{ marginTop: "0.75rem", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", borderLeft: "3px solid #6366f1" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6366f1", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <SvgIcon name="sparkle" size={13} /> AI Tutor Response
                    </div>
                    <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {q.response_text}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── TAB: Material Progress ────────── */}
      {activeTab === "materials" && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Learning Material Completion Status</h2>
            {loadingCore ? (
              <Skeleton height={120} />
            ) : progress ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 500 }}>Overall Syllabus Coverage</span>
                    <span style={{ fontWeight: 700, color: "#6366f1" }}>{Math.round(progress.progress_percentage)}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: "var(--bg-primary)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${progress.progress_percentage}%`,
                        background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                        borderRadius: 5,
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                  <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Completed Study Materials</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.2rem" }}>{progress.completed_materials}</div>
                  </div>
                  <div style={{ padding: "0.85rem", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Course Materials</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.2rem" }}>{progress.total_materials}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No material progress recorded.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
