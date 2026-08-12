"use client";

import { useState, useEffect, use } from "react";
import api, { Course, Lesson, UnitWithLessons, StudentCoursePerformance, ApiError } from "@/lib/api";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function StudentCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = parseInt(id);
  const [course, setCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [standaloneLessons, setStandaloneLessons] = useState<Lesson[]>([]);
  const [perf, setPerf] = useState<StudentCoursePerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [openUnits, setOpenUnits] = useState<Set<number>>(new Set());

  const { addToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.getCourse(courseId),
      api.listUnits(courseId).catch(() => []),
      api.listLessons(courseId).catch(() => []),
      api.getStudentCoursePerformance(courseId).catch(() => null)
    ])
      .then(([c, uList, lList, p]) => {
        setCourse(c);
        setUnits(uList || []);
        setStandaloneLessons((lList || []).filter(l => l.is_published && !l.unit_id));
        setPerf(p);
        
        // Open all units by default
        if (uList && uList.length > 0) {
          setOpenUnits(new Set(uList.map(u => u.id)));
        }
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

  const toggleUnitAccordion = (unitId: number) => {
    setOpenUnits(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  if (loading || (!course && !paymentRequired)) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  if (paymentRequired) {
    return (
      <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "3rem", textAlign: "center" }} className="card">
        <SvgIcon name="alert-triangle" size={48} style={{ color: "var(--error)", margin: "0 auto 1.5rem" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem", color: "var(--text-primary)" }}>Access Required</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          You must be enrolled in this class to access curriculum units and lesson materials.
        </p>
        <Link href="/dashboard/student/browse" className="btn-primary" style={{ textDecoration: "none", padding: "0.75rem 2rem", display: "inline-flex", fontSize: "1.05rem" }}>
          Browse & Enroll Classes
        </Link>
      </div>
    );
  }

  if (!course) return null;

  const pct = perf?.completion_percentage ?? 0;
  const totalLessonsCount = units.reduce((sum, u) => sum + u.lessons.length, 0) + standaloneLessons.length;
  const firstLessonId = units[0]?.lessons[0]?.id || standaloneLessons[0]?.id;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: "1.5rem" }}>
        <Link href="/dashboard/student/courses" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>My Courses</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{course.title}</span>
      </div>

      {/* Course Hero Card */}
      <div className="card" style={{ marginBottom: "2rem", padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "280px" }}>
            {course.subject && <span className="badge badge-info" style={{ marginBottom: "0.75rem" }}>{course.subject}</span>}
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>{course.title}</h1>
            {course.description && <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>{course.description}</p>}
            
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="layers" size={16} /> {units.length} Curriculum Units</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="book" size={16} /> {totalLessonsCount} Lessons</span>
              {perf && <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><SvgIcon name="check-circle" size={16} /> {perf.completed_quizzes}/{perf.total_quizzes} Quizzes Completed</span>}
            </div>
          </div>
          
          <div style={{ width: "240px", background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Course Completion</div>
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
            {firstLessonId && (
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${firstLessonId}`} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}>
                {pct === 0 ? "Start Learning" : "Continue"}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Curriculum Units & Modules */}
      <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "1.25rem", color: "var(--text-primary)" }}>
        Curriculum Units & Lessons
      </h2>

      {units.length === 0 && standaloneLessons.length === 0 ? (
        <div className="card empty-state" style={{ padding: "3rem", background: "var(--bg-card)" }}>
          <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
          <div className="empty-state-title">No units or lessons available yet</div>
          <div className="empty-state-desc">The subject teacher has not published unit modules for this course yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {units.map((unit, uIdx) => {
            const isOpen = openUnits.has(unit.id);
            return (
              <div 
                key={unit.id}
                className="card"
                style={{ 
                  padding: 0, 
                  overflow: "hidden", 
                  background: "var(--bg-card)", 
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)"
                }}
              >
                {/* Unit Accordion Header */}
                <div 
                  onClick={() => toggleUnitAccordion(unit.id)}
                  style={{ 
                    padding: "1.25rem 1.5rem", 
                    background: "var(--bg-secondary)", 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Unit {uIdx + 1}
                    </div>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0.2rem 0 0", color: "var(--text-primary)" }}>
                      {unit.title}
                    </h3>
                    {unit.description && (
                      <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                        {unit.description}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                      {unit.lessons.length} Lessons
                    </span>
                    <SvgIcon name={isOpen ? "chevron-up" : "chevron-down"} size={20} style={{ color: "var(--text-muted)" }} />
                  </div>
                </div>

                {/* Unit Lessons Body */}
                {isOpen && (
                  <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                    {unit.lessons.length === 0 ? (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                        No published lessons in this unit yet.
                      </div>
                    ) : (
                      unit.lessons.map((lesson, lIdx) => (
                        <Link 
                          key={lesson.id} 
                          href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <div 
                            style={{ 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "space-between",
                              padding: "0.85rem 1.15rem", 
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "var(--radius)",
                              transition: "all 0.15s ease"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                              <div style={{ 
                                width: "32px", height: "32px", borderRadius: "50%", 
                                background: "rgba(37, 99, 235, 0.1)", color: "var(--accent-primary)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 700, fontSize: "0.85rem"
                              }}>
                                {lIdx + 1}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                  {lesson.title}
                                </div>
                                {lesson.description && (
                                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                                    {lesson.description}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <SvgIcon name="file-text" size={14} /> {lesson.material_count || 0} Resources
                              </span>
                              <SvgIcon name="chevron-right" size={18} style={{ color: "var(--text-muted)" }} />
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone Published Lessons */}
          {standaloneLessons.length > 0 && (
            <div className="card" style={{ padding: "1.5rem", background: "var(--bg-card)", border: "1px dashed var(--border)" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-muted)" }}>
                General Course Lessons
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {standaloneLessons.map((lesson) => (
                  <Link key={lesson.id} href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`} style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>{lesson.title}</div>
                      <SvgIcon name="chevron-right" size={18} style={{ color: "var(--text-muted)" }} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
