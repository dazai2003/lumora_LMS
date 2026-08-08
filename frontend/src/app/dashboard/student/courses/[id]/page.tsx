"use client";

import { useState, useEffect, use } from "react";
import api, { Course, Lesson, StudentCoursePerformance, ApiError } from "@/lib/api";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function StudentCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = parseInt(id);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [perf, setPerf] = useState<StudentCoursePerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.getCourse(courseId),
      api.listLessons(courseId),
      api.getStudentCoursePerformance(courseId).catch(() => null)
    ])
      .then(([c, l, p]) => {
        setCourse(c);
        setLessons(l.filter(ls => ls.is_published).sort((a, b) => a.order - b.order));
        setPerf(p);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403 && e.message.includes("Payment Required")) {
          setPaymentRequired(true);
        } else {
          console.error(e);
          addToast("Failed to load course details.", "error");
        }
      })
      .finally(() => setLoading(false));
  }, [courseId, addToast]);

  if (loading || (!course && !paymentRequired)) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  if (paymentRequired) {
    return (
      <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "3rem", textAlign: "center" }} className="card">
        <SvgIcon name="alert-triangle" size={48} style={{ color: "var(--error)", margin: "0 auto 1.5rem" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem", color: "var(--text-primary)" }}>Payment Required</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          Your subscription for this course is overdue. You must resolve your outstanding balance before accessing course content.
        </p>
        <Link href="/dashboard/student/billing" className="btn-danger" style={{ textDecoration: "none", padding: "0.75rem 2rem", display: "inline-flex", fontSize: "1.05rem" }}>
          Resolve Overdue Balance
        </Link>
      </div>
    );
  }

  // At this point course is guaranteed to be non-null
  if (!course) return null;

  const pct = perf?.completion_percentage ?? 0;
  
  // Basic heuristic: lessons up to completion_percentage might be "completed".
  // Since we don't have exact lesson status, we just highlight the first one or the one they might be on.
  // Actually, we'll just style them cleanly as an ordered sequence.

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      <div className="breadcrumb" style={{ marginBottom: "1.5rem" }}>
        <Link href="/dashboard/student/courses" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>My Courses</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{course.title}</span>
      </div>

      <div className="card" style={{ marginBottom: "2rem", padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem" }}>
          <div style={{ flex: 1 }}>
            {course.subject && <span className="badge badge-info" style={{ marginBottom: "0.75rem" }}>{course.subject}</span>}
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>{course.title}</h1>
            {course.description && <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>{course.description}</p>}
            
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="book" size={16} /> {lessons.length} Lessons</span>
              {perf && <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="check-circle" size={16} /> {perf.completed_quizzes}/{perf.total_quizzes} Quizzes Completed</span>}
            </div>
          </div>
          
          <div style={{ width: "240px", background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Course Progress</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-primary)" }}>{pct}%</span>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Complete</span>
            </div>
            <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-subtle)", overflow: "hidden", marginBottom: "1rem" }}>
              <div style={{
                height: "100%", borderRadius: "3px", transition: "width 0.8s ease",
                width: pct + "%",
                background: pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--accent-primary)" : "var(--warning)",
              }} />
            </div>
            {lessons.length > 0 && (
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${lessons[0].id}`} className="btn-primary" style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}>
                {pct === 0 ? "Start Learning" : "Continue"}
              </Link>
            )}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-primary)" }}>Course Content</h2>

      {lessons.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {lessons.map((lesson, idx) => {
            // Very rough heuristic for UI states without explicit backend support
            const estimatedCompleted = pct > 0 && idx < Math.floor((pct / 100) * lessons.length);
            const isCurrent = pct < 100 && idx === Math.floor((pct / 100) * lessons.length);
            
            return (
              <Link key={lesson.id} href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ 
                  display: "flex", alignItems: "center", gap: "1.25rem", padding: "1.25rem", 
                  borderLeft: isCurrent ? "4px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  background: isCurrent ? "rgba(37, 99, 235, 0.02)" : "var(--bg-primary)",
                  transition: "all 0.2s ease"
                }}>
                  <div style={{ 
                    width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: estimatedCompleted ? "rgba(16, 185, 129, 0.1)" : isCurrent ? "rgba(37, 99, 235, 0.1)" : "var(--bg-secondary)",
                    color: estimatedCompleted ? "#10B981" : isCurrent ? "#2563EB" : "var(--text-muted)"
                  }}>
                    {estimatedCompleted ? <SvgIcon name="check" size={20} /> : <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{lesson.order}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "1.05rem" }}>{lesson.title}</span>
                      {isCurrent && <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}>Up Next</span>}
                    </div>
                    {lesson.description && <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{lesson.description}</div>}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <SvgIcon name="file-text" size={14} /> {lesson.material_count} Resources
                  </div>
                  <div style={{ color: "var(--border-strong)" }}>
                    <SvgIcon name="chevron-right" size={20} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "3rem" }}>
          <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
          <div className="empty-state-title">No lessons available</div>
          <div className="empty-state-desc">The teacher hasn&apos;t published any lessons for this course yet.</div>
        </div>
      )}
    </div>
  );
}
