"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import WYSIWYGEditor from "@/components/WYSIWYGEditor";

/* ─────────── Types ─────────── */
type TabFilter = "all" | "upcoming" | "submitted" | "graded";
type EditorMode = "rich_text" | "markdown" | "code" | "url";

/* ─────────── Main Page ─────────── */
export default function StudentAssignmentsPage() {
  const { addToast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");

  /* Workspace state */
  const [wsOpen, setWsOpen] = useState(false);
  const [wsAssignment, setWsAssignment] = useState<any>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich_text");
  const [contentText, setContentText] = useState("");
  const [studentComment, setStudentComment] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [preCheck, setPreCheck] = useState<any>(null);
  const [preCheckLoading, setPreCheckLoading] = useState(false);
  const autosaveTimer = useRef<any>(null);

  /* Group tagging state */
  const [enrolledClassmates, setEnrolledClassmates] = useState<any[]>([]);
  const [selectedMateIds, setSelectedMateIds] = useState<number[]>([]);

  /* Phase 4.2: Review state */
  const [reviewComments, setReviewComments] = useState<any[]>([]);
  const [reviewSuggestions, setReviewSuggestions] = useState<any[]>([]);
  const [reviewSections, setReviewSections] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [showReview, setShowReview] = useState(false);

  /* Fetch */
  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const data = await api.listAssignments();
      setAssignments(data || []);
    } catch (err) {
      console.error(err);
      addToast("Failed to load assignments.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssignments(); }, []);

  /* Filter */
  const filtered = assignments.filter((a) => {
    if (tabFilter === "upcoming") return !a.my_submission || a.my_submission.status === "draft";
    if (tabFilter === "submitted") return a.my_submission && a.my_submission.status === "submitted";
    if (tabFilter === "graded") return a.my_submission && a.my_submission.is_published;
    return true;
  });

  /* Open workspace */
  const openWorkspace = async (assignment: any) => {
    setWsAssignment(assignment);
    const initialText = assignment.my_submission?.submission_content_text || "";
    const hasHtml = /<[a-z][\s\S]*>/i.test(initialText);
    const initialMode = assignment.my_submission?.submission_mode === "code" && !hasHtml ? "code" : "rich_text";
    setEditorMode(initialMode);
    setContentText(initialText);
    setStudentComment(assignment.my_submission?.student_comment || "");
    setRepoUrl(assignment.my_submission?.repository_url || "");
    setPreCheck(null);
    setWsOpen(true);
    try {
      const details = await api.getAssignmentDetails(assignment.id);
      setWsAssignment(details);
      const subText = details.my_submission?.submission_content_text || "";
      if (subText) {
        setContentText(subText);
      }
      if (details.my_submission?.group_mate_ids) {
        setSelectedMateIds(details.my_submission.group_mate_ids);
      }
      const textHasHtml = /<[a-z][\s\S]*>/i.test(subText);
      const finalMode = details.my_submission?.submission_mode === "code" && !textHasHtml ? "code" : "rich_text";
      setEditorMode(finalMode);

      // Fetch enrolled classmates for group assignment
      if (details.is_group) {
        try {
          const mates = await api.getEnrolledStudents(assignment.id);
          setEnrolledClassmates(mates || []);
        } catch {}
      }
      // Load review data if graded
      if (details.my_submission?.is_published) {
        try {
          const [cmts, suggs, secFb] = await Promise.all([
            api.listInlineComments(details.my_submission.id),
            api.listSuggestions(details.my_submission.id),
            api.getSectionFeedback(details.my_submission.id),
          ]);
          setReviewComments(cmts || []);
          setReviewSuggestions(suggs || []);
          setReviewSections(secFb || []);
          setShowReview(true);
        } catch {}
      } else {
        setReviewComments([]); setReviewSuggestions([]); setReviewSections([]); setShowReview(false);
      }
    } catch (e) { console.error(e); }
  };

  /* Autosave */
  const handleContentChange = useCallback((val: string) => {
    setContentText(val);
    setAutosaveStatus("idle");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      if (!wsAssignment) return;
      setAutosaveStatus("saving");
      try {
        await api.workspaceSubmit(wsAssignment.id, {
          is_draft: true,
          content_text: val,
          submission_mode: editorMode,
          student_comment: studentComment,
          repository_url: repoUrl,
          group_mate_ids: selectedMateIds
        });
        setAutosaveStatus("saved");
      } catch { setAutosaveStatus("idle"); }
    }, 2000);
  }, [wsAssignment, editorMode, studentComment, repoUrl, selectedMateIds]);

  /* Submit */
  const handleSubmit = async (isDraft: boolean) => {
    if (!wsAssignment) return;
    setSubmitting(true);
    try {
      await api.workspaceSubmit(wsAssignment.id, {
        is_draft: isDraft,
        content_text: contentText,
        submission_mode: editorMode,
        student_comment: studentComment,
        repository_url: repoUrl,
        group_mate_ids: selectedMateIds
      });
      addToast(isDraft ? "Draft saved!" : "Coursework submitted!", "success");
      if (!isDraft) { setWsOpen(false); fetchAssignments(); }
    } catch (err: any) {
      addToast(err.message || "Submission failed.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* Pre-check */
  const runPreCheck = async () => {
    if (!wsAssignment) return;
    setPreCheckLoading(true);
    try {
      const res = await api.preSubmissionCheck(wsAssignment.id, contentText);
      setPreCheck(res);
    } catch { addToast("Pre-check unavailable.", "error"); }
    finally { setPreCheckLoading(false); }
  };

  /* Stats */
  const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const charCount = contentText.length;
  const readingTime = Math.ceil(wordCount / 200);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  /* ─────────── RENDER ─────────── */
  if (wsOpen && wsAssignment) {
    const isSubmitted = wsAssignment.my_submission?.status === "submitted" || wsAssignment.my_submission?.status === "graded";
    const isITCourse = /IT|Computer|Code|Program|Software|Tech|CS\d/i.test(wsAssignment.course_title || "") || /IT|Computer|Code|Software/i.test(wsAssignment.category || "");
    const availableModes: EditorMode[] = isITCourse ? ["rich_text", "code"] : ["rich_text"];

    return (
      <div className="animate-fade-in" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "4rem" }}>
        {/* Workspace header */}
        <div className="card" style={{ padding: "0.85rem 1.25rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            <button className="btn-secondary btn-sm" onClick={() => setWsOpen(false)}>← Back</button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>{wsAssignment.title}</h1>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "2px" }}>
                <span className="badge badge-info" style={{ fontSize: "0.675rem" }}>{wsAssignment.course_title || "Course"}</span>
                {wsAssignment.category && <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>{wsAssignment.category}</span>}
                {wsAssignment.due_date && (
                  <span style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>
                    Due: {new Date(wsAssignment.due_date).toLocaleDateString()} {new Date(wsAssignment.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
            {isSubmitted ? (
              <span className="badge badge-success" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <SvgIcon name="lock" size={14} /> Submitted on {wsAssignment.my_submission?.submitted_at ? new Date(wsAssignment.my_submission.submitted_at).toLocaleDateString() : "Record"} (Read-Only)
              </span>
            ) : (
              <>
                {autosaveStatus === "saving" && <span style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>Saving...</span>}
                {autosaveStatus === "saved" && <span style={{ fontSize: "0.725rem", color: "var(--color-success)", display: "inline-flex", alignItems: "center", gap: "4px" }}><SvgIcon name="check" size={12} /> Autosaved</span>}
                <button className="btn-secondary btn-sm" onClick={() => handleSubmit(true)} disabled={submitting}>Save Draft</button>
                <button className="btn-primary btn-sm" onClick={() => handleSubmit(false)} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Question Prompt & Problem Statement Header Card */}
        <div className="card" style={{ padding: "1.25rem", marginBottom: "1.25rem", borderLeft: "4px solid var(--accent-primary)", background: "var(--bg-card)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.725rem", fontWeight: 700, textTransform: "uppercase", color: "var(--accent-primary)", letterSpacing: "0.5px", marginBottom: "4px" }}>
                Assignment Question & Problem Prompt
              </div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>
                {wsAssignment.title}
              </h2>
              {wsAssignment.description ? (
                <div style={{ fontSize: "0.925rem", lineHeight: 1.65, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                  {wsAssignment.description}
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                  No description specified. Read instructions or view workspace below.
                </p>
              )}
            </div>
            {wsAssignment.instructions && (
              <button className="btn-secondary btn-sm" onClick={() => setShowInstructionsModal(true)} style={{ fontSize: "0.725rem", whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                Full Instructions <SvgIcon name="link" size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Main content: 2-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.25rem" }}>
          {/* LEFT: Editor */}
          <div>
            {/* Mode tabs */}
            <div className="card" style={{ padding: "0.5rem 0.75rem", marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                {availableModes.map((m, idx) => (
                  <button
                    key={m || `mode_${idx}`}
                    className={`btn-sm ${editorMode === m ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setEditorMode(m)}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem" }}
                  >
                    {m === "rich_text" ? "Digital Paper Workspace" : "Code Editor"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.725rem", color: "var(--text-muted)" }}>
                <span>{wordCount} words</span>
                <span>{charCount} chars</span>
                <span>~{readingTime} min read</span>
              </div>
            </div>

            {/* Editor area */}
            {editorMode === "rich_text" ? (
              <WYSIWYGEditor
                initialContent={contentText}
                onChange={handleContentChange}
                readOnly={isSubmitted}
                showStats={true}
                autosaveStatus={autosaveStatus}
                placeholder="Start writing your document..."
                comments={reviewComments}
              />
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.725rem", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Code Editor — paste or write your source code solution below</span>
                  <label className="btn-secondary btn-sm" style={{ cursor: "pointer", fontSize: "0.7rem", padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <SvgIcon name="upload" size={12} /> Import Code File
                    <input type="file" accept=".py,.js,.ts,.cpp,.java,.c,.cs,.html,.css,.json,.sql,.txt,.md" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        if (text) {
                          handleContentChange(text);
                          addToast(`Loaded "${file.name}" into Code Editor!`, "info");
                        }
                      };
                      reader.readAsText(file);
                    }} style={{ display: "none" }} />
                  </label>
                </div>
                <textarea
                  value={contentText}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="// Write or paste your source code here..."
                  style={{
                    width: "100%",
                    minHeight: "450px",
                    padding: "1.25rem",
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    borderRadius: "0 0 var(--radius-md) var(--radius-md)"
                  }}
                />
              </div>
            )}

            {/* Comment */}
            <div className="card" style={{ padding: "0.75rem", marginTop: "0.75rem" }}>
              <label className="label" style={{ fontSize: "0.75rem", marginBottom: "0.35rem" }}>Comments for Instructor (optional)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="Any notes for your teacher..."
                value={studentComment}
                onChange={(e) => setStudentComment(e.target.value)}
                style={{ fontSize: "0.8rem" }}
              />
            </div>
          </div>

          {/* RIGHT: Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Assignment details */}
            <div className="card" style={{ padding: "1rem" }}>
              <h3 style={{ fontSize: "0.825rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
                Assignment Details
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.775rem" }}>
                {wsAssignment.max_marks && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Max Marks</span>
                    <span style={{ fontWeight: 600 }}>{wsAssignment.max_marks}</span>
                  </div>
                )}
                {wsAssignment.weightage && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Weightage</span>
                    <span>{wsAssignment.weightage}%</span>
                  </div>
                )}
                {wsAssignment.difficulty && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Difficulty</span>
                    <span className={`badge ${wsAssignment.difficulty === "easy" ? "badge-success" : wsAssignment.difficulty === "hard" ? "badge-error" : "badge-warning"}`} style={{ fontSize: "0.675rem" }}>
                      {wsAssignment.difficulty}
                    </span>
                  </div>
                )}
                {wsAssignment.blooms_level && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Bloom's Level</span>
                    <span style={{ textTransform: "capitalize" }}>{wsAssignment.blooms_level}</span>
                  </div>
                )}
                {wsAssignment.est_completion_time_minutes && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Est. Time</span>
                    <span>{wsAssignment.est_completion_time_minutes} min</span>
                  </div>
                )}
                {wsAssignment.ai_policy && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>AI Policy</span>
                    <span className={`badge ${wsAssignment.ai_policy === "prohibited" ? "badge-error" : wsAssignment.ai_policy === "assisted" ? "badge-warning" : "badge-info"}`} style={{ fontSize: "0.675rem" }}>
                      {wsAssignment.ai_policy}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Group Assignment Banner for linked member */}
            {wsAssignment.my_submission?.is_group_submission && (
              <div className="card" style={{ padding: "0.85rem", borderLeft: "4px solid var(--accent-primary)", background: "var(--bg-tertiary)" }}>
                <div style={{ fontSize: "0.775rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "4px" }}>
                  Group Submission Linked
                </div>
                <p style={{ fontSize: "0.725rem", color: "var(--text-muted)", margin: 0 }}>
                  Submitted by group leader <strong>{wsAssignment.my_submission.submitted_by_name}</strong>. Your grade and feedback will be shared.
                </p>
              </div>
            )}

            {/* Group Mate Selector for Leader */}
            {wsAssignment.is_group && !wsAssignment.my_submission?.is_group_submission && (
              <div className="card" style={{ padding: "0.85rem" }}>
                <div style={{ fontSize: "0.775rem", fontWeight: 600, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <SvgIcon name="users" size={14} style={{ color: "var(--accent-primary)" }} />
                  <span>Group Members {isSubmitted ? "(Locked)" : "(Tag Mates)"}</span>
                </div>
                {isSubmitted ? (
                  <div style={{ fontSize: "0.725rem", color: "var(--text-secondary)" }}>
                    {selectedMateIds.length > 0 ? (
                      <div>
                        Tagged Teammates:
                        <ul style={{ margin: "4px 0 0 1rem", padding: 0, fontSize: "0.725rem", color: "var(--accent-primary)" }}>
                          {enrolledClassmates.filter(m => selectedMateIds.includes(m.id)).map(m => (
                            <li key={m.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <SvgIcon name="check" size={12} style={{ color: "var(--color-success)" }} /> {m.full_name} ({m.email})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Individual submission (No group mates tagged).</span>
                    )}
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0" }}>
                      Select enrolled classmates working in your group so they automatically share this submission:
                    </p>
                    {enrolledClassmates.length === 0 ? (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>No other enrolled students found in this course.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "150px", overflowY: "auto" }}>
                        {enrolledClassmates.map((mate) => {
                          const isSelected = selectedMateIds.includes(mate.id);
                          return (
                            <label key={mate.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.725rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedMateIds([...selectedMateIds, mate.id]);
                                  else setSelectedMateIds(selectedMateIds.filter(id => id !== mate.id));
                                }}
                              />
                              <span>{mate.full_name} ({mate.email})</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Word count requirement */}
            {wsAssignment.word_count_limits && (
              <div className="card" style={{ padding: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>Word Count Requirement</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.725rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    {wsAssignment.word_count_limits.min}–{wsAssignment.word_count_limits.max} words
                  </span>
                  <span style={{ fontWeight: 600, color: wordCount < (wsAssignment.word_count_limits.min || 0) ? "var(--color-error)" : wordCount > (wsAssignment.word_count_limits.max || 999999) ? "var(--color-error)" : "var(--color-success)" }}>
                    {wordCount} words
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (wordCount / (wsAssignment.word_count_limits.max || 1)) * 100)}%`,
                    background: wordCount < (wsAssignment.word_count_limits.min || 0) ? "var(--color-warning)" : wordCount > (wsAssignment.word_count_limits.max || 999999) ? "var(--color-error)" : "var(--color-success)",
                    borderRadius: 2,
                    transition: "width 0.3s ease"
                  }} />
                </div>
              </div>
            )}


            {/* Learning Outcomes */}
            {wsAssignment.learning_outcomes && wsAssignment.learning_outcomes.length > 0 && (
              <div className="card" style={{ padding: "1rem" }}>
                <h3 style={{ fontSize: "0.825rem", fontWeight: 600, marginBottom: "0.5rem" }}>Learning Outcomes</h3>
                <ul style={{ margin: 0, padding: "0 0 0 1rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {wsAssignment.learning_outcomes.map((lo: string, i: number) => (
                    <li key={i} style={{ marginBottom: "0.25rem" }}>{lo}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Pre-Check */}
            <div className="card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ fontSize: "0.825rem", fontWeight: 600, margin: 0 }}>AI Pre-Check</h3>
                <button className="btn-sm btn-secondary" onClick={runPreCheck} disabled={preCheckLoading || wordCount < 10} style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}>
                  {preCheckLoading ? "Analyzing..." : "Run Check"}
                </button>
              </div>
              {preCheck ? (
                <div style={{ fontSize: "0.725rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Readiness</span>
                    <span className={`badge ${preCheck.overall_readiness === "ready" ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.65rem" }}>
                      {preCheck.overall_readiness === "ready" ? "Ready to Submit" : "Needs Attention"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Introduction</span>
                    <span style={{ color: preCheck.has_introduction ? "var(--color-success)" : "var(--color-error)" }}>{preCheck.has_introduction ? "Present" : "Missing"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Conclusion</span>
                    <span style={{ color: preCheck.has_conclusion ? "var(--color-success)" : "var(--color-error)" }}>{preCheck.has_conclusion ? "Present" : "Missing"}</span>
                  </div>
                  {preCheck.warnings?.length > 0 && (
                    <div style={{ marginTop: "0.5rem" }}>
                      {preCheck.warnings.map((w: string, i: number) => (
                        <div key={i} style={{ color: "var(--color-warning)", fontSize: "0.7rem", marginBottom: "0.15rem" }}>[Warning] {w}</div>
                      ))}
                    </div>
                  )}
                  {preCheck.suggestions?.length > 0 && (
                    <div style={{ marginTop: "0.35rem" }}>
                      {preCheck.suggestions.map((s: string, i: number) => (
                        <div key={i} style={{ color: "var(--color-info)", fontSize: "0.7rem", marginBottom: "0.15rem" }}>[Tip] {s}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: "0.725rem", color: "var(--text-muted)", margin: 0 }}>
                  Run an AI check to evaluate structure, word count, and readiness before submitting.
                </p>
              )}
            </div>

            {/* Graded feedback */}
            {wsAssignment.my_submission?.is_published && (
              <div className="card" style={{ padding: "1rem", border: "1px solid var(--color-success)" }}>
                <h3 style={{ fontSize: "0.825rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-success)" }}>
                  Grade & Feedback
                </h3>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                  {wsAssignment.my_submission.grade_marks} / {wsAssignment.max_marks}
                </div>
                {wsAssignment.my_submission.feedback_text && (
                  <p style={{ fontSize: "0.775rem", color: "var(--text-muted)", margin: 0 }}>
                    {wsAssignment.my_submission.feedback_text}
                  </p>
                )}
              </div>
            )}

            {/* Phase 4.2: Review Comments */}
            {showReview && reviewComments.length > 0 && (
              <div className="card" style={{ padding: "0.75rem" }}>
                <h3 style={{ fontSize: "0.775rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Inline Comments ({reviewComments.filter(c => !c.is_resolved).length} open)
                </h3>
                {reviewComments.map((c) => (
                  <div key={c.id} style={{
                    background: "var(--bg-tertiary)", padding: "0.5rem", borderRadius: "var(--radius-sm)", marginBottom: "0.35rem",
                    borderLeft: `3px solid ${c.is_resolved ? "var(--color-success)" : "var(--accent-primary)"}`,
                    opacity: c.is_resolved ? 0.7 : 1,
                  }}>
                    <div style={{ fontSize: "0.675rem", fontWeight: 600 }}>{c.author_name}</div>
                    {c.highlight_text && <div style={{ fontSize: "0.625rem", color: "var(--accent-primary)", fontStyle: "italic" }}>&quot;{c.highlight_text.substring(0, 60)}...&quot;</div>}
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", margin: "2px 0" }}>{c.comment_text}</div>
                    {c.replies?.map((r: any) => (
                      <div key={r.id} style={{ marginLeft: "10px", paddingLeft: "6px", borderLeft: "2px solid var(--border-subtle)", marginTop: "4px" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.625rem" }}>{r.author_name}</span>
                        <div style={{ fontSize: "0.675rem", color: "var(--text-secondary)" }}>{r.comment_text}</div>
                      </div>
                    ))}
                    {!c.is_resolved && (
                      <div style={{ marginTop: "4px" }}>
                        {replyingTo === c.id ? (
                          <div style={{ display: "flex", gap: "3px" }}>
                            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Reply..." style={{ flex: 1, padding: "2px 5px", border: "1px solid var(--border-subtle)", borderRadius: 3, fontSize: "0.65rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                            <button className="btn-sm btn-primary" onClick={async () => { try { await api.replyToComment(c.id, replyText); setReplyText(""); setReplyingTo(null); const cmts = await api.listInlineComments(wsAssignment.my_submission.id); setReviewComments(cmts || []); } catch {} }} style={{ fontSize: "0.575rem", padding: "2px 5px" }}>Send</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button onClick={() => setReplyingTo(c.id)} style={{ fontSize: "0.6rem", color: "var(--accent-primary)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Reply</button>
                            <button onClick={async () => { try { await api.resolveComment(c.id, true); const cmts = await api.listInlineComments(wsAssignment.my_submission.id); setReviewComments(cmts || []); } catch {} }} style={{ fontSize: "0.6rem", color: "var(--color-success)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Resolve</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Phase 4.2: Suggestions */}
            {showReview && reviewSuggestions.length > 0 && (
              <div className="card" style={{ padding: "0.75rem" }}>
                <h3 style={{ fontSize: "0.775rem", fontWeight: 600, marginBottom: "0.5rem" }}>Suggestions ({reviewSuggestions.filter(s => s.status === "pending").length} pending)</h3>
                {reviewSuggestions.map((s) => (
                  <div key={s.id} style={{ background: "var(--bg-tertiary)", padding: "0.5rem", borderRadius: "var(--radius-sm)", marginBottom: "0.35rem", borderLeft: `3px solid ${s.status === "accepted" ? "var(--color-success)" : s.status === "rejected" ? "var(--color-error)" : "var(--color-warning)"}` }}>
                    {s.original_text && <div style={{ fontSize: "0.675rem", color: "var(--color-error)", textDecoration: "line-through" }}>{s.original_text}</div>}
                    {s.suggested_text && <div style={{ fontSize: "0.675rem", color: "var(--color-success)" }}>{s.suggested_text}</div>}
                    {s.explanation && <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontStyle: "italic" }}>{s.explanation}</div>}
                    {s.status === "pending" && (
                      <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                        <button className="btn-sm btn-primary" onClick={async () => { try { await api.respondToSuggestion(s.id, "accepted"); const suggs = await api.listSuggestions(wsAssignment.my_submission.id); setReviewSuggestions(suggs || []); } catch {} }} style={{ fontSize: "0.575rem", padding: "1px 5px" }}>Accept</button>
                        <button className="btn-sm btn-secondary" onClick={async () => { try { await api.respondToSuggestion(s.id, "rejected"); const suggs = await api.listSuggestions(wsAssignment.my_submission.id); setReviewSuggestions(suggs || []); } catch {} }} style={{ fontSize: "0.575rem", padding: "1px 5px" }}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Phase 4.2: Section Feedback */}
            {showReview && reviewSections.length > 0 && (
              <div className="card" style={{ padding: "0.75rem" }}>
                <h3 style={{ fontSize: "0.775rem", fontWeight: 600, marginBottom: "0.5rem" }}>Section Feedback</h3>
                {reviewSections.map((s) => (
                  <div key={s.id || s.section_name} style={{ background: "var(--bg-tertiary)", padding: "0.5rem", borderRadius: "var(--radius-sm)", marginBottom: "0.35rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.725rem", textTransform: "capitalize" }}>{s.section_name}</span>
                      {s.score != null && <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{s.score}/{s.max_score}</span>}
                    </div>
                    {s.comments && <div style={{ fontSize: "0.675rem", color: "var(--text-secondary)", marginTop: "2px" }}>{s.comments}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Full Instructions Modal */}
        {showInstructionsModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
            <div className="card animate-fade-in" style={{ width: "600px", maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: "1.5rem", background: "var(--bg-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Instructor Guidelines & Instructions</h3>
                <button className="btn-secondary btn-sm" onClick={() => setShowInstructionsModal(false)}>Close</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", fontSize: "0.9rem", lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                {wsAssignment.instructions}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─────────── Assignments List ─────────── */
  return (
    <div className="animate-fade-in" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
          Coursework & Assignments
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "4px 0 0 0" }}>
          Track upcoming deadlines, submit coursework, and view teacher feedback & grades
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.5rem" }}>
        {([
          { key: "all" as TabFilter, label: `All (${assignments.length})` },
          { key: "upcoming" as TabFilter, label: "Upcoming / Pending" },
          { key: "submitted" as TabFilter, label: "Submitted" },
          { key: "graded" as TabFilter, label: "Graded & Returned" },
        ]).map((t) => (
          <button
            key={t.key}
            className={`btn-sm ${tabFilter === t.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTabFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <SvgIcon name="folder" size={32} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>No coursework assignments found</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.825rem", marginTop: "4px" }}>
            Check back later for new assignments from your course instructors.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.25rem" }}>
          {filtered.map((item) => {
            const isSubmitted = item.my_submission && item.my_submission.status === "submitted";
            const isGraded = item.my_submission && item.my_submission.is_published;
            const isDraft = item.my_submission && item.my_submission.status === "draft";

            return (
              <div key={item.id} className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span className="badge badge-info" style={{ fontSize: "0.725rem" }}>
                      {item.course_title || "Coursework"}
                    </span>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {item.category && <span className="badge badge-secondary" style={{ fontSize: "0.65rem" }}>{item.category}</span>}
                      {isGraded ? (
                        <span className="badge badge-success" style={{ fontSize: "0.725rem" }}>
                          {item.my_submission.grade_marks}/{item.max_marks}
                        </span>
                      ) : isSubmitted ? (
                        <span className="badge badge-warning" style={{ fontSize: "0.725rem" }}>Submitted</span>
                      ) : isDraft ? (
                        <span className="badge badge-secondary" style={{ fontSize: "0.725rem" }}>Draft</span>
                      ) : (
                        <span className="badge badge-secondary" style={{ fontSize: "0.725rem" }}>Pending</span>
                      )}
                    </div>
                  </div>

                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.3rem 0", color: "var(--text-primary)" }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.description || "No description provided."}
                  </p>

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.725rem", color: "var(--text-muted)" }}>
                    {item.difficulty && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <SvgIcon name="bar-chart" size={12} /> {item.difficulty}
                      </span>
                    )}
                    {item.max_marks && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <SvgIcon name="award" size={12} /> {item.max_marks} pts
                      </span>
                    )}
                    {item.blooms_level && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        <SvgIcon name="cpu" size={12} /> {item.blooms_level}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem", marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <SvgIcon name="calendar" size={13} />
                    <span>Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : "No deadline"}</span>
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => openWorkspace(item)}
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                  >
                    {isGraded ? "View Feedback" : isSubmitted ? "View Submission" : isDraft ? "Continue Writing" : "Open Workspace"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
