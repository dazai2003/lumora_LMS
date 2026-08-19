"use client";

import { useState, useEffect } from "react";
import api, { Course } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function TeacherCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const { addToast } = useToast();

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCourses = () => {
    setLoading(true);
    api.listCourses()
      .then(setCourses)
      .catch((err) => {
        console.error(err);
        addToast("Failed to load courses", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCourses(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createCourse({ title, description: description || undefined, subject: subject || undefined });
      addToast(`Course "${title}" created successfully!`, "success");
      setShowCreate(false);
      setTitle(""); setDescription(""); setSubject("");
      loadCourses();
    } catch (err) {
      console.error(err);
      addToast("Failed to create course. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCourse(deleteTarget.id);
      addToast(`Course "${deleteTarget.title}" deleted.`, "warning");
      setDeleteTarget(null);
      loadCourses();
    } catch (err) {
      console.error(err);
      addToast("Failed to delete course.", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  const filteredCourses = courses.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (c.subject && c.subject.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" ? true : statusFilter === "active" ? c.is_active : !c.is_active;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <SvgIcon name="book" size={24} /> MY COURSES
          </h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Manage your curriculum, lessons, and enrolled students</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
          <SvgIcon name="plus" size={16} /> New Course
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "260px", maxWidth: "400px" }}>
          <SvgIcon name="search" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input 
            type="text" 
            className="input" 
            placeholder="Search by title or subject..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: "2.5rem", width: "100%", fontSize: "0.85rem" }}
          />
        </div>
        <select
          className="input"
          style={{ width: "auto", fontSize: "0.85rem" }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* Course List Grid */}
      {filteredCourses.length === 0 ? (
        <div className="card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div className="empty-state">
            <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.35, width: 44, height: 44 }} />
            <div className="empty-state-title" style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: "0.75rem" }}>
              {searchQuery || statusFilter !== "all" ? "No matching courses" : "No courses created yet"}
            </div>
            <div className="empty-state-desc" style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem" }}>
              {searchQuery || statusFilter !== "all" 
                ? "Try clearing your search or status filter." 
                : "Create your first course to start adding lessons and enrolling students."}
            </div>
            {!searchQuery && statusFilter === "all" && (
              <button className="btn-primary" style={{ marginTop: "1.25rem", padding: "0.5rem 1.25rem", fontSize: "0.85rem" }} onClick={() => setShowCreate(true)}>
                + Create First Course
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {filteredCourses.map((course) => (
            <div key={course.id} className="card" style={{ display: "flex", flexDirection: "column", padding: "1.25rem", transition: "box-shadow 0.2s ease, transform 0.15s ease", border: "1px solid var(--border-subtle)" }}>
              
              {/* Card Header: Title & Status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", gap: "0.5rem" }}>
                <div>
                  {course.subject && (
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "3px" }}>
                      {course.subject}
                    </span>
                  )}
                  <Link
                    href={`/dashboard/teacher/courses/${course.id}`}
                    style={{ textDecoration: "none", color: "var(--text-primary)", fontWeight: 600, fontSize: "1.05rem", lineHeight: 1.3 }}
                  >
                    {course.title}
                  </Link>
                </div>
                <span className={`badge ${course.is_active ? "badge-success" : "badge-error"}`} style={{ fontSize: "0.7rem", flexShrink: 0 }}>
                  {course.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Course Description */}
              <p style={{ color: "var(--text-secondary)", fontSize: "0.825rem", flex: 1, marginBottom: "1rem", marginTop: "0.25rem", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {course.description || "No description provided."}
              </p>

              {/* Course Stats Banner */}
              <div style={{ display: "flex", gap: "1rem", padding: "0.6rem 0.75rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", marginBottom: "1rem", fontSize: "0.775rem", color: "var(--text-secondary)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="book" size={14} style={{ color: "var(--accent-primary)" }} />
                  <strong>{course.lesson_count}</strong> lessons
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <SvgIcon name="users" size={14} style={{ color: "var(--success)" }} />
                  <strong>{course.student_count}</strong> students
                </span>
              </div>

              {/* Card Footer Actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                <span style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>
                  {course.created_at ? `Created ${new Date(course.created_at).toLocaleDateString()}` : ""}
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Link href={`/dashboard/teacher/courses/${course.id}`} className="btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", textDecoration: "none" }}>
                    Manage Course
                  </Link>
                  <button className="btn-icon btn-icon-danger" onClick={() => setDeleteTarget(course)} title="Delete Course" style={{ padding: "0.35rem" }}>
                    <SvgIcon name="trash" size={14} />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {showCreate && (
        <Modal title="Create New Course" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="label">Course Title *</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Advanced Level Physics" required autoFocus />
              <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Give your course a clear, descriptive title</div>
            </div>
            <div className="form-group">
              <label className="label">Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Physics, Mathematics" />
              <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>E.g., Physics, Mathematics, Computer Science</div>
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what this course covers..." rows={3} />
            </div>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={creating || !title.trim()}>
                {creating ? "Creating..." : "Create Course"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Course"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This will remove all lessons, materials, and quizzes associated with this course.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
