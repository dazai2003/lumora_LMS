"use client";

import { useState, useEffect, useRef, use } from "react";
import api, { Lesson, Material } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialViewer from "@/components/MaterialViewer";
import WYSIWYGEditor from "@/components/WYSIWYGEditor";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function TeacherLessonDetailPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { addToast } = useToast();
  const { id, lessonId } = use(params);
  const courseId = parseInt(id);
  const lId = parseInt(lessonId);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  // Note creation
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);

  // File upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState<"pdf" | "image" | "video">("pdf");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Material State
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [editMatTitle, setEditMatTitle] = useState("");
  const [editMatDesc, setEditMatDesc] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [updatingMat, setUpdatingMat] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Note State
  const [editNoteMaterial, setEditNoteMaterial] = useState<Material | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState("");
  const [editNoteContent, setEditNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Delete material
  const [deleteMat, setDeleteMat] = useState<Material | null>(null);
  const [deletingMat, setDeletingMat] = useState(false);

  // Edit lesson
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingLesson, setSavingLesson] = useState(false);
  const [showEditLesson, setShowEditLesson] = useState(false);

  const loadData = async () => {
    try {
      const [l, m] = await Promise.all([api.getLesson(lId), api.listMaterials(lId)]);
      setLesson(l);
      setMaterials(m);
      setEditTitle(l.title);
      setEditDesc(l.description || "");
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [lId]);

  // Real-time Auto-Polling when any material is processing or pending
  useEffect(() => {
    const hasPending = materials.some(
      m => m.processing_status === "processing" || m.processing_status === "pending"
    );

    if (hasPending) {
      const pollTimer = setInterval(async () => {
        try {
          const updated = await api.listMaterials(lId);
          setMaterials(updated);
        } catch (e) {
          console.error("Material status polling error:", e);
        }
      }, 3000);

      return () => clearInterval(pollTimer);
    }
  }, [materials, lId]);

  // Check if there is an active video transcription in progress
  const activeProcessingVideo = materials.find(
    m => m.material_type === "video" && (m.processing_status === "processing" || m.processing_status === "pending")
  );

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingNote(true);
    try {
      await api.createNote({ title: noteTitle, content: noteContent, material_type: "note", lesson_id: lId });
      addToast(`Note "${noteTitle}" added successfully!`, "success");
      setShowNoteForm(false);
      setNoteTitle(""); setNoteContent("");
      const updated = await api.listMaterials(lId);
      setMaterials(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to create note.", "error");
    }
    finally { setCreatingNote(false); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", uploadTitle);
      formData.append("lesson_id", String(lId));
      formData.append("material_type", uploadType);
      formData.append("file", uploadFile);
      await api.uploadMaterial(formData);
      
      addToast(
        uploadType === "video" 
          ? `Video "${uploadTitle}" uploaded! AI Transcription started in background...`
          : `File "${uploadTitle}" uploaded successfully!`, 
        "success"
      );
      
      setShowUpload(false);
      setUploadTitle(""); setUploadFile(null);
      const updated = await api.listMaterials(lId);
      setMaterials(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to upload file.", "error");
    }
    finally { setUploading(false); }
  };

  const openEditModal = (mat: Material) => {
    if (mat.material_type === "note") {
      setEditNoteMaterial(mat);
      setEditNoteTitle(mat.title);
      setEditNoteContent(mat.content || mat.extracted_text || "");
    } else {
      setEditMaterial(mat);
      setEditMatTitle(mat.title);
      setEditMatDesc(mat.description || "");
      setReplaceFile(null);
    }
  };

  const handleUpdateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNoteMaterial) return;
    setSavingNote(true);
    try {
      const formData = new FormData();
      formData.append("title", editNoteTitle);
      formData.append("content", editNoteContent);
      await api.updateMaterial(editNoteMaterial.id, formData);
      addToast(`Note "${editNoteTitle}" updated successfully!`, "success");
      setEditNoteMaterial(null);
      const updated = await api.listMaterials(lId);
      setMaterials(updated);
      if (selectedMaterial?.id === editNoteMaterial.id) {
        const fresh = updated.find(m => m.id === editNoteMaterial.id);
        if (fresh) setSelectedMaterial(fresh);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to update note.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMaterial) return;
    setUpdatingMat(true);
    try {
      const formData = new FormData();
      formData.append("title", editMatTitle);
      formData.append("description", editMatDesc);
      if (replaceFile) {
        formData.append("file", replaceFile);
      }

      await api.updateMaterial(editMaterial.id, formData);
      addToast(`Material "${editMatTitle}" updated successfully!`, "success");
      setEditMaterial(null);
      setReplaceFile(null);
      const updated = await api.listMaterials(lId);
      setMaterials(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to update material.", "error");
    } finally {
      setUpdatingMat(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteMat) return;
    setDeletingMat(true);
    try {
      await api.deleteMaterial(deleteMat.id);
      addToast(`Material "${deleteMat.title}" deleted.`, "warning");
      setDeleteMat(null);
      const updated = await api.listMaterials(lId);
      setMaterials(updated);
    } catch (err) {
      console.error(err);
      addToast("Failed to delete material.", "error");
    }
    finally { setDeletingMat(false); }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLesson(true);
    try {
      const updated = await api.updateLesson(lId, { title: editTitle, description: editDesc });
      setLesson(updated);
      setShowEditLesson(false);
      addToast("Lesson details updated successfully!", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to update lesson.", "error");
    }
    finally { setSavingLesson(false); }
  };

  const handleTogglePublish = async () => {
    if (!lesson) return;
    const newStatus = !lesson.is_published;
    try {
      const updated = await api.updateLesson(lId, { is_published: newStatus });
      setLesson(updated);
      addToast(`Lesson ${newStatus ? "published to students" : "set to draft mode"}.`, newStatus ? "success" : "info");
    } catch (err) {
      console.error(err);
      addToast("Failed to update lesson status.", "error");
    }
  };

  const materialIconName = (type: string): IconName => {
    switch (type) {
      case "pdf": return "file-text";
      case "video": return "video";
      case "image": return "image";
      case "note": return "book";
      default: return "layers";
    }
  };

  if (loading) return <div className="loading-spinner">Loading lesson details...</div>;
  if (!lesson) return <div className="card">Lesson not found.</div>;

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Breadcrumb Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
        <Link href={`/dashboard/teacher/courses/${courseId}`} style={{ color: "var(--text-muted)", textDecoration: "none" }}>Course View</Link>
        <span>&rsaquo;</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{lesson.title}</span>
      </div>

      {/* Lesson Header Card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{lesson.title}</h1>
            <span className={`badge ${lesson.is_published ? "badge-success" : "badge-warning"}`}>
              {lesson.is_published ? "Published" : "Draft"}
            </span>
          </div>
          {lesson.description && <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.5rem" }}>{lesson.description}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-secondary btn-sm" onClick={() => setShowEditLesson(true)}>Edit</button>
          <button className="btn-secondary btn-sm" onClick={handleTogglePublish}>
            {lesson.is_published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* Live Video AI Transcription Progress Box */}
      {activeProcessingVideo && (
        <div className="card animate-fade-in" style={{ 
          padding: "1.25rem 1.5rem", 
          marginBottom: "1.5rem", 
          background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)", 
          border: "1px solid #818cf8",
          boxShadow: "0 4px 16px rgba(99,102,241,0.12)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderColor: "#818cf8", borderTopColor: "transparent" }} />
              <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Video Uploaded — Generating AI Transcript...
              </span>
            </div>
            <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>PROCESSING WHISPER AI</span>
          </div>
          <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Extracting audio track &amp; indexing speech for <strong>&quot;{activeProcessingVideo.title}&quot;</strong>. Progress updates automatically in real-time.
          </p>

          {/* Dynamic Progress Bar */}
          <div style={{ width: "100%", height: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
            <div 
              style={{ 
                height: "100%", 
                width: "100%", 
                background: "linear-gradient(90deg, #6366f1, #a855f7, #6366f1)", 
                backgroundSize: "200% 100%",
                animation: "pulseGradient 2s infinite linear",
                borderRadius: "4px"
              }} 
            />
          </div>
        </div>
      )}

      {/* Materials Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Materials ({materials.length})</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-primary btn-sm" onClick={() => setShowNoteForm(true)}>+ Add Note</button>
          <button className="btn-secondary btn-sm" onClick={() => setShowUpload(true)}>Upload File</button>
        </div>
      </div>

      {/* Selected Material Viewer */}
      {selectedMaterial && (
        <MaterialViewer 
          material={selectedMaterial} 
          onClose={() => setSelectedMaterial(null)} 
        />
      )}

      {materials.length > 0 ? (
        materials.map((mat) => (
          <div 
            key={mat.id} 
            className="item-row"
            style={{ cursor: "pointer", border: selectedMaterial?.id === mat.id ? "1px solid #818cf8" : "1px solid transparent" }}
            onClick={() => setSelectedMaterial(mat)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
              <span style={{ fontSize: "1.25rem" }}><SvgIcon name={materialIconName(mat.material_type)} size={20} /></span>
              <div>
                <div style={{ fontWeight: 500, fontSize: "0.95rem" }}>{mat.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {mat.material_type.toUpperCase()} &middot; {new Date(mat.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className={`badge ${mat.processing_status === "completed" ? "badge-success" : mat.processing_status === "failed" ? "badge-error" : "badge-warning"}`}>
                {mat.processing_status === "completed" ? "Ready" : mat.processing_status}
              </span>

              {/* Edit Material Button */}
              <button 
                className="btn-icon" 
                onClick={(e) => { e.stopPropagation(); openEditModal(mat); }} 
                title="Edit Material"
                style={{ padding: "0.3rem 0.5rem" }}
              >
                <SvgIcon name="edit" size={14} />
              </button>

              {/* Delete Button */}
              <button 
                className="btn-icon btn-icon-danger" 
                onClick={(e) => { e.stopPropagation(); setDeleteMat(mat); }} 
                title="Delete"
              >
                &times;
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon" style={{ opacity: 0.4 }}>
              <SvgIcon name="layers" size={40} />
            </div>
            <div className="empty-state-title">No materials yet</div>
            <div className="empty-state-desc">Add notes or upload files for this lesson.</div>
          </div>
        </div>
      )}



      {/* Create Note Modal — Digital Paper Workspace */}
      {showNoteForm && (
        <Modal title="Add Note" onClose={() => setShowNoteForm(false)} maxWidth="950px">
          <form onSubmit={handleCreateNote}>
            <div className="form-group">
              <label className="label">Note Title *</label>
              <input className="input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g., Key Formulas" required autoFocus />
            </div>
            <div className="form-group">
              <label className="label" style={{ marginBottom: "0.35rem" }}>Content *</label>
              <WYSIWYGEditor
                initialContent={noteContent}
                onChange={(html) => setNoteContent(html)}
                placeholder="Compose your lesson notes here..."
                minHeight="380px"
                showStats={true}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowNoteForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={creatingNote || !noteTitle.trim() || !noteContent.trim()}>
                {creatingNote ? "Saving..." : "Save Note"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Upload File Modal */}
      {showUpload && (
        <Modal title="Upload File" onClose={() => setShowUpload(false)}>
          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label className="label">Title *</label>
              <input className="input" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="e.g., Chapter 1 Slides" required autoFocus />
            </div>
            <div className="form-group">
              <label className="label">File Type</label>
              <select className="select" value={uploadType} onChange={(e) => setUploadType(e.target.value as typeof uploadType)}>
                <option value="pdf">PDF Document</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">File *</label>
              <div
                className={`file-upload ${uploadFile ? "file-upload-selected" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="file-upload-icon"><SvgIcon name={uploadFile ? "check-circle" : "upload"} size={28} /></div>
                <div className="file-upload-text">
                  {uploadFile ? uploadFile.name : "Click to select a file"}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                accept={uploadType === "pdf" ? ".pdf" : uploadType === "image" ? ".jpg,.jpeg,.png,.webp" : ".mp4,.mkv,.avi,.mov,.webm"}
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null;
                  setUploadFile(selected);
                  if (selected) {
                    const ext = selected.name.split('.').pop()?.toLowerCase() || "";
                    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
                      setUploadType("video");
                    } else if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
                      setUploadType("image");
                    } else if (ext === "pdf") {
                      setUploadType("pdf");
                    }
                    const cleanTitle = selected.name.replace(/\.[^/.]+$/, "").replace(/[_]/g, " ").replace(/\s+/g, " ").trim();
                    setUploadTitle(cleanTitle);
                  }
                }}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={uploading || !uploadTitle.trim() || !uploadFile}>
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Note Modal — Digital Paper WYSIWYG Workspace */}
      {editNoteMaterial && (
        <Modal title="Edit Note" onClose={() => setEditNoteMaterial(null)} maxWidth="950px">
          <form onSubmit={handleUpdateNote}>
            <div className="form-group">
              <label className="label">Note Title *</label>
              <input
                className="input"
                value={editNoteTitle}
                onChange={(e) => setEditNoteTitle(e.target.value)}
                placeholder="e.g., Key Formulas"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="label" style={{ marginBottom: "0.35rem" }}>Content *</label>
              <WYSIWYGEditor
                initialContent={editNoteContent}
                onChange={(html) => setEditNoteContent(html)}
                placeholder="Compose your lesson notes here..."
                minHeight="380px"
                showStats={true}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setEditNoteMaterial(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingNote || !editNoteTitle.trim() || !editNoteContent.trim()}>
                {savingNote ? "Saving Changes..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit & Replace File Material Modal */}
      {editMaterial && (
        <Modal title="Edit Study Material" onClose={() => setEditMaterial(null)}>
          <form onSubmit={handleUpdateMaterial}>
            <div className="form-group">
              <label className="label">Title *</label>
              <input className="input" value={editMatTitle} onChange={(e) => setEditMatTitle(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea className="textarea" value={editMatDesc} onChange={(e) => setEditMatDesc(e.target.value)} placeholder="Optional description..." />
            </div>
            <div className="form-group">
              <label className="label">Replace File (Optional)</label>
              <div
                className={`file-upload ${replaceFile ? "file-upload-selected" : ""}`}
                onClick={() => replaceFileInputRef.current?.click()}
              >
                <div className="file-upload-icon"><SvgIcon name={replaceFile ? "check-circle" : "upload"} size={24} /></div>
                <div className="file-upload-text">
                  {replaceFile ? replaceFile.name : "Click to choose a replacement file..."}
                </div>
              </div>
              <input
                ref={replaceFileInputRef}
                type="file"
                style={{ display: "none" }}
                accept=".pdf,.mp4,.webm,.mov,.avi"
                onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditMaterial(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={updatingMat || !editMatTitle.trim()}>
                {updatingMat ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Lesson Modal */}
      {showEditLesson && (
        <Modal title="Edit Lesson" onClose={() => setShowEditLesson(false)}>
          <form onSubmit={handleSaveLesson}>
            <div className="form-group">
              <label className="label">Title</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea className="textarea" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowEditLesson(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingLesson}>{savingLesson ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Material Confirmation */}
      {deleteMat && (
        <ConfirmDialog title="Delete Material" message={`Delete "${deleteMat.title}"?`} onConfirm={handleDeleteMaterial} onCancel={() => setDeleteMat(null)} loading={deletingMat} />
      )}
    </div>
  );
}
