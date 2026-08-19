"use client";

import { useState } from "react";
import { SvgIcon } from "@/components/SvgIcon";
import Link from "next/link";

interface GuideTopic {
  id: string;
  category: "getting-started" | "lessons" | "examinations" | "analytics" | "ai" | "teacher" | "billing";
  title: string;
  badge: string;
  icon: string;
  summary: string;
  steps: string[];
  tips?: string[];
  actionLink?: { href: string; label: string };
}

const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "stream-onboarding",
    category: "getting-started",
    title: "Stream & Class Setup Wizard",
    badge: "ONBOARDING",
    icon: "graduation",
    summary: "Set up your A/L or O/L stream (Bio, Maths, Commerce, Tech, Arts) and select subject classes.",
    steps: [
      "Select your Sri Lankan Academic Stream: Bio, Physical Science, Commerce, Tech, Arts, or O-Level.",
      "Select your subject classes (e.g. Biology, Chemistry, Physics) to add them to your dashboard.",
      "Choose 3-Day Free Grace Access or pay monthly tuition immediately."
    ],
    tips: ["Add more classes anytime under Browse & Enroll Classes."],
    actionLink: { href: "/dashboard/student/browse", label: "Browse Classes" }
  },
  {
    id: "viewing-lessons",
    category: "lessons",
    title: "Lessons & PDF Study Notes",
    badge: "LEARNING",
    icon: "book",
    summary: "Access theory modules, video recordings, downloadable PDF notes, and flag errors.",
    steps: [
      "Click 'My Courses' in the left sidebar to see all active subject classes.",
      "View video recordings and open study notes inside the built-in PDF viewer.",
      "Click 'Flag Material' if you spot an error to alert your teacher directly."
    ],
    tips: ["Keep track of your course progress bar to ensure 100% exam readiness."],
    actionLink: { href: "/dashboard/student/courses", label: "My Courses" }
  },
  {
    id: "al-examinations",
    category: "examinations",
    title: "A/L Examination Studio",
    badge: "ASSESSMENTS",
    icon: "award",
    summary: "Take timed Paper I (MCQ) and Paper II (Structured & Essay) exams adhering to national standards.",
    steps: [
      "Click 'Exam Studio' in the sidebar to view scheduled or active papers.",
      "Complete Paper I with instant auto-scoring and template analysis.",
      "Complete Paper II structured and essay parts for AI pre-grading and official teacher review."
    ],
    tips: ["Exam scores update your unit mastery and cognitive performance profiles."],
    actionLink: { href: "/dashboard/student/al-exams", label: "Exam Studio" }
  },
  {
    id: "student-analytics",
    category: "analytics",
    title: "Syllabus Mastery & Learning Analytics",
    badge: "INSIGHTS",
    icon: "chart",
    summary: "Track topic mastery, cognitive levels, assessment history, and question discrimination trends.",
    steps: [
      "Click 'My Analytics' to view your performance dashboard.",
      "Inspect topic-by-topic mastery bars and identified weakness areas.",
      "Review past exam submissions and teacher feedback annotations."
    ],
    tips: ["Regular practice on flagged weak topics increases overall grade prediction."],
    actionLink: { href: "/dashboard/student/analytics", label: "My Analytics" }
  },
  {
    id: "ask-ai-tutor",
    category: "ai",
    title: "Lumora AI Tutor (24/7 Support)",
    badge: "AI TUTOR",
    icon: "sparkle",
    summary: "Ask 24/7 syllabus questions for Bio, Chem, Combined Maths, Econ, and get step-by-step answers.",
    steps: [
      "Click 'Ask AI' or highlight text inside any study lesson.",
      "Type your question (e.g. 'Explain Photosynthesis Light Reaction').",
      "Receive instant step-by-step explanations tailored to Sri Lankan A/L & O/L."
    ],
    tips: ["Ask follow-up questions or request past paper practice problems."],
    actionLink: { href: "/dashboard/student/ask", label: "Ask AI Tutor" }
  },
  {
    id: "daily-briefings",
    category: "ai",
    title: "Daily Briefings & AI Agent",
    badge: "SMART AGENT",
    icon: "grid",
    summary: "Receive daily briefings highlighting urgent deadlines, unread teacher messages, and study recommendations.",
    steps: [
      "Briefings appear automatically on your first login each day.",
      "Review high-priority tasks and AI revision topic recommendations.",
      "Click 'Got It' or jump straight to urgent assignments."
    ]
  },
  {
    id: "ask-teacher",
    category: "teacher",
    title: "Teacher Q&A & Direct Inbox",
    badge: "TEACHER SUPPORT",
    icon: "mail",
    summary: "Send direct inquiries and past paper working drafts to your class teachers.",
    steps: [
      "Click 'Ask Teacher' in the left sidebar.",
      "Select your subject class and teacher from the dropdown.",
      "Type your question, attach working files, and receive direct teacher replies."
    ],
    actionLink: { href: "/dashboard/student/ask-teacher", label: "Ask Teacher" }
  }
];

const FAQS = [
  {
    q: "How is my Course Completion Percentage calculated?",
    a: "Course Completion is calculated from 3 components: 45% theory lesson study, 35% coursework assignments, and 20% quiz performance."
  },
  {
    q: "What happens when my 3-Day Grace Pass expires?",
    a: "You will be prompted to settle your monthly tuition fee in Subscriptions & Class Catalog to maintain permanent pass access."
  },
  {
    q: "How do I get the 20% 3-Subject Stream Combo Discount?",
    a: "Enrolling in 3 core subjects of your stream (e.g. Bio + Chem + Physics) automatically unlocks a 20% Combo Discount."
  },
  {
    q: "Where do I download my official tuition receipts?",
    a: "Click your Profile Avatar -> Subscriptions & Class Catalog -> Payment Receipts & History to view and print official receipts."
  }
];

export default function StudentGuidePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const filteredTopics = GUIDE_TOPICS.filter(t => {
    const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = t.title.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.badge.toLowerCase().includes(q) ||
      t.steps.some(s => s.toLowerCase().includes(q));

    return matchesCategory && matchesSearch;
  });

  const toggleTopicExpand = (id: string) => {
    setExpandedTopicId(prev => prev === id ? null : id);
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "1280px", margin: "0 auto", paddingBottom: "2rem" }}>
      
      {/* Lumora Standard Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Platform User Guide</h1>
          <p>Master guide & step-by-step instructions for using Lumora LMS</p>
        </div>

        {/* Header Action Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Search Bar */}
          <div style={{ position: "relative", minWidth: "260px" }}>
            <input
              type="text"
              className="input-field"
              placeholder="Search guide topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "2.2rem", paddingRight: "0.75rem", height: "36px", fontSize: "0.83rem" }}
            />
            <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>
              <SvgIcon name="search" size={14} />
            </div>
          </div>

          <button 
            onClick={() => window.print()} 
            className="btn-secondary btn-sm"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <SvgIcon name="file-text" size={14} />
            <span>Print Guide</span>
          </button>
        </div>
      </div>

      {/* Standard Lumora Filter Tabs */}
      <div style={{ display: "flex", gap: "0.4rem", overflowX: "auto", paddingBottom: "0.2rem", borderBottom: "1px solid var(--border)" }}>
        {[
          { id: "all", label: "All Topics", icon: "grid" },
          { id: "getting-started", label: "Stream & Onboarding", icon: "graduation" },
          { id: "lessons", label: "Lessons", icon: "book" },
          { id: "examinations", label: "A/L Exam Studio", icon: "award" },
          { id: "analytics", label: "Mastery & Analytics", icon: "chart" },
          { id: "ai", label: "AI Tutor", icon: "sparkle" },
          { id: "teacher", label: "Teacher Q&A", icon: "mail" }
        ].map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.8rem",
                fontWeight: isSelected ? 700 : 500,
                border: "none",
                background: isSelected ? "var(--accent-primary)" : "transparent",
                color: isSelected ? "#ffffff" : "var(--text-secondary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem"
              }}
            >
              <SvgIcon name={cat.icon as any} size={14} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Compact Guide Topics Grid */}
      {filteredTopics.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {filteredTopics.map((topic) => {
            const isExpanded = expandedTopicId === topic.id;
            return (
              <div 
                key={topic.id}
                className="card"
                style={{ 
                  padding: "1rem", 
                  display: "flex", 
                  flexDirection: "column", 
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  background: "var(--bg-card)",
                  border: isExpanded ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  {/* Top Badge & Icon Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}>
                      {topic.badge}
                    </span>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <SvgIcon name={topic.icon as any} size={14} />
                    </div>
                  </div>

                  <h3 style={{ fontSize: "0.98rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--text-primary)" }}>
                    {topic.title}
                  </h3>

                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                    {topic.summary}
                  </p>

                  {/* Expandable Step-by-Step Details */}
                  {isExpanded && (
                    <div style={{ marginTop: "0.75rem", background: "var(--bg-body)", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", fontSize: "0.78rem" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.35rem", fontSize: "0.7rem", letterSpacing: "0.04em" }}>
                        Step-by-Step Guide:
                      </div>
                      <ol style={{ paddingLeft: "1.1rem", margin: 0, display: "flex", flexDirection: "column", gap: "0.3rem", color: "var(--text-primary)" }}>
                        {topic.steps.map((stepText, idx) => (
                          <li key={idx}>{stepText}</li>
                        ))}
                      </ol>

                      {topic.tips && (
                        <div style={{ marginTop: "0.6rem", color: "#10b981", fontSize: "0.75rem", fontWeight: 500 }}>
                          💡 <strong>Tip:</strong> {topic.tips.join(" ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Controls: Toggle Expand & Quick Link */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)", marginTop: "0.25rem" }}>
                  <button
                    onClick={() => toggleTopicExpand(topic.id)}
                    style={{ border: "none", background: "none", color: "var(--accent-primary)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem", padding: 0 }}
                  >
                    <span>{isExpanded ? "Hide Steps" : "View Instructions"}</span>
                    <SvgIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={13} />
                  </button>

                  {topic.actionLink && (
                    <Link 
                      href={topic.actionLink.href}
                      className="btn-secondary btn-sm"
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", textDecoration: "none" }}
                    >
                      <span>{topic.actionLink.label}</span>
                      <SvgIcon name="chevron-right" size={12} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "2rem 1.5rem" }}>
          <SvgIcon name="search" size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
          <div className="empty-state-title" style={{ fontSize: "1rem" }}>No matching guide topics</div>
          <div className="empty-state-desc" style={{ fontSize: "0.82rem" }}>Try searching for 'coursework', 'quizzes', 'grace trial', or 'combos'.</div>
        </div>
      )}

      {/* FREQUENTLY ASKED QUESTIONS (FAQ ACCORDION) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Frequently Asked Questions</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div 
                key={idx}
                className="card"
                style={{ 
                  padding: "0.85rem 1rem", 
                  cursor: "pointer",
                  border: isOpen ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                  transition: "all 0.15s ease"
                }}
                onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "0.88rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {faq.q}
                  </h3>
                  <div style={{ color: "var(--text-muted)", transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "none" }}>
                    <SvgIcon name="chevron-down" size={14} />
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
