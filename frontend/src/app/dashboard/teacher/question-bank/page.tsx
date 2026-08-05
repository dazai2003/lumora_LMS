"use client";

import { useState, useEffect } from "react";
import api, { QuestionVersionResponse, QuestionAnalyticsResponse } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import Modal from "@/components/Modal";
import { useToast } from "@/components/ui/Toast";

export default function QuestionBankPage() {
  const { addToast } = useToast();
  const [questions, setQuestions] = useState<QuestionVersionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // AI Actions state
  const [improveModalOpen, setImproveModalOpen] = useState(false);
  const [selectedQuestionForAI, setSelectedQuestionForAI] = useState<number | null>(null);
  const [improveInstructions, setImproveInstructions] = useState<string[]>([]);
  const [customInstruction, setCustomInstruction] = useState("");
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // Duplicate Detection state
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatesList, setDuplicatesList] = useState<{ originalId: number; text: string; duplicates: any[] }[]>([]);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  
  // Analytics & Responses Modal state
  const [analytics, setAnalytics] = useState<Record<number, QuestionAnalyticsResponse>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<number | null>(null);
  const [viewAllModalQuestion, setViewAllModalQuestion] = useState<QuestionVersionResponse | null>(null);

  // Filters
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Expanded state
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleExpand = async (qId: number) => {
    if (expandedId === qId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(qId);
    
    // Look up the parent question_id from the version
    const version = questions.find(q => q.id === qId);
    const parentQuestionId = version?.question_id ?? qId;
    
    if (!analytics[qId]) {
      setLoadingAnalytics(qId);
      try {
        const data = await api.getQuestionAnalytics(parentQuestionId);
        setAnalytics(prev => ({ ...prev, [qId]: data }));
      } catch (e) {
        console.error("Failed to load analytics", e);
      } finally {
        setLoadingAnalytics(null);
      }
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = () => {
    setLoading(true);
    api.getQuestionBank()
      .then(setQuestions)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleImproveClick = (qId: number) => {
    setSelectedQuestionForAI(qId);
    setImproveInstructions([]);
    setCustomInstruction("");
    setImproveModalOpen(true);
  };

  const toggleImproveInstruction = (instruction: string) => {
    setImproveInstructions(prev => 
      prev.includes(instruction) 
        ? prev.filter(i => i !== instruction)
        : [...prev, instruction]
    );
  };

  const submitImprovement = async () => {
    if (!selectedQuestionForAI) return;
    
    const finalInstructions = [...improveInstructions];
    if (customInstruction.trim()) {
      finalInstructions.push(customInstruction.trim());
    }
    
    if (finalInstructions.length === 0) {
      addToast("Please select or enter at least one instruction", "warning");
      return;
    }

    setIsProcessingAI(true);
    try {
      await api.improveQuestion(selectedQuestionForAI, finalInstructions);
      addToast("Question improved successfully! A new version was created.", "success");
      setImproveModalOpen(false);
      fetchQuestions(); // Refresh list to get new version
    } catch (e: any) {
      addToast(e.message || "Failed to improve question", "error");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const generateVariations = async (qId: number) => {
    if (!confirm("This will generate 3 new question variations testing the same concept. Proceed?")) return;
    
    setIsProcessingAI(true);
    addToast("Generating variations in the background... this may take a moment.", "info");
    try {
      await api.generateQuestionVariations(qId, 3);
      addToast("Variations generated successfully!", "success");
      fetchQuestions(); // Refresh list to show new questions
    } catch (e: any) {
      addToast(e.message || "Failed to generate variations", "error");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleScanDuplicates = async () => {
    setIsScanningDuplicates(true);
    setDuplicateModalOpen(true);
    setDuplicatesList([]);
    
    try {
      // For demonstration, scan the currently visible filtered questions
      // In a real app, this might just scan the entire bank.
      const found: any[] = [];
      const seenPairs = new Set<string>(); // to avoid duplicate pairs
      
      for (const q of filteredQuestions) {
        const res = await api.checkDuplicateQuestion(q.question_text, q.lesson_id);
        if (res.is_duplicate) {
          // Filter out the exact same question
          const trueDups = res.duplicates.filter((d: any) => d.id !== q.question_id && d.similarity > 0.85);
          if (trueDups.length > 0) {
            // Check if we already found this pair
            let alreadyAdded = false;
            for (const t of trueDups) {
              const pairKey = [q.question_id, t.id].sort().join('-');
              if (seenPairs.has(pairKey)) {
                alreadyAdded = true;
                break;
              }
              seenPairs.add(pairKey);
            }
            
            if (!alreadyAdded) {
              found.push({
                originalId: q.question_id,
                text: q.question_text,
                duplicates: trueDups
              });
            }
          }
        }
      }
      
      setDuplicatesList(found);
    } catch (e: any) {
      addToast(e.message || "Failed to scan duplicates", "error");
      setDuplicateModalOpen(false);
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return "badge-info";
    switch (status.toLowerCase()) {
      case "validated": return "badge-success";
      case "review_recommended": return "badge-warning";
      case "potential_issue": return "badge-error";
      default: return "badge-info";
    }
  };

  const getCognitiveBadge = (level: string | null | undefined) => {
    if (!level) return "badge-secondary";
    switch (level.toLowerCase()) {
      case "knowledge": return "badge-info";
      case "comprehension": return "badge-success";
      case "application": return "badge-warning";
      case "analysis": return "badge-error";
      default: return "badge-secondary";
    }
  };

  // Extract unique lessons from fetched questions
  const uniqueLessons = Array.from(
    new Map(
      questions
        .filter(q => q.lesson_id != null)
        .map(q => [q.lesson_id, q.lesson_title])
    ).entries()
  );

  const filteredQuestions = questions.filter(q => {
    if (lessonFilter !== "all" && q.lesson_id?.toString() !== lessonFilter) return false;
    if (typeFilter !== "all" && q.question_type !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Question Bank</h1>
          <p>Manage and review the centralized repository of assessment questions.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button 
            className="btn btn-secondary"
            onClick={handleScanDuplicates}
            disabled={isScanningDuplicates}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <SvgIcon name="layers" size={16} /> 
            {isScanningDuplicates ? "Scanning..." : "Scan for Duplicates"}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".json";
              fileInput.onchange = async (e: any) => {
                const file = e.target.files?.[0];
                if (file) {
                  const text = await file.text();
                  try {
                    const parsed = JSON.parse(text);
                    await api.importQuestions(parsed);
                    addToast("Questions imported successfully", "success");
                    fetchQuestions();
                  } catch (err: any) {
                    addToast("Import failed: " + err.message, "error");
                  }
                }
              };
              fileInput.click();
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <SvgIcon name="download" size={16} /> Import JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <select 
          className="select" 
          value={lessonFilter} 
          onChange={e => setLessonFilter(e.target.value)}
        >
          <option value="all">All Lessons</option>
          {uniqueLessons.map(([id, title]) => (
            <option key={id} value={id}>{title || `Lesson ${id}`}</option>
          ))}
        </select>

        <select 
          className="select" 
          value={typeFilter} 
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="MCQ">Multiple Choice</option>
          <option value="TRUE_FALSE">True/False</option>
          <option value="SHORT_ANSWER">Short Answer</option>
        </select>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="page-loader" style={{ minHeight: "40vh" }}><div className="spinner" /></div>
      ) : filteredQuestions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><SvgIcon name="file-text" size={48} /></div>
          <h3>No questions found</h3>
          <p>Try adjusting your filters or generate new questions using the AI tools.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {filteredQuestions.map((q) => (
            <div 
              key={q.id} 
              className="card" 
              style={{ cursor: "pointer", transition: "all 0.2s ease" }}
              onClick={() => handleExpand(q.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>
                    {q.question_text}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8rem" }}>
                    <span className="badge badge-secondary">{(q.question_type || "").replace("_", " ").toUpperCase() || "UNKNOWN"}</span>
                    {q.lesson_title && (
                      <span className="badge badge-info" style={{ fontWeight: 600 }}>
                        {q.lesson_title}
                      </span>
                    )}
                    <span className={`badge ${getCognitiveBadge(q.cognitive_level)}`}>
                      {(q.cognitive_level || "Not Set").toUpperCase()}
                    </span>
                    <span className={`badge ${getStatusBadge(q.ai_validation_status)}`}>
                      AI: {(q.ai_validation_status || "Pending").replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {expandedId === q.id && (
                <div className="animate-fade-in" style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", alignItems: "start" }}>
                    
                    {/* Left Column: Options, Correct Answer, Explanation & Actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {q.options && q.options.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Options</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.4rem" }}>
                            {q.options.map((opt, i) => (
                              <div key={i} style={{ padding: "0.5rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", fontSize: "0.85rem", border: "1px solid var(--border-color)", wordBreak: "break-word" }}>
                                <span style={{ opacity: 0.6, marginRight: "0.4rem" }}>{String.fromCharCode(65 + i)}.</span> {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase" }}>Correct Answer</div>
                          <div style={{ padding: "0.5rem 0.75rem", background: "rgba(34, 197, 94, 0.1)", color: "var(--success)", border: "1px solid rgba(34, 197, 94, 0.25)", borderRadius: "var(--radius)", fontSize: "0.85rem", fontWeight: 600, wordBreak: "break-word" }}>
                            {q.correct_answer}
                          </div>
                        </div>
                        
                        {q.explanation && (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase" }}>Explanation</div>
                            <div style={{ padding: "0.5rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", fontSize: "0.85rem", color: "var(--text-secondary)", wordBreak: "break-word", maxHeight: "120px", overflowY: "auto" }}>
                              {q.explanation}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Integrated AI Quick Actions */}
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", paddingTop: "0.5rem" }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                          onClick={(e) => { e.stopPropagation(); generateVariations(q.id); }}
                          disabled={isProcessingAI}
                        >
                          <SvgIcon name="layers" size={14} /> Generate Variations
                        </button>
                        <button 
                          className="btn btn-primary" 
                          style={{ background: "var(--accent)", color: "var(--text-primary)", border: "none", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                          onClick={(e) => { e.stopPropagation(); handleImproveClick(q.id); }}
                          disabled={isProcessingAI}
                        >
                          <SvgIcon name="zap" size={14} /> Improve with AI
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Performance Analytics & Distractor Analysis */}
                    <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="bar-chart" size={14} /> Performance Analytics</span>
                        {analytics[q.id] && (
                          <span className={`badge ${
                            analytics[q.id].observed_difficulty === "hard" ? "badge-error" : 
                            analytics[q.id].observed_difficulty === "medium" ? "badge-warning" : "badge-success"
                          }`} style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}>
                            {(analytics[q.id].observed_difficulty || "unknown").toUpperCase()}
                          </span>
                        )}
                      </div>
                      
                      {loadingAnalytics === q.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                          <div className="spinner" style={{ width: "14px", height: "14px", borderBottomColor: "var(--text-muted)" }} /> Loading stats...
                        </div>
                      ) : analytics[q.id] ? (
                        analytics[q.id].total_attempts === 0 ? (
                          <div style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
                            No student attempts recorded yet.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "var(--bg-card)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius)" }}>
                              <div>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Success Rate</span>
                                <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--primary)" }}>{analytics[q.id].success_rate}%</span>
                              </div>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{analytics[q.id].correct_attempts} / {analytics[q.id].total_attempts} attempts</span>
                            </div>
                            
                            {Object.keys(analytics[q.id].distractor_distribution).length > 0 && (() => {
                              const entries = Object.entries(analytics[q.id].distractor_distribution).sort((a, b) => b[1] - a[1]);
                              const isTrueFalse = q.question_type === "TRUE_FALSE";
                              const isShortAnswer = q.question_type === "SHORT_ANSWER";
                              const hasLongText = entries.some(([text]) => text.length > 35);
                              const shouldLimitPreview = !isTrueFalse && (entries.length > 2 || hasLongText);
                              const displayEntries = shouldLimitPreview ? entries.slice(0, 2) : entries;

                              return (
                                <div>
                                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>{isTrueFalse ? "Answer Breakdown" : isShortAnswer ? "Student Responses" : "Distractor Breakdown"}</span>
                                    {shouldLimitPreview && (
                                      <span style={{ fontSize: "0.7rem", color: "var(--primary)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setViewAllModalQuestion(q); }}>
                                        {entries.length} Total
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                    {displayEntries.map(([distractor, pct]) => {
                                      const isCorrect = distractor.trim().toLowerCase() === (q.correct_answer || "").trim().toLowerCase();
                                      return (
                                        <div key={distractor} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
                                          <span style={{ width: "2.5rem", fontWeight: 600, textAlign: "right" }}>{pct}%</span>
                                          <div style={{ flex: 1, height: "6px", background: "var(--bg-card)", borderRadius: "3px", overflow: "hidden" }}>
                                            <div style={{ 
                                              width: `${pct}%`, 
                                              height: "100%", 
                                              background: isCorrect ? "var(--success)" : "var(--error)",
                                              opacity: isCorrect ? 1 : 0.6
                                            }} />
                                          </div>
                                          <span style={{ flex: 1.2, wordBreak: "break-word", color: isCorrect ? "var(--success)" : "var(--text-secondary)", fontSize: "0.75rem" }}>
                                            {distractor.length > 30 ? distractor.slice(0, 30) + "..." : distractor}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {shouldLimitPreview && (
                                    <button 
                                      className="btn btn-outline" 
                                      style={{ marginTop: "0.6rem", width: "100%", fontSize: "0.75rem", padding: "0.3rem 0.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                                      onClick={(e) => { e.stopPropagation(); setViewAllModalQuestion(q); }}
                                    >
                                      <SvgIcon name="file-text" size={12} /> View All Responses ({entries.length})
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )
                      ) : (
                        <div style={{ color: "var(--error)", fontSize: "0.85rem" }}>Failed to load analytics.</div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Improve Modal */}
      {improveModalOpen && (
      <Modal onClose={() => setImproveModalOpen(false)} title="Improve Question with AI">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>
            Select how you want the AI to improve this question. It will generate a new Version, preserving historical analytics for the original version.
          </p>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {[
              "Make wording clearer",
              "Improve distractors",
              "Increase difficulty",
              "Decrease difficulty",
              "Make more application-based",
              "Remove ambiguity"
            ].map(inst => (
              <label key={inst} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", cursor: "pointer", border: improveInstructions.includes(inst) ? "1px solid var(--primary)" : "1px solid transparent" }}>
                <input 
                  type="checkbox" 
                  checked={improveInstructions.includes(inst)}
                  onChange={() => toggleImproveInstruction(inst)}
                />
                <span style={{ fontSize: "0.9rem" }}>{inst}</span>
              </label>
            ))}
          </div>

          <div className="form-group">
            <label className="label">Custom Instruction</label>
            <input 
              type="text" 
              className="input" 
              placeholder="e.g., Focus more on mitosis than meiosis..."
              value={customInstruction}
              onChange={e => setCustomInstruction(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
            <button className="btn btn-secondary" onClick={() => setImproveModalOpen(false)}>Cancel</button>
            <button 
              className="btn btn-primary" 
              style={{ background: "var(--accent)", color: "var(--text-primary)" }}
              onClick={submitImprovement}
              disabled={isProcessingAI || (improveInstructions.length === 0 && !customInstruction.trim())}
            >
              {isProcessingAI ? "Improving..." : "Improve Question"}
            </button>
          </div>
        </div>
      </Modal>
      )}

      {/* Duplicate Scanning Modal */}
      {duplicateModalOpen && (
      <Modal onClose={() => setDuplicateModalOpen(false)} title="Duplicate Question Scanner">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>
            Scanning the current view for semantically identical questions using vector similarity...
          </p>
          
          {isScanningDuplicates ? (
            <div style={{ padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
              <div className="spinner" style={{ width: "24px", height: "24px", borderBottomColor: "var(--primary)" }} />
              <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Embedding and comparing questions...</div>
            </div>
          ) : duplicatesList.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", background: "rgba(34, 197, 94, 0.1)", borderRadius: "var(--radius)", color: "var(--success)" }}>
              <SvgIcon name="check-circle" size={32} style={{ margin: "0 auto 1rem" }} />
              <div style={{ fontWeight: 600 }}>Bank is clean!</div>
              <div style={{ fontSize: "0.9rem", marginTop: "0.25rem", opacity: 0.9 }}>No duplicates found in this view.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ padding: "1rem", background: "rgba(245, 158, 11, 0.1)", color: "var(--warning)", borderRadius: "var(--radius)", fontSize: "0.9rem" }}>
                Found {duplicatesList.length} potential duplicate pair(s).
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "400px", overflowY: "auto", paddingRight: "0.5rem" }}>
                {duplicatesList.map((group, i) => (
                  <div key={i} style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                    <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase", fontWeight: 600 }}>Original (ID: {group.originalId})</div>
                      <div style={{ fontWeight: 500 }}>{group.text}</div>
                    </div>
                    
                    {group.duplicates.map((dup, j) => (
                      <div key={j} style={{ padding: "1rem", borderTop: j > 0 ? "1px dashed var(--border-color)" : "none", display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--error)", textTransform: "uppercase", fontWeight: 600 }}>Duplicate (ID: {dup.id})</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{Math.round(dup.similarity * 100)}% Match</div>
                          </div>
                          <div style={{ fontSize: "0.95rem" }}>{dup.text}</div>
                        </div>
                        <button 
                          className="btn btn-sm btn-error" 
                          style={{ padding: "0.5rem", borderRadius: "var(--radius)" }}
                          title="This would archive the duplicate in a real system"
                          onClick={() => {
                            addToast(`Would archive Question ${dup.id} and merge stats.`, "info");
                          }}
                        >
                          <SvgIcon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button className="btn btn-secondary" onClick={() => setDuplicateModalOpen(false)}>Close</button>
          </div>
        </div>
      </Modal>
      )}
      {/* Full Student Responses Modal */}
      {viewAllModalQuestion && analytics[viewAllModalQuestion.id] && (
        <Modal
          onClose={() => setViewAllModalQuestion(null)}
          title={`All Student Responses — Question ${viewAllModalQuestion.id}`}
        >
          <div style={{ padding: "1.5rem" }}>
            <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)" }}>
              <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem" }}>{viewAllModalQuestion.question_text}</div>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <span>Success Rate: <strong style={{ color: "var(--primary)" }}>{analytics[viewAllModalQuestion.id].success_rate}%</strong></span>
                <span>Total Attempts: <strong>{analytics[viewAllModalQuestion.id].total_attempts}</strong></span>
              </div>
            </div>

            <div style={{ maxHeight: "350px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {Object.entries(analytics[viewAllModalQuestion.id].distractor_distribution)
                .sort((a, b) => b[1] - a[1])
                .map(([distractor, pct]) => {
                  const isCorrect = distractor.trim().toLowerCase() === (viewAllModalQuestion.correct_answer || "").trim().toLowerCase();
                  return (
                    <div 
                      key={distractor} 
                      style={{ 
                        padding: "1rem", 
                        background: isCorrect ? "rgba(34, 197, 94, 0.08)" : "var(--bg-secondary)", 
                        border: isCorrect ? "1px solid rgba(34, 197, 94, 0.25)" : "1px solid var(--border-color)",
                        borderRadius: "var(--radius)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className={`badge ${isCorrect ? "badge-success" : "badge-secondary"}`}>
                          {isCorrect ? "CORRECT ANSWER" : "STUDENT RESPONSE"}
                        </span>
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: isCorrect ? "var(--success)" : "var(--primary)" }}>
                          {pct}%
                        </span>
                      </div>
                      <div style={{ fontSize: "0.95rem", color: "var(--text-primary)", wordBreak: "break-word", lineHeight: 1.5 }}>
                        {distractor}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button className="btn btn-secondary" onClick={() => setViewAllModalQuestion(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
