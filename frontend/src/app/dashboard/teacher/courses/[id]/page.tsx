"use client";

import { useState, useEffect, use, useRef } from "react";
import api, { Course, Lesson, UnitWithLessons, Material, QuizBreakdown, QuizBreakdownItem, ALExam } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

/* ─── Unit Colour Accents ─── */
const UNIT_COLORS = [
  { bg: "rgba(37, 99, 235, 0.06)", border: "rgba(37, 99, 235, 0.18)", accent: "#2563EB", pill: "rgba(37, 99, 235, 0.12)" },
  { bg: "rgba(139, 92, 246, 0.06)", border: "rgba(139, 92, 246, 0.18)", accent: "#8B5CF6", pill: "rgba(139, 92, 246, 0.12)" },
  { bg: "rgba(16, 185, 129, 0.06)", border: "rgba(16, 185, 129, 0.18)", accent: "#10B981", pill: "rgba(16, 185, 129, 0.12)" },
  { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.18)", accent: "#F59E0B", pill: "rgba(245, 158, 11, 0.12)" },
  { bg: "rgba(236, 72, 153, 0.06)", border: "rgba(236, 72, 153, 0.18)", accent: "#EC4899", pill: "rgba(236, 72, 153, 0.12)" },
  { bg: "rgba(20, 184, 166, 0.06)", border: "rgba(20, 184, 166, 0.18)", accent: "#14B8A6", pill: "rgba(20, 184, 166, 0.12)" },
];

/* ─── Material Categories ─── */
const MATERIAL_CATEGORIES = [
  { id: "all", label: "All Files", icon: "folder" },
  { id: "past_paper", label: "Past Papers", icon: "file-text" },
  { id: "model_paper", label: "Model Papers", icon: "clipboard" },
  { id: "marking_scheme", label: "Marking Schemes", icon: "check-circle" },
  { id: "resource_book", label: "Resource Books", icon: "book" },
  { id: "syllabus", label: "Syllabus & Notes", icon: "clipboard" },
  { id: "general", label: "General Documents", icon: "paperclip" },
];

export default function TeacherCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const courseId = parseInt(id);

  const [course, setCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [standaloneLessons, setStandaloneLessons] = useState<Lesson[]>([]);
  const [courseMaterials, setCourseMaterials] = useState<Material[]>([]);
  const [students, setStudents] = useState<{ student_id: number; student_name: string; student_email: string; enrolled_at: string }[]>([]);
  const [alExams, setAlExams] = useState<ALExam[]>([]);
  const [quizBreakdown, setQuizBreakdown] = useState<QuizBreakdown | null>(null);
  
  const [activeTab, setActiveTab] = useState<"units" | "materials" | "assessments" | "students" | "settings">("units");
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  // Search & Filter state
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedMaterialCategory, setSelectedMaterialCategory] = useState("all");

  // Collapsible unit state
  const [openUnits, setOpenUnits] = useState<Set<number>>(new Set());

  // Unit create/edit modal
  const [showCreateUnit, setShowCreateUnit] = useState(false);
  const [unitTitle, setUnitTitle] = useState("");
  const [unitDesc, setUnitDesc] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [deleteUnitTarget, setDeleteUnitTarget] = useState<UnitWithLessons | null>(null);
  const [deletingUnit, setDeletingUnit] = useState(false);

  // Unit edit inline
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editUnitTitle, setEditUnitTitle] = useState("");
  const [editUnitDesc, setEditUnitDesc] = useState("");
  const [savingUnit, setSavingUnit] = useState(false);

  // Lesson create modal
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState<number | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDesc, setLessonDesc] = useState("");
  const [creatingLesson, setCreatingLesson] = useState(false);

  // Lesson delete
  const [deleteLessonTarget, setDeleteLessonTarget] = useState<Lesson | null>(null);
  const [deletingLesson, setDeletingLesson] = useState(false);

  // Course Material Upload Modal State
  const [showUploadMaterialModal, setShowUploadMaterialModal] = useState(false);
  const [matTitle, setMatTitle] = useState("");
  const [matCategory, setMatCategory] = useState("past_paper");
  const [matPaperType, setMatPaperType] = useState<"paper_1_mcq" | "paper_2_structured" | "paper_2_essay" | "full_paper">("full_paper");
  const [matYear, setMatYear] = useState("2024");
  const [matDesc, setMatDesc] = useState("");
  const [matFile, setMatFile] = useState<File | null>(null);
  const [uploadingMat, setUploadingMat] = useState(false);
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState<Material | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState(false);

  // Course Settings View / Edit Mode State
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Refs
  const unitTitleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [c, uList, allLessons, cMats, s, qb, exams] = await Promise.all([
        api.getCourse(courseId),
        api.listUnits(courseId).catch(() => []),
        api.listLessons(courseId).catch(() => []),
        api.listCourseMaterials(courseId).catch(() => []),
        api.getCourseStudents(courseId).catch(() => []),
        api.getCourseQuizBreakdown(courseId).catch(() => null),
        api.listALExams(courseId).catch(() => []),
      ]);
      setCourse(c);
      setUnits(uList || []);
      setStandaloneLessons((allLessons || []).filter(l => !l.unit_id));
      setCourseMaterials(cMats || []);
      setStudents(s as typeof students);
      setQuizBreakdown(qb);
      setAlExams(exams || []);
      setEditTitle(c.title);
      setEditDesc(c.description || "");
      setEditSubject(c.subject || "");

      // Open all units by default on first load
      if (openUnits.size === 0 && uList && uList.length > 0) {
        setOpenUnits(new Set(uList.map(u => u.id)));
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load course details", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [courseId]);

  // Focus title input when create unit modal opens
  useEffect(() => {
    if (showCreateUnit && unitTitleRef.current) {
      setTimeout(() => unitTitleRef.current?.focus(), 120);
    }
  }, [showCreateUnit]);

  const toggleUnit = (unitId: number) => {
    setOpenUnits(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId);
      return next;
    });
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitTitle.trim()) return;
    setCreatingUnit(true);
    try {
      await api.createUnit({
        title: unitTitle,
        description: unitDesc || undefined,
        course_id: courseId,
        order: units.length + 1
      });
      addToast(`Unit "${unitTitle}" created successfully!`, "success");
      setShowCreateUnit(false);
      setUnitTitle("");
      setUnitDesc("");
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to create unit.", "error");
    } finally {
      setCreatingUnit(false);
    }
  };

  const handleEditUnit = (unit: UnitWithLessons) => {
    setEditingUnitId(unit.id);
    setEditUnitTitle(unit.title);
    setEditUnitDesc(unit.description || "");
  };

  const handleSaveUnit = async () => {
    if (!editingUnitId || !editUnitTitle.trim()) return;
    setSavingUnit(true);
    try {
      await api.updateUnit(editingUnitId, { title: editUnitTitle, description: editUnitDesc || undefined });
      addToast("Unit updated successfully!", "success");
      setEditingUnitId(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to update unit.", "error");
    } finally {
      setSavingUnit(false);
    }
  };

  const handleMoveUnit = async (unitId: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = units.findIndex(u => u.id === unitId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= units.length) return;

    const newUnits = [...units];
    const [movedUnit] = newUnits.splice(currentIndex, 1);
    newUnits.splice(targetIndex, 0, movedUnit);

    // Optimistically update local state immediately so UI updates instantly
    setUnits(newUnits);

    try {
      const orderedIds = newUnits.map(u => u.id);
      await api.reorderUnits(courseId, orderedIds);
      addToast(`Moved "${movedUnit.title}" to Unit ${targetIndex + 1}`, "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to reorder units. Reverting...", "error");
      loadData();
    }
  };

  const handleDeleteUnit = async () => {
    if (!deleteUnitTarget) return;
    setDeletingUnit(true);
    try {
      await api.deleteUnit(deleteUnitTarget.id);
      addToast(`Unit "${deleteUnitTarget.title}" deleted.`, "warning");
      setDeleteUnitTarget(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to delete unit.", "error");
    } finally {
      setDeletingUnit(false);
    }
  };

  const openAddLesson = (unitId: number | null) => {
    setTargetUnitId(unitId);
    setLessonTitle("");
    setLessonDesc("");
    setShowCreateLesson(true);
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle.trim()) return;
    setCreatingLesson(true);
    try {
      const targetUnit = units.find(u => u.id === targetUnitId);
      const lessonCount = targetUnit ? targetUnit.lessons.length : standaloneLessons.length;
      await api.createLesson({
        title: lessonTitle,
        description: lessonDesc || undefined,
        course_id: courseId,
        unit_id: targetUnitId || undefined,
        order: lessonCount + 1
      });
      addToast(`Lesson "${lessonTitle}" created!`, "success");
      setShowCreateLesson(false);
      setLessonTitle(""); 
      setLessonDesc("");
      setTargetUnitId(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to create lesson.", "error");
    } finally {
      setCreatingLesson(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!deleteLessonTarget) return;
    setDeletingLesson(true);
    try {
      await api.deleteLesson(deleteLessonTarget.id);
      addToast(`Lesson "${deleteLessonTarget.title}" deleted.`, "warning");
      setDeleteLessonTarget(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to delete lesson.", "error");
    } finally {
      setDeletingLesson(false);
    }
  };

  /* ─── Course Materials Upload & Delete ─── */
  const handleUploadCourseMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matTitle.trim() || !matFile) {
      addToast("Please provide a material title and select a file.", "warning");
      return;
    }
    setUploadingMat(true);
    try {
      const formData = new FormData();
      formData.append("course_id", courseId.toString());
      formData.append("title", matTitle.trim());
      formData.append("category", matCategory);
      formData.append("material_type", matFile.name.endsWith(".pdf") ? "pdf" : "note");
      if (matCategory === "past_paper" || matCategory === "model_paper") {
        formData.append("paper_type", matPaperType);
        formData.append("year", matYear.trim());
      }
      if (matDesc.trim()) formData.append("description", matDesc.trim());
      formData.append("file", matFile);

      await api.uploadCourseMaterial(formData);
      addToast(`Material "${matTitle}" uploaded successfully!`, "success");
      setShowUploadMaterialModal(false);
      setMatTitle("");
      setMatDesc("");
      setMatFile(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      addToast(err.message || "Failed to upload material.", "error");
    } finally {
      setUploadingMat(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteMaterialTarget) return;
    setDeletingMaterial(true);
    try {
      await api.deleteMaterial(deleteMaterialTarget.id);
      addToast(`Material "${deleteMaterialTarget.title}" deleted.`, "warning");
      setDeleteMaterialTarget(null);
      loadData();
    } catch (err) {
      console.error(err);
      addToast("Failed to delete material.", "error");
    } finally {
      setDeletingMaterial(false);
    }
  };

  /* ─── Course Settings View / Edit ─── */
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setSavingSettings(true);
    try {
      const updated = await api.updateCourse(courseId, { title: editTitle, description: editDesc, subject: editSubject });
      setCourse(updated);
      setIsEditingSettings(false);
      addToast("Course information updated successfully!", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to update course settings.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCancelSettingsEdit = () => {
    if (course) {
      setEditTitle(course.title);
      setEditDesc(course.description || "");
      setEditSubject(course.subject || "");
    }
    setIsEditingSettings(false);
  };

  const handleToggleActive = async () => {
    if (!course) return;
    const newStatus = !course.is_active;
    try {
      const updated = await api.updateCourse(courseId, { is_active: newStatus });
      setCourse(updated);
      addToast(`Course status updated to ${newStatus ? "Active" : "Draft"}.`, "info");
    } catch (err) {
      console.error(err);
      addToast("Failed to update course status.", "error");
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  if (!course) {
    return (
      <div className="empty-state">
        <SvgIcon name="alert-circle" size={48} />
        <h3>Course not found</h3>
        <Link href="/dashboard/teacher/courses" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Back to Courses
        </Link>
      </div>
    );
  }

  const filteredStudents = students.filter(s =>
    s.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.student_email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredMaterials = courseMaterials.filter(m => {
    if (selectedMaterialCategory === "all") return true;
    return (m.category || "general") === selectedMaterialCategory;
  });

  const totalLessons = units.reduce((sum, u) => sum + u.lessons.length, 0) + standaloneLessons.length;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* ═══════════ HEADER ═══════════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            <Link href="/dashboard/teacher/courses" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Courses</Link>
            <SvgIcon name="chevron-right" size={14} />
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{course.title}</span>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <SvgIcon name="book" size={24} />
            {course.title}
            <span className={`badge ${course.is_active ? "badge-success" : "badge-secondary"}`}>
              {course.is_active ? "Active" : "Draft"}
            </span>
          </h1>
          {course.subject && (
            <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
              Subject: <strong>{course.subject}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ STATS SUMMARY ROW ═══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Curriculum Units", value: units.length, icon: "layers" as const, color: "#2563EB" },
          { label: "Total Lessons", value: totalLessons, icon: "book" as const, color: "#8B5CF6" },
          { label: "Course Materials", value: courseMaterials.length, icon: "folder" as const, color: "#EC4899" },
          { label: "A/L Assessments", value: alExams.length > 0 ? alExams.length : (quizBreakdown?.quizzes.length || 0), icon: "award" as const, color: "#6366F1" },
          { label: "Enrolled Students", value: students.length, icon: "users" as const, color: "#10B981" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "1.15rem 1.25rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            display: "flex", alignItems: "center", gap: "1rem"
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "var(--radius-sm)",
              background: `${s.color}12`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <SvgIcon name={s.icon} size={20} style={{ color: s.color }} />
            </div>
            <div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2, color: "var(--text-primary)" }}>{s.value}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════ TABS ═══════════ */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", marginBottom: "2rem", overflowX: "auto" }}>
        {[
          { key: "units", label: `Units & Lessons (${units.length})`, icon: "layers" as const },
          { key: "materials", label: `Course Materials (${courseMaterials.length})`, icon: "folder" as const },
          { key: "assessments", label: `A/L Assessments (${alExams.length > 0 ? alExams.length : (quizBreakdown?.quizzes.length || 0)})`, icon: "award" as const },
          { key: "students", label: `Students (${students.length})`, icon: "users" as const },
          { key: "settings", label: "Course Settings", icon: "settings" as const },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                padding: "0.75rem 1.15rem",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2.5px solid var(--accent-primary)" : "2.5px solid transparent",
                color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <SvgIcon name={tab.icon} size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  TAB 1: UNITS & LESSONS HIERARCHY           */}
      {/* ════════════════════════════════════════════ */}
      {activeTab === "units" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {units.length} unit{units.length !== 1 ? "s" : ""} with {totalLessons} lesson{totalLessons !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", gap: "0.65rem" }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowCreateUnit(true)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
              >
                <SvgIcon name="plus" size={15} /> Add Unit
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => openAddLesson(units[0]?.id || null)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
              >
                <SvgIcon name="plus" size={15} /> Add Lesson
              </button>
            </div>
          </div>

          {units.length === 0 && standaloneLessons.length === 0 ? (
            <div style={{
              padding: "4rem 2rem",
              background: "var(--bg-card)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
            }}>
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: "rgba(37, 99, 235, 0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 1.5rem"
              }}>
                <SvgIcon name="layers" size={32} style={{ color: "var(--accent-primary)" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                Build Your Curriculum Structure
              </h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "480px", margin: "0 auto 1.5rem", lineHeight: 1.6 }}>
                Organize your course into curriculum units (e.g. "Unit 1: Cell Biology") and add lessons within each unit to create a structured learning path.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateUnit(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <SvgIcon name="plus" size={16} /> Create First Unit
              </button>
            </div>
          ) : (
            <>
              {units.map((unit, index) => {
                const palette = UNIT_COLORS[index % UNIT_COLORS.length];
                const isOpen = openUnits.has(unit.id);
                const isEditing = editingUnitId === unit.id;

                return (
                  <div
                    key={unit.id}
                    style={{
                      background: "var(--bg-card)",
                      border: `1px solid var(--border)`,
                      borderRadius: "var(--radius-lg)",
                      overflow: "hidden",
                      transition: "box-shadow 0.2s ease",
                      boxShadow: isOpen ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    {/* ── Unit Header ── */}
                    <div
                      style={{
                        padding: "1.15rem 1.5rem",
                        background: palette.bg,
                        borderBottom: isOpen ? `1px solid ${palette.border}` : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 0.15s ease",
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        toggleUnit(unit.id);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "var(--radius-sm)",
                          background: palette.pill,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: "0.9rem", color: palette.accent,
                          flexShrink: 0,
                        }}>
                          {index + 1}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                className="input-field"
                                value={editUnitTitle}
                                onChange={e => setEditUnitTitle(e.target.value)}
                                style={{ fontSize: "1rem", fontWeight: 600, padding: "0.35rem 0.65rem", flex: 1 }}
                                autoFocus
                                onKeyDown={e => { if (e.key === "Enter") handleSaveUnit(); if (e.key === "Escape") setEditingUnitId(null); }}
                              />
                              <button className="btn btn-primary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }} onClick={handleSaveUnit} disabled={savingUnit}>
                                {savingUnit ? "..." : "Save"}
                              </button>
                              <button className="btn btn-secondary" style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }} onClick={() => setEditingUnitId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                                  {unit.title}
                                </span>
                              </div>
                              {unit.description && (
                                <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginTop: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {unit.description}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, marginLeft: "1rem" }}>
                        <span style={{
                          fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem",
                          borderRadius: "var(--radius-sm)", background: palette.pill, color: palette.accent,
                        }}>
                          {unit.lessons.length} lesson{unit.lessons.length !== 1 ? "s" : ""}
                        </span>

                        {/* Move Up / Move Down Unit Sequence Controls */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          background: "var(--bg-secondary)",
                          borderRadius: "var(--radius-sm)",
                          padding: "2px",
                          border: "1px solid var(--border)",
                          marginLeft: "0.25rem",
                          marginRight: "0.25rem",
                        }} onClick={e => e.stopPropagation()}>
                          <button
                            className="btn-icon"
                            title={index === 0 ? "First unit" : `Move "${unit.title}" Up (to Unit ${index})`}
                            aria-label={`Move unit ${unit.title} up`}
                            style={{
                              padding: "0.25rem 0.35rem",
                              color: index === 0 ? "var(--text-disabled, rgba(150,150,150,0.35))" : "var(--text-primary)",
                              cursor: index === 0 ? "not-allowed" : "pointer",
                              opacity: index === 0 ? 0.3 : 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "3px",
                            }}
                            disabled={index === 0}
                            onClick={(e) => handleMoveUnit(unit.id, "up", e)}
                          >
                            <SvgIcon name="chevron-up" size={14} />
                          </button>
                          <button
                            className="btn-icon"
                            title={index === units.length - 1 ? "Last unit" : `Move "${unit.title}" Down (to Unit ${index + 2})`}
                            aria-label={`Move unit ${unit.title} down`}
                            style={{
                              padding: "0.25rem 0.35rem",
                              color: index === units.length - 1 ? "var(--text-disabled, rgba(150,150,150,0.35))" : "var(--text-primary)",
                              cursor: index === units.length - 1 ? "not-allowed" : "pointer",
                              opacity: index === units.length - 1 ? 0.3 : 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "3px",
                            }}
                            disabled={index === units.length - 1}
                            onClick={(e) => handleMoveUnit(unit.id, "down", e)}
                          >
                            <SvgIcon name="chevron-down" size={14} />
                          </button>
                        </div>

                        <button
                          className="btn-icon"
                          title="Add Lesson"
                          style={{ padding: "0.3rem", color: "var(--text-muted)" }}
                          onClick={(e) => { e.stopPropagation(); openAddLesson(unit.id); }}
                        >
                          <SvgIcon name="plus" size={16} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Edit Unit"
                          style={{ padding: "0.3rem", color: "var(--text-muted)" }}
                          onClick={(e) => { e.stopPropagation(); handleEditUnit(unit); }}
                        >
                          <SvgIcon name="edit" size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete Unit"
                          style={{ padding: "0.3rem", color: "var(--error)" }}
                          onClick={(e) => { e.stopPropagation(); setDeleteUnitTarget(unit); }}
                        >
                          <SvgIcon name="trash" size={15} />
                        </button>

                        <SvgIcon
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={18}
                          style={{ color: "var(--text-muted)", marginLeft: "0.25rem" }}
                        />
                      </div>
                    </div>

                    {/* ── Unit Body (Lessons) ── */}
                    {isOpen && (
                      <div style={{ padding: "1rem 1.5rem 1.25rem" }}>
                        {unit.lessons.length === 0 ? (
                          <div style={{
                            padding: "2rem 1.5rem",
                            background: "var(--bg-primary)",
                            border: "1.5px dashed var(--border)",
                            borderRadius: "var(--radius)",
                            textAlign: "center",
                          }}>
                            <SvgIcon name="book" size={28} style={{ color: "var(--text-muted)", marginBottom: "0.75rem", opacity: 0.4 }} />
                            <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                              No lessons in this unit yet
                            </div>
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
                              onClick={() => openAddLesson(unit.id)}
                            >
                              <SvgIcon name="plus" size={14} /> Add First Lesson
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {unit.lessons.map((lesson, lIdx) => (
                              <div
                                key={lesson.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "0.75rem 1rem",
                                  background: "var(--bg-primary)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius-sm)",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <Link
                                  href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`}
                                  style={{ textDecoration: "none", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "0.85rem" }}
                                >
                                  <div style={{
                                    width: "28px", height: "28px", borderRadius: "50%",
                                    background: "var(--bg-secondary)",
                                    border: "1px solid var(--border)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 700, fontSize: "0.75rem", color: "var(--text-muted)",
                                    flexShrink: 0,
                                  }}>
                                    {lIdx + 1}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--accent-primary)" }}>
                                      {lesson.title}
                                    </div>
                                    {lesson.description && (
                                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {lesson.description}
                                      </div>
                                    )}
                                  </div>
                                </Link>

                                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0, marginLeft: "0.75rem" }}>
                                  <Link
                                    href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`}
                                    className="btn btn-secondary"
                                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                                  >
                                    <SvgIcon name="book" size={12} /> Manage Materials
                                  </Link>
                                  <span style={{
                                    fontSize: "0.72rem", fontWeight: 500, padding: "0.15rem 0.5rem",
                                    borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)",
                                    border: "1px solid var(--border)", color: "var(--text-muted)",
                                  }}>
                                    {lesson.material_count || 0} materials
                                  </span>
                                  <span style={{
                                    fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.5rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: lesson.is_published ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                                    color: lesson.is_published ? "#10B981" : "#F59E0B",
                                  }}>
                                    {lesson.is_published ? "Published" : "Draft"}
                                  </span>
                                  <button
                                    className="btn-icon"
                                    style={{ padding: "0.25rem", color: "var(--error)" }}
                                    title="Delete Lesson"
                                    onClick={() => setDeleteLessonTarget(lesson)}
                                  >
                                    <SvgIcon name="trash" size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}

                            <button
                              onClick={() => openAddLesson(unit.id)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                                padding: "0.55rem",
                                background: "none",
                                border: "1.5px dashed var(--border)",
                                borderRadius: "var(--radius-sm)",
                                color: "var(--text-muted)",
                                fontSize: "0.82rem",
                                fontWeight: 500,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <SvgIcon name="plus" size={14} /> Add another lesson
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {standaloneLessons.length > 0 && (
                <div style={{
                  padding: "1.25rem 1.5rem",
                  background: "var(--bg-card)",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-lg)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                    <SvgIcon name="folder" size={16} style={{ color: "var(--text-muted)" }} />
                    <h4 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>
                      Unassigned Lessons ({standaloneLessons.length})
                    </h4>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {standaloneLessons.map((lesson) => (
                      <div key={lesson.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "0.65rem 0.85rem",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                      }}>
                        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{lesson.title}</span>
                        <button className="btn-icon" style={{ padding: "0.25rem", color: "var(--error)" }} onClick={() => setDeleteLessonTarget(lesson)}>
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB 2: COURSE MATERIALS HUB                */}
      {/* ════════════════════════════════════════════ */}
      {activeTab === "materials" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Header Action Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Course Materials & Documents
              </h3>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                Upload and manage reference materials, past papers, marking schemes, and government resource books.
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => setShowUploadMaterialModal(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontSize: "0.88rem" }}
            >
              <SvgIcon name="upload" size={16} /> Upload Material
            </button>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            {MATERIAL_CATEGORIES.map(cat => {
              const isSelected = selectedMaterialCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedMaterialCategory(cat.id)}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.82rem",
                    fontWeight: isSelected ? 700 : 500,
                    border: "none",
                    background: isSelected ? "var(--accent-primary)" : "var(--bg-card)",
                    color: isSelected ? "#FFFFFF" : "var(--text-secondary)",
                    cursor: "pointer",
                    boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <SvgIcon name={cat.icon as any} size={14} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Materials List / Grid */}
          {filteredMaterials.length === 0 ? (
            <div style={{
              padding: "4rem 2rem",
              background: "var(--bg-card)",
              border: "2px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
            }}>
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: "rgba(236, 72, 153, 0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 1.5rem"
              }}>
                <SvgIcon name="folder" size={32} style={{ color: "#EC4899" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                No course materials uploaded
              </h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "440px", margin: "0 auto 1.5rem", lineHeight: 1.6 }}>
                Upload PDF past papers, marking schemes, resource books, or Word documents for your students to download and study.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setShowUploadMaterialModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              >
                <SvgIcon name="upload" size={16} /> Upload First Material
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {filteredMaterials.map(mat => {
                const catObj = MATERIAL_CATEGORIES.find(c => c.id === mat.category) || MATERIAL_CATEGORIES[0];
                const fileUrl = mat.file_path ? `http://localhost:8000/${mat.file_path}` : "#";

                return (
                  <div
                    key={mat.id}
                    style={{
                      padding: "1.25rem",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "1rem",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.75rem" }}>
                        <span style={{
                          fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem",
                          borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)", color: "var(--accent-primary)",
                          textTransform: "uppercase", letterSpacing: "0.5px"
                        }}>
                          {catObj.label}
                        </span>

                        <button
                          className="btn-icon"
                          style={{ color: "var(--error)", padding: "0.2rem" }}
                          title="Delete Material"
                          onClick={() => setDeleteMaterialTarget(mat)}
                        >
                          <SvgIcon name="trash" size={15} />
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "var(--radius-sm)",
                          background: "var(--bg-primary)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, color: "var(--accent-primary)"
                        }}>
                          <SvgIcon name={mat.file_path?.endsWith(".pdf") ? "file-text" : "folder"} size={20} />
                        </div>
                        <div>
                          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", lineHeight: 1.3 }}>
                            {mat.title}
                          </h4>
                          {mat.description && (
                            <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", margin: "0.3rem 0 0", lineHeight: 1.4 }}>
                              {mat.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)",
                      fontSize: "0.78rem", color: "var(--text-muted)"
                    }}>
                      <span>{new Date(mat.created_at).toLocaleDateString()}</span>
                      {mat.file_path && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ padding: "0.3rem 0.75rem", fontSize: "0.78rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <SvgIcon name="download" size={13} /> View / Download
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB 3: A/L ASSESSMENTS & EXAMS              */}
      {/* ════════════════════════════════════════════ */}
      {activeTab === "assessments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Header Action Strip */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", background: "var(--bg-card)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                A/L Assessment Papers &amp; Examination Hub
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                Manage Paper I (MCQ), Paper II-A (Structured), and Paper II-B (Essay) papers
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link href={`/dashboard/teacher/al-exams/analytics`} className="btn-secondary btn-sm" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <SvgIcon name="bar-chart" size={14} /> Exam Analytics
              </Link>
              <Link href={`/dashboard/teacher/al-exams/marking`} className="btn-secondary btn-sm" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <SvgIcon name="check-circle" size={14} /> Marking Studio
              </Link>
              <Link href={`/dashboard/teacher/al-exams/create?course_id=${courseId}`} className="btn-primary btn-sm" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <SvgIcon name="plus" size={14} /> Create Assessment
              </Link>
            </div>
          </div>

          {alExams.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem" }}>
              {alExams.map((ex) => {
                const exTypeStr = (ex.exam_type || "").toLowerCase();
                const isMcq = exTypeStr.includes("mcq") || exTypeStr.includes("paper_1");
                const isStructured = exTypeStr.includes("structured") || exTypeStr.includes("part_a");
                const isEssay = exTypeStr.includes("essay") || exTypeStr.includes("part_b");

                const typeBadge = isMcq 
                  ? { label: "Paper I (MCQ)", bg: "rgba(16, 185, 129, 0.1)", text: "#10B981", border: "rgba(16, 185, 129, 0.25)" }
                  : isStructured
                  ? { label: "Paper II-A (Structured)", bg: "rgba(59, 130, 246, 0.1)", text: "#3B82F6", border: "rgba(59, 130, 246, 0.25)" }
                  : isEssay
                  ? { label: "Paper II-B (Essay)", bg: "rgba(139, 92, 246, 0.1)", text: "#8B5CF6", border: "rgba(139, 92, 246, 0.25)" }
                  : { label: "A/L Full Assessment", bg: "rgba(245, 158, 11, 0.1)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.25)" };

                return (
                  <div key={ex.id} className="card animate-fade-in" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                        <span style={{ 
                          fontSize: "0.72rem", 
                          fontWeight: 700, 
                          padding: "3px 8px", 
                          borderRadius: "4px", 
                          background: typeBadge.bg, 
                          color: typeBadge.text,
                          border: `1px solid ${typeBadge.border}`
                        }}>
                          {typeBadge.label}
                        </span>
                        <span className={`badge ${ex.is_published ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.7rem" }}>
                          {ex.is_published ? "Published" : "Draft"}
                        </span>
                      </div>

                      <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--text-primary)" }}>
                        {ex.title}
                      </h4>
                      {ex.description && (
                        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem 0", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {ex.description}
                        </p>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", background: "var(--bg-primary)", padding: "0.6rem 0.75rem", borderRadius: "var(--radius-sm)", fontSize: "0.78rem" }}>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem" }}>Questions</span>
                          <strong>{ex.total_questions || ex.questions?.length || 0} items</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem" }}>Duration</span>
                          <strong>{ex.time_limit_minutes || 120} mins</strong>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div style={{ display: "flex", gap: "0.4rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                      <Link 
                        href={`/dashboard/teacher/al-exams/analytics?exam_id=${ex.id}`}
                        className="btn-secondary btn-sm"
                        style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
                      >
                        Analytics
                      </Link>
                      <Link 
                        href={`/dashboard/teacher/al-exams/marking?exam_id=${ex.id}`}
                        className="btn-secondary btn-sm"
                        style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
                      >
                        Marking
                      </Link>
                      <Link 
                        href={`/dashboard/teacher/al-exams/${ex.id}/authoring`}
                        className="btn-primary btn-sm"
                        style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
                      >
                        Edit Paper
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (!quizBreakdown || quizBreakdown.quizzes.length === 0) ? (
            <div style={{
              padding: "4rem 2rem", background: "var(--bg-card)",
              border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)", textAlign: "center",
            }}>
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 1.5rem"
              }}>
                <SvgIcon name="award" size={32} style={{ color: "#6366F1" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>No A/L Assessments Created</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "460px", margin: "0 auto 1.5rem", lineHeight: 1.6 }}>
                Create official Paper I (MCQ), Paper II-A (Structured), and Paper II-B (Essay) assessment containers for this course.
              </p>
              <Link href={`/dashboard/teacher/al-exams/create?course_id=${courseId}`} className="btn btn-primary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="plus" size={16} /> Create A/L Assessment
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {quizBreakdown.quizzes.map((qz: QuizBreakdownItem) => (
                <div key={qz.quiz_id} className="card" style={{ padding: "1.25rem", background: "var(--bg-card)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>{qz.quiz_title}</h4>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        Submissions: {qz.total_attempts} | Avg Score: {qz.average_score != null ? `${qz.average_score}%` : 'N/A'}
                      </p>
                    </div>
                    <span className="badge badge-info">{qz.total_attempts} Submissions</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB 4: ENROLLED STUDENTS                   */}
      {/* ════════════════════════════════════════════ */}
      {activeTab === "students" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ position: "relative", maxWidth: "400px" }}>
            <input
              type="text"
              className="input-field"
              placeholder="Search student name or email..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: "2.5rem" }}
            />
            <div style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
              <SvgIcon name="search" size={16} />
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div style={{
              padding: "4rem 2rem", background: "var(--bg-card)",
              border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)", textAlign: "center",
            }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(245, 158, 11, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                <SvgIcon name="users" size={32} style={{ color: "#F59E0B" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>No enrolled students found</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", maxWidth: "380px", margin: "0 auto", lineHeight: 1.6 }}>
                Students who enroll in this class will be listed here.
              </p>
            </div>
          ) : (
            <div style={{
              overflow: "hidden",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)"
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.85rem 1.25rem", fontWeight: 600 }}>Student Name</th>
                    <th style={{ padding: "0.85rem 1.25rem", fontWeight: 600 }}>Email</th>
                    <th style={{ padding: "0.85rem 1.25rem", fontWeight: 600 }}>Enrolled Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => (
                    <tr key={s.student_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.85rem 1.25rem", fontWeight: 600, color: "var(--text-primary)" }}>{s.student_name}</td>
                      <td style={{ padding: "0.85rem 1.25rem", color: "var(--text-secondary)" }}>{s.student_email}</td>
                      <td style={{ padding: "0.85rem 1.25rem", color: "var(--text-muted)" }}>
                        {new Date(s.enrolled_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/*  TAB 5: SETTINGS (READ-ONLY & EDIT MODES)   */}
      {/* ════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div style={{ maxWidth: "760px" }}>
          {!isEditingSettings ? (
            /* ── READ-ONLY DISPLAY MODE ── */
            <div style={{
              padding: "2rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.25rem" }}>
                    Course Information
                  </div>
                  <h3 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {course.title}
                  </h3>
                </div>

                <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                  <span className={`badge ${course.is_active ? "badge-success" : "badge-secondary"}`}>
                    {course.is_active ? "Active" : "Draft"}
                  </span>
                  <button
                    className="btn btn-primary"
                    onClick={() => setIsEditingSettings(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontSize: "0.88rem" }}
                  >
                    <SvgIcon name="edit" size={15} /> Edit Course Info
                  </button>
                </div>
              </div>

              {/* Subject Pill */}
              {course.subject && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <span style={{
                    fontSize: "0.8rem", fontWeight: 600, padding: "0.3rem 0.75rem",
                    borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)", color: "var(--accent-primary)",
                  }}>
                    Subject: {course.subject}
                  </span>
                </div>
              )}

              {/* Description Card */}
              <div style={{
                padding: "1.25rem",
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                marginBottom: "1.75rem",
              }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.4rem" }}>
                  Course Description
                </div>
                <div style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                  {course.description || "No course description provided."}
                </div>
              </div>

              {/* Details Summary Grid */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem",
                paddingTop: "1.25rem", borderTop: "1px solid var(--border)"
              }}>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Subject Category</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>{course.subject || "Not Specified"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Enrolled Students</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginTop: "0.15rem" }}>{students.length} Students</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>Course Status</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: course.is_active ? "var(--success)" : "var(--text-muted)", marginTop: "0.15rem" }}>
                    {course.is_active ? "Published & Visible" : "Hidden (Draft)"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── EDIT MODE (RICH TEXT BOXES) ── */
            <div style={{
              padding: "2rem",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    Edit Course Information
                  </h3>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    Update title, subject category, and description for this course.
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handleCancelSettingsEdit}
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                    Course Title <span style={{ color: "var(--error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                    style={{
                      fontSize: "1rem",
                      padding: "0.85rem 1.1rem",
                      borderRadius: "var(--radius-md)",
                      width: "100%",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                    Subject Category
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Advanced Level Biology"
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                    style={{
                      fontSize: "1rem",
                      padding: "0.85rem 1.1rem",
                      borderRadius: "var(--radius-md)",
                      width: "100%",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                    Course Description
                  </label>
                  <textarea
                    className="input-field"
                    rows={5}
                    placeholder="Detailed description of the course syllabus, main subject units, and target exam goals..."
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    style={{
                      fontSize: "0.95rem",
                      padding: "0.85rem 1.1rem",
                      borderRadius: "var(--radius-md)",
                      minHeight: "140px",
                      lineHeight: 1.55,
                      resize: "vertical",
                      width: "100%",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>

                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  paddingTop: "1.25rem", borderTop: "1px solid var(--border)", marginTop: "0.5rem"
                }}>
                  <button
                    type="button"
                    className={`btn ${course.is_active ? "btn-secondary" : "btn-primary"}`}
                    onClick={handleToggleActive}
                    style={{ fontSize: "0.9rem" }}
                  >
                    {course.is_active ? "Hide Course (Draft)" : "Publish Course (Active)"}
                  </button>

                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelSettingsEdit}
                      style={{ fontSize: "0.9rem", padding: "0.65rem 1.25rem" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={savingSettings || !editTitle.trim()}
                      style={{ fontSize: "0.9rem", padding: "0.65rem 1.5rem", fontWeight: 600 }}
                    >
                      {savingSettings ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODAL: CREATE UNIT ═══════════ */}
      {showCreateUnit && (
        <Modal title="Create Curriculum Unit" onClose={() => setShowCreateUnit(false)} maxWidth="640px">
          <form onSubmit={handleCreateUnit}>
            <div style={{
              background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)",
              borderRadius: "var(--radius-md)",
              padding: "1.35rem 1.5rem",
              marginBottom: "1.75rem",
              display: "flex", alignItems: "center", gap: "1.25rem",
              border: "1px solid rgba(37, 99, 235, 0.15)",
            }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "var(--radius-md)",
                background: "rgba(37, 99, 235, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <SvgIcon name="layers" size={28} style={{ color: "#2563EB" }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  Unit Module {units.length + 1}
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Group related lessons together into a structured curriculum unit for your students.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Unit Title <span style={{ color: "var(--error)" }}>*</span>
                </label>
                <input
                  ref={unitTitleRef}
                  type="text"
                  className="input-field"
                  placeholder="e.g. Unit 1: Cell Biology & Physiology"
                  value={unitTitle}
                  onChange={e => setUnitTitle(e.target.value)}
                  required
                  style={{
                    fontSize: "1rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Unit Description <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)" }}>(Optional)</span>
                </label>
                <textarea
                  className="input-field"
                  rows={4}
                  placeholder="Summarize the core syllabus objectives, key theories, and study goals covered in this unit..."
                  value={unitDesc}
                  onChange={e => setUnitDesc(e.target.value)}
                  style={{
                    fontSize: "0.95rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    minHeight: "125px",
                    lineHeight: 1.55,
                    resize: "vertical",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "flex-end", gap: "0.85rem",
              marginTop: "2rem", paddingTop: "1.35rem",
              borderTop: "1px solid var(--border)",
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateUnit(false)}
                style={{ fontSize: "0.95rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius-md)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingUnit || !unitTitle.trim()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  fontSize: "0.95rem", padding: "0.75rem 1.5rem", fontWeight: 600,
                  borderRadius: "var(--radius-md)"
                }}
              >
                {creatingUnit ? (
                  <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} /> Creating Unit...</>
                ) : (
                  <><SvgIcon name="plus" size={16} /> Create Unit</>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════ MODAL: ADD LESSON ═══════════ */}
      {showCreateLesson && (
        <Modal title="Add Lesson Module" onClose={() => setShowCreateLesson(false)} maxWidth="680px">
          <form onSubmit={handleCreateLesson}>
            <div style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)",
              borderRadius: "var(--radius-md)",
              padding: "1.35rem 1.5rem",
              marginBottom: "1.75rem",
              display: "flex", alignItems: "center", gap: "1.25rem",
              border: "1px solid rgba(139, 92, 246, 0.15)",
            }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "var(--radius-md)",
                background: "rgba(139, 92, 246, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <SvgIcon name="book" size={28} style={{ color: "#8B5CF6" }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  New Lesson Module
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Create an interactive lesson module where students can access study notes, video lectures, and coursework.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
              {units.length > 0 && (
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.6rem", color: "var(--text-primary)" }}>
                    Select Parent Unit Module
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                    <button
                      type="button"
                      onClick={() => setTargetUnitId(null)}
                      style={{
                        padding: "0.6rem 1.1rem",
                        borderRadius: "var(--radius-md)",
                        border: `1.5px solid ${!targetUnitId ? "var(--accent-primary)" : "var(--border)"}`,
                        background: !targetUnitId ? "rgba(37, 99, 235, 0.08)" : "var(--bg-input)",
                        color: !targetUnitId ? "var(--accent-primary)" : "var(--text-secondary)",
                        fontWeight: !targetUnitId ? 700 : 500,
                        fontSize: "0.88rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <SvgIcon name="folder" size={15} /> General (Unassigned)
                    </button>
                    {units.map((u, i) => {
                      const isSelected = targetUnitId === u.id;
                      const pal = UNIT_COLORS[i % UNIT_COLORS.length];
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setTargetUnitId(u.id)}
                          style={{
                            padding: "0.6rem 1.1rem",
                            borderRadius: "var(--radius-md)",
                            border: `1.5px solid ${isSelected ? pal.accent : "var(--border)"}`,
                            background: isSelected ? pal.bg : "var(--bg-input)",
                            color: isSelected ? pal.accent : "var(--text-secondary)",
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: "0.88rem",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span style={{
                            width: "20px", height: "20px", borderRadius: "50%",
                            background: isSelected ? pal.pill : "var(--border-subtle)",
                            color: isSelected ? pal.accent : "var(--text-muted)",
                            fontSize: "0.75rem", fontWeight: 800,
                            display: "inline-flex", alignItems: "center", justifyContent: "center"
                          }}>
                            {i + 1}
                          </span>
                          {u.title.length > 28 ? u.title.slice(0, 28) + "..." : u.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Lesson Title <span style={{ color: "var(--error)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Organelles, Mitochondria & Cell Division"
                  value={lessonTitle}
                  onChange={e => setLessonTitle(e.target.value)}
                  required
                  style={{
                    fontSize: "1rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Lesson Description <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)" }}>(Optional)</span>
                </label>
                <textarea
                  className="input-field"
                  rows={4}
                  placeholder="Outline key concepts, required readings, and main learning outcomes for this lesson..."
                  value={lessonDesc}
                  onChange={e => setLessonDesc(e.target.value)}
                  style={{
                    fontSize: "0.95rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    minHeight: "125px",
                    lineHeight: 1.55,
                    resize: "vertical",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "flex-end", gap: "0.85rem",
              marginTop: "2rem", paddingTop: "1.35rem",
              borderTop: "1px solid var(--border)",
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateLesson(false)}
                style={{ fontSize: "0.95rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius-md)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingLesson || !lessonTitle.trim()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  fontSize: "0.95rem", padding: "0.75rem 1.5rem", fontWeight: 600,
                  borderRadius: "var(--radius-md)"
                }}
              >
                {creatingLesson ? (
                  <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} /> Adding Lesson...</>
                ) : (
                  <><SvgIcon name="plus" size={16} /> Add Lesson</>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════ MODAL: UPLOAD COURSE MATERIAL ═══════════ */}
      {showUploadMaterialModal && (
        <Modal title="Upload Course Material" onClose={() => setShowUploadMaterialModal(false)} maxWidth="640px">
          <form onSubmit={handleUploadCourseMaterial}>
            <div style={{
              background: "linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(37, 99, 235, 0.08) 100%)",
              borderRadius: "var(--radius-md)",
              padding: "1.35rem 1.5rem",
              marginBottom: "1.75rem",
              display: "flex", alignItems: "center", gap: "1.25rem",
              border: "1px solid rgba(236, 72, 153, 0.15)",
            }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "var(--radius-md)",
                background: "rgba(236, 72, 153, 0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <SvgIcon name="upload" size={28} style={{ color: "#EC4899" }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                  Upload Reference Document
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Share past papers, marking schemes, government resource books, or syllabus documents with your class.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
              {/* File Dropzone Input */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Select Document File <span style={{ color: "var(--error)" }}>*</span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "1.75rem 1.5rem",
                    border: "2px dashed var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-input)",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <SvgIcon name="file-text" size={32} style={{ color: "var(--accent-primary)", marginBottom: "0.5rem" }} />
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                    {matFile ? matFile.name : "Click to select a PDF, Word document, or image file"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Supported formats: PDF, DOC, DOCX, TXT, PNG, JPG, ZIP (max 100MB)
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        const selected = e.target.files[0];
                        setMatFile(selected);
                        const cleanTitle = selected.name.replace(/\.[^/.]+$/, "").replace(/[_]/g, " ").replace(/\s+/g, " ").trim();
                        setMatTitle(cleanTitle);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Title Text Box */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Material Title <span style={{ color: "var(--error)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 2023 A/L Biology Past Paper & Model Answers"
                  value={matTitle}
                  onChange={e => setMatTitle(e.target.value)}
                  required
                  style={{
                    fontSize: "1rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              {/* Category Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Material Category
                </label>
                <select
                  className="select"
                  value={matCategory}
                  onChange={e => setMatCategory(e.target.value)}
                  style={{
                    fontSize: "0.95rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-md)",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <option value="past_paper">Past Papers</option>
                  <option value="model_paper">Model Papers</option>
                  <option value="marking_scheme">Marking Schemes</option>
                  <option value="resource_book">Resource Books</option>
                  <option value="syllabus">Syllabus & Revision Notes</option>
                  <option value="general">General Reference Documents</option>
                </select>
              </div>

              {/* Past Paper / Model Paper Classification Controls */}
              {(matCategory === "past_paper" || matCategory === "model_paper") && (
                <div style={{
                  padding: "1.15rem 1.25rem",
                  background: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(139,92,246,0.06) 100%)",
                  border: "1px solid rgba(37,99,235,0.18)",
                  borderRadius: "var(--radius-md)",
                  display: "flex", flexDirection: "column", gap: "1rem"
                }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="sparkle" size={14} /> Automatic Question Bank Ingestion & Classification
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                        Paper Format / Part
                      </label>
                      <select
                        className="select"
                        value={matPaperType}
                        onChange={e => setMatPaperType(e.target.value as any)}
                        style={{ fontSize: "0.85rem", padding: "0.55rem 0.85rem", width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)" }}
                      >
                        <option value="full_paper">Full Paper (Parts I, II-A & II-B)</option>
                        <option value="paper_1_mcq">Paper I (MCQs)</option>
                        <option value="paper_2_structured">Paper II-A (Structured)</option>
                        <option value="paper_2_essay">Paper II-B (Essay Studio)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                        Examination Year / Session
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. 2024, 2023, Model Paper 1"
                        value={matYear}
                        onChange={e => setMatYear(e.target.value)}
                        style={{ fontSize: "0.85rem", padding: "0.55rem 0.85rem", width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Description Textarea */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Description <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)" }}>(Optional)</span>
                </label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Brief note or instructions for students regarding this document..."
                  value={matDesc}
                  onChange={e => setMatDesc(e.target.value)}
                  style={{
                    fontSize: "0.95rem",
                    padding: "0.85rem 1.1rem",
                    borderRadius: "var(--radius-md)",
                    minHeight: "100px",
                    lineHeight: 1.55,
                    resize: "vertical",
                    width: "100%",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: "0.85rem",
              marginTop: "2rem", paddingTop: "1.35rem",
              borderTop: "1px solid var(--border)",
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUploadMaterialModal(false)}
                style={{ fontSize: "0.95rem", padding: "0.75rem 1.5rem", borderRadius: "var(--radius-md)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={uploadingMat || !matTitle.trim() || !matFile}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  fontSize: "0.95rem", padding: "0.75rem 1.5rem", fontWeight: 600,
                  borderRadius: "var(--radius-md)"
                }}
              >
                {uploadingMat ? (
                  <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} /> Uploading File...</>
                ) : (
                  <><SvgIcon name="upload" size={16} /> Upload Material</>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ═══════════ DELETE CONFIRMATIONS ═══════════ */}
      {deleteUnitTarget && (
        <ConfirmDialog
          title="Delete Unit"
          message={`Are you sure you want to delete "${deleteUnitTarget.title}" and all ${deleteUnitTarget.lessons.length} nested lesson${deleteUnitTarget.lessons.length !== 1 ? "s" : ""}? This action cannot be undone.`}
          onConfirm={handleDeleteUnit}
          onCancel={() => setDeleteUnitTarget(null)}
          loading={deletingUnit}
        />
      )}

      {deleteLessonTarget && (
        <ConfirmDialog
          title="Delete Lesson"
          message={`Are you sure you want to delete lesson "${deleteLessonTarget.title}" and all its materials? This action cannot be undone.`}
          onConfirm={handleDeleteLesson}
          onCancel={() => setDeleteLessonTarget(null)}
          loading={deletingLesson}
        />
      )}

      {deleteMaterialTarget && (
        <ConfirmDialog
          title="Delete Course Material"
          message={`Are you sure you want to delete material document "${deleteMaterialTarget.title}"?`}
          onConfirm={handleDeleteMaterial}
          onCancel={() => setDeleteMaterialTarget(null)}
          loading={deletingMaterial}
        />
      )}
    </div>
  );
}
