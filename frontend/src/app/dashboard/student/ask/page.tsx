"use client";

import { useState, useEffect, useRef } from "react";
import api, { Course, QAResponse } from "@/lib/api";
import MaterialViewer from "@/components/viewer/MaterialViewer";
import ReactMarkdown from "react-markdown";
import { SvgIcon } from "@/components/SvgIcon";

export default function AskAIPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | "">("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [conversation, setConversation] = useState<QAResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMyEnrolledCourses().then(setCourses).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      api.getQuestionHistory(selectedCourse as number)
        .then((history) => setConversation(history.reverse()))
        .catch(console.error);
    } else {
      setConversation([]);
    }
  }, [selectedCourse]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCourse || !question.trim()) return;
    setAsking(true);
    setActiveTab("chat");

    const tempEntry: QAResponse = {
      question_id: Date.now(),
      question_text: question,
      response_text: undefined,
      asked_at: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, tempEntry]);
    const q = question;
    setQuestion("");

    api.askQuestionStream(
      selectedCourse as number,
      q,
      (data) => {
        if (data.type === 'start') {
          setConversation(prev => prev.map(item => 
            item.question_id === tempEntry.question_id 
              ? { ...item, question_id: data.question_id, context_sources: data.context_sources, response_text: "" } 
              : item
          ));
          tempEntry.question_id = data.question_id;
        } else if (data.type === 'chunk') {
          setConversation(prev => prev.map(item => 
            item.question_id === tempEntry.question_id 
              ? { ...item, response_text: (item.response_text || "") + data.text } 
              : item
          ));
        }
      },
      (err) => {
        console.error(err);
        setConversation((prev) =>
          prev.map((item) =>
            item.question_id === tempEntry.question_id
              ? { ...item, response_text: "Sorry, something went wrong. Please try again." }
              : item
          )
        );
        setAsking(false);
      },
      () => setAsking(false)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const confidenceColor = (score?: number) => {
    if (!score) return "var(--text-muted)";
    if (score >= 0.7) return "var(--success)";
    if (score >= 0.4) return "var(--warning)";
    return "var(--error)";
  };

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", paddingBottom: "1rem" }}>
      <div className="page-header" style={{ marginBottom: "1rem" }}>
        <h1>AI Tutor</h1>
        <p>Instant guidance based on your course materials</p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {selectedCourse && (
            <div style={{ display: "flex", background: "var(--bg-body)", borderRadius: "var(--radius-full)", padding: "4px", border: "1px solid var(--border-subtle)" }}>
              <button 
                onClick={() => setActiveTab("chat")}
                style={{ padding: "6px 16px", borderRadius: "var(--radius-full)", background: activeTab === "chat" ? "var(--accent-primary)" : "transparent", color: activeTab === "chat" ? "white" : "var(--text-secondary)", border: "none", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}
              >
                Chat
              </button>
              <button 
                onClick={() => setActiveTab("history")}
                style={{ padding: "6px 16px", borderRadius: "var(--radius-full)", background: activeTab === "history" ? "var(--bg-card-hover)" : "transparent", color: activeTab === "history" ? "var(--text-primary)" : "var(--text-secondary)", border: "none", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}
              >
                History
              </button>
            </div>
          )}
          {/* Custom Sleek Course Selection Dropdown */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                width: "300px",
                padding: "0.55rem 1rem",
                borderRadius: "var(--radius-full)",
                border: dropdownOpen ? "1.5px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: dropdownOpen ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "0 2px 6px rgba(0,0,0,0.03)",
                transition: "all 0.2s ease"
              }}
            >
              <span style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                width: "26px", 
                height: "26px", 
                borderRadius: "50%", 
                background: "rgba(37, 99, 235, 0.1)", 
                color: "var(--accent-primary)",
                flexShrink: 0
              }}>
                <SvgIcon name="book" size={14} />
              </span>
              
              <span style={{ 
                flex: 1, 
                textAlign: "left", 
                whiteSpace: "nowrap", 
                overflow: "hidden", 
                textOverflow: "ellipsis",
                color: selectedCourse ? "var(--text-primary)" : "var(--text-muted)" 
              }}>
                {courses.find(c => c.id === selectedCourse)?.title || "Select a course to start..."}
              </span>

              {courses.find(c => c.id === selectedCourse)?.subject && (
                <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}>
                  {courses.find(c => c.id === selectedCourse)?.subject}
                </span>
              )}

              <SvgIcon 
                name="chevron-right" 
                size={16} 
                style={{ 
                  color: "var(--text-muted)", 
                  transform: dropdownOpen ? "rotate(90deg)" : "rotate(0deg)", 
                  transition: "transform 0.2s ease",
                  flexShrink: 0
                }} 
              />
            </button>

            {/* Custom Dropdown Menu */}
            {dropdownOpen && (
              <div 
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "320px",
                  maxHeight: "320px",
                  overflowY: "auto",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "14px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)",
                  zIndex: 100,
                  padding: "0.4rem"
                }}
              >
                <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Enrolled Courses ({courses.length})
                </div>

                {courses.length === 0 ? (
                  <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No enrolled courses found
                  </div>
                ) : (
                  courses.map((c) => {
                    const isSelected = selectedCourse === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCourse(c.id);
                          setDropdownOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 0.85rem",
                          borderRadius: "10px",
                          cursor: "pointer",
                          background: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                          color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                          transition: "all 0.15s ease",
                          marginBottom: "2px"
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "var(--bg-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", overflow: "hidden" }}>
                          <span style={{ 
                            width: "28px", 
                            height: "28px", 
                            borderRadius: "8px", 
                            background: isSelected ? "var(--accent-primary)" : "var(--bg-secondary)", 
                            color: isSelected ? "white" : "var(--text-muted)",
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            flexShrink: 0
                          }}>
                            <SvgIcon name="book" size={14} />
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {c.title}
                            </span>
                            {c.subject && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {c.subject}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <SvgIcon name="check" size={16} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedCourse ? (
        <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, var(--bg-card) 0%, rgba(37,99,235,0.03) 100%)" }}>
          <div className="empty-state" style={{ maxWidth: "480px" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(37,99,235,0.1)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
              <SvgIcon name="sparkle" size={40} />
            </div>
            <div className="empty-state-title" style={{ fontSize: "1.5rem", fontWeight: 700 }}>Select a Course to Begin</div>
            <div className="empty-state-desc" style={{ marginBottom: "1.75rem" }}>Choose a course to ask questions, generate summaries, or review lectures with your personal AI Tutor.</div>
            
            {courses.length > 0 && (
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                  Your Enrolled Courses
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", justifyContent: "center" }}>
                  {courses.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCourse(c.id)}
                      style={{
                        padding: "0.6rem 1rem",
                        borderRadius: "var(--radius-full)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent-primary)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 10px rgba(37,99,235,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-subtle)";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
                      }}
                    >
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-primary)" }} />
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="split-panel" style={{ display: "flex", flex: 1, minHeight: 0, gap: "1.5rem" }}>
          {/* Main Chat / History Area */}
          <div style={{ flex: activeSource ? "0 0 50%" : 1, display: "flex", flexDirection: "column", minHeight: 0, transition: "flex 0.3s ease" }}>
            {activeTab === "chat" ? (
              <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {conversation.length === 0 ? (
                    <div style={{ margin: "auto", maxWidth: "600px", padding: "2rem", textAlign: "center" }}>
                      <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(37,99,235,0.1)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                        <SvgIcon name="sparkle" size={32} />
                      </div>
                      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>How can I help you learn?</h2>
                      <p style={{ color: "var(--text-muted)", marginBottom: "2.5rem" }}>I can explain concepts, summarize chapters, or quiz you on the material.</p>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", textAlign: "left" }}>
                        {[
                          { title: "Explain a concept", desc: "Break down a complex topic", icon: "book-open" },
                          { title: "Summarize materials", desc: "Get a quick overview", icon: "file-text" },
                          { title: "Quiz me", desc: "Test my knowledge", icon: "help-circle" },
                          { title: "Exam prep", desc: "What should I focus on?", icon: "target" }
                        ].map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => { setQuestion(`${prompt.title}: `); textareaRef.current?.focus(); }}
                            style={{ padding: "1rem 1.25rem", background: "var(--bg-body)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "flex-start", gap: "1rem" }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-primary)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.transform = "none"; }}
                          >
                            <span style={{ color: "var(--accent-primary)", background: "rgba(37,99,235,0.1)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><SvgIcon name={prompt.icon as any} size={18} /></span>
                            <div>
                              <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>{prompt.title}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{prompt.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    conversation.map((item) => (
                      <div key={item.question_id} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        {/* Student Bubble */}
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <div style={{ maxWidth: "75%", padding: "1rem 1.25rem", borderRadius: "18px 18px 4px 18px", background: "var(--accent-primary)", color: "white", fontSize: "0.95rem", lineHeight: 1.5, boxShadow: "0 4px 12px rgba(37,99,235,0.2)" }}>
                            {item.question_text}
                          </div>
                        </div>

                        {/* AI Bubble */}
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: "1rem" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(37,99,235,0.1)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.5rem" }}>
                            <SvgIcon name="sparkle" size={16} />
                          </div>
                          <div style={{ maxWidth: "80%", padding: "1.25rem", borderRadius: "4px 18px 18px 18px", background: "var(--bg-body)", border: "1px solid var(--border-subtle)", fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
                            {item.response_text ? (
                              <>
                                {item.teacher_correction && (
                                  <div style={{ background: "rgba(52, 211, 153, 0.1)", borderLeft: "4px solid #34d399", padding: "1rem", borderRadius: "4px", marginBottom: "1rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#059669", fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                      <SvgIcon name="check-circle" size={14} /> Teacher Note
                                    </div>
                                    <div style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                                      {item.teacher_correction}
                                    </div>
                                  </div>
                                )}
                                
                                <div style={{ opacity: item.teacher_correction ? 0.7 : 1 }}>
                                  <ReactMarkdown 
                                    components={{
                                      p: ({node, ...props}) => <p style={{ marginBottom: "0.75rem" }} {...props} />,
                                      pre: ({node, ...props}) => <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "1rem", borderRadius: "8px", overflowX: "auto", marginBottom: "1rem", fontSize: "0.9em" }} {...props} />,
                                      code: ({node, ...props}) => <code style={{ background: "var(--bg-card-hover)", padding: "2px 4px", borderRadius: "4px", fontSize: "0.9em", color: "var(--accent-primary)" }} {...props} />,
                                      ul: ({node, ...props}) => <ul style={{ marginLeft: "1.5rem", marginBottom: "1rem", listStyleType: "disc" }} {...props} />,
                                      ol: ({node, ...props}) => <ol style={{ marginLeft: "1.5rem", marginBottom: "1rem", listStyleType: "decimal" }} {...props} />,
                                    }}
                                  >
                                    {item.response_text}
                                  </ReactMarkdown>
                                </div>
                                
                                {/* Sources Section inline in bubble */}
                                {item.context_sources && item.context_sources.length > 0 && (
                                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem", fontWeight: 600 }}>Sources used</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                                      {item.context_sources.map((s: any, idx: number) => {
                                        const iconName = s.material_type === "pdf" ? "file-text" : s.material_type === "video" ? "video" : s.material_type === "image" ? "image" : "edit";
                                        return (
                                          <button
                                            key={idx}
                                            onClick={() => setActiveSource(s)}
                                            style={{
                                              background: activeSource?.material_id === s.material_id ? "rgba(37,99,235, 0.1)" : "var(--bg-card)",
                                              border: activeSource?.material_id === s.material_id ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                                              color: activeSource?.material_id === s.material_id ? "var(--accent-primary)" : "var(--text-secondary)",
                                              padding: "4px 10px", borderRadius: "var(--radius-full)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", transition: "all 0.2s"
                                            }}
                                          >
                                            <SvgIcon name={iconName as any} size={12} />
                                            <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
                                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                Thinking...
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ padding: "1.25rem", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-primary)" }}>
                  <form onSubmit={handleAsk} style={{ position: "relative" }}>
                    <textarea
                      ref={textareaRef}
                      style={{
                        width: "100%",
                        padding: "1rem 4rem 1rem 1.25rem",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        background: "var(--bg-body)",
                        color: "var(--text-primary)",
                        fontSize: "0.95rem",
                        resize: "none",
                        outline: "none",
                        lineHeight: 1.5,
                        minHeight: "56px",
                        maxHeight: "150px",
                        fontFamily: "inherit",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
                      }}
                      rows={1}
                      value={question}
                      onChange={(e) => {
                        setQuestion(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Message AI Tutor (Press Enter to send)..."
                      disabled={asking}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={asking || !question.trim()}
                      style={{
                        position: "absolute",
                        right: "0.75rem",
                        bottom: "0.75rem",
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: (asking || !question.trim()) ? "var(--bg-card-hover)" : "var(--accent-primary)",
                        color: (asking || !question.trim()) ? "var(--text-muted)" : "white",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: (asking || !question.trim()) ? "not-allowed" : "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      <SvgIcon name="send" size={16} />
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="card" style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "2rem", color: "var(--text-primary)" }}>Past Questions</h2>
                {conversation.length === 0 ? (
                   <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem", background: "var(--bg-body)", borderRadius: "var(--radius-md)" }}>You haven't asked any questions yet for this course.</div>
                ) : (
                   <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                     {[...conversation].reverse().map(item => (
                       <div key={item.question_id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--bg-body)" }}>
                         <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                           <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                             {new Date(item.asked_at).toLocaleString()}
                           </div>
                           <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "1.05rem" }}>
                             {item.question_text}
                           </div>
                         </div>
                         <div style={{ padding: "1.25rem", color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                           {item.response_text ? (
                             <ReactMarkdown 
                               components={{
                                 p: ({node, ...props}) => <p style={{ marginBottom: "0.75rem" }} {...props} />,
                                 pre: ({node, ...props}) => <pre style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "1rem", borderRadius: "8px", overflowX: "auto", marginBottom: "1rem" }} {...props} />,
                                 code: ({node, ...props}) => <code style={{ background: "var(--bg-card-hover)", padding: "2px 4px", borderRadius: "4px", fontSize: "0.85em" }} {...props} />,
                               }}
                             >
                               {item.response_text}
                             </ReactMarkdown>
                           ) : (
                             <span style={{ color: "var(--text-muted)" }}>Generating...</span>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                )}
              </div>
            )}
          </div>

          {/* Side Panel Viewer */}
          {activeSource && (
            <div
              className="card animate-fade-in"
              style={{
                flex: "0 0 50%",
                padding: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--accent-primary)",
                boxShadow: "0 8px 30px rgba(37,99,235,0.1)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1.25rem", background: "var(--bg-card-hover)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <SvgIcon name="file-text" size={16} /> Reference Material
                </span>
                <button 
                  onClick={() => setActiveSource(null)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px" }}
                >
                  <SvgIcon name="x" size={16} />
                </button>
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                <MaterialViewer source={activeSource} onClose={() => setActiveSource(null)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
