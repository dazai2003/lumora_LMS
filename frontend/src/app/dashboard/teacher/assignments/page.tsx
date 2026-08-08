"use client";

import React, { useState, useEffect } from "react";
import api, { Course } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SpeedGraderWorkspace from "@/components/SpeedGraderWorkspace";

/* ─── Types ─── */
type CreateTab = "manual" | "ai";

export default function TeacherAssignmentsPage() {
  const { addToast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* Modal state */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<any | null>(null);

  const [createTab, setCreateTab] = useState<CreateTab>("manual");
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  /* Manual / Edit fields */
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [weightage, setWeightage] = useState("10");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("published");
  const [isGroup, setIsGroup] = useState(false);
  const [category, setCategory] = useState("");
  const [blooms, setBlooms] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [estTime, setEstTime] = useState("");
  const [aiPolicy, setAiPolicy] = useState("allowed");
  const [wordMin, setWordMin] = useState("");
  const [wordMax, setWordMax] = useState("");
  const [lateAllowed, setLateAllowed] = useState(false);
  const [penaltyPct, setPenaltyPct] = useState("5");
  const [anonymousMarking, setAnonymousMarking] = useState(false);
  const [aiPreCheck, setAiPreCheck] = useState(false);

  /* AI prompt */
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState<any>(null);

  /* SpeedGrader state */
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSub, setSelectedSub] = useState<any | null>(null);

  /* Fetch */
  const fetchData = async () => {
    setLoading(true);
    try {
      const teacherCourses = await api.listCourses();
      setCourses(teacherCourses || []);
      let activeCourseId = selectedCourseId;
      if (teacherCourses && teacherCourses.length > 0 && !activeCourseId) {
        activeCourseId = teacherCourses[0].id;
        setSelectedCourseId(activeCourseId);
      }
      const data = await api.listAssignments(activeCourseId || undefined);
      setAssignments(data || []);
    } catch (err) {
      console.error(err);
      addToast("Failed to load assignments.", "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); }, [selectedCourseId]);

  /* Reset modal form */
  const resetForm = () => {
    setShowCreateModal(false);
    setEditingAssignment(null);
    setCreateTab("manual");
    setNewTitle(""); setNewDesc(""); setNewInstructions("");
    setMaxMarks("100"); setWeightage("10"); setDueDate(""); setStatus("published"); setIsGroup(false);
    setCategory(""); setBlooms(""); setDifficulty("medium"); setEstTime("");
    setAiPolicy("allowed"); setWordMin(""); setWordMax(""); setLateAllowed(false);
    setPenaltyPct("5"); setAnonymousMarking(false); setAiPreCheck(false);
    setAiPrompt(""); setAiGenerated(null);
  };

  /* Open edit modal */
  const handleOpenEdit = (item: any) => {
    setEditingAssignment(item);
    setNewTitle(item.title || "");
    setNewDesc(item.description || "");
    setNewInstructions(item.instructions || "");
    setMaxMarks(String(item.max_marks || 100));
    setWeightage(String(item.weightage || 10));
    setStatus(item.status || "published");
    setDueDate(item.due_date ? new Date(item.due_date).toISOString().slice(0, 16) : "");
    setIsGroup(item.is_group || false);
    setCategory(item.category || "");
    setBlooms(item.blooms_level || "");
    setDifficulty(item.difficulty || "medium");
    setEstTime(String(item.est_completion_time_minutes || ""));
    setAiPolicy(item.ai_policy || "allowed");
    if (item.word_count_limits) {
      setWordMin(String(item.word_count_limits.min || ""));
      setWordMax(String(item.word_count_limits.max || ""));
    } else { setWordMin(""); setWordMax(""); }
    if (item.late_submission_rules) {
      setLateAllowed(Boolean(item.late_submission_rules.allowed));
      setPenaltyPct(String(item.late_submission_rules.penalty_pct_per_day || "5"));
    } else { setLateAllowed(false); setPenaltyPct("5"); }
    setAnonymousMarking(Boolean(item.anonymous_marking));
    setAiPreCheck(Boolean(item.ai_pre_check_enabled));
    setCreateTab("manual");
    setShowCreateModal(true);
  };

  /* Create assignment */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !newTitle) {
      addToast("Course and Assignment Title are required.", "warning");
      return;
    }
    setCreating(true);
    try {
      await api.createAssignment({
        course_id: selectedCourseId,
        title: newTitle,
        description: newDesc,
        instructions: newInstructions,
        max_marks: parseFloat(maxMarks),
        weightage: parseFloat(weightage),
        is_group: isGroup,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status,
        category: category || null,
        blooms_level: blooms || null,
        difficulty,
        est_completion_time_minutes: estTime ? parseInt(estTime) : null,
        ai_policy: aiPolicy,
        word_count_limits: wordMin && wordMax ? { min: parseInt(wordMin), max: parseInt(wordMax) } : null,
        late_submission_rules: lateAllowed ? { allowed: true, penalty_pct_per_day: parseInt(penaltyPct), max_late_days: 7 } : null,
        anonymous_marking: anonymousMarking,
        ai_pre_check_enabled: aiPreCheck,
      });
      addToast("Assignment created!", "success");
      resetForm();
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create assignment.", "error");
    } finally {
      setCreating(false);
    }
  };

  /* Save edit assignment */
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment || !newTitle) return;
    setSavingEdit(true);
    try {
      await api.updateAssignment(editingAssignment.id, {
        title: newTitle,
        description: newDesc,
        instructions: newInstructions,
        max_marks: parseFloat(maxMarks),
        weightage: parseFloat(weightage),
        is_group: isGroup,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status,
        category: category || null,
        blooms_level: blooms || null,
        difficulty,
        est_completion_time_minutes: estTime ? parseInt(estTime) : null,
        ai_policy: aiPolicy,
        word_count_limits: wordMin && wordMax ? { min: parseInt(wordMin), max: parseInt(wordMax) } : null,
        late_submission_rules: lateAllowed ? { allowed: true, penalty_pct_per_day: parseInt(penaltyPct), max_late_days: 7 } : null,
        anonymous_marking: anonymousMarking,
        ai_pre_check_enabled: aiPreCheck,
      });
      addToast("Assignment updated successfully!", "success");
      resetForm();
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to update assignment.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  /* Confirm delete assignment */
  const handleConfirmDelete = async () => {
    if (!deletingAssignment) return;
    try {
      await api.deleteAssignment(deletingAssignment.id);
      addToast("Assignment deleted.", "success");
      setDeletingAssignment(null);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete assignment.", "error");
    }
  };

  /* AI Generator */
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const res = await api.generateCourseworkAI(aiPrompt, selectedCourseId || undefined);
      setAiGenerated(res.generated);
      addToast("AI blueprint generated!", "success");
    } catch {
      addToast("AI generation failed.", "error");
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAIBlueprint = () => {
    if (!aiGenerated) return;
    setNewTitle(aiGenerated.title || "");
    setNewDesc(aiGenerated.description || "");
    setNewInstructions(aiGenerated.instructions || "");
    setMaxMarks(String(aiGenerated.max_marks || 100));
    setCategory(aiGenerated.category || "");
    setBlooms(aiGenerated.blooms_level || "");
    setDifficulty(aiGenerated.difficulty || "medium");
    setEstTime(String(aiGenerated.est_completion_time_minutes || ""));
    if (aiGenerated.word_count_limits) {
      setWordMin(String(aiGenerated.word_count_limits.min || ""));
      setWordMax(String(aiGenerated.word_count_limits.max || ""));
    }
    setCreateTab("manual");
    addToast("Applied AI blueprint!", "info");
  };

  /* Open SpeedGrader */
  const handleOpenGrading = async (assignment: any) => {
    setSelectedAssignment(assignment);
    try {
      const subs = await api.listAssignmentSubmissions(assignment.id);
      setSubmissions(subs || []);
      if (subs && subs.length > 0) setSelectedSub(subs[0]);
      else setSelectedSub(null);
    } catch (e) { console.error(e); }
  };

  /* ─────────── Render ─────────── */

  /* SpeedGrader Workspace — full screen */
  if (selectedAssignment) {
    return (
      <div className="animate-fade-in" style={{ margin: "0 auto", height: "100%" }}>
        {submissions.length > 0 && selectedSub ? (
          <SpeedGraderWorkspace
            assignment={selectedAssignment}
            submission={selectedSub}
            onGradeUpdate={() => handleOpenGrading(selectedAssignment)}
            onClose={() => setSelectedAssignment(null)}
            studentSubmissions={submissions}
            onSelectSubmission={(sub) => setSelectedSub(sub)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", color: "var(--text-muted)", gap: "1rem" }}>
            <SvgIcon name="file-text" size={48} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: "0.9rem" }}>No submissions received for this assignment yet.</p>
            <button className="btn-secondary btn-sm" onClick={() => setSelectedAssignment(null)}>
              <SvgIcon name="arrow-left" size={14} /> Back to Assignments
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ─────────── Assignments List ─────────── */
  return (
    <div className="animate-fade-in" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Coursework Management
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "4px 0 0 0" }}>
            Create, grade, edit, and manage coursework assignments
          </p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowCreateModal(true); }} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <SvgIcon name="plus" size={16} /> Create Assignment
        </button>
      </div>

      {/* Course filter */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>Course:</label>
        <select
          className="input"
          style={{ width: "280px", fontSize: "0.85rem" }}
          value={selectedCourseId || ""}
          onChange={(e) => setSelectedCourseId(Number(e.target.value))}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* Assignments grid */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      ) : assignments.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <SvgIcon name="folder" size={32} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>No assignments for this course</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.825rem", marginTop: "4px" }}>
            Click &quot;Create Assignment&quot; to get started.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem" }}>
          {assignments.map((item) => (
            <div key={item.id} className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{item.submission_count || 0} subs</span>
                    {item.category && <span className="badge badge-secondary" style={{ fontSize: "0.65rem" }}>{item.category}</span>}
                    <span className={`badge ${item.status === "published" ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "0.65rem" }}>{item.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <span className="badge badge-secondary" style={{ fontSize: "0.7rem", marginRight: "4px" }}>
                      {item.max_marks} pts · {item.weightage}%
                    </span>
                    <button className="btn-icon" onClick={() => handleOpenEdit(item)} title="Edit Assignment" style={{ padding: "3px" }}>
                      <SvgIcon name="edit" size={14} />
                    </button>
                    <button className="btn-icon" onClick={() => setDeletingAssignment(item)} title="Delete Assignment" style={{ padding: "3px", color: "var(--color-error)" }}>
                      <SvgIcon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.3rem 0" }}>{item.title}</h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {item.description || "No description."}
                </p>

                {/* Meta */}
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {item.difficulty && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <SvgIcon name="bar-chart" size={12} /> {item.difficulty}
                    </span>
                  )}
                  {item.blooms_level && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <SvgIcon name="cpu" size={12} /> {item.blooms_level}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>
                  Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : "None"}
                </span>
                <button className="btn-secondary btn-sm" onClick={() => handleOpenGrading(item)}>
                  Open SpeedGrader
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Modal ─── */}
      {showCreateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}>
          <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "780px", maxHeight: "90vh", background: "var(--bg-secondary)", padding: "1.5rem", overflowY: "auto" }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                {editingAssignment ? "Edit Coursework" : "Create Coursework"}
              </h2>
              <button onClick={resetForm} className="btn-icon">✕</button>
            </div>

            {/* Tabs: Manual | AI (only for create) */}
            {!editingAssignment && (
              <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.25rem" }}>
                <button
                  className={`btn-sm ${createTab === "manual" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setCreateTab("manual")}
                  style={{ fontSize: "0.8rem" }}
                >
                  Manual Designer
                </button>
                <button
                  className={`btn-sm ${createTab === "ai" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setCreateTab("ai")}
                  style={{ fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <SvgIcon name="sparkles" size={14} /> AI Generator
                </button>
              </div>
            )}

            {createTab === "ai" && !editingAssignment ? (
              <div>
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label className="label">Describe the assignment you want to create</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Create a 2000-word research essay on machine learning ethics for a 3rd year CS course. Include rubric criteria for critical analysis, evidence quality, and writing style."
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
                <button className="btn-primary" onClick={handleAIGenerate} disabled={aiGenerating || !aiPrompt.trim()} style={{ marginBottom: "1.25rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <SvgIcon name="sparkles" size={16} />
                  {aiGenerating ? "Generating Blueprint..." : "Generate with AI"}
                </button>

                {aiGenerated && (
                  <div style={{ background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)", padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--accent-primary)" }}>AI Blueprint</h3>
                      <button className="btn-primary btn-sm" onClick={applyAIBlueprint} style={{ fontSize: "0.75rem" }}>Apply & Edit</button>
                    </div>
                    <div style={{ fontSize: "0.8rem" }}>
                      <div style={{ marginBottom: "0.35rem" }}><strong>Title:</strong> {aiGenerated.title}</div>
                      <div style={{ marginBottom: "0.35rem" }}><strong>Category:</strong> {aiGenerated.category}</div>
                      <div style={{ marginBottom: "0.35rem" }}><strong>Bloom&apos;s:</strong> {aiGenerated.blooms_level}</div>
                      <div style={{ marginBottom: "0.35rem" }}><strong>Marks:</strong> {aiGenerated.max_marks}</div>
                      <div style={{ marginBottom: "0.35rem" }}><strong>Time:</strong> {aiGenerated.est_completion_time_minutes} min</div>
                      {aiGenerated.learning_outcomes?.length > 0 && (
                        <div style={{ marginBottom: "0.35rem" }}>
                          <strong>Outcomes:</strong>
                          <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
                            {aiGenerated.learning_outcomes.map((lo: string, i: number) => <li key={i} style={{ marginBottom: "0.15rem" }}>{lo}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={editingAssignment ? handleSaveEdit : handleCreate}>
                {/* Title, description, instructions */}
                <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="label">Title</label>
                  <input className="input" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Research Paper & Code Analysis" />
                </div>
                <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="label">Description</label>
                  <input className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Short overview of assignment objectives" />
                </div>
                <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="label">Instructions</label>
                  <textarea className="input" rows={3} value={newInstructions} onChange={(e) => setNewInstructions(e.target.value)} placeholder="Detailed guidelines for submission..." />
                </div>

                {/* Row: Marks, Weightage, Status */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div><label className="label">Max Marks</label><input className="input" type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} /></div>
                  <div><label className="label">Weightage (%)</label><input className="input" type="number" value={weightage} onChange={(e) => setWeightage(e.target.value)} /></div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                {/* Row: Category, Bloom's, Difficulty */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label className="label">Category</label>
                    <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">Select...</option>
                      <option value="essay">Essay</option>
                      <option value="report">Report</option>
                      <option value="project">Project</option>
                      <option value="lab">Lab Work</option>
                      <option value="presentation">Presentation</option>
                      <option value="portfolio">Portfolio</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Bloom&apos;s Level</label>
                    <select className="input" value={blooms} onChange={(e) => setBlooms(e.target.value)}>
                      <option value="">Select...</option>
                      <option value="remember">Remember</option>
                      <option value="understand">Understand</option>
                      <option value="apply">Apply</option>
                      <option value="analyze">Analyze</option>
                      <option value="evaluate">Evaluate</option>
                      <option value="create">Create</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Difficulty</label>
                    <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                {/* Row: Due Date, Est time, AI Policy */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div><label className="label">Due Date</label><input className="input" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
                  <div><label className="label">Est. Time (min)</label><input className="input" type="number" value={estTime} onChange={(e) => setEstTime(e.target.value)} placeholder="120" /></div>
                  <div>
                    <label className="label">AI Policy</label>
                    <select className="input" value={aiPolicy} onChange={(e) => setAiPolicy(e.target.value)}>
                      <option value="allowed">AI Allowed</option>
                      <option value="assisted">AI Assisted</option>
                      <option value="prohibited">AI Prohibited</option>
                      <option value="no_policy">No Policy</option>
                    </select>
                  </div>
                </div>

                {/* Word Count Limits */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div><label className="label">Min Words</label><input className="input" type="number" value={wordMin} onChange={(e) => setWordMin(e.target.value)} placeholder="500" /></div>
                  <div><label className="label">Max Words</label><input className="input" type="number" value={wordMax} onChange={(e) => setWordMax(e.target.value)} placeholder="2000" /></div>
                </div>

                {/* Toggles */}
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1rem", fontSize: "0.825rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
                    Group Assignment
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={anonymousMarking} onChange={(e) => setAnonymousMarking(e.target.checked)} />
                    Anonymous Marking
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={aiPreCheck} onChange={(e) => setAiPreCheck(e.target.checked)} />
                    AI Pre-Check
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={lateAllowed} onChange={(e) => setLateAllowed(e.target.checked)} />
                    Allow Late ({lateAllowed ? `${penaltyPct}%/day` : "off"})
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
                  <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={creating || savingEdit}>
                    {editingAssignment ? (savingEdit ? "Saving..." : "Save Changes") : (creating ? "Creating..." : "Publish Assignment")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingAssignment)}
        title="Delete Assignment"
        message={`Are you sure you want to delete "${deletingAssignment?.title}"? All student submissions, rubrics, and associated resources will be permanently removed.`}
        confirmLabel="Delete Assignment"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAssignment(null)}
      />
    </div>
  );
}
