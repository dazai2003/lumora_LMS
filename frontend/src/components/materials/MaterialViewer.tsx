"use client";

/**
 * Lumora Unified Learning Material Viewer & Telemetry Engine.
 * 
 * Interactive reader supporting Videos (MP4/H.264), PDF Documents (PyMuPDF/iframe),
 * Markdown Notes, and High-Resolution Scientific Diagrams.
 * 
 * Key Design Decisions & Notes:
 * 1. Video Telemetry & Precise Timestamp Resumption:
 *    - `hasResumedRef` ensures resume seek happens only once after metadata is loaded to avoid race conditions.
 *    - Throttles sync to database every 4 seconds during active playback.
 *    - Automatically marks video complete when student watches >= 85% of total duration.
 * 2. PDF Page Resumption & Hash Anchoring:
 *    - Appends `#page=${currentPage}` to the iframe URL to jump directly to saved page coordinates.
 *    - Bookmark action allows students to save exact page numbers instantly.
 * 3. Formative Difficulty Hotspots:
 *    - Students can raise difficulty flags at specific video timestamps or PDF pages.
 *    - Aggregated in real time to populate the Teacher Analytics Material Friction Heatmap.
 */

import React, { useState, useEffect, useRef } from "react";
import api, { Material, MaterialNote, MaterialFlag, StudentMaterialProgress } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import { useToast } from "@/components/ui/Toast";
import ReactMarkdown from "react-markdown";

interface MaterialViewerProps {
  material: Material;
  onClose?: () => void;
  onProgressUpdate?: (progress: StudentMaterialProgress) => void;
}

export default function MaterialViewer({ material, onClose, onProgressUpdate }: MaterialViewerProps) {
  const { user } = useAuth();
  const apiUrlStr = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  const serverBaseUrl = apiUrlStr.endsWith("/api") 
    ? apiUrlStr.slice(0, -4) 
    : apiUrlStr;
    
  let relativePath = material.file_path || "";
  if (relativePath.includes("uploads")) {
    relativePath = relativePath.substring(relativePath.indexOf("uploads")).replace(/\\/g, "/");
  } else if (relativePath.startsWith("/")) {
    relativePath = relativePath.substring(1);
  }
  
  const fileUrl = relativePath ? `${serverBaseUrl}/${relativePath}` : "";

  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(material.material_type !== "note");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Resume & Progress State
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfPageInput, setPdfPageInput] = useState<string>("1");
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const hasResumedRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const progressRef = useRef<StudentMaterialProgress | null>(null);

  useEffect(() => {
    if (isFullscreen) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isFullscreen]);

  // Advanced Analytics & Support State
  const [activeTab, setActiveTab] = useState<"summary" | "notes" | "flags">("summary");
  const [notes, setNotes] = useState<MaterialNote[]>([]);
  const [flags, setFlags] = useState<MaterialFlag[]>([]);
  const [progress, setProgress] = useState<StudentMaterialProgress | null>(null);
  const [summaryStyle, setSummaryStyle] = useState<"paragraph" | "point_form" | "story_mode">("paragraph");
  const [summariesByStyle, setSummariesByStyle] = useState<{ paragraph?: string; point_form?: string; story_mode?: string }>({});
  const [summarizing, setSummarizing] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newNoteContext, setNewNoteContext] = useState("");

  // Keep progressRef in sync for cleanup hooks
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Enhanced Flagging State
  const [videoFlagMode, setVideoFlagMode] = useState<"current" | "range" | "full">("current");
  const [videoRangeStart, setVideoRangeStart] = useState("00:00");
  const [videoRangeEnd, setVideoRangeEnd] = useState("05:00");
  const [pdfFlagMode, setPdfFlagMode] = useState<"current" | "range" | "full">("current");
  const [pdfPage, setPdfPage] = useState("1");
  const [pdfRangeStart, setPdfRangeStart] = useState("1");
  const [pdfRangeEnd, setPdfRangeEnd] = useState("3");
  const [flagCategory, setFlagCategory] = useState<string>("unclear_explanation");
  const [newFlag, setNewFlag] = useState("");
  const [submittingFlag, setSubmittingFlag] = useState(false);
  const [flagSuccessMsg, setFlagSuccessMsg] = useState<string | null>(null);
  const [flagErrorMsg, setFlagErrorMsg] = useState<string | null>(null);

  // Transcript Edit State
  const { addToast } = useToast();
  const [showTranscriptEdit, setShowTranscriptEdit] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);

  const handleSaveTranscript = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTranscript(true);
    try {
      await api.updateMaterialTranscript(material.id, editingTranscript);
      material.extracted_text = editingTranscript;
      addToast("Transcript updated & AI vector embeddings re-indexed!", "success");
      setShowTranscriptEdit(false);
    } catch (err) {
      console.error(err);
      addToast("Failed to update transcript.", "error");
    } finally {
      setSavingTranscript(false);
    }
  };

  // Immediate Video Progress Saver
  const saveVideoProgress = (forceCompleted?: boolean) => {
    if (!videoRef.current || user?.role !== "student") return;
    const time = videoRef.current.currentTime;
    const duration = videoRef.current.duration;
    if (isNaN(time) || time < 0) return;

    const currentCompleted = progressRef.current?.is_completed || false;
    const isCompleted = forceCompleted ?? (currentCompleted || (duration > 0 && time / duration >= 0.85));
    const pos = Math.floor(time);
    lastSaveTimeRef.current = time;

    api.updateMaterialProgress(material.id, {
      last_position: pos,
      is_completed: isCompleted
    }).then(res => {
      setProgress(res);
      onProgressUpdate?.(res);
    }).catch(console.error);
  };

  // Immediate Save on Window BeforeUnload or Component Unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (material.material_type === "video" && videoRef.current && user?.role === "student") {
        const time = Math.floor(videoRef.current.currentTime || 0);
        if (time > 0) {
          api.updateMaterialProgress(material.id, {
            last_position: time,
            is_completed: progressRef.current?.is_completed || false
          }).catch(console.error);
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (material.material_type === "video" && videoRef.current && user?.role === "student") {
        const time = Math.floor(videoRef.current.currentTime || 0);
        if (time > 0) {
          api.updateMaterialProgress(material.id, {
            last_position: time,
            is_completed: progressRef.current?.is_completed || false
          }).catch(console.error);
        }
      }
    };
  }, [material.id, material.material_type, user?.role]);

  // Initial Data Fetch & Resume Setup
  useEffect(() => {
    hasResumedRef.current = false;
    setResumeNotice(null);

    if (user?.role === "student") {
      api.getMaterialNotes(material.id).then(setNotes).catch(console.error);
      api.getMaterialFlags(material.id).then(setFlags).catch(console.error);
      api.getMaterialProgress(material.id).then((p) => {
        setProgress(p);
        onProgressUpdate?.(p);

        // Resume PDF position
        if (material.material_type === "pdf") {
          const startPage = Math.max(1, Math.round(p.last_position || 1));
          setPdfCurrentPage(startPage);
          setPdfPageInput(String(startPage));
          if (startPage > 1) {
            setResumeNotice(`Resumed at Page ${startPage}`);
            setTimeout(() => setResumeNotice(null), 6000);
          }
        }

        // Resume Video position if element is already ready
        if (material.material_type === "video" && p.last_position > 0 && videoRef.current) {
          if (videoRef.current.readyState >= 1) {
            videoRef.current.currentTime = p.last_position;
            hasResumedRef.current = true;
            const mins = Math.floor(p.last_position / 60).toString().padStart(2, '0');
            const secs = Math.floor(p.last_position % 60).toString().padStart(2, '0');
            setResumeNotice(`Resumed from ${mins}:${secs}`);
            setTimeout(() => setResumeNotice(null), 6000);
          }
        }
      }).catch(console.error);

      if (material.material_type === "note") {
        const timeoutId = setTimeout(() => {
          api.updateMaterialProgress(material.id, { last_position: 1, is_completed: true })
            .then((res) => {
              setProgress(res);
              onProgressUpdate?.(res);
            }).catch(console.error);
        }, 10000);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [material.id, user?.role, material.material_type]);

  // Video Resume Seeking Helper
  const tryResumeVideo = () => {
    if (!videoRef.current || !progress || hasResumedRef.current) return;
    if (progress.last_position > 0) {
      videoRef.current.currentTime = progress.last_position;
      hasResumedRef.current = true;
      const mins = Math.floor(progress.last_position / 60).toString().padStart(2, '0');
      const secs = Math.floor(progress.last_position % 60).toString().padStart(2, '0');
      setResumeNotice(`Resumed from ${mins}:${secs}`);
      setTimeout(() => setResumeNotice(null), 6000);
    }
  };

  const handleVideoLoadedMetadata = () => {
    tryResumeVideo();
  };

  const handleVideoCanPlay = () => {
    tryResumeVideo();
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || user?.role !== "student") return;
    const time = videoRef.current.currentTime;
    const duration = videoRef.current.duration;

    if (Math.abs(time - lastSaveTimeRef.current) > 4) {
      lastSaveTimeRef.current = time;
      const currentCompleted = progressRef.current?.is_completed || false;
      const isCompleted = currentCompleted || (duration > 0 && time / duration >= 0.85);
      api.updateMaterialProgress(material.id, {
        last_position: Math.floor(time),
        is_completed: isCompleted
      }).then(res => {
        setProgress(res);
        onProgressUpdate?.(res);
      }).catch(console.error);
    }
  };

  // PDF Page Navigation & Bookmark Handlers
  const handlePdfPageChange = (newPage: number) => {
    const validPage = Math.max(1, newPage);
    setPdfCurrentPage(validPage);
    setPdfPageInput(String(validPage));
    if (user?.role === "student") {
      api.updateMaterialProgress(material.id, {
        last_position: validPage,
        is_completed: progress?.is_completed || false
      }).then(res => {
        setProgress(res);
        onProgressUpdate?.(res);
      }).catch(console.error);
    }
  };

  const handleSavePdfBookmark = async (pageToSave: number) => {
    if (user?.role !== "student") return;
    try {
      const res = await api.updateMaterialProgress(material.id, {
        last_position: pageToSave,
        is_completed: progress?.is_completed || false
      });
      setProgress(res);
      onProgressUpdate?.(res);
      addToast(`Bookmarked at Page ${pageToSave}!`, "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to save bookmark", "error");
    }
  };

  // Toggle Completion Status (Mark as Completed / In Progress)
  const handleToggleCompletion = async () => {
    if (user?.role !== "student") return;
    setIsCompleting(true);
    const targetCompleted = !progress?.is_completed;
    let pos = progress?.last_position || 0;
    if (material.material_type === "video" && videoRef.current) {
      pos = Math.floor(videoRef.current.currentTime || pos);
    } else if (material.material_type === "pdf") {
      pos = pdfCurrentPage;
    }
    try {
      const res = await api.updateMaterialProgress(material.id, {
        last_position: pos,
        is_completed: targetCompleted
      });
      setProgress(res);
      onProgressUpdate?.(res);
      addToast(targetCompleted ? "Material marked as Completed!" : "Material marked as In Progress", targetCompleted ? "success" : "info");
    } catch (err) {
      console.error(err);
      addToast("Failed to update completion status.", "error");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    let contextStr = "General Note";
    if (newNoteContext.trim()) {
      contextStr = newNoteContext.trim();
    } else if (material.material_type === "video" && videoRef.current) {
      const time = Math.floor(videoRef.current.currentTime);
      const mins = Math.floor(time / 60).toString().padStart(2, '0');
      const secs = (time % 60).toString().padStart(2, '0');
      contextStr = `Timestamp ${mins}:${secs}`;
    }

    try {
      const note = await api.createMaterialNote(material.id, {
        content: newNote.trim(),
        context: contextStr
      });
      setNotes([note, ...notes]);
      setNewNote("");
      setNewNoteContext("");
      addToast("Note saved to study notes", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to save note", "error");
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await api.deleteMaterialNote(noteId);
      setNotes(notes.filter(n => n.id !== noteId));
      addToast("Note removed", "info");
    } catch (err) {
      console.error(err);
      addToast("Failed to delete note", "error");
    }
  };

  const FLAG_CATEGORY_LABELS: Record<string, string> = {
    unclear_explanation: "Unclear or confusing explanation",
    missing_context: "Missing prerequisite context or facts",
    factual_error: "Suspected factual or syllabus inaccuracy",
    difficult_terminology: "Difficult scientific terms need breakdown",
    diagram_unclear: "Diagram or visual label is unreadable",
    audio_video_quality: "Audio or video quality issue",
    other: "Other learning problem"
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingFlag(true);
    setFlagSuccessMsg(null);
    setFlagErrorMsg(null);

    // Precise context determination
    let contextStr = "General (Full Material)";
    if (material.material_type === "video") {
      if (videoFlagMode === "current") {
        if (videoRef.current) {
          const time = Math.floor(videoRef.current.currentTime);
          const mins = Math.floor(time / 60).toString().padStart(2, '0');
          const secs = (time % 60).toString().padStart(2, '0');
          contextStr = `Timestamp ${mins}:${secs}`;
        } else {
          contextStr = "Current Timestamp";
        }
      } else if (videoFlagMode === "range") {
        contextStr = `Timestamp ${videoRangeStart} - ${videoRangeEnd}`;
      } else {
        contextStr = "Full Video";
      }
    } else if (material.material_type === "pdf") {
      if (pdfFlagMode === "current") {
        contextStr = `Page ${pdfPage}`;
      } else if (pdfFlagMode === "range") {
        contextStr = `Pages ${pdfRangeStart} to ${pdfRangeEnd}`;
      } else {
        contextStr = "Full Document";
      }
    }

    const categoryTitle = FLAG_CATEGORY_LABELS[flagCategory] || "Learning Problem";
    const fullComment = newFlag.trim() ? `[${categoryTitle}] ${newFlag.trim()}` : `[${categoryTitle}]`;

    try {
      const flag = await api.flagMaterial(material.id, {
        comment: fullComment,
        context: contextStr
      });
      setFlags([flag, ...flags]);
      setNewFlag("");
      setFlagSuccessMsg("Thanks — your report has been sent to your teacher.");
      addToast("Flag submitted to teacher", "success");
    } catch (err: any) {
      console.error(err);
      setFlagErrorMsg("Failed to submit flag. Please try again.");
      addToast("Failed to submit report. Please retry.", "error");
    } finally {
      setSubmittingFlag(false);
    }
  };

  const handleSummarize = async (targetStyle?: "paragraph" | "point_form" | "story_mode") => {
    const styleToUse = targetStyle || summaryStyle;
    setSummarizing(true);
    try {
      const res = await api.summarizeMaterial(material.id, styleToUse);
      setSummariesByStyle(prev => ({
        ...prev,
        [styleToUse]: res.summary
      }));
    } catch (err: any) {
      const errDetail = err?.message || err?.detail || "The material might not contain enough text, or the AI service is unavailable.";
      setSummariesByStyle(prev => ({
        ...prev,
        [styleToUse]: `Failed to generate summary. ${errDetail}`
      }));
    } finally {
      setSummarizing(false);
    }
  };

  // Keyboard: ESC to exit fullscreen or close viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onClose]);

  useEffect(() => {
    let isActive = true;
    setHasError(false);
    setIsLoading(material.material_type !== "note");

    if (material.material_type === "note" || material.material_type === "video" || material.material_type === "image" || !fileUrl) {
      setIsLoading(false);
      return;
    }
    
    // Check if resource is available
    fetch(fileUrl, { method: "HEAD" })
      .then((res) => {
        if (!isActive) return;
        if (!res.ok) setHasError(true);
      })
      .catch(() => {
        if (!isActive) return;
        setHasError(true);
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    return () => { isActive = false; };
  }, [fileUrl, material.material_type]);

  const containerStyle: React.CSSProperties = isFullscreen ? {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    margin: 0,
    padding: "1.5rem",
    background: "var(--bg-card)",
    display: "flex",
    flexDirection: "column",
    borderRadius: 0,
  } : {
    width: "100%",
    minHeight: "780px",
    height: "calc(100vh - 160px)",
    display: "flex",
    flexDirection: "column",
    marginBottom: "1.5rem",
    position: "relative",
    padding: "1.25rem",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg, 12px)",
    background: "var(--bg-card)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
  };

  return (
    <div className="animate-fade-in" style={containerStyle}>
      {/* Header Bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: "1rem",
        marginBottom: "1rem",
        borderBottom: "1px solid var(--border-subtle)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(37, 99, 235, 0.1)",
            color: "#2563EB",
            flexShrink: 0
          }}>
            <SvgIcon name={material.material_type === "pdf" ? "file-text" : material.material_type === "video" ? "video" : material.material_type === "image" ? "image" : "edit"} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-primary)" }}>
              {material.material_type.toUpperCase()} MATERIAL
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {material.title}
              </h3>
              {resumeNotice && (
                <span className="badge badge-info" style={{ fontSize: "0.72rem", animation: "fade-in 0.3s ease", padding: "0.2rem 0.5rem" }}>
                  <SvgIcon name="bookmark" size={12} /> {resumeNotice}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
          {user?.role === "student" && (
            <>
              <button
                type="button"
                onClick={handleToggleCompletion}
                disabled={isCompleting}
                className={progress?.is_completed ? "btn-success" : "btn-secondary"}
                style={{
                  padding: "0.45rem 0.85rem",
                  fontSize: "0.825rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: progress?.is_completed ? "rgba(16, 185, 129, 0.12)" : undefined,
                  color: progress?.is_completed ? "#10B981" : undefined,
                  borderColor: progress?.is_completed ? "rgba(16, 185, 129, 0.3)" : undefined,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
                title={progress?.is_completed ? "Click to mark as Incomplete" : "Click to mark as Completed"}
              >
                <SvgIcon name={progress?.is_completed ? "check-circle" : "check"} size={15} style={{ color: progress?.is_completed ? "#10B981" : undefined }} />
                {progress?.is_completed ? "Completed" : "Mark as Completed"}
              </button>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={isSidebarOpen ? "btn-primary" : "btn-secondary"}
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <SvgIcon name={isSidebarOpen ? "chevron-right" : "sparkle"} size={16} />
                {isSidebarOpen ? "Maximize Reader" : "AI Tools & Notes"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-secondary"
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <SvgIcon name={isFullscreen ? "minimize-2" : "maximize-2" as any} size={15} />
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={() => {
                if (material.material_type === "video") saveVideoProgress();
                onClose();
              }}
              className="btn-secondary"
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace: Media Viewer + Tools Sidebar */}
      <div style={{
        display: "flex",
        gap: "1.25rem",
        flex: 1,
        minHeight: 0,
        width: "100%",
        height: "calc(100% - 60px)"
      }}>
        {/* Main Content Area (PDF, Video, Note, Image) */}
        <div style={{
          flex: user?.role === "student" && isSidebarOpen ? "1 1 68%" : "1 1 100%",
          width: user?.role === "student" && isSidebarOpen ? "68%" : "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md, 8px)",
          border: "1px solid var(--border-subtle)",
          overflow: "hidden",
          transition: "all 0.2s ease"
        }}>
          {isLoading && (
            <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div className="spinner" style={{ width: "36px", height: "36px" }} />
              <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Loading material...</span>
            </div>
          )}

          {!isLoading && hasError && (
             <div style={{ margin: "auto", textAlign: "center", padding: "3rem" }}>
               <SvgIcon name="alert-triangle" size={42} style={{ color: "var(--warning)", margin: "0 auto 1rem" }} />
               <h4 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)" }}>Material File Unavailable</h4>
               <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", maxWidth: "340px" }}>The file could not be loaded from storage. Please verify upload or notify your instructor.</p>
             </div>
          )}

          {!isLoading && !hasError && material.material_type === "note" && (
            <div style={{
              padding: "2rem",
              width: "100%",
              height: "100%",
              overflowY: "auto",
              background: "var(--bg-tertiary)",
              display: "flex",
              justifyContent: "center",
            }}>
              <div style={{
                maxWidth: "840px",
                width: "100%",
                background: "var(--bg-card)",
                borderRadius: "10px",
                boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                padding: "2.5rem 3rem",
                minHeight: "400px",
              }}>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>
                  {material.title}
                </h2>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-subtle)" }}>
                  Created {new Date(material.created_at).toLocaleDateString()} at {new Date(material.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                {material.content && material.content.trim().startsWith("<") ? (
                  <div
                    style={{
                      fontSize: "1rem",
                      lineHeight: 1.85,
                      fontFamily: "var(--font-sans)",
                      color: "var(--text-primary)",
                      wordBreak: "break-word",
                    }}
                    dangerouslySetInnerHTML={{ __html: material.content }}
                  />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: "1rem", color: "var(--text-primary)" }}>
                    {material.content || "No content available."}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoading && !hasError && material.material_type === "pdf" && fileUrl && (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 }}>
              {/* PDF Top Reader & Bookmark Control Bar */}
              <div style={{
                padding: "0.55rem 0.9rem",
                background: "var(--bg-card)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.6rem",
                flexShrink: 0
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pdfCurrentPage <= 1}
                    onClick={() => handlePdfPageChange(pdfCurrentPage - 1)}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                  >
                    &larr; Prev Page
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>Page</span>
                    <input
                      type="number"
                      min={1}
                      value={pdfPageInput}
                      onChange={(e) => setPdfPageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const p = parseInt(pdfPageInput);
                          if (!isNaN(p) && p > 0) handlePdfPageChange(p);
                        }
                      }}
                      className="form-input"
                      style={{ width: "52px", height: "28px", fontSize: "0.78rem", textAlign: "center", padding: "2px" }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.45rem" }}
                      onClick={() => {
                        const p = parseInt(pdfPageInput);
                        if (!isNaN(p) && p > 0) handlePdfPageChange(p);
                      }}
                    >
                      Go
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePdfPageChange(pdfCurrentPage + 1)}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                  >
                    Next Page &rarr;
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSavePdfBookmark(pdfCurrentPage)}
                    style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                    title="Bookmark current reading page"
                  >
                    <SvgIcon name="bookmark" size={13} style={{ color: "var(--accent-primary)" }} /> Bookmark Page {pdfCurrentPage}
                  </button>
                </div>
              </div>

              {/* PDF Iframe Element */}
              <iframe
                key={`pdf-${pdfCurrentPage}`}
                src={`${fileUrl}#page=${pdfCurrentPage}`}
                title={material.title}
                style={{
                  width: "100%",
                  height: "100%",
                  flex: "1 1 auto",
                  border: "none",
                  display: "block"
                }}
                allowFullScreen
              />
            </div>
          )}

          {!isLoading && !hasError && material.material_type === "video" && fileUrl && (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflowY: "auto" }}>
              <div style={{ width: "100%", background: "#000", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "420px", flex: "1 1 auto", position: "relative" }}>
                <video 
                  ref={videoRef} 
                  src={fileUrl} 
                  controls 
                  style={{ width: "100%", maxHeight: "calc(100vh - 280px)", objectFit: "contain" }} 
                  onError={() => setHasError(true)}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onCanPlay={handleVideoCanPlay}
                  onPause={() => saveVideoProgress()}
                  onSeeked={() => saveVideoProgress()}
                  onEnded={() => saveVideoProgress(true)}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              
              {/* Interactive Transcript Viewer */}
              {material.extracted_text && (
                <div style={{ padding: "1.25rem", background: "var(--bg-body)", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", maxHeight: "240px", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <SvgIcon name="file-text" size={16} style={{ color: "var(--accent-primary)" }} />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Video Transcript (AI Extracted)</h4>
                    </div>
                    {(user?.role === "teacher" || user?.role === "admin") && (
                      <button 
                        type="button" 
                        className="btn-secondary btn-sm" 
                        onClick={() => { setEditingTranscript(material.extracted_text || ""); setShowTranscriptEdit(true); }}
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        <SvgIcon name="edit" size={13} /> Edit Transcript
                      </button>
                    )}
                  </div>
                  <div style={{ overflowY: "auto", color: "var(--text-primary)", fontSize: "0.9rem", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {material.extracted_text}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && !hasError && material.material_type === "image" && fileUrl && (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
              <img src={fileUrl} alt={material.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onError={() => setHasError(true)} />
            </div>
          )}
        </div>

        {/* Sidebar Area (Students only: Summary, Notes, Flags) */}
        {user?.role === "student" && isSidebarOpen && (
          <div style={{
            flex: "0 0 32%",
            width: "32%",
            minWidth: "340px",
            maxWidth: "440px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md, 8px)",
            overflow: "hidden",
            boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
          }}>
            {/* Tab Headers */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
              {[
                { id: "summary", label: "Summary", icon: "sparkle" },
                { id: "notes", label: "My Notes", icon: "edit" },
                { id: "flags", label: "Flag / Report", icon: "flag" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    flex: 1, padding: "0.85rem 0.5rem", background: "none", border: "none",
                    borderBottom: activeTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                    color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: activeTab === tab.id ? 700 : 500, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.85rem",
                    transition: "all 0.15s ease"
                  }}
                >
                  <SvgIcon name={tab.icon as any} size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 1: SUMMARY (3 Formats: Paragraph, Point Form, Student Note Style) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === "summary" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  {/* Summary Format Selector */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                        Summary Style
                      </span>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "0.35rem",
                      background: "var(--bg-secondary)",
                      padding: "0.3rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)"
                    }}>
                      {[
                        { id: "paragraph" as const, label: "Paragraph", icon: "file-text", hint: "Academic prose" },
                        { id: "point_form" as const, label: "Point Form", icon: "check-circle", hint: "Structured notes" },
                        { id: "story_mode" as const, label: "Student Notes", icon: "book-open", hint: "High-yield guide" }
                      ].map(fmt => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setSummaryStyle(fmt.id)}
                          style={{
                            padding: "0.45rem 0.35rem",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            background: summaryStyle === fmt.id ? "var(--accent-primary)" : "transparent",
                            color: summaryStyle === fmt.id ? "#ffffff" : "var(--text-secondary)",
                            fontWeight: summaryStyle === fmt.id ? 700 : 500,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.15rem",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <SvgIcon name={fmt.icon as any} size={13} />
                            {fmt.label}
                          </span>
                          <span style={{
                            fontSize: "0.65rem",
                            opacity: summaryStyle === fmt.id ? 0.9 : 0.6,
                            fontWeight: 400
                          }}>
                            {fmt.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary Content Body */}
                  {summarizing ? (
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3rem 1rem",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px dashed var(--border)",
                      gap: "0.75rem",
                      textAlign: "center"
                    }}>
                      <div className="spinner" style={{ width: "24px", height: "24px" }} />
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Generating {summaryStyle === "paragraph" ? "Paragraph" : summaryStyle === "point_form" ? "Point Form" : "Student Notes"} Summary...
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", maxWidth: "260px" }}>
                        Synthesizing verified lesson material into high-yield {summaryStyle === "story_mode" ? "student revision notes" : summaryStyle === "point_form" ? "structured revision notes" : "academic conceptual prose"}.
                      </div>
                    </div>
                  ) : summariesByStyle[summaryStyle] ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.45rem 0.75rem",
                        background: "rgba(37, 99, 235, 0.08)",
                        border: "1px solid rgba(37, 99, 235, 0.2)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        color: "var(--accent-primary)",
                        fontWeight: 600
                      }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <SvgIcon name="sparkle" size={13} />
                          {summaryStyle === "paragraph" && "Academic Paragraph Format"}
                          {summaryStyle === "point_form" && "Structured Point-Form Notes"}
                          {summaryStyle === "story_mode" && "Student Study Guide Notes"}
                        </span>
                        <span style={{ fontSize: "0.7rem", opacity: 0.8, fontWeight: 400 }}>AI Lesson Summary</span>
                      </div>

                      <div style={{
                        padding: "1rem 1.25rem",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.875rem",
                        lineHeight: 1.65,
                        color: "var(--text-primary)",
                        overflowY: "auto",
                        maxHeight: isFullscreen ? "60vh" : "44vh"
                      }}>
                        <ReactMarkdown>{summariesByStyle[summaryStyle] || ""}</ReactMarkdown>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button 
                          className="btn-secondary" 
                          onClick={async () => {
                            try {
                              await api.createMaterialNote(material.id, {
                                content: summariesByStyle[summaryStyle] || "",
                                context: `AI Summary (${summaryStyle === "paragraph" ? "Paragraph" : summaryStyle === "point_form" ? "Point Form" : "Student Notes"})`
                              });
                              api.getMaterialNotes(material.id).then(setNotes).catch(console.error);
                              addToast("Summary saved to your study notes!", "success");
                            } catch (err) {
                              console.error(err);
                              addToast("Failed to save summary to notes.", "error");
                            }
                          }}
                          style={{ flex: 1, fontSize: "0.8rem", padding: "0.45rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}
                        >
                          <SvgIcon name="edit" size={14} /> Save Summary to My Notes
                        </button>

                        <button 
                          className="btn-secondary" 
                          onClick={() => handleSummarize(summaryStyle)}
                          disabled={summarizing}
                          style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <SvgIcon name="refresh" size={13} /> Regenerate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3rem 1.5rem",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px dashed var(--border)",
                      textAlign: "center",
                      gap: "0.75rem"
                    }}>
                      <div style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: "rgba(37, 99, 235, 0.1)",
                        color: "var(--accent-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        <SvgIcon name="sparkle" size={22} />
                      </div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        AI-Generated Lesson Summary
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5, maxWidth: "260px" }}>
                        Click below to generate verified {summaryStyle === "paragraph" ? "paragraph prose" : summaryStyle === "point_form" ? "bullet revision points" : "student study notes"} from this lesson material.
                      </div>
                      <button
                        className="btn-primary"
                        onClick={() => handleSummarize(summaryStyle)}
                        style={{ marginTop: "0.25rem", padding: "0.5rem 1.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                      >
                        <SvgIcon name="sparkle" size={14} />
                        Generate {summaryStyle === "paragraph" ? "Paragraph" : summaryStyle === "point_form" ? "Point Form" : "Student Notes"} Summary
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 2: PERSONAL NOTES                                         */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === "notes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  <form onSubmit={handleAddNote} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input
                      className="input-field"
                      placeholder={material.material_type === "pdf" ? "Context tag (e.g. Page 4, Section B)" : "Context tag (optional)"}
                      value={newNoteContext}
                      onChange={e => setNewNoteContext(e.target.value)}
                      style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
                    />
                    <textarea
                      className="input-field"
                      placeholder="Type a personal study note or revision reminder..."
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      rows={3}
                      required
                      style={{ fontSize: "0.85rem", padding: "0.6rem 0.75rem", resize: "vertical" }}
                    />
                    <button className="btn-primary" type="submit" style={{ alignSelf: "flex-end", fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}>
                      Save Note
                    </button>
                  </form>

                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
                    {notes.map(note => (
                      <div key={note.id} style={{ padding: "0.85rem", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem" }}>
                        {note.context && <strong style={{ color: "var(--accent-primary)", display: "block", marginBottom: "0.25rem", fontSize: "0.8rem" }}>{note.context}</strong>}
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{note.content}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(note.created_at).toLocaleDateString()}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.2rem" }}
                          >
                            <SvgIcon name="trash" size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {notes.length === 0 && (
                      <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem 1rem", fontSize: "0.85rem" }}>
                        No notes added yet for this material.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 3: FLAGS & LEARNING SUPPORT                               */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === "flags" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Spot an issue or need teacher clarification? Flag this material or specify exact pages/timestamps.
                  </div>

                  {flagSuccessMsg && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <SvgIcon name="check-circle" size={16} />
                      <span>{flagSuccessMsg}</span>
                    </div>
                  )}

                  {flagErrorMsg && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--error)", fontSize: "0.85rem" }}>
                      {flagErrorMsg}
                    </div>
                  )}

                  <form onSubmit={handleAddFlag} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", background: "var(--bg-secondary)", padding: "1.1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    
                    {/* Video Context Options */}
                    {material.material_type === "video" && (
                      <div>
                        <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                          Video Timestamp Selection
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", marginBottom: "0.5rem" }}>
                          <button
                            type="button"
                            onClick={() => setVideoFlagMode("current")}
                            className={videoFlagMode === "current" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Current Time
                          </button>
                          <button
                            type="button"
                            onClick={() => setVideoFlagMode("range")}
                            className={videoFlagMode === "range" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Time Range
                          </button>
                          <button
                            type="button"
                            onClick={() => setVideoFlagMode("full")}
                            className={videoFlagMode === "full" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Full Video
                          </button>
                        </div>

                        {videoFlagMode === "range" && (
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Start (e.g. 05:00)</span>
                              <input
                                className="input-field"
                                value={videoRangeStart}
                                onChange={e => setVideoRangeStart(e.target.value)}
                                style={{ fontSize: "0.8rem", padding: "0.35rem 0.5rem" }}
                                placeholder="00:00"
                              />
                            </div>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "1rem" }}>to</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>End (e.g. 10:00)</span>
                              <input
                                className="input-field"
                                value={videoRangeEnd}
                                onChange={e => setVideoRangeEnd(e.target.value)}
                                style={{ fontSize: "0.8rem", padding: "0.35rem 0.5rem" }}
                                placeholder="05:00"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PDF Context Options */}
                    {material.material_type === "pdf" && (
                      <div>
                        <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                          PDF Page Selection
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", marginBottom: "0.5rem" }}>
                          <button
                            type="button"
                            onClick={() => setPdfFlagMode("current")}
                            className={pdfFlagMode === "current" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Single Page
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfFlagMode("range")}
                            className={pdfFlagMode === "range" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Page Range
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfFlagMode("full")}
                            className={pdfFlagMode === "full" ? "btn-primary" : "btn-secondary"}
                            style={{ padding: "0.35rem 0.4rem", fontSize: "0.75rem", justifyContent: "center" }}
                          >
                            Full PDF
                          </button>
                        </div>

                        {pdfFlagMode === "current" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Page Number:</span>
                            <input
                              type="number"
                              min="1"
                              className="input-field"
                              value={pdfPage}
                              onChange={e => setPdfPage(e.target.value)}
                              style={{ width: "80px", fontSize: "0.8rem", padding: "0.35rem 0.5rem" }}
                            />
                          </div>
                        )}

                        {pdfFlagMode === "range" && (
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>From Page:</span>
                              <input
                                type="number"
                                min="1"
                                className="input-field"
                                value={pdfRangeStart}
                                onChange={e => setPdfRangeStart(e.target.value)}
                                style={{ fontSize: "0.8rem", padding: "0.35rem 0.5rem" }}
                              />
                            </div>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "1rem" }}>to</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>To Page:</span>
                              <input
                                type="number"
                                min="1"
                                className="input-field"
                                value={pdfRangeEnd}
                                onChange={e => setPdfRangeEnd(e.target.value)}
                                style={{ fontSize: "0.8rem", padding: "0.35rem 0.5rem" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Category Selector */}
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                        What is the issue?
                      </label>
                      <select
                        className="input-field"
                        value={flagCategory}
                        onChange={e => setFlagCategory(e.target.value)}
                        style={{ fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
                      >
                        <option value="unclear_explanation">Unclear or confusing explanation</option>
                        <option value="missing_context">Missing prerequisite context or facts</option>
                        <option value="factual_error">Suspected factual or syllabus inaccuracy</option>
                        <option value="difficult_terminology">Difficult scientific terms need breakdown</option>
                        <option value="diagram_unclear">Diagram or visual label is unreadable</option>
                        <option value="audio_video_quality">Audio or video quality issue</option>
                        <option value="other">Other learning problem</option>
                      </select>
                    </div>

                    {/* Comment Details - Enlarged */}
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: "0.3rem" }}>
                        Briefly describe what was confusing or problematic
                      </label>
                      <textarea
                        className="input-field"
                        placeholder="Please provide specific details so your teacher can clarify this section..."
                        value={newFlag}
                        onChange={e => setNewFlag(e.target.value)}
                        rows={4}
                        required
                        style={{ fontSize: "0.85rem", padding: "0.6rem 0.75rem", resize: "vertical", width: "100%" }}
                      />
                    </div>

                    <button
                      className="btn-primary"
                      type="submit"
                      disabled={submittingFlag}
                      style={{ fontSize: "0.825rem", padding: "0.55rem 1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}
                    >
                      <SvgIcon name="flag" size={14} />
                      {submittingFlag ? "Submitting Report..." : "Submit Flag to Teacher"}
                    </button>
                  </form>

                  {/* Previous Flags History */}
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      My Previous Reports ({flags.length})
                    </div>
                    {flags.map(flag => (
                      <div key={flag.id} style={{ padding: "0.75rem", background: flag.is_resolved ? "var(--bg-secondary)" : "rgba(239, 68, 68, 0.08)", border: flag.is_resolved ? "1px solid var(--border)" : "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                          <strong style={{ color: flag.is_resolved ? "var(--text-secondary)" : "var(--error)", fontSize: "0.8rem" }}>{flag.context}</strong>
                          <span className={`badge ${flag.is_resolved ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.7rem" }}>
                            {flag.is_resolved ? "Resolved" : "Pending Teacher Review"}
                          </span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)", fontSize: "0.8rem", lineHeight: 1.4 }}>{flag.comment}</div>
                      </div>
                    ))}
                    {flags.length === 0 && (
                      <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "1rem", fontSize: "0.8rem" }}>
                        No flags reported for this material.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Review & Edit Transcript Modal */}
      {showTranscriptEdit && (
        <Modal title="Review & Edit AI Transcript" onClose={() => setShowTranscriptEdit(false)} maxWidth="720px">
          <form onSubmit={handleSaveTranscript}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Review and fix any speech recognition errors. Saving will re-index vector embeddings so AI RAG Q&amp;A and Quiz Generators use the corrected transcript.
            </p>
            <div className="form-group">
              <textarea
                className="textarea"
                style={{ minHeight: "300px", fontFamily: "inherit", fontSize: "0.9rem", lineHeight: 1.6 }}
                value={editingTranscript}
                onChange={(e) => setEditingTranscript(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowTranscriptEdit(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingTranscript}>
                {savingTranscript ? "Saving & Re-Indexing..." : "Save & Re-Index AI"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
