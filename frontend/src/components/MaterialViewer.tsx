"use client";

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
}

export default function MaterialViewer({ material, onClose }: MaterialViewerProps) {
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

  useEffect(() => {
    if (isFullscreen) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isFullscreen]);

  // Advanced Analytics State
  const [activeTab, setActiveTab] = useState<"notes" | "flags" | "summary">("notes");
  const [notes, setNotes] = useState<MaterialNote[]>([]);
  const [flags, setFlags] = useState<MaterialFlag[]>([]);
  const [progress, setProgress] = useState<StudentMaterialProgress | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newNoteContext, setNewNoteContext] = useState("");
  const [newFlag, setNewFlag] = useState("");
  const [newFlagContext, setNewFlagContext] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaveTimeRef = useRef<number>(0);

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

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (user?.role === "student") {
      api.getMaterialNotes(material.id).then(setNotes).catch(console.error);
      api.getMaterialFlags(material.id).then(setFlags).catch(console.error);
      api.getMaterialProgress(material.id).then(setProgress).catch(console.error);
      
      if (material.material_type !== "video") {
        timeoutId = setTimeout(() => {
          api.updateMaterialProgress(material.id, { last_position: 1, is_completed: true })
            .then(setProgress).catch(console.error);
        }, 10000);
      }
    }
    return () => clearTimeout(timeoutId);
  }, [material.id, user, material.material_type]);

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || user?.role !== "student") return;
    const time = videoRef.current.currentTime;
    const duration = videoRef.current.duration;
    
    // Throttle saves to every 5 seconds
    if (Math.abs(time - lastSaveTimeRef.current) > 5) {
      lastSaveTimeRef.current = time;
      const isCompleted = duration > 0 && time > duration * 0.9;
      api.updateMaterialProgress(material.id, { last_position: time, is_completed: isCompleted }).catch(console.error);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current && progress && progress.last_position > 0) {
      videoRef.current.currentTime = progress.last_position;
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    try {
      const note = await api.addMaterialNote(material.id, {
        content: newNote,
        context: newNoteContext || undefined
      });
      setNotes([note, ...notes]);
      setNewNote("");
      setNewNoteContext("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlag.trim()) return;
    
    // Auto-capture video time if missing and playing video
    let context = newFlagContext;
    if (!context && material.material_type === "video" && videoRef.current) {
      const time = Math.floor(videoRef.current.currentTime);
      const mins = Math.floor(time / 60).toString().padStart(2, '0');
      const secs = (time % 60).toString().padStart(2, '0');
      context = `Timestamp ${mins}:${secs}`;
    }

    try {
      const flag = await api.flagMaterial(material.id, {
        comment: newFlag,
        context: context || "General"
      });
      setFlags([flag, ...flags]);
      setNewFlag("");
      setNewFlagContext("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const res = await api.summarizeMaterial(material.id);
      setSummary(res.summary);
    } catch (err) {
      setSummary("Failed to generate summary. The material might not contain enough text, or the AI service is unavailable.");
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

  const fullscreenStyle: React.CSSProperties = isFullscreen ? {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, margin: 0, borderRadius: 0, display: "flex", flexDirection: "column"
  } : { marginBottom: "1.5rem", position: "relative" };

  return (
    <div className="card animate-fade-in" style={fullscreenStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>
            <SvgIcon name={material.material_type === "pdf" ? "file-text" : material.material_type === "video" ? "video" : material.material_type === "image" ? "image" : "edit"} size={20} />
          </span>
          {material.title}
        </h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {user?.role === "student" && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="btn-secondary" style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <SvgIcon name={isSidebarOpen ? "chevron-right" : "chevron-left"} size={16} />
              {isSidebarOpen ? "Hide Tools" : "Show Tools"}
            </button>
          )}
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="btn-secondary" style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          {onClose && (
            <button onClick={onClose} className="btn-secondary" style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}>
              Close
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flex: 1, flexDirection: isFullscreen ? "row" : "column", minHeight: 0 }}>
        {/* Main Content Area */}
        <div style={{ flex: user?.role === "student" ? 2 : 1, display: "flex", flexDirection: "column", minHeight: "300px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", overflow: "hidden" }}>
          {isLoading && <div className="spinner" style={{ margin: "auto" }}></div>}

          {!isLoading && hasError && (
             <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>Material Missing</div>
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
                maxWidth: "780px",
                width: "100%",
                background: "var(--bg-card)",
                borderRadius: "8px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                padding: "2.5rem 3rem",
                minHeight: "400px",
              }}>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>
                  {material.title}
                </h2>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-subtle)" }}>
                  Created {new Date(material.created_at).toLocaleDateString()} at {new Date(material.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                {material.content && material.content.trim().startsWith("<") ? (
                  <div
                    style={{
                      fontSize: "0.95rem",
                      lineHeight: 1.8,
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      color: "var(--text-primary)",
                      wordBreak: "break-word",
                    }}
                    dangerouslySetInnerHTML={{ __html: material.content }}
                  />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                    {material.content || "No content available."}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoading && !hasError && material.material_type === "pdf" && fileUrl && (
            <iframe src={fileUrl} title={material.title} style={{ width: "100%", height: isFullscreen ? "100%" : "70vh", border: "none" }} allowFullScreen />
          )}

          {!isLoading && !hasError && material.material_type === "video" && fileUrl && (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
              <video 
                ref={videoRef} 
                src={fileUrl} 
                controls 
                style={{ width: "100%", maxHeight: isFullscreen ? "100%" : "70vh", background: "black" }} 
                onError={() => setHasError(true)}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
              >
                Your browser does not support the video tag.
              </video>
              
              {/* Interactive Transcript Viewer */}
              {material.extracted_text && (
                <div style={{ marginTop: "1rem", background: "var(--bg-body)", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: isFullscreen ? "30vh" : "200px" }}>
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(0,0,0,0.1)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <SvgIcon name="edit" size={18} />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Video Transcript (AI Generated)</h4>
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
                  <div style={{ padding: "1.25rem", overflowY: "auto", color: "var(--text-primary)", fontSize: "0.95rem", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                    {material.extracted_text}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && !hasError && material.material_type === "image" && fileUrl && (
            <img src={fileUrl} alt={material.title} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", margin: "auto" }} onError={() => setHasError(true)} />
          )}
        </div>

        {/* Sidebar Area (Students only) */}
        {user?.role === "student" && isSidebarOpen && (
          <div style={{ flex: isFullscreen ? "0 0 350px" : 1, display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", minWidth: "300px", overflow: "hidden", maxHeight: isFullscreen ? "100%" : "70vh" }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
              {(["notes", "flags", "summary"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: "0.75rem", background: "none", border: "none",
                    borderBottom: activeTab === tab ? "2px solid #8b5cf6" : "2px solid transparent",
                    color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: activeTab === tab ? 600 : 400, cursor: "pointer", textTransform: "capitalize"
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
              {activeTab === "notes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  <form onSubmit={handleAddNote} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input className="input-field" placeholder={material.material_type === "pdf" ? "Context (e.g. Page 4)" : "Context (optional)"} value={newNoteContext} onChange={e => setNewNoteContext(e.target.value)} />
                    <textarea className="input-field" placeholder="Add a personal note..." value={newNote} onChange={e => setNewNote(e.target.value)} rows={3} required />
                    <button className="btn-primary" type="submit">Save Note</button>
                  </form>
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {notes.map(note => (
                      <div key={note.id} style={{ padding: "0.75rem", background: "var(--bg-body)", borderRadius: "6px", fontSize: "0.9rem" }}>
                        {note.context && <strong style={{ color: "#8b5cf6", display: "block", marginBottom: "0.25rem" }}>{note.context}</strong>}
                        <div><ReactMarkdown>{note.content}</ReactMarkdown></div>
                      </div>
                    ))}
                    {notes.length === 0 && <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "1rem" }}>No notes yet.</div>}
                  </div>
                </div>
              )}

              {activeTab === "flags" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Don't understand a section? Flag it for the teacher!
                  </div>
                  <form onSubmit={handleAddFlag} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input className="input-field" placeholder={material.material_type === "video" ? "Time context (e.g. 02:15)" : "Context (e.g. Page 3)"} value={newFlagContext} onChange={e => setNewFlagContext(e.target.value)} />
                    {material.material_type === "video" && <div style={{ fontSize: "0.75rem", color: "#8b5cf6" }}>Leave context empty to auto-capture current video time!</div>}
                    <textarea className="input-field" placeholder="What is confusing?" value={newFlag} onChange={e => setNewFlag(e.target.value)} rows={3} required />
                    <button className="btn-primary" style={{ background: "linear-gradient(135deg, #ef4444, #f97316)", border: "none" }} type="submit"><SvgIcon name="flag" size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />Flag to Teacher</button>
                  </form>
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {flags.map(flag => (
                      <div key={flag.id} style={{ padding: "0.75rem", background: flag.is_resolved ? "var(--bg-body)" : "rgba(239, 68, 68, 0.1)", border: flag.is_resolved ? "1px solid var(--border)" : "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", fontSize: "0.9rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong style={{ color: flag.is_resolved ? "var(--text-secondary)" : "#ef4444", marginBottom: "0.25rem" }}>{flag.context}</strong>
                          <span style={{ fontSize: "0.75rem", color: flag.is_resolved ? "#10b981" : "#f59e0b" }}>{flag.is_resolved ? "Resolved" : "Pending"}</span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{flag.comment}</div>
                      </div>
                    ))}
                    {flags.length === 0 && <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "1rem" }}>No flags yet.</div>}
                  </div>
                </div>
              )}

              {activeTab === "summary" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                  <button className="btn-primary" onClick={handleSummarize} disabled={summarizing} style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)", border: "none" }}>
                    {summarizing ? "Generating Summary..." : "Generate AI Summary"}
                  </button>
                  {summary && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ padding: "1rem", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "8px", fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-primary)", overflowY: "auto", maxHeight: "40vh" }}>
                        <ReactMarkdown>{summary}</ReactMarkdown>
                      </div>
                      <button 
                        className="btn-secondary" 
                        onClick={async () => {
                          try {
                            const note = await api.addMaterialNote(material.id, {
                              content: summary,
                              context: "AI Generated Summary"
                            });
                            setNotes(prev => [note, ...prev]);
                            setActiveTab("notes");
                          } catch (err) {
                            console.error(err);
                            alert("Failed to save summary as note");
                          }
                        }} 
                        style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                      >
                        <SvgIcon name="save" size={14} /> Save as Note
                      </button>
                    </div>
                  )}
                  {!summary && (
                    <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "2rem", fontSize: "0.9rem" }}>
                      Get a quick summary of the material's text content.
                    </div>
                  )}
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
