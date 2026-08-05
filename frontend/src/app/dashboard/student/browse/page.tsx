"use client";

import { useState, useEffect } from "react";
import api, { Course } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import Link from "next/link";

const STREAM_CATEGORIES = [
  { id: "all", label: "All Streams", desc: "All Subjects" },
  { id: "bio", label: "Biological Science", desc: "Biology, Chemistry, Physics", icon: "sparkle" },
  { id: "maths", label: "Physical Science", desc: "Combined Maths, Physics, Chemistry", icon: "grid" },
  { id: "commerce", label: "Commerce Stream", desc: "Accounting, Business, Economics", icon: "dollar-sign" },
  { id: "tech", label: "Technology Stream", desc: "Eng Tech, Science for Tech, ICT", icon: "book" },
  { id: "arts", label: "Arts Stream", desc: "Logic, Languages, History", icon: "file-text" },
  { id: "olevel", label: "O-Level Foundation", desc: "O/L Mathematics & Science", icon: "graduation" }
];

export default function BrowseCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<number | null>(null);
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);
  const [selectedStream, setSelectedStream] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("lms_combo_banner_dismissed");
      if (dismissed === "true") {
        setShowBanner(false);
      }
    }
  }, []);

  const dismissBanner = () => {
    setShowBanner(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("lms_combo_banner_dismissed", "true");
    }
  };

  useEffect(() => {
    Promise.all([
      api.listCourses(),
      api.getMyEnrolledCourses(),
      api.getMySubscriptions()
    ])
      .then(([allCourses, enrolled]) => {
        setCourses(allCourses);
        setEnrolledCourses(new Set(enrolled.map(c => c.id)));
      })
      .catch(() => addToast("Failed to load courses.", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleEnroll = async (courseId: number) => {
    setEnrolling(courseId);
    try {
      await api.enrollInCourse(courseId);
      addToast("Successfully enrolled in class!", "success");
      setEnrolledCourses(prev => new Set(prev).add(courseId));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to enroll";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
    }
  };

  const handleCheckout = async (courseId: number, plan: "monthly" | "one_time") => {
    setEnrolling(courseId);
    try {
      await api.checkoutCourse(courseId, plan);
      addToast("Tuition payment successful! You are now enrolled.", "success");
      setEnrolledCourses(prev => new Set(prev).add(courseId));
      setPreviewCourse(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Payment failed";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
    }
  };

  // Stream Filtering Logic
  const filteredCourses = courses.filter(course => {
    const titleLower = (course.title || "").toLowerCase();
    const subjectLower = (course.subject || "").toLowerCase();
    const queryLower = searchQuery.toLowerCase();

    const matchesSearch = titleLower.includes(queryLower) || subjectLower.includes(queryLower);

    if (!matchesSearch) return false;
    if (selectedStream === "all") return true;

    if (selectedStream === "bio") {
      return subjectLower.includes("bio") || subjectLower.includes("chem") || subjectLower.includes("phy") || titleLower.includes("bio") || titleLower.includes("chem") || titleLower.includes("phy");
    }
    if (selectedStream === "maths") {
      return subjectLower.includes("math") || subjectLower.includes("phy") || subjectLower.includes("chem") || titleLower.includes("math") || titleLower.includes("phy") || titleLower.includes("chem");
    }
    if (selectedStream === "commerce") {
      return subjectLower.includes("account") || subjectLower.includes("business") || subjectLower.includes("econ") || titleLower.includes("econ") || titleLower.includes("business");
    }
    if (selectedStream === "tech") {
      return subjectLower.includes("tech") || subjectLower.includes("ict") || titleLower.includes("tech") || titleLower.includes("ict");
    }
    if (selectedStream === "arts") {
      return subjectLower.includes("art") || subjectLower.includes("logic") || subjectLower.includes("history") || titleLower.includes("logic");
    }
    if (selectedStream === "olevel") {
      return subjectLower.includes("o/l") || titleLower.includes("o/l") || titleLower.includes("ordinary");
    }

    return true;
  });

  if (loading) {
    return <div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Browse Courses</h1>
          <p>Select your Sri Lankan A-Level or O-Level Academic Stream to view available subject classes</p>
        </div>

        {/* Search Field */}
        <div style={{ position: "relative", width: "280px" }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search subject or teacher..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: "2.2rem" }}
          />
          <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <SvgIcon name="search" size={14} />
          </div>
        </div>
      </div>

      {/* 3-Subject Stream Combo Pass Special Banner (Dismissible) */}
      {showBanner && (
        <div className="card" style={{ 
          padding: "1.25rem 1.5rem", 
          background: "linear-gradient(135deg, var(--bg-card) 0%, rgba(99,102,241,0.08) 100%)", 
          border: "1px solid var(--accent-primary)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          boxShadow: "0 4px 16px rgba(99,102,241,0.08)",
          position: "relative"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", paddingRight: "2rem" }}>
            <div style={{ padding: "0.6rem", borderRadius: "50%", background: "rgba(99,102,241,0.15)", color: "var(--accent-primary)", flexShrink: 0 }}>
              <SvgIcon name="sparkle" size={24} />
            </div>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>A/L 3-Subject Stream Combo Pass</span>
                <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}>SAVE 20%</span>
              </div>
              <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Enroll in all 3 subjects of your A/L Stream (e.g. Physics + Chemistry + Biology or Combined Maths) to get a 20% discount on your monthly tuition passes!
              </p>
            </div>
          </div>

          <button 
            onClick={dismissBanner}
            title="Dismiss Announcement"
            style={{ 
              background: "transparent", 
              border: "none", 
              color: "var(--text-muted)", 
              fontSize: "1.2rem", 
              cursor: "pointer", 
              padding: "0.2rem 0.5rem", 
              borderRadius: "50%",
              transition: "all 0.15s ease" 
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stream Category Selector Pills */}
      <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {STREAM_CATEGORIES.map(stream => {
          const isSelected = selectedStream === stream.id;
          return (
            <button
              key={stream.id}
              onClick={() => setSelectedStream(stream.id)}
              style={{
                padding: "0.65rem 1.1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "0.83rem",
                fontWeight: 600,
                border: isSelected ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                background: isSelected ? "rgba(99, 102, 241, 0.14)" : "var(--bg-card)",
                color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
              }}
            >
              <span>{stream.label}</span>
            </button>
          );
        })}
      </div>

      {/* Course Grid */}
      {filteredCourses.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {filteredCourses.map((course) => {
            const isEnrolled = enrolledCourses.has(course.id);

            return (
              <div 
                key={course.id} 
                className="card" 
                style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  cursor: "pointer", 
                  transition: "all 0.2s ease",
                  border: isEnrolled ? "1px solid var(--accent-primary)" : "1px solid var(--border)"
                }}
                onClick={() => setPreviewCourse(course)}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "10px", background: "rgba(99, 102, 241, 0.12)", color: "var(--accent-primary)", flexShrink: 0 }}>
                    <SvgIcon name="book" size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{course.title}</h3>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                      Taught by {course.teacher_name || "Instructor"}
                    </div>
                  </div>
                </div>

                {course.subject && (
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
                    <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{course.subject}</span>
                    <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>Sri Lankan A/L</span>
                  </div>
                )}

                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", flex: 1, marginBottom: "1rem", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {course.description || "Comprehensive Sri Lankan curriculum syllabus, theory lessons, past paper revisions, and AI Tutor assistance."}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {course.lesson_count} lessons · {course.student_count} students
                  </div>

                  {isEnrolled ? (
                    <button onClick={(e) => { e.stopPropagation(); setPreviewCourse(course); }} className="btn-secondary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}>
                      View Class
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEnroll(course.id); }}
                      className="btn-primary"
                      disabled={enrolling === course.id}
                      style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                    >
                      {enrolling === course.id ? "Enrolling..." : "Enroll Now"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state" style={{ padding: "3rem 1.5rem" }}>
          <SvgIcon name="search" size={40} style={{ opacity: 0.3, marginBottom: "1rem" }} />
          <div className="empty-state-title">No subject classes found</div>
          <div className="empty-state-desc">No subject classes match your selected academic stream or search query.</div>
        </div>
      )}

      {/* Course Preview Modal */}
      {previewCourse && (
        <Modal title="Subject Class Information" onClose={() => setPreviewCourse(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{previewCourse.title}</h2>
              {previewCourse.subject && <span className="badge badge-info">{previewCourse.subject}</span>}
            </div>
            
            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="user" size={16} />
              Instructor: <strong>{previewCourse.teacher_name || "Course Instructor"}</strong>
            </div>

            <div style={{ display: "flex", gap: "1rem", fontSize: "0.82rem", color: "var(--text-muted)", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)" }}>
              <span>{previewCourse.lesson_count} Theory & Revision Lessons</span>
              <span>•</span>
              <span>{previewCourse.student_count} Enrolled Students</span>
            </div>

            <div style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
              {previewCourse.description || "Comprehensive syllabus coverage for Sri Lankan Advanced Level examination."}
            </div>

            {previewCourse.is_paid_course && !enrolledCourses.has(previewCourse.id) && (
              <div style={{ padding: "1rem", borderRadius: "10px", background: "var(--bg-body)", border: "1px solid var(--border)", marginTop: "0.5rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", fontWeight: 600 }}>Class Tuition Options</h4>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {previewCourse.monthly_price !== null && (
                    <button 
                      onClick={() => handleCheckout(previewCourse.id, "monthly")}
                      disabled={enrolling === previewCourse.id}
                      className="btn-primary"
                      style={{ flex: 1, padding: "0.6rem", fontSize: "0.85rem" }}
                    >
                      Pay Monthly Fee (LKR {previewCourse.monthly_price})
                    </button>
                  )}
                  {(previewCourse as any).one_time_price !== null && (previewCourse as any).one_time_price !== undefined && (
                    <button 
                      onClick={() => handleCheckout(previewCourse.id, "one_time")}
                      disabled={enrolling === previewCourse.id}
                      className="btn-secondary"
                      style={{ flex: 1, padding: "0.6rem", fontSize: "0.85rem" }}
                    >
                      Full Course Pass (LKR {(previewCourse as any).one_time_price})
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button className="btn-secondary" onClick={() => setPreviewCourse(null)}>
                Close
              </button>
              {enrolledCourses.has(previewCourse.id) ? (
                <Link href={`/dashboard/student/courses/${previewCourse.id}`} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>Go to Lessons</span>
                  <SvgIcon name="chevron-right" size={14} />
                </Link>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => handleEnroll(previewCourse.id)}
                  disabled={enrolling === previewCourse.id}
                >
                  {enrolling === previewCourse.id ? "Enrolling..." : "Enroll Now"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
