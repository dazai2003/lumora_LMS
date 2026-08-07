"use client";

import { useState, useEffect } from "react";
import api, { Course, Quiz, QuizAttempt } from "@/lib/api";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

type QuizWithContext = Quiz & { course_title: string; attempts: QuizAttempt[] };

export default function StudentQuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"available" | "completed" | "review">("available");
  const { addToast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const courses: Course[] = await api.getMyEnrolledCourses();
        const allQuizzes: QuizWithContext[] = [];
        for (const course of courses) {
          const lessons = await api.listLessons(course.id);
          for (const lesson of lessons) {
            const qs: Quiz[] = await api.listQuizzes(lesson.id).catch(() => []);
            for (const q of qs) {
              if (q.status !== "published") continue;
              const attempts = await api.getQuizAttempts(q.id).catch(() => []);
              allQuizzes.push({ ...q, course_title: course.title, attempts });
            }
          }
        }
        setQuizzes(allQuizzes);
      } catch (err) { 
        console.error(err); 
        addToast("Failed to load quizzes.", "error");
      } finally { 
        setLoading(false); 
      }
    };
    load();
  }, [addToast]);

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  const available = quizzes.filter(q => q.attempts.length === 0 || !q.attempts.some(a => a.completed_at));
  const completed = quizzes.filter(q => q.attempts.some(a => a.completed_at && (a.percentage ?? 0) >= 60));
  const needsReview = quizzes.filter(q => q.attempts.some(a => a.completed_at && (a.percentage ?? 0) < 60) && !q.attempts.some(a => a.completed_at && (a.percentage ?? 0) >= 60));

  const displayList = activeTab === "available" ? available : activeTab === "completed" ? completed : needsReview;

  return (
    <div>
      <div className="page-header">
        <h1>Quizzes</h1>
        <p>Test your knowledge and track your performance</p>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.5rem" }}>
          {([
            { key: "available" as const, label: `Available (${available.length})` },
            { key: "completed" as const, label: `Completed (${completed.length})` },
            { key: "review" as const, label: `Needs Review (${needsReview.length})` },
          ]).map((t) => (
            <button
              key={t.key}
              className={`btn-sm ${activeTab === t.key ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

      {displayList.length > 0 ? (
        <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {displayList.map((q) => {
            const bestAttempt = q.attempts.length > 0 ? [...q.attempts].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0] : null;
            const inProgressAttempt = q.attempts.find((a) => !a.completed_at && a.status === "in_progress");

            return (
              <div
                key={q.id}
                className="card shadow-sm"
                style={{
                  display: "flex", flexDirection: "column", padding: "1.35rem",
                  background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)", transition: "all 0.2s ease"
                }}
              >
                {/* Header: Icon, Title & Score Badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{
                      width: "42px", height: "42px", borderRadius: "10px",
                      background: q.is_ai_generated ? "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(37,99,235,0.15))" : "rgba(37, 99, 235, 0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      <SvgIcon name={q.is_ai_generated ? "sparkle" : "clipboard"} size={20} style={{ color: q.is_ai_generated ? "#7C3AED" : "var(--accent-primary)" }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "1.025rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
                        {q.title}
                      </h3>
                      <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        {q.course_title}
                      </div>
                    </div>
                  </div>

                  {bestAttempt && bestAttempt.completed_at && (
                    <span className={`badge ${(bestAttempt.percentage ?? 0) >= 70 ? "badge-success" : (bestAttempt.percentage ?? 0) >= 50 ? "badge-warning" : "badge-error"}`} style={{ fontWeight: 800, fontSize: "0.75rem", padding: "0.35rem 0.65rem", flexShrink: 0 }}>
                      {(bestAttempt.percentage ?? 0).toFixed(0)}% Score
                    </span>
                  )}
                </div>
                
                {/* Description */}
                <p style={{ color: "var(--text-secondary)", fontSize: "0.835rem", marginBottom: "1.1rem", flex: 1, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {q.description || "Interactive quiz assessment designed to test your core concept understanding."}
                </p>

                {/* Micro-Pill Metadata Badges */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.1rem" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0.6rem", borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.07)", border: "1px solid rgba(37, 99, 235, 0.15)", color: "var(--accent-primary)", fontSize: "0.74rem", fontWeight: 700 }}>
                    <SvgIcon name="file-text" size={13} />
                    <span>{q.question_count} Questions</span>
                  </span>

                  {q.time_limit_minutes && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0.6rem", borderRadius: "var(--radius-sm)", background: "rgba(217, 119, 6, 0.08)", border: "1px solid rgba(217, 119, 6, 0.2)", color: "#D97706", fontSize: "0.74rem", fontWeight: 700 }}>
                      <SvgIcon name="clock" size={13} />
                      <span>{q.time_limit_minutes} Mins</span>
                    </span>
                  )}

                  {q.available_until && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", borderRadius: "var(--radius-sm)", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#EF4444", fontSize: "0.725rem", fontWeight: 700 }}>
                      <SvgIcon name="calendar" size={12} />
                      <span>Due: {new Date(q.available_until).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    </span>
                  )}
                </div>

                {/* Aligned Action Button */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.9rem" }}>
                  <Link
                    href={`/dashboard/student/quizzes/${q.id}`}
                    className={inProgressAttempt ? "btn-primary" : activeTab === "available" ? "btn-primary" : "btn-secondary"}
                    style={{
                      width: "100%", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: "0.4rem",
                      padding: "0.6rem 1rem", fontSize: "0.835rem", fontWeight: 700, textDecoration: "none",
                      ...(inProgressAttempt ? { background: "linear-gradient(135deg, #D97706, #EA580C)", color: "#fff" } : {})
                    }}
                  >
                    <SvgIcon name={inProgressAttempt ? "clock" : activeTab === "available" ? "sparkle" : "check-circle"} size={15} />
                    <span>{inProgressAttempt ? "Resume Quiz" : activeTab === "available" ? "Start Quiz" : "Review Results"}</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "3rem" }}>
          <SvgIcon name={activeTab === "available" ? "clipboard" : activeTab === "completed" ? "check-circle" : "alert-circle"} className="empty-state-icon" style={{ opacity: 0.3 }} />
          <div className="empty-state-title">No {activeTab} quizzes</div>
          <div className="empty-state-desc">
            {activeTab === "available" ? "You're all caught up! No new quizzes to take." : 
             activeTab === "completed" ? "You haven't completed any quizzes yet." : 
             "You don't have any quizzes that need review."}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
