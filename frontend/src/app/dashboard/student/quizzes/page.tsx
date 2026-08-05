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
            return (
              <div key={q.id} className="card" style={{ display: "flex", flexDirection: "column", padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)", flexShrink: 0 }}>
                      <SvgIcon name={q.is_ai_generated ? "sparkle" : "clipboard"} size={18} style={{ color: "#2563EB" }} />
                    </span>
                    <div>
                      <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.1rem" }}>
                        {q.title}
                      </h3>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {q.course_title}
                      </div>
                    </div>
                  </div>
                  {bestAttempt && bestAttempt.completed_at && (
                    <span className={`badge ${(bestAttempt.percentage ?? 0) >= 70 ? "badge-success" : (bestAttempt.percentage ?? 0) >= 50 ? "badge-warning" : "badge-error"}`}>
                      {(bestAttempt.percentage ?? 0).toFixed(0)}%
                    </span>
                  )}
                </div>
                
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.25rem", flex: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {q.description || "Test your knowledge on this topic."}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
                    <span><SvgIcon name="file-text" size={14} /> {q.question_count} Questions</span>
                    {q.time_limit_minutes && <span>&middot; <SvgIcon name="clock" size={14} /> {q.time_limit_minutes}m limit</span>}
                    {q.available_until && (
                      <span className="badge badge-warning" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>
                        <SvgIcon name="calendar" size={12} style={{ marginRight: "3px" }} />
                        Closes: {new Date(q.available_until).toLocaleDateString()} {new Date(q.available_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <Link href={`/dashboard/student/quizzes/${q.id}`} className={activeTab === "available" ? "btn-primary" : "btn-secondary"} style={{ padding: "0.4rem 0.875rem", fontSize: "0.8rem", textDecoration: "none" }}>
                    {activeTab === "available" ? "Start Quiz" : "Review Results"}
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
