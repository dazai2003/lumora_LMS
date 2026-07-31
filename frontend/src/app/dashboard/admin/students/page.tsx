"use client";

import { useState, useEffect, useMemo } from "react";
import api, { User } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

type SortKey = "full_name" | "is_active" | "created_at";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function ManageStudentsPage() {
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pendingDeactivate, setPendingDeactivate] = useState<User | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({ full_name: "", email: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { addToast } = useToast();

  useEffect(() => {
    api
      .listUsers({ role: "student" })
      .then(setStudents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir]);

  const performToggle = async (userId: number, currentStatus: boolean) => {
    try {
      await api.toggleUserActive(userId);
      setStudents((prev) => prev.map((s) => (s.id === userId ? { ...s, is_active: !s.is_active } : s)));
      addToast(`Student account ${currentStatus ? "deactivated" : "activated"} successfully.`, "success");
    } catch (err) {
      addToast("Failed to update student status.", "error");
    }
  };

  // Activating is low-risk and reversible — no confirmation needed.
  // Deactivating removes platform access, so confirm first.
  const handleToggleClick = (student: User) => {
    if (student.is_active) {
      setPendingDeactivate(student);
    } else {
      performToggle(student.id, student.is_active);
    }
  };

  const confirmDeactivate = () => {
    if (pendingDeactivate) {
      performToggle(pendingDeactivate.id, pendingDeactivate.is_active);
      setPendingDeactivate(null);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const newStudent = await api.adminCreateUser({
        ...formData,
        role: "student"
      });
      setStudents(prev => [newStudent, ...prev]);
      addToast("Student added successfully.", "success");
      setIsAddModalOpen(false);
      setFormData({ full_name: "", email: "", password: "" });
    } catch (err: any) {
      addToast(err.message || "Failed to add student.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      setIsSubmitting(true);
      const updated = await api.adminUpdateUser(editingStudent.id, {
        full_name: formData.full_name
      });
      setStudents(prev => prev.map(s => s.id === updated.id ? updated : s));
      addToast("Student updated successfully.", "success");
      setIsEditModalOpen(false);
    } catch (err: any) {
      addToast(err.message || "Failed to update student.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.adminDeleteUser(pendingDelete.id);
      setStudents(prev => prev.filter(s => s.id !== pendingDelete.id));
      addToast("Student deleted successfully.", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to delete student.", "error");
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

  const filteredStudents = useMemo(() => {
    const filtered = students.filter(s => {
      const matchesSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) || 
                            s.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" ? true : statusFilter === "active" ? s.is_active : !s.is_active;
      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "full_name") cmp = a.full_name.localeCompare(b.full_name);
      else if (sortKey === "is_active") cmp = Number(a.is_active) - Number(b.is_active);
      else if (sortKey === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [students, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pagedStudents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, page]);

  const filtersActive = searchInput !== "" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setStatusFilter("all");
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
          <h1>Students</h1>
          <p>Manage student accounts and platform access.</p>
        </div>
        <button 
          className="btn-primary" 
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          onClick={() => {
            setFormData({ full_name: "", email: "", password: "" });
            setIsAddModalOpen(true);
          }}
        >
          <SvgIcon name="plus" size={18} />
          Add Student
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
            placeholder="Search by name or email..." 
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
      </div>

      {!loading && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing <strong style={{ color: "var(--text-secondary)" }}>{filteredStudents.length}</strong> of {students.length} students
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
              <tr><th>Student</th><th>Account Status</th><th>Registered</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="skeleton-pulse">
                  <td>
                    <div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "60%", marginBottom: "4px" }}></div>
                    <div style={{ height: "12px", background: "var(--border-subtle)", borderRadius: "4px", width: "40%" }}></div>
                  </td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "50%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "40%" }}></div></td>
                  <td><div style={{ height: "24px", background: "var(--border-subtle)", borderRadius: "4px", width: "60px" }}></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filteredStudents.length > 0 ? (
        <>
          <div className="card animate-fade-in" style={{ overflow: "auto", padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Student" sortKeyName="full_name" />
                  <SortHeader label="Account Status" sortKeyName="is_active" />
                  <SortHeader label="Registered" sortKeyName="created_at" />
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{student.full_name}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{student.email}</div>
                    </td>
                    <td>
                      <span className={`badge ${student.is_active ? "badge-success" : "badge-error"}`}>
                        {student.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {new Date(student.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button
                          onClick={() => handleToggleClick(student)}
                          className={student.is_active ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
                        >
                          {student.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingStudent(student);
                            setFormData({ full_name: student.full_name, email: student.email, password: "" });
                            setIsEditModalOpen(true);
                          }}
                          className="btn-secondary btn-sm"
                          style={{ padding: "0.25rem 0.5rem" }}
                          title="Edit"
                        >
                          <SvgIcon name="edit" size={16} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(student)}
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
              <SvgIcon name="graduation" size={48} />
            </div>
            <div className="empty-state-title" style={{ marginTop: "1rem", fontSize: "1.1rem", fontWeight: 600 }}>No students found</div>
            <div className="empty-state-desc" style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
              {filtersActive
                ? "Try adjusting your filters or search term." 
                : "No students are registered yet."}
            </div>
            {filtersActive && (
              <button onClick={clearFilters} className="btn-secondary" style={{ marginTop: "1rem", padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {pendingDeactivate && (
        <ConfirmDialog
          open={pendingDeactivate !== null}
          title="Deactivate Student?"
          message={`Are you sure you want to deactivate ${pendingDeactivate.full_name}? They will immediately lose access to their enrolled courses.`}
          confirmLabel="Yes, Deactivate"
          danger={true}
          onConfirm={confirmDeactivate}
          onCancel={() => setPendingDeactivate(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open={pendingDelete !== null}
          title="Delete Student?"
          message={`Are you sure you want to permanently delete ${pendingDelete.full_name}? This action cannot be undone.`}
          confirmLabel="Yes, Delete"
          danger={true}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => !isSubmitting && setIsAddModalOpen(false)} title="Add Student">
        <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Full Name</label>
            <input type="text" className="input w-full" value={formData.full_name} onChange={e => setFormData(f => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Email</label>
            <input type="email" className="input w-full" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Temporary Password</label>
            <input type="password" minLength={6} className="input w-full" value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Student"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => !isSubmitting && setIsEditModalOpen(false)} title="Edit Student">
        <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Full Name</label>
            <input type="text" className="input w-full" value={formData.full_name} onChange={e => setFormData(f => ({ ...f, full_name: e.target.value }))} required />
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
