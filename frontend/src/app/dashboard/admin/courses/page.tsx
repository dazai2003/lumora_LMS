"use client";

import { useState, useEffect, useMemo } from "react";
import api, { Course, AdminOverview, User } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

type SortKey = "title" | "teacher_name" | "student_count" | "is_active" | "health";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "needs_setup">("all");
  
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [teachers, setTeachers] = useState<User[]>([]);

  // CRUD States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  
  // Form States
  const [formData, setFormData] = useState({ title: "", description: "", subject: "", teacher_id: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.listCourses(),
      api.getAdminOverview(),
      api.listUsers({ role: "teacher", is_active: true })
    ])
      .then(([c, o, t]) => {
        setCourses(c);
        setOverview(o);
        setTeachers(t);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, healthFilter, sortKey, sortDir]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const newCourse = await api.createCourse({
        title: formData.title,
        description: formData.description,
        subject: formData.subject,
        teacher_id: formData.teacher_id ? parseInt(formData.teacher_id) : undefined
      });
      setCourses(prev => [newCourse, ...prev]);
      addToast("Course added successfully.", "success");
      setIsAddModalOpen(false);
      setFormData({ title: "", description: "", subject: "", teacher_id: "" });
    } catch (err: any) {
      addToast(err.message || "Failed to add course.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    try {
      setIsSubmitting(true);
      const updated = await api.updateCourse(editingCourse.id, {
        title: formData.title,
        description: formData.description,
        subject: formData.subject,
      });
      setCourses(prev => prev.map(c => c.id === updated.id ? updated : c));
      addToast("Course updated successfully.", "success");
      setIsEditModalOpen(false);
    } catch (err: any) {
      addToast(err.message || "Failed to update course.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.adminDeleteCourse(pendingDelete.id);
      setCourses(prev => prev.filter(c => c.id !== pendingDelete.id));
      addToast("Course deleted successfully.", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to delete course.", "error");
    } finally {
      setPendingDelete(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const enrichedCourses = useMemo(() => {
    return courses.map(c => {
      const breakdown = overview?.course_breakdown?.find(b => b.id === c.id);
      const quizzes = breakdown?.quizzes ?? 0;
      const isHealthy = c.lesson_count > 0;
      return {
        ...c,
        quizzes,
        health: isHealthy ? "Healthy" : "Needs setup",
        healthClass: isHealthy ? "badge-success" : "badge-warning"
      };
    });
  }, [courses, overview]);

  const filteredCourses = useMemo(() => {
    const filtered = enrichedCourses.filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || 
                            (c.teacher_name || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" ? true : statusFilter === "active" ? c.is_active : !c.is_active;
      const matchesHealth = healthFilter === "all" ? true : healthFilter === "healthy" ? c.health === "Healthy" : c.health === "Needs setup";
      
      return matchesSearch && matchesStatus && matchesHealth;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "teacher_name") cmp = (a.teacher_name || "").localeCompare(b.teacher_name || "");
      else if (sortKey === "student_count") cmp = (a.student_count || 0) - (b.student_count || 0);
      else if (sortKey === "is_active") cmp = Number(a.is_active) - Number(b.is_active);
      else if (sortKey === "health") cmp = a.health.localeCompare(b.health);
      
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [enrichedCourses, search, statusFilter, healthFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const pagedCourses = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredCourses.slice(start, start + PAGE_SIZE);
  }, [filteredCourses, page]);

  const filtersActive = searchInput !== "" || statusFilter !== "all" || healthFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setStatusFilter("all");
    setHealthFilter("all");
  };

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <th
      onClick={() => toggleSort(sortKeyName)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        {label}
        <SvgIcon
          name={sortKey === sortKeyName ? (sortDir === "asc" ? "chevron-up" : "chevron-down") : "chevrons-up-down"}
          size={12}
          style={{ opacity: sortKey === sortKeyName ? 1 : 0.35 }}
        />
      </span>
    </th>
  );

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>All Courses</h1>
          <p>Overview and health of all courses on the platform</p>
        </div>
        <button 
          className="btn-primary" 
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          onClick={() => {
            setFormData({ title: "", description: "", subject: "", teacher_id: "" });
            setIsAddModalOpen(true);
          }}
        >
          <SvgIcon name="plus" size={18} />
          Add Course
        </button>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
          <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <SvgIcon name="search" size={16} />
          </div>
          <input 
            className="input" 
            style={{ paddingLeft: "2.5rem", paddingRight: searchInput ? "2.25rem" : undefined, width: "100%" }} 
            placeholder="Search courses or teachers..." 
            value={searchInput} 
            onChange={(e) => setSearchInput(e.target.value)} 
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                display: "flex", alignItems: "center", padding: "2px",
              }}
            >
              <SvgIcon name="x" size={14} />
            </button>
          )}
        </div>
        <select 
          className="input" 
          style={{ width: "auto" }} 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select 
          className="input" 
          style={{ width: "auto" }} 
          value={healthFilter} 
          onChange={(e) => setHealthFilter(e.target.value as any)}
        >
          <option value="all">All Health</option>
          <option value="healthy">Healthy</option>
          <option value="needs_setup">Needs Setup</option>
        </select>
      </div>

      {!loading && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing <strong style={{ color: "var(--text-secondary)" }}>{filteredCourses.length}</strong> of {courses.length} courses
          </span>
          {filtersActive && (
            <button
              onClick={clearFilters}
              style={{ background: "none", border: "none", color: "var(--accent-primary)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 500 }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr><th>Course</th><th>Teacher</th><th>Students</th><th>Lessons</th><th>Quizzes</th><th>Status</th><th>Health</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="skeleton-pulse">
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "60%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "40%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "30%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "30%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "30%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "50%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "50%" }}></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filteredCourses.length > 0 ? (
        <>
          <div className="card animate-fade-in" style={{ overflow: "auto", padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Course" sortKeyName="title" />
                  <SortHeader label="Teacher" sortKeyName="teacher_name" />
                  <SortHeader label="Students" sortKeyName="student_count" />
                  <th>Lessons</th>
                  <th>Quizzes</th>
                  <SortHeader label="Status" sortKeyName="is_active" />
                  <SortHeader label="Health" sortKeyName="health" />
                  <th style={{ width: "100px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedCourses.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.title}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{c.teacher_name || "-"}</td>
                    <td>{c.student_count}</td>
                    <td>{c.lesson_count}</td>
                    <td>{c.quizzes}</td>
                    <td>
                      <span className={`badge ${c.is_active ? "badge-success" : "badge-error"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.healthClass}`}>
                        {c.health}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button
                          onClick={() => {
                            setEditingCourse(c);
                            setFormData({ title: c.title, description: c.description || "", subject: c.subject || "", teacher_id: "" });
                            setIsEditModalOpen(true);
                          }}
                          className="btn-secondary btn-sm"
                          style={{ padding: "0.25rem 0.5rem" }}
                          title="Edit"
                        >
                          <SvgIcon name="edit" size={16} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(c)}
                          className="btn-secondary btn-sm text-red-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                          style={{ padding: "0.25rem 0.5rem", color: "var(--text-muted)" }}
                          title="Delete"
                        >
                          <SvgIcon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Page {page} of {totalPages}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div className="empty-state">
            <div className="empty-state-icon" style={{ opacity: 0.4 }}>
              <SvgIcon name="book" size={48} />
            </div>
            <div className="empty-state-title" style={{ marginTop: "1rem", fontSize: "1.1rem", fontWeight: 600 }}>No courses found</div>
            <div className="empty-state-desc" style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
              {filtersActive 
                ? "Try adjusting your filters or search term." 
                : "No courses have been created yet."}
            </div>
            {filtersActive && (
              <button onClick={clearFilters} className="btn-secondary" style={{ marginTop: "1rem", padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open={pendingDelete !== null}
          title="Delete Course?"
          message={`Are you sure you want to permanently delete '${pendingDelete.title}'? All enrollments, lessons, and quizzes will be deleted. This action cannot be undone.`}
          confirmLabel="Yes, Delete"
          danger={true}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => !isSubmitting && setIsAddModalOpen(false)} title="Add Course">
        <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Course Title</label>
            <input type="text" className="input w-full" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Subject</label>
            <input type="text" className="input w-full" value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Description</label>
            <textarea className="input w-full" rows={3} value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Assign Teacher (Optional)</label>
            <select className="input w-full" value={formData.teacher_id} onChange={e => setFormData(f => ({ ...f, teacher_id: e.target.value }))}>
              <option value="">No Teacher (Unassigned)</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Course"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => !isSubmitting && setIsEditModalOpen(false)} title="Edit Course">
        <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Course Title</label>
            <input type="text" className="input w-full" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Subject</label>
            <input type="text" className="input w-full" value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Description</label>
            <textarea className="input w-full" rows={3} value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
