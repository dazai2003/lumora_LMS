"use client";

import React, { useState, useRef, useEffect } from "react";
import { SvgIcon } from "@/components/SvgIcon";
import { normalizeScientificSymbols } from "@/lib/scientificSymbolUtils";
import ScientificSymbolPickerModal from "@/components/al-exams/ScientificSymbolPickerModal";
import { getEssayBudgetConfig, EssayBudgetConfig } from "@/lib/alEssayBlueprintUtils";

export interface StudentEssayRichAnswerAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  subpartLabel?: string;
  marks?: number;
  attachmentUrl?: string;
  onAttachmentUrlChange?: (url: string) => void;
  disabled?: boolean;
}

export default function StudentEssayRichAnswerArea({
  value = "",
  onChange,
  placeholder = "Write your factual, point-by-point biological essay response here...",
  minRows = 10,
  subpartLabel,
  marks,
  attachmentUrl = "",
  onAttachmentUrlChange,
  disabled = false,
}: StudentEssayRichAnswerAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showImageAttachment, setShowImageAttachment] = useState(Boolean(attachmentUrl));
  const [attachmentMode, setAttachmentMode] = useState<"upload" | "canvas" | "url">("upload");
  const [showGuide, setShowGuide] = useState(false);
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Drawing canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState("#1e293b");
  const [penSize, setPenSize] = useState(2);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Budget calculations
  const budget: EssayBudgetConfig = getEssayBudgetConfig(marks);
  const wordCount = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = value.length;

  // Detect factual statement / point count
  const detectedPoints = (() => {
    if (!value.trim()) return 0;
    const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
    const numberedLines = lines.filter((l) => /^(\d+[\.\)]|\([a-zA-Z0-9]+\)|[•\-\*])/.test(l));
    if (numberedLines.length > 0) return numberedLines.length;
    const sentences = value.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
    return Math.max(1, sentences.length);
  })();

  // Linter status
  let linterStatus: "optimal" | "drafting" | "warning" | "exceeded" = "drafting";
  let statusBadgeText = "";
  let statusColor = "var(--text-muted)";
  let statusBg = "var(--bg-secondary)";

  if (charCount > budget.hardCharLimit) {
    linterStatus = "exceeded";
    statusBadgeText = `Over Budget (${charCount}/${budget.hardCharLimit} chars) — May cost exam time!`;
    statusColor = "var(--error, #ef4444)";
    statusBg = "rgba(239, 68, 68, 0.1)";
  } else if (charCount > budget.softCharLimit || wordCount > budget.targetWordsMax + 30) {
    linterStatus = "warning";
    statusBadgeText = `Approaching Budget (${wordCount}/${budget.targetWordsMax} words) — Keep points dense`;
    statusColor = "var(--warning, #f59e0b)";
    statusBg = "rgba(245, 158, 11, 0.12)";
  } else if (wordCount >= budget.targetWordsMin && wordCount <= budget.targetWordsMax + 30) {
    linterStatus = "optimal";
    statusBadgeText = `Optimal A/L Length (${detectedPoints} pts • ${wordCount} words)`;
    statusColor = "var(--success, #10b981)";
    statusBg = "rgba(16, 185, 129, 0.12)";
  } else {
    linterStatus = "drafting";
    statusBadgeText = `Drafting: ${detectedPoints}/${budget.targetPointsMin}–${budget.targetPointsMax} pts • ${wordCount}/${budget.targetWordsMin}–${budget.targetWordsMax} w`;
    statusColor = "var(--text-muted)";
    statusBg = "var(--bg-secondary)";
  }

  const updateWithHistory = (newVal: string) => {
    const updated = normalizeScientificSymbols(newVal);
    onChange(updated);

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(updated);
    if (nextHistory.length > 50) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Quick formatting insert helpers
  const wrapSelection = (prefix: string, suffix: string = prefix, defaultPlaceholder = "text") => {
    if (!textareaRef.current || disabled) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;

    const selected = text.substring(start, end) || defaultPlaceholder;
    const replacement = `${prefix}${selected}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);

    updateWithHistory(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const insertAtCursor = (insertion: string) => {
    if (!textareaRef.current || disabled) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;

    const newText = text.substring(0, start) + insertion + text.substring(end);
    updateWithHistory(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  // Auto-Number Points Formatter (A/L Biological Scheme Helper)
  const handleAutoNumberPoints = () => {
    if (!value.trim() || disabled) return;

    const lines = value.split("\n").filter((l) => l.trim().length > 0);
    let formattedLines: string[] = [];
    let currentNumber = 1;

    lines.forEach((line) => {
      const cleaned = line.replace(/^(\d+[\.\)]|\([a-zA-Z0-9]+\)|[•\-\*])\s*/, "").trim();
      if (cleaned) {
        formattedLines.push(`${currentNumber}. ${cleaned}`);
        currentNumber++;
      }
    });

    if (formattedLines.length === 1 && formattedLines[0].length > 80) {
      const sentences = formattedLines[0]
        .replace(/^[0-9]+\.\s*/, "")
        .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
        .filter((s) => s.trim().length > 0);
      if (sentences.length > 1) {
        formattedLines = sentences.map((s, idx) => `${idx + 1}. ${s.trim()}`);
      }
    }

    const result = formattedLines.join("\n\n");
    updateWithHistory(result);
  };

  const handleUndo = () => {
    if (historyIndex > 0 && !disabled) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      onChange(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && !disabled) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      onChange(next);
    }
  };

  // Canvas drawing operations
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current && onAttachmentUrlChange) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onAttachmentUrlChange(dataUrl);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (onAttachmentUrlChange) {
      onAttachmentUrlChange("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || !onAttachmentUrlChange) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) onAttachmentUrlChange(res);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        padding: "1.1rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header Bar with Subpart / Marks badge & Guide Toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {subpartLabel && (
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span>Answer Space for</span>
              <strong style={{ fontSize: "1.05rem" }}>{subpartLabel}</strong>
            </div>
          )}
          {marks !== undefined && (
            <span className="badge badge-purple" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
              {marks} Marks (Raw)
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {/* Linter Budget Badge */}
          <div
            style={{
              padding: "0.25rem 0.65rem",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: "0.76rem",
              fontWeight: 700,
              color: statusColor,
              background: statusBg,
              border: `1px solid ${statusColor}`,
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              transition: "all 0.2s ease",
            }}
            title={budget.description}
          >
            {linterStatus === "optimal" && <SvgIcon name="check-circle" size={13} style={{ color: "var(--success)" }} />}
            {linterStatus === "warning" && <SvgIcon name="alert-triangle" size={13} style={{ color: "var(--warning)" }} />}
            {linterStatus === "exceeded" && <SvgIcon name="alert-triangle" size={13} style={{ color: "var(--error)" }} />}
            <span>{statusBadgeText}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="btn btn-secondary"
            style={{ fontSize: "0.74rem", padding: "0.25rem 0.55rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
            title="A/L Biology Essay Word & Point Guidelines"
          >
            <SvgIcon name="info" size={12} /> {showGuide ? "Hide Guide" : "A/L Guide"}
          </button>
        </div>
      </div>

      {/* Expandable Authentic A/L Marking Scheme Guide */}
      {showGuide && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "rgba(99, 102, 241, 0.06)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8rem",
            lineHeight: 1.5,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--accent-primary)", marginBottom: "0.25rem" }}>
            {budget.description}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem", marginTop: "0.4rem" }}>
            <div>&bull; <strong>Factual Statements:</strong> {budget.typicalSentenceCount}</div>
            <div>&bull; <strong>Target Words:</strong> {budget.targetWordsMin} – {budget.targetWordsMax} words</div>
            <div>&bull; <strong>Handwritten Space:</strong> {budget.expectedHandwrittenPages}</div>
            <div>&bull; <strong>Time Allocation:</strong> ~{budget.recommendedMinutes} mins</div>
          </div>
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.74rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            Tip: Write concise, numbered biological points rather than dense prose blocks. Each correct statement earns 4 raw marks.
          </p>
        </div>
      )}

      {/* Formatting & Scientific Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.4rem",
          padding: "0.35rem 0.5rem",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Left: Text Formatting Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => wrapSelection("**", "**", "bold text")}
            className="btn-icon"
            style={{ fontWeight: 800, fontSize: "0.85rem", width: "28px", height: "28px" }}
            title="Bold (**text**)"
          >
            B
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => wrapSelection("*", "*", "italic text")}
            className="btn-icon"
            style={{ fontStyle: "italic", fontSize: "0.85rem", width: "28px", height: "28px" }}
            title="Italic (*text*)"
          >
            I
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => wrapSelection("<u>", "</u>", "underlined text")}
            className="btn-icon"
            style={{ textDecoration: "underline", fontSize: "0.85rem", width: "28px", height: "28px" }}
            title="Underline (<u>text</u>)"
          >
            U
          </button>

          <div style={{ width: "1px", height: "18px", background: "var(--border)", margin: "0 0.2rem" }} />

          <button
            type="button"
            disabled={disabled}
            onClick={() => insertAtCursor("\n• ")}
            className="btn-icon"
            style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            title="Bulleted List (•)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => insertAtCursor("\n1. ")}
            className="btn-icon"
            style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            title="Numbered List (1.)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="10" y1="6" x2="21" y2="6"></line>
              <line x1="10" y1="12" x2="21" y2="12"></line>
              <line x1="10" y1="18" x2="21" y2="18"></line>
              <path d="M4 6h1v4"></path>
              <path d="M4 10h2"></path>
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path>
            </svg>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={handleAutoNumberPoints}
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            title="Format entire answer into numbered biological points (1., 2., 3...)"
          >
            <SvgIcon name="clipboard" size={12} /> Auto-Number Points
          </button>

          <div style={{ width: "1px", height: "18px", background: "var(--border)", margin: "0 0.2rem" }} />

          {/* Scientific Symbol Picker Popover Modal */}
          <ScientificSymbolPickerModal
            onInsert={insertAtCursor}
            disabled={disabled}
            buttonLabel="Insert Symbol (Ω)"
          />

          <div style={{ width: "1px", height: "18px", background: "var(--border)", margin: "0 0.2rem" }} />

          <button
            type="button"
            disabled={disabled || historyIndex <= 0}
            onClick={handleUndo}
            className="btn-icon"
            style={{ width: "28px", height: "28px" }}
            title="Undo"
          >
            <SvgIcon name="arrow-left" size={14} />
          </button>
          <button
            type="button"
            disabled={disabled || historyIndex >= history.length - 1}
            onClick={handleRedo}
            className="btn-icon"
            style={{ width: "28px", height: "28px" }}
            title="Redo"
          >
            <SvgIcon name="arrow-right" size={14} />
          </button>
        </div>

        {/* Right: Word & Character Count with Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{wordCount} words</span>
          <span>&bull;</span>
          <span>{charCount} / {budget.hardCharLimit} chars</span>
        </div>
      </div>

      {/* Main Long-Form Textarea with Point-Aware Styling */}
      <textarea
        ref={textareaRef}
        disabled={disabled}
        value={value}
        onChange={(e) => updateWithHistory(e.target.value)}
        rows={minRows}
        style={{
          width: "100%",
          padding: "1rem 1.15rem",
          borderRadius: "var(--radius-sm)",
          border: linterStatus === "exceeded" ? "1.5px solid var(--error, #ef4444)" : "1px solid var(--border)",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          fontSize: "0.98rem",
          lineHeight: 1.7,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          transition: "border-color 0.15s ease",
        }}
        placeholder={placeholder}
      />

      {/* Biological Drawing / Diagram / Flowchart Section */}
      {onAttachmentUrlChange && (
        <div style={{ marginTop: "0.4rem" }}>
          {!showImageAttachment ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowImageAttachment(true)}
              className="btn btn-secondary"
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <SvgIcon name="image" size={14} /> Attach Biological Drawing / Figure (Part b Diagram)
            </button>
          ) : (
            <div
              style={{
                padding: "0.85rem",
                background: "rgba(99, 102, 241, 0.04)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                  Biological Drawing & Diagram Space (Worth up to 5 marks)
                </span>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <div style={{ display: "flex", background: "var(--bg-secondary)", padding: "0.15rem", borderRadius: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setAttachmentMode("upload")}
                      style={{
                        padding: "0.2rem 0.5rem",
                        fontSize: "0.72rem",
                        fontWeight: attachmentMode === "upload" ? 700 : 500,
                        border: "none",
                        background: attachmentMode === "upload" ? "var(--bg-card)" : "transparent",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      Photo Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachmentMode("canvas")}
                      style={{
                        padding: "0.2rem 0.5rem",
                        fontSize: "0.72rem",
                        fontWeight: attachmentMode === "canvas" ? 700 : 500,
                        border: "none",
                        background: attachmentMode === "canvas" ? "var(--bg-card)" : "transparent",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      Draw on Screen
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachmentMode("url")}
                      style={{
                        padding: "0.2rem 0.5rem",
                        fontSize: "0.72rem",
                        fontWeight: attachmentMode === "url" ? 700 : 500,
                        border: "none",
                        background: attachmentMode === "url" ? "var(--bg-card)" : "transparent",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      Image URL
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImageAttachment(false);
                      onAttachmentUrlChange("");
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem" }}
                  >
                    Hide
                  </button>
                </div>
              </div>

              {attachmentMode === "upload" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    disabled={disabled}
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                  <div
                    onClick={() => !disabled && fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "1.25rem",
                      textAlign: "center",
                      background: "var(--bg-card)",
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <SvgIcon name="upload" size={24} style={{ color: "var(--accent-primary)", margin: "0 auto 0.4rem" }} />
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.82rem", color: "var(--text-primary)" }}>
                      Click or Drag & Drop photo of your hand-drawn diagram
                    </p>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      Supports PNG, JPG, or JPEG scanned from paper
                    </p>
                  </div>
                </div>
              )}

              {attachmentMode === "canvas" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.3rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      {["#1e293b", "#ef4444", "#3b82f6", "#10b981"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPenColor(c)}
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            background: c,
                            border: penColor === c ? "2px solid #ffffff" : "1px solid var(--border)",
                            boxShadow: penColor === c ? "0 0 0 2px var(--accent-primary)" : "none",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "0.3rem" }}>Size:</span>
                      {[2, 4, 6].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setPenSize(s)}
                          style={{
                            padding: "0.1rem 0.4rem",
                            fontSize: "0.72rem",
                            fontWeight: penSize === s ? 700 : 400,
                            background: penSize === s ? "var(--bg-card)" : "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "3px",
                            cursor: "pointer",
                          }}
                        >
                          {s}px
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
                    >
                      Clear Canvas
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={580}
                    height={220}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      height: "220px",
                      background: "#ffffff",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "crosshair",
                      touchAction: "none",
                    }}
                  />
                </div>
              )}

              {attachmentMode === "url" && (
                <input
                  type="text"
                  disabled={disabled}
                  value={attachmentUrl}
                  onChange={(e) => onAttachmentUrlChange(e.target.value)}
                  placeholder="Paste URL of uploaded diagram (e.g. /uploads/diagram.png)"
                  style={{
                    padding: "0.45rem 0.65rem",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    width: "100%",
                  }}
                />
              )}

              {attachmentUrl && (
                <div style={{ marginTop: "0.3rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <img
                    src={attachmentUrl}
                    alt="Attached figure preview"
                    style={{ maxHeight: "80px", maxWidth: "120px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff" }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                    Diagram attached & ready for examiner review
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
