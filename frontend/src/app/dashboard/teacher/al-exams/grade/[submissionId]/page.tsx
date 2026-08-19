"use client";

import { useEffect, useState, use, useMemo } from "react";
import Link from "next/link";
import api, { ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";

function getAcademicSubpartLabel(node: any, depth: number, index: number): string {
  const explicit = (node.display_label || node.label || node.part_label || "").trim();
  if (explicit && !explicit.startsWith("node_") && !explicit.startsWith("part_node_") && !explicit.startsWith("sub_")) {
    return explicit;
  }
  const prompt = (node.prompt || node.prompt_text || node.stem || "").trim();
  const snippet = prompt.length > 40 ? prompt.slice(0, 40) + "..." : prompt;
  if (depth === 0) {
    const letter = String.fromCharCode(65 + (index % 26));
    return snippet ? `Part ${letter} — ${snippet}` : `Part ${letter}`;
  } else if (depth === 1) {
    const romans = ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)"];
    const roman = romans[index % romans.length];
    return snippet ? `${roman} ${snippet}` : `Subpart ${roman}`;
  } else {
    const alphas = ["(a)", "(b)", "(c)", "(d)"];
    const alpha = alphas[index % alphas.length];
    return snippet ? `${alpha} ${snippet}` : `Section ${alpha}`;
  }
}

function extractEssayCriteriaList(question: ALQuestion): Array<{ item_number: number; criterion_text: string; max_points: number }> {
  const raw = question.essay_checklist_json;
  if (!raw) return [];
  const list: Array<{ item_number: number; criterion_text: string; max_points: number }> = [];
  if (Array.isArray(raw)) {
    raw.forEach((it: any, idx: number) => {
      if (typeof it === "object") {
        list.push({
          item_number: it.item_number || it.number || idx + 1,
          criterion_text: it.description || it.criterion || it.text || `Criterion ${idx + 1}`,
          max_points: Number(it.marks || it.points || it.max_points || 4.0),
        });
      } else {
        list.push({ item_number: idx + 1, criterion_text: String(it), max_points: 4.0 });
      }
    });
  } else if (typeof raw === "object") {
    const subparts = raw.subparts || [];
    if (Array.isArray(subparts) && subparts.length > 0) {
      let count = 1;
      subparts.forEach((sp: any) => {
        const label = sp.label || `Subpart ${count}`;
        const pts = sp.answer_points || sp.marking_points || sp.criteria || [];
        if (Array.isArray(pts) && pts.length > 0) {
          pts.forEach((pt: any) => {
            const desc = pt.description || pt.criterion || pt.text || `Criterion ${count}`;
            list.push({
              item_number: count,
              criterion_text: desc.startsWith(label) ? desc : `${label} — ${desc}`,
              max_points: Number(pt.marks || pt.points || pt.max_points || 4.0),
            });
            count++;
          });
        } else {
          list.push({
            item_number: count,
            criterion_text: `${label} ${sp.prompt || ""}`.trim(),
            max_points: Number(sp.marks || sp.max_points || 10.0),
          });
          count++;
        }
      });
    } else {
      const direct = raw.answer_points || raw.criteria || raw.marking_points || [];
      if (Array.isArray(direct)) {
        direct.forEach((pt: any, idx: number) => {
          list.push({
            item_number: pt.item_number || idx + 1,
            criterion_text: pt.description || pt.criterion || pt.text || `Criterion ${idx + 1}`,
            max_points: Number(pt.marks || pt.points || pt.max_points || 4.0),
          });
        });
      }
    }
  }
  return list;
}

function renderCandidateSubpartAnswer(val: any): React.ReactNode {
  if (val === null || val === undefined || val === "") {
    return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— Unanswered —</span>;
  }
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) {
      return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— Unanswered —</span>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {val.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>•</span>
            <span>{typeof item === "object" ? JSON.stringify(item) : String(item)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (typeof val === "object") {
    const entries = Object.entries(val);
    if (entries.length === 0) {
      return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— Unanswered —</span>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ padding: "0.4rem 0.7rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontSize: "0.88rem" }}>
            <strong style={{ color: "var(--accent-primary)", marginRight: "0.4rem" }}>{k}:</strong>
            <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return String(val);
}

export default function TeacherGradeSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const resolvedParams = use(params);
  const submissionId = parseInt(resolvedParams.submissionId, 10);

  const { addToast } = useToast();
  const [submission, setSubmission] = useState<ALStudentSubmission | null>(null);
  const [exam, setExam] = useState<ALExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Focus layout & reading space states
  const [readingLayout, setReadingLayout] = useState<"standard" | "wide_focus">("wide_focus");
  const [zenModalQuestion, setZenModalQuestion] = useState<{ question: any; ans: any; qNum: number; type: "structured" | "essay" } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [essayFontSize, setEssayFontSize] = useState<"normal" | "large">("normal");

  // Editable teacher overrides state
  // answerId -> { overridePoints: number, checklistResults: any[], feedbackNotes: string }
  const [overrides, setOverrides] = useState<Record<number, {
    overridePoints: number;
    checklistResults: any[];
    feedbackNotes: string;
  }>>({});
  const [teacherFeedback, setTeacherFeedback] = useState("");

  useEffect(() => {
    if (!submissionId || isNaN(submissionId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getALSubmission(submissionId)
      .then(async (data) => {
        setSubmission(data);
        setTeacherFeedback(data.teacher_feedback || "");

        // Initialize overrides from teacher or AI scores
        const initOverrides: Record<number, { overridePoints: number; checklistResults: any[]; feedbackNotes: string }> = {};
        (data.answers || []).forEach((ans) => {
          const checklist = ans.teacher_checklist_results_json || 
                            ans.ai_checklist_results_json?.checklist_evaluations || 
                            ans.ai_checklist_results_json || [];
          initOverrides[ans.id] = {
            overridePoints: ans.teacher_override_points ?? ans.final_score ?? ans.scaled_points_earned ?? (ans.auto_score || 0.0),
            checklistResults: Array.isArray(checklist) ? checklist : [],
            feedbackNotes: ans.feedback_notes || "",
          };
        });
        setOverrides(initOverrides);

        // Fetch corresponding exam paper details
        if (data.exam_id) {
          try {
            const examData = await api.getALExam(data.exam_id);
            setExam(examData);
          } catch (e) {
            console.error("Failed to load exam paper details:", e);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        addToast("Failed to load submission for grading.", "error");
      })
      .finally(() => setLoading(false));
  }, [submissionId, addToast]);

  // Compute live totals
  const liveTotalScore = useMemo(() => {
    return Object.values(overrides).reduce((sum, item) => sum + (Number(item.overridePoints) || 0), 0);
  }, [overrides]);

  const maxPossibleScore = useMemo(() => {
    if (!exam || !exam.questions || exam.questions.length === 0) {
      return submission?.exam_id === 210 ? 50 : submission?.exam_id === 212 ? 160 : submission?.exam_id === 213 ? 120 : 100;
    }
    return exam.questions.reduce((sum, q) => sum + (Number(q.points) || 1.0), 0);
  }, [exam, submission]);

  const livePercentage = useMemo(() => {
    if (maxPossibleScore <= 0) return 0.0;
    return Math.round(((liveTotalScore / maxPossibleScore) * 100) * 100) / 100;
  }, [liveTotalScore, maxPossibleScore]);

  const liveGrade = useMemo(() => {
    if (livePercentage >= 75) return "A";
    if (livePercentage >= 65) return "B";
    if (livePercentage >= 55) return "C";
    if (livePercentage >= 35) return "S";
    return "F";
  }, [livePercentage]);

  const handleUpdatePoints = (answerId: number, newPoints: number) => {
    setOverrides((prev) => ({
      ...prev,
      [answerId]: {
        ...(prev[answerId] || { checklistResults: [], feedbackNotes: "" }),
        overridePoints: Number(newPoints) || 0.0,
      },
    }));
  };

  const handleUpdateFeedback = (answerId: number, notes: string) => {
    setOverrides((prev) => ({
      ...prev,
      [answerId]: {
        ...(prev[answerId] || { overridePoints: 0.0, checklistResults: [] }),
        feedbackNotes: notes,
      },
    }));
  };

  // AI Recommendation Handlers
  const handleAcceptAIRecommendation = (answerId: number, aiScore: number, aiChecklist?: any[]) => {
    setOverrides((prev) => {
      const current = prev[answerId] || { overridePoints: 0.0, checklistResults: [], feedbackNotes: "" };
      return {
        ...prev,
        [answerId]: {
          ...current,
          overridePoints: aiScore,
          checklistResults: Array.isArray(aiChecklist) && aiChecklist.length > 0 ? aiChecklist : current.checklistResults,
        },
      };
    });
    addToast(`Applied AI recommendation (${aiScore} pts)`, "info");
  };

  const handleAcceptAllAIRecommendations = () => {
    if (!submission || !submission.answers) return;
    const updated: Record<number, any> = { ...overrides };
    let count = 0;
    submission.answers.forEach((ans) => {
      const aiScore = ans.ai_score ?? ans.auto_score;
      if (aiScore !== undefined && aiScore !== null) {
        const aiChecklist = ans.ai_checklist_results_json?.checklist_evaluations || ans.ai_checklist_results_json || [];
        updated[ans.id] = {
          ...(updated[ans.id] || { feedbackNotes: "" }),
          overridePoints: aiScore,
          checklistResults: Array.isArray(aiChecklist) && aiChecklist.length > 0 ? aiChecklist : (updated[ans.id]?.checklistResults || []),
        };
        count++;
      }
    });
    setOverrides(updated);
    addToast(`Adopted AI recommended marks for ${count} questions.`, "success");
  };

  const handleBulkChecklist = (answerId: number, criteriaList: any[], awardAll: boolean) => {
    const updatedList = criteriaList.map((c) => ({
      awarded: awardAll,
      points: c.max_points,
      points_earned: awardAll ? c.max_points : 0.0,
    }));
    const totalAwarded = awardAll ? criteriaList.reduce((sum, c) => sum + c.max_points, 0) : 0;
    setOverrides((prev) => ({
      ...prev,
      [answerId]: {
        ...(prev[answerId] || { feedbackNotes: "" }),
        checklistResults: updatedList,
        overridePoints: Math.round(totalAwarded * 100) / 100,
      },
    }));
  };

  const handleToggleChecklist = (answerId: number, itemIndex: number, defaultMax: number = 4.0) => {
    setOverrides((prev) => {
      const current = prev[answerId] || { overridePoints: 0.0, checklistResults: [], feedbackNotes: "" };
      const updatedList = Array.isArray(current.checklistResults) ? [...current.checklistResults] : [];
      
      // Ensure array is populated up to itemIndex
      while (updatedList.length <= itemIndex) {
        updatedList.push({ awarded: false, points: defaultMax, points_earned: 0.0 });
      }

      const item = { ...(updatedList[itemIndex] || { awarded: false, points: defaultMax, points_earned: 0.0 }) };
      item.awarded = !item.awarded;
      item.points_earned = item.awarded ? (Number(item.points) || defaultMax) : 0.0;
      updatedList[itemIndex] = item;

      // Recalculate awarded sum safely
      const totalAwarded = updatedList.reduce((sum, it) => {
        if (!it) return sum;
        return sum + (it.awarded ? (Number(it.points) || defaultMax) : 0);
      }, 0);

      return {
        ...prev,
        [answerId]: {
          ...current,
          checklistResults: updatedList,
          overridePoints: Math.round(totalAwarded * 100) / 100,
        },
      };
    });
  };

  const handlePublishGrade = async () => {
    if (!submission) return;
    setSaving(true);
    try {
      const formattedAnswers = Object.entries(overrides).map(([ansIdStr, data]) => ({
        answer_id: parseInt(ansIdStr, 10),
        teacher_override_points: data.overridePoints,
        teacher_checklist_results_json: data.checklistResults,
        feedback_notes: data.feedbackNotes,
      }));

      const updated = await api.verifyTeacherSubmission(submission.id, {
        answers: formattedAnswers,
        teacher_feedback: teacherFeedback,
      });

      setSubmission(updated);
      addToast("Final grade successfully approved & verified!", "success");
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to publish grade verification.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loader" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading academic submission review...</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "3rem", textAlign: "center" }} className="card">
        <h2>Submission Not Found</h2>
        <Link href="/dashboard/teacher/al-exams/grading" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Back to Marking Studio
        </Link>
      </div>
    );
  }

  const paperType = exam?.exam_type || (submission.exam_id === 210 ? "paper_1_mcq" : submission.exam_id === 212 ? "paper_2_structured" : "paper_2_essay");
  const isMcq = paperType === "paper_1_mcq";
  const isStructured = paperType === "paper_2_structured";
  const isEssay = paperType === "paper_2_essay";

  // Map answers by question_id for easy lookup
  const answersByQuestionId: Record<number, ALStudentAnswer> = {};
  (submission.answers || []).forEach((a) => {
    answersByQuestionId[a.question_id] = a;
  });

  const questionList = exam?.questions || [];

  return (
    <div style={{ maxWidth: readingLayout === "wide_focus" ? "1560px" : "1280px", width: "98%", margin: "0 auto", padding: "0 1rem 4rem 1rem", boxSizing: "border-box", transition: "max-width 0.25s ease" }}>
      {/* ──────────────── TOP BREADCRUMB & WORKSTATION ACTIONS ──────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          <Link href="/dashboard/teacher" style={{ color: "inherit", textDecoration: "none" }}>Teacher Portal</Link>
          <span>/</span>
          <Link href="/dashboard/teacher/al-exams/grading" style={{ color: "inherit", textDecoration: "none" }}>Marking Studio</Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Submission #{submission.id}</span>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Layout Toggle: Wide Studio vs Standard */}
          <button
            type="button"
            onClick={() => setReadingLayout((prev) => (prev === "wide_focus" ? "standard" : "wide_focus"))}
            className="btn btn-secondary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}
            title="Toggle between Wide Reading Studio (1560px) and Standard Layout (1280px)"
          >
            <SvgIcon name={readingLayout === "wide_focus" ? "minimize" : "maximize"} size={14} />
            {readingLayout === "wide_focus" ? "Standard View" : "Wide Focus Mode"}
          </button>

          {/* Quick Accept All AI Recommendations Button */}
          {submission.status !== "teacher_verified" && (
            <button
              type="button"
              onClick={handleAcceptAllAIRecommendations}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--accent-primary)", borderColor: "var(--accent-primary)" }}
              title="Quickly adopt all AI pre-graded marks and rubric checks"
            >
              <SvgIcon name="zap" size={14} />
              Accept All AI Recommendations
            </button>
          )}

          <Link href="/dashboard/teacher/al-exams/grading" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="arrow-left" size={14} /> Back to Studio
          </Link>

          <button
            type="button"
            onClick={handlePublishGrade}
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "0.55rem 1.4rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 700 }}
          >
            <SvgIcon name="check-circle" size={16} />
            {saving ? "Publishing Grade..." : submission.status === "teacher_verified" ? "Save Grade Revision" : "Approve & Publish Final Grade"}
          </button>
        </div>
      </div>

      {/* ──────────────── HERO METADATA & SCORES KPI CARD ──────────────── */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.75rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
              <span className={`badge ${submission.status === "teacher_verified" ? "badge-success" : submission.status === "ai_graded" ? "badge-purple" : "badge-warning"}`} style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                {submission.status === "teacher_verified" ? "✓ TEACHER VERIFIED" : submission.status === "ai_graded" ? "AI PRE-GRADED (PENDING REVIEW)" : "SUBMITTED"}
              </span>
              <span className={`badge ${isMcq ? "badge-blue" : isStructured ? "badge-purple" : "badge-amber"}`} style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                {isMcq ? "Paper I — MCQ" : isStructured ? "Paper II-A — Structured" : "Paper II-B — Essay"}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Submission #{submission.id}
              </span>
            </div>

            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              {exam?.title || `Examination #${submission.exam_id}`}
            </h1>

            {/* Candidate Details Row */}
            <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem", fontSize: "0.825rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
              <div>Candidate: <strong style={{ color: "var(--text-primary)" }}>{submission.student_name || `Student #${submission.student_id}`}</strong></div>
              <div>Email: <strong style={{ color: "var(--text-primary)" }}>{submission.student_email || `ID: ${submission.student_id}`}</strong></div>
              <div>Submitted: <strong style={{ color: "var(--text-primary)" }}>{submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "In Progress"}</strong></div>
            </div>
          </div>

          {/* Current Score Summary Pill */}
          <div style={{ display: "flex", gap: "1.25rem", background: "var(--bg-secondary)", padding: "0.85rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Final Score</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                {liveTotalScore} <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>/ {maxPossibleScore}</span>
              </div>
            </div>
            <div style={{ width: "1px", background: "var(--border)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Percentage</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {livePercentage}%
              </div>
            </div>
            <div style={{ width: "1px", background: "var(--border)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Grade</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 900, color: liveGrade === "A" ? "#10B981" : liveGrade === "B" ? "#2563EB" : liveGrade === "C" ? "#8B5CF6" : liveGrade === "S" ? "#F59E0B" : "#EF4444" }}>
                {liveGrade}
              </div>
            </div>
          </div>
        </div>

        {/* AI Preliminary Feedback Banner if available */}
        {submission.ai_feedback_summary && (
          <div style={{ marginTop: "1rem", background: "rgba(99, 102, 241, 0.07)", padding: "0.85rem 1.1rem", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <strong style={{ color: "var(--accent-primary)" }}>Gemini AI Preliminary Evaluation: </strong>
              <span style={{ color: "var(--text-secondary)" }}>{submission.ai_feedback_summary}</span>
            </div>
            <button
              type="button"
              onClick={handleAcceptAllAIRecommendations}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            >
              Apply Recommendations
            </button>
          </div>
        )}
      </div>

      {/* ──────────────── REVIEW & MARKING WORKSPACE BY PAPER TYPE ──────────────── */}

      {/* ═══════════════════════════════════════════════════════════════
          CASE A: PAPER I (MCQ) SUBMISSION REVIEW (50 QUESTIONS)
         ═══════════════════════════════════════════════════════════════ */}
      {isMcq && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper I — MCQ Item Submissions ({submission.answers?.length || questionList.length} Items)
            </h2>
            <span className="badge badge-info">Zero Cross-Assessment Contamination</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {(questionList.length > 0 ? questionList : submission.answers || []).map((qOrAns: any, idx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || idx + 1;
              const ans = answersByQuestionId[qId] || (qOrAns.selected_option !== undefined ? qOrAns : null);
              const ov = ans ? overrides[ans.id] : null;

              const stemText = qOrAns.stem_text || `Question ${qNum}`;
              const options = qOrAns.options_json || qOrAns.options || [];
              const correctKey = qOrAns.correct_option || ans?.correct_option || "";
              const selectedOpt = ans?.selected_option || "";
              const isCorrect = ans ? ans.is_correct : (selectedOpt && correctKey && selectedOpt.toUpperCase() === correctKey.toUpperCase());
              const autoScore = ans?.auto_score ?? (isCorrect ? 1.0 : 0.0);
              const teacherScore = ov?.overridePoints ?? autoScore;

              return (
                <div key={qId || idx} className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="badge badge-blue" style={{ fontWeight: 700 }}>Q{qNum}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Format: {qOrAns.template_type || "mcq"}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className={`badge ${selectedOpt ? (isCorrect ? "badge-success" : "badge-error") : "badge-secondary"}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                        {selectedOpt ? (isCorrect ? "✓ Correct (+1.0)" : "✗ Incorrect (0.0)") : "⚪ Unanswered (0.0)"}
                      </span>
                    </div>
                  </div>

                  {/* Question Stem */}
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.55, marginBottom: "0.85rem" }}>
                    {stemText}
                  </div>

                  {/* 5 MCQ Options List */}
                  {Array.isArray(options) && options.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1rem" }}>
                      {options.map((opt: any, optIdx: number) => {
                        const optKey = typeof opt === "string" ? String.fromCharCode(65 + optIdx) : (opt.option_key || String.fromCharCode(65 + optIdx));
                        const optText = typeof opt === "string" ? opt : (opt.option_text || opt.text || "");
                        const isChosen = selectedOpt.toUpperCase() === optKey.toUpperCase();
                        const isKey = correctKey.toUpperCase() === optKey.toUpperCase();

                        return (
                          <div
                            key={optKey}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.55rem 0.85rem",
                              borderRadius: "var(--radius-sm)",
                              background: isChosen ? (isCorrect ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)") : isKey ? "rgba(16, 185, 129, 0.04)" : "var(--bg-secondary)",
                              border: isChosen ? `1.5px solid ${isCorrect ? "#10B981" : "#EF4444"}` : isKey ? "1px solid #10B98150" : "1px solid var(--border-subtle)",
                              fontSize: "0.85rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <strong style={{ color: isKey ? "#10B981" : isChosen ? "#EF4444" : "var(--text-primary)" }}>
                                ({optKey})
                              </strong>
                              <span style={{ color: "var(--text-primary)" }}>{optText}</span>
                            </div>

                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              {isChosen && (
                                <span className={`badge ${isCorrect ? "badge-success" : "badge-error"}`} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                                  Candidate Choice
                                </span>
                              )}
                              {isKey && (
                                <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                                  Correct Key
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Marking Row & Override Controls */}
                  {ans && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.825rem" }}>
                        <div>AI Auto Mark: <strong>{autoScore} pt</strong></div>
                        <div>Teacher Final Mark: <strong style={{ color: "var(--accent-primary)" }}>{teacherScore} pt</strong></div>
                        {teacherScore !== autoScore && (
                          <button
                            type="button"
                            onClick={() => handleAcceptAIRecommendation(ans.id, autoScore)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
                          >
                            Reset to AI Mark
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>Teacher Mark:</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="1"
                          value={teacherScore}
                          onChange={(e) => handleUpdatePoints(ans.id, parseFloat(e.target.value))}
                          className="form-input"
                          style={{ width: "70px", padding: "0.2rem 0.4rem", fontSize: "0.85rem", textAlign: "center", fontWeight: 700 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CASE B: PAPER II-A (STRUCTURED) SUBMISSION REVIEW (4 QUESTIONS)
         ═══════════════════════════════════════════════════════════════ */}
      {isStructured && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper II-A — Structured Subpart Submissions &amp; Academic Hierarchy
            </h2>
            <span className="badge badge-purple">4 Questions • 160 Maximum Marks</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {(questionList.length > 0 ? questionList : submission.answers || []).map((qOrAns: any, qIdx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || qIdx + 1;
              const ans = answersByQuestionId[qId];
              const ov = ans ? overrides[ans.id] : null;

              const stemText = qOrAns.stem_text || `Structured Question ${qNum}`;
              const subpartsJson = qOrAns.structured_subparts_json || [];
              const studentAnswersMap = ans?.subpart_answers_json || {};
              const totalQPoints = Number(qOrAns.points) || 40.0;
              const aiScore = ans?.ai_score ?? 0.0;
              const teacherScore = ov?.overridePoints ?? (ans?.final_score ?? ans?.scaled_points_earned ?? aiScore);

              return (
                <div key={qId || qIdx} className="card" style={{ padding: "1.75rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                  {/* Question Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.85rem", flexWrap: "wrap", gap: "0.85rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="badge badge-purple" style={{ fontWeight: 700 }}>Question {qNum}</span>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{stemText}</h3>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                        <span>Maximum Marks: <strong>{totalQPoints} pts</strong></span>
                        <span>&bull;</span>
                        <span>AI Recommended: <strong style={{ color: "var(--accent-primary)" }}>{aiScore} pts</strong></span>
                        {ans && (
                          <button
                            type="button"
                            onClick={() => handleAcceptAIRecommendation(ans.id, aiScore)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", color: "var(--accent-primary)" }}
                          >
                            Accept AI Score ({aiScore} pts)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setZenModalQuestion({ question: qOrAns, ans, qNum, type: "structured" })}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <SvgIcon name="maximize" size={12} /> Zen Focus Mode
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "var(--bg-secondary)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-muted)" }}>Teacher Score:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={totalQPoints}
                        value={teacherScore}
                        onChange={(e) => ans && handleUpdatePoints(ans.id, parseFloat(e.target.value))}
                        className="form-input"
                        style={{ width: "85px", padding: "0.3rem 0.5rem", fontSize: "1rem", fontWeight: 800, textAlign: "center", color: "var(--accent-primary)" }}
                      />
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>/ {totalQPoints}</span>
                    </div>
                  </div>

                  {/* Subparts Tree Rendering with Generous Reading Space */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", marginBottom: "1.5rem" }}>
                    {Array.isArray(subpartsJson) && subpartsJson.length > 0 ? (
                      subpartsJson.map((partNode: any, pIdx: number) => {
                        const partLabel = getAcademicSubpartLabel(partNode, 0, pIdx);
                        const partChildren = partNode.children || partNode.subparts || [];
                        const hasChildren = Array.isArray(partChildren) && partChildren.length > 0;

                        return (
                          <div key={partNode.id || pIdx} style={{ padding: "1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: hasChildren ? "0.85rem" : "0.5rem" }}>
                              {partLabel}
                            </div>

                            {/* Leaf Node Answer */}
                            {!hasChildren && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                                {partNode.prompt && (
                                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
                                    Prompt: {partNode.prompt}
                                  </div>
                                )}
                                <div style={{ background: "var(--bg-card)", padding: "1rem 1.15rem", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-subtle)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                                      Candidate Written Answer:
                                    </span>
                                    <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                                      Max Points: {partNode.points || partNode.max_points || 4} pts
                                    </span>
                                  </div>
                                  <div style={{ fontSize: "0.925rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: "var(--font-sans, inherit)" }}>
                                    {renderCandidateSubpartAnswer(studentAnswersMap[partNode.id] ?? studentAnswersMap[partLabel])}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Nested Subpart Children (e.g. (i), (ii)) */}
                            {hasChildren && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", paddingLeft: "1rem", borderLeft: "2px solid var(--accent-primary)" }}>
                                {partChildren.map((childNode: any, cIdx: number) => {
                                  const childLabel = getAcademicSubpartLabel(childNode, 1, cIdx);
                                  const rawChildAns = studentAnswersMap[childNode.id] ?? studentAnswersMap[childLabel];

                                  return (
                                    <div key={childNode.id || cIdx} style={{ padding: "0.95rem 1.1rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text-primary)" }}>{childLabel}</span>
                                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Max: {childNode.points || childNode.max_points || 4} pts</span>
                                      </div>

                                      {childNode.prompt && (
                                        <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginBottom: "8px", fontStyle: "italic" }}>
                                          {childNode.prompt}
                                        </div>
                                      )}

                                      <div style={{ background: "var(--bg-secondary)", padding: "0.75rem 0.95rem", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                                        {renderCandidateSubpartAnswer(rawChildAns)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      /* Direct Subpart Answers Rendering if JSON Tree is Flat */
                      Object.entries(studentAnswersMap).map(([partKey, val]) => (
                        <div key={partKey} style={{ background: "var(--bg-secondary)", padding: "1rem 1.15rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <strong style={{ fontSize: "0.9rem", color: "var(--accent-primary)" }}>({partKey}): </strong>
                          <div style={{ marginTop: "6px", fontSize: "0.925rem", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                            {renderCandidateSubpartAnswer(val)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Teacher Feedback Notes for this Structured Question */}
                  {ans && (
                    <div style={{ background: "var(--bg-secondary)", padding: "0.95rem 1.15rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "6px" }}>
                        Teacher Feedback for Question {qNum}:
                      </label>
                      <input
                        type="text"
                        placeholder="Enter specific guidance / feedback notes for this structured question..."
                        value={ov?.feedbackNotes || ""}
                        onChange={(e) => handleUpdateFeedback(ans.id, e.target.value)}
                        className="form-input"
                        style={{ width: "100%", fontSize: "0.85rem" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CASE C: PAPER II-B (ESSAY) SUBMISSION REVIEW (3 ESSAYS)
         ═══════════════════════════════════════════════════════════════ */}
      {isEssay && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper II-B — Essay Responses &amp; Rubric Criteria Evaluation
            </h2>
            <span className="badge badge-amber">3 Essay Questions • 120 Maximum Marks</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
            {(questionList.length > 0 ? questionList : submission.answers || []).map((qOrAns: any, qIdx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || qIdx + 1;
              const ans = answersByQuestionId[qId];
              const ov = ans ? overrides[ans.id] : null;

              const stemText = qOrAns.stem_text || `Essay Question ${qNum}`;
              const criteriaList = extractEssayCriteriaList(qOrAns);
              const totalQPoints = Number(qOrAns.points) || 40.0;
              const aiScore = ans?.ai_score ?? 0.0;
              const teacherScore = ov?.overridePoints ?? (ans?.final_score ?? ans?.scaled_points_earned ?? aiScore);
              const checklistResults = ov?.checklistResults || [];
              const wordCount = (ans?.essay_text_answer || "").split(/\s+/).filter(Boolean).length;
              const aiChecklist = ans?.ai_checklist_results_json?.checklist_evaluations || ans?.ai_checklist_results_json || [];

              return (
                <div key={qId || qIdx} className="card" style={{ padding: "1.75rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                  {/* Question Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.85rem", flexWrap: "wrap", gap: "0.85rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="badge badge-amber" style={{ fontWeight: 700 }}>Essay {qNum}</span>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{stemText}</h3>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                        <span>Max Marks: <strong>{totalQPoints} pts</strong></span>
                        <span>&bull;</span>
                        <span>AI Suggested: <strong style={{ color: "var(--accent-primary)" }}>{aiScore} pts</strong></span>
                        <span>&bull;</span>
                        <span>Criteria: <strong>{criteriaList.length} rubric items</strong></span>
                        {ans && (
                          <button
                            type="button"
                            onClick={() => handleAcceptAIRecommendation(ans.id, aiScore, aiChecklist)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", color: "var(--accent-primary)" }}
                          >
                            Accept AI Score ({aiScore} pts)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setZenModalQuestion({ question: qOrAns, ans, qNum, type: "essay" })}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <SvgIcon name="maximize" size={12} /> Zen Focus Mode
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "var(--bg-secondary)", padding: "0.5rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-muted)" }}>Teacher Score:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={totalQPoints}
                        value={teacherScore}
                        onChange={(e) => ans && handleUpdatePoints(ans.id, parseFloat(e.target.value))}
                        className="form-input"
                        style={{ width: "85px", padding: "0.3rem 0.5rem", fontSize: "1rem", fontWeight: 800, textAlign: "center", color: "var(--accent-primary)" }}
                      />
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>/ {totalQPoints}</span>
                    </div>
                  </div>

                  {/* Main Grid: Student Text (Left 58%) vs Rubric Criteria (Right 42%) */}
                  <div style={{ display: "grid", gridTemplateColumns: readingLayout === "wide_focus" ? "58% 42%" : "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                    {/* Left Column: Student Essay Text Script & Diagram */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                            Candidate Essay Submission
                          </h4>
                          <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                            {wordCount} words
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => setEssayFontSize((prev) => (prev === "normal" ? "large" : "normal"))}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
                            title="Toggle reading font size"
                          >
                            {essayFontSize === "normal" ? "A+" : "A-"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setZenModalQuestion({ question: qOrAns, ans, qNum, type: "essay" })}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            title="Open full-screen distraction-free reader"
                          >
                            <SvgIcon name="maximize" size={11} /> Read Zen
                          </button>
                        </div>
                      </div>

                      <div style={{ background: "var(--bg-secondary)", padding: "1.25rem 1.4rem", borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-subtle)", fontSize: essayFontSize === "large" ? "1.05rem" : "0.935rem", lineHeight: 1.8, maxHeight: "480px", overflowY: "auto", whiteSpace: "pre-wrap", color: "var(--text-primary)", fontFeatureSettings: "'calt', 'liga'" }}>
                        {ans?.essay_text_answer || "— No written essay answer recorded —"}
                      </div>

                      {/* Diagram Image Attachment with Lightbox Zoom */}
                      {ans?.essay_attachment_url && (
                        <div style={{ marginTop: "1rem", background: "var(--bg-secondary)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>Attached Scientific Diagram:</span>
                            <button
                              type="button"
                              onClick={() => setZoomedImage(ans.essay_attachment_url || null)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <SvgIcon name="search" size={11} /> Zoom Diagram
                            </button>
                          </div>
                          <img
                            src={ans.essay_attachment_url}
                            alt="Student Diagram"
                            onClick={() => setZoomedImage(ans.essay_attachment_url || null)}
                            style={{ maxWidth: "100%", maxHeight: "240px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", cursor: "zoom-in", display: "block" }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Right Column: Marking Scheme Rubric Checklist */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.4rem" }}>
                        <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                          Rubric Criteria &amp; Teacher Attainment Checks
                        </h4>

                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          {criteriaList.length > 0 && ans && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleBulkChecklist(ans.id, criteriaList, true)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                              >
                                Check All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkChecklist(ans.id, criteriaList, false)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                              >
                                Clear
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", maxHeight: "480px", overflowY: "auto", paddingRight: "4px" }}>
                        {criteriaList.length > 0 ? (
                          criteriaList.map((c, cIdx) => {
                            const isChecked = checklistResults[cIdx]?.awarded ?? false;
                            const aiIdentified = Array.isArray(aiChecklist) && (aiChecklist[cIdx]?.awarded ?? false);

                            return (
                              <div
                                key={c.item_number || cIdx}
                                onClick={() => ans && handleToggleChecklist(ans.id, cIdx, c.max_points)}
                                style={{
                                  padding: "0.75rem 0.95rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: isChecked ? "rgba(16, 185, 129, 0.09)" : "var(--bg-secondary)",
                                  border: isChecked ? "1.5px solid #10B98160" : "1px solid var(--border-subtle)",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "0.75rem",
                                  transition: "all 0.15s",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}} // handled by parent onClick
                                  style={{ marginTop: "3px", cursor: "pointer", width: "16px", height: "16px" }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                      <span style={{ fontWeight: 800, fontSize: "0.82rem", color: isChecked ? "#10B981" : "var(--text-primary)" }}>
                                        Criterion #{c.item_number}
                                      </span>
                                      {aiIdentified && (
                                        <span className="badge badge-purple" style={{ fontSize: "0.62rem", padding: "1px 5px" }}>
                                          AI: ✓ Detected
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: isChecked ? "#10B981" : "var(--text-muted)" }}>
                                      +{c.max_points} pts
                                    </span>
                                  </div>
                                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "3px", lineHeight: 1.45 }}>
                                    {c.criterion_text}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                            Standard holistic grading applied. Set score override directly in the top-right field.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Teacher Feedback Notes for Essay Question */}
                  {ans && (
                    <div style={{ background: "var(--bg-secondary)", padding: "0.95rem 1.15rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "6px" }}>
                        Teacher Feedback for Essay {qNum}:
                      </label>
                      <input
                        type="text"
                        placeholder="Enter specific feedback / remarks on candidate's scientific arguments..."
                        value={ov?.feedbackNotes || ""}
                        onChange={(e) => handleUpdateFeedback(ans.id, e.target.value)}
                        className="form-input"
                        style={{ width: "100%", fontSize: "0.85rem" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────── OVERALL SUBMISSION FEEDBACK & FINAL PUBLISH BAR ──────────────── */}
      <div className="card" style={{ padding: "1.75rem", marginTop: "2rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "var(--text-primary)" }}>
          Overall Examination Feedback &amp; Final Assessment Notes
        </h3>
        <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>
          This feedback will be published to the student's result view alongside their verified mark and G.C.E. A/L grade.
        </p>

        <textarea
          rows={3}
          placeholder="Provide comprehensive performance summary and revision guidance for the candidate..."
          value={teacherFeedback}
          onChange={(e) => setTeacherFeedback(e.target.value)}
          className="form-input"
          style={{ width: "100%", fontSize: "0.88rem", lineHeight: 1.55, marginBottom: "1.25rem" }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <span style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>Total Calculated Marks:</span>
            <strong style={{ fontSize: "1.25rem", color: "var(--accent-primary)" }}>{liveTotalScore} / {maxPossibleScore}</strong>
            <span className="badge badge-info" style={{ fontWeight: 800, fontSize: "0.85rem" }}>{livePercentage}% ({liveGrade})</span>
          </div>

          <button
            type="button"
            onClick={handlePublishGrade}
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "0.65rem 1.85rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem" }}
          >
            <SvgIcon name="check-circle" size={18} />
            {saving ? "Publishing Grade..." : submission.status === "teacher_verified" ? "Save Grade Revision" : "Approve & Publish Final Grade"}
          </button>
        </div>
      </div>

      {/* ──────────────── ZEN FULLSCREEN READING & MARKING MODAL ──────────────── */}
      {zenModalQuestion && (
        <Modal
          onClose={() => setZenModalQuestion(null)}
          title={`Question ${zenModalQuestion.qNum} — Focus Reading & Marking View`}
          maxWidth="920px"
        >
          <div style={{ padding: "1.5rem", maxWidth: "900px", width: "100%" }}>
            <div style={{ marginBottom: "1.25rem", paddingBottom: "0.85rem", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span className="badge badge-primary">Question {zenModalQuestion.qNum}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Max Marks: {zenModalQuestion.question.points || 40} pts
                </span>
              </div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5 }}>
                {zenModalQuestion.question.stem_text || `Question ${zenModalQuestion.qNum}`}
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                Candidate Response:
              </h4>
              <div style={{ background: "var(--bg-secondary)", padding: "1.4rem", borderRadius: "var(--radius-md)", fontSize: "1rem", lineHeight: 1.85, whiteSpace: "pre-wrap", maxHeight: "420px", overflowY: "auto", border: "1.5px solid var(--border-subtle)" }}>
                {zenModalQuestion.ans?.essay_text_answer ||
                  (zenModalQuestion.ans?.subpart_answers_json ? JSON.stringify(zenModalQuestion.ans.subpart_answers_json, null, 2) : "— No written response —")}
              </div>

              {zenModalQuestion.ans?.essay_attachment_url && (
                <div style={{ marginTop: "1rem" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)" }}>Diagram Attachment:</span>
                  <img
                    src={zenModalQuestion.ans.essay_attachment_url}
                    alt="Diagram"
                    style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "var(--radius-sm)", marginTop: "6px", display: "block" }}
                  />
                </div>
              )}
            </div>

            {zenModalQuestion.ans && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Teacher Score Override</div>
                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>Adjust points for this question</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={zenModalQuestion.question.points || 40}
                    value={overrides[zenModalQuestion.ans.id]?.overridePoints ?? 0}
                    onChange={(e) => handleUpdatePoints(zenModalQuestion.ans.id, parseFloat(e.target.value))}
                    className="form-input"
                    style={{ width: "90px", padding: "0.4rem 0.6rem", fontSize: "1.1rem", fontWeight: 800, textAlign: "center", color: "var(--accent-primary)" }}
                  />
                  <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>/ {zenModalQuestion.question.points || 40}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setZenModalQuestion(null)} className="btn btn-primary">
                Done Reviewing
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── DIAGRAM LIGHTBOX MODAL ──────────────── */}
      {zoomedImage && (
        <Modal
          onClose={() => setZoomedImage(null)}
          title="Candidate Scientific Diagram — Full Resolution View"
          maxWidth="90vw"
        >
          <div style={{ padding: "1.5rem", textAlign: "center" }}>
            <img
              src={zoomedImage}
              alt="Zoomed Student Diagram"
              style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: "var(--radius-sm)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)" }}
            />
            <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setZoomedImage(null)} className="btn btn-secondary">
                Close Viewer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}
