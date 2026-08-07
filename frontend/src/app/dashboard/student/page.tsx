"use client";

import { useState, useEffect } from "react";
import api, { StudentProgress, Course, StudentQuizHistory, StudentCoursePerformance } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import StudentOnboardingModal from "@/components/StudentOnboardingModal";
import Link from "next/link";
import { DashboardSkeleton } from "@/components/Skeleton";

export default function StudentDashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizHistory, setQuizHistory] = useState<StudentQuizHistory | null>(null);
  const [coursePerf, setCoursePerf] = useState<Record<number, StudentCoursePerformance>>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Daily Briefing & Onboarding Modal State
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const onboarded = localStorage.getItem(`lms_student_onboarded_${user.id}`);
      if (!onboarded && courses.length === 0) {
        setShowOnboardingModal(true);
      }
    }
  }, [loading, user, courses.length]);

  useEffect(() => {
    Promise.all([
      api.getStudentProgress(),
      api.getMyEnrolledCourses(),
      api.getStudentQuizHistory(),
      api.getNotifications().catch(() => []),
      api.listAssignments().catch(() => []),
    ])
      .then(([progressData, coursesData, historyData, notifData, assignData]) => {
        setProgress(progressData);
        setCourses(coursesData);
        setQuizHistory(historyData);
        setNotifications(notifData || []);
        setPendingAssignments((assignData || []).filter((a: any) => !a.my_submission || a.my_submission.status === "draft"));

        // Fetch performance for each enrolled course
        Promise.all(
          coursesData.map((c: Course) => api.getStudentCoursePerformance(c.id).then(perf => ({ id: c.id, perf })))
        ).then(results => {
          const perfMap: Record<number, StudentCoursePerformance> = {};
          results.forEach(r => { perfMap[r.id] = r.perf; });
          setCoursePerf(perfMap);
        }).catch(() => {
          addToast("Could not load course performance data", "warning");
        });
      })
      .catch(() => {
        addToast("Failed to load dashboard data. Please refresh.", "error");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [briefingTab, setBriefingTab] = useState<"priority" | "assignments" | "notifications">("priority");
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);

  const unreadNotifs = notifications.filter((n: any) => !n.is_read);
  const todayDate = new Date().toISOString().slice(0, 10);
  const briefingKey = user?.id ? `student_briefing_seen_${user.id}_${todayDate}` : null;

  // Auto-open Daily Briefing Modal ONCE per day on first login
  useEffect(() => {
    if (!loading && briefingKey && (unreadNotifs.length > 0 || pendingAssignments.length > 0)) {
      const seenToday = localStorage.getItem(briefingKey);
      if (!seenToday) {
        setShowBriefingModal(true);
      }
    }
  }, [loading, briefingKey, unreadNotifs.length, pendingAssignments.length]);

  const handleDismissBriefing = () => {
    if (briefingKey) {
      localStorage.setItem(briefingKey, "true");
    }
    setShowBriefingModal(false);
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await api.markAllNotificationsRead();
      const updated = await api.getNotifications().catch(() => []);
      setNotifications(updated || []);
      addToast("All notifications marked as read!", "success");
    } catch {
      addToast("Failed to mark notifications read.", "error");
    } finally {
      setMarkingAllRead(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const firstName = user?.full_name?.split(" ")[0] || "Student";

  const perfs = Object.values(coursePerf);
  const avgCompletion = perfs.length ? perfs.reduce((acc, p) => acc + p.completion_percentage, 0) / perfs.length : 0;
  
  const completedAttempts = quizHistory?.attempts.filter(a => a.completed_at) || [];
  const avgScore = completedAttempts.length 
    ? completedAttempts.reduce((acc, a) => acc + (a.percentage ?? 0), 0) / completedAttempts.length 
    : 0;

  const recentAttempts = [...completedAttempts].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()).slice(0, 5).reverse();

  // Aggregate data for action sections
  const allQuizzes = Object.values(coursePerf).flatMap(perf => perf.quiz_results || []);
  const unattemptedQuizzes = allQuizzes.filter(q => q?.status === "not_attempted" || q?.status === "in_progress");

  // Build 360° course snapshots for Active Learning Hub
  const courseSnapshots = courses.map(c => {
    const perf = coursePerf[c.id];
    const cAssignments = pendingAssignments.filter((a: any) => a.course_id === c.id || a.course_title === c.title);
    const cQuizzes = unattemptedQuizzes.filter((q: any) => q.course_id === c.id || q.course_title === c.title);
    const cLowQuizzes = (quizHistory?.attempts || []).filter((a: any) => a.percentage < 60 && (a.course_id === c.id || a.course_title === c.title));

    return {
      course: c,
      perf: perf || null,
      assignments: cAssignments,
      quizzes: cQuizzes,
      lowQuizzes: cLowQuizzes,
      isLowProgress: (perf?.completion_percentage ?? 0) < 50 && (perf?.completion_percentage ?? 0) > 0,
    };
  });

  const activeSnapshot = courseSnapshots[Math.min(activeCourseIndex, Math.max(0, courseSnapshots.length - 1))] || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "calc(100vh - 4.5rem)", overflow: "hidden", paddingBottom: "0.25rem" }}>
      <div>
        {/* Header & Daily Briefing Action */}
        <div className="page-header" style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Welcome back, {firstName}</h1>
          </div>

          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowBriefingModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.45rem 0.85rem", fontSize: "0.8rem", position: "relative" }}
          >
            <SvgIcon name="bell" size={15} style={{ color: unreadNotifs.length > 0 ? "var(--accent-primary)" : "var(--text-muted)" }} />
            <span>Daily Briefing</span>
            {(unreadNotifs.length > 0 || pendingAssignments.length > 0) && (
              <span style={{
                background: "var(--accent-primary)", color: "#fff", borderRadius: "10px", padding: "1px 7px",
                fontSize: "0.7rem", fontWeight: 700, marginLeft: "2px"
              }}>
                {unreadNotifs.length + pendingAssignments.length}
              </span>
            )}
          </button>
        </div>

        {/* 1. Overview Analytics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          {/* Core Metric: Course Progress */}
          <div className="card" style={{ padding: "0.9rem 1.15rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.6rem" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(37,99,235,0.1)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SvgIcon name="target" size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Overall Progress</h3>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{avgCompletion.toFixed(0)}%</div>
              </div>
            </div>
            <div style={{ height: "6px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${avgCompletion}%`, background: "var(--accent-primary)", borderRadius: "3px" }} />
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Average completion across {perfs.length} enrolled courses.
            </div>
          </div>

          {/* Core Metric: Quiz Average */}
          <div className="card" style={{ padding: "0.9rem 1.15rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.6rem" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SvgIcon name="check-circle" size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Quiz Average</h3>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{avgScore.toFixed(1)}%</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "24px", opacity: 0.8 }}>
              {recentAttempts.length > 0 ? recentAttempts.map((att, i) => (
                <div key={i} style={{ flex: 1, background: (att.percentage ?? 0) >= 70 ? "var(--success)" : (att.percentage ?? 0) >= 50 ? "var(--warning)" : "var(--error)", height: `${Math.max(10, att.percentage ?? 0)}%`, borderRadius: "3px 3px 0 0", minWidth: "10px", transition: "height 0.3s ease" }} title={`Score: ${(att.percentage ?? 0).toFixed(0)}%`} />
              )) : <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", alignSelf: "center" }}>No recent quizzes</div>}
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Based on {completedAttempts.length} completed quizzes.
            </div>
          </div>

          {/* Activity Summary */}
          <div className="card" style={{ padding: "0.9rem 1.15rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.6rem" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.1)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SvgIcon name="activity" size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Activity Summary</h3>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{progress?.courses_enrolled ?? 0} <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}>courses</span></div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}><SvgIcon name="check-circle" size={13} /> Quizzes Taken</span>
                <span style={{ fontWeight: 600 }}>{progress?.quizzes_taken ?? 0}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}><SvgIcon name="file-text" size={13} /> Courseworks Submitted</span>
                <span style={{ fontWeight: 600 }}>{progress?.coursework_submitted ?? 0}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.35rem" }}><SvgIcon name="award" size={13} /> Coursework Avg</span>
                <span style={{ fontWeight: 600 }}>{progress?.average_coursework_score != null ? `${progress.average_coursework_score}%` : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Learning Hub (360° All-in-One Viewport Command Center) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SvgIcon name="layers" size={18} style={{ color: "var(--accent-primary)" }} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Active Learning Hub</h2>
          </div>
        </div>

        {activeSnapshot ? (
          <div className="card shadow-sm animate-fade-in" style={{
            padding: "1.15rem 1.4rem", borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(124,58,237,0.07) 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
            display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, gap: "0.85rem"
          }}>
            
            {/* Top Row: Course Header + In-Card Arrow Carousel Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                  <span className="badge" style={{ background: "rgba(37,99,235,0.12)", color: "var(--accent-primary)", border: "1px solid rgba(37,99,235,0.3)", fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {activeSnapshot.perf?.completion_percentage === 100 ? "Completed Course" : "Enrolled Course"}
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    • {(activeSnapshot.perf?.completion_percentage ?? 0).toFixed(0)}% Complete
                  </span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", lineHeight: 1.25 }}>
                  {activeSnapshot.course.title}
                </h3>
              </div>

              {/* In-Card Arrow Controls for swapping courses */}
              {courseSnapshots.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-card)", padding: "0.3rem 0.55rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    Course {activeCourseIndex + 1} of {courseSnapshots.length}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      aria-label="Previous course"
                      onClick={() => setActiveCourseIndex(prev => (prev === 0 ? courseSnapshots.length - 1 : prev - 1))}
                      style={{ padding: "0.15rem 0.4rem", display: "inline-flex", alignItems: "center" }}
                    >
                      <SvgIcon name="chevron-left" size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      aria-label="Next course"
                      onClick={() => setActiveCourseIndex(prev => (prev === courseSnapshots.length - 1 ? 0 : prev + 1))}
                      style={{ padding: "0.15rem 0.4rem", display: "inline-flex", alignItems: "center" }}
                    >
                      <SvgIcon name="chevron-right" size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
              {activeSnapshot.course.description ? (activeSnapshot.course.description.length > 130 ? activeSnapshot.course.description.slice(0, 130) + "…" : activeSnapshot.course.description) : "Resume your learning path and track all deliverables for this course."}
            </p>

            {/* Visual Course Progress Bar & Tri-Factor Breakdown */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.3rem" }}>
                <span>Weighted Course Progress</span>
                <span style={{ color: "var(--accent-primary)" }}>{(activeSnapshot.perf?.completion_percentage ?? 0).toFixed(0)}%</span>
              </div>
              <div style={{ height: "7px", borderRadius: "4px", background: "var(--border-subtle)", overflow: "hidden", marginBottom: "0.6rem" }}>
                <div style={{
                  height: "100%", borderRadius: "4px",
                  width: `${activeSnapshot.perf?.completion_percentage ?? 0}%`,
                  background: (activeSnapshot.perf?.completion_percentage ?? 0) === 100 ? "#10B981" : "linear-gradient(90deg, #3B82F6 0%, #6366F1 100%)",
                  transition: "width 0.8s ease",
                }} />
              </div>

              {/* Tri-Factor Breakdown Pills */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                <div style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-sm)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", fontSize: "0.725rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.675rem", fontWeight: 700 }}>📘 Materials (45%)</div>
                  <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                    {activeSnapshot.perf?.materials_score ?? 45.0}% <span style={{ fontSize: "0.675rem", color: "var(--text-muted)", fontWeight: 500 }}>({activeSnapshot.perf?.completed_materials ?? 0}/{activeSnapshot.perf?.total_materials ?? 0})</span>
                  </div>
                </div>
                <div style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-sm)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", fontSize: "0.725rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.675rem", fontWeight: 700 }}>📝 Coursework (35%)</div>
                  <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                    {activeSnapshot.perf?.coursework_score ?? 35.0}% <span style={{ fontSize: "0.675rem", color: "var(--text-muted)", fontWeight: 500 }}>({activeSnapshot.perf?.submitted_assignments ?? 0}/{activeSnapshot.perf?.total_assignments ?? 0})</span>
                  </div>
                </div>
                <div style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-sm)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", fontSize: "0.725rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.675rem", fontWeight: 700 }}>🧩 Quizzes (20%)</div>
                  <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>
                    {activeSnapshot.perf?.quiz_score ?? 20.0}% <span style={{ fontSize: "0.675rem", color: "var(--text-muted)", fontWeight: 500 }}>({activeSnapshot.perf?.completed_quizzes ?? 0}/{activeSnapshot.perf?.total_quizzes ?? 0})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3-Module Sub-Grid for 360° Course Snapshots */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              
              {/* Module 1: Mastery & Engagement */}
              <div style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="bar-chart" size={13} style={{ color: "var(--accent-primary)" }} />
                  <span>Mastery & Engagement</span>
                </div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Quizzes: <strong style={{ color: "var(--accent-primary)" }}>{activeSnapshot.perf ? `${activeSnapshot.perf.completed_quizzes} / ${activeSnapshot.perf.total_quizzes}` : "0 / 0"}</strong>
                </div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Questions Asked: <strong style={{ color: "var(--accent-primary)" }}>{activeSnapshot.perf?.questions_asked ?? 0}</strong>
                </div>
              </div>

              {/* Module 2: Pending Deliverables (Coursework & Quizzes) */}
              <div style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="file-text" size={13} style={{ color: "#D97706" }} />
                  <span>Pending Deliverables</span>
                </div>

                {activeSnapshot.assignments.length > 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-primary)" }}>
                    📌 Due: <strong style={{ color: "#D97706" }}>{activeSnapshot.assignments[0].title}</strong>
                  </div>
                ) : activeSnapshot.quizzes.length > 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-primary)" }}>
                    📝 Pending: <strong style={{ color: "#6366F1" }}>{activeSnapshot.quizzes[0].quiz_title}</strong>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="check-circle" size={13} />
                    <span>All coursework submitted!</span>
                  </div>
                )}
              </div>

              {/* Module 3: Course Alerts & Warnings */}
              <div style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="bell" size={13} style={{ color: "var(--warning)" }} />
                  <span>Course Attention Status</span>
                </div>

                {activeSnapshot.lowQuizzes.length > 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--error)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="alert-circle" size={13} />
                    <span>Score review needed ({activeSnapshot.lowQuizzes[0].percentage}%)</span>
                  </div>
                ) : activeSnapshot.isLowProgress ? (
                  <div style={{ fontSize: "0.78rem", color: "#D97706", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="activity" size={13} />
                    <span>Progress below 50%</span>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name="shield" size={13} />
                    <span>On track — Excellent mastery!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Action Bar */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
              {activeSnapshot.assignments.length > 0 && (
                <Link
                  href="/dashboard/student/assignments"
                  className="btn-secondary btn-sm"
                  style={{ textDecoration: "none", fontWeight: 600, padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                >
                  Submit Assignment
                </Link>
              )}
              {activeSnapshot.quizzes.length > 0 && (
                <Link
                  href={`/dashboard/student/quizzes/${activeSnapshot.quizzes[0].quiz_id}`}
                  className="btn-secondary btn-sm"
                  style={{ textDecoration: "none", fontWeight: 600, padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                >
                  Take Quiz
                </Link>
              )}
              <Link
                href={`/dashboard/student/courses/${activeSnapshot.course.id}`}
                className="btn-primary btn-sm"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, padding: "0.4rem 0.9rem", fontSize: "0.8rem" }}
              >
                <span>Resume Course Workspace</span>
                <SvgIcon name="arrow-right" size={15} />
              </Link>
            </div>

          </div>
        ) : (
          <div className="card empty-state" style={{ padding: "2rem", background: "var(--bg-card)" }}>
            <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
            <div className="empty-state-title" style={{ fontSize: "1.1rem" }}>You are not enrolled in any courses yet.</div>
            <div className="empty-state-desc" style={{ fontSize: "0.85rem" }}>Explore the course catalog to start learning.</div>
            <Link href="/dashboard/student/billing?tab=browse" className="btn-primary btn-sm" style={{ textDecoration: "none", marginTop: "1rem" }}>
              Browse & Enroll Classes
            </Link>
          </div>
        )}
      </div>

      {/* Daily Learning Briefing Modal (Spacious & Focused UI/UX) */}
      {showBriefingModal && (
        <Modal title="Daily Learning Briefing" onClose={handleDismissBriefing} maxWidth="720px">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            {/* Header Banner & Date Greeting */}
            <div style={{
              padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))",
              border: "1px solid rgba(124,58,237,0.15)",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem"
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}!</span>
                  <SvgIcon name="sparkle" size={18} style={{ color: "#F59E0B" }} />
                </h3>
                <p style={{ margin: "3px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                  Your personalized digest for {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </p>
              </div>
              
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {pendingAssignments.length > 0 && (
                  <span className="badge" style={{ background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)", fontSize: "0.725rem", fontWeight: 700 }}>
                    {pendingAssignments.length} Assignment{pendingAssignments.length > 1 ? "s" : ""} Due
                  </span>
                )}
                {unreadNotifs.length > 0 && (
                  <span className="badge" style={{ background: "rgba(37,99,235,0.12)", color: "#2563EB", border: "1px solid rgba(37,99,235,0.3)", fontSize: "0.725rem", fontWeight: 700 }}>
                    {unreadNotifs.length} Alert{unreadNotifs.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", gap: "0.5rem" }}>
              {[
                { key: "priority" as const, label: "Top Priority Focus", icon: "sparkle" as const },
                { key: "assignments" as const, label: `Pending Coursework (${pendingAssignments.length})`, icon: "file-text" as const },
                { key: "notifications" as const, label: `Unread Updates (${unreadNotifs.length})`, icon: "bell" as const },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBriefingTab(tab.key)}
                  style={{
                    padding: "0.6rem 0.9rem", border: "none",
                    borderBottom: briefingTab === tab.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
                    background: "transparent", cursor: "pointer",
                    fontSize: "0.825rem", fontWeight: briefingTab === tab.key ? 700 : 500,
                    color: briefingTab === tab.key ? "var(--accent-primary)" : "var(--text-muted)",
                    display: "inline-flex", alignItems: "center", gap: "0.4rem",
                    transition: "all 0.15s ease"
                  }}
                >
                  <SvgIcon name={tab.icon} size={15} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* TAB 1: TOP PRIORITY FOCUS */}
            {briefingTab === "priority" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {pendingAssignments.length > 0 ? (
                  <div className="card shadow-sm" style={{
                    padding: "1.5rem", borderRadius: "var(--radius-md)",
                    background: "rgba(245,158,11,0.03)", border: "1px solid rgba(245,158,11,0.25)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#D97706", background: "rgba(245,158,11,0.15)", padding: "2px 8px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <SvgIcon name="target" size={13} style={{ color: "#D97706" }} />
                        <span>#1 Priority Focus Today</span>
                      </span>
                    </div>
                    
                    <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {pendingAssignments[0].title}
                    </h4>
                    
                    <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      Due Date: <strong style={{ color: "var(--text-primary)" }}>
                        {pendingAssignments[0].due_date ? new Date(pendingAssignments[0].due_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "No deadline"}
                      </strong> ({pendingAssignments[0].max_marks} Total Points)
                    </p>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Link
                        href="/dashboard/student/assignments"
                        onClick={handleDismissBriefing}
                        className="btn-primary btn-sm"
                        style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                      >
                        <span>Start Assignment Now</span>
                        <SvgIcon name="arrow-right" size={14} />
                      </Link>
                    </div>
                  </div>
                ) : unreadNotifs.length > 0 ? (
                  <div className="card shadow-sm" style={{
                    padding: "1.5rem", borderRadius: "var(--radius-md)",
                    background: "rgba(37,99,235,0.03)", border: "1px solid rgba(37,99,235,0.2)"
                  }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2563EB", background: "rgba(37,99,235,0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                      Latest Notification
                    </span>
                    <h4 style={{ margin: "0.75rem 0 0.4rem 0", fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      {unreadNotifs[0].title}
                    </h4>
                    <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {unreadNotifs[0].message}
                    </p>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="btn-secondary btn-sm"
                      style={{ fontSize: "0.78rem" }}
                    >
                      Clear Unread Notifications
                    </button>
                  </div>
                ) : (
                  <div className="card" style={{ padding: "2rem", textAlign: "center", background: "rgba(16,185,129,0.03)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    <SvgIcon name="check-circle" size={36} style={{ color: "#10B981", marginBottom: "0.5rem" }} />
                    <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>You are completely caught up!</h4>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                      Zero pending assignments and zero unread notifications. Keep up the great momentum!
                    </p>
                  </div>
                )}

                {/* AI Study Tip */}
                <div style={{
                  padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)",
                  background: "rgba(124,58,237,0.04)", border: "1px solid rgba(124,58,237,0.12)",
                  display: "flex", alignItems: "center", gap: "0.75rem"
                }}>
                  <SvgIcon name="sparkle" size={18} style={{ color: "#7C3AED", flexShrink: 0 }} />
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    <strong style={{ color: "#7C3AED" }}>AI Study Tip: </strong>
                    Completing coursework at least 24 hours before the deadline increases score accuracy by 18%.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PENDING COURSEWORK */}
            {briefingTab === "assignments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                {pendingAssignments.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No pending coursework submissions. Great job!
                  </div>
                ) : (
                  pendingAssignments.map((assign: any) => (
                    <div key={assign.id} className="card shadow-sm" style={{
                      padding: "0.85rem 1.1rem", borderRadius: "var(--radius-sm)",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem"
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)" }}>{assign.title}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          Due: {assign.due_date ? new Date(assign.due_date).toLocaleDateString() : "No deadline"} • {assign.max_marks} pts
                        </div>
                      </div>
                      <Link
                        href="/dashboard/student/assignments"
                        onClick={handleDismissBriefing}
                        className="btn-secondary btn-sm"
                        style={{ textDecoration: "none", fontSize: "0.75rem", flexShrink: 0 }}
                      >
                        Submit &rarr;
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: UNREAD NOTIFICATIONS */}
            {briefingTab === "notifications" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                {unreadNotifs.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No unread notifications. You are all caught up!
                  </div>
                ) : (
                  unreadNotifs.map((notif: any) => (
                    <div key={notif.id} className="card shadow-sm" style={{ padding: "0.85rem 1.1rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{notif.title}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "3px", lineHeight: 1.4 }}>{notif.message}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        {new Date(notif.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Modal Footer Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.85rem", borderTop: "1px solid var(--border-subtle)" }}>
              {unreadNotifs.length > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAllRead}
                  style={{ border: "none", background: "transparent", color: "var(--accent-primary)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                >
                  {markingAllRead ? "Clearing..." : "Mark All Notifications Read"}
                </button>
              ) : <div />}

              <div style={{ display: "flex", gap: "0.65rem" }}>
                <Link href="/dashboard/student/assignments" onClick={handleDismissBriefing} className="btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                  View Coursework
                </Link>
                <button type="button" className="btn-primary btn-sm" onClick={handleDismissBriefing}>
                  Got It
                </button>
              </div>
            </div>

          </div>
        </Modal>
      )}

      {/* First-Time Student Stream Onboarding Wizard */}
      <StudentOnboardingModal
        open={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        onComplete={() => {
          api.getMyEnrolledCourses().then(c => setCourses(c || [])).catch(() => {});
        }}
        userId={user?.id}
      />
    </div>
  );
}
