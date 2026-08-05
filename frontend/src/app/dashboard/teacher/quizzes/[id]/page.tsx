"use client";

import { useState, useEffect, use } from "react";
import api, { QuizDetail, QuizAttempt, QuestionVersionResponse } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

export default function TeacherQuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { addToast } = useToast();
  const { id } = use(params);
  const quizId = parseInt(id);
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [activeTab, setActiveTab] = useState<"questions" | "attempts">("questions");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Edit Quiz
  const [showEditQuiz, setShowEditQuiz] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTimeLimit, setEditTimeLimit] = useState<number | "">("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editShortAnswerGrading, setEditShortAnswerGrading] = useState<"manual" | "ai">("manual");

  // Add Question
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQType, setNewQType] = useState<"mcq" | "true_false" | "short_answer">("mcq");
  const [newQText, setNewQText] = useState("");
  const [newQOptions, setNewQOptions] = useState(["", "", "", ""]);
  const [newQCorrect, setNewQCorrect] = useState("");
  const [newQPoints, setNewQPoints] = useState(10);
  const [newQExplanation, setNewQExplanation] = useState("");

  // Delete states
  const [deleteQuizConfirm, setDeleteQuizConfirm] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);

  // Import from Bank
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<QuestionVersionResponse[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSelected, setBankSelected] = useState<Set<number>>(new Set());
  const [bankTypeFilter, setBankTypeFilter] = useState<string>("all");
  const [bankSearchText, setBankSearchText] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadQuiz();
  }, [quizId]);

  const loadQuiz = () => {
    Promise.all([api.getQuiz(quizId), api.getQuizAttempts(quizId).catch(() => [])])
      .then(([q, a]) => { 
        setQuiz(q); 
        setAttempts(a); 
        setEditTitle(q.title);
        setEditDesc(q.description || "");
        setEditTimeLimit(q.time_limit_minutes || "");
        setEditDeadline(q.available_until ? new Date(q.available_until).toISOString().slice(0, 16) : "");
        setEditShortAnswerGrading(q.short_answer_grading_mode || "manual");
      })
      .catch((err) => {
        console.error(err);
        addToast("Failed to load quiz details", "error");
      })
      .finally(() => setLoading(false));
  };

  const handleStatusChange = async (status: string) => {
    try {
      await api.updateQuiz(quizId, { status });
      addToast(`Quiz status changed to ${status}.`, "info");
      loadQuiz();
    } catch (err) {
      console.error(err);
      addToast("Failed to update quiz status.", "error");
    }
  };

  const handleEditQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateQuiz(quizId, {
        title: editTitle,
        description: editDesc,
        time_limit_minutes: editTimeLimit === "" ? undefined : editTimeLimit,
        available_until: editDeadline ? new Date(editDeadline).toISOString() : undefined,
        short_answer_grading_mode: editShortAnswerGrading,
      });
      addToast("Quiz details updated successfully!", "success");
      setShowEditQuiz(false);
      loadQuiz();
    } catch (err) {
      console.error(err);
      addToast("Failed to update quiz details.", "error");
    }
  };

  const handleDeleteQuiz = async () => {
    try {
      await api.deleteQuiz(quizId);
      addToast("Quiz deleted successfully.", "warning");
      router.push("/dashboard/teacher/quizzes");
    } catch (err) {
      console.error(err);
      addToast("Failed to delete quiz.", "error");
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let options = undefined;
      if (newQType === "mcq") {
        options = newQOptions.filter(o => o.trim() !== "");
        if (options.length < 2) return addToast("Please provide at least 2 options for MCQ.", "error");
      } else if (newQType === "true_false") {
        options = ["True", "False"];
      }

      await api.addQuestion(quizId, {
        question_text: newQText,
        question_type: newQType,
        options: options,
        correct_answer: newQCorrect,
        explanation: newQExplanation,
        points: newQPoints,
        order: quiz!.questions.length + 1,
      });
      
      addToast("Question added successfully!", "success");
      setShowAddQuestion(false);
      setNewQText("");
      setNewQCorrect("");
      setNewQExplanation("");
      setNewQOptions(["", "", "", ""]);
      loadQuiz();
    } catch (err) {
      console.error(err);
      addToast("Failed to add question.", "error");
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deleteQuestionId) return;
    try {
      await api.deleteQuestion(quizId, deleteQuestionId);
      addToast("Question removed.", "warning");
      setDeleteQuestionId(null);
      loadQuiz();
    } catch (err) {
      console.error(err);
      addToast("Failed to remove question.", "error");
    }
  };

  if (loading || !quiz) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  const statusBadge = quiz.status === "published" ? "badge-success" : quiz.status === "draft" ? "badge-warning" : "badge-error";
  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/teacher/quizzes">Quizzes</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{quiz.title}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>{quiz.title}</h1>
            <button className="btn-icon" onClick={() => setShowEditQuiz(true)} title="Edit Quiz Info" style={{ padding: "0.3rem" }}>
              <SvgIcon name="edit" size={16} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <span className={`badge ${statusBadge}`}>{quiz.status}</span>
            <span>
              {quiz.question_count} questions &middot; {totalPoints} total points
              {quiz.time_limit_minutes && ` \u00b7 ${quiz.time_limit_minutes} min limit`}
            </span>
          </div>
          {quiz.description && <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>{quiz.description}</p>}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {quiz.status === "draft" && <button className="btn-primary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }} onClick={() => handleStatusChange("published")}>Publish Quiz</button>}
          {quiz.status === "published" && <button className="btn-secondary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }} onClick={() => handleStatusChange("archived")}>Archive Quiz</button>}
          {quiz.status === "archived" && <button className="btn-secondary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }} onClick={() => handleStatusChange("draft")}>Reopen as Draft</button>}
          <button className="btn-danger" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }} onClick={() => setDeleteQuizConfirm(true)}>Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: "1.5rem" }}>
        <button className={`tab ${activeTab === "questions" ? "tab-active" : ""}`} onClick={() => setActiveTab("questions")}>
          Questions ({quiz.questions.length})
        </button>
        <button className={`tab ${activeTab === "attempts" ? "tab-active" : ""}`} onClick={() => setActiveTab("attempts")}>
          Student Attempts ({attempts.length})
        </button>
      </div>

      {/* Questions Tab */}
      {activeTab === "questions" && (
        <div className="animate-fade-in" style={{ maxWidth: "800px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Quiz Questions</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn-secondary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                onClick={async () => {
                  setShowBankModal(true);
                  setBankLoading(true);
                  setBankSelected(new Set());
                  try {
                    const qs = await api.getQuestionBank();
                    // Filter out questions already in this quiz
                    const existingIds = new Set(quiz.questions.map(q => q.id));
                    setBankQuestions(qs.filter(q => !existingIds.has(q.id)));
                  } catch { setBankQuestions([]); }
                  finally { setBankLoading(false); }
                }}
              >
                <SvgIcon name="layers" size={14} /> Import from Bank
              </button>
              <button className="btn-primary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }} onClick={() => setShowAddQuestion(true)}>
                + Add Question
              </button>
            </div>
          </div>
          
          {quiz.questions.length > 0 ? (
            quiz.questions.sort((a, b) => a.order - b.order).map((q) => (
              <div key={q.id} className="quiz-question" style={{ position: "relative", marginBottom: "1rem", padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ position: "absolute", top: "1rem", right: "1rem" }}>
                  <button className="btn-icon btn-icon-danger" onClick={() => setDeleteQuestionId(q.id)} title="Delete Question" style={{ padding: "2px" }}>
                    <SvgIcon name="trash" size={14} />
                  </button>
                </div>
                <div className="quiz-question-header" style={{ marginBottom: "0.5rem" }}>
                  <span className="quiz-question-number" style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "0.85rem" }}>Question {q.order} &middot; {q.question_type.replace("_", " ").toUpperCase()}</span>
                  <span style={{ fontSize: "0.775rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>({q.points} pt{q.points > 1 ? "s" : ""})</span>
                </div>
                <div className="quiz-question-text" style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.75rem" }}>{q.question_text}</div>

                {(q.question_type === "mcq" || q.question_type === "true_false") && q.options?.map((opt, i) => (
                  <div key={i} className={`quiz-option ${opt === q.correct_answer ? "quiz-option-correct" : ""}`} style={{ cursor: "default", padding: "0.45rem 0.75rem", fontSize: "0.825rem", marginBottom: "0.35rem" }}>
                    <span style={{ width: "20px", fontWeight: 600, color: "var(--text-muted)" }}>{String.fromCharCode(65 + i)}</span>
                    <span>{opt}</span>
                    {opt === q.correct_answer && <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>✓ Correct</span>}
                  </div>
                ))}

                {q.question_type === "short_answer" && (
                  <div style={{ padding: "0.6rem 0.85rem", background: "color-mix(in srgb, var(--success) 8%, transparent)", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)" }}>
                    <span style={{ fontSize: "0.775rem", color: "var(--success)", fontWeight: 600 }}>Expected Answer: </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{q.correct_answer}</span>
                  </div>
                )}

                {q.explanation && (
                  <div style={{ marginTop: "0.65rem", padding: "0.6rem 0.85rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <strong>Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="file-text" className="empty-state-icon" style={{ opacity: 0.35, width: 40, height: 40 }} />
                <div className="empty-state-title" style={{ fontSize: "1rem", fontWeight: 600 }}>No questions added yet</div>
                <div className="empty-state-desc" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Click "+ Add Question" to add your first question manually.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attempts Tab */}
      {activeTab === "attempts" && (
        <div className="animate-fade-in">
          {attempts.length > 0 ? (
            <div className="card" style={{ overflow: "auto", padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: "center" }}>Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => {
                    const statusMap: Record<string, { label: string; cls: string }> = {
                      submitted: { label: "Submitted", cls: "badge-success" },
                      in_progress: { label: "In Progress", cls: "badge-warning" },
                      auto_closed: { label: "Auto-Closed", cls: "badge-error" },
                    };
                    const st = statusMap[a.status] || { label: a.status, cls: "badge-secondary" };
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                          {a.student_name || `Student #${a.student_id}`}
                        </td>
                        <td>
                          <span className={`badge ${st.cls}`} style={{ fontSize: "0.7rem" }}>{st.label}</span>
                        </td>
                        <td>{a.score ?? 0} / {a.total_points ?? totalPoints}</td>
                        <td>
                          <span className={`badge ${(a.percentage ?? 0) >= 70 ? "badge-success" : (a.percentage ?? 0) >= 50 ? "badge-warning" : "badge-error"}`}>
                            {(a.percentage ?? 0).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.825rem" }}>
                          {a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {(a.integrity_warnings ?? 0) > 0 ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: "0.2rem",
                              color: "#EF4444", background: "rgba(239,68,68,0.08)",
                              padding: "3px 8px", borderRadius: 12, fontSize: "0.7rem", fontWeight: 600,
                            }}>
                              <SvgIcon name="alert-triangle" size={12} /> {a.integrity_warnings}
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Clean</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div className="empty-state">
                <SvgIcon name="bar-chart" className="empty-state-icon" style={{ opacity: 0.35, width: 40, height: 40 }} />
                <div className="empty-state-title" style={{ fontSize: "1rem", fontWeight: 600 }}>No attempts recorded</div>
                <div className="empty-state-desc" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Students haven't taken this quiz yet.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Quiz Modal */}
      {showEditQuiz && (
        <Modal title="Edit Quiz Info" onClose={() => setShowEditQuiz(false)}>
          <form onSubmit={handleEditQuiz}>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Quiz Title *</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required style={{ fontSize: "0.85rem" }} />
            </div>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Description</label>
              <textarea className="input" rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ fontSize: "0.85rem" }} />
            </div>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Time Limit (Minutes)</label>
              <input className="input" type="number" min={1} value={editTimeLimit} onChange={(e) => setEditTimeLimit(e.target.value ? parseInt(e.target.value) : "")} placeholder="Leave blank for unlimited" style={{ fontSize: "0.85rem" }} />
            </div>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Submission Deadline (Closes At)</label>
              <input className="input" type="datetime-local" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} style={{ fontSize: "0.85rem" }} />
            </div>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Short Answer Grading Mode</label>
              <select className="input" value={editShortAnswerGrading} onChange={(e) => setEditShortAnswerGrading(e.target.value as any)} style={{ fontSize: "0.85rem" }}>
                <option value="manual">Manual Teacher Review</option>
                <option value="ai">AI Semantic Auto-Grading</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowEditQuiz(false)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ padding: "0.45rem 1rem", fontSize: "0.85rem" }}>Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Question Modal */}
      {showAddQuestion && (
        <Modal title="Add Quiz Question" onClose={() => setShowAddQuestion(false)}>
          <form onSubmit={handleAddQuestion}>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Question Type</label>
              <select className="input" value={newQType} onChange={(e) => setNewQType(e.target.value as any)} style={{ fontSize: "0.85rem" }}>
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="true_false">True / False</option>
                <option value="short_answer">Short Answer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Question Text *</label>
              <textarea className="input" rows={2} value={newQText} onChange={(e) => setNewQText(e.target.value)} required placeholder="Enter the question..." style={{ fontSize: "0.85rem" }} />
            </div>

            {newQType === "mcq" && (
              <div className="form-group">
                <label className="label" style={{ fontSize: "0.8rem" }}>Options</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {newQOptions.map((opt, i) => (
                    <input key={i} className="input" value={opt} onChange={(e) => {
                      const updated = [...newQOptions];
                      updated[i] = e.target.value;
                      setNewQOptions(updated);
                    }} placeholder={`Option ${String.fromCharCode(65 + i)}`} style={{ fontSize: "0.8rem" }} />
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Correct Answer *</label>
              {newQType === "true_false" ? (
                <select className="input" value={newQCorrect} onChange={(e) => setNewQCorrect(e.target.value)} required style={{ fontSize: "0.85rem" }}>
                  <option value="">-- Choose Correct Answer --</option>
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              ) : (
                <input className="input" value={newQCorrect} onChange={(e) => setNewQCorrect(e.target.value)} required placeholder={newQType === "mcq" ? "Type exact correct option text" : "Type correct answer phrase"} style={{ fontSize: "0.85rem" }} />
              )}
            </div>

            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Points</label>
              <input className="input" type="number" min={0.5} step={0.5} value={newQPoints} onChange={(e) => setNewQPoints(parseFloat(e.target.value) || 1)} style={{ fontSize: "0.85rem" }} />
            </div>

            <div className="form-group">
              <label className="label" style={{ fontSize: "0.8rem" }}>Explanation (Optional)</label>
              <input className="input" value={newQExplanation} onChange={(e) => setNewQExplanation(e.target.value)} placeholder="Why is this correct?" style={{ fontSize: "0.85rem" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button type="button" className="btn-secondary" onClick={() => setShowAddQuestion(false)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ padding: "0.45rem 1rem", fontSize: "0.85rem" }}>Add Question</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Dialogs */}
      {deleteQuizConfirm && (
        <ConfirmDialog
          title="Delete Quiz"
          message={`Are you sure you want to delete "${quiz.title}"? All student attempts and question data will be permanently removed.`}
          onConfirm={handleDeleteQuiz}
          onCancel={() => setDeleteQuizConfirm(false)}
        />
      )}

      {deleteQuestionId && (
        <ConfirmDialog
          title="Delete Question"
          message="Are you sure you want to remove this question from the quiz?"
          onConfirm={handleDeleteQuestion}
          onCancel={() => setDeleteQuestionId(null)}
        />
      )}
      {/* Import from Bank Modal */}
      {showBankModal && (
        <Modal title="Import Questions from Bank" onClose={() => setShowBankModal(false)}>
          {bankLoading ? (
            <div style={{ textAlign: "center", padding: "3rem" }}>
              <div className="spinner" style={{ width: 32, height: 32, margin: "0 auto 1rem" }} />
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading question bank...</div>
            </div>
          ) : (
            <div>
              {/* Filters */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Search questions..."
                  value={bankSearchText}
                  onChange={(e) => setBankSearchText(e.target.value)}
                  style={{ flex: 1, minWidth: 200, fontSize: "0.85rem" }}
                />
                <select
                  className="input"
                  value={bankTypeFilter}
                  onChange={(e) => setBankTypeFilter(e.target.value)}
                  style={{ width: "auto", fontSize: "0.85rem" }}
                >
                  <option value="all">All Types</option>
                  <option value="mcq">MCQ</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                </select>
              </div>

              {(() => {
                const filteredBank = bankQuestions.filter(q => {
                  if (bankTypeFilter !== "all" && q.question_type !== bankTypeFilter) return false;
                  if (bankSearchText && !q.question_text.toLowerCase().includes(bankSearchText.toLowerCase())) return false;
                  return true;
                });

                return (
                  <>
                    {/* Select All bar */}
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: "0.75rem", padding: "0.5rem 0.75rem",
                      background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
                      fontSize: "0.8rem",
                    }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        {bankSelected.size} of {filteredBank.length} selected
                      </span>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}
                          onClick={() => {
                            const newSet = new Set(bankSelected);
                            filteredBank.forEach(q => newSet.add(q.id));
                            setBankSelected(newSet);
                          }}
                        >Select All</button>
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem" }}
                          onClick={() => setBankSelected(new Set())}
                        >Clear</button>
                      </div>
                    </div>

                    {/* Question list */}
                    <div style={{ maxHeight: 350, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {filteredBank.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                          {bankQuestions.length === 0 ? "No questions in the bank yet." : "No questions match your filters."}
                        </div>
                      ) : filteredBank.map(q => (
                        <div
                          key={q.id}
                          onClick={() => {
                            const newSet = new Set(bankSelected);
                            if (newSet.has(q.id)) newSet.delete(q.id); else newSet.add(q.id);
                            setBankSelected(newSet);
                          }}
                          style={{
                            padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", cursor: "pointer",
                            border: bankSelected.has(q.id) ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                            background: bankSelected.has(q.id) ? "rgba(99,102,241,0.04)" : "transparent",
                            display: "flex", alignItems: "flex-start", gap: "0.75rem", transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{
                            width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 2,
                            border: bankSelected.has(q.id) ? "none" : "2px solid var(--border)",
                            background: bankSelected.has(q.id) ? "var(--accent-primary)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {bankSelected.has(q.id) && <SvgIcon name="check" size={14} style={{ color: "white" }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                              {q.question_text.length > 120 ? q.question_text.slice(0, 120) + "..." : q.question_text}
                            </div>
                            <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.7rem" }}>
                              <span className="badge badge-secondary">{(q.question_type || "").replace("_", " ").toUpperCase()}</span>
                              {q.lesson_title && <span className="badge badge-info">{q.lesson_title}</span>}
                              <span style={{ color: "var(--text-muted)" }}>{q.default_points} pt{q.default_points > 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Import button */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowBankModal(false)}>Cancel</button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={bankSelected.size === 0 || importing}
                        style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
                        onClick={async () => {
                          setImporting(true);
                          try {
                            const result = await api.importQuestionsFromBank(quizId, Array.from(bankSelected));
                            addToast(result.message, "success");
                            setShowBankModal(false);
                            loadQuiz();
                          } catch (err: any) {
                            addToast(err?.message || "Import failed", "error");
                          } finally {
                            setImporting(false);
                          }
                        }}
                      >
                        {importing ? "Importing..." : `Import ${bankSelected.size} Question${bankSelected.size !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
