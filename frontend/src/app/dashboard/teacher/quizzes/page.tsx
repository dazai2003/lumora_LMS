"use client";

import { useState, useEffect } from "react";
import api, { Quiz, Course, Lesson, Material } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useRouter, useSearchParams } from "next/navigation";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function TeacherQuizzesPage() {
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [quizzes, setQuizzes] = useState<(Quiz & { course_title?: string })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCourse, setFilterCourse] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filterLessonId = searchParams.get("lessonId");
  const urlCourseId = searchParams.get("courseId");

  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Quiz State
  const [editTarget, setEditTarget] = useState<Quiz | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTimeLimit, setEditTimeLimit] = useState<number>(30);
  const [savingEdit, setSavingEdit] = useState(false);

  const handleOpenEdit = (quiz: Quiz) => {
    setEditTarget(quiz);
    setEditTitle(quiz.title);
    setEditDesc(quiz.description || "");
    setEditTimeLimit(quiz.time_limit_minutes || 30);
  };

  const handleSaveQuizEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      await api.updateQuiz(editTarget.id, {
        title: editTitle,
        description: editDesc,
        time_limit_minutes: editTimeLimit,
      });
      addToast(`Quiz "${editTitle}" updated!`, "success");
      setEditTarget(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to update quiz.", "error");
    } finally {
      setSavingEdit(false);
    }
  };


  useEffect(() => {
    loadData();
    
    // Handle deep links
    const action = searchParams.get("action");
    if (urlCourseId) {
      setFilterCourse(parseInt(urlCourseId));
    }

  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const coursesData = await api.listCourses();
      setCourses(coursesData);
      const allQuizzes: (Quiz & { course_title?: string })[] = [];
      for (const course of coursesData) {
        const lessons = await api.listLessons(course.id);
        for (const lesson of lessons) {
          const lessonQuizzes = await api.listQuizzes(lesson.id);
          lessonQuizzes.forEach(q => allQuizzes.push({ ...q, course_title: course.title }));
        }
      }
      allQuizzes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQuizzes(allQuizzes);
    } catch (err) {
      console.error(err);
      addToast("Failed to load quizzes", "error");
    } finally {
      setLoading(false);
    }
  };


  const handleToggleStatus = async (quiz: Quiz) => {
    let nextStatus = "published";
    if (quiz.status === "published") nextStatus = "archived";
    else if (quiz.status === "archived") nextStatus = "draft";
    
    try {
      await api.updateQuiz(quiz.id, { status: nextStatus });
      addToast(`Quiz "${quiz.title}" status updated to ${nextStatus}.`, "info");
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to update quiz status.", "error");
    }
  };

  const handleDeleteQuiz = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteQuiz(deleteTarget.id);
      addToast(`Quiz "${deleteTarget.title}" deleted.`, "warning");
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to delete quiz.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = quizzes.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (q.course_title && q.course_title.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    if (filterCourse !== "all") {
      const course = courses.find(c => c.title === q.course_title);
      if (course?.id !== filterCourse) return false;
    }
    
    if (filterLessonId && q.lesson_id !== parseInt(filterLessonId)) {
      return false;
    }

    if (statusFilter !== "all" && q.status !== statusFilter) return false;
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "published": return "badge-success";
      case "draft": return "badge-warning";
      case "archived": return "badge-error";
      default: return "badge-info";
    }
  };

  const materialIcon = (type: string): IconName => {
    switch (type) {
      case "pdf": return "file-text";
      case "video": return "video";
      case "note": return "edit";
      default: return "layers";
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Quiz Management</h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Design assessments, evaluate student progress, and leverage AI generator tools</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href="/dashboard/teacher/quizzes/build" className="btn-secondary" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.85rem", background: "var(--surface)", border: "1px solid var(--border-color)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}>
            <SvgIcon name="layers" size={16} /> Build from Bank
          </Link>
          <Link href="/dashboard/teacher/quizzes/create" className="btn-primary" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
            <SvgIcon name="plus" size={16} /> Create Quiz
          </Link>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: "340px" }}>
            <SvgIcon name="search" size={15} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              className="input"
              placeholder="Search quizzes or courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "2.4rem", fontSize: "0.85rem", width: "100%" }}
            />
          </div>

          <div className="tabs" style={{ marginBottom: 0 }}>
            {(["all", "draft", "published", "archived"] as const).map((f) => {
              const count = quizzes.filter(q => (f === "all" ? true : q.status === f)).length;
              return (
                <button key={f} className={`tab ${statusFilter === f ? "tab-active" : ""}`} onClick={() => setStatusFilter(f)} style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {courses.length > 1 && (
          <select className="input" style={{ width: "auto", fontSize: "0.85rem" }} value={filterCourse} onChange={(e) => setFilterCourse(e.target.value === "all" ? "all" : parseInt(e.target.value))}>
            <option value="all">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      {filterLessonId && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#8B5CF6", fontSize: "0.85rem", fontWeight: 500 }}>
            <SvgIcon name="filter" size={16} />
            Showing quizzes for a specific lesson
          </div>
          <button className="btn-secondary btn-sm" onClick={() => router.push('/dashboard/teacher/quizzes')} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>
            Clear Filter
          </button>
        </div>
      )}

      {/* Quiz Grid */}
      {filtered.length > 0 ? (
        <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {filtered.map((quiz) => (
            <div key={quiz.id} className="card" style={{ 
              padding: "1.25rem", 
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--border-subtle)",
              transition: "box-shadow 0.2s ease, transform 0.15s ease",
            }}>
              {/* Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div style={{ 
                    width: "36px", height: "36px", 
                    borderRadius: "var(--radius-sm)", 
                    background: (quiz as any).is_ai_generated ? "rgba(139, 92, 246, 0.1)" : "rgba(37, 99, 235, 0.1)",
                    color: (quiz as any).is_ai_generated ? "#8B5CF6" : "var(--accent-primary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0
                  }}>
                    <SvgIcon name={(quiz as any).is_ai_generated ? "sparkle" : "file-text"} size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: 0, lineHeight: 1.2 }}>
                      {quiz.title}
                    </h3>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                      {quiz.course_title || "General Course"}
                    </div>
                  </div>
                </div>
                <span className={`badge ${statusBadge(quiz.status)}`} style={{ textTransform: "capitalize", fontSize: "0.7rem", flexShrink: 0 }}>
                  {quiz.status}
                </span>
              </div>

              {/* Stats Strip */}
              <div style={{ 
                display: "flex", gap: "1rem", margin: "0.75rem 0 1rem 0", 
                background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "var(--radius-sm)",
                fontSize: "0.775rem", color: "var(--text-secondary)"
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="file-text" size={14} style={{ color: "var(--accent-primary)" }} />
                  <strong>{quiz.question_count || 0}</strong> questions
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="clock" size={14} style={{ color: "var(--text-muted)" }} />
                  <strong>{quiz.time_limit_minutes ? `${quiz.time_limit_minutes}m` : "Unlimited"}</strong>
                </span>
                {(quiz as any).is_ai_generated && (
                  <span className="badge badge-info" style={{ marginLeft: "auto", fontSize: "0.65rem" }}>
                    AI Generated
                  </span>
                )}
              </div>

              {/* Actions Footer */}
              <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Link href={`/dashboard/teacher/quizzes/${quiz.id}`} className="btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", textDecoration: "none" }}>
                  Manage Quiz
                </Link>

                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => handleOpenEdit(quiz)}
                    style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    title="Edit Quiz Settings"
                  >
                    <SvgIcon name="edit" size={13} /> Edit
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={() => handleToggleStatus(quiz)}
                    style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
                    title="Change Status"
                  >
                    {quiz.status === "published" ? "Archive" : quiz.status === "draft" ? "Publish" : "Reopen"}
                  </button>
                  <button 
                    className="btn-icon btn-icon-danger" 
                    onClick={() => setDeleteTarget(quiz)}
                    title="Delete Quiz" 
                    style={{ padding: "0.35rem" }}
                  >
                    <SvgIcon name="trash" size={14} />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div className="empty-state">
            <SvgIcon name="file-text" className="empty-state-icon" style={{ opacity: 0.35, width: 44, height: 44 }} />
            <div className="empty-state-title" style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: "0.75rem" }}>
              No quizzes found
            </div>
            <div className="empty-state-desc" style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem" }}>
              {searchQuery || statusFilter !== "all" 
                ? "Try clearing your search or status filter." 
                : "Create a manual quiz or use our AI Generator to create assessments from course notes."}
            </div>
            {!searchQuery && statusFilter === "all" && (
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.25rem" }}>
                <Link href="/dashboard/teacher/quizzes/create" className="btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", textDecoration: "none" }}>
                  + Create Manual Quiz
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Quiz Modal */}
      {editTarget && (
        <Modal onClose={() => setEditTarget(null)} title={`Edit Quiz: ${editTarget.title}`}>
          <form onSubmit={handleSaveQuizEdit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Quiz Title *</label>
              <input
                type="text"
                className="input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                style={{ width: "100%", fontSize: "0.88rem" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Description</label>
              <textarea
                className="input"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{ width: "100%", fontSize: "0.88rem", resize: "vertical" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>Time Limit (Minutes)</label>
              <input
                type="number"
                className="input"
                value={editTimeLimit}
                onChange={(e) => setEditTimeLimit(parseInt(e.target.value, 10) || 0)}
                style={{ width: "100%", fontSize: "0.88rem" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save Changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Quiz"
          message={`Are you sure you want to delete "${deleteTarget.title}"? All student attempts and results for this quiz will be permanently removed.`}
          onConfirm={handleDeleteQuiz}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
