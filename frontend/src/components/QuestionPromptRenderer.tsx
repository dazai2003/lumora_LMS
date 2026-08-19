"use client";

import React, { useState } from "react";
import { SvgIcon } from "@/components/SvgIcon";

interface QuestionPromptRendererProps {
  promptText: string;
}

export const QuestionPromptRenderer: React.FC<QuestionPromptRendererProps> = ({ promptText }) => {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [drawingPhoto, setDrawingPhoto] = useState<string | null>(null);

  if (!promptText) return null;

  // Filter out administrative Cover Page & Index No instruction banners
  if (promptText.includes("Index No.") || promptText.includes("Instructions:") && promptText.includes("PART A — Structured Essay")) {
    return (
      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>
        [Exam Administrative Cover Page Instructions — Excluded from Question Bank]
      </div>
    );
  }

  // Extract Clean Title, 1-Line Concept Summary, and Essay Template
  let titleStr = "";
  let summaryStr = "";
  let essayTemplate = "";

  const titleMatch = promptText.match(/\[TITLE:\s*(.*?)\]/i);
  if (titleMatch) titleStr = titleMatch[1].trim();

  const summaryMatch = promptText.match(/\[SUMMARY:\s*(.*?)\]/i);
  if (summaryMatch) summaryStr = summaryMatch[1].trim();

  const templateMatch = promptText.match(/\[ESSAY_TEMPLATE:\s*(.*?)\]/i);
  if (templateMatch) essayTemplate = templateMatch[1].trim();

  // Split prompt text into lines
  const lines = promptText.split("\n").map(l => l.trim()).filter(Boolean);

  const stemLines: string[] = [];
  const diagramBlocks: string[] = [];
  const subBulletItems: { label: string; text: string }[] = [];
  const statementCards: { label: string; text: string }[] = [];
  const tableRows: { col1: string; col2: string }[] = [];
  
  // Hierarchical Structured Question Elements
  const structuredSections: {
    level1Label: string;
    subparts: {
      level2Label: string;
      text: string;
      subItems: { level3Label: string; text: string; responseLines: number; inlineSlots?: boolean }[];
      diagram: string | null;
      isDrawingItem?: boolean;
    }[];
  }[] = [];

  let isEssayQuestion = promptText.includes("Paper II-B Essay") || promptText.includes("[ESSAY_TEMPLATE:") || (promptText.includes("Describe") && promptText.includes("Explain"));
  let isStructuredQuestion = (promptText.includes("Paper II-A Structured") || promptText.includes("Paper 2-A Structured") || promptText.includes("[2 lines]") || promptText.includes("[1 line]") || (promptText.includes("(A)") && promptText.includes("(i)"))) && !isEssayQuestion;

  // State machine variables for Structured Questions
  let currentSec: any = null;
  let currentSubpart: any = null;

  for (const line of lines) {
    if (line.startsWith("[TITLE:") || line.startsWith("[SUMMARY:") || line.startsWith("[ESSAY_TEMPLATE:")) {
      continue;
    }

    // 1. Detect Monospaced Diagram Blocks: [DIAGRAM_BLOCK] X : CGTTTTTACCTATA...
    if (line.startsWith("[DIAGRAM_BLOCK]")) {
      const diagStr = line.replace("[DIAGRAM_BLOCK]", "").trim();
      if (currentSubpart) {
        currentSubpart.diagram = (currentSubpart.diagram ? currentSubpart.diagram + "\n" : "") + diagStr;
      } else {
        diagramBlocks.push(diagStr);
      }
      continue;
    }

    // 2. Detect Sub-Bullet Items: [SUB_BULLET] P - Salicornia
    if (line.startsWith("[SUB_BULLET]")) {
      const parts = line.replace("[SUB_BULLET]", "").trim().split("-");
      if (parts.length >= 2) {
        subBulletItems.push({
          label: parts[0].trim(),
          text: parts.slice(1).join("-").trim()
        });
      }
      continue;
    }

    // 3. Detect Markdown Table format: | Col1 | Col2 |
    if (line.startsWith("|") && line.endsWith("|")) {
      const parts = line.split("|").map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2 && !line.includes("---")) {
        tableRows.push({ col1: parts[0], col2: parts[1] });
      }
      continue;
    }

    // 4. Parse Structured Question Hierarchy
    if (isStructuredQuestion) {
      if (line.startsWith("[2024") || line.startsWith("[FORMAT:")) {
        continue;
      }

      // Level 1 Section Part: (A), (B), (C), (D)
      const secMatch = line.match(/^\(([A-D])\)$/);
      if (secMatch) {
        currentSec = {
          level1Label: secMatch[1],
          subparts: []
        };
        structuredSections.push(currentSec);
        currentSubpart = null;
        continue;
      }

      // Level 2 Subpart: (i), (ii), (iii), (iv), (v)
      const subMatch = line.match(/^\(([ivx]+)\)\s*(.*)/i);
      if (subMatch) {
        if (!currentSec) {
          currentSec = { level1Label: "A", subparts: [] };
          structuredSections.push(currentSec);
        }
        const subTxt = subMatch[2].trim();
        currentSubpart = {
          level2Label: `(${subMatch[1]})`,
          text: subTxt,
          subItems: [],
          diagram: null,
          isDrawingItem: subTxt.toLowerCase().includes("draw") || subTxt.toLowerCase().includes("sketch")
        };
        currentSec.subparts.push(currentSubpart);
        continue;
      }

      // Level 3 Sub-item: (a), (b), (c), (d)
      const itemMatch = line.match(/^\(([a-d])\)\s*(.*)/);
      if (itemMatch && currentSubpart) {
        const itemTxt = itemMatch[2].trim();
        const hasSlots = itemTxt.includes("[INLINE_SLOTS_1_2]");
        currentSubpart.subItems.push({
          level3Label: `(${itemMatch[1]})`,
          text: itemTxt.replace("[INLINE_SLOTS_1_2]", "").trim(),
          responseLines: 1,
          inlineSlots: hasSlots
        });
        if (itemTxt.toLowerCase().includes("draw") || itemTxt.toLowerCase().includes("sketch")) {
          currentSubpart.isDrawingItem = true;
        }
        continue;
      }

      // Level 4 Numbered Sub-item: 1., 2., 3.
      const numMatch = line.match(/^(\d+)[\.\:]\s*(.*)/);
      if (numMatch && currentSubpart) {
        currentSubpart.subItems.push({
          level3Label: `${numMatch[1]}.`,
          text: numMatch[2].trim(),
          responseLines: 1
        });
        continue;
      }
    }

    // 5. Detect Statement List items: • A - ..., • B - ...
    const stmtMatch = line.match(/^([•\(]?\s*([A-E])\s*[\)\.\-]?\s*)(.*)/);
    if (stmtMatch && (line.startsWith("•") || line.startsWith("(") || line.match(/^[A-E]\s*[\-\.]/))) {
      statementCards.push({
        label: stmtMatch[2].toUpperCase(),
        text: stmtMatch[3].trim()
      });
      continue;
    }

    if (!isStructuredQuestion || line.startsWith("Question")) {
      stemLines.push(line);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setDrawingPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-primary)", width: "100%" }}>
      {/* Title & 1-Line Concept Summary Header */}
      {(titleStr || summaryStr) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.3rem" }}>
          {titleStr && (
            <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="file-text" size={20} />
              <span>{titleStr}</span>
            </div>
          )}
          {summaryStr && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="badge badge-secondary" style={{ fontWeight: 600, fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <SvgIcon name="book" size={14} /> Concept Summary: {summaryStr}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Essay Studio Engine 3 Header Badges & Recommended Time Budgeting Pill */}
      {isEssayQuestion && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.9rem", background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: "var(--radius-md)", fontSize: "0.84rem" }}>
            <span style={{ fontWeight: 700, color: "var(--warning)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <SvgIcon name="book" size={16} /> Paper II Part B Essay (Select & Answer Exactly 4 of 6 Questions)
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span className="badge badge-warning" style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <SvgIcon name="award" size={14} /> 150 Raw Marks Ceiling
              </span>
              <span className="badge badge-secondary" style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <SvgIcon name="clock" size={14} /> 25–28 Mins Budgeting
              </span>
            </div>
          </div>

          <div style={{ padding: "0.5rem 0.85rem", background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "var(--radius)", fontSize: "0.8rem", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Taxonomy Template: {essayTemplate === "ESSAY_SHORT_NOTES_TRIPLET" ? "Template 3: Short Notes Triplet (3 × 50 Marks)" : essayTemplate === "ESSAY_MONOLITHIC" ? "Template 2: Monolithic Single-Prompt (150 Marks)" : "Template 1: Dual-Segment Process & Structure (75/75 Split)"}</span>
            <span style={{ fontWeight: 600 }}>Formula: min(150, MatchedPoints × 4 + SafetyBuffer)</span>
          </div>
        </div>
      )}

      {/* 100-Mark Scaled Scoring Badge for Paper II-A Structured */}
      {isStructuredQuestion && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.9rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "var(--radius-md)", fontSize: "0.84rem" }}>
            <span style={{ fontWeight: 700, color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <SvgIcon name="zap" size={16} /> Paper II-A Compulsory Structured Question (Questions 1 to 4)
            </span>
            <span className="badge badge-info" style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <SvgIcon name="award" size={14} /> 100 Final Marks (40 Raw Points × 2.5 Multiplier)
            </span>
          </div>

          <div style={{ padding: "0.5rem 0.85rem", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius)", fontSize: "0.8rem", color: "var(--success)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <SvgIcon name="check-circle" size={16} />
            <span>AI Hybrid Grading Enabled: Submissions pre-graded by Gemini AI for teacher review & grade approval.</span>
          </div>
        </div>
      )}

      {/* Main Stem Header */}
      {stemLines.length > 0 && (
        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
          {stemLines.map((line, idx) => {
            const markMatch = line.match(/\((\d+)\s*marks?\)/i);
            return (
              <p key={idx} style={{ margin: idx === 0 ? 0 : "0.4rem 0 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: idx === 0 ? 600 : 400 }}>{line}</span>
                {markMatch && (
                  <span className="badge badge-warning" style={{ fontWeight: 700, fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}>
                    {markMatch[1]} Marks Allocation
                  </span>
                )}
              </p>
            );
          })}
        </div>
      )}

      {/* Monospaced DNA Sequence / Diagram Code Block */}
      {diagramBlocks.length > 0 && (
        <div style={{
          padding: "0.85rem 1rem",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontFamily: "monospace",
          fontSize: "0.9rem",
          color: "var(--primary)",
          whiteSpace: "pre-wrap"
        }}>
          {diagramBlocks.join("\n")}
        </div>
      )}

      {/* Structured Question Multi-Tier Tree Hierarchy UI */}
      {structuredSections.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", marginTop: "0.4rem" }}>
          {structuredSections.map((sec, secIdx) => (
            <div 
              key={secIdx}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--bg-card)"
              }}
            >
              {/* Level 1 High-Contrast Section Subquestion Header Bar */}
              <div style={{
                padding: "0.6rem 1rem",
                background: "linear-gradient(90deg, #1e40af 0%, #3b82f6 100%)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.92rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <span style={{ letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <SvgIcon name="layers" size={16} /> Subquestion {secIdx + 1}-{sec.level1Label}: Section ({sec.level1Label})
                </span>
                <span className="badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700, fontSize: "0.74rem" }}>
                  Section Compulsory Part
                </span>
              </div>

              {/* Level 2 Subpart Cards */}
              <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {sec.subparts.map((sub, subIdx) => (
                  <div 
                    key={subIdx}
                    style={{
                      borderLeft: "3px solid var(--primary)",
                      paddingLeft: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.55rem"
                    }}
                  >
                    {/* Level 2 Title & Text */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.55rem" }}>
                      <span className="badge badge-primary" style={{ fontWeight: 700, flexShrink: 0, marginTop: "0.1rem" }}>
                        {sub.level2Label}
                      </span>
                      {sub.text && (
                        <span style={{ fontWeight: 500, fontSize: "0.94rem", color: "var(--text-primary)" }}>
                          {sub.text}
                        </span>
                      )}
                    </div>

                    {/* Monospaced Diagram in Subpart */}
                    {sub.diagram && (
                      <div style={{
                        padding: "0.65rem 0.85rem",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        fontFamily: "monospace",
                        fontSize: "0.88rem",
                        color: "var(--primary)",
                        whiteSpace: "pre-wrap",
                        margin: "0.2rem 0"
                      }}>
                        {sub.diagram}
                      </div>
                    )}

                    {/* Student Drawing Photo Upload & Canvas Preview for Drawing Items */}
                    {sub.isDrawingItem && (
                      <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", border: "1px dashed var(--primary)", borderRadius: "var(--radius-md)", margin: "0.35rem 0", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700, color: "var(--primary)", fontSize: "0.86rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <SvgIcon name="image" size={16} /> Student Drawing Canvas & Photo Upload Field
                          </span>
                          <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>
                            Strict Anatomical Sketch Rule (0 marks for flowcharts)
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                            <SvgIcon name="upload" size={14} /> Upload Drawing Photo
                            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
                          </label>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Students upload their drawing photo here during the exam.
                          </span>
                        </div>

                        {drawingPhoto && (
                          <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.85rem" }}>
                            <img src={drawingPhoto} alt="Uploaded Drawing" style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border)" }} />
                            <div style={{ fontSize: "0.82rem", color: "var(--success)", fontWeight: 600 }}>
                              Photo uploaded! Gemini AI will evaluate labels & direction arrows for teacher approval.
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Level 3 Items (a), (b), (c) */}
                    {sub.subItems.length > 0 && (
                      <div style={{ paddingLeft: "1.3rem", display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.25rem" }}>
                        {sub.subItems.map((item, itemIdx) => (
                          <div key={itemIdx} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                              {item.level3Label && (
                                <span className="badge badge-secondary" style={{ fontWeight: 700, flexShrink: 0, fontSize: "0.78rem" }}>
                                  {item.level3Label}
                                </span>
                              )}
                              <span style={{ fontWeight: 400, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                                {item.text}
                              </span>
                            </div>

                            {/* Side-by-Side Response Slot Pills */}
                            {item.inlineSlots ? (
                              <div style={{ display: "flex", gap: "1rem", marginLeft: "1.75rem", marginTop: "0.25rem" }}>
                                <div style={{ flex: 1, padding: "0.45rem 0.75rem", background: "var(--bg-secondary)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                  1. [Response Slot 1]
                                </div>
                                <div style={{ flex: 1, padding: "0.45rem 0.75rem", background: "var(--bg-secondary)", border: "1px dashed var(--border)", borderRadius: "var(--radius)", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                  2. [Response Slot 2]
                                </div>
                              </div>
                            ) : (
                              <div style={{ borderBottom: "1px dashed var(--text-muted)", opacity: 0.4, height: "1.2rem", marginLeft: "1.75rem" }} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Default Response Lines if no sub-items */}
                    {sub.subItems.length === 0 && !sub.isDrawingItem && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.25rem", paddingLeft: "2rem" }}>
                        <div style={{ borderBottom: "1px dashed var(--text-muted)", opacity: 0.4, height: "1.2rem" }} />
                        <div style={{ borderBottom: "1px dashed var(--text-muted)", opacity: 0.4, height: "1.2rem" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2-Column Sub-Bullet Grid Card (e.g. Q50 Plants P to X) */}
      {subBulletItems.length > 0 && (
        <div style={{
          padding: "0.9rem 1.1rem",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          margin: "0.3rem 0"
        }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.55rem", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="layers" size={14} /> Plant / Reference Item Index
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.45rem" }}>
            {subBulletItems.map((item, idx) => (
              <div 
                key={idx}
                style={{
                  padding: "0.45rem 0.75rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius)",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem"
                }}
              >
                <span className="badge badge-secondary" style={{ fontWeight: 700, minWidth: "1.75rem", textAlign: "center" }}>
                  {item.label}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Styled HTML Visual Table */}
      {tableRows.length > 0 && (
        <div style={{
          overflowX: "auto",
          margin: "0.6rem 0",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-secondary)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.65rem 0.95rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {tableRows[0]?.col1.includes("Vegetation") ? "Vegetation Type" : tableRows[0]?.col1.includes("Phylum") ? "Plant Phylum" : "Category / Process"}
                </th>
                <th style={{ padding: "0.65rem 0.95rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {tableRows[0]?.col1.includes("Vegetation") ? "Ecosystem" : tableRows[0]?.col1.includes("Phylum") ? "Gametophyte State" : "Description / Result"}
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: idx < tableRows.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                  <td style={{ padding: "0.65rem 0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{row.col1}</td>
                  <td style={{ padding: "0.65rem 0.95rem", color: "var(--text-secondary)" }}>{row.col2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Styled Statement Cards List */}
      {statementCards.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.3rem" }}>
          {statementCards.map((stmt, idx) => (
            <div 
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.85rem",
                padding: "0.6rem 0.9rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                transition: "all 0.15s ease"
              }}
            >
              <span 
                className="badge badge-primary" 
                style={{ 
                  fontWeight: 700, 
                  fontSize: "0.8rem", 
                  padding: "0.22rem 0.6rem",
                  flexShrink: 0,
                  marginTop: "0.1rem"
                }}
              >
                {stmt.label}
              </span>
              <span style={{ color: "var(--text-primary)", fontSize: "0.92rem" }}>
                {stmt.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Essay Studio 40-Point Marking Checklist Card */}
      {isEssayQuestion && (
        <div style={{ marginTop: "0.6rem", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: "var(--radius-md)", background: "rgba(234, 179, 8, 0.05)", overflow: "hidden" }}>
          <button
            onClick={() => setChecklistOpen(!checklistOpen)}
            style={{
              width: "100%",
              padding: "0.65rem 0.95rem",
              background: "none",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              fontSize: "0.84rem",
              fontWeight: 700,
              color: "var(--warning)"
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <SvgIcon name="file-text" size={16} /> Official 40-Point Factual Checklist & Score Formula
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              {checklistOpen ? <><SvgIcon name="chevron-up" size={14} /> Hide Checklist</> : <><SvgIcon name="chevron-down" size={14} /> Expand 40-Point Checklist</>}
            </span>
          </button>

          {checklistOpen && (
            <div style={{ padding: "0.95rem", borderTop: "1px solid rgba(234, 179, 8, 0.2)", fontSize: "0.86rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Binary 4-Mark Checklist Items (37 Points + 2 Bonus Safety Buffer = 150 Marks):</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "0.4rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 1. Correct biological definition of system (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 2. Structural cellular & membrane organization (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 3. Key enzymatic/catalytic step initiation (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 4. Intermediate substrate transformation sequence (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 5. Physiological regulation & feedback signal (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 6. Comparative adaptions & environmental response (4 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 7. Labeled structural diagram execution (5 pts)</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={13} style={{ color: "#10B981" }} /> 8. Termination condition & metabolic outcome (4 pts)</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionPromptRenderer;
