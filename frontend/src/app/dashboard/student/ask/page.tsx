"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import api, { Course, QAResponse } from "@/lib/api";
import MaterialViewer from "@/components/viewer/MaterialViewer";
import ReactMarkdown from "react-markdown";
import { SvgIcon } from "@/components/SvgIcon";
import { useSearchParams } from "next/navigation";

function AskAIPageContent() {
  const searchParams = useSearchParams();
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
    const initQ = searchParams.get("initialQuestion");
    const courseIdParam = searchParams.get("courseId");

    api.getMyEnrolledCourses().then((data) => {
      setCourses(data);
      if (courseIdParam) {
        setSelectedCourse(Number(courseIdParam));
      } else if (data.length > 0 && !selectedCourse) {
        setSelectedCourse(data[0].id);
      }
    }).catch(console.error).finally(() => setLoading(false));

    if (initQ) {
      setQuestion(initQ);
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [searchParams]);

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
              ? { 
                  ...item, 
                  response_text: item.response_text && item.response_text.trim().length > 0 
                    ? item.response_text 
                    : "Sorry, I encountered a temporary connection issue. Please check your course materials or ask your question again." 
                }
              : item
          )
        );
        setAsking(false);
      },
      () => setAsking(false)
    );
  };

  const handleRetryQuestion = (targetQuestionId: number, questionText: string) => {
    if (!selectedCourse || asking) return;
    setAsking(true);

    // Reset target item in conversation in-place
    setConversation(prev => prev.map(item => 
      item.question_id === targetQuestionId 
        ? { ...item, response_text: "", context_sources: [] }
        : item
    ));

    api.askQuestionStream(
      selectedCourse as number,
      questionText,
      (data) => {
        if (data.type === 'start') {
          setConversation(prev => prev.map(item => 
            item.question_id === targetQuestionId 
              ? { ...item, question_id: data.question_id, context_sources: data.context_sources, response_text: "" } 
              : item
          ));
        } else if (data.type === 'chunk') {
          setConversation(prev => prev.map(item => 
            item.question_id === targetQuestionId 
              ? { ...item, response_text: (item.response_text || "") + data.text } 
              : item
          ));
        }
      },
      (err) => {
        console.error(err);
        setConversation((prev) =>
          prev.map((item) =>
            item.question_id === targetQuestionId
              ? { 
                  ...item, 
                  response_text: item.response_text && item.response_text.trim().length > 0 
                    ? item.response_text 
                    : "Sorry, I encountered a temporary connection issue. Please check your course materials or ask your question again." 
                }
              : item
          )
        );
        setAsking(false);
      },
      () => setAsking(false),
      targetQuestionId
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

  const selectedCourseObj = courses.find(c => c.id === selectedCourse);

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 110px)", paddingBottom: "0.5rem", gap: "1rem" }}>
      {/* Header & Metrics */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>AI Tutor</h1>
          <p>Instant guidance and answers powered by your course study materials</p>
        </div>

        {/* Action Controls & Stat Cards */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {selectedCourse && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className={`btn-sm ${activeTab === "chat" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("chat")}
              >
                Chat Workspace
              </button>
              <button
                className={`btn-sm ${activeTab === "history" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("history")}
              >
                Question History ({conversation.length})
              </button>
            </div>
          )}

          {/* Course Selection Dropdown */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                width: "280px",
                padding: "0.5rem 0.9rem",
                borderRadius: "var(--radius-full)",
                border: dropdownOpen ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
                transition: "all 0.2s ease"
              }}
            >
              <span style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                width: "24px", 
                height: "24px", 
                borderRadius: "50%", 
                background: "rgba(99, 102, 241, 0.15)", 
                color: "var(--accent-primary)",
                flexShrink: 0
              }}>
                <SvgIcon name="book" size={13} />
              </span>
              
              <span style={{ 
                flex: 1, 
                textAlign: "left", 
                whiteSpace: "nowrap", 
                overflow: "hidden", 
                textOverflow: "ellipsis",
                color: selectedCourse ? "var(--text-primary)" : "var(--text-muted)" 
              }}>
                {selectedCourseObj?.title || "Select a course..."}
              </span>

              <SvgIcon 
                name="chevron-right" 
                size={14} 
                style={{ 
                  color: "var(--text-muted)", 
                  transform: dropdownOpen ? "rotate(90deg)" : "rotate(0deg)", 
                  transition: "transform 0.2s ease",
                  flexShrink: 0
                }} 
              />
            </button>

            {dropdownOpen && (
              <div 
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "300px",
                  maxHeight: "300px",
                  overflowY: "auto",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "14px",
                  boxShadow: "var(--shadow-md)",
                  zIndex: 100,
                  padding: "0.4rem"
                }}
              >
                <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
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
                          padding: "0.65rem 0.75rem",
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
                          color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                          transition: "all 0.15s ease",
                          marginBottom: "2px"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", overflow: "hidden" }}>
                          <span style={{ 
                            width: "26px", 
                            height: "26px", 
                            borderRadius: "6px", 
                            background: isSelected ? "var(--accent-primary)" : "var(--bg-body)", 
                            color: isSelected ? "white" : "var(--text-muted)",
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            flexShrink: 0
                          }}>
                            <SvgIcon name="book" size={13} />
                          </span>
                          <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.title}
                          </span>
                        </div>
                        {isSelected && <SvgIcon name="check" size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />}
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
        <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="empty-state" style={{ maxWidth: "480px" }}>
            <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
              <SvgIcon name="sparkle" size={36} />
            </div>
            <div className="empty-state-title" style={{ fontSize: "1.35rem", fontWeight: 700 }}>Select a Course to Begin</div>
            <div className="empty-state-desc" style={{ marginBottom: "1.5rem" }}>Choose an enrolled course to ask questions, review materials, or generate study notes with your personal AI Tutor.</div>
            
            {courses.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCourse(c.id)}
                    className="btn-secondary"
                    style={{ fontSize: "0.85rem", padding: "0.5rem 0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <SvgIcon name="book" size={14} style={{ color: "var(--accent-primary)" }} />
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: "1.25rem" }}>
          {/* Main Chat / History Area */}
          <div style={{ flex: activeSource ? "0 0 55%" : 1, display: "flex", flexDirection: "column", minHeight: 0, transition: "flex 0.3s ease" }}>
            {activeTab === "chat" ? (
              <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", background: "var(--bg-card)" }}>
                  {conversation.length === 0 ? (
                    <div style={{ margin: "auto", maxWidth: "560px", padding: "1.5rem", textAlign: "center" }}>
                      <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                        <SvgIcon name="sparkle" size={28} />
                      </div>
                      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--text-primary)" }}>How can I help you learn?</h2>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1.75rem" }}>Ask any question about <strong>{selectedCourseObj?.title}</strong> and I will search your course materials for accurate answers.</p>
                      
                      {/* Quick Prompt Recommendation Chips */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", textAlign: "left" }}>
                        {[
                          { title: "Explain a concept", desc: "Break down a complex topic step-by-step", icon: "book-open" },
                          { title: "Summarize materials", desc: "Get a quick overview of recent lessons", icon: "file-text" },
                          { title: "Quiz me on topic", desc: "Test my understanding with practice questions", icon: "help-circle" },
                          { title: "Key takeaways", desc: "What are the most important exam concepts?", icon: "target" }
                        ].map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => { setQuestion(`${prompt.title}: `); textareaRef.current?.focus(); }}
                            style={{ 
                              padding: "0.85rem 1rem", 
                              background: "var(--bg-body)", 
                              border: "1px solid var(--border)", 
                              borderRadius: "10px", 
                              cursor: "pointer", 
                              transition: "all 0.2s", 
                              display: "flex", 
                              alignItems: "flex-start", 
                              gap: "0.75rem" 
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-primary)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
                          >
                            <span style={{ color: "var(--accent-primary)", background: "rgba(99,102,241,0.12)", padding: "0.4rem", borderRadius: "6px", display: "flex" }}>
                              <SvgIcon name={prompt.icon as any} size={16} />
                            </span>
                            <div>
                              <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.88rem", marginBottom: "0.15rem" }}>{prompt.title}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{prompt.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    conversation.map((item) => (
                      <div key={item.question_id} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {/* Student Bubble */}
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <div style={{ 
                            maxWidth: "75%", 
                            padding: "0.75rem 1.1rem", 
                            borderRadius: "16px 16px 4px 16px", 
                            background: "linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6)", 
                            color: "white", 
                            fontSize: "0.92rem", 
                            lineHeight: 1.5, 
                            boxShadow: "0 2px 8px rgba(99,102,241,0.25)" 
                          }}>
                            {item.question_text}
                          </div>
                        </div>

                        {/* AI Response Card */}
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(99,102,241,0.15)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.2rem" }}>
                            <SvgIcon name="sparkle" size={16} />
                          </div>

                          <div style={{ flex: 1, background: "var(--bg-body)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "1rem", fontSize: "0.92rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
                            {!item.response_text && asking ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)" }}>
                                <SvgIcon name="refresh" className="spin" size={16} />
                                <span>Searching course materials and generating answer...</span>
                              </div>
                            ) : (
                              <>
                                <ReactMarkdown>{item.response_text}</ReactMarkdown>
                                
                                {item.context_sources && item.context_sources.length > 0 && (
                                  <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Sources:</span>
                                    {item.context_sources.map((src, i) => (
                                      <button
                                        key={i}
                                        onClick={() => setActiveSource(src)}
                                        style={{
                                          fontSize: "0.75rem",
                                          padding: "0.2rem 0.5rem",
                                          borderRadius: "6px",
                                          border: "1px solid var(--border)",
                                          background: activeSource?.material_id === src.material_id ? "rgba(99,102,241,0.15)" : "var(--bg-card)",
                                          color: activeSource?.material_id === src.material_id ? "var(--accent-primary)" : "var(--text-secondary)",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.3rem"
                                        }}
                                      >
                                        <SvgIcon name="file-text" size={12} />
                                        <span>{src.title || (src as any).material_title || `Source ${i+1}`}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Retry / Resend Action Button */}
                                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.65rem", paddingTop: "0.4rem" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryQuestion(item.question_id, item.question_text)}
                                    disabled={asking}
                                    style={{
                                      fontSize: "0.74rem",
                                      fontWeight: 600,
                                      color: "var(--accent-primary)",
                                      background: "transparent",
                                      border: "none",
                                      cursor: asking ? "not-allowed" : "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.3rem",
                                      opacity: asking ? 0.5 : 1
                                    }}
                                  >
                                    <SvgIcon name="refresh" size={13} />
                                    <span>Resend Question to AI</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Controls */}
                <div style={{ padding: "0.9rem 1.25rem", borderTop: "1px solid var(--border)", background: "var(--bg-body)" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "0.5rem 0.75rem", gap: "0.75rem" }}>
                    <textarea
                      ref={textareaRef}
                      placeholder={`Ask anything about ${selectedCourseObj?.title || 'this course'}...`}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={handleKeyDown}
                      style={{ flex: 1, resize: "none", padding: "0.4rem 0", border: "none", background: "transparent", color: "var(--text-primary)", fontFamily: "inherit", fontSize: "0.92rem", minHeight: "38px", maxHeight: "150px", outline: "none" }}
                      rows={1}
                    />
                    <button
                      onClick={() => handleAsk()}
                      disabled={!question.trim() || asking}
                      className="btn-primary"
                      style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.4rem", borderRadius: "8px", fontSize: "0.85rem", flexShrink: 0 }}
                    >
                      {asking ? <SvgIcon name="refresh" className="spin" size={16} /> : <><span>Ask</span><SvgIcon name="send" size={14} /></>}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* History Tab */
              <div className="card" style={{ flex: 1, padding: "1.25rem", overflowY: "auto", border: "1px solid var(--border)" }}>
                <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 600 }}>Question History</h3>
                {conversation.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No previous questions found for this course.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {conversation.map((item) => (
                      <div key={item.question_id} style={{ padding: "1rem", background: "var(--bg-body)", borderRadius: "10px", border: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.4rem" }}>{item.question_text}</div>
                        <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          <ReactMarkdown>{item.response_text || "Generating response..."}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Pane: Context Source Material Drawer */}
          {activeSource && (
            <div className="card" style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
              <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-body)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <SvgIcon name="file-text" size={18} style={{ color: "var(--accent-primary)" }} />
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>{activeSource.title || activeSource.material_title || "Source Reference"}</h4>
                </div>
                <button className="btn-secondary" onClick={() => setActiveSource(null)} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>
                  Close
                </button>
              </div>
              <div style={{ flex: 1, padding: "1rem", overflowY: "auto" }}>
                <MaterialViewer source={activeSource} onClose={() => setActiveSource(null)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AskAIPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading AI Tutor...</div>}>
      <AskAIPageContent />
    </Suspense>
  );
}
