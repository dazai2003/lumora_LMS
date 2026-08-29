"use client";

/**
 * Lumora Teacher SpeedGrader & Assessment Verification Studio.
 * 
 * High-performance grading workstation for evaluating A/L Paper I (MCQ), Paper II-A (Structured),
 * and Paper II-B (Essay) candidate scripts.
 * 
 * Key Design Decisions & Notes:
 * 1. Granular Structured Subpart Scoring:
 *    - Hierarchical tree rendering: Part (a), (b) -> Subpart (i), (ii) -> Section (a), (b).
 *    - Each subpart has independent numerical mark adjustment controls capped by that node's max points.
 * 2. 2-Column Essay Evaluation Workstation:
 *    - Left Column (58%): Student's written answer with biological diagrams and formatting.
 *    - Right Column (42%): Official marking criteria checklist with Gemini AI pre-detection badges.
 *    - Custom Criteria: Teachers can add ad-hoc criteria directly to award points for unique insights.
 * 3. Pure MCQ Verification:
 *    - Shows candidate choices vs official keys, and provides a 1-click 'Confirm & Accept MCQ Marking' flow.
 * 4. Human Final Authority:
 *    - Final certification commits 'teacher_verified' status and publishes official A/L letter grades.
 */

import { useEffect, useState, use, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface EssayCriterionItem {
  item_number: number;
  criterion_text: string;
  max_points: number;
  accepted_alternatives?: string;
}

function extractEssayCriteriaList(question: ALQuestion): Array<EssayCriterionItem> {
  const raw = question.essay_checklist_json;
  if (!raw) return [];
  const list: Array<EssayCriterionItem> = [];

  if (Array.isArray(raw)) {
    raw.forEach((it: any, idx: number) => {
      if (typeof it === "object") {
        list.push({
          item_number: it.item_number || it.number || idx + 1,
          criterion_text: it.description || it.criterion || it.text || `Criterion ${idx + 1}`,
          max_points: Number(it.marks || it.points || it.max_points || 5.0),
          accepted_alternatives: it.accepted_alternatives || it.alternatives || "",
        });
      } else {
        list.push({ item_number: idx + 1, criterion_text: String(it), max_points: 5.0 });
      }
    });
  } else if (typeof raw === "object") {
    // 1. Check direct answer_points / criteria first (especially for single_complete)
    const direct = raw.answer_points || raw.criteria || raw.marking_points || [];
    const fmt = raw.structure_format || raw.structure_type;

    if (Array.isArray(direct) && direct.length > 0 && (fmt === "single_complete" || !raw.subparts || raw.subparts.length === 0)) {
      direct.forEach((pt: any, idx: number) => {
        list.push({
          item_number: pt.item_number || idx + 1,
          criterion_text: pt.description || pt.criterion || pt.text || `Criterion ${idx + 1}`,
          max_points: Number(pt.marks || pt.points || pt.max_points || 5.0),
          accepted_alternatives: pt.accepted_alternatives || pt.alternatives || "",
        });
      });
    } else {
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
                accepted_alternatives: pt.accepted_alternatives || pt.alternatives || "",
              });
              count++;
            });
          } else {
            list.push({
              item_number: count,
              criterion_text: `${label} ${sp.prompt || ""}`.trim(),
              max_points: Number(sp.marks || sp.max_points || 10.0),
              accepted_alternatives: sp.accepted_alternatives || "",
            });
            count++;
          }
        });
      } else if (Array.isArray(direct) && direct.length > 0) {
        direct.forEach((pt: any, idx: number) => {
          list.push({
            item_number: pt.item_number || idx + 1,
            criterion_text: pt.description || pt.criterion || pt.text || `Criterion ${idx + 1}`,
            max_points: Number(pt.marks || pt.points || pt.max_points || 5.0),
            accepted_alternatives: pt.accepted_alternatives || pt.alternatives || "",
          });
        });
      }
    }
  }
  return list;
}

function resolveCandidateSubpartAnswer(node: any, depth: number, index: number, answersMap: Record<string, any>): any {
  if (!answersMap || typeof answersMap !== "object") return null;
  const nodeId = String(node?.id || "").trim();
  const partLabel = getAcademicSubpartLabel(node, depth, index);
  const displayLabel = String(node?.display_label || node?.label || node?.part_label || "").trim();

  // 1. Direct key match
  if (nodeId && answersMap[nodeId] !== undefined && answersMap[nodeId] !== "") return answersMap[nodeId];
  if (displayLabel && answersMap[displayLabel] !== undefined && answersMap[displayLabel] !== "") return answersMap[displayLabel];
  if (partLabel && answersMap[partLabel] !== undefined && answersMap[partLabel] !== "") return answersMap[partLabel];

  // 2. Scan for composite keys matching this node
  const searchPrefixes = [nodeId, displayLabel, partLabel].filter(Boolean);
  const allKeys = Object.keys(answersMap);

  for (const prefix of searchPrefixes) {
    const matchingKeys = allKeys.filter((k) => k === prefix || k.startsWith(`${prefix}__`));
    if (matchingKeys.length === 0) continue;

    // A. Biological drawing
    const drawingKey = matchingKeys.find((k) => k.endsWith("__drawing"));
    if (drawingKey && answersMap[drawingKey]) {
      return { type: "drawing", data: answersMap[drawingKey] };
    }

    // B. Sequential pathway steps (__seq_0, __seq_1, ...)
    const seqKeys = matchingKeys.filter((k) => k.includes("__seq_")).sort((a, b) => {
      const idxA = parseInt(a.split("__seq_")[1] || "0", 10);
      const idxB = parseInt(b.split("__seq_")[1] || "0", 10);
      return idxA - idxB;
    });
    if (seqKeys.length > 0) {
      const steps = seqKeys
        .map((k, idx) => ({
          step: idx + 1,
          text: answersMap[k],
        }))
        .filter((s) => Boolean(s.text && String(s.text).trim()));
      if (steps.length > 0) {
        return { type: "sequence", steps };
      }
    }

    // C. Comparison table (__comp_0_v1, __comp_0_v2, ...)
    const compKeys = matchingKeys.filter((k) => k.includes("__comp_"));
    if (compKeys.length > 0) {
      const pairs = node.comparison_pairs || node.comparison_data?.pairs || [];
      const header1 = node.comparison_header_1 || "Structure / Feature A";
      const header2 = node.comparison_header_2 || "Structure / Feature B";
      const rows: Array<{ criterion: string; val1: string; val2: string }> = [];

      pairs.forEach((cp: any, idx: number) => {
        const k1 = `${prefix}__comp_${idx}_v1`;
        const k2 = `${prefix}__comp_${idx}_v2`;
        const v1 = answersMap[k1] || "";
        const v2 = answersMap[k2] || "";
        if (v1 || v2) {
          rows.push({
            criterion: cp.criterion || `Feature ${idx + 1}`,
            val1: v1,
            val2: v2,
          });
        }
      });

      if (rows.length === 0) {
        compKeys.forEach((k) => {
          if (answersMap[k]) {
            rows.push({ criterion: k.replace(`${prefix}__comp_`, "Comparison "), val1: answersMap[k], val2: "" });
          }
        });
      }

      if (rows.length > 0) {
        return { type: "comparison", header1, header2, rows };
      }
    }

    // D. Matrix / Classification Table (__cell_0_1, ...)
    const cellKeys = matchingKeys.filter((k) => k.includes("__cell_"));
    if (cellKeys.length > 0) {
      const matrixRows = node.matrix_data?.rows || node.table_data?.rows || [];
      const headers = node.matrix_data?.col_headers || node.table_data?.headers || ["Biological Item / Structure", "Function / Classification"];
      const rows: Array<{ item: string; value: string }> = [];

      matrixRows.forEach((row: any, rIdx: number) => {
        const isObj = Boolean(row && typeof row === "object" && "item" in row);
        const itemLabel = isObj ? row.item : Array.isArray(row) ? row[0] : `Row ${rIdx + 1}`;
        const cKey = `${prefix}__cell_${rIdx}_1`;
        const cVal = answersMap[cKey] || "";
        if (cVal) {
          rows.push({ item: itemLabel, value: cVal });
        }
      });

      if (rows.length === 0) {
        cellKeys.forEach((k, idx) => {
          if (answersMap[k]) {
            rows.push({ item: `Entry ${idx + 1}`, value: answersMap[k] });
          }
        });
      }

      if (rows.length > 0) {
        return { type: "matrix", headers, rows };
      }
    }

    // E. General matching keys aggregation
    const nonBlankEntries = matchingKeys
      .filter((k) => answersMap[k] && String(answersMap[k]).trim())
      .map((k) => [k.replace(`${prefix}__`, ""), answersMap[k]]);
    if (nonBlankEntries.length > 0) {
      return Object.fromEntries(nonBlankEntries);
    }
  }

  return null;
}

function renderCandidateSubpartAnswer(val: any): React.ReactNode {
  if (val === null || val === undefined || val === "") {
    return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— Unanswered —</span>;
  }

  // Biological Drawing
  if (typeof val === "object" && val.type === "drawing" && val.data) {
    return (
      <div style={{ marginTop: "0.4rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <SvgIcon name="image" size={13} />
          <span>Biological Diagram / Canvas Response:</span>
        </div>
        <img
          src={val.data}
          alt="Candidate Drawing"
          style={{ maxWidth: "100%", maxHeight: "260px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "#ffffff" }}
        />
      </div>
    );
  }

  // Sequential Pathway
  if (typeof val === "object" && val.type === "sequence" && Array.isArray(val.steps)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <SvgIcon name="arrow-right" size={13} />
          <span>Sequential Pathway Steps:</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "0.5rem" }}>
          {val.steps.map((s: any, sIdx: number) => (
            <div
              key={sIdx}
              style={{
                flex: "1 1 200px",
                padding: "0.6rem 0.85rem",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent-primary)", marginBottom: "0.2rem" }}>
                Step {s.step}
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                {String(s.text)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Comparison Table
  if (typeof val === "object" && val.type === "comparison" && Array.isArray(val.rows)) {
    return (
      <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border)", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <th style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 700 }}>Feature / Criterion</th>
              <th style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 700 }}>{val.header1 || "Structure A"}</th>
              <th style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 700 }}>{val.header2 || "Structure B"}</th>
            </tr>
          </thead>
          <tbody>
            {val.rows.map((r: any, rIdx: number) => (
              <tr key={rIdx}>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", fontWeight: 600, background: "var(--bg-secondary)" }}>{r.criterion}</td>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{String(r.val1)}</td>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{String(r.val2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Matrix Table
  if (typeof val === "object" && val.type === "matrix" && Array.isArray(val.rows)) {
    return (
      <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border)", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <th style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 700 }}>{val.headers?.[0] || "Item"}</th>
              <th style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 700 }}>{val.headers?.[1] || "Response"}</th>
            </tr>
          </thead>
          <tbody>
            {val.rows.map((r: any, rIdx: number) => (
              <tr key={rIdx}>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem", fontWeight: 600, background: "var(--bg-secondary)" }}>{r.item}</td>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{String(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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

  const router = useRouter();
  const { addToast } = useToast();
  const [submission, setSubmission] = useState<ALStudentSubmission | null>(null);
  const [exam, setExam] = useState<ALExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Focus layout & reading space states
  const [readingLayout, setReadingLayout] = useState<"standard" | "wide_focus">("wide_focus");
  const [activeSectionTab, setActiveSectionTab] = useState<"all" | "paper1" | "paper2_structured" | "paper2_essay">("all");
  const [zenModalQuestion, setZenModalQuestion] = useState<{ question: any; ans: any; qNum: number; type: "structured" | "essay" } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [essayFontSize, setEssayFontSize] = useState<"normal" | "large">("normal");

  // Editable teacher overrides state
  const [overrides, setOverrides] = useState<Record<number, {
    overridePoints: number;
    checklistResults: any[];
    feedbackNotes: string;
  }>>({});
  
  // Per-subpart marks for structured questions: answerId -> { [subpartKey]: number }
  const [subpartMarks, setSubpartMarks] = useState<Record<number, Record<string, number>>>({});

  // Custom teacher criteria for essay questions: answerId -> Array<{ id: string; text: string; max_points: number; points_earned: number }>
  const [customCriteria, setCustomCriteria] = useState<Record<number, Array<{ id: string; text: string; max_points: number; points_earned: number }>>>({});
  const [newCustomPointText, setNewCustomPointText] = useState<Record<number, string>>({});
  const [newCustomPointMarks, setNewCustomPointMarks] = useState<Record<number, number>>({});

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

        // Initialize overrides from teacher scores or existing submissions
        const initOverrides: Record<number, { overridePoints: number; checklistResults: any[]; feedbackNotes: string }> = {};
        const initSubpartMarks: Record<number, Record<string, number>> = {};
        const initCustomCriteria: Record<number, any[]> = {};

        (data.answers || []).forEach((ans) => {
          const checklist = ans.teacher_checklist_results_json || [];
          const currentScore = ans.teacher_override_points ?? ans.final_score ?? ans.scaled_points_earned ?? (ans.auto_score || 0.0);
          
          initOverrides[ans.id] = {
            overridePoints: currentScore,
            checklistResults: Array.isArray(checklist) ? checklist : [],
            feedbackNotes: ans.feedback_notes || "",
          };

          // Extract stored subpart scores if any
          if (ans.teacher_checklist_results_json && typeof ans.teacher_checklist_results_json === "object" && !Array.isArray(ans.teacher_checklist_results_json)) {
            if (ans.teacher_checklist_results_json.subpart_scores) {
              initSubpartMarks[ans.id] = ans.teacher_checklist_results_json.subpart_scores;
            }
            if (Array.isArray(ans.teacher_checklist_results_json.custom_criteria)) {
              initCustomCriteria[ans.id] = ans.teacher_checklist_results_json.custom_criteria;
            }
          }
        });

        setOverrides(initOverrides);
        setSubpartMarks(initSubpartMarks);
        setCustomCriteria(initCustomCriteria);

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

  const isQuestionStructured = useCallback((q: any) =>
    q.template_type === "structured_subparts" ||
    (Array.isArray(q.structured_subparts_json) && q.structured_subparts_json.length > 0), []);

  const isQuestionEssay = useCallback((q: any) =>
    (q.template_type as string) === "essay_rubric" ||
    (q.template_type as string) === "essay_checklist" ||
    (q.template_type as string) === "essay" ||
    Boolean(q.essay_checklist_json), []);

  const isQuestionMCQ = useCallback((q: any) => !isQuestionStructured(q) && !isQuestionEssay(q), [isQuestionStructured, isQuestionEssay]);

  const questionList = useMemo(() => exam?.questions && exam.questions.length > 0 ? exam.questions : [], [exam]);

  const mcqQuestions = useMemo(() => {
    return questionList.filter(isQuestionMCQ);
  }, [questionList, isQuestionMCQ]);

  const structuredQuestions = useMemo(() => {
    return questionList.filter(isQuestionStructured);
  }, [questionList, isQuestionStructured]);

  const essayQuestions = useMemo(() => {
    return questionList.filter(isQuestionEssay);
  }, [questionList, isQuestionEssay]);

  const paperType = exam?.exam_type || (submission?.exam_id === 210 ? "paper_1_mcq" : submission?.exam_id === 212 ? "paper_2_structured" : "paper_2_essay");
  const isMcq = paperType === "paper_1_mcq";
  const isStructured = paperType === "paper_2_structured";
  const isEssay = paperType === "paper_2_essay";

  const hasMcq = mcqQuestions.length > 0 || isMcq;
  const hasStructured = structuredQuestions.length > 0 || isStructured;
  const hasEssay = essayQuestions.length > 0 || isEssay;
  const isFullPaper = (paperType as string) === "full_paper" || (paperType as string) === "full_exam" || (hasMcq && (hasStructured || hasEssay));

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

  // Update question-level points directly
  const handleUpdatePoints = (answerId: number, newPoints: number) => {
    setOverrides((prev) => ({
      ...prev,
      [answerId]: {
        ...(prev[answerId] || { checklistResults: [], feedbackNotes: "" }),
        overridePoints: Math.max(0, Number(newPoints) || 0.0),
      },
    }));
  };

  // Update structured subpart mark directly & recalculate question total
  const handleUpdateSubpartMark = (answerId: number, subpartKey: string, mark: number, maxPoints: number) => {
    const validMark = Math.max(0, Math.min(maxPoints, Number(mark) || 0));
    setSubpartMarks((prev) => {
      const qMarks = { ...(prev[answerId] || {}) };
      qMarks[subpartKey] = validMark;
      
      const newTotal = Object.values(qMarks).reduce((sum, val) => sum + val, 0);
      handleUpdatePoints(answerId, Math.round(newTotal * 100) / 100);

      return {
        ...prev,
        [answerId]: qMarks,
      };
    });
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

  // Bulk check / clear all criteria for essay
  const handleBulkChecklist = (answerId: number, criteriaList: any[], awardAll: boolean, maxTotal: number) => {
    const updatedList = criteriaList.map((c) => ({
      awarded: awardAll,
      max_points: c.max_points,
      points_earned: awardAll ? c.max_points : 0.0,
      criterion_text: c.criterion_text,
    }));

    const criteriaSum = awardAll ? criteriaList.reduce((sum, c) => sum + c.max_points, 0) : 0;
    const customList = customCriteria[answerId] || [];
    const customSum = customList.reduce((sum, c) => sum + (Number(c.points_earned) || 0), 0);
    const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);

    setOverrides((prev) => ({
      ...prev,
      [answerId]: {
        ...(prev[answerId] || { feedbackNotes: "" }),
        checklistResults: updatedList,
        overridePoints: Math.round(calculatedTotal * 100) / 100,
      },
    }));
  };

  // Toggle criterion full award checkbox
  const handleToggleCriterionCheckbox = (answerId: number, cIdx: number, criterion: any, maxTotal: number) => {
    setOverrides((prev) => {
      const current = prev[answerId] || { overridePoints: 0.0, checklistResults: [], feedbackNotes: "" };
      const updatedList = Array.isArray(current.checklistResults) ? [...current.checklistResults] : [];

      while (updatedList.length <= cIdx) {
        updatedList.push({ awarded: false, max_points: criterion.max_points, points_earned: 0.0, criterion_text: criterion.criterion_text });
      }

      const item = { ...(updatedList[cIdx] || { awarded: false, max_points: criterion.max_points, points_earned: 0.0, criterion_text: criterion.criterion_text }) };
      item.awarded = !item.awarded;
      item.points_earned = item.awarded ? (Number(criterion.max_points) || 4.0) : 0.0;
      item.max_points = criterion.max_points;
      item.criterion_text = criterion.criterion_text;
      updatedList[cIdx] = item;

      // Recalculate total with custom points
      const criteriaSum = updatedList.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const customList = customCriteria[answerId] || [];
      const customSum = customList.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);

      return {
        ...prev,
        [answerId]: {
          ...current,
          checklistResults: updatedList,
          overridePoints: Math.round(calculatedTotal * 100) / 100,
        },
      };
    });
  };

  // Update partial credit on a specific criterion
  const handleUpdateCriterionPartialMark = (answerId: number, cIdx: number, criterion: any, earnedPoints: number, maxTotal: number) => {
    const validEarned = Math.max(0, Math.min(criterion.max_points, Number(earnedPoints) || 0));
    setOverrides((prev) => {
      const current = prev[answerId] || { overridePoints: 0.0, checklistResults: [], feedbackNotes: "" };
      const updatedList = Array.isArray(current.checklistResults) ? [...current.checklistResults] : [];

      while (updatedList.length <= cIdx) {
        updatedList.push({ awarded: false, max_points: criterion.max_points, points_earned: 0.0, criterion_text: criterion.criterion_text });
      }

      const item = { ...(updatedList[cIdx] || { awarded: false, max_points: criterion.max_points, points_earned: 0.0, criterion_text: criterion.criterion_text }) };
      item.points_earned = validEarned;
      item.awarded = validEarned > 0;
      item.max_points = criterion.max_points;
      item.criterion_text = criterion.criterion_text;
      updatedList[cIdx] = item;

      const criteriaSum = updatedList.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const customList = customCriteria[answerId] || [];
      const customSum = customList.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);

      return {
        ...prev,
        [answerId]: {
          ...current,
          checklistResults: updatedList,
          overridePoints: Math.round(calculatedTotal * 100) / 100,
        },
      };
    });
  };

  // Add a custom marking point for essay
  const handleAddCustomPoint = (answerId: number, maxTotal: number) => {
    const text = (newCustomPointText[answerId] || "").trim();
    const marks = Number(newCustomPointMarks[answerId]) || 4.0;

    if (!text) {
      addToast("Please enter a description for the custom marking point.", "error");
      return;
    }

    const newPoint = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text,
      max_points: marks,
      points_earned: marks,
    };

    setCustomCriteria((prev) => {
      const list = [...(prev[answerId] || []), newPoint];
      
      // Update overridePoints
      const ov = overrides[answerId];
      const criteriaSum = (ov?.checklistResults || []).reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const customSum = list.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);
      handleUpdatePoints(answerId, Math.round(calculatedTotal * 100) / 100);

      return {
        ...prev,
        [answerId]: list,
      };
    });

    setNewCustomPointText((prev) => ({ ...prev, [answerId]: "" }));
    setNewCustomPointMarks((prev) => ({ ...prev, [answerId]: 4.0 }));
    addToast("Added custom marking point.", "success");
  };

  // Update custom point earned marks
  const handleUpdateCustomPointMark = (answerId: number, pointId: string, earned: number, maxTotal: number) => {
    setCustomCriteria((prev) => {
      const list = (prev[answerId] || []).map((pt) => {
        if (pt.id === pointId) {
          const valid = Math.max(0, Math.min(pt.max_points, Number(earned) || 0));
          return { ...pt, points_earned: valid };
        }
        return pt;
      });

      const ov = overrides[answerId];
      const criteriaSum = (ov?.checklistResults || []).reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const customSum = list.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);
      handleUpdatePoints(answerId, Math.round(calculatedTotal * 100) / 100);

      return {
        ...prev,
        [answerId]: list,
      };
    });
  };

  // Remove a custom marking point
  const handleRemoveCustomPoint = (answerId: number, pointId: string, maxTotal: number) => {
    setCustomCriteria((prev) => {
      const list = (prev[answerId] || []).filter((pt) => pt.id !== pointId);

      const ov = overrides[answerId];
      const criteriaSum = (ov?.checklistResults || []).reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const customSum = list.reduce((sum, it) => sum + (Number(it?.points_earned) || 0), 0);
      const calculatedTotal = Math.min(maxTotal, criteriaSum + customSum);
      handleUpdatePoints(answerId, Math.round(calculatedTotal * 100) / 100);

      return {
        ...prev,
        [answerId]: list,
      };
    });
  };

  const handlePublishGrade = async () => {
    if (!submission) return;
    setSaving(true);
    try {
      const formattedAnswers = Object.entries(overrides).map(([ansIdStr, data]) => {
        const ansId = parseInt(ansIdStr, 10);
        
        // Bundle subpart scores and custom criteria into checklist results for full fidelity
        const payloadChecklist: any = {
          evaluations: data.checklistResults,
          subpart_scores: subpartMarks[ansId] || {},
          custom_criteria: customCriteria[ansId] || [],
        };

        return {
          answer_id: ansId,
          teacher_override_points: data.overridePoints,
          teacher_checklist_results_json: payloadChecklist,
          feedback_notes: data.feedbackNotes,
        };
      });

      const updated = await api.verifyTeacherSubmission(submission.id, {
        answers: formattedAnswers,
        teacher_feedback: teacherFeedback,
      });

      setSubmission(updated);
      addToast("Final grade successfully approved & verified! Redirecting to Marking Studio...", "success");
      setTimeout(() => {
        router.push("/dashboard/teacher/al-exams/marking");
      }, 700);
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
        <Link href="/dashboard/teacher/al-exams/marking" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          Back to Marking Studio
        </Link>
      </div>
    );
  }

  // Map answers by question_id for easy lookup
  const answersByQuestionId: Record<number, ALStudentAnswer> = {};
  (submission.answers || []).forEach((a) => {
    answersByQuestionId[a.question_id] = a;
  });

  return (
    <div style={{ maxWidth: readingLayout === "wide_focus" ? "1560px" : "1280px", width: "98%", margin: "0 auto", padding: "0 1rem 4rem 1rem", boxSizing: "border-box", transition: "max-width 0.25s ease" }}>
      {/* ──────────────── TOP BREADCRUMB & WORKSTATION ACTIONS ──────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          <Link href="/dashboard/teacher" style={{ color: "inherit", textDecoration: "none" }}>Teacher Portal</Link>
          <span>/</span>
          <Link href="/dashboard/teacher/al-exams/marking" style={{ color: "inherit", textDecoration: "none" }}>Marking Studio</Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Submission #{submission.id}</span>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
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

          <Link href="/dashboard/teacher/al-exams/marking" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="arrow-left" size={14} /> Back to Marking Hub
          </Link>
        </div>
      </div>

      {/* ──────────────── SUBMISSION METADATA & LIVE SCORE STRIP ──────────────── */}
      <div className="card" style={{ padding: "1.5rem 1.75rem", marginBottom: "1.75rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1.25rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
              <span className={`badge ${submission.status === "teacher_verified" ? "badge-success" : "badge-warning"}`} style={{ fontWeight: 800 }}>
                {submission.status === "teacher_verified" ? "TEACHER VERIFIED" : "MANUAL TEACHER EVALUATION"}
              </span>
              <span className="badge badge-secondary" style={{ textTransform: "uppercase" }}>
                {paperType.replace(/_/g, " ")}
              </span>
            </div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              {exam?.title || submission.exam_title || `Exam Paper #${submission.exam_id}`}
            </h1>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <span>Student: <strong style={{ color: "var(--text-primary)" }}>{submission.student_name || `Student #${submission.student_id}`}</strong> ({submission.student_email || "N/A"})</span>
              {submission.submitted_at && (
                <span>&bull; Submitted: <strong>{new Date(submission.submitted_at).toLocaleString()}</strong></span>
              )}
            </div>
          </div>

          {/* Live Score Tally Card */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", background: "var(--bg-secondary)", padding: "0.85rem 1.35rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Calculated Score
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 900, color: "var(--text-primary)" }}>
                {liveTotalScore}
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500 }}>
                  {" "}/ {maxPossibleScore} pts
                </span>
              </div>
            </div>

            <div style={{ height: "36px", width: "1px", background: "var(--border)" }} />

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Final Grade
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "2px" }}>
                <span className="badge badge-primary" style={{ fontSize: "1.1rem", fontWeight: 900, padding: "2px 10px" }}>
                  {liveGrade}
                </span>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  {livePercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── SECTION NAVIGATION TABS (FOR FULL PAPER / MULTI-SECTION PAPERS) ──────────────── */}
      {(isFullPaper || (Number(hasMcq) + Number(hasStructured) + Number(hasEssay) > 1)) && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveSectionTab("all")}
            className={`btn btn-sm ${activeSectionTab === "all" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontWeight: 700 }}
          >
            All Sections ({questionList.length} Items)
          </button>
          {hasMcq && (
            <button
              type="button"
              onClick={() => setActiveSectionTab("paper1")}
              className={`btn btn-sm ${activeSectionTab === "paper1" ? "btn-primary" : "btn-secondary"}`}
              style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>Paper I — MCQ</span>
              <span className="badge badge-info" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>{mcqQuestions.length || 50}</span>
            </button>
          )}
          {hasStructured && (
            <button
              type="button"
              onClick={() => setActiveSectionTab("paper2_structured")}
              className={`btn btn-sm ${activeSectionTab === "paper2_structured" ? "btn-primary" : "btn-secondary"}`}
              style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>Paper II-A — Structured</span>
              <span className="badge badge-purple" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>{structuredQuestions.length || 4}</span>
            </button>
          )}
          {hasEssay && (
            <button
              type="button"
              onClick={() => setActiveSectionTab("paper2_essay")}
              className={`btn btn-sm ${activeSectionTab === "paper2_essay" ? "btn-primary" : "btn-secondary"}`}
              style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>Paper II-B — Essay</span>
              <span className="badge badge-amber" style={{ fontSize: "0.68rem", padding: "1px 6px" }}>{essayQuestions.length || 3}</span>
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CASE A: PAPER I (MCQ) SUBMISSION REVIEW (50 QUESTIONS)
         ═══════════════════════════════════════════════════════════════ */}
      {hasMcq && (activeSectionTab === "all" || activeSectionTab === "paper1") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper I — MCQ Submissions &amp; Deterministic Answer Analysis
            </h2>
            <span className="badge badge-info">{(mcqQuestions.length > 0 ? mcqQuestions.length : 50)} Items • Deterministic Auto-Graded</span>
          </div>

          {/* MCQ Teacher Review Notice Banner */}
          <div
            style={{
              padding: "0.85rem 1.15rem",
              borderRadius: "var(--radius-md)",
              background: "rgba(37, 99, 235, 0.08)",
              border: "1px solid rgba(37, 99, 235, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <SvgIcon name="clipboard" size={18} />
              <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                Paper I MCQs are auto-graded deterministically. You can inspect candidate choices, override individual question marks if needed, and confirm the official score below.
              </span>
            </div>
            {submission.status !== "teacher_verified" && (
              <span className="badge badge-warning" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                Pending Teacher Confirmation
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {(mcqQuestions.length > 0 ? mcqQuestions : (isMcq ? (questionList.length > 0 ? questionList : submission.answers || []) : [])).map((qOrAns: any, qIdx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || qIdx + 1;
              const ans = answersByQuestionId[qId];
              const ov = ans ? overrides[ans.id] : null;

              const selectedOpt = ans?.selected_option;
              const correctOpt = qOrAns.correct_option || ans?.correct_option;
              const isCorrect = selectedOpt && correctOpt && selectedOpt.toUpperCase() === correctOpt.toUpperCase();
              const autoScore = ans?.auto_score ?? (isCorrect ? 1.0 : 0.0);
              const teacherScore = ov?.overridePoints ?? (ans?.final_score ?? ans?.scaled_points_earned ?? autoScore);

              return (
                <div key={qId || qIdx} className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                  {/* Stem & Options */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                      <span className="badge badge-secondary" style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        Q{qNum}
                      </span>
                      <div style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
                        {qOrAns.stem_text || `Question ${qNum}`}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <span className={`badge ${isCorrect ? "badge-success" : selectedOpt ? "badge-error" : "badge-secondary"}`}>
                        {selectedOpt ? (isCorrect ? "Correct (+1.0)" : "Incorrect (0.0)") : "Unanswered (0.0)"}
                      </span>
                    </div>
                  </div>

                  {/* Options List */}
                  {Array.isArray(qOrAns.options) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0.75rem 0", paddingLeft: "2rem" }}>
                      {qOrAns.options.map((optStr: string, optIdx: number) => {
                        const optLetter = String.fromCharCode(65 + optIdx);
                        const isChosen = selectedOpt === optLetter;
                        const isKey = correctOpt === optLetter;

                        return (
                          <div
                            key={optIdx}
                            style={{
                              padding: "0.45rem 0.75rem",
                              borderRadius: "var(--radius-sm)",
                              background: isChosen ? (isKey ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)") : isKey ? "rgba(16, 185, 129, 0.06)" : "var(--bg-secondary)",
                              border: isChosen ? (isKey ? "1.5px solid #10B981" : "1.5px solid #EF4444") : isKey ? "1px dashed #10B981" : "1px solid var(--border-subtle)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span><strong>{optLetter}.</strong> {optStr}</span>
                            <div style={{ display: "flex", gap: "0.35rem" }}>
                              {isChosen && (
                                <span className={`badge ${isKey ? "badge-success" : "badge-error"}`} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
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
                      <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        Auto Mark: <strong>{autoScore} pt</strong>
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
      {hasStructured && (activeSectionTab === "all" || activeSectionTab === "paper2_structured") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper II-A — Structured Subpart Submissions &amp; Academic Hierarchy
            </h2>
            <span className="badge badge-purple">{(structuredQuestions.length > 0 ? structuredQuestions.length : 4)} Questions • Structured Dotted Lines</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {(structuredQuestions.length > 0 ? structuredQuestions : (isStructured ? (questionList.length > 0 ? questionList : submission.answers || []) : [])).map((qOrAns: any, qIdx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || qIdx + 1;
              const ans = answersByQuestionId[qId];
              const ov = ans ? overrides[ans.id] : null;

              const stemText = qOrAns.stem_text || `Structured Question ${qNum}`;
              const subpartsJson = qOrAns.structured_subparts_json || [];
              const studentAnswersMap = ans?.subpart_answers_json || {};
              const totalQPoints = Number(qOrAns.points) || 40.0;
              const teacherScore = ov?.overridePoints ?? (ans?.final_score ?? ans?.scaled_points_earned ?? 0.0);
              const currentSubpartScores = (ans && subpartMarks[ans.id]) || {};

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
                      <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-muted)" }}>Total Question Mark:</span>
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

                  {/* Subparts Tree Rendering with Per-Subpart Mark Inputs & Model Answer Reference */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "1.5rem" }}>
                    {Array.isArray(subpartsJson) && subpartsJson.length > 0 ? (
                      subpartsJson.map((partNode: any, pIdx: number) => {
                        const partLabel = getAcademicSubpartLabel(partNode, 0, pIdx);
                        const partChildren = partNode.children || partNode.subparts || [];
                        const hasChildren = Array.isArray(partChildren) && partChildren.length > 0;
                        const partKey = partNode.id || `part_${pIdx}`;
                        const partMaxPoints = Number(partNode.points || partNode.max_points || 4);
                        const awardedPartScore = currentSubpartScores[partKey] ?? "";

                        return (
                          <div key={partNode.id || pIdx} style={{ padding: "1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasChildren ? "0.85rem" : "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                {partLabel}
                              </div>

                              {/* Per-Subpart Mark Input for Leaf Nodes */}
                              {!hasChildren && ans && (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", background: "var(--bg-card)", padding: "0.3rem 0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>Award Marks:</label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={partMaxPoints}
                                    value={awardedPartScore}
                                    placeholder="0"
                                    onChange={(e) => handleUpdateSubpartMark(ans.id, partKey, parseFloat(e.target.value), partMaxPoints)}
                                    className="form-input"
                                    style={{ width: "65px", padding: "0.2rem 0.35rem", fontSize: "0.9rem", fontWeight: 800, textAlign: "center", color: "var(--accent-primary)" }}
                                  />
                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>/ {partMaxPoints} pts</span>
                                </div>
                              )}
                            </div>

                            {/* Leaf Node Answer & Model Reference */}
                            {!hasChildren && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                {partNode.prompt && (
                                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
                                    Prompt: {partNode.prompt}
                                  </div>
                                )}

                                {/* Candidate Answer Box */}
                                <div style={{ background: "var(--bg-card)", padding: "1rem 1.15rem", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border-subtle)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                                      Candidate Written Answer:
                                    </span>
                                    <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                                      Max Points: {partMaxPoints} pts
                                    </span>
                                  </div>
                                  <div style={{ fontSize: "0.925rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: "var(--font-sans, inherit)" }}>
                                    {renderCandidateSubpartAnswer(resolveCandidateSubpartAnswer(partNode, 0, pIdx, studentAnswersMap))}
                                  </div>
                                </div>

                                {/* Official Marking Scheme & Model Answer Card */}
                                {(partNode.marking_scheme || partNode.model_answer || partNode.expected_keywords || partNode.expected_answer) && (
                                  <div style={{ padding: "0.85rem 1rem", background: "rgba(99, 102, 241, 0.04)", borderRadius: "var(--radius-sm)", border: "1px dashed rgba(99, 102, 241, 0.3)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "4px" }}>
                                      <SvgIcon name="book-open" size={13} />
                                      <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                        Official Marking Scheme &amp; Expected Criteria
                                      </span>
                                    </div>
                                    {partNode.model_answer && (
                                      <div style={{ fontSize: "0.825rem", color: "var(--text-primary)", marginBottom: "4px" }}>
                                        <strong>Expected Answer:</strong> {partNode.model_answer}
                                      </div>
                                    )}
                                    {partNode.marking_scheme && (
                                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                                        <strong>Criteria Breakdown:</strong> {partNode.marking_scheme}
                                      </div>
                                    )}
                                    {Array.isArray(partNode.expected_keywords) && partNode.expected_keywords.length > 0 && (
                                      <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>Keywords:</span>
                                        {partNode.expected_keywords.map((kw: string, kwIdx: number) => (
                                          <span key={kwIdx} className="badge badge-secondary" style={{ fontSize: "0.68rem" }}>{kw}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Nested Subpart Children (e.g. (i), (ii)) */}
                            {hasChildren && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingLeft: "1rem", borderLeft: "2px solid var(--accent-primary)" }}>
                                {partChildren.map((childNode: any, cIdx: number) => {
                                  const childLabel = getAcademicSubpartLabel(childNode, 1, cIdx);
                                  const resolvedChildAns = resolveCandidateSubpartAnswer(childNode, 1, cIdx, studentAnswersMap);
                                  const childKey = childNode.id || `${partKey}_child_${cIdx}`;
                                  const childMaxPoints = Number(childNode.points || childNode.max_points || 4);
                                  const awardedChildScore = currentSubpartScores[childKey] ?? "";

                                  return (
                                    <div key={childNode.id || cIdx} style={{ padding: "0.95rem 1.1rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "0.4rem" }}>
                                        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text-primary)" }}>{childLabel}</span>
                                        
                                        {ans && (
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                            <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>Marks:</label>
                                            <input
                                              type="number"
                                              step="0.5"
                                              min="0"
                                              max={childMaxPoints}
                                              value={awardedChildScore}
                                              placeholder="0"
                                              onChange={(e) => handleUpdateSubpartMark(ans.id, childKey, parseFloat(e.target.value), childMaxPoints)}
                                              className="form-input"
                                              style={{ width: "60px", padding: "0.18rem 0.35rem", fontSize: "0.85rem", fontWeight: 800, textAlign: "center", color: "var(--accent-primary)" }}
                                            />
                                            <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--text-muted)" }}>/ {childMaxPoints} pts</span>
                                          </div>
                                        )}
                                      </div>

                                      {childNode.prompt && (
                                        <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginBottom: "8px", fontStyle: "italic" }}>
                                          {childNode.prompt}
                                        </div>
                                      )}

                                      <div style={{ background: "var(--bg-secondary)", padding: "0.75rem 0.95rem", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.65, marginBottom: "0.65rem" }}>
                                        {renderCandidateSubpartAnswer(resolvedChildAns)}
                                      </div>

                                      {/* Child Marking Scheme / Model Answer Reference */}
                                      {(childNode.marking_scheme || childNode.model_answer || childNode.expected_keywords) && (
                                        <div style={{ padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.04)", borderRadius: "var(--radius-sm)", border: "1px dashed rgba(99, 102, 241, 0.25)", fontSize: "0.78rem" }}>
                                          {childNode.model_answer && <div><strong>Expected Answer:</strong> {childNode.model_answer}</div>}
                                          {childNode.marking_scheme && <div><strong>Scheme:</strong> {childNode.marking_scheme}</div>}
                                        </div>
                                      )}
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
      {hasEssay && (activeSectionTab === "all" || activeSectionTab === "paper2_essay") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Paper II-B — Essay Responses &amp; Flexible Rubric Evaluation
            </h2>
            <span className="badge badge-amber">{(essayQuestions.length > 0 ? essayQuestions.length : 3)} Essay Questions • 40-Point Rubric Checklists</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
            {(essayQuestions.length > 0 ? essayQuestions : (isEssay ? (questionList.length > 0 ? questionList : submission.answers || []) : [])).map((qOrAns: any, qIdx: number) => {
              const qId = qOrAns.question_id || qOrAns.id;
              const qNum = qOrAns.question_number || qIdx + 1;
              const ans = answersByQuestionId[qId];
              const ov = ans ? overrides[ans.id] : null;

              const stemText = qOrAns.stem_text || `Essay Question ${qNum}`;
              const criteriaList = extractEssayCriteriaList(qOrAns);
              const totalQPoints = Number(qOrAns.points) || 40.0;
              const teacherScore = ov?.overridePoints ?? (ans?.final_score ?? ans?.scaled_points_earned ?? 0.0);
              const checklistResults = ov?.checklistResults || [];
              const customList = (ans && customCriteria[ans.id]) || [];
              const wordCount = (ans?.essay_text_answer || "").split(/\s+/).filter(Boolean).length;

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
                        <span>Criteria: <strong>{criteriaList.length} rubric items</strong></span>
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
                      <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-muted)" }}>Total Essay Score:</span>
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

                  {/* Main Grid: Student Text (Left 55%) vs Rubric Criteria (Right 45%) */}
                  <div style={{ display: "grid", gridTemplateColumns: readingLayout === "wide_focus" ? "55% 45%" : "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
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

                      <div style={{ background: "var(--bg-secondary)", padding: "1.25rem 1.4rem", borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-subtle)", fontSize: essayFontSize === "large" ? "1.05rem" : "0.935rem", lineHeight: 1.8, maxHeight: "520px", overflowY: "auto", whiteSpace: "pre-wrap", color: "var(--text-primary)", fontFeatureSettings: "'calt', 'liga'" }}>
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

                    {/* Right Column: Marking Scheme Rubric Checklist with Partial Marks & Custom Points */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.4rem" }}>
                        <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                          Marking Scheme Criteria &amp; Partial Marks
                        </h4>

                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          {criteriaList.length > 0 && ans && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleBulkChecklist(ans.id, criteriaList, true, totalQPoints)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                              >
                                Check All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkChecklist(ans.id, criteriaList, false, totalQPoints)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                              >
                                Clear All
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "520px", overflowY: "auto", paddingRight: "4px" }}>
                        {criteriaList.length > 0 ? (
                          criteriaList.map((c, cIdx) => {
                            const isChecked = checklistResults[cIdx]?.awarded ?? false;
                            const pointsEarned = checklistResults[cIdx]?.points_earned ?? (isChecked ? c.max_points : 0.0);

                            return (
                              <div
                                key={c.item_number || cIdx}
                                style={{
                                  padding: "0.75rem 0.95rem",
                                  borderRadius: "var(--radius-sm)",
                                  background: isChecked ? "rgba(16, 185, 129, 0.08)" : "var(--bg-secondary)",
                                  border: isChecked ? "1.5px solid #10B98160" : "1px solid var(--border-subtle)",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "0.75rem",
                                  transition: "all 0.15s",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => ans && handleToggleCriterionCheckbox(ans.id, cIdx, c, totalQPoints)}
                                  style={{ marginTop: "4px", cursor: "pointer", width: "17px", height: "17px" }}
                                />

                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 800, fontSize: "0.82rem", color: isChecked ? "#10B981" : "var(--text-primary)" }}>
                                      Criterion #{c.item_number}
                                    </span>

                                    {/* Partial Mark Input */}
                                    {ans && (
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                        <input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          max={c.max_points}
                                          value={pointsEarned}
                                          onChange={(e) => handleUpdateCriterionPartialMark(ans.id, cIdx, c, parseFloat(e.target.value), totalQPoints)}
                                          className="form-input"
                                          style={{ width: "55px", padding: "0.15rem 0.3rem", fontSize: "0.825rem", textAlign: "center", fontWeight: 700 }}
                                        />
                                        <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--text-muted)" }}>/ {c.max_points} pts</span>
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "3px", lineHeight: 1.45 }}>
                                    {c.criterion_text}
                                    {c.accepted_alternatives && (
                                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "3px" }}>
                                        <em>Acceptable alternatives:</em> {c.accepted_alternatives}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                            Holistic grading applied. Set score override directly in the top-right field.
                          </div>
                        )}

                        {/* Custom Teacher Marking Points List */}
                        {customList.length > 0 && (
                          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--accent-primary)", textTransform: "uppercase" }}>
                              Custom Teacher Allocated Points ({customList.length})
                            </div>
                            {customList.map((pt) => (
                              <div key={pt.id} style={{ padding: "0.65rem 0.85rem", background: "rgba(99, 102, 241, 0.07)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(99, 102, 241, 0.25)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ flex: 1, fontSize: "0.825rem", color: "var(--text-primary)" }}>
                                  <strong>Custom Point:</strong> {pt.text}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  {ans && (
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max={pt.max_points}
                                      value={pt.points_earned}
                                      onChange={(e) => handleUpdateCustomPointMark(ans.id, pt.id, parseFloat(e.target.value), totalQPoints)}
                                      className="form-input"
                                      style={{ width: "55px", padding: "0.15rem 0.3rem", fontSize: "0.825rem", textAlign: "center", fontWeight: 700 }}
                                    />
                                  )}
                                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>/ {pt.max_points} pts</span>
                                  {ans && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCustomPoint(ans.id, pt.id, totalQPoints)}
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: "0.15rem 0.35rem", color: "#EF4444" }}
                                      title="Remove Custom Point"
                                    >
                                      <SvgIcon name="trash" size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Custom Point Input Form */}
                        {ans && (
                          <div style={{ marginTop: "0.75rem", padding: "0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>
                              + Add Custom Student Marking Point:
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                type="text"
                                placeholder="E.g. Student mentioned valid plastocyanin electron carrier step..."
                                value={newCustomPointText[ans.id] || ""}
                                onChange={(e) => setNewCustomPointText((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                                className="form-input"
                                style={{ flex: 1, fontSize: "0.8rem", minWidth: "160px" }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0.5"
                                  max={totalQPoints}
                                  value={newCustomPointMarks[ans.id] ?? 4.0}
                                  onChange={(e) => setNewCustomPointMarks((prev) => ({ ...prev, [ans.id]: parseFloat(e.target.value) || 1.0 }))}
                                  className="form-input"
                                  style={{ width: "55px", fontSize: "0.8rem", textAlign: "center" }}
                                />
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>pts</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddCustomPoint(ans.id, totalQPoints)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
                              >
                                Add Point
                              </button>
                            </div>
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
            {saving
              ? "Publishing Grade..."
              : submission.status === "teacher_verified"
              ? "Save Grade Revision"
              : (hasMcq && !hasStructured && !hasEssay)
              ? "Confirm & Accept MCQ Marking"
              : "Approve & Publish Final Grade"}
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
