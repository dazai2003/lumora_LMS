"use client";

import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";

/* ─── Types ─── */
type RightTab = "ai" | "sections" | "comments" | "rubric" | "versions";

interface SpeedGraderProps {
  assignment: any;
  submission: any;
  onGradeUpdate?: () => void;
  onClose?: () => void;
  studentSubmissions?: any[];
  onSelectSubmission?: (sub: any) => void;
}

const SECTIONS = ["Introduction", "Research", "Analysis", "Discussion", "Conclusion", "References"];

/* Panel width constants */
const PANEL_WIDTH = 400;
const RAIL_WIDTH = 44;

/* ─── Main Component ─── */
export default function SpeedGraderWorkspace({
  assignment,
  submission,
  onGradeUpdate,
  onClose,
  studentSubmissions = [],
  onSelectSubmission
}: SpeedGraderProps) {
  const { addToast } = useToast();

  /* State */
  const [gradeMarks, setGradeMarks] = useState(submission?.grade_marks?.toString() || "");
  const [feedbackText, setFeedbackText] = useState(submission?.feedback_text || "");
  const [rightTab, setRightTab] = useState<RightTab>("ai");
  const [isReaderFullScreen, setIsReaderFullScreen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // AI Review
  const [aiReview, setAiReview] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Comments
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [newSuggOriginal, setNewSuggOriginal] = useState("");
  const [newSuggText, setNewSuggText] = useState("");
  const [newSuggExplanation, setNewSuggExplanation] = useState("");

  // Section Feedback
  const [sectionFeedback, setSectionFeedback] = useState<any[]>(
    SECTIONS.map(s => ({ section_name: s.toLowerCase(), score: null, max_score: 10, comments: "", strengths: [], weaknesses: [] }))
  );

  // Versions
  const [versions, setVersions] = useState<any[]>([]);

  // Timeline
  const [timeline, setTimeline] = useState<any[]>([]);

  // AI Comment generator
  const [selectedText, setSelectedText] = useState("");
  const [aiCommentLoading, setAiCommentLoading] = useState(false);

  const [docViewMode, setDocViewMode] = useState<"both" | "rich_text" | "pdf_file">("both");
  const [viewerZoom, setViewerZoom] = useState(100);

  const docContainerRef = useRef<HTMLDivElement>(null);

  /* Load data */
  useEffect(() => {
    if (!submission?.submission_id) return;
    loadComments();
    loadSuggestions();
    loadVersions();
    loadSectionFeedback();
    loadTimeline();
  }, [submission?.submission_id]);

  /* Sync grade/feedback when submission changes */
  useEffect(() => {
    setGradeMarks(submission?.grade_marks?.toString() || "");
    setFeedbackText(submission?.feedback_text || "");
  }, [submission?.submission_id]);

  const loadComments = async () => {
    try { const res = await api.listInlineComments(submission.submission_id); setComments(res || []); } catch {}
  };
  const loadSuggestions = async () => {
    try { const res = await api.listSuggestions(submission.submission_id); setSuggestions(res || []); } catch {}
  };
  const loadVersions = async () => {
    try { const res = await api.listSubmissionVersions(submission.submission_id); setVersions(res || []); } catch {}
  };
  const loadSectionFeedback = async () => {
    try {
      const res = await api.getSectionFeedback(submission.submission_id);
      if (res && res.length > 0) {
        const merged = SECTIONS.map(s => {
          const existing = res.find((r: any) => r.section_name === s.toLowerCase());
          return existing || { section_name: s.toLowerCase(), score: null, max_score: 10, comments: "", strengths: [], weaknesses: [] };
        });
        setSectionFeedback(merged);
      }
    } catch {}
  };
  const loadTimeline = async () => {
    try { const res = await api.getSubmissionTimeline(submission.submission_id); setTimeline(res || []); } catch {}
  };

  /* AI Deep Review */
  const runAIReview = async () => {
    setAiLoading(true);
    try {
      const res = await api.aiDeepReview(submission.submission_id);
      setAiReview(res.review);
      if (res.review?.suggested_grade) setGradeMarks(res.review.suggested_grade.toString());
      addToast("AI review complete!", "success");
    } catch { addToast("AI review failed.", "error"); }
    finally { setAiLoading(false); }
  };

  /* AI Comment from selection */
  const handleAIComment = async (actionType: string) => {
    if (!selectedText.trim()) { addToast("Select text first.", "warning"); return; }
    setAiCommentLoading(true);
    try {
      const res = await api.aiCommentFromSelection(submission.submission_id, selectedText, actionType);
      if (actionType === "comment" && res.result?.comment) {
        setNewComment(res.result.comment);
      } else if (actionType === "suggestion" && res.result?.suggested) {
        setNewSuggOriginal(selectedText);
        setNewSuggText(res.result.suggested);
        setNewSuggExplanation(res.result.explanation || "");
      }
      addToast("AI generated!", "success");
    } catch { addToast("AI generation failed.", "error"); }
    finally { setAiCommentLoading(false); }
  };

  /* Comments CRUD */
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await api.createInlineComment(submission.submission_id, {
        comment_text: newComment,
        highlight_text: selectedText || null,
      });
      setNewComment("");
      setSelectedText("");
      loadComments();
      addToast("Comment added!", "success");
    } catch { addToast("Failed to add comment.", "error"); }
  };

  const handleReply = async (commentId: number) => {
    if (!replyText.trim()) return;
    try {
      await api.replyToComment(commentId, replyText);
      setReplyText("");
      setReplyingTo(null);
      loadComments();
    } catch { addToast("Reply failed.", "error"); }
  };

  const handleResolve = async (commentId: number, resolved: boolean) => {
    try {
      await api.resolveComment(commentId, resolved);
      loadComments();
    } catch { addToast("Failed.", "error"); }
  };

  /* Suggestions */
  const handleAddSuggestion = async () => {
    if (!newSuggText.trim()) return;
    try {
      await api.createSuggestion(submission.submission_id, {
        original_text: newSuggOriginal,
        suggested_text: newSuggText,
        explanation: newSuggExplanation,
      });
      setNewSuggOriginal(""); setNewSuggText(""); setNewSuggExplanation("");
      loadSuggestions();
      addToast("Suggestion added!", "success");
    } catch { addToast("Failed.", "error"); }
  };

  /* Section Feedback */
  const handleSaveSections = async () => {
    try {
      await api.saveSectionFeedback(submission.submission_id, sectionFeedback.map(s => ({
        section_name: s.section_name,
        score: s.score ? parseFloat(s.score) : null,
        max_score: s.max_score,
        comments: s.comments,
      })));
      addToast("Section feedback saved!", "success");
    } catch { addToast("Failed.", "error"); }
  };

  /* Grade */
  const handleSaveGrade = async (publish: boolean) => {
    try {
      await api.gradeAssignmentSubmission(submission.submission_id, {
        grade_marks: parseFloat(gradeMarks || "0"),
        feedback_text: feedbackText,
        is_published: publish,
      });
      addToast(publish ? "Grade published!" : "Draft saved!", "success");
      onGradeUpdate?.();
    } catch { addToast("Failed.", "error"); }
  };

  /* Text selection handler */
  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 2) {
      setSelectedText(sel.toString().trim());
    }
  };

  const subContent = submission?.submission_content_text || "";

  const currentIndex = studentSubmissions.findIndex((s) => s.submission_id === submission?.submission_id);
  const gradedCount = studentSubmissions.filter(s => s.status === "graded").length;

  const handlePublishAndNext = async () => {
    await handleSaveGrade(true);
    if (studentSubmissions.length > 0 && onSelectSubmission && currentIndex >= 0 && currentIndex < studentSubmissions.length - 1) {
      onSelectSubmission(studentSubmissions[currentIndex + 1]);
    }
  };

  /* Panel toggle handler — opens panel and selects tab */
  const handleRailTabClick = (tab: RightTab) => {
    if (isPanelOpen && rightTab === tab) {
      setIsPanelOpen(false);
    } else {
      setRightTab(tab);
      setIsPanelOpen(true);
    }
  };

  /* Tab definition for the vertical icon rail */
  const tabDefs: { key: RightTab; label: string; icon: "sparkles" | "bar-chart" | "message-circle" | "award" | "clock"; badge?: number }[] = [
    { key: "ai", label: "AI Review", icon: "sparkles" },
    { key: "sections", label: "Sections", icon: "bar-chart" },
    { key: "comments", label: "Comments", icon: "message-circle", badge: comments.length },
    { key: "rubric", label: "Grade", icon: "award" },
    { key: "versions", label: "History", icon: "clock" },
  ];

  /* ─── Render ─── */
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 64px)",
      overflow: "hidden",
      background: "var(--bg-primary)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-subtle)",
    }}>

      {/* ═══════════════════════════════════════════════════════════════
          TOP COMMAND BAR
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        padding: "0 16px",
        height: 48,
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        flexShrink: 0,
      }}>
        {/* Left: Back + Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
          {onClose && (
            <button
              className="btn-secondary btn-sm"
              onClick={onClose}
              style={{ fontSize: "0.7rem", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <SvgIcon name="arrow-left" size={12} /> Back
            </button>
          )}
          <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "5px", overflow: "hidden" }}>
            <span style={{ whiteSpace: "nowrap" }}>Coursework</span>
            <span style={{ opacity: 0.4 }}>/</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {assignment?.title}
            </span>
          </div>
        </div>

        {/* Center: Student Navigator */}
        {studentSubmissions.length > 0 && onSelectSubmission && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "var(--bg-tertiary)",
            padding: "4px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
          }}>
            <button
              disabled={currentIndex <= 0}
              onClick={() => onSelectSubmission(studentSubmissions[currentIndex - 1])}
              style={{
                border: "none", background: "transparent",
                cursor: currentIndex > 0 ? "pointer" : "default",
                opacity: currentIndex > 0 ? 1 : 0.3,
                display: "flex", alignItems: "center", padding: "2px",
              }}
            >
              <SvgIcon name="chevron-left" size={14} />
            </button>

            <select
              value={submission?.submission_id || ""}
              onChange={(e) => {
                const found = studentSubmissions.find((s) => s.submission_id.toString() === e.target.value);
                if (found) onSelectSubmission(found);
              }}
              style={{
                border: "none", background: "transparent",
                fontWeight: 600, fontSize: "0.75rem",
                color: "var(--text-primary)", cursor: "pointer", outline: "none",
                maxWidth: 200,
              }}
            >
              {studentSubmissions.map((s, i) => (
                <option key={s.submission_id || i} value={s.submission_id}>
                  {s.submitted_by_name || s.student_name} ({s.status})
                </option>
              ))}
            </select>

            <button
              disabled={currentIndex >= studentSubmissions.length - 1}
              onClick={() => onSelectSubmission(studentSubmissions[currentIndex + 1])}
              style={{
                border: "none", background: "transparent",
                cursor: currentIndex < studentSubmissions.length - 1 ? "pointer" : "default",
                opacity: currentIndex < studentSubmissions.length - 1 ? 1 : 0.3,
                display: "flex", alignItems: "center", padding: "2px",
              }}
            >
              <SvgIcon name="chevron-right" size={14} />
            </button>

            <div style={{
              width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px",
            }} />

            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {currentIndex + 1} of {studentSubmissions.length}
            </span>
            <span style={{ fontSize: "0.6rem", color: "var(--color-success)", whiteSpace: "nowrap" }}>
              ({gradedCount} graded)
            </span>
          </div>
        )}

        {/* Right: Actions */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <button className="btn-secondary btn-sm" onClick={() => handleSaveGrade(false)} style={{ fontSize: "0.7rem" }}>
            Save Draft
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handlePublishAndNext}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.7rem" }}
          >
            Publish & Next <SvgIcon name="arrow-right" size={12} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MAIN CONTENT: Document + Retractable Panel
         ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ─── DOCUMENT VIEWER (takes remaining space) ─── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          {/* Document Toolbar */}
          <div style={{
            padding: "6px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-tertiary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            minHeight: 40,
          }}>
            {/* Left: Student info */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "var(--accent-primary)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
              }}>
                {(submission?.submitted_by_name || submission?.student_name || "S").substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                  {submission?.submitted_by_name || submission?.student_name || "Student Submission"}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center" }}>
                  {submission?.submitted_at && (
                    <span>
                      {new Date(submission.submitted_at).toLocaleDateString()} at {new Date(submission.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {submission?.word_count != null && <span>{submission.word_count} words</span>}
                  {submission?.is_late && <span style={{ color: "var(--color-error)", fontWeight: 600 }}>LATE</span>}
                </div>
              </div>
            </div>

            {/* Right: View controls */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {/* AI selection tools */}
              {selectedText && (
                <div style={{ display: "flex", gap: "3px", marginRight: "6px" }}>
                  <button className="btn-sm btn-secondary" onClick={() => handleAIComment("comment")} disabled={aiCommentLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.625rem", padding: "2px 6px" }}>
                    <SvgIcon name="message-circle" size={11} /> AI Comment
                  </button>
                  <button className="btn-sm btn-secondary" onClick={() => handleAIComment("suggestion")} disabled={aiCommentLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.625rem", padding: "2px 6px" }}>
                    <SvgIcon name="edit" size={11} /> AI Suggest
                  </button>
                </div>
              )}

              {/* Document view toggle */}
              {subContent && submission?.files?.length > 0 && (
                <div style={{ display: "flex", gap: "1px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                  {[
                    { key: "both", label: "Both" },
                    { key: "rich_text", label: "Text" },
                    { key: "pdf_file", label: "File" },
                  ].map(v => (
                    <button
                      key={v.key}
                      onClick={() => setDocViewMode(v.key as typeof docViewMode)}
                      style={{
                        padding: "3px 8px", border: "none", fontSize: "0.625rem", cursor: "pointer",
                        background: docViewMode === v.key ? "var(--accent-primary)" : "transparent",
                        color: docViewMode === v.key ? "#fff" : "var(--text-muted)",
                        fontWeight: docViewMode === v.key ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Zoom */}
              <div style={{
                display: "flex", alignItems: "center", gap: "2px",
                background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)",
                padding: "2px 6px", border: "1px solid var(--border-subtle)",
              }}>
                <button onClick={() => setViewerZoom(Math.max(60, viewerZoom - 10))} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 700, padding: "0 2px" }}>-</button>
                <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", minWidth: 28, textAlign: "center" }}>{viewerZoom}%</span>
                <button onClick={() => setViewerZoom(Math.min(180, viewerZoom + 10))} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 700, padding: "0 2px" }}>+</button>
              </div>

              {/* Full Screen Toggle */}
              <button
                className="btn-secondary btn-sm"
                onClick={() => { setIsReaderFullScreen(!isReaderFullScreen); if (!isReaderFullScreen) setIsPanelOpen(false); }}
                style={{ fontSize: "0.65rem", display: "inline-flex", alignItems: "center", gap: "3px", padding: "3px 8px" }}
                title={isReaderFullScreen ? "Exit Focus Mode" : "Focus Mode"}
              >
                <SvgIcon name={isReaderFullScreen ? "minimize" : "maximize"} size={12} />
                {isReaderFullScreen ? "Exit Focus" : "Focus"}
              </button>
            </div>
          </div>

          {/* Document Canvas */}
          <div
            ref={docContainerRef}
            style={{ flex: 1, overflowY: "auto", background: "var(--bg-tertiary)", padding: "24px 16px" }}
            onMouseUp={handleTextSelection}
          >
            <div style={{
              maxWidth: `${Math.min(1100, Math.round(860 * viewerZoom / 100))}px`,
              width: "100%",
              margin: "0 auto",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
              padding: `${Math.round(48 * viewerZoom / 100)}px ${Math.round(56 * viewerZoom / 100)}px`,
              minHeight: "700px",
              transition: "max-width 0.25s ease, padding 0.25s ease",
            }}>
              {/* Submitter Metadata Banner */}
              <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                      {submission?.submitted_by_name || submission?.student_name || "Student Submission"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <span>Submitted: <strong>{submission?.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() + " at " + new Date(submission.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Record on file"}</strong></span>
                      {submission?.is_late && <span className="badge badge-error" style={{ fontSize: "0.65rem" }}>LATE SUBMISSION</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                    {submission?.word_count != null && (
                      <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                        {submission.word_count} words
                      </span>
                    )}
                    {submission?.files?.length > 0 && (
                      <span className="badge badge-info" style={{ fontSize: "0.7rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <SvgIcon name="paperclip" size={12} /> {submission.files.length} attached file(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Tagged Teammates */}
                {submission?.group_members && submission.group_members.length > 0 && (
                  <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontSize: "0.725rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <SvgIcon name="users" size={14} style={{ color: "var(--accent-primary)" }} />
                    <span>Group Teammates: <strong>{submission.group_members.map((m: any) => m.full_name).join(", ")}</strong></span>
                  </div>
                )}
              </div>

              {/* Rich Text Document Content */}
              {(docViewMode === "rich_text" || docViewMode === "both") && subContent && (
                <div style={{ marginBottom: docViewMode === "both" && submission?.files?.length > 0 ? "2rem" : 0 }}>
                  <div
                    style={{
                      fontSize: `${Math.max(0.85, 0.95 * viewerZoom / 100)}rem`,
                      lineHeight: 1.85,
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      color: "var(--text-primary)",
                      wordBreak: "break-word"
                    }}
                    dangerouslySetInnerHTML={{ __html: subContent }}
                  />
                </div>
              )}

              {/* Attached PDF / File section */}
              {(docViewMode === "pdf_file" || docViewMode === "both") && submission?.files?.length > 0 && (
                <div style={{ marginTop: docViewMode === "both" && subContent ? "1.5rem" : 0, borderTop: docViewMode === "both" && subContent ? "2px dashed var(--border-subtle)" : "none", paddingTop: docViewMode === "both" && subContent ? "1.5rem" : 0 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="paperclip" size={16} style={{ color: "var(--accent-primary)" }} /> Attached File Submission
                  </div>
                  {submission.files.map((f: any, i: number) => {
                    const isPdf = f.file_name?.toLowerCase().endsWith(".pdf");
                    return (
                      <div key={f.id || i} style={{ marginBottom: "1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          <span>File: <strong>{f.file_name}</strong></span>
                          <a href={`http://localhost:8000/${f.file_path}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ fontSize: "0.7rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            Open File <SvgIcon name="link" size={12} />
                          </a>
                        </div>
                        {isPdf ? (
                          <iframe
                            src={`http://localhost:8000/${f.file_path}`}
                            title={f.file_name}
                            style={{ width: "100%", height: "650px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "#fff" }}
                          />
                        ) : (
                          <div style={{ padding: "1.5rem", background: "var(--bg-tertiary)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                            <SvgIcon name="file-text" size={32} style={{ opacity: 0.5, marginBottom: "0.5rem" }} />
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>File attached: {f.file_name}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fallback empty */}
              {!subContent && (!submission?.files || submission.files.length === 0) && (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  <SvgIcon name="file-text" size={36} style={{ opacity: 0.5, marginBottom: "0.5rem" }} />
                  <p style={{ fontSize: "0.85rem" }}>No inline content or files attached to this submission.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── RETRACTABLE RIGHT PANEL ─── */}
        {!isReaderFullScreen && (
          <div style={{
            display: "flex",
            flexShrink: 0,
            borderLeft: "1px solid var(--border-subtle)",
            height: "100%",
            transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            width: isPanelOpen ? PANEL_WIDTH : RAIL_WIDTH,
            overflow: "hidden",
          }}>

            {/* Icon Rail — always visible */}
            <div style={{
              width: RAIL_WIDTH,
              flexShrink: 0,
              background: "var(--bg-card)",
              borderRight: isPanelOpen ? "1px solid var(--border-subtle)" : "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: "8px",
              gap: "2px",
            }}>
              {/* Panel toggle button */}
              <button
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                title={isPanelOpen ? "Collapse Panel" : "Expand Panel"}
                style={{
                  width: 32, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", background: "transparent", cursor: "pointer",
                  color: "var(--text-muted)", borderRadius: "var(--radius-sm)",
                  marginBottom: "6px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-tertiary)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <SvgIcon name={isPanelOpen ? "chevron-right" : "chevron-left"} size={14} />
              </button>

              {/* Tab icons */}
              {tabDefs.map(t => (
                <button
                  key={t.key}
                  onClick={() => handleRailTabClick(t.key)}
                  title={t.label}
                  style={{
                    width: 34, height: 34,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none",
                    background: (isPanelOpen && rightTab === t.key) ? "var(--bg-tertiary)" : "transparent",
                    cursor: "pointer",
                    color: (isPanelOpen && rightTab === t.key) ? "var(--accent-primary)" : "var(--text-muted)",
                    borderRadius: "var(--radius-sm)",
                    position: "relative",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (!(isPanelOpen && rightTab === t.key)) e.currentTarget.style.background = "var(--bg-tertiary)"; }}
                  onMouseLeave={e => { if (!(isPanelOpen && rightTab === t.key)) e.currentTarget.style.background = "transparent"; }}
                >
                  <SvgIcon name={t.icon} size={16} />
                  {/* Badge for comments count */}
                  {t.badge != null && t.badge > 0 && (
                    <span style={{
                      position: "absolute", top: 2, right: 2,
                      width: 14, height: 14, borderRadius: "50%",
                      background: "var(--accent-primary)", color: "#fff",
                      fontSize: "0.5rem", fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {t.badge > 9 ? "9+" : t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Panel Content — slides in/out */}
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              opacity: isPanelOpen ? 1 : 0,
              transition: "opacity 0.2s ease 0.05s",
              pointerEvents: isPanelOpen ? "auto" : "none",
            }}>
              {/* Panel Header */}
              <div style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
                minHeight: 40,
              }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {tabDefs.find(t => t.key === rightTab)?.label || "Panel"}
                </span>
                <button
                  onClick={() => setIsPanelOpen(false)}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    color: "var(--text-muted)", display: "flex", alignItems: "center",
                    padding: "2px", borderRadius: "var(--radius-sm)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-tertiary)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <SvgIcon name="x" size={14} />
                </button>
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

                {/* ─── AI Review Tab ─── */}
                {rightTab === "ai" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <button className="btn-primary btn-sm" onClick={runAIReview} disabled={aiLoading} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <SvgIcon name="sparkles" size={14} />
                      {aiLoading ? "Analyzing Document..." : "Run AI Deep Review"}
                    </button>

                    {aiReview ? (
                      <>
                        {/* Summary */}
                        <div style={{ background: "var(--bg-tertiary)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.775rem", marginBottom: "0.35rem" }}>Document Summary</div>
                          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{aiReview.summary}</p>
                        </div>

                        {/* Writing Quality */}
                        {aiReview.writing_quality && (
                          <div style={{ background: "var(--bg-tertiary)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.775rem", marginBottom: "0.5rem" }}>Writing Quality</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                              {[
                                { label: "Grammar", val: aiReview.writing_quality.grammar_score },
                                { label: "Clarity", val: aiReview.writing_quality.clarity_score },
                                { label: "Academic Tone", val: aiReview.writing_quality.academic_tone_score },
                              ].map((m) => (
                                <div key={m.label} style={{ textAlign: "center" }}>
                                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: (m.val || 0) >= 7 ? "var(--color-success)" : (m.val || 0) >= 5 ? "var(--color-warning)" : "var(--color-error)" }}>
                                    {m.val}/10
                                  </div>
                                  <div style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{m.label}</div>
                                </div>
                              ))}
                            </div>
                            {aiReview.writing_quality.issues?.length > 0 && (
                              <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--color-warning)" }}>
                                {aiReview.writing_quality.issues.map((i: string, idx: number) => <div key={idx}>[Warning] {i}</div>)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Structure */}
                        {aiReview.structure && (
                          <div style={{ background: "var(--bg-tertiary)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.775rem", marginBottom: "0.35rem" }}>Structure</div>
                            <div style={{ display: "flex", gap: "1rem", fontSize: "0.7rem" }}>
                              <span>Intro: {aiReview.structure.has_introduction ? "Present" : "Missing"}</span>
                              <span>Conclusion: {aiReview.structure.has_conclusion ? "Present" : "Missing"}</span>
                              <span>Organization: {aiReview.structure.organization_score}/10</span>
                            </div>
                          </div>
                        )}

                        {/* Strengths / Weaknesses */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                          <div style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--color-success)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.7rem", marginBottom: "0.25rem", color: "var(--color-success)" }}>Strengths</div>
                            {(aiReview.strengths || []).map((s: string, i: number) => <div key={i} style={{ fontSize: "0.675rem", color: "var(--text-muted)", marginBottom: "2px" }}>- {s}</div>)}
                          </div>
                          <div style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--color-error)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.7rem", marginBottom: "0.25rem", color: "var(--color-error)" }}>Weaknesses</div>
                            {(aiReview.weaknesses || []).map((w: string, i: number) => <div key={i} style={{ fontSize: "0.675rem", color: "var(--text-muted)", marginBottom: "2px" }}>- {w}</div>)}
                          </div>
                        </div>

                        {/* Suggested Grade */}
                        <div style={{ background: "var(--bg-tertiary)", padding: "0.75rem", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>AI Suggested Grade</div>
                          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                            {aiReview.suggested_grade} / {assignment?.max_marks || 100}
                          </div>
                          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Confidence: {Math.round((aiReview.confidence_score || 0) * 100)}%</div>
                        </div>

                        {/* Suggested Feedback */}
                        {aiReview.suggested_feedback && (
                          <div style={{ background: "var(--bg-tertiary)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.725rem", marginBottom: "0.25rem" }}>Suggested Feedback</div>
                            <p style={{ fontSize: "0.725rem", color: "var(--text-muted)", margin: 0 }}>{aiReview.suggested_feedback}</p>
                            <button className="btn-sm btn-secondary" onClick={() => setFeedbackText(aiReview.suggested_feedback)} style={{ marginTop: "0.4rem", fontSize: "0.65rem" }}>Use as Feedback</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        Run AI Deep Review for comprehensive document analysis including writing quality, structure, and suggested grade.
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Section Feedback Tab ─── */}
                {rightTab === "sections" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ fontSize: "0.775rem", fontWeight: 600, marginBottom: "0.25rem" }}>Section-Based Evaluation</div>
                    {sectionFeedback.map((sec, idx) => (
                      <div key={sec.section_name} style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.75rem", textTransform: "capitalize" }}>{sec.section_name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <input
                              type="number"
                              value={sec.score ?? ""}
                              onChange={(e) => {
                                const updated = [...sectionFeedback];
                                updated[idx] = { ...sec, score: e.target.value };
                                setSectionFeedback(updated);
                              }}
                              placeholder="0"
                              style={{ width: 40, padding: "2px 4px", border: "1px solid var(--border-subtle)", borderRadius: 3, fontSize: "0.725rem", textAlign: "center", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                            />
                            <span style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>/ {sec.max_score}</span>
                          </div>
                        </div>
                        <textarea
                          value={sec.comments}
                          onChange={(e) => {
                            const updated = [...sectionFeedback];
                            updated[idx] = { ...sec, comments: e.target.value };
                            setSectionFeedback(updated);
                          }}
                          placeholder={`Feedback for ${sec.section_name}...`}
                          rows={2}
                          style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.725rem", resize: "none", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                        />
                      </div>
                    ))}
                    <button className="btn-primary btn-sm" onClick={handleSaveSections} style={{ width: "100%", marginTop: "0.5rem" }}>
                      Save Section Feedback
                    </button>
                  </div>
                )}

                {/* ─── Comments & Suggestions Tab ─── */}
                {rightTab === "comments" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {/* Add comment */}
                    <div style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.725rem", fontWeight: 600, marginBottom: "0.3rem" }}>Add Inline Comment</div>
                      {selectedText && (
                        <div style={{ fontSize: "0.675rem", color: "var(--accent-primary)", marginBottom: "0.25rem", fontStyle: "italic" }}>
                          &quot;{selectedText.substring(0, 80)}{selectedText.length > 80 ? "..." : ""}&quot;
                        </div>
                      )}
                      <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write your comment..." rows={2}
                        style={{ width: "100%", padding: "4px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.725rem", resize: "none", marginBottom: "0.35rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                      <button className="btn-primary btn-sm" onClick={handleAddComment} style={{ fontSize: "0.675rem", width: "100%" }}>Add Comment</button>
                    </div>

                    {/* Add suggestion */}
                    <div style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.725rem", fontWeight: 600, marginBottom: "0.3rem" }}>Add Suggestion (Track Change)</div>
                      <input value={newSuggOriginal} onChange={(e) => setNewSuggOriginal(e.target.value)} placeholder="Original text..." style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.7rem", marginBottom: "0.25rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                      <input value={newSuggText} onChange={(e) => setNewSuggText(e.target.value)} placeholder="Suggested replacement..." style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.7rem", marginBottom: "0.25rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                      <input value={newSuggExplanation} onChange={(e) => setNewSuggExplanation(e.target.value)} placeholder="Explanation..." style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.7rem", marginBottom: "0.35rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                      <button className="btn-secondary btn-sm" onClick={handleAddSuggestion} style={{ fontSize: "0.675rem", width: "100%" }}>Add Suggestion</button>
                    </div>

                    {/* Comments list */}
                    <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                      Comments ({comments.length})
                    </div>
                    {comments.length === 0 ? (
                      <p style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>No comments yet.</p>
                    ) : comments.map((c) => (
                      <div key={c.id} style={{
                        background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)",
                        borderLeft: `3px solid ${c.is_resolved ? "var(--color-success)" : "var(--accent-primary)"}`,
                        opacity: c.is_resolved ? 0.7 : 1,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.7rem" }}>{c.author_name}</span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {c.is_resolved ? (
                              <button className="btn-sm" onClick={() => handleResolve(c.id, false)} style={{ fontSize: "0.6rem", padding: "1px 4px", border: "1px solid var(--border-subtle)", borderRadius: 3, background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>Reopen</button>
                            ) : (
                              <button className="btn-sm" onClick={() => handleResolve(c.id, true)} style={{ fontSize: "0.6rem", padding: "1px 6px", border: "1px solid var(--color-success)", borderRadius: 3, background: "transparent", color: "var(--color-success)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}><SvgIcon name="check" size={10} /> Resolve</button>
                            )}
                          </div>
                        </div>
                        {c.highlight_text && (
                          <div style={{ fontSize: "0.65rem", color: "var(--accent-primary)", fontStyle: "italic", margin: "2px 0" }}>
                            &quot;{c.highlight_text.substring(0, 60)}...&quot;
                          </div>
                        )}
                        <div style={{ fontSize: "0.725rem", color: "var(--text-secondary)", margin: "4px 0" }}>{c.comment_text}</div>
                        <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{new Date(c.created_at).toLocaleString()}</div>

                        {/* Replies */}
                        {c.replies?.map((r: any) => (
                          <div key={r.id} style={{ marginLeft: "12px", marginTop: "6px", paddingLeft: "8px", borderLeft: "2px solid var(--border-subtle)" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.65rem" }}>{r.author_name}</span>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{r.comment_text}</div>
                          </div>
                        ))}

                        {/* Reply input */}
                        {replyingTo === c.id ? (
                          <div style={{ marginTop: "6px", display: "flex", gap: "4px" }}>
                            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Reply..." style={{ flex: 1, padding: "2px 6px", border: "1px solid var(--border-subtle)", borderRadius: 3, fontSize: "0.675rem", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                            <button className="btn-sm btn-primary" onClick={() => handleReply(c.id)} style={{ fontSize: "0.6rem", padding: "2px 6px" }}>Send</button>
                            <button className="btn-sm btn-secondary" onClick={() => setReplyingTo(null)} style={{ fontSize: "0.6rem", padding: "2px 6px", display: "inline-flex", alignItems: "center" }}><SvgIcon name="x" size={10} /></button>
                          </div>
                        ) : (
                          <button onClick={() => setReplyingTo(c.id)} style={{ fontSize: "0.625rem", color: "var(--accent-primary)", background: "transparent", border: "none", cursor: "pointer", marginTop: "4px", padding: 0 }}>Reply</button>
                        )}
                      </div>
                    ))}

                    {/* Suggestions list */}
                    {suggestions.length > 0 && (
                      <>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, marginTop: "0.5rem" }}>Suggestions ({suggestions.length})</div>
                        {suggestions.map((s) => (
                          <div key={s.id} style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${s.status === "accepted" ? "var(--color-success)" : s.status === "rejected" ? "var(--color-error)" : "var(--color-warning)"}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontWeight: 600, fontSize: "0.7rem" }}>{s.author_name}</span>
                              <span className={`badge ${s.status === "accepted" ? "badge-success" : s.status === "rejected" ? "badge-error" : "badge-warning"}`} style={{ fontSize: "0.575rem" }}>{s.status}</span>
                            </div>
                            {s.original_text && <div style={{ fontSize: "0.7rem", color: "var(--color-error)", textDecoration: "line-through", margin: "3px 0" }}>{s.original_text}</div>}
                            {s.suggested_text && <div style={{ fontSize: "0.7rem", color: "var(--color-success)", margin: "3px 0" }}>{s.suggested_text}</div>}
                            {s.explanation && <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontStyle: "italic" }}>{s.explanation}</div>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* ─── Grade & Rubric Tab ─── */}
                {rightTab === "rubric" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Overall Grade & Feedback</div>

                    {/* Grade input */}
                    <div style={{ background: "var(--bg-tertiary)", padding: "1rem", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                      <label style={{ fontSize: "0.725rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>Grade</label>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                        <input
                          type="number"
                          value={gradeMarks}
                          onChange={(e) => setGradeMarks(e.target.value)}
                          style={{ width: 80, padding: "6px", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: "1.2rem", fontWeight: 700, textAlign: "center", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                        />
                        <span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/ {assignment?.max_marks || 100}</span>
                      </div>
                    </div>

                    {/* Feedback */}
                    <div>
                      <label style={{ fontSize: "0.725rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Overall Feedback</label>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Write constructive feedback for the student..."
                        rows={5}
                        style={{ width: "100%", padding: "8px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", lineHeight: 1.5, resize: "vertical", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                      />
                    </div>

                    {/* Submission metadata */}
                    <div style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontSize: "0.725rem", fontWeight: 600, marginBottom: "0.35rem" }}>Submission Info</div>
                      <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span>Mode: {submission?.submission_mode || "file"}</span>
                        <span>Words: {submission?.word_count || 0}</span>
                        <span>Submitted: {submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "---"}</span>
                        <span>Status: {submission?.status}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn-secondary" onClick={() => handleSaveGrade(false)} style={{ flex: 1 }}>Save Draft</button>
                      <button className="btn-primary" onClick={() => handleSaveGrade(true)} style={{ flex: 1 }}>Publish Grade</button>
                    </div>
                  </div>
                )}

                {/* ─── Version History Tab ─── */}
                {rightTab === "versions" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>Revision History</div>

                    {versions.length === 0 ? (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No version snapshots yet.</p>
                    ) : versions.map((v) => (
                      <div key={v.id} style={{ background: "var(--bg-tertiary)", padding: "0.6rem", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent-primary)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.775rem" }}>Version {v.version_number}</span>
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{v.word_count || 0} words</span>
                        </div>
                        <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>
                          {v.submitted_at ? new Date(v.submitted_at).toLocaleString() : new Date(v.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}

                    {/* Timeline */}
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, marginTop: "0.5rem" }}>Timeline</div>
                    {timeline.length === 0 ? (
                      <p style={{ fontSize: "0.725rem", color: "var(--text-muted)" }}>No events.</p>
                    ) : timeline.map((e) => (
                      <div key={e.id} style={{ display: "flex", gap: "8px", fontSize: "0.7rem" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-primary)", marginTop: "6px", flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{e.action}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>{e.changed_by} -- {new Date(e.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
