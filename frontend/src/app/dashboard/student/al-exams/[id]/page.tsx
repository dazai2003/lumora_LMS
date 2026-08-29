"use client";

import React, { useState, useEffect, use, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api, { ALExam, ALQuestion, ALStudentSubmission } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import QuestionNavigator from "@/components/assessments/QuestionNavigator";
import DottedLineField from "@/components/DottedLineField";
import QuestionDiagramImage from "@/components/assessments/QuestionDiagramImage";
import MCQQuestionPaperRenderer, { normalizeScientificSymbols } from "@/components/assessments/MCQQuestionPaperRenderer";
import StudentEssayRichAnswerArea from "@/components/assessments/StudentEssayRichAnswerArea";
import StudentStructuredQuestionRenderer from "@/components/assessments/StudentStructuredQuestionRenderer";
import {
  normalizeLegacyEssayData,
  stripLeadingNumberingPrefix,
  getRomanLabel,
  getAlphaLabel,
} from "@/lib/alEssayTreeUtils";

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

function resolveCandidateSubpartAnswer(node: any, depth: number, index: number, answersMap: Record<string, any>): any {
  if (!answersMap || typeof answersMap !== "object") return null;
  const nodeId = String(node?.id || "").trim();
  const partLabel = getAcademicSubpartLabel(node, depth, index);
  const displayLabel = String(node?.display_label || node?.label || node?.part_label || "").trim();

  // 1. Check direct keys
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
                {normalizeScientificSymbols(s.text)}
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
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{normalizeScientificSymbols(r.val1)}</td>
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{normalizeScientificSymbols(r.val2)}</td>
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
                <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.65rem" }}>{normalizeScientificSymbols(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return normalizeScientificSymbols(String(val));
  }

  if (Array.isArray(val)) {
    if (val.length === 0) {
      return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— Unanswered —</span>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {val.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
            <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>•</span>
            <span>{typeof item === "object" ? JSON.stringify(item) : normalizeScientificSymbols(String(item))}</span>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ padding: "0.35rem 0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", fontSize: "0.85rem" }}>
            <strong style={{ color: "var(--accent-primary)", marginRight: "0.4rem" }}>{k}:</strong>
            <span>{typeof v === "object" ? JSON.stringify(v) : normalizeScientificSymbols(String(v))}</span>
          </div>
        ))}
      </div>
    );
  }

  return normalizeScientificSymbols(String(val));
}

function StudentALExamTakeContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const examId = parseInt(id);
  const searchParams = useSearchParams();
  const submissionIdParam = searchParams.get("submissionId");
  const requestedSubmissionId = submissionIdParam ? parseInt(submissionIdParam, 10) : null;
  const isRetakeRequested = searchParams.get("retake") === "true";
  const { addToast } = useToast();

  const [exam, setExam] = useState<ALExam | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<ALQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [sessionState, setSessionState] = useState<"available" | "taking" | "submitting" | "review">("available");
  const [paperStage, setPaperStage] = useState<"paper1" | "breather" | "paper2">("paper1");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [subpartAnswers, setSubpartAnswers] = useState<Record<number, Record<string, any>>>({});
  const [essayAnswers, setEssayAnswers] = useState<Record<number, string>>({});
  const [essayImages, setEssayImages] = useState<Record<number, string>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set());

  // Autosave status indicator
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">("saved");

  const [result, setResult] = useState<ALStudentSubmission | null>(null);
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "incorrect">("all");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Mobile question palette drawer toggle
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // Timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Fetch initial exam info and check if already submitted or if viewing specific submission
  useEffect(() => {
    api.getALExam(examId)
      .then(async (data) => {
        setExam(data);
        if (data.questions) setQuestions(data.questions);

        // Case 1: Specific submission explicitly requested (e.g. from Past Attempts modal or table link)
        if (requestedSubmissionId && !isNaN(requestedSubmissionId)) {
          try {
            const specificSub = await api.getALSubmission(requestedSubmissionId);
            if (specificSub) {
              if (specificSub.status === "in_progress") {
                // Resume active attempt
                handleStartExam();
                return;
              } else {
                setResult(specificSub);
                setSubmissionId(specificSub.id);
                setSessionState("review");
                return;
              }
            }
          } catch (err) {
            console.error("Failed to load requested submission:", err);
          }
        }

        // Case 2: Student explicitly clicked "Retake Exam"
        if (isRetakeRequested) {
          setSessionState("available");
          return;
        }

        // Case 3: Default check latest submission
        try {
          const mySub = await api.getMyALSubmission(examId);
          if (mySub && (mySub.status === "submitted" || mySub.status === "ai_graded" || mySub.status === "teacher_verified" || mySub.status === "graded")) {
            setResult(mySub);
            setSubmissionId(mySub.id);
            setSessionState("review");
          } else if (mySub && mySub.status === "in_progress") {
            setSessionState("available");
          }
        } catch (e) {
          // not previously submitted
        }
      })
      .catch((err) => {
        console.error(err);
        addToast("Failed to load A/L Exam details.", "error");
      })
      .finally(() => setLoading(false));
  }, [examId, requestedSubmissionId, isRetakeRequested, addToast]);

  // Start exam attempt handler
  const handleStartExam = async () => {
    if (!exam) return;
    setLoading(true);
    try {
      const session = await api.startALExamAttempt(examId);
      setSubmissionId(session.submission_id);
      setQuestions(session.questions || []);
      setAnswers({});
      setSubpartAnswers({});
      setEssayAnswers({});
      setEssayImages({});
      setFlaggedIds(new Set());
      setCurrentIndex(0);

      // Restore previously saved answers if resuming active attempt
      if (session.saved_answers && typeof session.saved_answers === "object") {
        const restoredAnswers: Record<number, string> = {};
        const restoredSubparts: Record<number, Record<string, any>> = {};
        const restoredEssays: Record<number, string> = {};
        const restoredImages: Record<number, string> = {};

        Object.entries(session.saved_answers).forEach(([qIdStr, ansData]: [string, any]) => {
          const qId = Number(qIdStr);
          if (ansData.selected_option) restoredAnswers[qId] = ansData.selected_option;
          if (ansData.subpart_answers_json) restoredSubparts[qId] = ansData.subpart_answers_json;
          if (ansData.essay_text_answer) restoredEssays[qId] = ansData.essay_text_answer;
          if (ansData.essay_attachment_url) restoredImages[qId] = ansData.essay_attachment_url;
        });

        setAnswers(restoredAnswers);
        setSubpartAnswers(restoredSubparts);
        setEssayAnswers(restoredEssays);
        setEssayImages(restoredImages);
      }

      if (session.time_remaining_seconds !== undefined && session.time_remaining_seconds !== null) {
        setSecondsRemaining(session.time_remaining_seconds);
      } else if (session.time_limit_minutes > 0) {
        setSecondsRemaining(session.time_limit_minutes * 60);
      }

      if (session.is_resumed) {
        addToast("Resumed active examination. All previously entered answers restored.", "info");
      }

      setSessionState("taking");
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to start exam attempt.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Timer countdown hook
  useEffect(() => {
    if (sessionState !== "taking" || secondsRemaining === null) return;
    if (secondsRemaining <= 0) {
      addToast("Time limit reached! Submitting your exam automatically...", "warning");
      handleFinalSubmit();
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState, secondsRemaining]);

  // Background Autosave (debounced with local state retention and network status)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (sessionState !== "taking" || !submissionId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");

    saveTimeoutRef.current = setTimeout(async () => {
      const formattedAnswers = questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id] || undefined,
        subpart_answers_json: subpartAnswers[q.id] || undefined,
        essay_text_answer: essayAnswers[q.id] || undefined,
        essay_attachment_url: essayImages[q.id] || undefined,
      })).filter((a) => a.selected_option || a.subpart_answers_json || a.essay_text_answer || a.essay_attachment_url);

      if (formattedAnswers.length > 0) {
        try {
          await api.autosaveALAnswers(submissionId, formattedAnswers);
          setSaveStatus("saved");
        } catch (err) {
          // Keep local state intact without interrupting the student
          setSaveStatus("offline");
        }
      } else {
        setSaveStatus("saved");
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [answers, subpartAnswers, essayAnswers, essayImages, sessionState, submissionId, questions]);

  // Window beforeunload listener to ensure in-flight answers are saved immediately
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionState === "taking" && submissionId) {
        const formattedAnswers = questions.map((q) => ({
          question_id: q.id,
          selected_option: answers[q.id] || undefined,
          subpart_answers_json: subpartAnswers[q.id] || undefined,
          essay_text_answer: essayAnswers[q.id] || undefined,
          essay_attachment_url: essayImages[q.id] || undefined,
        })).filter((a) => a.selected_option || a.subpart_answers_json || a.essay_text_answer || a.essay_attachment_url);

        if (formattedAnswers.length > 0) {
          api.autosaveALAnswers(submissionId, formattedAnswers).catch(() => {});
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [answers, subpartAnswers, essayAnswers, essayImages, sessionState, submissionId, questions]);

  // Final Submit Handler
  const handleFinalSubmit = async () => {
    if (!submissionId || submitting) return;
    setSubmitting(true);
    setSessionState("submitting");
    setShowConfirmSubmit(false);

    try {
      const formattedAnswers = questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id] || undefined,
        subpart_answers_json: subpartAnswers[q.id] || undefined,
        essay_text_answer: essayAnswers[q.id] || undefined,
        essay_attachment_url: essayImages[q.id] || undefined,
      }));

      const subResult = await api.submitALExam(submissionId, formattedAnswers);
      
      // Brief delay for smooth UI transition
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setResult(subResult);
      setSessionState("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("already been submitted")) {
        // Attempt already finalized; fetch submission directly
        try {
          const existingSub = await api.getALSubmission(submissionId);
          setResult(existingSub);
          setSessionState("review");
          return;
        } catch (fetchErr) {
          console.error(fetchErr);
        }
      }
      addToast(err?.message || "Submission encountered an error. Please try again.", "error");
      setSessionState("taking");
    } finally {
      setSubmitting(false);
    }
  };

  const currentQ = questions[currentIndex];

  // Helper to format timer string HH:MM:SS
  const formatTimer = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer Status Category (Normal, Warning, Critical)
  const getTimerState = (secs: number | null) => {
    if (secs === null) return "normal";
    if (secs < 60) return "critical"; // < 1 minute
    if (secs < 300) return "warning"; // < 5 minutes
    return "normal";
  };

  // Question Answered check helper (defined unconditionally at top level)
  const isQuestionAnswered = useCallback(
    (q: ALQuestion) => {
      if (answers[q.id]?.trim()) return true;
      if (subpartAnswers[q.id] && Object.values(subpartAnswers[q.id]).some((v) => (typeof v === "string" ? v.trim().length > 0 : Boolean(v)))) return true;
      if (essayAnswers[q.id]?.trim()) return true;
      return false;
    },
    [answers, subpartAnswers, essayAnswers]
  );

  const timerState = getTimerState(secondsRemaining);

  // Question category helpers (unconditionally at top level)
  const isQuestionStructured = useCallback((q: ALQuestion) =>
    q.template_type === "structured_subparts" ||
    (Array.isArray(q.structured_subparts_json) && q.structured_subparts_json.length > 0), []);

  const isQuestionEssay = useCallback((q: ALQuestion) =>
    (q.template_type as string) === "essay_rubric" ||
    (q.template_type as string) === "essay_checklist" ||
    (q.template_type as string) === "essay" ||
    Boolean(q.essay_checklist_json), []);

  const isQuestionMCQ = useCallback((q: ALQuestion) => !isQuestionStructured(q) && !isQuestionEssay(q), [isQuestionStructured, isQuestionEssay]);

  // Section index calculations (unconditionally at top level)
  const paper1Indices = useMemo(() => {
    return questions.map((q, i) => ({ q, i })).filter(({ q }) => isQuestionMCQ(q)).map(({ i }) => i);
  }, [questions, isQuestionMCQ]);

  const paper2StructuredIndices = useMemo(() => {
    return questions.map((q, i) => ({ q, i })).filter(({ q }) => isQuestionStructured(q)).map(({ i }) => i);
  }, [questions, isQuestionStructured]);

  const paper2EssayIndices = useMemo(() => {
    return questions.map((q, i) => ({ q, i })).filter(({ q }) => isQuestionEssay(q)).map(({ i }) => i);
  }, [questions, isQuestionEssay]);

  const paper2Indices = useMemo(() => {
    return [...paper2StructuredIndices, ...paper2EssayIndices];
  }, [paper2StructuredIndices, paper2EssayIndices]);

  const hasBothPapers = paper1Indices.length > 0 && paper2Indices.length > 0;

  // Active question set based on stage (unconditionally at top level)
  const activeSectionIndices = useMemo(() => {
    if (!hasBothPapers) return questions.map((_, i) => i);
    if (paperStage === "paper1") return paper1Indices;
    return paper2Indices;
  }, [hasBothPapers, paperStage, paper1Indices, paper2Indices, questions]);

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  if (!exam) {
    return (
      <div style={{ maxWidth: "800px", margin: "4rem auto", padding: "3rem", textAlign: "center" }} className="card">
        <SvgIcon name="alert-circle" size={48} style={{ color: "var(--error)", margin: "0 auto 1rem" }} />
        <h2>Exam Not Found</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>The requested examination is not available.</p>
        <Link href="/dashboard/student/courses" className="btn btn-primary">Return to Courses</Link>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // STATE 1: AVAILABLE (Start Hero)
  // ──────────────────────────────────────────────
  if (sessionState === "available") {
    return (
      <div style={{ maxWidth: "800px", margin: "3rem auto", paddingBottom: "3rem" }}>
        <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div className="breadcrumb" style={{ margin: 0 }}>
            <Link href="/dashboard/student/al-exams" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Exam Studio</Link>
            <span className="breadcrumb-sep" style={{ margin: "0 0.5rem" }}>/</span>
            <span style={{ color: "var(--text-primary)" }}>{exam.title}</span>
          </div>
          <Link
            href="/dashboard/student/al-exams"
            className="btn btn-secondary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", textDecoration: "none" }}
          >
            <SvgIcon name="arrow-left" size={13} /> Back to Exam Studio
          </Link>
        </div>

        <div className="card" style={{ padding: "2.5rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <span className="badge badge-info" style={{ marginBottom: "1rem" }}>
            G.C.E. Advanced Level &bull; {exam.exam_type?.toUpperCase() || "BIOLOGY"}
          </span>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
            {exam.title}
          </h1>
          {exam.description && (
            <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.6, marginBottom: "2rem" }}>
              {exam.description}
            </p>
          )}

          {/* Previous Attempt Summary (if student already completed an attempt) */}
          {result && (
            <div
              style={{
                marginBottom: "2rem",
                padding: "1.25rem 1.5rem",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Previous Submission Result
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.2rem" }}>
                  Score: {result.scaled_score ?? result.raw_score ?? 0} pts &bull; {result.percentage ?? 0}% &bull; Grade:{" "}
                  <strong style={{ color: "var(--accent-primary)" }}>{result.grade || "Provisional"}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionState("review")}
                className="btn btn-secondary btn-sm"
              >
                View Latest Submission
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginBottom: "2.5rem" }}>
            <div style={{ background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Time Allowed</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.25rem" }}>
                {exam.time_limit_minutes} Minutes
              </div>
            </div>
            <div style={{ background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Questions</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.25rem" }}>
                {(questions.length > 0 ? questions.length : exam.questions?.length) || exam.total_questions || 0} Questions
              </div>
            </div>
            <div style={{ background: "var(--bg-secondary)", padding: "1.25rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Allowed Attempts</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.25rem" }}>
                {exam.max_attempts > 0 ? `${exam.max_attempts} Attempt(s)` : "Unlimited"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Link href={`/dashboard/student/courses/${exam.course_id}`} className="btn btn-secondary" style={{ textDecoration: "none" }}>
              Cancel
            </Link>
            <button type="button" onClick={handleStartExam} className="btn btn-primary" style={{ padding: "0.75rem 2.5rem", fontSize: "1.05rem", fontWeight: 700 }}>
              {result ? "Retake Examination Now" : "Start Examination Now"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // STATE 2: SUBMITTING LOADING
  // ──────────────────────────────────────────────
  if (sessionState === "submitting") {
    return (
      <div style={{ maxWidth: "600px", margin: "6rem auto", textAlign: "center", padding: "3rem" }} className="card">
        <div className="spinner" style={{ width: "48px", height: "48px", margin: "0 auto 1.5rem" }} />
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>Evaluating Answers</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Your examination answers are being processed against the official A/L Biology marking scheme...
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // STATE 3: REVIEW / RESULTS DASHBOARD
  // ──────────────────────────────────────────────
  if (sessionState === "review" && result) {
    const rawScore = result.scaled_score ?? result.raw_score ?? 0;
    const pct = result.percentage ?? 0;
    const grade = result.grade || "Provisional";
    const answersList = result.answers || [];

    const totalCalculatedPoints = questions.reduce((sum, q) => sum + (q.points || 1.0), 0);
    const maxPoints = totalCalculatedPoints > 0 ? totalCalculatedPoints : (exam.questions?.length || exam.total_questions || 50);

    const mcqAnswers = answersList.filter((a) => {
      const q = questions.find((item) => item.id === a.question_id);
      return q ? isQuestionMCQ(q) : true;
    });

    const structuredAnswers = answersList.filter((a) => {
      const q = questions.find((item) => item.id === a.question_id);
      return q ? isQuestionStructured(q) : false;
    });

    const essayAnswersList = answersList.filter((a) => {
      const q = questions.find((item) => item.id === a.question_id);
      return q ? isQuestionEssay(q) : false;
    });

    const correctCount = mcqAnswers.filter((a) => a.is_correct).length;
    const incorrectCount = mcqAnswers.length - correctCount;
    const canRetake = !exam.max_attempts || exam.max_attempts === 0 || exam.max_attempts > 1;

    const hasPaper2 = structuredAnswers.length > 0 || essayAnswersList.length > 0;
    const isTeacherVerified = result.status === "teacher_verified";
    const isPendingTeacherGrading = hasPaper2 && !isTeacherVerified;

    // Instant Paper 1 MCQ Score Calculation
    const mcqPointsEarned = mcqAnswers.reduce((sum, a) => {
      return sum + (a.final_score ?? a.scaled_points_earned ?? (a.is_correct ? (questions.find(q => q.id === a.question_id)?.points || 1.0) : 0.0));
    }, 0);
    const mcqMaxPoints = mcqAnswers.reduce((sum, a) => {
      const q = questions.find(item => item.id === a.question_id);
      return sum + (q?.points || 1.0);
    }, 0);
    const mcqPercentage = mcqMaxPoints > 0 ? Math.round((mcqPointsEarned / mcqMaxPoints) * 100) : 0;

    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto", paddingBottom: "4rem" }}>
        {/* Results Header Card */}
        <div className="card" style={{ marginBottom: "2rem", padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                {isTeacherVerified ? (
                  <span className="badge badge-success" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700 }}>
                    <SvgIcon name="check-circle" size={13} />
                    Verified by Teacher
                  </span>
                ) : isPendingTeacherGrading ? (
                  <span className="badge badge-warning" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700 }}>
                    <SvgIcon name="clock" size={13} />
                    Submitted — Paper II Pending Teacher Marking
                  </span>
                ) : (
                  <span className="badge badge-info" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700 }}>
                    <SvgIcon name="check-circle" size={13} />
                    Graded (MCQ Auto-Evaluated)
                  </span>
                )}

                <span className="badge badge-primary">
                  {exam.exam_type === "paper_1_mcq" ? "Paper I — MCQ" : exam.exam_type === "paper_2_structured" ? "Paper II-A — Structured" : exam.exam_type === "paper_2_essay" ? "Paper II-B — Essay" : "Full G.C.E. A/L Paper"}
                </span>
              </div>

              <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
                {exam.title} &mdash; {isPendingTeacherGrading ? "Paper Submitted" : "Examination Results"}
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5, maxWidth: "600px" }}>
                {isTeacherVerified
                  ? "Your examination script has been officially reviewed, marked, and verified by your teacher."
                  : isPendingTeacherGrading
                  ? "Paper I (MCQ) marks are computed below immediately. Your Paper II structured and essay answers have been submitted to your teacher for manual marking."
                  : "Automated evaluation completed based on official G.C.E. A/L marking standards."}
              </p>
            </div>

            {/* Score & Grade Display + Retake Action */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", background: "var(--bg-secondary)", padding: "0.85rem 1.35rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                {isPendingTeacherGrading ? (
                  <>
                    {/* Instant Paper 1 MCQ Score */}
                    {mcqAnswers.length > 0 && (
                      <div style={{ textAlign: "center", minWidth: "90px" }}>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Paper I (MCQ)</div>
                        <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-primary)" }}>
                          {mcqPointsEarned}<span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/{mcqMaxPoints}</span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 700 }}>
                          {mcqPercentage}% Auto-Graded
                        </div>
                      </div>
                    )}

                    {mcqAnswers.length > 0 && <div style={{ width: "1px", height: "36px", background: "var(--border)" }} />}

                    {/* Paper 2 Status */}
                    <div style={{ textAlign: "center", minWidth: "120px" }}>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Paper II Status</div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--warning)", marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                        <SvgIcon name="clock" size={14} />
                        <span>Needs Marking</span>
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Teacher Evaluating
                      </div>
                    </div>

                    <div style={{ width: "1px", height: "36px", background: "var(--border)" }} />

                    {/* Official Composite Grade */}
                    <div style={{ textAlign: "center", minWidth: "95px" }}>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Composite Grade</div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-secondary)", marginTop: "2px" }}>
                        Pending
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Releases on Verification
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Score</div>
                      <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        {rawScore}<span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>/{maxPoints}</span>
                      </div>
                    </div>

                    <div style={{ width: "1px", height: "32px", background: "var(--border)" }} />

                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Percentage</div>
                      <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                        {pct}%
                      </div>
                    </div>

                    <div style={{ width: "1px", height: "32px", background: "var(--border)" }} />

                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Grade</div>
                      <div
                        style={{
                          fontSize: "1.85rem",
                          fontWeight: 900,
                          color: grade === "A" ? "var(--success)" : grade === "B" ? "var(--accent-primary)" : grade === "C" ? "var(--warning)" : "var(--error)",
                        }}
                      >
                        {grade}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Link
                  href="/dashboard/student/al-exams"
                  className="btn btn-secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.55rem 1.15rem", fontSize: "0.88rem", fontWeight: 700, borderRadius: "var(--radius-md)", textDecoration: "none" }}
                >
                  <SvgIcon name="arrow-left" size={15} />
                  <span>Back to Exam Studio</span>
                </Link>

                {canRetake && (
                  <button
                    type="button"
                    onClick={handleStartExam}
                    className="btn btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.55rem 1.15rem", fontSize: "0.88rem", fontWeight: 700, borderRadius: "var(--radius-md)" }}
                  >
                    <SvgIcon name="refresh" size={15} />
                    <span>Retake Examination</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pending Teacher Marking Information Banner */}
          {isPendingTeacherGrading && (
            <div style={{ marginTop: "1.5rem", background: "rgba(245, 158, 11, 0.08)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--warning)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
                <SvgIcon name="info" size={16} />
                <span>Paper II (Structured &amp; Essay) Submitted for Teacher Evaluation</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                Your Paper I MCQ score has been evaluated automatically. Your written answers for Paper II (Structured &amp; Essay) are safely recorded below and have been sent to your teacher. Official marking scheme criteria, subpart feedback, and final grade will be released once your teacher completes verification.
              </div>
            </div>
          )}

          {/* Overall Teacher Feedback Banner (when verified) */}
          {isTeacherVerified && result.teacher_feedback && (
            <div style={{ marginTop: "1.5rem", background: "rgba(99, 102, 241, 0.06)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
                <SvgIcon name="file-text" size={15} />
                <span>Teacher Verification &amp; Overall Feedback</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                {normalizeScientificSymbols(result.teacher_feedback)}
              </div>
            </div>
          )}
        </div>

        {/* ─── SECTION A: PAPER I (MCQ) QUESTION REVIEW ─── */}
        {mcqAnswers.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="clipboard" size={20} style={{ color: "var(--accent-primary)" }} />
                <span>Paper I (MCQ) &mdash; Question Breakdown &amp; Explanations</span>
              </h2>

              <div style={{ display: "flex", gap: "0.45rem", background: "var(--bg-secondary)", padding: "0.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className={`btn btn-sm ${resultFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setResultFilter("all")}
                  style={{ borderRadius: "var(--radius-sm)", fontSize: "0.8rem", padding: "0.35rem 0.85rem" }}
                >
                  All ({mcqAnswers.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${resultFilter === "correct" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setResultFilter("correct")}
                  style={{ borderRadius: "var(--radius-sm)", fontSize: "0.8rem", padding: "0.35rem 0.85rem" }}
                >
                  Correct ({correctCount})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${resultFilter === "incorrect" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setResultFilter("incorrect")}
                  style={{ borderRadius: "var(--radius-sm)", fontSize: "0.8rem", padding: "0.35rem 0.85rem" }}
                >
                  Incorrect ({incorrectCount})
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {mcqAnswers
                .filter((ans) => {
                  if (resultFilter === "correct") return ans.is_correct;
                  if (resultFilter === "incorrect") return !ans.is_correct;
                  return true;
                })
                .map((ans, idx) => {
                  const question = questions.find((q) => q.id === ans.question_id);
                  const qNum = question?.question_number || idx + 1;
                  const isCorrect = ans.is_correct;
                  const earnedScore = ans.final_score ?? ans.scaled_points_earned ?? (isCorrect ? 1.0 : 0.0);

                  return (
                    <div
                      key={ans.id}
                      className="card"
                      style={{
                        padding: "1.5rem",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        boxShadow: "var(--shadow-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                            Question {qNum}
                          </span>
                          {question?.cognitive_level && (
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", padding: "0.15rem 0.45rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                              {question.cognitive_level}
                            </span>
                          )}
                        </div>

                        <span
                          className={`badge ${isCorrect ? "badge-success" : "badge-error"}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700, padding: "0.3rem 0.75rem" }}
                        >
                          <SvgIcon name={isCorrect ? "check-circle" : "alert-triangle"} size={13} />
                          {isCorrect ? `Correct (+${earnedScore})` : `Incorrect (${earnedScore})`}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.98rem", color: "var(--text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                        {normalizeScientificSymbols(question?.stem_text)}
                      </div>

                      {/* Dual Comparison Answer Card */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
                        {/* Student Answer Box */}
                        <div
                          style={{
                            padding: "0.85rem 1rem",
                            borderRadius: "var(--radius-md)",
                            background: isCorrect ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)",
                            border: `1px solid ${isCorrect ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: isCorrect ? "var(--success)" : "var(--error)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <SvgIcon name={isCorrect ? "check-circle" : "alert-triangle"} size={13} />
                            Your Answer
                          </div>
                          <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            {ans.selected_option ? `Option (${ans.selected_option})` : "Not Answered"}
                          </div>
                        </div>

                        {/* Correct Answer Box */}
                        <div
                          style={{
                            padding: "0.85rem 1rem",
                            borderRadius: "var(--radius-md)",
                            background: "rgba(16, 185, 129, 0.05)",
                            border: "1px solid rgba(16, 185, 129, 0.2)",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--success)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <SvgIcon name="check-circle" size={13} />
                            Official Correct Answer
                          </div>
                          <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            {ans.correct_option
                              ? `Option (${ans.correct_option})`
                              : question?.correct_option
                              ? `Option (${question.correct_option})`
                              : isCorrect && ans.selected_option
                              ? `Option (${ans.selected_option})`
                              : "Official A/L Marking Scheme"}
                          </div>
                        </div>
                      </div>

                      {ans.feedback_notes && (
                        <div style={{ background: "rgba(99, 102, 241, 0.06)", padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", fontSize: "0.85rem", color: "var(--text-primary)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                          <strong style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.2rem" }}>
                            <SvgIcon name="info" size={13} />
                            Teacher Feedback:
                          </strong>
                          <span>{normalizeScientificSymbols(ans.feedback_notes)}</span>
                        </div>
                      )}

                      {(ans.explanation || question?.explanation) && (
                        <div style={{ background: "rgba(99, 102, 241, 0.04)", padding: "1rem 1.15rem", borderRadius: "var(--radius-md)", fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.55, border: "1px solid rgba(99, 102, 241, 0.15)" }}>
                          <div style={{ fontWeight: 700, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
                            <SvgIcon name="file-text" size={14} />
                            <span>Marking Scheme &amp; Scientific Explanation</span>
                          </div>
                          <div>{normalizeScientificSymbols(ans.explanation || question?.explanation)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ─── SECTION B: PAPER II-A (STRUCTURED) QUESTION REVIEW ─── */}
        {structuredAnswers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="clipboard" size={20} style={{ color: "var(--accent-primary)" }} />
              <span>Paper II-A (Structured) &mdash; Responses &amp; Subparts Breakdown</span>
            </h2>

            {structuredAnswers.map((ans, idx) => {
              const question = questions.find((q) => q.id === ans.question_id);
              const qNum = question?.question_number || idx + 1;
              const subpartsJson = question?.structured_subparts_json || [];
              const studentAnswersMap = ans.subpart_answers_json || {};
              const awardedScore = ans.teacher_score ?? ans.final_score ?? ans.scaled_points_earned ?? 0.0;
              const maxQPoints = question?.points || 40.0;

              return (
                <div key={ans.id} className="card" style={{ padding: "1.5rem", border: "1px solid var(--border)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div>
                      <span className="badge badge-purple" style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Question {qNum}</span>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                        {normalizeScientificSymbols(question?.stem_text || `Structured Question ${qNum}`)}
                      </h3>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Evaluation</div>
                      {isTeacherVerified ? (
                        <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                          {awardedScore} <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>/ {maxQPoints}</span>
                        </div>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: "0.75rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <SvgIcon name="clock" size={12} />
                          Max: {maxQPoints} pts (Pending Teacher Marks)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subparts Responses Hierarchy */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.25rem" }}>
                    {Array.isArray(subpartsJson) && subpartsJson.length > 0 ? (
                      subpartsJson.map((partNode: any, pIdx: number) => {
                        const partLabel = getAcademicSubpartLabel(partNode, 0, pIdx);
                        const partChildren = partNode.children || partNode.subparts || [];
                        const hasChildren = Array.isArray(partChildren) && partChildren.length > 0;
                        const resolvedLeafAnswer = resolveCandidateSubpartAnswer(partNode, 0, pIdx, studentAnswersMap);

                        return (
                          <div key={partNode.id || pIdx} style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: hasChildren ? "0.75rem" : "0.4rem" }}>
                              {partLabel}
                            </div>

                            {!hasChildren && (
                              <div>
                                {partNode.prompt && (
                                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontStyle: "italic" }}>
                                    {partNode.prompt}
                                  </div>
                                )}
                                <div style={{ background: "var(--bg-card)", padding: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: "3px" }}>
                                    Your Submitted Answer:
                                  </div>
                                  <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                                    {renderCandidateSubpartAnswer(resolvedLeafAnswer)}
                                  </div>
                                </div>
                              </div>
                            )}

                            {hasChildren && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingLeft: "0.5rem" }}>
                                {partChildren.map((childNode: any, cIdx: number) => {
                                  const childLabel = getAcademicSubpartLabel(childNode, 1, cIdx);
                                  const resolvedChildAnswer = resolveCandidateSubpartAnswer(childNode, 1, cIdx, studentAnswersMap);

                                  return (
                                    <div key={childNode.id || cIdx} style={{ padding: "0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                      <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: "3px" }}>
                                        {childLabel}
                                      </div>
                                      {childNode.prompt && (
                                        <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginBottom: "6px" }}>
                                          {childNode.prompt}
                                        </div>
                                      )}
                                      <div style={{ background: "var(--bg-secondary)", padding: "0.6rem 0.85rem", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                                        {renderCandidateSubpartAnswer(resolvedChildAnswer)}
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
                      Object.entries(studentAnswersMap).map(([partKey, val]) => (
                        <div key={partKey} style={{ background: "var(--bg-secondary)", padding: "0.85rem", borderRadius: "var(--radius-sm)" }}>
                          <strong style={{ fontSize: "0.85rem", color: "var(--accent-primary)" }}>({partKey}): </strong>
                          <div style={{ marginTop: "4px" }}>
                            {renderCandidateSubpartAnswer(val)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Question-level Teacher Feedback */}
                  {ans.feedback_notes && (
                    <div style={{ background: "rgba(99, 102, 241, 0.06)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-primary)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                      <strong style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.2rem" }}>
                        <SvgIcon name="info" size={13} />
                        Teacher Feedback for Question {qNum}:
                      </strong>
                      <span>{normalizeScientificSymbols(ans.feedback_notes)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── SECTION C: PAPER II-B (ESSAY) QUESTION REVIEW ─── */}
        {essayAnswersList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="clipboard" size={20} style={{ color: "var(--accent-primary)" }} />
              <span>Paper II-B (Essay) &mdash; Responses &amp; Rubric Evaluation</span>
            </h2>

            {essayAnswersList.map((ans, idx) => {
              const question = questions.find((q) => q.id === ans.question_id);
              const qNum = question?.question_number || idx + 1;
              const criteriaList = question ? extractEssayCriteriaList(question) : [];
              const awardedScore = ans.teacher_score ?? ans.final_score ?? ans.scaled_points_earned ?? 0.0;
              const maxQPoints = question?.points || 40.0;
              const checklistResults = ans.teacher_checklist_results_json || [];

              return (
                <div key={ans.id} className="card" style={{ padding: "1.5rem", border: "1px solid var(--border)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div>
                      <span className="badge badge-amber" style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Essay Question {qNum}</span>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                        {normalizeScientificSymbols(question?.stem_text || `Essay Question ${qNum}`)}
                      </h3>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Evaluation</div>
                      {isTeacherVerified ? (
                        <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                          {awardedScore} <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>/ {maxQPoints}</span>
                        </div>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: "0.75rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <SvgIcon name="clock" size={12} />
                          Max: {maxQPoints} pts (Pending Teacher Marks)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Student Essay Written Text */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.4rem" }}>
                      Your Written Response:
                    </div>
                    <div style={{ background: "var(--bg-secondary)", padding: "1rem 1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", fontSize: "0.9rem", lineHeight: 1.6, maxHeight: "350px", overflowY: "auto", whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                      {ans.essay_text_answer || "— No written answer recorded —"}
                    </div>

                    {ans.essay_attachment_url && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Attached Diagram:</span>
                        <img
                          src={ans.essay_attachment_url}
                          alt="Diagram"
                          style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "var(--radius-sm)", marginTop: "4px" }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Rubric Criteria Breakdown (Strictly shown only after Teacher Verification) */}
                  {isTeacherVerified && criteriaList.length > 0 ? (
                    <div style={{ marginBottom: "1.25rem" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.5rem" }}>
                        Official Verified Rubric Breakdown:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {criteriaList.map((c, cIdx) => {
                          const isAwarded = Array.isArray(checklistResults) && (checklistResults[cIdx]?.awarded ?? false);

                          return (
                            <div
                              key={c.item_number || cIdx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.5rem 0.85rem",
                                borderRadius: "var(--radius-sm)",
                                background: isAwarded ? "rgba(16, 185, 129, 0.08)" : "var(--bg-secondary)",
                                border: isAwarded ? "1px solid #10B98140" : "1px solid var(--border-subtle)",
                                fontSize: "0.825rem",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ color: isAwarded ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center" }}>
                                  <SvgIcon name={isAwarded ? "check-circle" : "file-text"} size={14} />
                                </span>
                                <span style={{ color: "var(--text-primary)" }}>
                                  #{c.item_number} — {c.criterion_text}
                                </span>
                              </div>

                              <span className={`badge ${isAwarded ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "0.7rem" }}>
                                {isAwarded ? `+${c.max_points} pts` : "0.0 pts"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : !isTeacherVerified ? (
                    <div style={{ background: "rgba(245, 158, 11, 0.06)", padding: "0.85rem 1.15rem", borderRadius: "var(--radius-md)", border: "1px solid rgba(245, 158, 11, 0.2)", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
                      <SvgIcon name="clock" size={15} style={{ color: "var(--warning)", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        Your essay response has been submitted for teacher evaluation. Official marking criteria and awarded marks will be released once your teacher completes verification.
                      </span>
                    </div>
                  ) : null}

                  {/* Essay-level Teacher Feedback */}
                  {ans.feedback_notes && (
                    <div style={{ background: "rgba(99, 102, 241, 0.06)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-primary)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                      <strong style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.2rem" }}>
                        <SvgIcon name="info" size={13} />
                        Teacher Feedback for Essay {qNum}:
                      </strong>
                      <span>{normalizeScientificSymbols(ans.feedback_notes)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action Controls: Return to Course + Retake Exam */}
        <div style={{ marginTop: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <Link href={`/dashboard/student/courses/${exam.course_id}`} className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="arrow-left" size={14} />
            <span>Return to Course</span>
          </Link>

          {canRetake && (
            <button
              type="button"
              onClick={handleStartExam}
              className="btn btn-primary"
              style={{ padding: "0.65rem 1.75rem", fontSize: "0.95rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.5rem", borderRadius: "var(--radius-md)" }}
            >
              <SvgIcon name="refresh" size={16} />
              <span>Retake Examination / Start New Attempt</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // STATE 4: TAKING EXAM (Live Engine)
  // ──────────────────────────────────────────────
  const isFlagged = currentQ ? flaggedIds.has(currentQ.id) : false;
  const currentAnswer = currentQ ? answers[currentQ.id] || "" : "";
  const answeredTotal = questions.filter(isQuestionAnswered).length;
  const unansweredTotal = questions.length - answeredTotal;
  const progressPercentage = questions.length > 0 ? Math.round((answeredTotal / questions.length) * 100) : 0;

  // Dynamic Question Display Number calculation (ensures Paper 2 starts at Question 1)
  const getQuestionDisplayNumber = (q: ALQuestion, idx: number): number => {
    if (hasBothPapers) {
      if (isQuestionMCQ(q)) {
        return paper1Indices.indexOf(idx) + 1; // Q1 to Q50
      }
      if (isQuestionStructured(q)) {
        return paper2StructuredIndices.indexOf(idx) + 1; // Part A: Q1 to Q4
      }
      if (isQuestionEssay(q)) {
        return paper2StructuredIndices.length + paper2EssayIndices.indexOf(idx) + 1; // Part B: Q5 to Q7
      }
    }
    if (exam.exam_type === "paper_2_essay") {
      return 5 + idx;
    }
    return idx + 1;
  };

  const currentDisplayNumber = currentQ ? getQuestionDisplayNumber(currentQ, currentIndex) : currentIndex + 1;

  // Paper 1 stats for breather screen
  const p1AnsweredCount = paper1Indices.filter((idx) => questions[idx] && isQuestionAnswered(questions[idx])).length;
  const p1FlaggedCount = paper1Indices.filter((idx) => questions[idx] && flaggedIds.has(questions[idx].id)).length;
  const p2AnsweredCount = paper2Indices.filter((idx) => questions[idx] && isQuestionAnswered(questions[idx])).length;

  return (
    <div style={{ maxWidth: "1420px", width: "96%", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* ─── STICKY EXAM TOP HEADER WITH INTEGRATED QUESTION NAVIGATOR ─── */}
      <div
        style={{
          position: "sticky",
          top: "0",
          zIndex: 100,
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          padding: "0.85rem 1.5rem",
          marginBottom: "1.5rem",
          borderRadius: "0 0 var(--radius-md) var(--radius-md)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.07)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          {/* Left: Badge, Title & Status */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link
                href="/dashboard/student/al-exams"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", textDecoration: "none" }}
                title="Save & Return to Exam Studio (Attempt stays active)"
              >
                <SvgIcon name="arrow-left" size={11} /> Exam Studio
              </Link>
              <span className="badge badge-info" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                {hasBothPapers
                  ? paperStage === "paper1"
                    ? "PAPER I — MULTIPLE CHOICE"
                    : paperStage === "breather"
                    ? "SECTION TRANSITION"
                    : "PAPER II — STRUCTURED & ESSAY"
                  : exam.exam_type === "paper_1_mcq"
                  ? "PAPER I — MCQ"
                  : exam.exam_type === "paper_2_structured"
                  ? "PAPER II-A — STRUCTURED"
                  : "PAPER II-B — ESSAY"}
              </span>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0px", color: "var(--text-primary)" }}>
                {exam.title || "G.C.E. A/L Biology Examination Paper"}
              </h2>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
              {paperStage === "breather" ? (
                <span>Paper I Complete &bull; Ready to start Paper II</span>
              ) : (
                <span>
                  {hasBothPapers && paperStage === "paper2" ? "Paper II" : "Paper I"} Question {currentDisplayNumber} &bull; {answeredTotal}/{questions.length} Total Answered ({progressPercentage}%)
                </span>
              )}
            </div>
          </div>

          {/* Right: Autosave Status, Timer & Submit Action */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {/* Autosave Status Pill */}
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              {saveStatus === "saving" ? (
                <>
                  <div className="spinner" style={{ width: "10px", height: "10px" }} /> Saving...
                </>
              ) : saveStatus === "offline" ? (
                <>
                  <SvgIcon name="alert-triangle" size={12} style={{ color: "var(--warning)" }} /> Offline (Saved Locally)
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: "var(--success)" }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <span>Saved</span>
                </>
              )}
            </div>

            {/* Dynamic Visual Timer */}
            {secondsRemaining !== null && (
              <div
                title="Remaining examination time"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.85rem",
                  borderRadius: "var(--radius-md)",
                  background:
                    timerState === "critical"
                      ? "rgba(239, 68, 68, 0.2)"
                      : timerState === "warning"
                      ? "rgba(245, 158, 11, 0.15)"
                      : "var(--bg-secondary)",
                  color:
                    timerState === "critical"
                      ? "var(--error)"
                      : timerState === "warning"
                      ? "var(--warning)"
                      : "var(--text-primary)",
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  border:
                    timerState === "critical"
                      ? "1px solid var(--error)"
                      : timerState === "warning"
                      ? "1px solid var(--warning)"
                      : "1px solid var(--border)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>{formatTimer(secondsRemaining)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowConfirmSubmit(true)}
              className="btn btn-primary"
              style={{ padding: "0.5rem 1.25rem", fontWeight: 700, fontSize: "0.88rem" }}
            >
              Submit Paper
            </button>
          </div>
        </div>

        {/* Paper Section Tabs (When Exam has both Paper 1 and Paper 2) */}
        {hasBothPapers && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setPaperStage("paper1");
                if (paper1Indices.length > 0 && !paper1Indices.includes(currentIndex)) {
                  setCurrentIndex(paper1Indices[0]);
                }
              }}
              style={{
                padding: "0.35rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.82rem",
                fontWeight: paperStage === "paper1" ? 800 : 600,
                cursor: "pointer",
                border: paperStage === "paper1" ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                background: paperStage === "paper1" ? "rgba(99, 102, 241, 0.12)" : "var(--bg-secondary)",
                color: paperStage === "paper1" ? "var(--accent-primary)" : "var(--text-primary)",
              }}
            >
              Paper I: MCQ (Q1–Q{paper1Indices.length}) &bull; {p1AnsweredCount}/{paper1Indices.length}
            </button>

            {paper2StructuredIndices.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPaperStage("paper2");
                  if (paper2StructuredIndices.length > 0 && !paper2StructuredIndices.includes(currentIndex)) {
                    setCurrentIndex(paper2StructuredIndices[0]);
                  }
                }}
                style={{
                  padding: "0.35rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  fontWeight: paperStage === "paper2" && isQuestionStructured(questions[currentIndex] || questions[0]) ? 800 : 600,
                  cursor: "pointer",
                  border: paperStage === "paper2" && isQuestionStructured(questions[currentIndex] || questions[0]) ? "2px solid #8b5cf6" : "1px solid var(--border)",
                  background: paperStage === "paper2" && isQuestionStructured(questions[currentIndex] || questions[0]) ? "rgba(139, 92, 246, 0.12)" : "var(--bg-secondary)",
                  color: paperStage === "paper2" && isQuestionStructured(questions[currentIndex] || questions[0]) ? "#8b5cf6" : "var(--text-primary)",
                }}
              >
                Paper II-A: Structured (Q1–Q{paper2StructuredIndices.length})
              </button>
            )}

            {paper2EssayIndices.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPaperStage("paper2");
                  if (paper2EssayIndices.length > 0 && !paper2EssayIndices.includes(currentIndex)) {
                    setCurrentIndex(paper2EssayIndices[0]);
                  }
                }}
                style={{
                  padding: "0.35rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  fontWeight: paperStage === "paper2" && isQuestionEssay(questions[currentIndex] || questions[0]) ? 800 : 600,
                  cursor: "pointer",
                  border: paperStage === "paper2" && isQuestionEssay(questions[currentIndex] || questions[0]) ? "2px solid #f59e0b" : "1px solid var(--border)",
                  background: paperStage === "paper2" && isQuestionEssay(questions[currentIndex] || questions[0]) ? "rgba(245, 158, 11, 0.12)" : "var(--bg-secondary)",
                  color: paperStage === "paper2" && isQuestionEssay(questions[currentIndex] || questions[0]) ? "#f59e0b" : "var(--text-primary)",
                }}
              >
                Paper II-B: Essay (Q{paper2StructuredIndices.length + 1}–Q{paper2StructuredIndices.length + paper2EssayIndices.length})
              </button>
            )}
          </div>
        )}

        {/* Integrated Horizontal Question Navigator */}
        {paperStage !== "breather" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.85rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border)",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", whiteSpace: "nowrap", marginRight: "0.25rem" }}>
              {hasBothPapers ? (paperStage === "paper1" ? "Paper I Questions:" : "Paper II Questions:") : "Questions:"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              {activeSectionIndices.map((origIdx) => {
                const q = questions[origIdx];
                if (!q) return null;
                const isCurrent = origIdx === currentIndex;
                const isAnswered = isQuestionAnswered(q);
                const isFlag = flaggedIds.has(q.id);
                const qNum = getQuestionDisplayNumber(q, origIdx);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(origIdx)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: activeSectionIndices.length <= 6 ? "0.35rem 0.95rem" : "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm, 6px)",
                      fontSize: "0.82rem",
                      fontWeight: isCurrent ? 800 : 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      border: isCurrent
                        ? "2px solid var(--accent-primary)"
                        : isFlag
                        ? "1.5px solid var(--warning, #f59e0b)"
                        : isAnswered
                        ? "1px solid var(--success, #10b981)"
                        : "1px solid var(--border)",
                      background: isCurrent
                        ? "var(--accent-primary)"
                        : isAnswered
                        ? "rgba(16, 185, 129, 0.12)"
                        : "var(--bg-secondary)",
                      color: isCurrent
                        ? "#ffffff"
                        : isAnswered
                        ? "var(--success, #10b981)"
                        : "var(--text-primary)",
                      boxShadow: isCurrent ? "0 2px 8px rgba(99, 102, 241, 0.35)" : "none",
                    }}
                    title={`Question ${qNum} (${isAnswered ? "Answered" : "Unanswered"}${isFlag ? " • Flagged" : ""})`}
                  >
                    <span>{activeSectionIndices.length <= 6 ? `Question ${qNum}` : `Q${qNum}`}</span>
                    {isAnswered && !isCurrent && (
                      <SvgIcon name="check" size={12} style={{ color: "var(--success)" }} />
                    )}
                    {isFlag && (
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--warning)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Horizontal Progress Bar */}
        <div style={{ width: "100%", height: "4px", background: "var(--bg-secondary)", borderRadius: "2px", marginTop: "0.75rem", overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPercentage}%`,
              height: "100%",
              background: "linear-gradient(90deg, var(--accent-primary) 0%, #10b981 100%)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* ─── SECTION TRANSITION / BREATHER SCREEN ─── */}
      {paperStage === "breather" && (
        <div
          className="card"
          style={{
            maxWidth: "780px",
            margin: "2rem auto",
            padding: "2.5rem 2rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg, 12px)",
            textAlign: "center",
            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(59, 130, 246, 0.12)",
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              border: "1px solid rgba(59, 130, 246, 0.25)",
            }}
          >
            <SvgIcon name="award" size={32} />
          </div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "0.6rem" }}>
            Paper I (MCQ Section) Completed!
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "580px", margin: "0 auto 1.75rem" }}>
            Great job! You have reached the end of Paper I. Take a breather to stretch, rest your eyes, and gather your focus before stepping into Paper II (Structured &amp; Essay).
          </p>

          {/* Paper 1 Summary Card */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1rem",
              background: "var(--bg-secondary)",
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              marginBottom: "2rem",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Paper I Answered</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                {p1AnsweredCount} / {paper1Indices.length}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Marked for Review</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: p1FlaggedCount > 0 ? "var(--warning)" : "var(--text-muted)" }}>
                {p1FlaggedCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Paper II Questions</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {paper2Indices.length} Questions
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setPaperStage("paper1");
                if (paper1Indices.length > 0) setCurrentIndex(paper1Indices[paper1Indices.length - 1]);
              }}
              className="btn btn-secondary"
              style={{ padding: "0.75rem 1.5rem", fontSize: "0.95rem" }}
            >
              ← Review Paper I Answers
            </button>

            <button
              type="button"
              onClick={() => {
                setPaperStage("paper2");
                if (paper2Indices.length > 0) {
                  setCurrentIndex(paper2Indices[0]);
                }
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="btn btn-primary"
              style={{ padding: "0.75rem 2rem", fontSize: "0.95rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              Ready for Paper II (Structured &amp; Essay) <SvgIcon name="arrow-right" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Wide Full-Width Answering Area */}
      {paperStage !== "breather" && (
        <div style={{ width: "100%" }}>
          {currentQ && (
            <div>
              {currentQ.template_type === "structured_subparts" || (Array.isArray(currentQ.structured_subparts_json) && currentQ.structured_subparts_json.length > 0) ? (
                /* PAPER II-A STRUCTURED SUBPARTS */
                <StudentStructuredQuestionRenderer
                  question={{ ...currentQ, question_number: currentDisplayNumber }}
                  subpartAnswers={subpartAnswers[currentQ.id] || {}}
                  onAnswerChange={(nodeId, val) => {
                    setSubpartAnswers((prev) => ({
                      ...prev,
                      [currentQ.id]: {
                        ...(prev[currentQ.id] || {}),
                        [nodeId]: val,
                      },
                    }));
                  }}
                  isFlagged={isFlagged}
                  onToggleFlag={() => {
                    setFlaggedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(currentQ.id)) next.delete(currentQ.id);
                      else next.add(currentQ.id);
                      return next;
                    });
                  }}
                />
              ) : ((currentQ.template_type as string) === "essay_rubric" || (currentQ.template_type as string) === "essay_checklist" || (currentQ.template_type as string) === "essay" || Boolean(currentQ.essay_checklist_json)) ? (
                /* PAPER II-B ESSAY (ALL 3 A/L FORMATS SUPPORTED) */
                (() => {
                  const normalized = normalizeLegacyEssayData(currentQ.essay_checklist_json, currentQ.stem_text, currentQ.points);
                  const isMultiPartOrShortNotes =
                    (normalized.structure_format === "multi_part" || normalized.structure_format === "short_notes") &&
                    normalized.subparts &&
                    normalized.subparts.length > 0;

                  return (
                    <div className="card" style={{ padding: "2rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                      {/* Question Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                            Question {currentDisplayNumber}
                          </span>
                          <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                            {currentQ.points || 40} Marks
                          </span>
                          <span className="badge badge-info" style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>
                            {normalized.structure_format === "short_notes" ? "Short Notes" : normalized.structure_format === "multi_part" ? "Structured Essay" : "Complete Essay"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFlaggedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(currentQ.id)) next.delete(currentQ.id);
                              else next.add(currentQ.id);
                              return next;
                            });
                          }}
                          className={`btn ${isFlagged ? "btn-warning" : "btn-secondary"}`}
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <SvgIcon name="bookmark" size={14} />
                          {isFlagged ? "Marked for Review" : "Mark for Review"}
                        </button>
                      </div>

                      {/* Main Stem / Instruction Text */}
                      {currentQ.stem_text && (
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                          {normalizeScientificSymbols(currentQ.stem_text)}
                        </h3>
                      )}

                      {normalized.instruction && normalized.instruction !== currentQ.stem_text && (
                        <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
                          {normalizeScientificSymbols(normalized.instruction)}
                        </p>
                      )}

                      {/* Diagram Image / Lightbox */}
                      {(currentQ.diagram_url || currentQ.requires_image) && (
                        <QuestionDiagramImage
                          diagramUrl={currentQ.diagram_url}
                          requiresImage={currentQ.requires_image}
                          imageDescription={currentQ.image_description}
                          questionNumber={currentQ.question_number}
                          isEditing={false}
                          showDescription={false}
                        />
                      )}

                      {/* Essay Answering Area */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1.5rem" }}>
                        {isMultiPartOrShortNotes && normalized.subparts ? (
                          /* Multi-Part / Short Notes: Dedicated answer area for each subpart */
                          normalized.subparts.map((sub, idx) => {
                            const cleanPrompt = stripLeadingNumberingPrefix(sub.prompt);
                            const subLabel = sub.label ? (sub.label.startsWith("(") ? sub.label : `(${sub.label})`) : getRomanLabel(idx);
                            const hasChildren = sub.children && sub.children.length > 0;

                            if (hasChildren) {
                              return (
                                <div key={sub.id || idx} style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.25rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
                                    <span style={{ color: "var(--accent-primary)", marginRight: "0.4rem" }}>{subLabel}</span>
                                    <span>{normalizeScientificSymbols(cleanPrompt)}</span>
                                  </div>

                                  {sub.children!.map((child, cIdx) => {
                                    const childPrompt = stripLeadingNumberingPrefix(child.prompt);
                                    const childLabel = child.label ? (child.label.startsWith("(") ? child.label : `(${child.label})`) : getAlphaLabel(cIdx);
                                    const subKey = `${sub.id || idx}_${child.id || cIdx}`;

                                    return (
                                      <div key={child.id || cIdx} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingLeft: "1rem", borderLeft: "2px solid rgba(99, 102, 241, 0.3)" }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                                          <span style={{ color: "var(--accent-primary)", marginRight: "0.4rem" }}>{childLabel}</span>
                                          <span>{normalizeScientificSymbols(childPrompt)}</span>
                                        </div>

                                        <StudentEssayRichAnswerArea
                                          subpartLabel={`${subLabel} ${childLabel}`}
                                          marks={child.marks}
                                          value={subpartAnswers[currentQ.id]?.[subKey] || ""}
                                          onChange={(val) => {
                                            setSubpartAnswers((prev) => ({
                                              ...prev,
                                              [currentQ.id]: {
                                                ...(prev[currentQ.id] || {}),
                                                [subKey]: val,
                                              },
                                            }));
                                          }}
                                          minRows={6}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            const subKey = sub.id || String(idx);
                            return (
                              <div key={sub.id || idx} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
                                  <span style={{ color: "var(--accent-primary)", marginRight: "0.4rem" }}>{subLabel}</span>
                                  <span>{normalizeScientificSymbols(cleanPrompt)}</span>
                                </div>

                                <StudentEssayRichAnswerArea
                                  subpartLabel={subLabel}
                                  marks={sub.marks}
                                  value={subpartAnswers[currentQ.id]?.[subKey] || ""}
                                  onChange={(val) => {
                                    setSubpartAnswers((prev) => ({
                                      ...prev,
                                      [currentQ.id]: {
                                        ...(prev[currentQ.id] || {}),
                                        [subKey]: val,
                                      },
                                    }));
                                  }}
                                  minRows={8}
                                />
                              </div>
                            );
                          })
                        ) : (
                          /* Single Complete Essay: One comprehensive rich answer box */
                          <StudentEssayRichAnswerArea
                            value={essayAnswers[currentQ.id] || ""}
                            onChange={(val) => {
                              setEssayAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
                            }}
                            attachmentUrl={essayImages[currentQ.id] || ""}
                            onAttachmentUrlChange={(url) => {
                              setEssayImages((prev) => ({ ...prev, [currentQ.id]: url }));
                            }}
                            minRows={14}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* CENTRALIZED PAPER I MCQ RENDERER */
                <MCQQuestionPaperRenderer
                  question={currentQ}
                  selectedOption={currentAnswer}
                  onSelectOption={(opt) => {
                    setAnswers((prev) => ({ ...prev, [currentQ.id]: opt }));
                  }}
                  isFlagged={isFlagged}
                  onToggleFlag={() => {
                    setFlaggedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(currentQ.id)) next.delete(currentQ.id);
                      else next.add(currentQ.id);
                      return next;
                    });
                  }}
                />
              )}

              {/* Bottom Pagination & Quick Navigation Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => {
                    if (hasBothPapers && paperStage === "paper2" && currentIndex === paper2Indices[0]) {
                      setPaperStage("breather");
                    } else {
                      setCurrentIndex((prev) => Math.max(0, prev - 1));
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <SvgIcon name="arrow-left" size={16} /> Previous Question
                </button>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {hasBothPapers && paperStage === "paper1" && currentIndex === paper1Indices[paper1Indices.length - 1] ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPaperStage("breather");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="btn btn-primary"
                      style={{ fontWeight: 700, padding: "0.6rem 1.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      Complete Paper I &amp; Proceed to Paper II <SvgIcon name="arrow-right" size={16} />
                    </button>
                  ) : currentIndex === questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmSubmit(true)}
                      className="btn btn-primary"
                      style={{ fontWeight: 700, padding: "0.6rem 1.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      Review &amp; Submit Paper <SvgIcon name="check" size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      className="btn btn-primary"
                      style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                    >
                      Next Question <SvgIcon name="arrow-right" size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── FINAL CONFIRMATION SUBMISSION MODAL ─── */}
      {showConfirmSubmit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div className="card" style={{ maxWidth: "520px", width: "100%", padding: "2rem", background: "var(--bg-card)", boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)" }}>
            <h3 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
              Submit Examination Paper
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
              Are you ready to submit your exam paper for official grading? You will not be able to modify your answers once submitted.
            </p>

            {/* Answer Summary Card */}
            <div style={{ background: "var(--bg-secondary)", padding: "1.1rem", borderRadius: "var(--radius-md)", marginBottom: "1.25rem", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Answered Questions:</span>
                <strong style={{ color: "var(--accent-primary)" }}>{answeredTotal} / {questions.length}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Marked for Review:</span>
                <strong style={{ color: "var(--warning)" }}>{flaggedIds.size}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.92rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Unanswered Questions:</span>
                <strong style={{ color: unansweredTotal > 0 ? "var(--error)" : "var(--success)" }}>
                  {unansweredTotal}
                </strong>
              </div>
            </div>

            {/* Unanswered Questions Warning Alert */}
            {unansweredTotal > 0 && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "1.5rem",
                  fontSize: "0.85rem",
                  color: "var(--warning)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <SvgIcon name="alert-triangle" size={16} />
                <span>You have <strong>{unansweredTotal} unanswered question(s)</strong>. Unanswered items earn 0 marks.</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.85rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmSubmit(false)}
                className="btn btn-secondary"
              >
                Continue Reviewing
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="btn btn-primary"
                style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: "14px", height: "14px" }} /> Submitting...
                  </>
                ) : (
                  "Confirm & Submit Paper"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentALExamTakePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center" }}><div className="spinner" /> Loading Examination...</div>}>
      <StudentALExamTakeContent params={params} />
    </Suspense>
  );
}
