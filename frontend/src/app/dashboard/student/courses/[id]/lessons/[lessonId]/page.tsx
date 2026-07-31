"use client";

import { useState, useEffect, use } from "react";
import api, { Lesson, Material, Quiz, ApiError } from "@/lib/api";
import Link from "next/link";
import MaterialViewer from "@/components/MaterialViewer";
import { SvgIcon, IconName } from "@/components/SvgIcon";

export default function StudentLessonDetailPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = use(params);
  const courseId = parseInt(id);
  const lId = parseInt(lessonId);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  useEffect(() => {
    Promise.all([api.getLesson(lId), api.listMaterials(lId), api.listQuizzes(lId).catch(() => [])])
      .then(([l, m, q]) => { 
        setLesson(l); 
        setMaterials(m); 
        setQuizzes(q.filter(qz => qz.status === "published")); 
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403 && e.message.includes("Payment Required")) {
          setPaymentRequired(true);
        } else {
          console.error(e);
        }
      })
      .finally(() => setLoading(false));
  }, [lId]);

  const materialIconName = (type: string): IconName => {
    switch (type) { case "note": return "edit"; case "pdf": return "file-text"; case "image": return "image"; case "video": return "video"; default: return "layers"; }
  };

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
        <Link href="/dashboard/student/billing" className="btn-danger" style={{ textDecoration: "none", padding: "0.75rem 2rem", display: "inline-flex", fontSize: "1.05rem" }}>
          Resolve Overdue Balance
        </Link>
      </div>
    );
  }

  if (!lesson) return null;

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      <div className="breadcrumb" style={{ marginBottom: "1.5rem" }}>
        <Link href="/dashboard/student/courses" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>My Courses</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)", margin: "0 0.5rem" }}>/</span>
        <Link href={`/dashboard/student/courses/${courseId}`} style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Course Outline</Link>
        <span className="breadcrumb-sep" style={{ color: "var(--border-subtle)", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{lesson.title}</span>
      </div>

      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", flexDirection: "column" }}>
        
        {/* Lesson Header */}
        <div style={{ width: "100%", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Lesson {lesson.order}
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 1rem", color: "var(--text-primary)" }}>{lesson.title}</h1>
          {lesson.description && <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.6, maxWidth: "800px", margin: 0 }}>{lesson.description}</p>}
        </div>

        {/* Selected Material Viewer */}
        {selectedMaterial && (
          <div style={{ width: "100%", marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name={materialIconName(selectedMaterial.material_type)} size={20} />
                {selectedMaterial.title}
              </h2>
              <button className="btn-secondary btn-sm" onClick={() => setSelectedMaterial(null)}>
                <SvgIcon name="x" size={16} /> Close Viewer
              </button>
            </div>
            <MaterialViewer 
              material={selectedMaterial} 
              onClose={() => setSelectedMaterial(null)} 
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
                        background: "rgba(37, 99, 235, 0.08)",
                        color: "#2563EB"
                      }}>
                        <SvgIcon name={materialIconName(mat.material_type)} size={24} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>{mat.title}</div>
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
                <SvgIcon name="search" size={32} /> Lesson Navigator
              </h3>
              
              <Link href={`/dashboard/student/courses/${courseId}`} className="btn-secondary" style={{ width: "100%", justifyContent: "center", textDecoration: "none", marginBottom: "2rem" }}>
                <SvgIcon name="arrow-left" size={16} /> Back to Course
              </Link>

              {quizzes.length > 0 && (
                <>
                  <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                    Assessments
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {quizzes.map(quiz => (
                      <Link key={quiz.id} href={`/dashboard/student/quizzes/${quiz.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ background: "var(--bg-primary)", padding: "1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "border-color 0.2s" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontWeight: 500, fontSize: "0.9rem" }}>
                            <SvgIcon name={quiz.is_ai_generated ? "sparkle" : "clipboard"} size={16} />
                            {quiz.title}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {quiz.question_count} questions
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--accent-primary)", fontSize: "0.8rem", fontWeight: 500 }}>
                            Assessment for this lesson <SvgIcon name="arrow-right" size={14} />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
