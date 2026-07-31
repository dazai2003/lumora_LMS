"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import api, { QuizDetail, QuizAttempt } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { SvgIcon } from "@/components/SvgIcon";

export default function StudentQuizTakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const quizId = parseInt(id);
  const { addToast } = useToast();
  
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [sessionState, setSessionState] = useState<"available" | "taking" | "submitting" | "review">("available");
  
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<QuizAttempt | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [flaggingId, setFlaggingId] = useState<number | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  
  // Attempt tracking
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<Date | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const scoreAnimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.getQuiz(quizId),
      api.getQuizAttempts(quizId).catch(() => [])
    ])
    .then(([q, atts]) => {
      setQuiz(q);
      setAttempts(atts);

      const inProgress = atts.find(
        (a) => a.status === "in_progress" || (!a.completed_at && a.status !== "auto_closed" && a.status !== "submitted")
      );
      if (inProgress) {
        setAttemptId(inProgress.id);
        if (inProgress.deadline_at) {
          setDeadlineAt(new Date(inProgress.deadline_at));
        }
        startTimeRef.current = new Date(inProgress.started_at);
        setSessionState("taking");
        return;
      }

      const finishedAttempts = atts.filter((a) => a.completed_at);
      const attemptsUsed = finishedAttempts.length;
      const canRetake = attemptsUsed < (q.max_attempts ?? 1);

      if (finishedAttempts.length > 0 && !canRetake) {
        setResult(finishedAttempts[0]);
        setSessionState("review");
      }
    })
    .catch(err => {
      console.error(err);
      addToast("Failed to load quiz.", "error");
    })
    .finally(() => setLoading(false));
  }, [quizId, addToast]);

  const startQuiz = async () => {
    if (!quiz) return;
    try {
      const attempt = await api.startQuizAttempt(quizId);
      setAttemptId(attempt.id);
      if (attempt.deadline_at) {
        setDeadlineAt(new Date(attempt.deadline_at));
      }
      startTimeRef.current = new Date();
      setCurrentQ(0);
      setSessionState("taking");
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || "Failed to start quiz attempt.", "error");
    }
  };

  const handleFlagAnswer = async (answerId: number | undefined) => {
    if (!answerId || !result) return;
    setFlaggingId(answerId);
    try {
      await api.flagQuizAnswer(result.id, answerId);
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          answers: prev.answers?.map(a => a.id === answerId ? { ...a, is_flagged: true } : a)
        };
      });
      addToast("Answer flagged for review.", "success");
    } catch (err) {
      console.error(err);
      addToast("Failed to flag answer.", "error");
    } finally {
      setFlaggingId(null);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!quiz || submitting || sessionState !== "taking") return;
    setSubmitting(true);
    setSessionState("submitting");
    try {
      const answerList = quiz.questions.map((q) => ({
        question_version_id: q.id,
        student_answer: answers[q.id] || "",
      }));
      const attempt = await api.submitQuiz(quizId, answerList);
      
      // Minimum 2s delay for premium submission feel
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setResult(attempt);
      setSessionState("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error(err);
      setSessionState("taking");
      addToast(err.message || "Failed to submit quiz.", "error");
    } finally { 
      setSubmitting(false); 
    }
  }, [quiz, answers, quizId, submitting, sessionState, addToast]);

  // Countdown timer (if deadline set)
  useEffect(() => {
    if (sessionState !== "taking" || !deadlineAt || result) return;
    const timer = setInterval(() => {
      const now = new Date();
      const diffSeconds = Math.floor((deadlineAt.getTime() - now.getTime()) / 1000);
      
      if (diffSeconds <= 0) {
        clearInterval(timer);
        setTimeLeft(0);
        handleSubmit();
      } else {
        setTimeLeft(diffSeconds);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlineAt, result, handleSubmit, sessionState]);

  // Elapsed timer (always runs during quiz)
  useEffect(() => {
    if (sessionState !== "taking") return;
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionState]);

  // Tab switch integrity tracking
  useEffect(() => {
    if (sessionState !== "taking" || !quiz?.is_strict_mode || !attemptId || result) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        api.logIntegrityEvent(attemptId, {
          event_type: "tab_switch",
          metadata_json: { timestamp: new Date().toISOString() }
        }).catch(console.error);
        addToast("Warning: Tab switching is monitored in Strict Mode.", "error");
      }
    };

    const handleBlur = () => {
      api.logIntegrityEvent(attemptId, {
        event_type: "window_blur",
        metadata_json: { timestamp: new Date().toISOString() }
      }).catch(console.error);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [sessionState, quiz?.is_strict_mode, attemptId, result, addToast]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loading || !quiz) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: "0 auto 1rem" }} />
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading assessment...</div>
        </div>
      </div>
    );
  }

  const sortedQuestions = [...quiz.questions].sort((a, b) => a.order - b.order);
  const answeredCount = sortedQuestions.filter(q => answers[q.id]?.trim()).length;
  const totalQuestions = sortedQuestions.length;
  const progressPct = totalQuestions > 0 ? (answeredCount / totalQuestions * 100) : 0;

  // ═══════════════════════════════════════════════════
  // SUBMITTING SCREEN
  // ═══════════════════════════════════════════════════
  if (sessionState === "submitting") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "var(--bg-body)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: "2rem",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulse 1.5s ease-in-out infinite",
        }}>
          <div className="spinner" style={{ width: 36, height: 36 }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Grading Your Answers
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", maxWidth: 400, lineHeight: 1.6 }}>
            Please wait while we analyze your responses and calculate your score...
          </p>
        </div>
        <div style={{
          width: 200, height: 4, borderRadius: 2, background: "var(--border-subtle)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #6366F1, #A855F7)",
            animation: "shimmer 1.5s ease-in-out infinite",
            width: "60%",
          }} />
        </div>
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); width: 30%; }
            50% { width: 70%; }
            100% { transform: translateX(200%); width: 30%; }
          }
        `}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // AVAILABLE SCREEN (Pre-quiz)
  // ═══════════════════════════════════════════════════
  if (sessionState === "available") {
    const now = new Date();
    const availableFrom = quiz.available_from ? new Date(quiz.available_from + "Z") : null;
    const availableUntil = quiz.available_until ? new Date(quiz.available_until + "Z") : null;
    
    const isTooEarly = availableFrom && now < availableFrom;
    const isTooLate = availableUntil && now > availableUntil;
    const finishedCount = attempts.filter((a) => a.completed_at).length;
    const maxAttempts = quiz.max_attempts ?? 1;
    const attemptsLeft = Math.max(0, maxAttempts - finishedCount);
    const canStart = !isTooEarly && !isTooLate && attemptsLeft > 0;

    return (
      <div className="animate-fade-in" style={{ maxWidth: "700px", margin: "3rem auto 0" }}>
        <div className="card" style={{
          padding: "3rem 2.5rem", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Decorative gradient */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 4,
            background: "linear-gradient(90deg, #6366F1, #8B5CF6, #A855F7)",
          }} />

          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.12))",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "1.5rem", marginTop: "0.5rem",
          }}>
            <SvgIcon name={quiz.is_ai_generated ? "sparkle" : "clipboard"} size={34} style={{ color: "#6366F1" }} />
          </div>

          {/* Title & description */}
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
            {quiz.title}
          </h1>
          {quiz.is_ai_generated && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              fontSize: "0.7rem", fontWeight: 600, color: "#A855F7",
              background: "rgba(168,85,247,0.08)", padding: "3px 10px", borderRadius: 12,
              marginBottom: "0.75rem",
            }}>
              <SvgIcon name="sparkle" size={12} /> AI Generated
            </span>
          )}
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "2rem", maxWidth: "480px", lineHeight: 1.7 }}>
            {quiz.description || "Test your understanding of the material. Good luck!"}
          </p>

          {/* Stats grid */}
          <div style={{
            display: "grid", gridTemplateColumns: quiz.time_limit_minutes ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: "1.5rem", marginBottom: "2rem", width: "100%", maxWidth: 420,
          }}>
            <div style={{
              padding: "1.25rem 0.5rem", borderRadius: "var(--radius-md)",
              background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                {quiz.questions.length}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Questions
              </div>
            </div>
            {quiz.time_limit_minutes && (
              <div style={{
                padding: "1.25rem 0.5rem", borderRadius: "var(--radius-md)",
                background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
              }}>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                  {quiz.time_limit_minutes}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Minutes
                </div>
              </div>
            )}
            <div style={{
              padding: "1.25rem 0.5rem", borderRadius: "var(--radius-md)",
              background: "var(--bg-primary)", border: "1px solid var(--border-subtle)",
            }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: attemptsLeft === 0 ? "var(--error)" : "var(--text-primary)", lineHeight: 1 }}>
                {attemptsLeft}/{maxAttempts}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Attempts Left
              </div>
            </div>
          </div>

          {/* Details pills */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
            {!quiz.time_limit_minutes && (
              <span style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, background: "rgba(16,185,129,0.08)", color: "#059669", fontWeight: 500 }}>
                ∞ No Time Limit
              </span>
            )}
            {quiz.is_strict_mode && (
              <span style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, background: "rgba(239,68,68,0.08)", color: "#EF4444", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <SvgIcon name="alert-triangle" size={12} /> Strict Mode
              </span>
            )}
            {availableUntil && (
              <span style={{ fontSize: "0.75rem", padding: "4px 12px", borderRadius: 20, background: "rgba(245,158,11,0.08)", color: "#D97706", fontWeight: 500 }}>
                Due: {availableUntil.toLocaleDateString()} {availableUntil.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
              </span>
            )}
          </div>

          {/* Action button */}
          {isTooEarly ? (
            <div style={{ padding: "1rem 2rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontWeight: 500 }}>
              <SvgIcon name="clock" size={16} style={{ verticalAlign: "middle", marginRight: "0.5rem" }} />
              Opens on {availableFrom.toLocaleString()}
            </div>
          ) : isTooLate ? (
            <div style={{ padding: "1rem 2rem", background: "rgba(239,68,68,0.06)", borderRadius: "var(--radius-md)", color: "var(--error)", fontWeight: 600, border: "1px solid rgba(239,68,68,0.15)" }}>
              This quiz closed on {availableUntil.toLocaleString()}
            </div>
          ) : !canStart ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ padding: "1rem 2rem", background: "rgba(239,68,68,0.06)", borderRadius: "var(--radius-md)", color: "var(--error)", fontWeight: 600, border: "1px solid rgba(239,68,68,0.15)" }}>
                Maximum attempts reached ({maxAttempts}).
              </div>
              {finishedCount > 0 && (
                <button
                  onClick={() => {
                    const latest = attempts.find((a) => a.completed_at);
                    if (latest) { setResult(latest); setSessionState("review"); }
                  }}
                  className="btn-secondary"
                >
                  View Last Results
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={startQuiz}
              className="btn-primary"
              style={{
                padding: "1rem 3.5rem", fontSize: "1.1rem", fontWeight: 600,
                borderRadius: "var(--radius-md)", position: "relative", overflow: "hidden",
              }}
            >
              {finishedCount > 0 ? "Retake Quiz" : "Start Quiz"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // REVIEW SCREEN (Results)
  // ═══════════════════════════════════════════════════
  if (sessionState === "review" && result) {
    const pct = result.percentage ?? 0;
    const scoreColor = pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";
    const totalQ = sortedQuestions.length;
    const correctCount = result.answers?.filter(a => a.is_correct === true).length ?? 0;
    const incorrectCount = result.answers?.filter(a => a.is_correct === false).length ?? 0;
    const pendingCount = result.answers?.filter(a => a.is_correct === null || a.is_correct === undefined).length ?? 0;
    const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "👍" : "📚";

    return (
      <div className="animate-fade-in" style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "4rem" }}>
        {/* Score Hero */}
        <div style={{
          textAlign: "center", padding: "3rem 2rem 2.5rem",
          marginBottom: "2rem", position: "relative",
          background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 4,
            background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)`,
          }} />

          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>{emoji}</div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            {pct >= 70 ? "Great Job!" : pct >= 50 ? "Good Effort!" : "Keep Practicing!"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "2rem" }}>
            {quiz.title}
          </p>

          {/* Circular score gauge */}
          <div ref={scoreAnimRef} style={{
            width: 160, height: 160, borderRadius: "50%", margin: "0 auto 2rem",
            position: "relative",
            background: `conic-gradient(${scoreColor} ${pct * 3.6}deg, var(--border-subtle) ${pct * 3.6}deg)`,
          }}>
            <div style={{
              position: "absolute", inset: 10, borderRadius: "50%",
              background: "var(--bg-card)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {pct.toFixed(0)}
              </div>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                percent
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: pendingCount > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: "1rem", maxWidth: 500, margin: "0 auto" }}>
            <div style={{ padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                {result.score ?? 0}/{result.total_points ?? 0}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Points</div>
            </div>
            <div style={{ padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981" }}>{correctCount}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Correct</div>
            </div>
            <div style={{ padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#EF4444" }}>{incorrectCount}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Incorrect</div>
            </div>
            {pendingCount > 0 && (
              <div style={{ padding: "1rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#F59E0B" }}>{pendingCount}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Pending</div>
              </div>
            )}
          </div>
        </div>

        {/* Answer Review */}
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "1.25rem", color: "var(--text-primary)" }}>
          Answer Review
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sortedQuestions.map((q, index) => {
            const studentAns = result.answers?.find(a => (a.question_version_id ?? a.question_id) === q.id);
            const isCorrect = studentAns?.is_correct;
            const isPending = isCorrect === null || isCorrect === undefined;
            const borderColor = isPending ? "#F59E0B" : isCorrect ? "#10B981" : "#EF4444";

            return (
              <div key={q.id} className="card" style={{
                borderLeft: `4px solid ${borderColor}`, padding: "1.5rem",
                transition: "transform 0.15s ease",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: borderColor + "15", color: borderColor,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.8rem", fontWeight: 700,
                    }}>{index + 1}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      {q.question_type.replace("_", " ")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {studentAns?.is_overridden && (
                      <span className="badge" style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6", fontSize: "0.7rem" }}>Reviewed</span>
                    )}
                    {q.question_type === "short_answer" && isPending ? (
                      <span className="badge badge-warning" style={{ fontSize: "0.7rem" }}>Pending Review ({q.points} pts)</span>
                    ) : (
                      <span className={`badge ${isCorrect ? "badge-success" : isPending ? "badge-warning" : "badge-error"}`} style={{ fontSize: "0.7rem" }}>
                        {isCorrect ? "Correct" : isPending ? "Pending" : "Incorrect"} ({studentAns?.points_earned ?? 0}/{q.points} pts)
                      </span>
                    )}
                  </div>
                </div>

                {/* Question text */}
                <div style={{ marginBottom: "1.25rem" }}>
                  {q.question_type === "true_false" && q.question_text.match(/^True\s*or\s*False:\s*/i) && (
                    <span style={{ display: "block", color: "#6366F1", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.3rem" }}>
                      True or False
                    </span>
                  )}
                  <div style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "var(--text-primary)" }}>
                    {q.question_text.replace(/^True\s*or\s*False:\s*/i, '')}
                  </div>
                </div>

                {/* MCQ / True-False options */}
                {(q.question_type === "mcq" || q.question_type === "true_false") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    {(q.question_type === "true_false" ? ["True", "False"] : q.options || []).map((opt, i) => {
                      const isStudentAnswer = opt === studentAns?.student_answer;
                      const isCorrectAnswer = opt === studentAns?.correct_answer;
                      let bg = "var(--bg-body)";
                      let border = "1px solid var(--border-subtle)";
                      let color = "var(--text-primary)";
                      if (isCorrectAnswer) { bg = "rgba(16,185,129,0.06)"; border = "1px solid rgba(16,185,129,0.3)"; color = "#059669"; }
                      else if (isStudentAnswer && !isCorrect) { bg = "rgba(239,68,68,0.06)"; border = "1px solid rgba(239,68,68,0.3)"; color = "#DC2626"; }

                      return (
                        <div key={i} style={{
                          padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)",
                          background: bg, border, color,
                          display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9rem",
                        }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: isCorrectAnswer ? "#10B981" : isStudentAnswer && !isCorrect ? "#EF4444" : "var(--border)",
                            color: (isCorrectAnswer || (isStudentAnswer && !isCorrect)) ? "white" : "var(--text-muted)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                          }}>
                            {isCorrectAnswer ? "✓" : isStudentAnswer && !isCorrect ? "✗" : String.fromCharCode(65 + i)}
                          </span>
                          <span style={{ flex: 1 }}>{opt}</span>
                          {isStudentAnswer && <span style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.7 }}>Your answer</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Short answer */}
                {q.question_type === "short_answer" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.3rem" }}>Your Answer</div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
                        {studentAns?.student_answer || <em style={{ color: "var(--text-muted)" }}>No answer</em>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.3rem" }}>Expected</div>
                      <div style={{ padding: "0.75rem", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "#059669" }}>
                        {studentAns?.correct_answer}
                      </div>
                    </div>
                  </div>
                )}

                {/* Teacher note */}
                {studentAns?.teacher_note && (
                  <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: "var(--radius-sm)" }}>
                    <span style={{ fontWeight: 600, color: "#6366F1", fontSize: "0.75rem" }}>Teacher Feedback: </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{studentAns.teacher_note}</span>
                  </div>
                )}

                {/* Flag button */}
                {studentAns?.is_correct === false && !studentAns?.teacher_note && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Think this was graded incorrectly?</span>
                    {studentAns?.is_flagged ? (
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F59E0B", background: "rgba(245,158,11,0.08)", padding: "4px 8px", borderRadius: 6 }}>
                        Pending Review
                      </span>
                    ) : (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                        disabled={flaggingId === studentAns?.id}
                        onClick={() => handleFlagAnswer(studentAns?.id)}
                      >
                        {flaggingId === studentAns?.id ? "Flagging..." : "Flag for Review"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
          <Link href="/dashboard/student/quizzes" className="btn-primary" style={{ textDecoration: "none", padding: "0.75rem 2.5rem", fontSize: "1rem" }}>
            Return to Assessments
          </Link>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // TAKING SCREEN
  // ═══════════════════════════════════════════════════
  const currentQuestion = sortedQuestions[currentQ];

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Sticky Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--bg-primary)", padding: "1rem 0",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: "1.5rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{quiz.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              <span>{answeredCount}/{totalQuestions} answered</span>
            </div>
          </div>

          {/* Timer */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.5rem 1rem", borderRadius: "var(--radius-md)",
            background: timeLeft !== null && timeLeft < 60 ? "rgba(239,68,68,0.08)" : timeLeft !== null && timeLeft < 300 ? "rgba(245,158,11,0.08)" : "var(--bg-primary)",
            border: `1px solid ${timeLeft !== null && timeLeft < 60 ? "rgba(239,68,68,0.2)" : timeLeft !== null && timeLeft < 300 ? "rgba(245,158,11,0.2)" : "var(--border-subtle)"}`,
          }}>
            <SvgIcon name="clock" size={16} style={{
              color: timeLeft !== null && timeLeft < 60 ? "#EF4444" : timeLeft !== null && timeLeft < 300 ? "#F59E0B" : "var(--text-muted)"
            }} />
            <span style={{
              fontFamily: "monospace", fontSize: "1rem", fontWeight: 700,
              color: timeLeft !== null && timeLeft < 60 ? "#EF4444" : timeLeft !== null && timeLeft < 300 ? "#F59E0B" : "var(--text-primary)",
            }}>
              {timeLeft !== null ? formatTime(timeLeft) : formatTime(elapsedTime)}
            </span>
            {timeLeft === null && (
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>elapsed</span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 4, background: "var(--border-subtle)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #6366F1, #A855F7)",
            width: `${progressPct}%`,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Question Navigator */}
        <div style={{
          display: "flex", gap: "0.35rem", marginTop: "0.75rem",
          flexWrap: "wrap",
        }}>
          {sortedQuestions.map((q, i) => {
            const isAnswered = !!answers[q.id]?.trim();
            const isCurrent = i === currentQ;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentQ(i)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: isCurrent ? "2px solid #6366F1" : "1px solid var(--border-subtle)",
                  background: isAnswered ? (isCurrent ? "#6366F1" : "rgba(99,102,241,0.15)") : (isCurrent ? "var(--bg-card)" : "transparent"),
                  color: isAnswered && isCurrent ? "white" : isAnswered ? "#6366F1" : isCurrent ? "#6366F1" : "var(--text-muted)",
                  fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Question Card */}
      {currentQuestion && (
        <div className="card animate-fade-in" style={{ padding: "2rem", marginBottom: "1.5rem", position: "relative" }} key={currentQuestion.id}>
          {/* Question header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-subtle)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #6366F1, #A855F7)",
                color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.85rem", fontWeight: 700,
              }}>
                {currentQ + 1}
              </span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Question {currentQ + 1} of {totalQuestions}
              </span>
            </div>
            <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
              {currentQuestion.points} pt{currentQuestion.points > 1 ? "s" : ""}
            </span>
          </div>

          {/* Question text */}
          <div style={{ marginBottom: "2rem" }}>
            {currentQuestion.question_type === "true_false" && currentQuestion.question_text.match(/^True\s*or\s*False:\s*/i) && (
              <span style={{ display: "block", color: "#6366F1", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                True or False
              </span>
            )}
            <div style={{ fontSize: "1.2rem", lineHeight: 1.7, color: "var(--text-primary)", fontWeight: 500 }}>
              {currentQuestion.question_text.replace(/^True\s*or\s*False:\s*/i, '')}
            </div>
          </div>

          {/* Answer input */}
          {currentQuestion.question_type === "true_false" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {["True", "False"].map((opt) => (
                <div
                  key={opt}
                  onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                  style={{
                    padding: "1.5rem", borderRadius: "var(--radius-md)",
                    border: answers[currentQuestion.id] === opt ? "2px solid #6366F1" : "2px solid var(--border-subtle)",
                    background: answers[currentQuestion.id] === opt ? "rgba(99,102,241,0.05)" : "var(--bg-body)",
                    cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center",
                    fontWeight: 700, fontSize: "1.15rem",
                    color: answers[currentQuestion.id] === opt ? "#6366F1" : "var(--text-primary)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          ) : currentQuestion.question_type === "mcq" && currentQuestion.options ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {currentQuestion.options.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                  style={{
                    padding: "1.25rem", borderRadius: "var(--radius-md)",
                    border: answers[currentQuestion.id] === opt ? "2px solid #6366F1" : "1px solid var(--border-subtle)",
                    background: answers[currentQuestion.id] === opt ? "rgba(99,102,241,0.05)" : "var(--bg-body)",
                    cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.2s ease",
                  }}
                >
                  <span style={{
                    width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "50%",
                    background: answers[currentQuestion.id] === opt ? "#6366F1" : "var(--border)",
                    color: answers[currentQuestion.id] === opt ? "white" : "var(--text-muted)",
                    fontSize: "0.9rem", marginRight: "1rem", fontWeight: 700, flexShrink: 0,
                  }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{
                    fontSize: "1.05rem",
                    color: answers[currentQuestion.id] === opt ? "#6366F1" : "var(--text-primary)",
                    fontWeight: answers[currentQuestion.id] === opt ? 600 : 400,
                  }}>
                    {opt}
                  </span>
                </div>
              ))}
            </div>
          ) : currentQuestion.question_type === "short_answer" ? (
            <textarea
              className="input"
              rows={5}
              value={answers[currentQuestion.id] || ""}
              onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
              placeholder="Type your answer here..."
              style={{ marginTop: "0.5rem", resize: "vertical", fontSize: "1.05rem", padding: "1.25rem" }}
            />
          ) : null}
        </div>
      )}

      {/* Navigation */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "1rem", paddingBottom: "4rem",
      }}>
        <button
          className="btn-secondary"
          onClick={() => setCurrentQ(prev => Math.max(0, prev - 1))}
          disabled={currentQ === 0}
          style={{ padding: "0.75rem 1.5rem", fontSize: "0.9rem" }}
        >
          ← Previous
        </button>

        {currentQ < totalQuestions - 1 ? (
          <button
            className="btn-primary"
            onClick={() => setCurrentQ(prev => Math.min(totalQuestions - 1, prev + 1))}
            style={{ padding: "0.75rem 1.5rem", fontSize: "0.9rem" }}
          >
            Next →
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => {
              const unanswered = totalQuestions - answeredCount;
              if (unanswered > 0) {
                setShowConfirmSubmit(true);
              } else {
                handleSubmit();
              }
            }}
            disabled={submitting}
            style={{
              padding: "0.75rem 2.5rem", fontSize: "1rem", fontWeight: 700,
              background: "linear-gradient(135deg, #6366F1, #A855F7)",
            }}
          >
            Submit Quiz
          </button>
        )}
      </div>

      {/* Confirm Submit Dialog */}
      {showConfirmSubmit && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="card animate-fade-in" style={{ padding: "2rem", maxWidth: 420, width: "90%", textAlign: "center" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(245,158,11,0.1)", color: "#F59E0B",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 1rem",
            }}>
              <SvgIcon name="alert-triangle" size={28} />
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>Unanswered Questions</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              You have <strong style={{ color: "#F59E0B" }}>{totalQuestions - answeredCount}</strong> unanswered question{totalQuestions - answeredCount > 1 ? "s" : ""}.
              Are you sure you want to submit?
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button className="btn-secondary" onClick={() => setShowConfirmSubmit(false)} style={{ padding: "0.6rem 1.5rem" }}>
                Go Back
              </button>
              <button className="btn-primary" onClick={() => { setShowConfirmSubmit(false); handleSubmit(); }} style={{ padding: "0.6rem 1.5rem" }}>
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
