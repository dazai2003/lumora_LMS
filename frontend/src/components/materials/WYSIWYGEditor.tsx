"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { SvgIcon } from "@/components/SvgIcon";
import api from "@/lib/api";

/* ─── Types ─── */
interface WYSIWYGEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  showStats?: boolean;
  autosaveStatus?: "idle" | "saving" | "saved";
  minHeight?: string;
  comments?: any[];
  onCommentClick?: (commentId: number) => void;
}

/* ─── Toolbar Button ─── */
const TBtn = ({ cmd, arg, icon, title, active }: { cmd: string; arg?: string; icon: string; title: string; active?: boolean }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd, false, arg); }}
    style={{
      padding: "3px 7px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem",
      background: active ? "var(--accent-primary)" : "transparent", color: active ? "#fff" : "var(--text-secondary)",
      transition: "all 0.15s", lineHeight: 1, minWidth: 28, textAlign: "center",
    }}
  >
    {icon}
  </button>
);

const Separator = () => <div style={{ width: 1, height: 20, background: "var(--border-subtle)", margin: "0 3px" }} />;

/* ─── Color Picker ─── */
const ColorBtn = ({ cmd, title, icon }: { cmd: string; title: string; icon: string }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); ref.current?.click(); }}
        style={{ padding: "3px 7px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem", background: "transparent", color: "var(--text-secondary)" }}>
        {icon}
      </button>
      <input ref={ref} type="color" style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        onChange={(e) => document.execCommand(cmd, false, e.target.value)} />
    </span>
  );
};

/* ─── Font Size Dropdown ─── */
const FontSizeSelect = () => (
  <select title="Font Size" onChange={(e) => document.execCommand("fontSize", false, e.target.value)}
    style={{ padding: "2px 4px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.725rem", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>
    <option value="">Size</option>
    <option value="1">Small</option>
    <option value="3">Normal</option>
    <option value="5">Large</option>
    <option value="7">Huge</option>
  </select>
);

/* ─── Heading Dropdown ─── */
const HeadingSelect = () => (
  <select title="Heading" onChange={(e) => { if (e.target.value) document.execCommand("formatBlock", false, e.target.value); }}
    style={{ padding: "2px 4px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.725rem", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>
    <option value="">Heading</option>
    <option value="p">Normal</option>
    <option value="h1">H1</option>
    <option value="h2">H2</option>
    <option value="h3">H3</option>
    <option value="h4">H4</option>
  </select>
);

/* ─── Main Component ─── */
export default function WYSIWYGEditor({
  initialContent = "",
  onChange,
  readOnly = false,
  placeholder = "Start writing your document...",
  showStats = true,
  autosaveStatus = "idle",
  minHeight = "450px",
  comments = [],
  onCommentClick,
}: WYSIWYGEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Keyboard shortcut listener for Full Screen Escape
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [isFullScreen]);

  // Init & Sync content
  useEffect(() => {
    if (editorRef.current && initialContent != null) {
      if (editorRef.current.innerHTML !== initialContent) {
        editorRef.current.innerHTML = initialContent;
      }
    }
  }, [initialContent]);

  // Content change handler
  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b": e.preventDefault(); document.execCommand("bold"); break;
        case "i": e.preventDefault(); document.execCommand("italic"); break;
        case "u": e.preventDefault(); document.execCommand("underline"); break;
        case "z": if (e.shiftKey) { e.preventDefault(); document.execCommand("redo"); } break;
        case "h": e.preventDefault(); setShowFindReplace(!showFindReplace); break;
      }
    }
    // Tab for indent
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
    }
  }, [showFindReplace]);

  // Get editor text for stats
  const getTextContent = () => editorRef.current?.innerText || "";
  const text = getTextContent();
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  const readingTime = Math.ceil(wordCount / 200);

  // Insert table
  const insertTable = () => {
    const html = `<table style="border-collapse:collapse;width:100%;margin:8px 0"><tr><td style="border:1px solid var(--border-subtle);padding:6px;min-width:80px">&nbsp;</td><td style="border:1px solid var(--border-subtle);padding:6px;min-width:80px">&nbsp;</td><td style="border:1px solid var(--border-subtle);padding:6px;min-width:80px">&nbsp;</td></tr><tr><td style="border:1px solid var(--border-subtle);padding:6px">&nbsp;</td><td style="border:1px solid var(--border-subtle);padding:6px">&nbsp;</td><td style="border:1px solid var(--border-subtle);padding:6px">&nbsp;</td></tr></table><p></p>`;
    document.execCommand("insertHTML", false, html);
  };

  const [activeModal, setActiveModal] = useState<"link" | "image" | "table" | "math" | "footnote" | null>(null);
  const [modalVal1, setModalVal1] = useState("");
  const [modalVal2, setModalVal2] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Custom modal insertion logic (replaces native window.prompt)
  const handleConfirmModal = () => {
    if (!activeModal) return;
    if (activeModal === "link" && modalVal1) {
      if (modalVal2 && editorRef.current) {
        const html = `<a href="${modalVal1}" target="_blank" rel="noopener noreferrer">${modalVal2}</a>`;
        document.execCommand("insertHTML", false, html);
      } else {
        document.execCommand("createLink", false, modalVal1);
      }
    } else if (activeModal === "image" && modalVal1) {
      document.execCommand("insertImage", false, modalVal1);
    } else if (activeModal === "math" && modalVal1) {
      const html = `<span style="font-family:'Times New Roman',serif;font-style:italic;background:var(--bg-tertiary);padding:2px 6px;border-radius:3px;font-size:1.05em" title="Math: ${modalVal1}">${modalVal1}</span>&nbsp;`;
      document.execCommand("insertHTML", false, html);
    } else if (activeModal === "footnote" && modalVal1) {
      const id = Date.now() % 100;
      const html = `<sup style="color:var(--accent-primary);cursor:pointer" title="${modalVal1}">[${id}]</sup>`;
      document.execCommand("insertHTML", false, html);
    } else if (activeModal === "table") {
      const rows = parseInt(modalVal1) || 2;
      const cols = parseInt(modalVal2) || 2;
      let tableHtml = `<table style="border-collapse:collapse;width:100%;margin:12px 0"><tbody>`;
      for (let r = 0; r < rows; r++) {
        tableHtml += `<tr>`;
        for (let c = 0; c < cols; c++) {
          tableHtml += `<td style="border:1px solid var(--border-subtle);padding:8px;background:var(--bg-secondary)">Cell ${r + 1},${c + 1}</td>`;
        }
        tableHtml += `</tr>`;
      }
      tableHtml += `</tbody></table><p></p>`;
      document.execCommand("insertHTML", false, tableHtml);
    }
    setActiveModal(null);
    setModalVal1(""); setModalVal2("");
    handleInput();
  };

  const openInsertModal = (type: "link" | "image" | "table" | "math" | "footnote") => {
    setModalVal1(""); setModalVal2("");
    setActiveModal(type);
  };

  // Document Import Handler
  const handleFileImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingFile(true);
    try {
      const text = await file.text();
      if (text && editorRef.current) {
        editorRef.current.innerHTML = text;
        handleInput();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImportingFile(false);
      if (fileImportRef.current) fileImportRef.current.value = "";
    }
  };

  // Insert helper triggers without native prompt
  const insertCodeBlock = () => {
    const html = `<pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:0.85rem;overflow-x:auto;margin:8px 0"><code>// code here</code></pre><p></p>`;
    document.execCommand("insertHTML", false, html);
  };
  const insertHR = () => document.execCommand("insertHorizontalRule");
  const insertQuote = () => document.execCommand("formatBlock", false, "blockquote");
  const insertChecklist = () => {
    const html = `<div style="display:flex;align-items:flex-start;gap:6px;margin:4px 0"><input type="checkbox" style="margin-top:4px"><span>Checklist item</span></div>`;
    document.execCommand("insertHTML", false, html);
  };

  // Find & Replace
  const handleFind = () => {
    if (!findText || !editorRef.current) return;
    window.getSelection()?.removeAllRanges();
    const win = window as any;
    if (typeof win.find === "function") {
      const found = win.find(findText, false, false, true);
      if (!found) alert("Not found");
    }
  };
  const handleReplace = () => {
    if (!findText || !editorRef.current) return;
    const sel = window.getSelection();
    if (sel && sel.toString() === findText) {
      document.execCommand("insertText", false, replaceText);
    }
    const win = window as any;
    if (typeof win.find === "function") {
      win.find(findText, false, false, true);
    }
  };
  const handleReplaceAll = () => {
    if (!editorRef.current || !findText) return;
    editorRef.current.innerHTML = editorRef.current.innerHTML.split(findText).join(replaceText);
    handleInput();
  };

  // Print preview
  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (w && editorRef.current) {
      w.document.write(`<!DOCTYPE html><html><head><title>Print Preview</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.7;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}pre{background:#f5f5f5;padding:12px;border-radius:4px}@page{margin:1in}@media print{body{margin:0;padding:0}}</style></head><body>${editorRef.current.innerHTML}</body></html>`);
      w.document.close();
      w.print();
    }
  };

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        position: "relative",
        ...(isFullScreen ? {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: "var(--bg-primary)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          borderRadius: 0,
          boxShadow: "none"
        } : {})
      }}
    >
      {/* Sleek Custom Dialog Popover Modal (No Native Prompts) */}
      {activeModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card animate-fade-in" style={{ width: "380px", padding: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
              {activeModal === "link" ? "Insert Hyperlink" : activeModal === "image" ? "Insert Image" : activeModal === "table" ? "Insert Table" : activeModal === "math" ? "Insert Math Equation" : "Insert Footnote"}
            </h3>
            
            {activeModal === "link" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <input className="input" placeholder="URL (e.g., https://example.com)" value={modalVal1} onChange={(e) => setModalVal1(e.target.value)} style={{ fontSize: "0.8rem" }} />
                <input className="input" placeholder="Display Text (optional)" value={modalVal2} onChange={(e) => setModalVal2(e.target.value)} style={{ fontSize: "0.8rem" }} />
              </div>
            )}
            {activeModal === "image" && (
              <input className="input" placeholder="Image URL (https://...)" value={modalVal1} onChange={(e) => setModalVal1(e.target.value)} style={{ fontSize: "0.8rem" }} />
            )}
            {activeModal === "math" && (
              <input className="input" placeholder="LaTeX equation (e.g., E = mc^2)" value={modalVal1} onChange={(e) => setModalVal1(e.target.value)} style={{ fontSize: "0.8rem" }} />
            )}
            {activeModal === "footnote" && (
              <input className="input" placeholder="Footnote text" value={modalVal1} onChange={(e) => setModalVal1(e.target.value)} style={{ fontSize: "0.8rem" }} />
            )}
            {activeModal === "table" && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input className="input" type="number" placeholder="Rows (2)" value={modalVal1} onChange={(e) => setModalVal1(e.target.value)} style={{ fontSize: "0.8rem" }} />
                <input className="input" type="number" placeholder="Cols (2)" value={modalVal2} onChange={(e) => setModalVal2(e.target.value)} style={{ fontSize: "0.8rem" }} />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setActiveModal(null)}>Cancel</button>
              <button type="button" className="btn-primary btn-sm" onClick={handleConfirmModal}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!readOnly && (
        <div style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-tertiary)" }}>
          {/* Row 1: Formatting */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1px", padding: "4px 8px" }}>
            <TBtn cmd="undo" icon="Undo" title="Undo (Ctrl+Z)" />
            <TBtn cmd="redo" icon="Redo" title="Redo (Ctrl+Shift+Z)" />
            <Separator />
            <HeadingSelect />
            <FontSizeSelect />
            <Separator />
            <TBtn cmd="bold" icon="B" title="Bold (Ctrl+B)" />
            <TBtn cmd="italic" icon="I" title="Italic (Ctrl+I)" />
            <TBtn cmd="underline" icon="U" title="Underline (Ctrl+U)" />
            <TBtn cmd="strikethrough" icon="S" title="Strikethrough" />
            <Separator />
            <ColorBtn cmd="foreColor" title="Text Color" icon="A" />
            <ColorBtn cmd="hiliteColor" title="Highlight" icon="H" />
            <Separator />
            <button type="button" title="Align Left" onMouseDown={(e) => { e.preventDefault(); document.execCommand("justifyLeft"); }} style={{ padding: "3px 6px", border: "none", borderRadius: 4, cursor: "pointer", background: "transparent", color: "var(--text-secondary)" }}>
              <SvgIcon name="align-left" size={15} />
            </button>
            <button type="button" title="Align Center" onMouseDown={(e) => { e.preventDefault(); document.execCommand("justifyCenter"); }} style={{ padding: "3px 6px", border: "none", borderRadius: 4, cursor: "pointer", background: "transparent", color: "var(--text-secondary)" }}>
              <SvgIcon name="align-center" size={15} />
            </button>
            <button type="button" title="Align Right" onMouseDown={(e) => { e.preventDefault(); document.execCommand("justifyRight"); }} style={{ padding: "3px 6px", border: "none", borderRadius: 4, cursor: "pointer", background: "transparent", color: "var(--text-secondary)" }}>
              <SvgIcon name="align-right" size={15} />
            </button>
            <Separator />
            <button type="button" title="Bullet List" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList"); }} style={{ padding: "3px 6px", border: "none", borderRadius: 4, cursor: "pointer", background: "transparent", color: "var(--text-secondary)" }}>
              <SvgIcon name="list" size={15} />
            </button>
            <button type="button" title="Numbered List" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertOrderedList"); }} style={{ padding: "3px 6px", border: "none", borderRadius: 4, cursor: "pointer", background: "transparent", color: "var(--text-secondary)" }}>
              <SvgIcon name="list-ordered" size={15} />
            </button>
          </div>
          {/* Row 2: Insert */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px", padding: "2px 8px 4px", borderTop: "1px solid var(--border-subtle)" }}>
            <button type="button" onClick={() => openInsertModal("link")} title="Insert Link" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="link" size={14} /> Link</button>
            <button type="button" onClick={() => openInsertModal("image")} title="Insert Image" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="image" size={14} /> Image</button>
            <button type="button" onClick={() => openInsertModal("table")} title="Insert Table" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="table" size={14} /> Table</button>
            <button type="button" onClick={insertCodeBlock} title="Insert Code Block" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="code" size={14} /> Code</button>
            <button type="button" onClick={() => openInsertModal("math")} title="Math Equation" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="hash" size={14} /> Math</button>
            <button type="button" onClick={insertQuote} title="Insert Quote" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="quote" size={14} /> Quote</button>
            <button type="button" onClick={insertHR} title="Horizontal Rule" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}>— Rule</button>
            <button type="button" onClick={insertChecklist} title="Checklist" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="check-circle" size={14} /> Check</button>
            <button type="button" onClick={() => openInsertModal("footnote")} title="Footnote" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}>Note</button>
            <Separator />
            <input ref={fileImportRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={handleFileImportChange} />
            <button
              type="button"
              onClick={() => fileImportRef.current?.click()}
              disabled={importingFile}
              title="Import PDF / Word / Text file into Workspace"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.725rem",
                background: "var(--bg-secondary)",
                color: "var(--accent-primary)",
                fontWeight: 600
              }}
            >
              <SvgIcon name="upload" size={14} />
              {importingFile ? "Importing..." : "Import File"}
            </button>
            <Separator />
            <button type="button" onClick={() => setShowFindReplace(!showFindReplace)} title="Find & Replace (Ctrl+H)" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: showFindReplace ? "var(--accent-primary)" : "transparent", color: showFindReplace ? "#fff" : "var(--text-secondary)" }}><SvgIcon name="search" size={14} /> Find</button>
            <button type="button" onClick={handlePrint} title="Print Preview" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.725rem", background: "transparent", color: "var(--text-secondary)" }}><SvgIcon name="printer" size={14} /> Print</button>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
              <button type="button" onClick={() => setZoom(Math.max(50, zoom - 10))} style={{ padding: "1px 5px", border: "none", borderRadius: 3, cursor: "pointer", fontSize: "0.7rem", background: "transparent", color: "var(--text-muted)" }}>−</button>
              <span style={{ fontSize: "0.675rem", color: "var(--text-muted)", minWidth: 30, textAlign: "center" }}>{zoom}%</span>
              <button type="button" onClick={() => setZoom(Math.min(200, zoom + 10))} style={{ padding: "1px 5px", border: "none", borderRadius: 3, cursor: "pointer", fontSize: "0.7rem", background: "transparent", color: "var(--text-muted)" }}>+</button>
              <button
                type="button"
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit Full Screen (Esc)" : "Full Screen Writing Mode"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: "0.725rem",
                  background: isFullScreen ? "var(--accent-primary)" : "transparent",
                  color: isFullScreen ? "#fff" : "var(--text-secondary)",
                  marginLeft: "6px"
                }}
              >
                <SvgIcon name={isFullScreen ? "minimize" : "maximize"} size={14} />
                {isFullScreen ? "Exit Full Screen" : "Full Screen"}
              </button>
            </div>
          </div>
          {/* Find & Replace bar */}
          {showFindReplace && (
            <div style={{ display: "flex", gap: "6px", padding: "6px 8px", borderTop: "1px solid var(--border-subtle)", alignItems: "center", background: "var(--bg-secondary)" }}>
              <input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find..." style={{ flex: 1, padding: "3px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.775rem", background: "var(--bg-primary)", color: "var(--text-primary)" }} />
              <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Replace..." style={{ flex: 1, padding: "3px 6px", border: "1px solid var(--border-subtle)", borderRadius: 4, fontSize: "0.775rem", background: "var(--bg-primary)", color: "var(--text-primary)" }} />
              <button onClick={handleFind} className="btn-sm btn-secondary" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>Find</button>
              <button onClick={handleReplace} className="btn-sm btn-secondary" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>Replace</button>
              <button onClick={handleReplaceAll} className="btn-sm btn-secondary" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>All</button>
            </div>
          )}
        </div>
      )}

      {/* Read-Only Status Bar */}
      {readOnly && (
        <div style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.775rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            <SvgIcon name="lock" size={14} style={{ color: "var(--color-warning)" }} />
            <span>Read-Only Document Preview</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--text-muted)" }}>(Submitted coursework cannot be edited)</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setIsFullScreen(!isFullScreen)} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
            <SvgIcon name={isFullScreen ? "minimize" : "maximize"} size={12} /> {isFullScreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
      )}

      {/* Editor Area — A4 page-like layout */}
      <div style={{ background: "var(--bg-tertiary)", padding: isFullScreen ? "30px 20px" : "20px", overflowY: "auto", flex: isFullScreen ? 1 : undefined, maxHeight: isFullScreen ? "none" : "calc(100vh - 300px)" }}>
        <div style={{
          maxWidth: isFullScreen ? `${Math.round(1100 * zoom / 100)}px` : `${Math.round(816 * zoom / 100)}px`,
          margin: "0 auto",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
          padding: isFullScreen
            ? `${Math.round(64 * zoom / 100)}px ${Math.round(80 * zoom / 100)}px`
            : `${Math.round(48 * zoom / 100)}px ${Math.round(60 * zoom / 100)}px`,
          minHeight: isFullScreen ? "calc(100vh - 170px)" : (minHeight || "500px"),
          transform: `scale(${zoom / 100})`,
          transformOrigin: "top center",
          transition: "all 0.2s ease",
        }}>
          <div
            ref={editorRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            data-placeholder={placeholder}
            spellCheck
            style={{
              outline: "none",
              fontSize: isFullScreen ? "1.05rem" : "0.95rem",
              lineHeight: 1.8,
              color: "var(--text-primary)",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              minHeight: isFullScreen ? "calc(100vh - 290px)" : "420px",
              wordBreak: "break-word",
            }}
          />
        </div>
      </div>

      {/* Stats bar */}
      {showStats && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-tertiary)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            <span>~{readingTime} min read</span>
            {comments.length > 0 && (
              <span style={{ color: "var(--color-warning)" }}>{comments.filter(c => !c.is_resolved).length} open comments</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {autosaveStatus === "saving" && <span>Saving...</span>}
            {autosaveStatus === "saved" && (
              <span style={{ color: "var(--color-success)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <SvgIcon name="check" size={13} /> Saved
              </span>
            )}
            <span>Zoom: {zoom}%</span>
          </div>
        </div>
      )}

      {/* Empty state placeholder styling */}
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          opacity: 0.6;
          pointer-events: none;
        }
        [contenteditable] blockquote {
          border-left: 4px solid var(--accent-primary);
          padding: 8px 16px;
          margin: 8px 0;
          background: var(--bg-tertiary);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          color: var(--text-secondary);
          font-style: italic;
        }
        [contenteditable] img {
          max-width: 100%;
          border-radius: var(--radius-sm);
          margin: 8px 0;
        }
        [contenteditable] a {
          color: var(--accent-primary);
          text-decoration: underline;
        }
        [contenteditable] h1 { font-size: 1.8rem; font-weight: 700; margin: 16px 0 8px; font-family: inherit; }
        [contenteditable] h2 { font-size: 1.4rem; font-weight: 700; margin: 14px 0 6px; font-family: inherit; }
        [contenteditable] h3 { font-size: 1.15rem; font-weight: 600; margin: 12px 0 6px; font-family: inherit; }
        [contenteditable] h4 { font-size: 1rem; font-weight: 600; margin: 10px 0 4px; font-family: inherit; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 24px; margin: 4px 0; }
        [contenteditable] li { margin: 2px 0; }
        [contenteditable] hr { border: none; border-top: 2px solid var(--border-subtle); margin: 16px 0; }
      `}</style>
    </div>
  );
}
