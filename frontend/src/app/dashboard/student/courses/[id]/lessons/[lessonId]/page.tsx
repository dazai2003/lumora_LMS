"use client";

import { useState, useEffect, use } from "react";
import { useSearchParams } from "next/navigation";
import api, { Lesson, Material, ApiError, UnitWithLessons } from "@/lib/api";
import Link from "next/link";
import MaterialViewer from "@/components/materials/MaterialViewer";
import { SvgIcon, IconName } from "@/components/SvgIcon";

export default function StudentLessonDetailPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = use(params);
  const searchParams = useSearchParams();
  const targetMaterialId = searchParams.get("materialId");
  
  const courseId = parseInt(id);
  const lId = parseInt(lessonId);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [matProgressMap, setMatProgressMap] = useState<Record<number, { is_completed: boolean; last_position: number }>>({});
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  useEffect(() => {
    Promise.all([
      api.getLesson(lId),
      api.listMaterials(lId),
      api.listUnits(courseId).catch(() => []),
      api.getStudentCoursePerformance(courseId).catch(() => null)
    ])
      .then(([l, m, u, perf]) => { 
        setLesson(l); 
        const mats = m || [];
        setMaterials(mats); 
        setUnits(u || []);

        const pMap: Record<number, { is_completed: boolean; last_position: number }> = {};
        (perf?.material_progress || []).forEach((mp) => {
          pMap[mp.material_id] = {
            is_completed: mp.is_completed,
            last_position: mp.last_position || 0
          };
        });
        setMatProgressMap(pMap);

        // If targetMaterialId is passed via URL query (e.g. from Ask AI Review Material)
        if (targetMaterialId && mats.length > 0) {
          const matched = mats.find((mat: Material) => mat.id === parseInt(targetMaterialId));
          if (matched) {
            setSelectedMaterial(matched);
          } else {
            setSelectedMaterial(mats[0]);
          }
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403 && e.message.includes("Payment Required")) {
          setPaymentRequired(true);
        } else {
          console.error(e);
        }
      })
      .finally(() => setLoading(false));
  }, [lId, courseId, targetMaterialId]);

  const handleProgressUpdate = (updatedProg: any) => {
    setMatProgressMap((prev) => ({
      ...prev,
      [updatedProg.material_id]: {
        is_completed: updatedProg.is_completed,
        last_position: updatedProg.last_position || 0
      }
    }));
  };

  const materialIconName = (type: string): IconName => {
    switch (type) { case "note": return "edit"; case "pdf": return "file-text"; case "image": return "image"; case "video": return "video"; default: return "layers"; }
  };

  // Compute Current Lesson Status
  const totalMats = materials.length;
  const completedMats = materials.filter(m => matProgressMap[m.id]?.is_completed).length;
  const anyStarted = materials.some(m => (matProgressMap[m.id]?.last_position || 0) > 0);
  const currentLessonStatus: "reviewed" | "engaging" | "not_reviewed" = totalMats === 0
    ? "not_reviewed"
    : completedMats === totalMats
      ? "reviewed"
      : (completedMats > 0 || anyStarted)
        ? "engaging"
        : "not_reviewed";

  // Flatten all lessons with unit metadata to calculate Previous and Next navigation
  const allCourseLessons: Array<{ lesson: Lesson; unit: UnitWithLessons; unitIndex: number }> = [];
  units.forEach((u, uIdx) => {
    (u.lessons || []).forEach((ls) => {
      allCourseLessons.push({ lesson: ls, unit: u, unitIndex: uIdx });
    });
  });

  const currentIdx = allCourseLessons.findIndex(item => item.lesson.id === lId);
  const prevItem = currentIdx > 0 ? allCourseLessons[currentIdx - 1] : null;
  const nextItem = currentIdx >= 0 && currentIdx < allCourseLessons.length - 1 ? allCourseLessons[currentIdx + 1] : null;
  const currentUnit = currentIdx >= 0 ? allCourseLessons[currentIdx].unit : null;
  const isMovingToNextUnit = nextItem && currentUnit && nextItem.unit.id !== currentUnit.id;

  if (loading || (!lesson && !paymentRequired)) {
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
        <Link href="/dashboard/student/browse" className="btn-primary" style={{ textDecoration: "none", padding: "0.75rem 2rem", display: "inline-flex", fontSize: "1.05rem" }}>
          Browse & Enroll Classes
        </Link>
      </div>
    );
  }

  if (!lesson) return null;

  return (
    <div style={{ width: "100%", maxWidth: "1600px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Breadcrumbs */}
      <div className="breadcrumb" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Link href="/dashboard/student/courses" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>My Courses</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)" }}>/</span>
        <Link href={`/dashboard/student/courses/${courseId}`} style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Course Outline</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.9rem" }}>{lesson.title}</span>
      </div>

      {/* Lesson Hero Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingBottom: "1.25rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid var(--border-subtle)",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Lesson {lesson.order}
            </span>
            {currentLessonStatus === "reviewed" && (
              <span className="badge badge-success" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 700 }}>
                <SvgIcon name="check-circle" size={12} /> Reviewed ({completedMats}/{totalMats})
              </span>
            )}
            {currentLessonStatus === "engaging" && (
              <span className="badge badge-info" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 700, background: "rgba(37, 99, 235, 0.12)", color: "#2563EB" }}>
                <SvgIcon name="book-open" size={12} /> Engaging ({completedMats}/{totalMats})
              </span>
            )}
            {currentLessonStatus === "not_reviewed" && (
              <span className="badge badge-secondary" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 600 }}>
                <SvgIcon name="clock" size={12} /> Not Reviewed
              </span>
            )}
          </div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.5rem", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{lesson.title}</h1>
          {lesson.description && <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.5, maxWidth: "900px", margin: 0 }}>{lesson.description}</p>}
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href={`/dashboard/student/courses/${courseId}`} className="btn-secondary" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
            <SvgIcon name="arrow-left" size={15} /> Course Outline
          </Link>
          <Link href={`/dashboard/student/ask?courseId=${courseId}&lessonId=${lId}`} className="btn-primary" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
            <SvgIcon name="sparkle" size={15} /> Ask AI
          </Link>
        </div>
      </div>

      {/* Quick Material Switcher Bar when viewer is active */}
      {selectedMaterial && materials.length > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          overflowX: "auto",
          padding: "0.5rem 0.75rem",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md, 8px)",
          border: "1px solid var(--border-subtle)",
          marginBottom: "1.25rem"
        }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", paddingRight: "0.5rem", flexShrink: 0 }}>
            Lesson Materials:
          </span>
          {materials.map((m) => {
            const isCurrent = m.id === selectedMaterial.id;
            const isDone = matProgressMap[m.id]?.is_completed;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMaterial(m)}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: "var(--radius-sm, 6px)",
                  border: isCurrent ? "1px solid var(--accent-primary)" : "1px solid transparent",
                  background: isCurrent ? "rgba(37, 99, 235, 0.12)" : "transparent",
                  color: isCurrent ? "var(--accent-primary)" : "var(--text-secondary)",
                  fontWeight: isCurrent ? 700 : 500,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease"
                }}
              >
                <SvgIcon name={isDone ? "check-circle" : materialIconName(m.material_type)} size={14} style={{ color: isDone ? "#10B981" : undefined }} />
                {m.title}
                {isDone && <span style={{ fontSize: "0.7rem", color: "#10B981", fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Full-Screen / Full-Width Material Viewer */}
      {selectedMaterial && (
        <div style={{ width: "100%", marginBottom: "2.5rem" }}>
          <MaterialViewer
            material={selectedMaterial}
            onClose={() => setSelectedMaterial(null)}
            onProgressUpdate={handleProgressUpdate}
          />
        </div>
      )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "2rem", width: "100%", alignItems: "flex-start" }}>
          
          {/* Main Learning Materials Area */}
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-primary)" }}>Learning Materials</h2>
            
            {materials.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {materials.map((mat) => {
                  const isSelected = selectedMaterial?.id === mat.id;
                  const prog = matProgressMap[mat.id];
                  const isDone = prog?.is_completed;
                  const pos = prog?.last_position || 0;
                  return (
                    <div 
                      key={mat.id} 
                      className="card"
                      style={{ 
                        cursor: "pointer", 
                        padding: "1.25rem",
                        display: "flex", alignItems: "flex-start", gap: "1.25rem",
                        border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                        background: isSelected ? "rgba(37, 99, 235, 0.03)" : "var(--bg-primary)",
                        transition: "all 0.2s ease"
                      }}
                      onClick={() => setSelectedMaterial(mat)}
                    >
                      <div style={{ 
                        width: "48px", height: "48px", borderRadius: "12px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isDone ? "rgba(16, 185, 129, 0.1)" : "rgba(37, 99, 235, 0.08)",
                        color: isDone ? "#10B981" : "#2563EB"
                      }}>
                        <SvgIcon name={isDone ? "check-circle" : materialIconName(mat.material_type)} size={24} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text-primary)" }}>{mat.title}</span>
                          {isDone ? (
                            <span className="badge badge-success" style={{ fontSize: "0.68rem", fontWeight: 700 }}>
                              ✓ Completed
                            </span>
                          ) : pos > 0 ? (
                            <span className="badge badge-info" style={{ fontSize: "0.68rem", fontWeight: 700, background: "rgba(37, 99, 235, 0.12)", color: "#2563EB" }}>
                              In Progress ({mat.material_type === "video" ? `${Math.floor(pos / 60)}:${String(Math.floor(pos % 60)).padStart(2, "0")}` : `Page ${Math.round(pos)}`})
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ fontSize: "0.68rem" }}>
                              Not Started
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "capitalize", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {mat.material_type}
                          <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--border-strong)" }} />
                          Click to {mat.material_type === "video" ? "watch" : "read"}
                        </div>
                      </div>
                      <div style={{ color: isSelected ? "var(--accent-primary)" : "var(--border-strong)" }}>
                        <SvgIcon name="chevron-right" size={20} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card empty-state" style={{ padding: "3rem" }}>
                <SvgIcon name="layers" className="empty-state-icon" style={{ opacity: 0.3 }} />
                <div className="empty-state-title">No learning materials</div>
                <div className="empty-state-desc">There are no materials to review in this lesson.</div>
              </div>
            )}
          </div>

          {/* Sidebar / Assessment Link */}
          <div>
            <div className="card" style={{ padding: "1.5rem", background: "var(--bg-secondary)", border: "none" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="search" size={20} /> Lesson Navigator
              </h3>
              
              <Link href={`/dashboard/student/courses/${courseId}`} className="btn-secondary" style={{ width: "100%", justifyContent: "center", textDecoration: "none", marginBottom: "1.5rem" }}>
                <SvgIcon name="arrow-left" size={16} /> Back to Course Outline
              </Link>

              <div style={{ background: "var(--bg-primary)", padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontWeight: 600, fontSize: "0.875rem" }}>
                  <SvgIcon name="award" size={16} style={{ color: "#6366F1" }} />
                  <span>A/L Exam Studio</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Test your mastery on Paper I MCQs, Structured, and Essay questions for this syllabus unit.
                </div>
                <Link href="/dashboard/student/al-exams" className="btn-primary btn-sm" style={{ textDecoration: "none", justifyContent: "center" }}>
                  <span>Open Exam Studio</span>
                  <SvgIcon name="arrow-right" size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Bottom Lesson Navigator Bar ─── */}
        <div style={{
          marginTop: "2.5rem",
          padding: "1.25rem 1.5rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem"
        }}>
          {prevItem ? (
            <Link
              href={`/dashboard/student/courses/${courseId}/lessons/${prevItem.lesson.id}`}
              className="btn btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", textDecoration: "none" }}
            >
              <SvgIcon name="chevron-left" size={16} />
              <span>Previous: <strong>{prevItem.lesson.title}</strong></span>
            </Link>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>First lesson of course</div>
          )}

          {nextItem ? (
            <Link
              href={`/dashboard/student/courses/${courseId}/lessons/${nextItem.lesson.id}`}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", textDecoration: "none" }}
            >
              {isMovingToNextUnit ? (
                <span>End &amp; Move to Next Unit (Unit {nextItem.unit.unit_number || nextItem.unit.order || nextItem.unitIndex + 1}: {nextItem.unit.title})</span>
              ) : (
                <span>Next: <strong>{nextItem.lesson.title}</strong></span>
              )}
              <SvgIcon name="chevron-right" size={16} />
            </Link>
          ) : (
            <Link
              href={`/dashboard/student/courses/${courseId}`}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", textDecoration: "none" }}
            >
              <span>Course Completed • Back to Outline</span>
              <SvgIcon name="check-circle" size={16} />
            </Link>
          )}
        </div>
    </div>
  );
}
