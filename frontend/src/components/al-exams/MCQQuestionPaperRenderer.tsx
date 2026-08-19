"use client";

import React, { useMemo } from "react";
import { ALQuestion } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import QuestionDiagramImage, { DiagramItem } from "@/components/al-exams/QuestionDiagramImage";

/**
 * Normalizes scientific, biochemical, and physiological symbols for authentic A/L examination rendering.
 */
export function normalizeScientificSymbols(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\\psi_w|\\psi w|psi_w/g, "ψw")
    .replace(/\\psi_s|\\psi s|psi_s/g, "ψs")
    .replace(/\\psi_p|\\psi p|psi_p/g, "ψp")
    .replace(/\\psi/g, "ψ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\mu/g, "μ")
    .replace(/CO2\b/g, "CO₂")
    .replace(/H2O\b/g, "H₂O")
    .replace(/O2\b/g, "O₂")
    .replace(/HCO3-\b/g, "HCO₃⁻")
    .replace(/NO3-\b/g, "NO₃⁻")
    .replace(/degC\b|degrees Celsius/gi, "°C")
    .replace(/\\times/g, "×")
    .replace(/\\rightarrow|->/g, "→")
    .replace(/\\leftrightarrow|<->/g, "↔")
    .replace(/\\le|<=/g, "≤")
    .replace(/\\ge|>=/g, "≥")
    .replace(/\\pm/g, "±")
    .replace(/\\approx/g, "≈");
}

export interface MCQQuestionPaperRendererProps {
  question: ALQuestion;
  selectedOption?: string;
  onSelectOption?: (optionKey: string) => void;
  isFlagged?: boolean;
  onToggleFlag?: () => void;
  disabled?: boolean;
  isTeacherPreview?: boolean;
  showTeacherMetadata?: boolean;
  showCorrectAnswer?: boolean;
}

/**
 * Fallback A/L Biology Paper I Multi-Response Grid Options (Questions 41–50)
 * Non-negotiable Sri Lankan National Directions Scheme:
 * (1) = Only (A), (B) and (D) are correct
 * (2) = Only (A), (C) and (D) are correct
 * (3) = Only (A) and (B) are correct
 * (4) = Only (C) and (D) are correct
 * (5) = Any other response or combination of responses is correct
 */
const DEFAULT_AL_MULTI_RESPONSE_OPTIONS = [
  "If only (A), (B) and (D) are correct",
  "If only (A), (C) and (D) are correct",
  "If only (A) and (B) are correct",
  "If only (C) and (D) are correct",
  "If any other response or combination of responses is correct",
];

const DEFAULT_AL_COMBINATION_GRID_OPTIONS = [
  "(A) and (B) only",
  "(A) and (C) only",
  "(C) and (D) only",
  "(A), (B) and (D) only",
  "All of the above statements are correct",
];

interface MatrixTableData {
  headers: string[];
  rows: string[][];
}

interface SpecimenBlock {
  title: string;
  points: string[];
}

function getTemplateDisplayName(templateType: string): string {
  const norm = (templateType || "generic_mcq").toLowerCase();
  switch (norm) {
    case "generic_mcq":
      return "Direct Factual Recall";
    case "multi_response_grid":
      return "Multi-Response Grid (Q41–50)";
    case "five_statement_truth":
      return "Five-Statement Evaluation";
    case "matching_column":
      return "Matrix Matching / Profile Grid";
    case "combination_grid":
      return "Multi-Variable Selection";
    case "sequential_diagnostic":
      return "Sequential / Diagnostic";
    case "incomplete_stem":
      return "Incomplete Stem / Calculation";
    default:
      return "Standard MCQ";
  }
}

export default function MCQQuestionPaperRenderer({
  question,
  selectedOption = "",
  onSelectOption,
  isFlagged = false,
  onToggleFlag,
  disabled = false,
  isTeacherPreview = false,
  showTeacherMetadata = false,
  showCorrectAnswer = false,
}: MCQQuestionPaperRendererProps) {
  // Defensive check for malformed question data
  if (!question || typeof question !== "object") {
    return (
      <div
        className="card"
        style={{
          padding: "2rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <SvgIcon name="alert-circle" size={32} style={{ color: "var(--warning)", margin: "0 auto 0.75rem" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Question content could not be displayed.
        </p>
      </div>
    );
  }

  const templateType = (question.template_type || "generic_mcq").toLowerCase();

  // 1. Dynamic Options Extraction
  const optionsList = useMemo(() => {
    if (templateType === "multi_response_grid") {
      return DEFAULT_AL_MULTI_RESPONSE_OPTIONS;
    }
    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options;
    }
    if (templateType === "combination_grid") {
      return DEFAULT_AL_COMBINATION_GRID_OPTIONS;
    }
    return ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"];
  }, [question.options, templateType]);

  // 2. Dynamic Statements & Stem Parsing (Deduplication Pipeline for Multi-Variable & Truth Evaluation)
  const { statementsList, stemWithoutStatements } = useMemo<{ statementsList: { code: string; text: string }[]; stemWithoutStatements: string }>(() => {
    const rawStem = question.stem_text || "";

    // Check if statements_json exists and contains REAL (non-placeholder) statements
    const hasValidStatementsJson =
      Array.isArray(question.statements_json) &&
      question.statements_json.length >= 2 &&
      !question.statements_json.every((st: any) => {
        const t = (typeof st === "string" ? st : st?.text || "").trim().toLowerCase();
        return /^(?:premise|statement)\s*[a-e](?:\s*regarding\s*.*)?$/i.test(t) || t === "" || t.startsWith("premise ");
      });

    // Case A: Explicit valid non-placeholder statements_json provided
    if (hasValidStatementsJson) {
      const parsed: { code: string; text: string }[] = question.statements_json.map((st: any, i: number) => {
        if (typeof st === "string") {
          return { code: String.fromCharCode(65 + i), text: st };
        }
        return {
          code: st.code || String.fromCharCode(65 + i),
          text: st.text || "",
        };
      });

      // Strip embedded statements from rawStem so they are not rendered twice
      const lines = rawStem.split("\n");
      const filteredLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        // Matches "A. text", "A - text", "(A) text", "A: text"
        const isStmt = /^(?:\([A-Ea-e]\)|[A-Ea-e][\.\:\-])\s+/i.test(trimmed);
        if (!isStmt) {
          filteredLines.push(line);
        }
      }

      const stripped = filteredLines.join("\n").trim();
      return {
        statementsList: parsed,
        stemWithoutStatements: stripped || rawStem,
      };
    }

    // Case B: No valid statements_json, parse embedded (A) ... (B) ... (C) ... (D) ... statements directly from rawStem
    const lines = rawStem.split("\n");
    const parsedStatements: { code: string; text: string }[] = [];
    const remainingStemLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(?:\(([A-Ea-e])\)|([A-Ea-e])[\.\:\-])\s+(.+)$/);
      if (match) {
        const code = (match[1] || match[2]).toUpperCase();
        parsedStatements.push({
          code,
          text: match[3].trim(),
        });
      } else {
        remainingStemLines.push(line);
      }
    }

    if (parsedStatements.length >= 2) {
      return {
        statementsList: parsedStatements,
        stemWithoutStatements: remainingStemLines.join("\n").trim() || rawStem,
      };
    }

    return {
      statementsList: [],
      stemWithoutStatements: rawStem,
    };
  }, [question.stem_text, question.statements_json]);

  // 3. Assertion-Reason Extraction & Deduplication
  const { assertionText, reasonText, stemWithoutAssertion } = useMemo(() => {
    let aText = question.assertion_text || "";
    let rText = question.reason_text || "";
    let currentStem = stemWithoutStatements;

    if (!aText || !rText) {
      const aMatch = currentStem.match(/(?:Statement\s*I\s*\(Assertion\)|Assertion)\s*[:\-]\s*([\s\S]+?)(?=(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]|$)/i);
      const rMatch = currentStem.match(/(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]\s*([\s\S]+?)$/i);
      if (aMatch && aMatch[1]) aText = aText || aMatch[1].trim();
      if (rMatch && rMatch[1]) rText = rText || rMatch[1].trim();
    }

    if (aText || rText) {
      currentStem = currentStem
        .replace(/(?:Statement\s*I\s*\(Assertion\)|Assertion)\s*[:\-]\s*[\s\S]+?(?=(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]|$)/i, "")
        .replace(/(?:Statement\s*II\s*\(Reason\)|Reason)\s*[:\-]\s*[\s\S]+?$/i, "")
        .trim();
    }

    return {
      assertionText: aText,
      reasonText: rText,
      stemWithoutAssertion: currentStem || (aText ? "Consider the statements given below and select the correct option:" : stemWithoutStatements),
    };
  }, [question.assertion_text, question.reason_text, stemWithoutStatements]);

  // 4. Dynamic Sequential Steps Extraction & Deduplication
  const { sequenceSteps, stemWithoutSequence } = useMemo(() => {
    const gridKey = question.grid_key_json;
    let steps: string[] = [];
    if (
      templateType === "sequential_diagnostic" &&
      gridKey &&
      Array.isArray(gridKey.sequence_steps) &&
      gridKey.sequence_steps.length > 0
    ) {
      const rawSteps = gridKey.sequence_steps.map((s: any) => (typeof s === "string" ? s : s.text || String(s)));
      // Filter out dummy default placeholder steps like "Step 1", "Step 2", "Step 3", "Step 4"
      const isPlaceholder = rawSteps.every((s: string) =>
        /^(?:Step|Stage)?\s*\d+$/i.test(s.trim()) ||
        s.trim().toLowerCase().startsWith("[describe") ||
        s.trim() === ""
      );
      if (!isPlaceholder) {
        steps = rawSteps;
      }
    }

    let currentStem = stemWithoutAssertion;
    if (steps.length > 0) {
      const lines = currentStem.split("\n").filter((l) => !/^(?:Step|Stage)\s*\d+[\.\:\-]/i.test(l.trim()));
      currentStem = lines.join("\n").trim();
    }

    return {
      sequenceSteps: steps,
      stemWithoutSequence: currentStem || stemWithoutAssertion,
    };
  }, [question.grid_key_json, stemWithoutAssertion, templateType]);

  // 5. Dynamic Multi-Column Matrix / Physiological Profile Table Extraction
  const matrixData = useMemo<MatrixTableData | null>(() => {
    // Only extract and render matrix tables for matching_column questions
    if (templateType !== "matching_column") return null;

    const gridKey = question.grid_key_json;
    if (!gridKey || typeof gridKey !== "object") return null;

    // A. Explicit headers and matrix_rows / rows
    if (Array.isArray(gridKey.headers) && (Array.isArray(gridKey.rows) || Array.isArray(gridKey.matrix_rows))) {
      const rows = (gridKey.rows || gridKey.matrix_rows || []).map((r: any) =>
        Array.isArray(r) ? r.map((c: any) => String(c || "")) : [String(r || "")]
      ).filter((r: string[]) => r.some((c) => c.trim() !== ""));

      if (rows.length > 0) {
        return {
          headers: gridKey.headers.map((h: any) => String(h || "")),
          rows,
        };
      }
    }

    // B. Multi-Column matching (Column I, II, III, IV)
    if (gridKey.colI || gridKey.column_I || gridKey.col1) {
      const colI = (gridKey.colI || gridKey.column_I || gridKey.col1 || []).filter((x: any) => String(x || "").trim() !== "");
      const colII = (gridKey.colII || gridKey.column_II || gridKey.col2 || []).filter((x: any) => String(x || "").trim() !== "");
      const colIII = (gridKey.colIII || gridKey.column_III || gridKey.col3 || []).filter((x: any) => String(x || "").trim() !== "");
      const colIV = (gridKey.colIV || gridKey.column_IV || gridKey.col4 || []).filter((x: any) => String(x || "").trim() !== "");

      if (colI.length > 0 || colII.length > 0) {
        const headers = [
          String(gridKey.colIHeader || gridKey.col1Header || "Column I"),
          String(gridKey.colIIHeader || gridKey.col2Header || "Column II"),
        ];
        if (colIII.length > 0) headers.push(String(gridKey.colIIIHeader || gridKey.col3Header || "Column III"));
        if (colIV.length > 0) headers.push(String(gridKey.colIVHeader || gridKey.col4Header || "Column IV"));

        const maxLen = Math.max(colI.length, colII.length, colIII.length, colIV.length);
        const rows: string[][] = [];
        for (let r = 0; r < maxLen; r++) {
          const row = [String(colI[r] || ""), String(colII[r] || "")];
          if (colIII.length > 0) row.push(String(colIII[r] || ""));
          if (colIV.length > 0) row.push(String(colIV[r] || ""));
          rows.push(row);
        }

        return { headers, rows };
      }
    }

    return null;
  }, [question.grid_key_json, templateType]);

  // 6. Diagnostic / Case-Study Specimen Blocks Parser & Final Clean Stem
  const { cleanStem, specimenBlocks } = useMemo<{ cleanStem: string; specimenBlocks: SpecimenBlock[] }>(() => {
    let rawStem = stemWithoutSequence;

    if (matrixData) {
      // Strip markdown table rows or "Column I:" definitions from stem
      const lines = rawStem.split("\n").filter((l) => !l.trim().startsWith("|") && !/^(?:Column\s+[I|V|X]+|Column\s+\d+)[\:\-]/i.test(l.trim()));
      rawStem = lines.join("\n").trim() || rawStem;
    }

    // Check if grid_key_json has explicit specimens
    if (question.grid_key_json?.specimens && Array.isArray(question.grid_key_json.specimens)) {
      return {
        cleanStem: normalizeScientificSymbols(rawStem),
        specimenBlocks: question.grid_key_json.specimens.map((s: any) => ({
          title: s.title || s.name || "Specimen",
          points: Array.isArray(s.features || s.points) ? s.features || s.points : [String(s.features || "")],
        })),
      };
    }

    // Check for "Specimen A: ... Specimen B: ..." or "Patient A: ... Patient B: ..." in stem text
    const specimenRegex = /(Specimen\s+[A-Z0-9]|Patient\s+[A-Z0-9]|Organism\s+[A-Z0-9]|Plant\s+[A-Z0-9]|Animal\s+[A-Z0-9])\s*[:\-]/gi;
    const matches = Array.from(rawStem.matchAll(specimenRegex));

    if (matches.length >= 2) {
      const blocks: SpecimenBlock[] = [];
      const introText = rawStem.substring(0, matches[0].index).trim();

      for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index! + matches[i][0].length;
        const endIdx = i < matches.length - 1 ? matches[i + 1].index! : rawStem.length;
        const rawContent = rawStem.substring(startIdx, endIdx).trim();

        // Split into bullet points or lines
        const lines = rawContent
          .split(/\n|;|•|-/)
          .map((l) => l.trim())
          .filter((l) => l.length > 2);

        blocks.push({
          title: matches[i][1],
          points: lines.length > 0 ? lines : [rawContent],
        });
      }

      return {
        cleanStem: normalizeScientificSymbols(introText || "Consider the following diagnostic specimens and answer the question:"),
        specimenBlocks: blocks,
      };
    }

    return {
      cleanStem: normalizeScientificSymbols(rawStem),
      specimenBlocks: [],
    };
  }, [stemWithoutSequence, matrixData, question.grid_key_json]);

  // 7. Multiple Diagrams / Figures Extraction
  const multiDiagrams: DiagramItem[] = useMemo(() => {
    const gridKey = question.grid_key_json;
    if (gridKey && Array.isArray(gridKey.diagrams) && gridKey.diagrams.length > 0) {
      return gridKey.diagrams;
    }
    if (gridKey && Array.isArray(gridKey.images) && gridKey.images.length > 0) {
      return gridKey.images;
    }
    return [];
  }, [question.grid_key_json]);

  // Option selection handler
  const handleOptionClick = (optKey: string) => {
    if (disabled || !onSelectOption) return;
    onSelectOption(optKey);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* ─── TEACHER-ONLY METADATA BAR (PREVIEW MODE) ─── */}
      {(isTeacherPreview || showTeacherMetadata) && (
        <div
          style={{
            padding: "0.85rem 1.15rem",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="badge badge-primary" style={{ fontWeight: 700, fontSize: "0.75rem" }}>
                {getTemplateDisplayName(templateType)}
              </span>
              <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
                {question.points || 1.0} Mark(s)
              </span>
              {question.difficulty && (
                <span className="badge badge-secondary" style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>
                  {question.difficulty}
                </span>
              )}
              {question.cognitive_level && (
                <span className="badge badge-secondary" style={{ fontSize: "0.75rem", textTransform: "capitalize" }}>
                  {question.cognitive_level}
                </span>
              )}
            </div>

            {question.correct_option && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Correct Answer:</span>
                <span className="badge badge-success" style={{ fontWeight: 800 }}>
                  Option ({question.correct_option})
                </span>
              </div>
            )}
          </div>

          {question.explanation && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45, paddingTop: "0.4rem", borderTop: "1px dashed var(--border)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Marking Explanation: </strong>
              <span>{normalizeScientificSymbols(question.explanation)}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── EXAMINATION QUESTION CARD (SHARED PAPER RENDERING) ─── */}
      <div
        className="card"
        style={{
          padding: "2rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* 1. QUESTION HEADER & ACTIONS */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color: "var(--accent-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Question {question.question_number}
            </span>
            {question.points && question.points > 1.0 && (
              <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                {question.points} Marks
              </span>
            )}
          </div>

          {onToggleFlag && !isTeacherPreview && (
            <button
              type="button"
              onClick={onToggleFlag}
              className={`btn ${isFlagged ? "btn-warning" : "btn-secondary"}`}
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
              aria-label={isFlagged ? "Remove review bookmark" : "Mark question for review"}
            >
              <SvgIcon name="bookmark" size={14} />
              {isFlagged ? "Marked for Review" : "Mark for Review"}
            </button>
          )}
        </div>

        {/* 2. QUESTION STEM */}
        <div
          style={{
            fontSize: "1.08rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.65,
            marginBottom: "1.25rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {cleanStem}
        </div>

        {/* 3. OPTIONAL DIAGRAM / IMAGE(S) WITH LIGHTBOX SUPPORT */}
        {(question.diagram_url || multiDiagrams.length > 0 || question.requires_image) && (
          <QuestionDiagramImage
            diagramUrl={question.diagram_url}
            diagrams={multiDiagrams.length > 0 ? multiDiagrams : undefined}
            requiresImage={question.requires_image}
            imageDescription={question.image_description}
            questionNumber={question.question_number}
            isEditing={false}
            showDescription={false}
          />
        )}

        {/* 4. DIAGNOSTIC SPECIMEN CARDS (Case-Study Questions) */}
        {specimenBlocks.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: specimenBlocks.length > 1 ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {specimenBlocks.map((sb: SpecimenBlock, idx: number) => (
              <div
                key={idx}
                style={{
                  padding: "1rem 1.25rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    color: "var(--accent-primary)",
                    marginBottom: "0.5rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "0.3rem",
                  }}
                >
                  {sb.title}
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.92rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
                  {sb.points.map((pt, pIdx) => (
                    <li key={pIdx} style={{ marginBottom: "0.2rem" }}>
                      {normalizeScientificSymbols(pt)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* 5. ASSERTION - REASON STATEMENT BOXES */}
        {(templateType === "assertion_reason" || Boolean(assertionText || reasonText)) && (assertionText || reasonText) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.5rem" }}>
            {assertionText && (
              <div
                style={{
                  background: "var(--bg-secondary)",
                  padding: "0.85rem 1.1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: "var(--accent-primary)" }}>Statement I (Assertion): </strong>
                <span>{normalizeScientificSymbols(assertionText)}</span>
              </div>
            )}
            {reasonText && (
              <div
                style={{
                  background: "var(--bg-secondary)",
                  padding: "0.85rem 1.1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: "var(--accent-primary)" }}>Statement II (Reason): </strong>
                <span>{normalizeScientificSymbols(reasonText)}</span>
              </div>
            )}
          </div>
        )}

        {/* 6. STATEMENTS LIST (Five-Statement Truth & Multi-Variable / Combination) */}
        {statementsList.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              background: "var(--bg-secondary)",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}
          >
            {statementsList.map((st, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--accent-primary)", minWidth: "26px" }}>
                  ({st.code})
                </span>
                <span style={{ flex: 1 }}>{normalizeScientificSymbols(st.text)}</span>
              </div>
            ))}
          </div>
        )}

        {/* 7. SEQUENTIAL EVENT STAGES LIST */}
        {sequenceSteps.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              background: "rgba(99, 102, 241, 0.04)",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}
          >
            {sequenceSteps.map((step: string, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  fontSize: "0.95rem",
                  lineHeight: 1.4,
                  color: "var(--text-primary)",
                }}
              >
                <span
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "var(--accent-primary)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1 }}>{normalizeScientificSymbols(step)}</span>
              </div>
            ))}
          </div>
        )}

        {/* 8. MATCHING MATRIX & PHYSIOLOGICAL PROFILE TABLES */}
        {matrixData && (
          <div
            style={{
              overflowX: "auto",
              marginBottom: "1.5rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: "0.92rem",
              }}
            >
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                  {matrixData.headers.map((h: string, idx: number) => (
                    <th
                      key={idx}
                      style={{
                        padding: "0.85rem 1.1rem",
                        fontWeight: 700,
                        color: "var(--accent-primary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {normalizeScientificSymbols(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.rows.map((row: string[], rIdx: number) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: rIdx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                    }}
                  >
                    {row.map((cell: string, cIdx: number) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: "0.85rem 1.1rem",
                          color: "var(--text-primary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {normalizeScientificSymbols(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 9. FORMULA / GIVEN PARAMETERS CALLOUT BOX */}
        {question.grid_key_json && (question.grid_key_json.formula || question.grid_key_json.given_values) && (
          <div
            style={{
              padding: "0.85rem 1.1rem",
              background: "rgba(16, 185, 129, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
              lineHeight: 1.5,
            }}
          >
            {question.grid_key_json.formula && (
              <div>
                <strong style={{ color: "var(--color-success, #10b981)" }}>Formula / Relation: </strong>
                <code>{normalizeScientificSymbols(question.grid_key_json.formula)}</code>
              </div>
            )}
            {question.grid_key_json.given_values && (
              <div style={{ marginTop: question.grid_key_json.formula ? "0.35rem" : 0 }}>
                <strong>Given Parameters: </strong>
                <span>{normalizeScientificSymbols(question.grid_key_json.given_values)}</span>
              </div>
            )}
          </div>
        )}

        {/* 10. MULTIPLE-RESPONSE GRID DIRECTIONS HEADER */}
        {templateType === "multi_response_grid" && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <SvgIcon name="info" size={16} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
            <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.4 }}>
              <strong>Official A/L Multiple-Response Grid:</strong> Decide which statement(s) (A–E) are correct, then select the corresponding option (1–5) below.
            </div>
          </div>
        )}

        {/* 11. ANSWER OPTIONS (1 to 5 / A to E) */}
        <div
          role="radiogroup"
          aria-label={`Options for Question ${question.question_number}`}
          style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.35rem" }}
        >
          {optionsList.map((optText, optIdx) => {
            const optLetter = String.fromCharCode(65 + optIdx); // "A", "B", ...
            const optNumber = String(optIdx + 1); // "1", "2", ...

            // Student selection match
            const isSelected =
              selectedOption.toUpperCase() === optLetter ||
              selectedOption === optNumber ||
              selectedOption.toUpperCase() === `(${optNumber})` ||
              selectedOption.toUpperCase() === `(${optLetter})`;

            // Teacher preview correct answer match
            const isCorrectOption =
              (isTeacherPreview || showCorrectAnswer) &&
              Boolean(
                question.correct_option &&
                  (question.correct_option.toUpperCase() === optLetter ||
                    question.correct_option === optNumber ||
                    question.correct_option.toUpperCase() === `(${optNumber})` ||
                    question.correct_option.toUpperCase() === `(${optLetter})`)
              );

            // Clean option text (remove leading "A." or "(1)" if duplicated in text)
            let cleanText = optText.trim();
            if (/^(\([1-5A-E]\)|[1-5A-E][\.\)])\s*/i.test(cleanText)) {
              cleanText = cleanText.replace(/^(\([1-5A-E]\)|[1-5A-E][\.\)])\s*/i, "");
            }
            cleanText = normalizeScientificSymbols(cleanText);

            return (
              <button
                key={optIdx}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => handleOptionClick(optLetter)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOptionClick(optLetter);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                  padding: "0.75rem 1.1rem",
                  borderRadius: "var(--radius-md)",
                  border: isCorrectOption
                    ? "2px solid var(--success, #10b981)"
                    : isSelected
                    ? "2px solid var(--accent-primary)"
                    : "1px solid var(--border)",
                  background: isCorrectOption
                    ? "rgba(16, 185, 129, 0.08)"
                    : isSelected
                    ? "rgba(99, 102, 241, 0.08)"
                    : "var(--bg-card)",
                  color: "var(--text-primary)",
                  cursor: disabled ? "default" : "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  outline: "none",
                  width: "100%",
                }}
              >
                {/* Option Number Badge */}
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: isCorrectOption
                      ? "var(--success, #10b981)"
                      : isSelected
                      ? "var(--accent-primary)"
                      : "var(--bg-secondary)",
                    color: isCorrectOption || isSelected ? "#fff" : "var(--text-secondary)",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.85rem",
                    flexShrink: 0,
                    border: isCorrectOption || isSelected ? "none" : "1px solid var(--border)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {`(${optIdx + 1})`}
                </div>

                {/* Option Text Content */}
                <div
                  style={{
                    flex: 1,
                    fontSize: "0.92rem",
                    lineHeight: 1.45,
                    fontWeight: isCorrectOption || isSelected ? 600 : 400,
                    color: "var(--text-primary)",
                  }}
                >
                  {cleanText}
                </div>

                {/* Selected Indicator Checkmark */}
                {isSelected && !isCorrectOption && (
                  <div style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center" }}>
                    <SvgIcon name="check-circle" size={18} />
                  </div>
                )}
                {isCorrectOption && (
                  <div
                    className="badge badge-success"
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.3rem 0.65rem",
                    }}
                  >
                    <SvgIcon name="check-circle" size={14} /> Correct Key
                  </div>
                )}

                {/* Student Selection Indicator Checkmark */}
                {!isCorrectOption && isSelected && (
                  <div
                    style={{
                      color: "var(--accent-primary)",
                      display: "flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <SvgIcon name="check-circle" size={20} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
