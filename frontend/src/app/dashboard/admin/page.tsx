"use client";

import { useState, useEffect } from "react";
import api, { DashboardStats, AdminOverview, AIPerformance, Course, PaymentOverview } from "@/lib/api";
import LineChart from "@/components/charts/LineChart";
import { SvgIcon } from "@/components/SvgIcon";
import type { IconName } from "@/components/SvgIcon";
import Link from "next/link";
import { DashboardSkeleton } from "@/components/Skeleton";

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [aiPerf, setAiPerf] = useState<AIPerformance | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [paymentOverview, setPaymentOverview] = useState<PaymentOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAdminStats(),
      api.getAdminOverview(),
      api.getAIPerformance(),
      api.listCourses(),
      api.getAdminPaymentOverview()
    ])
      .then(([s, o, a, c, po]) => { 
        setStats(s); 
        setOverview(o); 
        setAiPerf(a); 
        setCourses(c);
        setPaymentOverview(po);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  // ─── DERIVED METRICS ───────────────────────────────────────────────────────

  const inactiveCourses = courses.filter(c => !c.is_active);
  const emptyCourses = overview?.course_breakdown.filter(c => c.lessons === 0) || [];
  const aiFailed = aiPerf?.failed ?? 0;
  const aiSuccessRate = aiPerf?.success_rate ?? 100;
  
  const hasIssues = aiFailed > 0 || emptyCourses.length > 0 || inactiveCourses.length > 0;

  // Chart Labels & Data
  const enrollLabels = overview?.enrollment_trend?.map(t => t.date.slice(5)) || [];
  const enrollData = overview?.enrollment_trend?.map(t => t.count) || [];
  const regLabels = overview?.registration_trend?.map(t => t.date.slice(5)) || [];
  const regData = overview?.registration_trend?.map(t => t.count) || [];
  
  const qaLabels = overview?.qa_trend?.map(t => t.date.slice(5)) || [];
  const qaData = overview?.qa_trend?.map(t => t.count) || [];
  const quizLabels = overview?.quiz_attempt_trend?.map(t => t.date.slice(5)) || [];
  const quizData = overview?.quiz_attempt_trend?.map(t => t.count) || [];

  const qaTotal = qaData.reduce((acc, curr) => acc + curr, 0);
  const quizTotal = quizData.reduce((acc, curr) => acc + curr, 0);

  const activityIcons: Record<string, IconName> = {
    quiz_submit: "edit",
    ai_question: "sparkle",
    user_register: "user",
    course_create: "book",
  };

  const kpiCards = [
    {
      label: "Total Students",
      value: stats?.total_students ?? 0,
      icon: "users" as IconName,
      color: "var(--accent-primary)",
      bgColor: "rgba(37, 99, 235, 0.08)",
    },
    {
      label: "Total Teachers",
      value: stats?.total_teachers ?? 0,
      icon: "graduation" as IconName,
      color: "#8B5CF6",
      bgColor: "rgba(139, 92, 246, 0.08)",
    },
    {
      label: "Total Courses",
      value: stats?.total_courses ?? 0,
      icon: "book" as IconName,
      color: "#059669",
      bgColor: "rgba(5, 150, 105, 0.08)",
    },
    {
      label: "Active Enrollments",
      value: stats?.active_enrollments ?? 0,
      icon: "activity" as IconName,
      color: "#D97706",
      bgColor: "rgba(217, 119, 6, 0.08)",
    },
  ];

  const financialCards = [
    {
      label: "Total Revenue",
      value: `LKR ${paymentOverview?.total_revenue?.toFixed(2) ?? "0.00"}`,
      icon: "dollar-sign" as IconName,
      color: "#10B981",
      bgColor: "rgba(16, 185, 129, 0.08)",
    },
    {
      label: "Monthly Recurring",
      value: `LKR ${paymentOverview?.monthly_recurring?.toFixed(2) ?? "0.00"}`,
      icon: "trending-up" as IconName,
      color: "#3B82F6",
      bgColor: "rgba(59, 130, 246, 0.08)",
    },
    {
      label: "Active Subscriptions",
      value: paymentOverview?.active_subscriptions ?? 0,
      icon: "credit-card" as IconName,
      color: "#8B5CF6",
      bgColor: "rgba(139, 92, 246, 0.08)",
    },
    {
      label: "Overdue Balance",
      value: `LKR ${paymentOverview?.overdue_balance?.toFixed(2) ?? "0.00"}`,
      icon: "alert-triangle" as IconName,
      color: "#EF4444",
      bgColor: "rgba(239, 68, 68, 0.08)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "1400px", margin: "0 auto", paddingBottom: "2rem" }}>
      
      {/* 1. HEADER */}
      <div className="page-header" style={{ marginBottom: "0.25rem" }}>
        <h1>Platform Overview</h1>
        <p>Monitor Lumora's growth, activity, and platform health.</p>
      </div>

      {/* 2. PLATFORM SNAPSHOT (4 Equal KPI Cards in 1 Row) */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
          {kpiCards.map((kpi, idx) => (
            <div key={idx} className="card" style={{ padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                  {kpi.value}
                </div>
              </div>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "var(--radius-md)",
                background: kpi.bgColor,
                color: kpi.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <SvgIcon name={kpi.icon} size={22} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. GROWTH & PLATFORM ACTIVITY (Main Visual Anchor) */}
      <section>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <SvgIcon name="trending-up" size={18} style={{ color: "var(--accent-primary)" }} /> Growth & Activity
        </h2>
        
        {/* Financial Overview */}
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem" }}>Financial Overview</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
            {financialCards.map((card, i) => (
              <div key={i} className="card" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: card.bgColor, color: card.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <SvgIcon name={card.icon} size={24} />
                </div>
                <div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.25rem", fontWeight: 500 }}>{card.label}</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{card.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>New Registrations</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>Students and teachers registered over the last 30 days</p>
            {regLabels.length > 0 ? (
              <LineChart labels={regLabels} datasets={[{ label: "New Users", data: regData, borderColor: "#10B981" }]} />
            ) : (
              <div className="empty-state" style={{ height: "180px" }}><div className="empty-state-desc">No registration data available.</div></div>
            )}
          </div>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Course Enrollments</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>Total student course enrollments over the last 30 days</p>
            {enrollLabels.length > 0 ? (
              <LineChart labels={enrollLabels} datasets={[{ label: "New Enrollments", data: enrollData, borderColor: "#2563EB" }]} />
            ) : (
              <div className="empty-state" style={{ height: "180px" }}><div className="empty-state-desc">No enrollment data available.</div></div>
            )}
          </div>
        </div>

        {/* Secondary Activity (Adaptive for Quiz & Q&A) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1.5rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Quiz Attempts</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Student quiz submissions over the last 30 days</p>
            {quizTotal > 0 ? (
              <LineChart labels={quizLabels} datasets={[{ label: "Quiz Attempts", data: quizData, borderColor: "#8B5CF6" }]} height={180} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}><SvgIcon name="file-text" size={24} /></div>
                <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)" }}>No quiz activity recorded</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center" }}>There are no quiz submissions for this period.</div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Q&A Activity</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Student AI questions asked over the last 30 days</p>
            {qaTotal > 0 ? (
              <LineChart labels={qaLabels} datasets={[{ label: "Questions Asked", data: qaData, borderColor: "#F59E0B" }]} height={180} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}><SvgIcon name="message-circle" size={24} /></div>
                <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)" }}>No Q&A activity recorded</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center" }}>Students have not asked any questions recently.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. PLATFORM STATUS & HEALTH (Lower Section) */}
      <section>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <SvgIcon name="cpu" size={18} style={{ color: "var(--text-secondary)" }} /> Platform Status & Health
        </h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "1.5rem", alignItems: "start" }}>
          
          {/* Health Block */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* AI System Health */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>AI System Health</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>Language model operations</div>
                </div>
                <div className={`badge ${aiFailed > 0 ? "badge-error" : "badge-success"}`}>
                  <SvgIcon name={aiFailed > 0 ? "alert-circle" : "check-circle"} size={12} style={{ marginRight: "0.25rem" }} />
                  {aiFailed > 0 ? "Needs Attention" : "Healthy"}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Success Rate</span>
                <span style={{ fontWeight: 600, color: aiSuccessRate < 95 ? "var(--error)" : "var(--success)" }}>{aiSuccessRate}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Failed / Total Operations</span>
                <span style={{ fontWeight: 500, color: aiFailed > 0 ? "var(--error)" : "var(--text-primary)" }}>{aiFailed} / {aiPerf?.total_operations ?? 0}</span>
              </div>
            </div>

            {/* Course Health */}
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>Course Health</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>Platform curriculum status</div>
                </div>
                <div className={`badge ${emptyCourses.length > 0 ? "badge-warning" : "badge-success"}`}>
                  <SvgIcon name={emptyCourses.length > 0 ? "alert-triangle" : "check-circle"} size={12} style={{ marginRight: "0.25rem" }} />
                  {emptyCourses.length > 0 ? "Needs Setup" : "Healthy"}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Active Courses</span>
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{courses.filter(c => c.is_active).length} / {courses.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Courses Awaiting Setup</span>
                <span style={{ fontWeight: 500, color: emptyCourses.length > 0 ? "var(--warning)" : "var(--text-primary)" }}>{emptyCourses.length}</span>
              </div>
            </div>
          </div>

          {/* Attention Needed Block */}
          <div className="card" style={{ padding: "1.25rem", height: "100%" }}>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="flag" size={16} style={{ color: hasIssues ? "var(--warning)" : "var(--text-muted)" }} /> Attention Needed
            </div>
            
            {hasIssues ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {aiFailed > 0 && (
                  <div style={{ padding: "0.875rem", borderRadius: "var(--radius-sm)", background: "color-mix(in srgb, var(--error) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--error) 20%, transparent)", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <SvgIcon name="alert-circle" size={18} style={{ color: "var(--error)", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{aiFailed} AI operations failed</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>Review system logs for LLM failures.</div>
                    </div>
                  </div>
                )}
                {emptyCourses.length > 0 && (
                  <div style={{ padding: "0.875rem", borderRadius: "var(--radius-sm)", background: "color-mix(in srgb, var(--warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 25%, transparent)", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <SvgIcon name="alert-triangle" size={18} style={{ color: "var(--warning)", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{emptyCourses.length} course{emptyCourses.length > 1 ? "s" : ""} lacking content</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>Courses have been created but have 0 lessons.</div>
                    </div>
                    <Link href="/dashboard/admin/courses" className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>Review</Link>
                  </div>
                )}
                {inactiveCourses.length > 0 && (
                  <div style={{ padding: "0.875rem", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <SvgIcon name="lock" size={18} style={{ color: "var(--text-muted)", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{inactiveCourses.length} inactive course{inactiveCourses.length > 1 ? "s" : ""}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>These courses are not visible to students.</div>
                    </div>
                    <Link href="/dashboard/admin/courses" className="btn-secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>Review</Link>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", height: "calc(100% - 2.5rem)" }}>
                <div style={{ color: "var(--success)", opacity: 0.9, marginBottom: "0.75rem" }}><SvgIcon name="check-circle" size={36} /></div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>All systems normal</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>No immediate action required.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. RECENT ACTIVITY (Bottom Timeline Feed) */}
      <section>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <SvgIcon name="activity" size={18} style={{ color: "var(--text-secondary)" }} /> Recent Activity
        </h2>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {overview?.activity_feed && overview.activity_feed.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {overview.activity_feed.slice(0, 8).map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: "1rem", alignItems: "center",
                  padding: "0.875rem 1.25rem", borderBottom: i < Math.min(overview.activity_feed.length, 8) - 1 ? "1px solid var(--border-subtle)" : "none",
                  background: "var(--bg-body)",
                }}>
                  <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                    <SvgIcon name={activityIcons[item.type] || "info"} size={14} />
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.4 }}>{item.message}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(item.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1rem" }}>
              <div style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }}><SvgIcon name="clock" size={32} /></div>
              <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>No recent activity</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center", maxWidth: "400px" }}>
                Platform activity will appear here as users register, create courses, and interact with Lumora.
              </div>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
