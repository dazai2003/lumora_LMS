"use client";

import { useState, useEffect } from "react";
import api, { Course, Lesson, QuestionCreate, Material } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function CreateQuizPage() {
  const { addToast } = useToast();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Creation Mode
  const [creationMode, setCreationMode] = useState<"manual" | "ai">("manual");

  // Common State
  const [selectedCourse, setSelectedCourse] = useState<number | "">("");
  const [selectedLesson, setSelectedLesson] = useState<number | "">("");
  const [quizTitle, setQuizTitle] = useState("");

  // Manual Form State
  const [quizDesc, setQuizDesc] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [shortAnswerGrading, setShortAnswerGrading] = useState<"manual" | "ai">("manual");
  const [questions, setQuestions] = useState<QuestionCreate[]>([]);

  // AI Form State
  const [aiSelectedMaterials, setAiSelectedMaterials] = useState<number[]>([]);
  const [aiNumQuestions, setAiNumQuestions] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("medium");
  const [aiQuestionTypes, setAiQuestionTypes] = useState(["mcq", "true_false", "short_answer"]);
  const [aiSourceMode, setAiSourceMode] = useState<"materials" | "pdf">("materials");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfType, setPdfType] = useState("exact_extraction");
  const [extractAll, setExtractAll] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Initializing AI Engine...");
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (!submitting) {
      setLoadingProgress(0);
      return;
    }
    const messages = [
      "Extracting text from document...",
      "Analyzing content structure...",
      "Identifying questions and topics...",
      "Evaluating complexity...",
      "Generating distractors...",
      "Formatting final quiz...",
      "Finalizing..."
    ];
    let i = 0;
    
    // Message interval
    const msgTimer = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingMessage(messages[i]);
    }, 4000);

    // Progress interval (simulating progress up to 95%)
    const progressTimer = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 90) return prev + Math.random() * 5;
        if (prev < 95) return prev + 0.5;
        return prev;
      });
    }, 1000);

    return () => {
      clearInterval(msgTimer);
      clearInterval(progressTimer);
      setLoadingMessage("Initializing AI Engine...");
    };
  }, [submitting]);

  useEffect(() => {
    api.listCourses()
      .then(setCourses)
      .catch((err) => {
        console.error(err);
        addToast("Failed to load courses.", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      api.listLessons(selectedCourse as number).then(setLessons).catch(console.error);
    } else {
      setLessons([]);
    }
    setSelectedLesson("");
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedLesson && creationMode === "ai") {
      api.listMaterials(selectedLesson as number).then(setMaterials).catch(console.error);
    } else {
      setMaterials([]);
    }
    setAiSelectedMaterials([]);
  }, [selectedLesson, creationMode]);

  const addQuestion = (type: "mcq" | "true_false" | "short_answer") => {
    const newQ: QuestionCreate = {
      question_text: "",
      question_type: type,
      correct_answer: type === "true_false" ? "True" : "",
      options: type === "mcq" ? ["", "", "", ""] : type === "true_false" ? ["True", "False"] : undefined,
      points: 1,
      order: questions.length + 1,
    };
    setQuestions([...questions, newQ]);
  };

  const updateQuestion = (index: number, updates: Partial<QuestionCreate>) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...updates } : q));
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const opts = [...(q.options || [])];
      opts[oIndex] = value;
      return { ...q, options: opts };
    }));
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i + 1 })));
  };

  const handleManualSubmit = async (publish: boolean) => {
    if (!selectedLesson || !quizTitle.trim() || questions.length === 0) {
      return addToast("Please select a lesson, provide a title, and add at least 1 question.", "error");
    }
    setSubmitting(true);
    try {
      const quiz = await api.createQuiz({
        title: quizTitle,
        description: quizDesc || undefined,
        time_limit_minutes: timeLimit ? parseInt(timeLimit) : undefined,
        lesson_id: selectedLesson as number,
        short_answer_grading_mode: shortAnswerGrading,
        questions,
      });
      if (publish) {
        await api.updateQuiz(quiz.id, { 
          status: "published",
          short_answer_grading_mode: shortAnswerGrading 
        });
        addToast(`Quiz "${quizTitle}" created and published!`, "success");
      } else {
        addToast(`Quiz "${quizTitle}" saved as draft.`, "info");
      }
      router.push("/dashboard/teacher/quizzes");
    } catch (err) {
      console.error(err);
      addToast("Failed to create quiz.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAIGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLesson || !quizTitle.trim()) {
      return addToast("Please select a course & lesson and enter a quiz title.", "error");
    }
    if (aiSourceMode === "pdf" && !pdfFile) {
      return addToast("Please select a PDF file.", "error");
    }
    setSubmitting(true);
    try {
      let response;
      if (aiSourceMode === "pdf") {
        const formData = new FormData();
        formData.append("file", pdfFile as File);
        formData.append("lesson_id", selectedLesson.toString());
        formData.append("title", quizTitle);
        formData.append("num_questions", aiNumQuestions.toString());
        formData.append("difficulty", aiDifficulty);
        formData.append("pdf_type", pdfType);
        formData.append("extract_all", extractAll.toString());
        response = await api.generateAIQuizFromPDF(formData);
        addToast("PDF uploaded. AI Generation started...", "info");
      } else {
        response = await api.generateAIQuiz({
          lesson_id: selectedLesson as number,
          title: quizTitle,
          num_questions: aiNumQuestions,
          question_types: aiQuestionTypes,
          difficulty: aiDifficulty,
          material_ids: aiSelectedMaterials.length > 0 ? aiSelectedMaterials : undefined,
        });
        addToast("AI Generation started. Analyzing course materials...", "info");
      }
      
      const taskId = response.task_id;
      
      const pollTimer = setInterval(async () => {
        try {
          const statusRes = await api.getAITaskStatus(taskId);
          if (statusRes.status === "completed" && statusRes.quiz_id) {
            clearInterval(pollTimer);
            addToast("AI Quiz generated successfully!", "success");
            router.push(`/dashboard/teacher/quizzes/${statusRes.quiz_id}`);
          } else if (statusRes.status === "failed") {
            clearInterval(pollTimer);
            addToast(statusRes.error || "Failed to generate AI quiz.", "error");
            setSubmitting(false);
          }
        } catch (pollErr: any) {
          console.error("Polling error", pollErr);
        }
      }, 2000);
      
    } catch (err: any) {
      addToast(err.message || "Failed to start AI quiz generation.", "error");
      setSubmitting(false);
    }
  };

  const materialIcon = (type: string): IconName => {
    switch (type) {
      case "pdf": return "file-text";
      case "video": return "video";
      case "note": return "edit";
      default: return "layers";
    }
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "4rem" }}>
      
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/teacher/quizzes">Quizzes</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Create Quiz</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Create Assessment</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "3px 0 0 0" }}>Build a manual quiz or leverage AI to generate questions from your course materials</p>
        </div>
      </div>

      {/* Creation Mode Toggle Bar */}
      <div style={{ 
        display: "flex", 
        background: "var(--bg-body)", 
        padding: "0.35rem", 
        borderRadius: "var(--radius-md)", 
        marginBottom: "2rem",
        border: "1px solid var(--border-subtle)",
        maxWidth: "440px"
      }}>
        <button 
          type="button"
          onClick={() => setCreationMode("manual")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            flex: 1, padding: "0.6rem 1rem", borderRadius: "var(--radius-sm)",
            border: "none", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
            transition: "all 0.15s ease",
            background: creationMode === "manual" ? "var(--bg-secondary)" : "transparent",
            color: creationMode === "manual" ? "var(--accent-primary)" : "var(--text-secondary)",
            boxShadow: creationMode === "manual" ? "0 2px 6px rgba(0,0,0,0.04)" : "none"
          }}
        >
          <SvgIcon name="edit" size={15} /> Manual Builder
        </button>
        <button 
          type="button"
          onClick={() => { setCreationMode("ai"); setQuizTitle(quizTitle || "AI Generated Quiz"); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            flex: 1, padding: "0.6rem 1rem", borderRadius: "var(--radius-sm)",
            border: "none", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
            transition: "all 0.15s ease",
            background: creationMode === "ai" ? "rgba(139, 92, 246, 0.12)" : "transparent",
            color: creationMode === "ai" ? "#8B5CF6" : "var(--text-secondary)",
            boxShadow: creationMode === "ai" ? "0 2px 6px rgba(139, 92, 246, 0.1)" : "none"
          }}
        >
          <SvgIcon name="sparkle" size={15} style={{ color: "#8B5CF6" }} /> AI Assistant Generator
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        
        {/* Left Column: Main Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* Placement Section */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>
              1. Course & Placement
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label" style={{ fontSize: "0.8rem" }}>Select Course *</label>
                <select className="input" value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value ? parseInt(e.target.value) : "")} required style={{ fontSize: "0.85rem" }}>
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label" style={{ fontSize: "0.8rem" }}>Select Lesson *</label>
                <select className="input" value={selectedLesson} onChange={(e) => setSelectedLesson(e.target.value ? parseInt(e.target.value) : "")} required disabled={!selectedCourse} style={{ fontSize: "0.85rem" }}>
                  <option value="">-- Choose Lesson --</option>
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label" style={{ fontSize: "0.8rem" }}>Quiz Title *</label>
              <input className="input" placeholder="e.g., Chapter 1 Quiz Assessment" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} required style={{ fontSize: "0.85rem" }} />
            </div>
          </div>

          {/* Creation Mode View */}
          {creationMode === "ai" ? (
            /* AI GENERATION MODE UI */
            <div className="card animate-fade-in" style={{ padding: "1.25rem", border: "1px solid color-mix(in srgb, #8B5CF6 25%, transparent)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
                <SvgIcon name="sparkle" size={20} style={{ color: "#8B5CF6" }} />
                <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                  2. AI Generator Configuration
                </h2>
              </div>
              
              {!selectedLesson ? (
                <div style={{ padding: "2rem", textAlign: "center", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Please select a course and lesson above to scan available study materials.
                </div>
              ) : (
                <form onSubmit={handleAIGenerate} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <label className="label" style={{ fontSize: "0.8rem", margin: 0 }}>Knowledge Source</label>
                      <div className="tabs" style={{ marginBottom: 0 }}>
                        <button type="button" className={`tab ${aiSourceMode === "materials" ? "tab-active" : ""}`} onClick={() => setAiSourceMode("materials")} style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}>Course Materials</button>
                        <button type="button" className={`tab ${aiSourceMode === "pdf" ? "tab-active" : ""}`} onClick={() => setAiSourceMode("pdf")} style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}>Upload PDF</button>
                      </div>
                    </div>
                    
                    {aiSourceMode === "materials" ? (
                      <>
                        <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                          Select specific notes or PDFs to extract questions from. Leave unchecked to scan all lesson content.
                        </div>
                        <div style={{ 
                          display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "180px", overflowY: "auto", 
                          padding: "0.75rem", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)" 
                        }}>
                          {materials.map(m => (
                            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.825rem", cursor: "pointer", padding: "0.2rem 0" }}>
                              <input 
                                type="checkbox" 
                                style={{ accentColor: "#8B5CF6" }}
                                checked={aiSelectedMaterials.includes(m.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setAiSelectedMaterials([...aiSelectedMaterials, m.id]);
                                  else setAiSelectedMaterials(aiSelectedMaterials.filter(id => id !== m.id));
                                }}
                              />
                              <SvgIcon name={materialIcon(m.material_type)} size={14} style={{ color: "var(--text-muted)" }} />
                              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{m.title}</span>
                            </label>
                          ))}
                          {materials.length === 0 && <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.8rem" }}>No uploaded materials found in this lesson.</span>}
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: "1rem", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)" }}>
                        <div className="form-group" style={{ marginBottom: "1rem" }}>
                          <label className="label" style={{ fontSize: "0.8rem" }}>PDF File</label>
                          <div style={{ position: "relative" }}>
                            <input 
                              type="file" 
                              accept="application/pdf" 
                              className="input" 
                              onChange={(e) => setPdfFile(e.target.files?.[0] || null)} 
                              required={aiSourceMode === "pdf"} 
                              style={{ 
                                opacity: 0, 
                                position: "absolute", 
                                top: 0, left: 0, right: 0, bottom: 0, 
                                width: "100%", cursor: "pointer" 
                              }} 
                            />
                            <div className="input" style={{ 
                              display: "flex", alignItems: "center", gap: "0.5rem", 
                              color: pdfFile ? "var(--text-primary)" : "var(--text-muted)",
                              background: "var(--bg-body)"
                            }}>
                              <SvgIcon name="file-text" size={16} style={{ color: pdfFile ? "#8B5CF6" : "inherit" }} />
                              {pdfFile ? pdfFile.name : "Click to choose a PDF file..."}
                            </div>
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label" style={{ fontSize: "0.8rem" }}>PDF Type</label>
                          <select className="input" value={pdfType} onChange={(e) => setPdfType(e.target.value)} style={{ fontSize: "0.85rem" }}>
                            <option value="exact_extraction">Questions & Answer Key Provided (AI extracts exactly as written)</option>
                            <option value="solve_extraction">Questions & Options Provided, but NO Answer Key (AI must solve)</option>
                            <option value="mixed">Study Notes / Book (AI generates new questions from text)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {aiSourceMode === "pdf" && pdfType !== "mixed" ? (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="label" style={{ fontSize: "0.8rem" }}>Extraction Mode</label>
                      <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer" }}>
                          <input type="radio" checked={extractAll} onChange={() => setExtractAll(true)} style={{ accentColor: "#8B5CF6" }} />
                          Extract All Questions
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", cursor: "pointer" }}>
                          <input type="radio" checked={!extractAll} onChange={() => setExtractAll(false)} style={{ accentColor: "#8B5CF6" }} />
                          Extract Specific Number
                        </label>
                      </div>
                      {!extractAll && (
                        <div className="form-group animate-fade-in" style={{ marginBottom: 0, maxWidth: "200px" }}>
                          <label className="label" style={{ fontSize: "0.8rem" }}>Max Question Count</label>
                          <input className="input" type="number" min={1} max={50} value={aiNumQuestions} onChange={(e) => setAiNumQuestions(parseInt(e.target.value) || 5)} style={{ fontSize: "0.85rem" }} />
                        </div>
                      )}
                      <div style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                        <SvgIcon name="info" size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                        Question types and difficulty will be automatically inferred from the PDF.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label" style={{ fontSize: "0.8rem" }}>Question Count</label>
                          <input className="input" type="number" min={1} max={20} value={aiNumQuestions} onChange={(e) => setAiNumQuestions(parseInt(e.target.value) || 5)} style={{ fontSize: "0.85rem" }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label" style={{ fontSize: "0.8rem" }}>Difficulty Level</label>
                          <select className="input" value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)} style={{ fontSize: "0.85rem" }}>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label" style={{ fontSize: "0.8rem" }}>Question Composition</label>
                        <select 
                          className="input" 
                          value={aiQuestionTypes.join(",")} 
                          onChange={(e) => setAiQuestionTypes(e.target.value.split(","))}
                          style={{ fontSize: "0.85rem" }}
                        >
                          <option value="mcq,true_false,short_answer">Mixed (MCQ, True/False, Short Answer)</option>
                          <option value="mcq">Multiple Choice Only</option>
                          <option value="true_false">True / False Only</option>
                          <option value="short_answer">Short Answer Only</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {submitting ? (
                      <div className="animate-fade-in" style={{ width: "100%", padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                            {loadingMessage}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                            {Math.round(loadingProgress)}%
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ 
                            height: "100%", 
                            width: `${loadingProgress}%`, 
                            background: "linear-gradient(90deg, #8B5CF6, #6D28D9)", 
                            transition: "width 0.3s ease-out" 
                          }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="submit" className="btn-primary" disabled={!quizTitle.trim() || !selectedLesson} style={{ 
                          padding: "0.6rem 1.5rem", fontSize: "0.85rem", background: "#8B5CF6", borderColor: "#8B5CF6"
                        }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <SvgIcon name="sparkle" size={15} /> Generate Quiz Questions
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* MANUAL MODE UI */
            <div className="card animate-fade-in" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <h2 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                  2. Questions ({questions.length})
                </h2>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button onClick={() => addQuestion("mcq")} className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.775rem" }}>+ MCQ</button>
                  <button onClick={() => addQuestion("true_false")} className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.775rem" }}>+ T/F</button>
                  <button onClick={() => addQuestion("short_answer")} className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.775rem" }}>+ Short Answer</button>
                </div>
              </div>

              {questions.length === 0 ? (
                <div style={{ padding: "2.5rem 1rem", textAlign: "center", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)" }}>
                  <SvgIcon name="plus" size={24} style={{ opacity: 0.4, marginBottom: "0.5rem" }} />
                  <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)" }}>No questions added yet</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>Click the buttons above to add MCQ, True/False, or Short Answer questions.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {questions.map((q, qIndex) => (
                    <div key={qIndex} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "1rem", background: "var(--bg-primary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "0.85rem" }}>
                          Q{qIndex + 1} &middot; {q.question_type.replace("_", " ").toUpperCase()}
                        </span>
                        <button onClick={() => removeQuestion(qIndex)} className="btn-icon btn-icon-danger" style={{ padding: "2px" }} title="Remove Question">
                          <SvgIcon name="trash" size={14} />
                        </button>
                      </div>

                      <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                        <label className="label" style={{ fontSize: "0.775rem" }}>Question Text</label>
                        <textarea className="input" rows={2} value={q.question_text} onChange={(e) => updateQuestion(qIndex, { question_text: e.target.value })} placeholder="Type the question here..." style={{ fontSize: "0.85rem" }} />
                      </div>

                      {q.question_type === "mcq" && (
                        <div style={{ marginBottom: "0.75rem" }}>
                          <label className="label" style={{ fontSize: "0.775rem" }}>Options</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                            {q.options?.map((opt, oIndex) => (
                              <div key={oIndex} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.775rem" }}>{String.fromCharCode(65 + oIndex)}.</span>
                                <input className="input" value={opt} onChange={(e) => updateOption(qIndex, oIndex, e.target.value)} placeholder={"Option " + (oIndex + 1)} style={{ fontSize: "0.8rem" }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label" style={{ fontSize: "0.775rem" }}>Correct Answer</label>
                          {q.question_type === "true_false" ? (
                            <select className="input" value={q.correct_answer} onChange={(e) => updateQuestion(qIndex, { correct_answer: e.target.value })} style={{ fontSize: "0.8rem" }}>
                              <option value="True">True</option>
                              <option value="False">False</option>
                            </select>
                          ) : (
                            <input className="input" value={q.correct_answer} onChange={(e) => updateQuestion(qIndex, { correct_answer: e.target.value })} placeholder={q.question_type === "mcq" ? "Type exact correct option text" : "Type correct answer phrase"} style={{ fontSize: "0.8rem" }} />
                          )}
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="label" style={{ fontSize: "0.775rem" }}>Points</label>
                          <input className="input" type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => updateQuestion(qIndex, { points: parseFloat(e.target.value) || 1 })} style={{ fontSize: "0.8rem" }} />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="label" style={{ fontSize: "0.775rem" }}>Explanation (Optional)</label>
                        <input className="input" value={q.explanation || ""} onChange={(e) => updateQuestion(qIndex, { explanation: e.target.value })} placeholder="Why is this correct?" style={{ fontSize: "0.8rem" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Settings & Publish (Manual Mode) */}
        {creationMode === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>3. Settings & Publish</h2>
              
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ fontSize: "0.8rem" }}>Instructions (Optional)</label>
                <textarea className="input" rows={2} value={quizDesc} onChange={(e) => setQuizDesc(e.target.value)} placeholder="Guidelines for students" style={{ fontSize: "0.85rem" }} />
              </div>
              
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ fontSize: "0.8rem" }}>Time Limit (Minutes)</label>
                <input className="input" type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="Leave blank for unlimited" style={{ fontSize: "0.85rem" }} />
              </div>

              <div className="form-group" style={{ background: "var(--bg-primary)", padding: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", marginBottom: "1.25rem" }}>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-primary)", fontSize: "0.8rem" }}>
                  <SvgIcon name="cpu" size={14} style={{ color: "var(--accent-primary)" }} /> Short Answer Evaluation
                </label>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                  Select how short answer text responses should be graded.
                </div>
                <select className="input" value={shortAnswerGrading} onChange={(e) => setShortAnswerGrading(e.target.value as any)} style={{ fontSize: "0.8rem" }}>
                  <option value="manual">Manual Teacher Review</option>
                  <option value="ai">AI Semantic Auto-Grading</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
                <button 
                  className="btn-primary" 
                  onClick={() => handleManualSubmit(true)} 
                  disabled={submitting || questions.length === 0 || !quizTitle.trim() || !selectedLesson}
                  style={{ padding: "0.55rem", fontSize: "0.85rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.4rem" }}
                >
                  {submitting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : "Save & Publish Quiz"}
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={() => handleManualSubmit(false)} 
                  disabled={submitting || questions.length === 0 || !quizTitle.trim() || !selectedLesson}
                  style={{ padding: "0.55rem", fontSize: "0.85rem", display: "flex", justifyContent: "center" }}
                >
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
