"use client";

import { useState, useEffect } from "react";
import api, { Course, SubscriptionResponse } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import Link from "next/link";

export default function BrowseCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Set<number>>(new Set());
  const [overdueCourses, setOverdueCourses] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<number | null>(null);
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.listCourses(),
      api.getMyEnrolledCourses(),
      api.getMySubscriptions()
    ])
      .then(([allCourses, enrolled, subs]) => {
        setCourses(allCourses);
        setEnrolledCourses(new Set(enrolled.map(c => c.id)));
        setOverdueCourses(new Set(subs.filter(s => s.status === 'overdue').map(s => s.course_id)));
      })
      .catch(() => addToast("Failed to load courses.", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleEnroll = async (courseId: number) => {
    setEnrolling(courseId);
    try {
      await api.enrollInCourse(courseId);
      addToast("Successfully enrolled!", "success");
      setEnrolledCourses(prev => new Set(prev).add(courseId));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to enroll";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
    }
  };

  const handleUnenroll = async (courseId: number) => {
    setEnrolling(courseId);
    try {
      await api.unenrollFromCourse(courseId);
      addToast("Successfully canceled subscription.", "success");
      setEnrolledCourses(prev => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel subscription";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
      setPreviewCourse(null);
    }
  };

  const handleCheckout = async (courseId: number, plan: "monthly" | "one_time") => {
    setEnrolling(courseId);
    try {
      await api.checkoutCourse(courseId, plan);
      addToast("Payment successful! You are now enrolled.", "success");
      setEnrolledCourses(prev => new Set(prev).add(courseId));
      setPreviewCourse(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Payment failed";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Browse Courses</h1>
        <p>Discover and enroll in available courses</p>
      </div>

      {courses.length > 0 ? (
        <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {courses.map((course) => {
            const isEnrolled = enrolledCourses.has(course.id);
            return (
              <div 
                key={course.id} 
                className="card" 
                style={{ display: "flex", flexDirection: "column", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s" }}
                onClick={() => setPreviewCourse(course)}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5rem" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(16, 185, 129, 0.08)", flexShrink: 0 }}>
                    <SvgIcon name="book" size={18} style={{ color: "#10B981" }} />
                  </span>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{course.title}</div>
                </div>
                {course.subject && (
                  <span className="badge badge-info" style={{ alignSelf: "flex-start", marginBottom: "0.5rem" }}>{course.subject}</span>
                )}
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", flex: 1, marginBottom: "0.75rem", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {course.description || "No description available"}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {course.lesson_count} lessons · {course.student_count} students
                  </div>
                  {isEnrolled ? (
                    <button onClick={(e) => { e.stopPropagation(); setPreviewCourse(course); }} className="btn-secondary" style={{ padding: "0.4rem 0.875rem", fontSize: "0.8rem" }}>
                      View Info
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEnroll(course.id); }}
                      className="btn-primary"
                      disabled={enrolling === course.id}
                      style={{ padding: "0.4rem 0.875rem", fontSize: "0.8rem" }}
                    >
                      {enrolling === course.id ? "..." : "Enroll"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "3rem 1.5rem" }}>
          <SvgIcon name="search" className="empty-state-icon" style={{ opacity: 0.3 }} />
          <div className="empty-state-title">No courses available</div>
          <div className="empty-state-desc">Check back later for new courses.</div>
        </div>
      )}

      {/* Course Preview Modal */}
      {previewCourse && (
        <Modal title="Course Information" onClose={() => setPreviewCourse(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{previewCourse.title}</h2>
              {previewCourse.subject && <span className="badge badge-info">{previewCourse.subject}</span>}
            </div>
            
            <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="user" size={16} />
              Taught by <strong>{previewCourse.teacher_name || "Instructor"}</strong>
            </div>

            <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem", color: "var(--text-muted)", paddingBottom: "1rem", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="book" size={16} /> {previewCourse.lesson_count} Lessons</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="users" size={16} /> {previewCourse.student_count} Students</span>
            </div>

            <div style={{ fontSize: "1rem", lineHeight: 1.6, color: "var(--text-primary)", marginBottom: "1.5rem" }}>
              {previewCourse.description || "No description provided for this course."}
            </div>

            {previewCourse.is_paid_course && !enrolledCourses.has(previewCourse.id) && (
              <div className="bg-[var(--background-alt)] p-4 rounded-lg border border-[var(--border)] mb-4">
                <h4 className="font-semibold mb-2">Pricing Plans</h4>
                <div className="flex gap-4">
                  {previewCourse.monthly_price !== null && (
                    <button 
                      onClick={() => handleCheckout(previewCourse.id, "monthly")}
                      disabled={enrolling === previewCourse.id}
                      className="flex-1 bg-[var(--background)] border border-[var(--border)] p-3 rounded-lg hover:border-[var(--accent-primary)] transition-colors text-center"
                    >
                      <div className="font-bold text-lg">LKR {previewCourse.monthly_price} <span className="text-sm font-normal text-[var(--foreground-muted)]">/ mo</span></div>
                      <div className="text-sm text-[var(--foreground-muted)] mt-1">Subscribe</div>
                    </button>
                  )}
                  {previewCourse.full_price !== null && (
                    <button 
                      onClick={() => handleCheckout(previewCourse.id, "one_time")}
                      disabled={enrolling === previewCourse.id}
                      className="flex-1 bg-[var(--background)] border border-[var(--border)] p-3 rounded-lg hover:border-[var(--accent-primary)] transition-colors text-center"
                    >
                      <div className="font-bold text-lg">LKR {previewCourse.full_price}</div>
                      <div className="text-sm text-[var(--foreground-muted)] mt-1">Lifetime Access</div>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
              {enrolledCourses.has(previewCourse.id) ? (
                <>
                  <button 
                    onClick={() => handleUnenroll(previewCourse.id)}
                    className="btn-danger"
                    disabled={enrolling === previewCourse.id}
                  >
                    Cancel Subscription
                  </button>
                  {overdueCourses.has(previewCourse.id) ? (
                    <Link href="/dashboard/student/billing" className="btn-danger" style={{ textDecoration: "none", padding: "0.5rem 1rem", borderRadius: "var(--radius-md)" }}>
                      Resolve Overdue Balance
                    </Link>
                  ) : (
                    <Link href={`/dashboard/student/courses/${previewCourse.id}`} className="btn-primary" style={{ textDecoration: "none" }}>
                      Open Course
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={() => setPreviewCourse(null)}>Cancel</button>
                  {!previewCourse.is_paid_course && (
                    <button 
                      onClick={() => handleEnroll(previewCourse.id)}
                      className="btn-primary"
                      disabled={enrolling === previewCourse.id}
                      style={{ padding: "0.75rem 2rem" }}
                    >
                      {enrolling === previewCourse.id ? "Enrolling..." : "Join Free Course"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
