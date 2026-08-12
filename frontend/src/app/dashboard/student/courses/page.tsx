"use client";

import { useState, useEffect } from "react";
import api, { Course, StudentCoursePerformance } from "@/lib/api";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursePerf, setCoursePerf] = useState<Record<number, StudentCoursePerformance>>({});
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    api.getMyEnrolledCourses()
      .then(async (coursesData) => {
        setCourses(coursesData);
        try {
          const perfData = await Promise.all(
            coursesData.map(c => api.getStudentCoursePerformance(c.id).then(perf => ({ id: c.id, perf })))
          );
          const perfMap: Record<number, StudentCoursePerformance> = {};
          perfData.forEach(r => { perfMap[r.id] = r.perf; });
          setCoursePerf(perfMap);
        } catch (e) {
          console.error(e);
        }
      })
      .catch(() => addToast("Failed to load your courses", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Courses</h1>
        <p>Your enrolled courses and learning materials</p>
      </div>

      {courses.length > 0 ? (
        <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {courses.map((course) => {
            const perf = coursePerf[course.id];
            const pct = perf?.completion_percentage ?? 0;
            return (
              <div key={course.id} className="card" style={{ display: "flex", flexDirection: "column", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5rem" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)", flexShrink: 0 }}>
                    <SvgIcon name="book" size={18} style={{ color: "#2563EB" }} />
                  </span>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{course.title}</div>
                </div>
                {course.subject && <span className="badge badge-info" style={{ alignSelf: "flex-start", marginBottom: "0.75rem" }}>{course.subject}</span>}
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", flex: 1, marginBottom: "1rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {course.description || "No description"}
                </p>

                {/* Progress Indicator */}
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.375rem" }}>
                    <span>Progress</span>
                    <span style={{ fontWeight: 500 }}>{pct}%</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: "3px", transition: "width 0.8s ease",
                      width: pct + "%",
                      background: pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--accent-primary)" : "var(--warning)",
                    }} />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column" }}>
                    <span>{course.lesson_count} lessons</span>
                    {perf && <span>{perf.completed_quizzes}/{perf.total_quizzes} quizzes</span>}
                  </div>
                  <Link href={`/dashboard/student/courses/${course.id}`} className={pct === 0 ? "btn-primary" : pct >= 100 ? "btn-secondary" : "btn-primary"} style={{ padding: "0.4rem 0.875rem", fontSize: "0.8rem", textDecoration: "none" }}>
                    {pct === 0 ? "Start Course" : pct >= 100 ? "Review Course" : "Continue"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "3rem 1.5rem" }}>
          <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
          <div className="empty-state-title">No courses yet</div>
          <div className="empty-state-desc">Browse available courses and enroll to start learning.</div>
          <Link href="/dashboard/student/browse" className="btn-primary" style={{ marginTop: "1rem", textDecoration: "none" }}>Browse & Enroll Classes</Link>
        </div>
      )}
    </div>
  );
}
