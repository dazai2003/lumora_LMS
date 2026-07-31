"use client";

import { useState, useEffect, useRef, use } from "react";
import api, { Lesson, Material } from "@/lib/api";
import Link from "next/link";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialViewer from "@/components/MaterialViewer";
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
      addToast(`File "${uploadTitle}" uploaded successfully!`, "success");
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
      case "note": return "edit";
      case "pdf": return "file-text";
      case "image": return "image";
      case "video": return "video";
      default: return "layers";
    }
  };

  if (loading || !lesson) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/dashboard/teacher/courses">Courses</Link>
        <span className="breadcrumb-sep">/</span>
        <Link href={`/dashboard/teacher/courses/${courseId}`}>Course</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--text-primary)" }}>{lesson.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>{lesson.title}</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span className={`badge ${lesson.is_published ? "badge-success" : "badge-warning"}`}>
              {lesson.is_published ? "Published" : "Draft"}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Lesson {lesson.order}</span>
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
                {mat.processing_status}
              </span>
              <button className="btn-icon btn-icon-danger" onClick={() => setDeleteMat(mat)} title="Delete">&times;</button>
            </div>
          </div>
        ))
      ) : (
        <div className="card"><div className="empty-state"><div className="empty-state-icon" style={{ opacity: 0.4 }}><SvgIcon name="layers" size={40} /></div><div className="empty-state-title">No materials yet</div><div className="empty-state-desc">Add notes or upload files for this lesson.</div></div></div>
      )}

      {/* Assessments Section */}
      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Assessments</h2>
        <div className="card" style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border-subtle)", background: "var(--bg-body)" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(139, 92, 246, 0.1)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name="check-circle" size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>Manage Quizzes & AI Generator</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>Assess student understanding for this lesson.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link href={`/dashboard/teacher/quizzes?courseId=${courseId}&lessonId=${lId}`} className="btn-secondary">
              View Quizzes
            </Link>
            <Link href={`/dashboard/teacher/quizzes?courseId=${courseId}&lessonId=${lId}&action=generate`} className="btn-primary" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
              <SvgIcon name="sparkle" size={15} style={{ marginRight: "4px" }} /> Generate AI Quiz
            </Link>
          </div>
        </div>
      </div>

      {/* Create Note Modal */}
      {showNoteForm && (
        <Modal title="Add Note" onClose={() => setShowNoteForm(false)} maxWidth="640px">
          <form onSubmit={handleCreateNote}>
            <div className="form-group">
              <label className="label">Note Title *</label>
              <input className="input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="e.g., Key Formulas" required autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Content *</label>
              <textarea className="textarea" style={{ minHeight: "200px" }} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Write your lesson notes here..." required />
            </div>
            <div className="modal-actions">
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
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
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
