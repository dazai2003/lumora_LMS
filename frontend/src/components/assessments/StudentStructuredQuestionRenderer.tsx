"use client";

import React, { useState, useRef, useEffect } from "react";
import { ALQuestion, resolveDiagramImageUrl } from "@/lib/api";
import { formatDisplayLabel, StructuredNode } from "@/lib/alStructuredTreeUtils";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";
import SvgIcon from "@/components/SvgIcon";
import ScientificSymbolPickerModal from "@/components/assessments/ScientificSymbolPickerModal";

export interface StudentStructuredQuestionRendererProps {
  question: ALQuestion;
  subpartAnswers: Record<string, any>;
  onAnswerChange: (nodeId: string, value: any) => void;
  disabled?: boolean;
  isFlagged?: boolean;
  onToggleFlag?: () => void;
}

/**
 * Interactive HTML5 Canvas Sketchpad for Student Biological Drawings.
 */
function StudentDrawingCanvas({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#1e293b");
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<"pen" | "eraser">("pen");
  const [hasDrawn, setHasDrawn] = useState(Boolean(value));

  // Initialize canvas with saved value if present
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (value && value.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setHasDrawn(true);
      };
      img.src = value;
    } else if (!value) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.strokeStyle = mode === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = mode === "eraser" ? lineWidth * 4 : lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Canvas Controls Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
          padding: "0.4rem 0.6rem",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          fontSize: "0.8rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("pen")}
            className={`btn ${mode === "pen" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <SvgIcon name="edit" size={12} /> Pen
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("eraser")}
            className={`btn ${mode === "eraser" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <SvgIcon name="trash" size={12} /> Eraser
          </button>

          {/* Color Palette */}
          {mode === "pen" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginLeft: "0.5rem" }}>
              {["#1e293b", "#2563eb", "#dc2626", "#16a34a"].map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => setColor(c)}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: c,
                    border: color === c ? "2px solid var(--accent-primary)" : "1px solid rgba(0,0,0,0.2)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={`Color ${c}`}
                />
              ))}
            </div>
          )}

          {/* Line Width */}
          <select
            value={lineWidth}
            disabled={disabled}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            style={{
              padding: "0.15rem 0.4rem",
              fontSize: "0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              marginLeft: "0.4rem",
            }}
          >
            <option value={1}>Fine (1px)</option>
            <option value={2}>Medium (2px)</option>
            <option value={4}>Thick (4px)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasDrawn && (
            <span style={{ fontSize: "0.75rem", color: "var(--success)" }}>
              ✓ Drawing Saved
            </span>
          )}
          <button
            type="button"
            disabled={disabled || !hasDrawn}
            onClick={handleClear}
            className="btn btn-secondary"
            style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem", color: "var(--error)" }}
          >
            Clear Canvas
          </button>
        </div>
      </div>

      {/* Drawing Canvas Board */}
      <div
        style={{
          border: "2px dashed var(--border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "#ffffff",
          display: "flex",
          justifyContent: "center",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={680}
          height={280}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            touchAction: "none",
            cursor: mode === "pen" ? "crosshair" : "cell",
            width: "100%",
            maxWidth: "680px",
            height: "280px",
            background: "#ffffff",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Image Upload / Paste / Preview Component for Drawing questions.
 */
function StudentDrawingUploadArea({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {value ? (
        <div
          style={{
            position: "relative",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem",
            background: "var(--bg-secondary)",
            textAlign: "center",
          }}
        >
          <img
            src={value}
            alt="Uploaded Biological Diagram"
            style={{
              maxWidth: "100%",
              maxHeight: "260px",
              objectFit: "contain",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          />
          <div style={{ display: "flex", justifyContent: "center", gap: "0.6rem", marginTop: "0.6rem" }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem" }}
            >
              <SvgIcon name="upload" size={13} /> Replace Image
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange("")}
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", color: "var(--error)" }}
            >
              <SvgIcon name="trash" size={13} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? "var(--accent-primary)" : "var(--border)"}`,
            borderRadius: "var(--radius-md)",
            padding: "1.75rem 1.25rem",
            textAlign: "center",
            background: isDragging ? "var(--accent-subtle, rgba(99, 102, 241, 0.05))" : "var(--bg-secondary)",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <SvgIcon name="upload" size={28} style={{ color: "var(--accent-primary)", margin: "0 auto 0.5rem" }} />
          <p style={{ margin: "0 0 0.25rem", fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>
            Upload or Drag & Drop Photo of your Drawing
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Supports PNG, JPG, or JPEG scanned from examination paper
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Main Student Structured Question Answering Component.
 */
export default function StudentStructuredQuestionRenderer({
  question,
  subpartAnswers,
  onAnswerChange,
  disabled = false,
  isFlagged = false,
  onToggleFlag,
}: StudentStructuredQuestionRendererProps) {
  const [drawingModeTab, setDrawingModeTab] = useState<Record<string, "canvas" | "upload">>({});
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const rawSubparts = question.structured_subparts_json;

  // Safe fallback if subparts are missing or malformed
  const nodes: StructuredNode[] = Array.isArray(rawSubparts) && rawSubparts.length > 0
    ? rawSubparts
    : [
        {
          id: `fallback_${question.id}_1`,
          label: "(A)",
          format_type: "structured_direct_recall",
          prompt: question.stem_text || "Answer the following question:",
          points: question.points || 10,
        },
      ];

  const totalPoints = question.points || 40;
  const scaledMarks = Math.round(totalPoints * 2.5 * 10) / 10;

  // Helper to insert quick scientific symbols
  const handleInsertSymbol = (nodeId: string, currentVal: string, symbol: string) => {
    if (disabled) return;
    const newVal = (currentVal || "") + symbol;
    onAnswerChange(nodeId, newVal);
  };

  /**
   * Proportional Dotted Line Answer Area for Direct Recall & Conceptual Explanation.
   */
  const renderDottedAnswerArea = (node: StructuredNode, currentAnswer: string) => {
    const pts = Number(node.points) || 1;
    const isDirectRecall = node.format_type === "structured_direct_recall";

    // Proportional line calculation matching authentic Sri Lankan A/L past papers
    let lineCount = 1;
    if (isDirectRecall) {
      lineCount = pts <= 1 ? 1 : 2;
    } else {
      // Conceptual explanations
      lineCount = pts <= 1 ? 2 : pts === 2 ? 3 : pts <= 4 ? 4 : 5;
    }

    if (lineCount === 1) {
      return (
        <div style={{ marginTop: "0.45rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="text"
              disabled={disabled}
              value={currentAnswer}
              onChange={(e) => onAnswerChange(node.id, e.target.value)}
              placeholder="...................................................................................................................................................."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderBottom: "1.5px dotted var(--text-secondary, #94a3b8)",
                padding: "0.4rem 0.2rem",
                fontSize: "0.95rem",
                fontFamily: "var(--font-sans, inherit)",
                color: "var(--text-primary)",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderBottomColor = "var(--accent-primary)";
              }}
              onBlur={(e) => {
                e.target.style.borderBottomColor = "var(--text-secondary, #94a3b8)";
              }}
            />
            <ScientificSymbolPickerModal
              compact={true}
              buttonLabel="Symbol (Ω)"
              disabled={disabled}
              onInsert={(sym) => handleInsertSymbol(node.id, currentAnswer, sym)}
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ marginTop: "0.45rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {/* Header Toolbar with Point Formatter & Scientific Symbol Picker */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.4rem",
            padding: "0.3rem 0.6rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
              Structured Writing Space ({lineCount} Lines)
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const prefix = currentAnswer.trim() ? "\n• " : "• ";
                onAnswerChange(node.id, (currentAnswer || "") + prefix);
              }}
              className="btn btn-secondary"
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              title="Add bulleted fact / point"
            >
              + Add Point (•)
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const lines = (currentAnswer || "").split("\n").filter((l) => l.trim().length > 0);
                const nextNum = lines.length + 1;
                const prefix = currentAnswer.trim() ? `\n(${nextNum}) ` : `(1) `;
                onAnswerChange(node.id, (currentAnswer || "") + prefix);
              }}
              className="btn btn-secondary"
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              title="Add numbered sub-point (1), (2)..."
            >
              + Sub-Point (1)
            </button>
          </div>

          <ScientificSymbolPickerModal
            buttonLabel="Insert Symbol (Ω)"
            disabled={disabled}
            onInsert={(sym) => handleInsertSymbol(node.id, currentAnswer, sym)}
          />
        </div>

        {/* Paper-style Multiline Lined Writing Area */}
        <textarea
          rows={Math.max(lineCount, 3)}
          disabled={disabled}
          value={currentAnswer}
          onChange={(e) => onAnswerChange(node.id, e.target.value)}
          placeholder="Write your structured, point-by-point answer clearly within the provided space..."
          style={{
            width: "100%",
            background: "repeating-linear-gradient(transparent, transparent 27px, var(--border) 28px)",
            lineHeight: "28px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            fontSize: "0.95rem",
            fontFamily: "var(--font-sans, inherit)",
            color: "var(--text-primary)",
            outline: "none",
            resize: "vertical",
            minHeight: `${Math.max(lineCount * 28 + 24, 100)}px`,
          }}
        />
      </div>
    );
  };

  /**
   * Side-by-Side Comparison Format Table.
   */
  const renderComparisonAnswerArea = (node: StructuredNode) => {
    const pairs = node.comparison_pairs || (node.comparison_data?.pairs as any[]) || [];
    const header1 = node.comparison_header_1 || "Structure / Feature A";
    const header2 = node.comparison_header_2 || "Structure / Feature B";

    if (pairs.length === 0) {
      return renderDottedAnswerArea(node, subpartAnswers[node.id] || "");
    }

    return (
      <div style={{ margin: "0.6rem 0", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "550px", borderCollapse: "collapse", border: "1.5px solid var(--border)", fontSize: "0.88rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <th style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", textAlign: "left", fontWeight: 700, width: "34%" }}>
                Feature / Criterion
              </th>
              <th style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", textAlign: "left", fontWeight: 700, width: "33%" }}>
                {header1}
              </th>
              <th style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", textAlign: "left", fontWeight: 700, width: "33%" }}>
                {header2}
              </th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((cp: any, idx: number) => {
              const key1 = `${node.id}__comp_${idx}_v1`;
              const key2 = `${node.id}__comp_${idx}_v2`;
              const val1 = subpartAnswers[key1] || "";
              const val2 = subpartAnswers[key2] || "";

              return (
                <tr key={idx}>
                  <td style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", fontWeight: 600, background: "var(--bg-secondary)" }}>
                    {cp.criterion}
                  </td>
                  <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.6rem" }}>
                    <input
                      type="text"
                      disabled={disabled}
                      value={val1}
                      onChange={(e) => onAnswerChange(key1, e.target.value)}
                      placeholder="Enter comparison feature..."
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px dotted var(--text-secondary)",
                        padding: "0.35rem 0.3rem",
                        fontSize: "0.88rem",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                  </td>
                  <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.6rem" }}>
                    <input
                      type="text"
                      disabled={disabled}
                      value={val2}
                      onChange={(e) => onAnswerChange(key2, e.target.value)}
                      placeholder="Enter comparison feature..."
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px dotted var(--text-secondary)",
                        padding: "0.35rem 0.3rem",
                        fontSize: "0.88rem",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  /**
   * Chronological / Sequential Pathway Format (Spacious, Responsive Cards).
   */
  const renderSequenceAnswerArea = (node: StructuredNode) => {
    const items = node.sequence_items || node.sequence_data?.expected_sequence || ["", "", ""];

    return (
      <div style={{ margin: "0.75rem 0", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
          Write each sequential stage in chronological order:
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "0.75rem" }}>
          {items.map((_: any, idx: number) => {
            const stepKey = `${node.id}__seq_${idx}`;
            const stepVal = subpartAnswers[stepKey] || "";

            return (
              <React.Fragment key={idx}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    padding: "0.65rem 0.85rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    flex: "1 1 260px",
                    minWidth: "240px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.82rem", color: "var(--accent-primary)", whiteSpace: "nowrap" }}>
                      Step {idx + 1}
                    </strong>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Chronological Phase</span>
                  </div>
                  <textarea
                    rows={2}
                    disabled={disabled}
                    value={stepVal}
                    onChange={(e) => onAnswerChange(stepKey, e.target.value)}
                    placeholder="Enter stage description..."
                    style={{
                      width: "100%",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.4rem 0.5rem",
                      fontSize: "0.88rem",
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "vertical",
                      minHeight: "48px",
                      lineHeight: 1.4,
                    }}
                  />
                </div>
                {idx < items.length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "1.25rem", color: "var(--accent-primary)", fontWeight: 800 }}>➔</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  /**
   * Structured Matrix / Classification Table Format (Spacious, Wide Design).
   */
  const renderMatrixAnswerArea = (node: StructuredNode) => {
    const headers = node.matrix_data?.col_headers || node.table_data?.headers || ["Biological Item / Structure", "Function / Classification"];
    const rows = node.matrix_data?.rows || node.table_data?.rows || [];

    if (rows.length === 0) {
      return renderDottedAnswerArea(node, subpartAnswers[node.id] || "");
    }

    return (
      <div style={{ margin: "0.75rem 0", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse", border: "1.5px solid var(--border)", fontSize: "0.88rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              {headers.map((h: string, hIdx: number) => (
                <th key={hIdx} style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", textAlign: "left", fontWeight: 700, color: "var(--text-primary)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, rIdx: number) => {
              const isObjRow = Boolean(row && typeof row === "object" && "item" in row);
              const itemLabel = isObjRow ? row.item : Array.isArray(row) ? row[0] : `Row ${rIdx + 1}`;

              const cellKey = `${node.id}__cell_${rIdx}_1`;
              const cellVal = subpartAnswers[cellKey] || "";

              return (
                <tr key={rIdx}>
                  <td style={{ border: "1px solid var(--border)", padding: "0.6rem 0.85rem", fontWeight: 600, background: "var(--bg-secondary)", color: "var(--text-primary)", width: "40%" }}>
                    {itemLabel}
                  </td>
                  <td style={{ border: "1px solid var(--border)", padding: "0.45rem 0.6rem" }}>
                    <textarea
                      rows={2}
                      disabled={disabled}
                      value={cellVal}
                      onChange={(e) => onAnswerChange(cellKey, e.target.value)}
                      placeholder="Write response..."
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "1px solid var(--border-subtle, var(--border))",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.4rem 0.5rem",
                        fontSize: "0.88rem",
                        color: "var(--text-primary)",
                        outline: "none",
                        resize: "vertical",
                        minHeight: "42px",
                        lineHeight: 1.4,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  /**
   * Biological Drawing Response Area (Canvas or Scanned Upload).
   */
  const renderDrawingAnswerArea = (node: StructuredNode) => {
    const drawingKey = `${node.id}__drawing`;
    const drawingVal = subpartAnswers[drawingKey] || "";
    const activeTab = drawingModeTab[node.id] || (drawingVal.startsWith("data:image") ? "canvas" : "upload");

    return (
      <div
        style={{
          margin: "0.75rem 0",
          padding: "1rem",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {/* Drawing Prompt & Checklist */}
        {node.drawing_prompt && (
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
            {normalizeScientificSymbols(node.drawing_prompt)}
          </p>
        )}

        {node.required_labels && node.required_labels.length > 0 && (
          <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)", display: "block", marginBottom: "0.2rem" }}>
              Required Diagram Labels Checklist:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {node.required_labels.map((lbl: string, li: number) => (
                <span
                  key={li}
                  style={{
                    fontSize: "0.75rem",
                    background: "var(--bg-secondary)",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "3px",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  ● {lbl}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tab Switcher: Draw Online vs Upload Scanned Paper Drawing */}
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem" }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDrawingModeTab((prev) => ({ ...prev, [node.id]: "upload" }))}
            className={`btn ${activeTab === "upload" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "0.78rem", padding: "0.3rem 0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <SvgIcon name="upload" size={13} /> Upload Photo of Drawing
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDrawingModeTab((prev) => ({ ...prev, [node.id]: "canvas" }))}
            className={`btn ${activeTab === "canvas" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "0.78rem", padding: "0.3rem 0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <SvgIcon name="edit" size={13} /> Draw Online Canvas
          </button>
        </div>

        {/* Selected Answering Mode */}
        {activeTab === "canvas" ? (
          <StudentDrawingCanvas
            value={drawingVal}
            onChange={(val) => onAnswerChange(drawingKey, val)}
            disabled={disabled}
          />
        ) : (
          <StudentDrawingUploadArea
            value={drawingVal}
            onChange={(val) => onAnswerChange(drawingKey, val)}
            disabled={disabled}
          />
        )}
      </div>
    );
  };

  /**
   * Recursive Node Renderer respecting G.C.E. A/L Biology Question Structure.
   */
  const renderStructuredNode = (node: StructuredNode, level = 0, index = 0): React.ReactNode => {
    const isLeaf = !node.children || node.children.length === 0;
    const displayLabel = formatDisplayLabel(node.label, level, index);
    const hasPrompt = Boolean(node.prompt && node.prompt.trim());
    const currentAnswer = subpartAnswers[node.id] || "";

    // Node diagram URL
    const nodeDiagramUrl = node.diagram_info?.image_url || (level === 0 && question.diagram_url);

    return (
      <div
        key={node.id || `${level}_${index}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          paddingLeft: level > 0 ? (level === 1 ? "1.25rem" : "2rem") : "0",
          borderLeft: level > 0 ? "2px solid rgba(99, 102, 241, 0.15)" : "none",
          marginTop: level === 0 ? (index === 0 ? "0" : "1.75rem") : "1rem",
        }}
      >
        {/* Section Container Header (Level 0) */}
        {level === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "0.4rem",
              borderBottom: "1.5px solid rgba(99, 102, 241, 0.3)",
              marginBottom: "0.4rem",
            }}
          >
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-primary)", letterSpacing: "0.02em" }}>
              Part {displayLabel}
            </span>
            {Boolean(node.points) && (
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  background: "var(--bg-secondary)",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                [{node.points} {node.points === 1 ? "mark" : "marks"}]
              </span>
            )}
          </div>
        )}

        {/* Section Intro or Sub-question Prompt */}
        {(level > 0 || hasPrompt) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div style={{ fontSize: "0.98rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
              {level > 0 && (
                <strong style={{ color: "var(--accent-primary)", marginRight: "0.45rem", fontWeight: 800 }}>
                  {displayLabel}
                </strong>
              )}
              <span>{normalizeScientificSymbols(node.prompt)}</span>
            </div>

            {isLeaf && Boolean(node.points) && (
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  background: "var(--bg-secondary)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                [{node.points} {node.points === 1 ? "mark" : "marks"}]
              </span>
            )}
          </div>
        )}

        {/* Diagram Image associated with this node / section */}
        {nodeDiagramUrl && (
          <div style={{ margin: "0.6rem 0", textAlign: "center" }}>
            <img
              src={resolveDiagramImageUrl(nodeDiagramUrl)}
              alt={`Diagram for Question ${question.question_number} ${displayLabel}`}
              onClick={() => setLightboxImageUrl(resolveDiagramImageUrl(nodeDiagramUrl))}
              style={{
                maxWidth: "440px",
                maxHeight: "260px",
                objectFit: "contain",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
                cursor: "zoom-in",
                background: "#ffffff",
              }}
              title="Click to zoom diagram"
            />
            {node.diagram_info?.image_description && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic" }}>
                {normalizeScientificSymbols(node.diagram_info.image_description)}
              </p>
            )}
          </div>
        )}

        {/* Answer Space Renderers for Leaf Nodes */}
        {isLeaf && (
          <div>
            {node.format_type === "structured_drawing" || node.drawing_prompt ? (
              renderDrawingAnswerArea(node)
            ) : node.format_type === "structured_comparison" || (node.comparison_pairs && node.comparison_pairs.length > 0) ? (
              renderComparisonAnswerArea(node)
            ) : node.format_type === "structured_sequential" || (node.sequence_items && node.sequence_items.length > 0) ? (
              renderSequenceAnswerArea(node)
            ) : node.format_type === "structured_matrix" || node.matrix_data || node.table_data ? (
              renderMatrixAnswerArea(node)
            ) : (
              renderDottedAnswerArea(node, currentAnswer)
            )}
          </div>
        )}

        {/* Render Child Subparts */}
        {node.children && node.children.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {node.children.map((child, cIdx) => renderStructuredNode(child, level + 1, cIdx))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: "2rem",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Question Main Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid var(--border)",
          paddingBottom: "0.85rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
            QUESTION {question.question_number < 10 ? `0${question.question_number}` : question.question_number}
          </span>
          <span className="badge badge-purple" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
            Structured Essay
          </span>
          <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
            {totalPoints} Raw Points ({scaledMarks} Marks)
          </span>
        </div>

        {onToggleFlag && (
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleFlag}
            className={`btn ${isFlagged ? "btn-warning" : "btn-secondary"}`}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <SvgIcon name="bookmark" size={14} />
            {isFlagged ? "Marked for Review" : "Mark for Review"}
          </button>
        )}
      </div>

      {/* Main Question Stem / Context Text */}
      {question.stem_text && question.stem_text.trim() && (
        <div
          style={{
            padding: "0.9rem 1.15rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            marginBottom: "1.5rem",
            fontSize: "1rem",
            lineHeight: 1.65,
            color: "var(--text-primary)",
          }}
        >
          {normalizeScientificSymbols(question.stem_text)}
        </div>
      )}

      {/* Main Root Diagram if provided */}
      {question.diagram_url && (
        <div style={{ margin: "1rem 0 1.5rem", textAlign: "center" }}>
          <img
            src={resolveDiagramImageUrl(question.diagram_url)}
            alt={`Diagram for Question ${question.question_number}`}
            onClick={() => setLightboxImageUrl(resolveDiagramImageUrl(question.diagram_url))}
            style={{
              maxWidth: "500px",
              maxHeight: "300px",
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
              cursor: "zoom-in",
              background: "#ffffff",
            }}
            title="Click to zoom diagram"
          />
        </div>
      )}

      {/* Structured Nodes Hierarchy */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {nodes.map((rootNode, idx) => renderStructuredNode(rootNode, 0, idx))}
      </div>

      {/* Lightbox Modal for Diagram Zoom */}
      {lightboxImageUrl && (
        <div
          onClick={() => setLightboxImageUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img
              src={lightboxImageUrl}
              alt="Zoomed Diagram"
              style={{
                maxWidth: "100%",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "var(--radius-md)",
                background: "#ffffff",
              }}
            />
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              className="btn btn-secondary"
              style={{
                position: "absolute",
                top: "-12px",
                right: "-12px",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
