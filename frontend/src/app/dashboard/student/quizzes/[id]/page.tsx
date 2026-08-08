"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import api, { QuizDetail, QuizAttempt } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { SvgIcon, IconName } from "@/components/SvgIcon";

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

  // Helper to safely parse UTC date strings from backend
  const parseUtcDate = (dateVal: string | Date | null | undefined): Date | null => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return dateVal;
    const dateStr = String(dateVal);
    const isoStr = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
    return new Date(isoStr);
  };

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
        const parsedDeadline = parseUtcDate(inProgress.deadline_at);
        const isExpired = parsedDeadline && parsedDeadline.getTime() <= Date.now();
        if (!isExpired) {
          setAttemptId(inProgress.id);
          if (parsedDeadline) {
            setDeadlineAt(parsedDeadline);
          }
          startTimeRef.current = parseUtcDate(inProgress.started_at) || new Date();
          setSessionState("taking");
          return;
        }
      }

      const finishedAttempts = atts.filter((a) => a.completed_at || a.status === "submitted" || a.status === "auto_closed");
      const attemptsUsed = finishedAttempts.length;
      const canRetake = attemptsUsed < (q.max_attempts ?? 1);

      if (finishedAttempts.length > 0 && !canRetake) {
        api.getAttemptDetail(quizId, finishedAttempts[0].id)
          .then((detail) => setResult(detail as any))
          .catch(() => setResult(finishedAttempts[0]));
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
        setDeadlineAt(parseUtcDate(attempt.deadline_at));
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
      
      try {
        const detail = await api.getAttemptDetail(quizId, attempt.id);
        setResult(detail as any);
      } catch {
        setResult(attempt);
      }
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
  // QUIZ AVAILABILITY CALCULATIONS
  // ═══════════════════════════════════════════════════
  const now = new Date();
  const availableFrom = quiz.available_from ? new Date(quiz.available_from + "Z") : null;
  const availableUntil = quiz.available_until ? new Date(quiz.available_until + "Z") : null;
  
  const isTooEarly = availableFrom && now < availableFrom;
  const isTooLate = availableUntil && now > availableUntil;
  const finishedCount = attempts.filter((a) => a.completed_at).length;
  const maxAttempts = quiz.max_attempts ?? 1;
  const attemptsLeft = Math.max(0, maxAttempts - finishedCount);
  const canStart = !isTooEarly && !isTooLate && attemptsLeft > 0;

  // ═══════════════════════════════════════════════════
  // AVAILABLE SCREEN (Pre-quiz)
  // ═══════════════════════════════════════════════════
  if (sessionState === "available") {
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
  // REVIEW SCREEN (Modernized Dashboard Design System)
  // ═══════════════════════════════════════════════════
  if (sessionState === "review" && result) {
    const pct = result.percentage ?? 0;
    const scoreColor = pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#F43F5E";
    const totalQ = sortedQuestions.length;
    const correctCount = result.answers?.filter(a => a.is_correct === true).length ?? 0;
    const incorrectCount = result.answers?.filter(a => a.is_correct === false).length ?? 0;
    const pendingAnswers = result.answers?.filter(a => a.is_correct === null || a.is_correct === undefined) ?? [];
    const pendingCount = pendingAnswers.length;
    
    // Calculate points and potential max score
    const pendingPoints = pendingAnswers.reduce((acc, a) => acc + (a.max_points ?? 1), 0);
    const totalPts = result.total_points || 1;
    const confirmedScore = result.score ?? 0;
    const confirmedPct = Math.min(100, Math.round((confirmedScore / totalPts) * 100));
    const maxPotentialScore = Math.min(100, Math.round(((confirmedScore + pendingPoints) / totalPts) * 100));

    // SVG Donut Math (Radius R = 54, Circumference C = 2 * PI * 54 = 339.29)
    const R = 54;
    const C = 2 * Math.PI * R;
    const confirmedStrokeDash = (confirmedPct / 100) * C;
    const potentialStrokeDash = ((maxPotentialScore - confirmedPct) / 100) * C;

    return (
      <div className="animate-fade-in" style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "4rem" }}>
        {/* Score Hero Card */}
        <div className="card shadow-sm" style={{
          textAlign: "center", padding: "2.5rem 2rem 2rem",
          marginBottom: "1.5rem", position: "relative",
          background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)", overflow: "hidden",
        }}>
          <SvgIcon name="award" size={42} style={{ color: scoreColor, marginBottom: "0.5rem" }} />
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            {pct >= 70 ? "Great Job!" : pct >= 50 ? "Good Effort!" : "Keep Practicing!"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
            {quiz.title}
          </p>

          {/* Dual-State SVG Donut Chart */}
          <div style={{ width: 160, height: 160, margin: "0 auto 1.75rem", position: "relative" }}>
            <svg width="160" height="160" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
              {/* Track */}
              <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border-subtle)" strokeWidth="12" />
              
              {/* Confirmed Score Arc (Solid) */}
              <circle
                cx="70" cy="70" r={R} fill="none"
                stroke={scoreColor} strokeWidth="12"
                strokeDasharray={`${confirmedStrokeDash} ${C}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
              />

              {/* Potential Max Score Arc (Translucent/Dashed) */}
              {pendingCount > 0 && maxPotentialScore > confirmedPct && (
                <circle
                  cx="70" cy="70" r={R} fill="none"
                  stroke="#F59E0B" strokeWidth="12" strokeDasharray="5 3"
                  strokeDashoffset={-confirmedStrokeDash}
                  strokeOpacity="0.75"
                />
              )}
            </svg>

            {/* Inner Content */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                {pct.toFixed(0)}%
              </div>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
                {pendingCount > 0 ? "Confirmed Score" : "Final Score"}
              </div>
              {pendingCount > 0 && (
                <div style={{
                  fontSize: "0.65rem", fontWeight: 700, color: "#D97706",
                  background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: 10, marginTop: 4
                }}>
                  Up to {maxPotentialScore}%
                </div>
              )}
            </div>
          </div>

          {/* Horizontally-Segmented Metric Bar */}
          <div className="card shadow-sm" style={{
            display: "grid",
            gridTemplateColumns: pendingCount > 0 ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
            padding: 0, overflow: "hidden",
            border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
            maxWidth: 680, margin: "0 auto"
          }}>
            <div style={{ padding: "0.9rem", textAlign: "center", borderRight: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--accent-primary)" }}>{result.score ?? 0}/{result.total_points ?? 0}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Points Earned</div>
            </div>
            <div style={{ padding: "0.9rem", textAlign: "center", borderRight: "1px solid var(--border-subtle)", background: "rgba(16,185,129,0.02)" }}>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#10B981" }}>{correctCount}</div>
              <div style={{ fontSize: "0.68rem", color: "#059669", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Correct</div>
            </div>
            <div style={{ padding: "0.9rem", textAlign: "center", borderRight: pendingCount > 0 ? "1px solid var(--border-subtle)" : "none", background: "rgba(244,63,94,0.02)" }}>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#F43F5E" }}>{incorrectCount}</div>
              <div style={{ fontSize: "0.68rem", color: "#E11D48", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Incorrect</div>
            </div>
            {pendingCount > 0 && (
              <div style={{ padding: "0.9rem", textAlign: "center", background: "rgba(245,158,11,0.03)" }}>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#F59E0B" }}>{pendingCount}</div>
                <div style={{ fontSize: "0.68rem", color: "#D97706", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending Review</div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Evaluation Notice Card */}
        {pendingCount > 0 && (
          <div className="card shadow-sm animate-fade-in" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "10px", background: "rgba(245,158,11,0.12)", color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SvgIcon name="clock" size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Teacher Manual Evaluation Pending ({pendingCount} Short-Answer Question{pendingCount > 1 ? "s" : ""})
                </h4>
                <p style={{ margin: "2px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Your confirmed auto-graded score is <strong>{result.score ?? 0} / {result.total_points ?? 0} pts ({pct.toFixed(0)}%)</strong>. Your score will automatically update up to <strong>{maxPotentialScore}%</strong> once your teacher evaluates your written answer{pendingCount > 1 ? "s" : ""}.
                </p>
              </div>
            </div>
            <span className="badge" style={{ background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)", fontSize: "0.75rem", flexShrink: 0, marginLeft: "1rem" }}>
              Up to {maxPotentialScore}% Max
            </span>
          </div>
        )}

        {/* 2-Column Review Layout Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
          {/* Left Main Feed: Question Review Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Detailed Question Review
            </h2>
            
            {sortedQuestions.map((q, index) => {
              const studentAns = result.answers?.find(a => (a.question_version_id ?? a.question_id) === q.id);
              const isCorrect = studentAns?.is_correct;
              const isPending = isCorrect === null || isCorrect === undefined;

              // Soft Color Themes matching Student Dashboard
              const borderColor = isPending ? "#F59E0B" : isCorrect ? "#10B981" : "#F43F5E";
              const themeBg = isPending ? "rgba(245,158,11,0.06)" : isCorrect ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)";
              const themeText = isPending ? "#D97706" : isCorrect ? "#059669" : "#E11D48";
              const themeBorder = isPending ? "rgba(245,158,11,0.3)" : isCorrect ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)";
              const statusIcon: IconName = isCorrect ? "check-circle" : isPending ? "alert-triangle" : "alert-circle";

              return (
                <div id={`question-${q.id}`} key={q.id} className="card shadow-sm" style={{
                  border: "1px solid var(--border-subtle)", padding: "1.5rem",
                  transition: "transform 0.15s ease", scrollMarginTop: "2rem"
                }}>
                  {/* Question Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: themeBg, color: themeText,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.8rem", fontWeight: 800,
                      }}>{index + 1}</span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {q.question_type.replace("_", " ")}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      {studentAns?.is_overridden && (
                        <span className="badge" style={{ background: "rgba(124,58,237,0.1)", color: "#7C3AED", fontSize: "0.7rem" }}>Reviewed</span>
                      )}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "0.35rem",
                        padding: "0.25rem 0.65rem", borderRadius: "9999px",
                        background: themeBg, color: themeText, border: `1px solid ${themeBorder}`,
                        fontSize: "0.75rem", fontWeight: 700
                      }}>
                        <SvgIcon name={statusIcon} size={14} />
                        {isCorrect ? "Correct" : isPending ? "Pending Review" : "Incorrect"} ({studentAns?.points_earned ?? 0}/{q.points} pts)
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    {q.question_type === "true_false" && q.question_text.match(/^True\s*or\s*False:\s*/i) && (
                      <span style={{ display: "block", color: "var(--accent-primary)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.3rem" }}>
                        True or False
                      </span>
                    )}
                    <div style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "var(--text-primary)", fontWeight: 500 }}>
                      {q.question_text.replace(/^True\s*or\s*False:\s*/i, '')}
                    </div>
                  </div>

                  {/* MCQ / True-False Options */}
                  {(q.question_type === "mcq" || q.question_type === "true_false") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      {(q.question_type === "true_false" ? ["True", "False"] : q.options || []).map((opt, i) => {
                        const isStudentAnswer = opt === studentAns?.student_answer;
                        const isCorrectAnswer = opt === studentAns?.correct_answer;
                        let bg = "var(--bg-body)";
                        let border = "1px solid var(--border-subtle)";
                        let color = "var(--text-primary)";
                        if (isCorrectAnswer) { bg = "rgba(16,185,129,0.06)"; border = "1px solid rgba(16,185,129,0.3)"; color = "#059669"; }
                        else if (isStudentAnswer && !isCorrect) { bg = "rgba(244,63,94,0.06)"; border = "1px solid rgba(244,63,94,0.3)"; color = "#BE123C"; }

                        return (
                          <div key={i} style={{
                            padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)",
                            background: bg, border, color,
                            display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9rem",
                          }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: "50%",
                              background: isCorrectAnswer ? "#10B981" : isStudentAnswer && !isCorrect ? "#F43F5E" : "var(--border)",
                              color: (isCorrectAnswer || (isStudentAnswer && !isCorrect)) ? "white" : "var(--text-muted)",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                            }}>
                              {isCorrectAnswer ? "✓" : isStudentAnswer && !isCorrect ? "✕" : String.fromCharCode(65 + i)}
                            </span>
                            <span style={{ flex: 1 }}>{opt}</span>
                            {isStudentAnswer && <span style={{ fontSize: "0.7rem", fontWeight: 700, opacity: 0.85 }}>Your answer</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer */}
                  {q.question_type === "short_answer" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.3rem" }}>Your Answer</div>
                        <div style={{ padding: "0.75rem", background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
                          {studentAns?.student_answer ? (
                            <span style={{ color: "var(--text-primary)" }}>{studentAns.student_answer}</span>
                          ) : (
                            <em style={{ color: "var(--text-muted)" }}>No answer provided</em>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.3rem" }}>Expected Answer</div>
                        <div style={{ padding: "0.75rem", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", color: "#059669" }}>
                          {studentAns?.correct_answer || q.correct_answer || "Instructor/AI Evaluation"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Teacher Feedback Note */}
                  {studentAns?.teacher_note && (
                    <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.15)", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ fontWeight: 700, color: "#7C3AED", fontSize: "0.75rem" }}>Teacher Feedback: </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{studentAns.teacher_note}</span>
                    </div>
                  )}

                  {/* Question Action Bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      {studentAns?.is_correct === false && !studentAns?.teacher_note && (
                        studentAns?.is_flagged ? (
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#D97706", background: "rgba(245,158,11,0.1)", padding: "4px 10px", borderRadius: 6 }}>
                            Flagged for Teacher Review
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
                        )
                      )}
                    </div>

                    {(() => {
                      const studentSelected = studentAns?.student_answer || "no answer selected";
                      const correctAnswer = studentAns?.correct_answer || q.correct_answer || "instructor evaluation";
                      const qPrompt = `Can you explain why the correct answer to: "${q.question_text}" is "${correctAnswer}"? My answer was: "${studentSelected}".`;
                      const cidParam = quiz?.course_id ? `&courseId=${quiz.course_id}` : "";
                      return (
                        <Link
                          href={`/dashboard/student/ask?initialQuestion=${encodeURIComponent(qPrompt)}${cidParam}`}
                          className="btn-secondary btn-sm"
                          style={{
                            textDecoration: "none", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem",
                            background: "rgba(124, 58, 237, 0.06)", border: "1px solid rgba(124, 58, 237, 0.2)", color: "#7C3AED", fontWeight: 600
                          }}
                        >
                          <SvgIcon name="sparkle" size={14} style={{ color: "#7C3AED" }} />
                          Ask AI Tutor About This Question
                        </Link>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Sticky Contextual Sidebar & AI Trigger */}
          <div style={{ position: "sticky", top: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", height: "fit-content" }}>
            
            {/* Primary Action: Ask AI Tutor About Full Quiz */}
            <div className="card shadow-sm" style={{ padding: "1.25rem", textAlign: "center", border: "1px solid rgba(124, 58, 237, 0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 700, color: "#7C3AED", marginBottom: "0.5rem" }}>
                <SvgIcon name="sparkle" size={16} />
                <span>AI Tutor Integration</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 1rem 0", lineHeight: 1.4 }}>
                Get an instant personalized study plan & conceptual breakdowns based on this quiz result.
              </p>
              {(() => {
                const scorePct = result?.percentage ?? 0;
                const fullQuizPrompt = `Can you help me review my performance on the quiz "${quiz?.title}"? My score was ${scorePct.toFixed(0)}%. What key concepts should I focus on studying next?`;
                const cidParam = quiz?.course_id ? `&courseId=${quiz.course_id}` : "";
                return (
                  <Link
                    href={`/dashboard/student/ask?initialQuestion=${encodeURIComponent(fullQuizPrompt)}${cidParam}`}
                    className="btn-primary"
                    style={{
                      textDecoration: "none", width: "100%", justifyContent: "center", display: "inline-flex",
                      alignItems: "center", gap: "0.5rem", padding: "0.75rem", fontSize: "0.875rem", fontWeight: 700,
                      background: "linear-gradient(135deg, #7C3AED, #6366F1)",
                      boxShadow: "0 4px 12px rgba(124, 58, 237, 0.25)"
                    }}
                  >
                    <SvgIcon name="sparkle" size={16} style={{ color: "#FDE047" }} />
                    Ask AI Tutor About Full Quiz
                  </Link>
                );
              })()}
            </div>

            {/* Question Review Index Palette */}
            <div className="card shadow-sm" style={{ padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 800, margin: "0 0 0.4rem 0", color: "var(--text-primary)" }}>
                Question Review Index
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>
                Click any number to jump directly to that question.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
                {sortedQuestions.map((q, idx) => {
                  const studentAns = result.answers?.find(a => (a.question_version_id ?? a.question_id) === q.id);
                  const isCorrect = studentAns?.is_correct;
                  const isPending = isCorrect === null || isCorrect === undefined;
                  
                  const btnBg = isCorrect ? "rgba(16,185,129,0.12)" : isPending ? "rgba(245,158,11,0.12)" : "rgba(244,63,94,0.12)";
                  const btnBorder = isCorrect ? "#10B981" : isPending ? "#F59E0B" : "#F43F5E";
                  const btnColor = isCorrect ? "#059669" : isPending ? "#D97706" : "#BE123C";
                  const symbol = isCorrect ? "✓" : isPending ? "!" : "✕";

                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        const el = document.getElementById(`question-${q.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      style={{
                        height: "36px", borderRadius: "var(--radius-sm)",
                        background: btnBg, border: `1.5px solid ${btnBorder}`, color: btnColor,
                        fontSize: "0.78rem", fontWeight: 800, cursor: "pointer",
                        transition: "all 0.15s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "2px"
                      }}
                    >
                      <span>{idx + 1}</span>
                      <span style={{ fontSize: "0.65rem", opacity: 0.85 }}>{symbol}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation Options Card */}
            <div className="card shadow-sm" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {canStart && (
                <button
                  onClick={startQuiz}
                  className="btn-secondary"
                  style={{ width: "100%", justifyContent: "center", padding: "0.65rem", fontSize: "0.85rem", fontWeight: 700 }}
                >
                  Retake Quiz
                </button>
              )}
              <Link
                href="/dashboard/student"
                className="btn-secondary"
                style={{ textDecoration: "none", width: "100%", justifyContent: "center", padding: "0.65rem", fontSize: "0.85rem", fontWeight: 600, display: "inline-flex" }}
              >
                Back to Dashboard
              </Link>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // TAKING SCREEN (Full Width 1280px 2-Column Grid)
  // ═══════════════════════════════════════════════════
  const currentQuestion = sortedQuestions[currentQ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: "1280px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* 2-Column Responsive Workspace Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
        
        {/* Left Column: Question Card & Answer Workspace */}
        <div>
          {currentQuestion && (
            <div className="card animate-fade-in" style={{ padding: "2rem", marginBottom: "1.5rem", position: "relative" }} key={currentQuestion.id}>
              {/* Question Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "var(--accent-primary)", color: "white",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.875rem", fontWeight: 700,
                  }}>
                    {currentQ + 1}
                  </span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Question {currentQ + 1} of {totalQuestions}
                  </span>
                </div>
                <span className="badge badge-info" style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}>
                  {currentQuestion.points} pt{currentQuestion.points > 1 ? "s" : ""}
                </span>
              </div>

              {/* Question Text */}
              <div style={{ marginBottom: "2rem" }}>
                {currentQuestion.question_type === "true_false" && currentQuestion.question_text.match(/^True\s*or\s*False:\s*/i) && (
                  <span style={{ display: "block", color: "var(--accent-primary)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                    True or False
                  </span>
                )}
                <div style={{ fontSize: "1.2rem", lineHeight: 1.7, color: "var(--text-primary)", fontWeight: 500 }}>
                  {currentQuestion.question_text.replace(/^True\s*or\s*False:\s*/i, '')}
                </div>
              </div>

              {/* Option Selector / Answer Input */}
              {currentQuestion.question_type === "true_false" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  {["True", "False"].map((opt, i) => {
                    const isSelected = answers[currentQuestion.id] === opt;
                    return (
                      <div
                        key={opt}
                        onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                        style={{
                          padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)",
                          border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                          background: isSelected ? "rgba(37,99,235,0.06)" : "var(--bg-card)",
                          cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                          fontWeight: 700, fontSize: "1.1rem",
                          color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{opt}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>[{i === 0 ? "T" : "F"}]</span>
                      </div>
                    );
                  })}
                </div>
              ) : currentQuestion.question_type === "mcq" && currentQuestion.options ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {currentQuestion.options.map((opt, i) => {
                    const isSelected = answers[currentQuestion.id] === opt;
                    return (
                      <div
                        key={i}
                        onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                        style={{
                          padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)",
                          border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                          background: isSelected ? "rgba(37,99,235,0.06)" : "var(--bg-card)",
                          cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{
                          width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
                          borderRadius: "50%",
                          background: isSelected ? "var(--accent-primary)" : "var(--bg-tertiary)",
                          color: isSelected ? "white" : "var(--text-muted)",
                          fontSize: "0.9rem", marginRight: "1rem", fontWeight: 700, flexShrink: 0,
                        }}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span style={{
                          fontSize: "1.05rem", flex: 1,
                          color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                          fontWeight: isSelected ? 600 : 400,
                        }}>
                          {opt}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : currentQuestion.question_type === "short_answer" ? (
                <textarea
                  className="input"
                  rows={5}
                  value={answers[currentQuestion.id] || ""}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                  placeholder="Type your written answer here..."
                  style={{ marginTop: "0.5rem", resize: "vertical", fontSize: "1.05rem", padding: "1.25rem" }}
                />
              ) : null}
            </div>
          )}

          {/* Navigation Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              className="btn-secondary"
              onClick={() => setCurrentQ(prev => Math.max(0, prev - 1))}
              disabled={currentQ === 0}
              style={{ padding: "0.75rem 1.75rem", fontSize: "0.9rem" }}
            >
              &larr; Previous Question
            </button>

            {currentQ < totalQuestions - 1 ? (
              <button
                className="btn-primary"
                onClick={() => setCurrentQ(prev => Math.min(totalQuestions - 1, prev + 1))}
                style={{ padding: "0.75rem 2rem", fontSize: "0.9rem" }}
              >
                Next Question &rarr;
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
                style={{ padding: "0.75rem 2.5rem", fontSize: "1rem", fontWeight: 700 }}
              >
                {submitting ? "Submitting..." : "Submit Quiz"}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Question Navigator & Timer Sidebar */}
        <div style={{ position: "sticky", top: "1rem", display: "flex", flexDirection: "column", gap: "1.25rem", height: "fit-content" }}>
          {/* Progress & Timer Card */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
              Quiz Progress
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {answeredCount} / {totalQuestions}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {progressPct.toFixed(0)}% Done
              </span>
            </div>
            <div style={{ height: 6, background: "var(--border-subtle)", borderRadius: 3, overflow: "hidden", marginBottom: "1.25rem" }}>
              <div style={{ height: "100%", background: "var(--accent-primary)", width: `${progressPct}%`, transition: "width 0.3s ease" }} />
            </div>

            {/* Timer Box */}
            <div style={{
              padding: "0.85rem 1rem", borderRadius: "var(--radius-md)",
              background: timeLeft !== null && timeLeft < 60 ? "rgba(239,68,68,0.08)" : timeLeft !== null && timeLeft < 300 ? "rgba(245,158,11,0.08)" : "var(--bg-tertiary)",
              border: `1px solid ${timeLeft !== null && timeLeft < 60 ? "rgba(239,68,68,0.2)" : timeLeft !== null && timeLeft < 300 ? "rgba(245,158,11,0.2)" : "var(--border-subtle)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <SvgIcon name="clock" size={18} style={{ color: timeLeft !== null && timeLeft < 60 ? "#EF4444" : timeLeft !== null && timeLeft < 300 ? "#F59E0B" : "var(--accent-primary)" }} />
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  {timeLeft !== null ? "Time Remaining" : "Time Elapsed"}
                </span>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 700, color: timeLeft !== null && timeLeft < 60 ? "#EF4444" : timeLeft !== null && timeLeft < 300 ? "#F59E0B" : "var(--text-primary)" }}>
                {timeLeft !== null ? formatTime(timeLeft) : formatTime(elapsedTime)}
              </span>
            </div>
          </div>

          {/* Question Navigator Grid */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
              Question Navigator
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
              {sortedQuestions.map((q, i) => {
                const isAnswered = !!answers[q.id]?.trim();
                const isCurrent = i === currentQ;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQ(i)}
                    style={{
                      height: "36px", borderRadius: "var(--radius-sm)",
                      border: isCurrent ? "2px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                      background: isCurrent ? "var(--accent-primary)" : isAnswered ? "rgba(37,99,235,0.12)" : "var(--bg-tertiary)",
                      color: isCurrent ? "white" : isAnswered ? "var(--accent-primary)" : "var(--text-muted)",
                      fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Trigger */}
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
            style={{ width: "100%", justifyContent: "center", padding: "0.85rem", fontSize: "0.95rem", fontWeight: 700 }}
          >
            {submitting ? "Submitting..." : "Submit Quiz"}
          </button>
        </div>
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
