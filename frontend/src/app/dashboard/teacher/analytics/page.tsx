"use client";

import { useState, useEffect } from "react";
import api, { Course, CourseAnalytics, QuizBreakdown, CourseEngagement } from "@/lib/api";
import BarChart from "@/components/charts/BarChart";
import DoughnutChart from "@/components/charts/DoughnutChart";
import { SvgIcon } from "@/components/SvgIcon";
import { useRouter } from "next/navigation";

export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [analytics, setAnalytics] = useState<CourseAnalytics[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [quizBreakdown, setQuizBreakdown] = useState<QuizBreakdown | null>(null);
  const [engagement, setEngagement] = useState<CourseEngagement | null>(null);
  const [aiInsights, setAiInsights] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCourses(), api.getTeacherCourseAnalytics()])
      .then(([c, a]) => {
        setCourses(c);
        setAnalytics(a);
        if (c.length > 0) setSelectedCourse(c[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      Promise.all([
        api.getCourseQuizBreakdown(selectedCourse),
        api.getCourseEngagement(selectedCourse),
        api.getTeacherAIInsights(selectedCourse),
      ])
        .then(([qb, eng, ai]) => { setQuizBreakdown(qb); setEngagement(eng); setAiInsights(ai); })
        .catch(console.error);
    }
  }, [selectedCourse]);

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  const currentAnalytics = analytics.find(a => a.course_id === selectedCourse);

  const engColors: Record<string, { bg: string; text: string }> = {
    high: { bg: "rgba(16,185,129,0.08)", text: "#10B981" },
    medium: { bg: "rgba(245,158,11,0.08)", text: "#F59E0B" },
    low: { bg: "rgba(239,68,68,0.08)", text: "#EF4444" },
  };

  return (
    <div>
      {/* Header with Course Selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Learning Analytics</h1>
          <p>Deep-dive into course performance, quiz scores, and student engagement</p>
        </div>
        {courses.length > 1 && (
          <select
            value={selectedCourse || ""}
            onChange={(e) => setSelectedCourse(Number(e.target.value))}
            className="form-select"
            style={{ maxWidth: "280px", fontSize: "0.85rem" }}
          >
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      {/* Course Summary Cards */}
      {currentAnalytics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
          {[
            { icon: "users" as const, label: "Enrolled Students", value: currentAnalytics.total_students, color: "#2563EB" },
            { icon: "bar-chart" as const, label: "Average Quiz Score", value: currentAnalytics.average_quiz_score != null ? currentAnalytics.average_quiz_score + "%" : "N/A", color: "#10B981" },
            { icon: "message-circle" as const, label: "AI Questions Asked", value: currentAnalytics.total_questions_asked, color: "#8B5CF6" },
          ].map((card) => (
            <div key={card.label} className="stat-card-compact animate-fade-in">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: card.color + "12" }}>
                <SvgIcon name={card.icon} size={18} style={{ color: card.color }} />
              </span>
              <div>
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Quiz Score Distribution Chart */}
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Quiz Score Distribution</h2>
          {quizBreakdown && quizBreakdown.quizzes.length > 0 ? (
            <BarChart
              labels={quizBreakdown.quizzes.map(q => q.quiz_title.length > 15 ? q.quiz_title.slice(0, 15) + "…" : q.quiz_title)}
              datasets={[
                { label: "Avg Score (%)", data: quizBreakdown.quizzes.map(q => q.average_score || 0), backgroundColor: "rgba(37, 99, 235, 0.6)" },
                { label: "Highest (%)", data: quizBreakdown.quizzes.map(q => q.highest_score || 0), backgroundColor: "rgba(16, 185, 129, 0.6)" },
                { label: "Lowest (%)", data: quizBreakdown.quizzes.map(q => q.lowest_score || 0), backgroundColor: "rgba(239, 68, 68, 0.6)" },
              ]}
            />
          ) : (
            <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>No quiz data. Create and publish quizzes to see analytics.</div>
          )}
        </div>

        {/* Engagement Chart */}
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Engagement Levels</h2>
          {engagement && engagement.total_students > 0 ? (
            <DoughnutChart
              labels={["High Engagement", "Medium Engagement", "Low Engagement"]}
              data={[engagement.engagement_summary.high, engagement.engagement_summary.medium, engagement.engagement_summary.low]}
              colors={["rgba(16, 185, 129, 0.8)", "rgba(245, 158, 11, 0.8)", "rgba(239, 68, 68, 0.8)"]}
              centerLabel={`${engagement.total_students} Students`}
            />
          ) : (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>No students enrolled</div>
          )}
        </div>
      </div>

      {/* Detailed Student Performance Table */}
      <div className="card animate-fade-in" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Student Performance Details</h2>
        {engagement && engagement.students.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th style={{ textAlign: "center" }}>Quizzes</th>
                  <th style={{ textAlign: "center" }}>Avg Score</th>
                  <th style={{ textAlign: "center" }}>AI Questions</th>
                  <th style={{ textAlign: "center" }}>Engagement</th>
                  <th style={{ textAlign: "right" }}>Enrolled</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {engagement.students.map((s) => {
                  const level = engColors[s.engagement_level] || engColors.medium;
                  return (
                    <tr
                      key={s.student_id}
                      onClick={() => router.push(`/dashboard/teacher/analytics/student/${s.student_id}?courseId=${selectedCourse}&name=${encodeURIComponent(s.student_name)}`)}
                      style={{ cursor: "pointer", transition: "background 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={{ fontWeight: 500 }}>{s.student_name}</td>
                      <td style={{ textAlign: "center" }}>{s.quizzes_taken}</td>
                      <td style={{ textAlign: "center" }}>
                        {s.average_score != null ? (
                          <span style={{
                            background: s.average_score >= 60 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                            color: s.average_score >= 60 ? "#10B981" : "#EF4444",
                            padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 600,
                          }}>
                            {s.average_score}%
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>{s.questions_asked}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ background: level.bg, color: level.text, padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                          {s.engagement_level.charAt(0).toUpperCase() + s.engagement_level.slice(1)}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {new Date(s.enrolled_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <SvgIcon name="chevron-right" size={15} style={{ color: "var(--text-muted)" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <SvgIcon name="users" className="empty-state-icon" />
            <div className="empty-state-title">No students enrolled</div>
            <div className="empty-state-desc">There are currently no students enrolled in this course.</div>
          </div>
        )}
      </div>

      {/* AI Insights Section */}
      {aiInsights && (
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="sparkle" size={18} style={{ color: "#8B5CF6" }} />
              AI Insights
            </span>
          </h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="stat-card-compact animate-fade-in">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(37, 99, 235, 0.08)" }}>
                <SvgIcon name="message-circle" size={18} style={{ color: "#2563EB" }} />
              </span>
              <div>
                <div className="stat-value">{aiInsights.total_queries}</div>
                <div className="stat-label">Total AI Queries</div>
              </div>
            </div>
            <div className="stat-card-compact animate-fade-in">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(245, 158, 11, 0.08)" }}>
                <SvgIcon name="alert-triangle" size={18} style={{ color: "#F59E0B" }} />
              </span>
              <div>
                <div className="stat-value">{aiInsights.low_confidence_count}</div>
                <div className="stat-label">Low Confidence</div>
              </div>
            </div>
            <div className="stat-card-compact animate-fade-in">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "var(--radius-sm)", background: "rgba(16, 185, 129, 0.08)" }}>
                <SvgIcon name="layers" size={18} style={{ color: "#10B981" }} />
              </span>
              <div>
                <div className="stat-value">{aiInsights.top_confusion_areas?.length > 0 ? aiInsights.top_confusion_areas[0].topic : "None"}</div>
                <div className="stat-label">Top Confusion Area</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
            {/* Top Confusion Areas List */}
            <div className="card">
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Top Confusion Areas</h2>
              {aiInsights.top_confusion_areas?.length === 0 ? (
                <div className="empty-state">
                  <SvgIcon name="hash" className="empty-state-icon" />
                  <div className="empty-state-title">No topics found</div>
                  <div className="empty-state-desc">Students haven't asked enough questions yet.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {aiInsights.top_confusion_areas?.map((area: any, idx: number) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0.75rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: "0.85rem" }}>{area.topic}</span>
                      <span style={{ background: "rgba(139, 92, 246, 0.08)", color: "#8B5CF6", padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                        {area.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Feed Table */}
            <div className="card">
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Question Feed</h2>
              <div style={{ overflowX: "auto", maxHeight: "300px" }}>
                <table className="data-table">
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
                    <tr>
                      <th>Question</th>
                      <th>Category</th>
                      <th>Difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiInsights.recent_feed?.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <div className="empty-state" style={{ padding: "2rem" }}>
                            <SvgIcon name="message-circle" className="empty-state-icon" />
                            <div className="empty-state-title">No recent questions</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      aiInsights.recent_feed?.map((feedItem: any) => (
                        <tr key={feedItem.id}>
                          <td style={{ maxWidth: "250px" }}>
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={feedItem.question}>
                              {feedItem.question}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                              {new Date(feedItem.asked_at).toLocaleString()}
                            </div>
                          </td>
                          <td>
                            <span style={{ padding: "2px 6px", background: "var(--bg-primary)", borderRadius: "4px", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                              {feedItem.topic_category || "Uncategorized"}
                            </span>
                          </td>
                          <td>
                            <span style={{ padding: "2px 6px", background: "var(--bg-primary)", borderRadius: "4px", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                              {feedItem.sentiment_difficulty || "Unknown"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
