"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import api, { Course, QAResponse, UnitWithLessons } from "@/lib/api";
import RagSourceViewer from "@/components/ai/RagSourceViewer";
import ReactMarkdown from "react-markdown";
import { SvgIcon } from "@/components/SvgIcon";
import { useSearchParams, useRouter } from "next/navigation";

function AskAIPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | "">("");
  const [units, setUnits] = useState<UnitWithLessons[]>([]);
  const [attachedLessonId, setAttachedLessonId] = useState<number | null>(null);
  const [attachedUnitId, setAttachedUnitId] = useState<number | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [conversation, setConversation] = useState<QAResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contextDropdownOpen, setContextDropdownOpen] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initQ = searchParams.get("initialQuestion");
    const courseIdParam = searchParams.get("courseId");
    const lessonIdParam = searchParams.get("lessonId");

    api.getMyEnrolledCourses().then((data) => {
      const regularCourses = (data || []).filter((c: Course) => {
        const title = (c.title || "").toLowerCase();
        const subject = (c.subject || "").toLowerCase();
        return !title.includes("examination papers") && !title.includes("g.c.e. a/l examination papers") && subject !== "a/l exam papers";
      });
      setCourses(regularCourses);
      if (courseIdParam) {
        setSelectedCourse(Number(courseIdParam));
      } else if (regularCourses.length > 0 && !selectedCourse) {
        setSelectedCourse(regularCourses[0].id);
      }

      if (lessonIdParam) {
        setAttachedLessonId(Number(lessonIdParam));
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
      if (contextDropdownRef.current && !contextDropdownRef.current.contains(event.target as Node)) {
        setContextDropdownOpen(false);
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

      api.listUnits(selectedCourse as number)
        .then((uData: UnitWithLessons[]) => {
          setUnits(uData || []);
          const lessonIdParam = searchParams.get("lessonId");
          if (lessonIdParam) {
            const targetLId = Number(lessonIdParam);
            const foundUnit = (uData || []).find((u: UnitWithLessons) => (u.lessons || []).some((ls) => ls.id === targetLId));
            if (foundUnit) {
              setAttachedUnitId(foundUnit.id);
              setAttachedLessonId(targetLId);
            }
          }
        })
        .catch(() => setUnits([]));
    } else {
      setConversation([]);
      setUnits([]);
      setAttachedUnitId(null);
      setAttachedLessonId(null);
    }
  }, [selectedCourse, searchParams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Derive active attached unit and lesson objects
  const attachedUnit = units.find(u => u.id === attachedUnitId || (attachedLessonId && (u.lessons || []).some(ls => ls.id === attachedLessonId)));
  const attachedLesson = attachedUnit?.lessons?.find(ls => ls.id === attachedLessonId);

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

    // Prepare prompt with explicit attached lesson grounding tag if attached
    let promptToSend = q;
    if (attachedLesson && attachedUnit) {
      promptToSend = `[Attached Context: Unit ${attachedUnit.unit_number || attachedUnit.order || 1}: ${attachedUnit.title} | Lesson: ${attachedLesson.title}]\n\n${q}`;
    } else if (attachedUnit) {
      promptToSend = `[Attached Context: Unit ${attachedUnit.unit_number || attachedUnit.order || 1}: ${attachedUnit.title}]\n\n${q}`;
    }

    api.askQuestionStream(
      selectedCourse as number,
      promptToSend,
      (data) => {
        if (data.type === 'start') {
          setConversation(prev => prev.map(item => 
            item.question_id === tempEntry.question_id 
              ? { 
                  ...item, 
                  question_id: data.question_id, 
                  is_grounded: data.is_grounded,
                  context_sources: data.context_sources, 
                  response_text: "" 
                } 
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
              ? { 
                  ...item, 
                  question_id: data.question_id, 
                  is_grounded: data.is_grounded,
                  context_sources: data.context_sources, 
                  response_text: "" 
                } 
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
                width: "260px",
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
                background: "rgba(37, 99, 235, 0.12)", 
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
                          background: isSelected ? "rgba(37, 99, 235, 0.12)" : "transparent",
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

          {/* Unit & Lesson Grounding Context Selector */}
          {selectedCourse && (
            <div ref={contextDropdownRef} style={{ position: "relative" }}>
              {attachedLesson ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  background: "rgba(37, 99, 235, 0.08)",
                  border: "1px solid rgba(37, 99, 235, 0.25)",
                  borderRadius: "var(--radius-full)",
                  fontSize: "0.8rem",
                  color: "var(--accent-primary)",
                  fontWeight: 600
                }}>
                  <SvgIcon name="layers" size={13} />
                  <span style={{ maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Unit {attachedUnit?.unit_number || attachedUnit?.order || 1}: {attachedLesson.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedLessonId(null);
                      setAttachedUnitId(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "0 2px",
                      display: "flex",
                      alignItems: "center"
                    }}
                    title="Clear attached lesson context"
                  >
                    <SvgIcon name="x" size={12} />
                  </button>
                </div>
              ) : attachedUnit ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  background: "rgba(37, 99, 235, 0.08)",
                  border: "1px solid rgba(37, 99, 235, 0.25)",
                  borderRadius: "var(--radius-full)",
                  fontSize: "0.8rem",
                  color: "var(--accent-primary)",
                  fontWeight: 600
                }}>
                  <SvgIcon name="layers" size={13} />
                  <span style={{ maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Unit {attachedUnit.unit_number || attachedUnit.order || 1}: {attachedUnit.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedLessonId(null);
                      setAttachedUnitId(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "0 2px",
                      display: "flex",
                      alignItems: "center"
                    }}
                    title="Clear attached unit context"
                  >
                    <SvgIcon name="x" size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setContextDropdownOpen(!contextDropdownOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.5rem 0.9rem",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-secondary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "var(--shadow-sm)"
                  }}
                >
                  <SvgIcon name="layers" size={13} style={{ color: "var(--accent-primary)" }} />
                  <span>Attach Unit / Lesson</span>
                  <SvgIcon name="chevron-down" size={12} style={{ color: "var(--text-muted)" }} />
                </button>
              )}

              {contextDropdownOpen && (
                <div 
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "320px",
                    maxHeight: "340px",
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
                    Select Context Attachment Scope
                  </div>

                  <div
                    onClick={() => {
                      setAttachedUnitId(null);
                      setAttachedLessonId(null);
                      setContextDropdownOpen(false);
                    }}
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.825rem",
                      fontWeight: !attachedUnitId && !attachedLessonId ? 700 : 500,
                      color: !attachedUnitId && !attachedLessonId ? "var(--accent-primary)" : "var(--text-primary)",
                      background: !attachedUnitId && !attachedLessonId ? "rgba(37, 99, 235, 0.08)" : "transparent",
                      marginBottom: "4px"
                    }}
                  >
                    All Course Units (General Context)
                  </div>

                  {units.map((u, uIdx) => (
                    <div key={u.id} style={{ marginBottom: "6px" }}>
                      <div
                        onClick={() => {
                          setAttachedUnitId(u.id);
                          setAttachedLessonId(null);
                          setContextDropdownOpen(false);
                        }}
                        style={{
                          padding: "0.45rem 0.75rem",
                          borderRadius: "6px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: attachedUnitId === u.id && !attachedLessonId ? "var(--accent-primary)" : "var(--text-secondary)",
                          background: attachedUnitId === u.id && !attachedLessonId ? "rgba(37, 99, 235, 0.08)" : "var(--bg-secondary)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <span>Unit {u.unit_number || u.order || uIdx + 1}: {u.title}</span>
                        <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>Entire Unit</span>
                      </div>

                      {(u.lessons || []).map((ls) => {
                        const isLsSelected = attachedLessonId === ls.id;
                        return (
                          <div
                            key={ls.id}
                            onClick={() => {
                              setAttachedUnitId(u.id);
                              setAttachedLessonId(ls.id);
                              setContextDropdownOpen(false);
                            }}
                            style={{
                              padding: "0.4rem 0.75rem 0.4rem 1.5rem",
                              borderRadius: "6px",
                              fontSize: "0.8rem",
                              color: isLsSelected ? "var(--accent-primary)" : "var(--text-primary)",
                              fontWeight: isLsSelected ? 700 : 500,
                              background: isLsSelected ? "rgba(37, 99, 235, 0.1)" : "transparent",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem"
                            }}
                          >
                            <SvgIcon name="file-text" size={12} style={{ opacity: 0.6 }} />
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {ls.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
                            padding: "0.75rem 1.15rem", 
                            borderRadius: "16px 16px 4px 16px", 
                            background: "var(--accent-primary)", 
                            color: "white", 
                            fontSize: "0.92rem", 
                            lineHeight: 1.5,
                          }}>
                            {item.question_text}
                          </div>
                        </div>

                        {/* AI Response Card */}
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(37, 99, 235, 0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.2rem" }}>
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
                                {/* Grounded vs Ungrounded Status Banner */}
                                {(item.is_grounded !== undefined ? item.is_grounded : Boolean(item.context_sources && item.context_sources.length > 0)) ? (
                                  <div style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    padding: "0.25rem 0.6rem",
                                    borderRadius: "6px",
                                    background: "rgba(16, 185, 129, 0.12)",
                                    color: "var(--success, #10b981)",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    marginBottom: "0.75rem"
                                  }}>
                                    <SvgIcon name="check-circle" size={13} />
                                    <span>Grounded in Course Study Notes</span>
                                  </div>
                                ) : (
                                  <div style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "0.6rem",
                                    padding: "0.6rem 0.85rem",
                                    borderRadius: "8px",
                                    background: "rgba(245, 158, 11, 0.08)",
                                    border: "1px solid rgba(245, 158, 11, 0.25)",
                                    marginBottom: "0.75rem",
                                    fontSize: "0.82rem",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.45
                                  }}>
                                    <SvgIcon name="info" size={15} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />
                                    <div>
                                      <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "0.1rem" }}>General AI Knowledge</strong>
                                      <span>No relevant learning material found in your enrolled course units. The answer below is based on general Biology knowledge.</span>
                                    </div>
                                  </div>
                                )}

                                <ReactMarkdown>{item.response_text}</ReactMarkdown>
                                
                                {/* Compact Verified Sources List */}
                                {item.context_sources && item.context_sources.length > 0 && (
                                  <div style={{ marginTop: "1.1rem", paddingTop: "0.85rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                                      Referenced Course Materials ({item.context_sources.length})
                                    </span>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                      {item.context_sources.map((src, i) => (
                                        <div
                                          key={i}
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            padding: "0.55rem 0.8rem",
                                            borderRadius: "8px",
                                            border: "1px solid var(--border)",
                                            background: "var(--bg-card)",
                                            fontSize: "0.82rem",
                                            gap: "0.75rem",
                                            flexWrap: "wrap"
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
                                            <SvgIcon name={src.material_type === "video" ? "video" : src.material_type === "pdf" ? "file-text" : "book"} size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                                            <div style={{ minWidth: 0 }}>
                                              <div style={{ fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {src.title || (src as any).material_title || `Learning Resource ${i+1}`}
                                              </div>
                                              {(src.unit_name || src.lesson_title) && (
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                  {src.unit_name ? `${src.unit_name} · ` : ""}{src.lesson_title || ""}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                                            <button
                                              type="button"
                                              onClick={() => setActiveSource(src)}
                                              className="btn-secondary"
                                              style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                                            >
                                              Split View
                                            </button>
                                            {src.lesson_id && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const courseId = src.course_id || selectedCourse;
                                                  const matParam = src.material_id ? `?materialId=${src.material_id}` : "";
                                                  router.push(`/dashboard/student/courses/${courseId}/lessons/${src.lesson_id}${matParam}`);
                                                }}
                                                className="btn-primary"
                                                style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                              >
                                                <span>Review Material</span>
                                                <SvgIcon name="chevron-right" size={11} />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
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
                <RagSourceViewer source={activeSource} onClose={() => setActiveSource(null)} />
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
