"use client";

import { useState, useEffect } from "react";
import api, { StudentProgress, Course, StudentQuizHistory, StudentCoursePerformance, StudyRecommendation } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import Link from "next/link";
import { DashboardSkeleton } from "@/components/Skeleton";

export default function StudentDashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizHistory, setQuizHistory] = useState<StudentQuizHistory | null>(null);
  const [coursePerf, setCoursePerf] = useState<Record<number, StudentCoursePerformance>>({});
  const [recommendations, setRecommendations] = useState<StudyRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getStudentProgress(),
      api.getMyEnrolledCourses(),
      api.getStudentQuizHistory(),
      api.getStudentRecommendations().catch(() => []), // Fallback to empty if error
    ])
      .then(([progressData, coursesData, historyData, recsData]) => {
        setProgress(progressData);
        setCourses(coursesData);
        setQuizHistory(historyData);
        setRecommendations(recsData);

        // Fetch performance for each enrolled course
        Promise.all(
          coursesData.map((c: Course) => api.getStudentCoursePerformance(c.id).then(perf => ({ id: c.id, perf })))
        ).then(results => {
          const perfMap: Record<number, StudentCoursePerformance> = {};
          results.forEach(r => { perfMap[r.id] = r.perf; });
          setCoursePerf(perfMap);
        }).catch(() => {
          addToast("Could not load course performance data", "warning");
        });
      })
      .catch(() => {
        addToast("Failed to load dashboard data. Please refresh.", "error");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const firstName = user?.full_name?.split(" ")[0] || "Student";



  // Find most recent incomplete course for "Continue Learning"
  const incompleteCourse = courses.find(c => {
    const perf = coursePerf[c.id];
    return perf && perf.completion_percentage < 100;
  });

  // Analytics Logic Migration (from old Analytics page)
  const perfs = Object.values(coursePerf);
  const avgCompletion = perfs.length ? perfs.reduce((acc, p) => acc + p.completion_percentage, 0) / perfs.length : 0;
  
  const completedAttempts = quizHistory?.attempts.filter(a => a.completed_at) || [];
  const avgScore = completedAttempts.length 
    ? completedAttempts.reduce((acc, a) => acc + (a.percentage ?? 0), 0) / completedAttempts.length 
    : 0;

  const recentAttempts = [...completedAttempts].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()).slice(0, 5).reverse();

  // Aggregate data for action sections
  const allQuizzes = Object.values(coursePerf).flatMap(perf => perf.quiz_results || []);
  const unattemptedQuizzes = allQuizzes.filter(q => q?.status === "not_attempted" || q?.status === "in_progress");
  const lowScoreQuizzes = quizHistory?.attempts.filter(a => a.percentage < 60) || [];
  const lowProgressCourses = perfs.filter(p => p.completion_percentage < 50);

  return (
    <div style={{ paddingBottom: "3rem" }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <h1>Welcome back, {firstName}</h1>
        <p>Your personalized learning command center.</p>
      </div>

      {/* 1. Overview Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        {/* Core Metric: Course Progress */}
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(37,99,235,0.1)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name="target" size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Overall Progress</h3>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{avgCompletion.toFixed(0)}%</div>
            </div>
          </div>
          <div style={{ height: "8px", background: "var(--border-subtle)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${avgCompletion}%`, background: "var(--accent-primary)", borderRadius: "4px" }} />
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Average completion across {perfs.length} enrolled courses.
          </div>
        </div>

        {/* Core Metric: Assessment Score */}
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name="check-circle" size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Average Score</h3>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{avgScore.toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "30px", opacity: 0.8 }}>
            {recentAttempts.length > 0 ? recentAttempts.map((att, i) => (
              <div key={i} style={{ flex: 1, background: (att.percentage ?? 0) >= 70 ? "var(--success)" : (att.percentage ?? 0) >= 50 ? "var(--warning)" : "var(--error)", height: `${Math.max(10, att.percentage ?? 0)}%`, borderRadius: "4px 4px 0 0", minWidth: "12px", transition: "height 0.3s ease" }} title={`Score: ${(att.percentage ?? 0).toFixed(0)}%`} />
            )) : <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", alignSelf: "center" }}>No recent assessments</div>}
          </div>
          <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Based on {completedAttempts.length} completed assessments.
          </div>
        </div>

        {/* Activity Summary */}
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.1)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name="activity" size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Activity Summary</h3>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{progress?.courses_enrolled ?? 0} <span style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-muted)" }}>courses</span></div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="check-circle" size={14} /> Assessments Done</span>
              <span style={{ fontWeight: 600 }}>{progress?.quizzes_taken ?? 0}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}><SvgIcon name="clock" size={14} /> Pending Activities</span>
              <span style={{ fontWeight: 600, color: unattemptedQuizzes.length > 0 ? "var(--warning)" : "inherit" }}>{unattemptedQuizzes.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Current Focus (Wide Banner) */}
      <div style={{ marginBottom: "3rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}>Current Focus</h2>
        {incompleteCourse ? (
          <div className="card animate-fade-in" style={{ padding: "2rem", display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap", border: "1px solid var(--border-subtle)", background: "linear-gradient(to right, var(--bg-card), var(--bg-body))" }}>
            <div style={{ flex: "1 1 300px" }}>
              <div style={{ display: "inline-block", padding: "0.25rem 0.75rem", background: "var(--accent-primary-transparent)", color: "var(--accent-primary)", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
                Active Course
              </div>
              <h3 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
                {incompleteCourse.title}
              </h3>
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                {incompleteCourse.description ? (incompleteCourse.description.length > 120 ? incompleteCourse.description.slice(0, 120) + "…" : incompleteCourse.description) : "Resume your coursework and pick up where you left off."}
              </p>
            </div>
            
            <div style={{ flex: "1 1 300px", minWidth: "250px", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)" }}>
                <span>Course Progress</span>
                <span>{coursePerf[incompleteCourse.id]?.completion_percentage ?? 0}%</span>
              </div>
              <div style={{ height: "10px", borderRadius: "5px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: "5px",
                  width: (coursePerf[incompleteCourse.id]?.completion_percentage ?? 0) + "%",
                  background: "var(--accent-primary)",
                  transition: "width 0.8s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <Link
                  href={`/dashboard/student/courses/${incompleteCourse.id}`}
                  className="btn-primary"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                >
                  Continue Learning
                  <SvgIcon name="arrow-right" size={16} />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="card empty-state" style={{ padding: "3rem", background: "var(--bg-card)" }}>
            <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
            <div className="empty-state-title" style={{ fontSize: "1.25rem" }}>You're all caught up!</div>
            <div className="empty-state-desc">Ready to learn something new? Browse the course catalog.</div>
            <Link href="/dashboard/student/browse" className="btn-primary" style={{ textDecoration: "none", marginTop: "1.5rem" }}>
              Browse Courses
            </Link>
          </div>
        )}
      </div>

      {/* 3. Action Center (2 Column Grid) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }}>
        
        {/* Pending Assessments */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <SvgIcon name="edit" size={20} style={{ color: "var(--accent-primary)" }} />
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Pending Assessments</h2>
          </div>
          
          {unattemptedQuizzes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {unattemptedQuizzes.slice(0, 4).map(q => (
                <div key={q.quiz_id} className="card animate-fade-in" style={{ padding: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "3px solid var(--accent-primary)" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem", marginBottom: "0.25rem" }}>{q.quiz_title}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {q.status === "in_progress" ? "In progress — continue where you left off" : "Assessment required for progress"}
                    </div>
                  </div>
                  <Link href={`/dashboard/student/quizzes/${q.quiz_id}`} className="btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                    {q.status === "in_progress" ? "Continue" : "Start Quiz"}
                  </Link>
                </div>
              ))}
              {unattemptedQuizzes.length > 4 && (
                <Link href="/dashboard/student/quizzes" style={{ fontSize: "0.85rem", color: "var(--accent-primary)", textAlign: "center", display: "block", marginTop: "0.5rem", textDecoration: "none", fontWeight: 500 }}>
                  View all {unattemptedQuizzes.length} pending activities →
                </Link>
              )}
            </div>
          ) : (
            <div className="card empty-state" style={{ padding: "2rem" }}>
              <SvgIcon name="check-circle" className="empty-state-icon" style={{ opacity: 0.3, fontSize: "2rem" }} />
              <div className="empty-state-title" style={{ fontSize: "1rem" }}>No pending activities</div>
              <div className="empty-state-desc" style={{ fontSize: "0.85rem" }}>You have completed all assigned assessments.</div>
            </div>
          )}
        </section>

        {/* Needs Attention & Recommendations */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <SvgIcon name="bell" size={20} style={{ color: "var(--warning)" }} />
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Needs Attention</h2>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {recommendations && recommendations.length > 0 && recommendations.slice(0, 2).map((rec) => (
              <div key={rec.id} className="card animate-fade-in" style={{ padding: "1.25rem", borderLeft: "3px solid var(--ai-accent)" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <SvgIcon name="sparkle" size={14} style={{ color: "var(--ai-accent)" }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--ai-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Suggestion</span>
                </div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
                  {rec.lesson_title}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1rem", lineHeight: 1.5 }}>
                  {rec.ai_tip}
                </p>
                <Link href={`/dashboard/student/courses/${rec.course_id}/lessons/${rec.lesson_id}`} className="btn-secondary btn-sm" style={{ textDecoration: "none", display: "inline-flex" }}>
                  Review Material
                </Link>
              </div>
            ))}

            {lowScoreQuizzes.length > 0 && (
              <div className="card animate-fade-in" style={{ padding: "1.25rem", borderLeft: "3px solid var(--error)" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <SvgIcon name="alert-circle" size={14} style={{ color: "var(--error)" }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--error)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Low Score</span>
                </div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
                  {lowScoreQuizzes[0].quiz_title}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
                  You scored {lowScoreQuizzes[0].percentage}%. Consider reviewing this topic to improve mastery.
                </p>
                <Link href={`/dashboard/student/quizzes/${lowScoreQuizzes[0].quiz_id}`} className="btn-secondary btn-sm" style={{ textDecoration: "none", display: "inline-flex" }}>
                  Review Assessment
                </Link>
              </div>
            )}

            {lowProgressCourses.length > 0 && (
              <div className="card animate-fade-in" style={{ padding: "1.25rem", borderLeft: "3px solid var(--warning)" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                  <SvgIcon name="activity" size={14} style={{ color: "var(--warning)" }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--warning)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Action Required</span>
                </div>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
                  {lowProgressCourses[0].course_title || "Enrolled Course"}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
                  Your progress is currently at {lowProgressCourses[0].completion_percentage}%. Please review the latest materials to stay on track.
                </p>
                <Link href={`/dashboard/student/courses/${lowProgressCourses[0].course_id}`} className="btn-secondary btn-sm" style={{ textDecoration: "none", display: "inline-flex" }}>
                  Continue Learning
                </Link>
              </div>
            )}

            {(!recommendations || recommendations.length === 0) && lowScoreQuizzes.length === 0 && lowProgressCourses.length === 0 && (
              <div className="card empty-state" style={{ padding: "2rem" }}>
                <SvgIcon name="shield" className="empty-state-icon" style={{ opacity: 0.3, fontSize: "2rem" }} />
                <div className="empty-state-title" style={{ fontSize: "1rem" }}>Looking good!</div>
                <div className="empty-state-desc" style={{ fontSize: "0.85rem" }}>You have no urgent alerts or AI suggestions right now.</div>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* 4. Course Performance Breakdown */}
      <div style={{ marginTop: "3rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}>Course Breakdown</h2>
        {perfs.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-card-hover)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Course</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assessments</th>
                  <th style={{ padding: "1rem 1.5rem", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Questions Asked</th>
                </tr>
              </thead>
              <tbody>
                {perfs.map((perf, i) => {
                  const quizzesDone = perf.completed_quizzes;
                  const quizzesTotal = perf.total_quizzes;
                  const questionsAsked = perf.questions_asked;
                  
                  return (
                    <tr key={i} style={{ borderBottom: i < perfs.length - 1 ? "1px solid var(--border-subtle)" : "none", transition: "background 0.2s ease" }} className="hover-bg-subtle">
                      <td style={{ padding: "1.25rem 1.5rem", fontWeight: 500, color: "var(--text-primary)" }}>
                        {perf.course_title}
                      </td>
                      <td style={{ padding: "1.25rem 1.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div style={{ flex: 1, height: "6px", background: "var(--border-subtle)", borderRadius: "3px", minWidth: "100px" }}>
                            <div style={{ width: `${perf.completion_percentage}%`, height: "100%", background: perf.completion_percentage === 100 ? "var(--success)" : "var(--accent-primary)", borderRadius: "3px" }} />
                          </div>
                          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "40px" }}>{perf.completion_percentage.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        {quizzesDone} / {quizzesTotal}
                      </td>
                      <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        {questionsAsked}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card empty-state" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            <SvgIcon name="book" className="empty-state-icon" style={{ opacity: 0.3 }} />
            <div className="empty-state-title" style={{ fontSize: "1.1rem", marginTop: "1rem" }}>No course data available yet.</div>
          </div>
        )}
      </div>

    </div>
  );
}
