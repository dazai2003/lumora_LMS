"use client";

import { useState, useEffect, use } from "react";
import api, { Course, Lesson, QuizBreakdown, QuizBreakdownItem } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function TeacherCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = parseInt(id);

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<{ student_id: number; student_name: string; student_email: string; enrolled_at: string }[]>([]);
  const [quizBreakdown, setQuizBreakdown] = useState<QuizBreakdown | null>(null);
  
  const [activeTab, setActiveTab] = useState<"lessons" | "quizzes" | "students" | "settings">("lessons");
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  // Search state for students tab
  const [studentSearch, setStudentSearch] = useState("");

  // Lesson create modal
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDesc, setLessonDesc] = useState("");
  const [creatingLesson, setCreatingLesson] = useState(false);

  // Lesson delete
  const [deleteLesson, setDeleteLesson] = useState<Lesson | null>(null);
  const [deletingLesson, setDeletingLesson] = useState(false);

  // Course edit
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [c, l, s, qb] = await Promise.all([
        api.getCourse(courseId),
        api.listLessons(courseId),
        api.getCourseStudents(courseId).catch(() => []),
        api.getCourseQuizBreakdown(courseId).catch(() => null),
      ]);
      setCourse(c);
      setLessons(l);
      setStudents(s as typeof students);
      setQuizBreakdown(qb);
      setEditTitle(c.title);
      setEditDesc(c.description || "");
      setEditSubject(c.subject || "");
    } catch (err) {
      console.error(err);
      addToast("Failed to load course details", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [courseId]);

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLesson(true);
    try {
      await api.createLesson({ title: lessonTitle, description: lessonDesc || undefined, course_id: courseId, order: lessons.length + 1 });
      addToast(`Lesson "${lessonTitle}" created!`, "success");
      setShowCreateLesson(false);
      setLessonTitle(""); setLessonDesc("");
      const updated = await api.listLessons(courseId);
      setLessons(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to create lesson.", "error");
    } finally {
      setCreatingLesson(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!deleteLesson) return;
    setDeletingLesson(true);
    try {
      await api.deleteLesson(deleteLesson.id);
      addToast(`Lesson "${deleteLesson.title}" deleted.`, "warning");
      setDeleteLesson(null);
      const updated = await api.listLessons(courseId);
      setLessons(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to delete lesson.", "error");
    } finally {
      setDeletingLesson(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateCourse(courseId, { title: editTitle, description: editDesc, subject: editSubject });
      setCourse(updated);
      addToast("Course settings updated successfully!", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to update course settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!course) return;
    const newStatus = !course.is_active;
    try {
      const updated = await api.updateCourse(courseId, { is_active: newStatus });
      setCourse(updated);
      addToast(`Course ${newStatus ? "activated" : "deactivated"} successfully.`, newStatus ? "success" : "info");
    } catch (err) {
      console.error(err);
      addToast("Failed to update course status.", "error");
    }
  };

  if (loading || !course) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  // Filter students by search
  const filteredStudents = students.filter(s =>
    s.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.student_email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/teacher/courses">My Courses</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{course.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>{course.title}</h1>
            <span className={`badge ${course.is_active ? "badge-success" : "badge-error"}`}>
              {course.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {course.subject && <span className="badge badge-info">{course.subject}</span>}
            <span>{lessons.length} lessons &middot; {students.length} students enrolled</span>
          </div>
        </div>

        <button 
          className={course.is_active ? "btn-danger" : "btn-primary"} 
          onClick={handleToggleActive}
          style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
        >
          {course.is_active ? "Deactivate Course" : "Activate Course"}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: "1.5rem" }}>
        <button className={`tab ${activeTab === "lessons" ? "tab-active" : ""}`} onClick={() => setActiveTab("lessons")}>
          Lessons ({lessons.length})
        </button>
        <button className={`tab ${activeTab === "quizzes" ? "tab-active" : ""}`} onClick={() => setActiveTab("quizzes")}>
          Quizzes ({quizBreakdown?.quizzes.length || 0})
        </button>
        <button className={`tab ${activeTab === "students" ? "tab-active" : ""}`} onClick={() => setActiveTab("students")}>
          Enrolled Students ({students.length})
        </button>
        <button className={`tab ${activeTab === "settings" ? "tab-active" : ""}`} onClick={() => setActiveTab("settings")}>
          Settings
        </button>
      </div>

      {/* ─── LESSONS TAB ─────────────────────────────────────────────────── */}
      {activeTab === "lessons" && (
        <div className="animate-fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Course Curriculum</h2>
            <button className="btn-primary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }} onClick={() => setShowCreateLesson(true)}>
              + Add Lesson
            </button>
          </div>

          {lessons.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {lessons.sort((a, b) => a.order - b.order).map((lesson) => (
                <div key={lesson.id} className="item-row" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                      {lesson.order}
                    </div>
                    <div>
                      <Link href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`} style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none", fontSize: "0.95rem" }}>
                        {lesson.title}
                      </Link>
                      <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        {lesson.material_count} materials &middot; <span className={lesson.is_published ? "text-success" : "text-warning"}>{lesson.is_published ? "Published" : "Draft"}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Link href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`} className="btn-secondary" style={{ padding: "0.3rem 0.65rem", fontSize: "0.775rem", textDecoration: "none" }}>
                      Edit Lesson
                    </Link>
                    <button className="btn-icon btn-icon-danger" onClick={() => setDeleteLesson(lesson)} title="Delete Lesson" style={{ padding: "0.3rem" }}>
                      <SvgIcon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.35, width: 40, height: 40 }} />
                <div className="empty-state-title" style={{ fontSize: "1rem", fontWeight: 600 }}>No lessons added yet</div>
                <div className="empty-state-desc" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Add your first lesson to start building your course content.</div>
                <button className="btn-primary" style={{ marginTop: "1rem", padding: "0.4rem 1rem", fontSize: "0.8rem" }} onClick={() => setShowCreateLesson(true)}>
                  + Add First Lesson
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── QUIZZES TAB (Professional Quiz Overview) ────────────────────── */}
      {activeTab === "quizzes" && (
        <div className="animate-fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Course Quizzes & Assessments</h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Quizzes are generated inside lessons
            </div>
          </div>

          {quizBreakdown && quizBreakdown.quizzes && quizBreakdown.quizzes.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {quizBreakdown.quizzes.map((quiz: QuizBreakdownItem) => (
                <div key={quiz.quiz_id} className="card" style={{ padding: "1.1rem 1.25rem", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                      {quiz.quiz_title}
                    </div>
                    <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                      {quiz.total_attempts} attempts
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "1.5rem", padding: "0.6rem 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", margin: "0.75rem 0", fontSize: "0.8rem" }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Average Score</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: (quiz.average_score ?? 0) >= 70 ? "var(--success)" : "var(--warning)" }}>
                        {quiz.average_score != null ? `${Math.round(quiz.average_score)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Highest Score</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {quiz.highest_score != null ? `${Math.round(quiz.highest_score)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Lowest Score</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        {quiz.lowest_score != null ? `${Math.round(quiz.lowest_score)}%` : "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Link href="/dashboard/teacher/analytics" className="btn-secondary" style={{ padding: "0.3rem 0.65rem", fontSize: "0.775rem", textDecoration: "none" }}>
                      View Quiz Analytics →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="file-text" className="empty-state-icon" style={{ opacity: 0.35, width: 40, height: 40 }} />
                <div className="empty-state-title" style={{ fontSize: "1rem", fontWeight: 600 }}>No quizzes created yet</div>
                <div className="empty-state-desc" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Open a lesson and click "+ Generate AI Quiz" to create interactive quizzes for this course.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STUDENTS TAB (With Name/Email Search Filter) ───────────────── */}
      {activeTab === "students" && (
        <div className="animate-fade-in">
          
          {/* Search Filter Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: "360px" }}>
              <SvgIcon name="search" size={15} style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="input"
                placeholder="Search student by name or email..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ paddingLeft: "2.4rem", fontSize: "0.825rem", width: "100%" }}
              />
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Showing {filteredStudents.length} of {students.length} students
            </span>
          </div>

          {filteredStudents.length > 0 ? (
            <div className="card" style={{ overflow: "auto", padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Email Address</th>
                    <th>Enrollment Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr key={s.student_id}>
                      <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{s.student_name}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{s.student_email}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.825rem" }}>
                        {new Date(s.enrolled_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="users" className="empty-state-icon" style={{ opacity: 0.35, width: 40, height: 40 }} />
                <div className="empty-state-title" style={{ fontSize: "1rem", fontWeight: 600 }}>
                  {studentSearch ? "No matching students found" : "No students enrolled yet"}
                </div>
                <div className="empty-state-desc" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {studentSearch ? "Try adjusting your search name or email." : "Students will appear here once they enroll."}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB (Enhanced Professional Styling) ────────────────── */}
      {activeTab === "settings" && (
        <div className="animate-fade-in">
          <div className="card" style={{ maxWidth: "650px", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "1.25rem", color: "var(--text-primary)" }}>Course Settings</h3>
            
            <form onSubmit={handleSaveSettings}>
              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.85rem" }}>Course Title *</label>
                <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required style={{ fontSize: "0.875rem" }} />
                <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Descriptive title shown in course listings</div>
              </div>

              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.85rem" }}>Subject / Field</label>
                <input className="input" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="e.g. Physics, Computer Science" style={{ fontSize: "0.875rem" }} />
                <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Category tag for organization and filtering</div>
              </div>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label className="label" style={{ fontWeight: 600, fontSize: "0.85rem" }}>Course Description</label>
                <textarea className="textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} style={{ fontSize: "0.875rem" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="submit" className="btn-primary" disabled={saving} style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}>
                  {saving ? "Saving Changes..." : "Save Course Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Lesson Modal */}
      {showCreateLesson && (
        <Modal title="Add New Lesson" onClose={() => setShowCreateLesson(false)}>
          <form onSubmit={handleCreateLesson}>
            <div className="form-group">
              <label className="label">Lesson Title *</label>
              <input className="input" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="e.g., Introduction to Mechanics" required autoFocus />
              <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Give your lesson a clear, descriptive title</div>
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea className="textarea" value={lessonDesc} onChange={(e) => setLessonDesc(e.target.value)} placeholder="Describe what this lesson covers..." rows={3} />
            </div>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowCreateLesson(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={creatingLesson || !lessonTitle.trim()}>
                {creatingLesson ? "Adding..." : "Add Lesson"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Lesson Confirmation */}
      {deleteLesson && (
        <ConfirmDialog
          title="Delete Lesson"
          message={`Are you sure you want to delete "${deleteLesson.title}"? All materials inside this lesson will be removed.`}
          onConfirm={handleDeleteLesson}
          onCancel={() => setDeleteLesson(null)}
          loading={deletingLesson}
        />
      )}
    </div>
  );
}
