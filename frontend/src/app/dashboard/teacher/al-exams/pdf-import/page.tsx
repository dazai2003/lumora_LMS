"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import api, { Course } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";

export default function TeacherPDFImportPage() {
  const { addToast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");

  // Form State
  const [title, setTitle] = useState("2024 G.C.E. A/L Biology Paper I");
  const [year, setYear] = useState<number>(2024);
  const [paperType, setPaperType] = useState<"paper_1_mcq" | "paper_2_structured" | "paper_2_essay">("paper_1_mcq");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    message: string;
    past_paper_id: number;
    paper_set_group: string;
    questions_count: number;
    exam_id?: number;
  } | null>(null);

  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    api.listCourses()
      .then((data) => {
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(data[0].id);
      })
      .catch((err) => console.error(err));
  }, []);

  const handleExtractPDF = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !year) {
      addToast("Please fill in Paper Title and Examination Year.", "error");
      return;
    }

    setLoading(true);
    setExtractResult(null);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("year", year.toString());
      formData.append("paper_type", paperType);
      if (selectedCourseId) formData.append("course_id", selectedCourseId.toString());
      if (file) formData.append("file", file);

      const res = await api.extractPDFPastPaper(formData);
      setExtractResult(res);
      addToast(`Successfully extracted ${res.questions_count} questions & generated model answers!`, "success");
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "PDF Extraction failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePublishPaperSet = async () => {
    if (!extractResult || !selectedCourseId) return;
    setPublishing(true);
    try {
      const formData = new FormData();
      formData.append("paper_set_group", extractResult.paper_set_group);
      formData.append("course_id", selectedCourseId.toString());
      formData.append("title", title);
      formData.append("time_limit_minutes", paperType === "paper_1_mcq" ? "120" : "180");

      const res = await api.publishPaperSetAsExam(formData);
      addToast(`Paper Set published to course as active exam #${res.exam_id}!`, "success");
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to publish exam.", "error");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Breadcrumb Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        <Link href="/dashboard/teacher" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Teacher Portal</Link>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>PDF Past Paper & Model Question AI Extraction</span>
      </div>

      {/* Hero Card */}
      <div className="card" style={{ padding: "2.25rem", marginBottom: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "rgba(99, 102, 241, 0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SvgIcon name="file-text" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Gemini AI PDF Past Paper Importer
            </h1>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0.2rem 0 0 0" }}>
              Upload official G.C.E. A/L Biology past papers or model question PDFs. Gemini automatically extracts questions and generates model answers/explanations.
            </p>
          </div>
        </div>

        {/* Form Suite */}
        <form onSubmit={handleExtractPDF} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                Paper / Exam Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "0.9rem" }}
                placeholder="e.g. 2024 G.C.E. A/L Biology Paper I"
              />
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                Examination Year *
              </label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "0.9rem" }}
              >
                {Array.from({ length: 11 }, (_, i) => 2025 - i).map((y) => (
                  <option key={y} value={y}>{y} G.C.E. A/L</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                Paper Type *
              </label>
              <select
                value={paperType}
                onChange={(e) => setPaperType(e.target.value as any)}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "0.9rem" }}
              >
                <option value="paper_1_mcq">Paper I — 50 MCQ Practice Paper</option>
                <option value="paper_2_structured">Paper II Part A — Structured Questions</option>
                <option value="paper_2_essay">Paper II Part B — Essay Rubric Paper</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                Target Course Selection
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value ? parseInt(e.target.value, 10) : "")}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: "0.9rem" }}
              >
                <option value="">Do not assign to course (Question Bank Only)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drag & Drop File Area */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, display: "block", marginBottom: "0.4rem", color: "var(--text-primary)" }}>
              Upload Past Paper PDF File
            </label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--radius-md)", padding: "2rem", textAlign: "center", background: "var(--bg-secondary)" }}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
                id="pdf-file-input"
              />
              <label htmlFor="pdf-file-input" style={{ cursor: "pointer", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="upload" size={32} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {file ? file.name : "Click or Drag PDF file here to upload"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Supports official G.C.E. A/L Biology question paper PDFs
                </span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: "1rem", textAlign: "right" }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: "0.75rem 2.25rem", fontSize: "1rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <SvgIcon name="sparkle" size={18} />
              {loading ? "Extracting & Generating Model Answers..." : "Start Gemini AI PDF Extraction"}
            </button>
          </div>
        </form>
      </div>

      {/* Extraction Results & Publishing Banner */}
      {extractResult && (
        <div className="card" style={{ padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--success)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span className="badge badge-success" style={{ marginBottom: "0.5rem" }}>Extraction Completed</span>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                {extractResult.paper_set_group}
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0.3rem 0 0 0" }}>
                Imported <strong>{extractResult.questions_count} questions</strong> into the Question Bank with AI model explanations.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePublishPaperSet}
              disabled={publishing || !selectedCourseId}
              className="btn btn-primary"
              style={{ padding: "0.75rem 2rem", fontSize: "0.95rem" }}
            >
              {publishing ? "Publishing..." : "Publish Entire Paper Set to Course"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
