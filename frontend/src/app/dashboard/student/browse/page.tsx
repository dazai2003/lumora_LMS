"use client";

import { useEffect, useState, Suspense } from "react";
import api, { Course } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import { SvgIcon } from "@/components/SvgIcon";
import Link from "next/link";

const STREAM_CATEGORIES = [
  { id: "all", label: "All Streams", desc: "All Subjects" },
  { id: "bio", label: "Biological Science", desc: "Biology, Chemistry, Physics", icon: "sparkle" },
  { id: "maths", label: "Physical Science", desc: "Combined Maths, Physics, Chemistry", icon: "grid" },
  { id: "commerce", label: "Commerce Stream", desc: "Accounting, Business, Economics", icon: "dollar-sign" },
  { id: "tech", label: "Technology Stream", desc: "Eng Tech, Science for Tech, ICT", icon: "book" },
  { id: "arts", label: "Arts Stream", desc: "Logic, Languages, History", icon: "file-text" }
];

function BrowseClassesContent() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<number | null>(null);
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);
  const [selectedStream, setSelectedStream] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [allCourses, enrolled] = await Promise.all([
        api.listCourses().catch(() => []),
        api.getMyEnrolledCourses().catch(() => [])
      ]);

      const regularCourses = (allCourses || []).filter((c: Course) => {
        const title = (c.title || "").toLowerCase();
        const subject = (c.subject || "").toLowerCase();
        return !title.includes("examination papers") && !title.includes("g.c.e. a/l examination papers") && subject !== "a/l exam papers";
      });

      setCourses(regularCourses);
      setEnrolledCourses(new Set((enrolled || []).map(c => c.id)));
    } catch (err: any) {
      addToast(err.message || "Failed to load class catalog", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (courseId: number) => {
    setEnrolling(courseId);
    try {
      await api.enrollInCourse(courseId);
      addToast("Successfully enrolled in class!", "success");
      setEnrolledCourses(prev => new Set(prev).add(courseId));
      if (previewCourse?.id === courseId) {
        setPreviewCourse(null);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to enroll";
      addToast(errorMessage, "error");
    } finally {
      setEnrolling(null);
    }
  };

  const filteredCourses = courses.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.subject || "").toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStream = true;
    if (selectedStream === "bio") {
      matchesStream = ["biology", "chemistry", "physics"].some(s => (c.subject || "").toLowerCase().includes(s) || c.title.toLowerCase().includes(s));
    } else if (selectedStream === "maths") {
      matchesStream = ["math", "physics", "chemistry"].some(s => (c.subject || "").toLowerCase().includes(s) || c.title.toLowerCase().includes(s));
    } else if (selectedStream === "commerce") {
      matchesStream = ["account", "business", "econ"].some(s => (c.subject || "").toLowerCase().includes(s) || c.title.toLowerCase().includes(s));
    } else if (selectedStream === "tech") {
      matchesStream = ["tech", "ict"].some(s => (c.subject || "").toLowerCase().includes(s) || c.title.toLowerCase().includes(s));
    } else if (selectedStream === "arts") {
      matchesStream = ["logic", "history", "art"].some(s => (c.subject || "").toLowerCase().includes(s) || c.title.toLowerCase().includes(s));
    }
    
    return matchesSearch && matchesStream;
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Browse & Enroll Classes
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Explore available courses, view detailed syllabus overviews, and enroll in your subject classes.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search class by subject or title..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: "2.5rem" }}
          />
          <div style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <SvgIcon name="search" size={16} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {STREAM_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedStream(cat.id)}
              className="btn"
              style={{
                fontSize: "0.85rem",
                padding: "0.5rem 0.85rem",
                borderRadius: "var(--radius)",
                background: selectedStream === cat.id ? "var(--accent-primary)" : "var(--bg-card)",
                color: selectedStream === cat.id ? "white" : "var(--text-primary)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                fontWeight: selectedStream === cat.id ? 600 : 400
              }}
            >
              {cat.id !== "all" && <SvgIcon name={cat.icon as any} size={14} />}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Class Catalog Grid */}
      {loading ? (
        <div className="page-loader" style={{ minHeight: "40vh" }}><div className="spinner" /></div>
      ) : filteredCourses.length === 0 ? (
        <div className="empty-state" style={{ padding: "3rem 1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
          <div className="empty-icon"><SvgIcon name="book" size={48} /></div>
          <h3>No classes found</h3>
          <p>Try adjusting your search criteria or stream selection filter.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {filteredCourses.map(course => {
            const isEnrolled = enrolledCourses.has(course.id);
            return (
              <div 
                key={course.id} 
                className="card"
                style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  justifyContent: "space-between",
                  padding: "1.5rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <span className="badge badge-info" style={{ fontWeight: 600, fontSize: "0.75rem" }}>
                      {course.subject || "General"}
                    </span>
                    {isEnrolled && (
                      <span className="badge badge-success" style={{ fontWeight: 600, fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <SvgIcon name="check-circle" size={12} /> Enrolled
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                    {course.title}
                  </h3>

                  <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "1rem", minHeight: "2.7rem" }}>
                    {course.description || "No description provided."}
                  </p>

                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <SvgIcon name="user" size={14} /> {course.teacher_name || "Assigned Teacher"}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <SvgIcon name="layers" size={14} /> {course.lesson_count ?? 0} Lessons
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                  <button 
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: "0.5rem", fontSize: "0.85rem" }}
                    onClick={() => setPreviewCourse(course)}
                  >
                    View Details
                  </button>

                  {isEnrolled ? (
                    <Link href={`/dashboard/student/courses/${course.id}`} className="btn btn-primary" style={{ flex: 1, padding: "0.5rem", fontSize: "0.85rem", textDecoration: "none", textAlign: "center" }}>
                      Go to Class
                    </Link>
                  ) : (
                    <button 
                      className="btn btn-primary"
                      style={{ flex: 1, padding: "0.5rem", fontSize: "0.85rem" }}
                      disabled={enrolling === course.id}
                      onClick={() => handleEnroll(course.id)}
                    >
                      {enrolling === course.id ? "Enrolling..." : "Enroll in Class"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Course Detail Preview Modal */}
      {previewCourse && (
        <Modal 
          onClose={() => setPreviewCourse(null)} 
          title={previewCourse.title}
          maxWidth="600px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span className="badge badge-info">{previewCourse.subject || "Subject"}</span>
                {enrolledCourses.has(previewCourse.id) ? (
                  <span className="badge badge-success">Currently Enrolled</span>
                ) : (
                  <span className="badge badge-secondary">Available for Enrollment</span>
                )}
              </div>
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {previewCourse.description || "Comprehensive curriculum designed for G.C.E Advanced Level examination preparation."}
              </p>
            </div>

            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase" }}>
                Course Overview & Information
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.88rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Teacher:</span> <strong>{previewCourse.teacher_name || "Subject Specialist"}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Total Lessons:</span> <strong>{previewCourse.lesson_count ?? 0} Modules</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Enrolled Students:</span> <strong>{previewCourse.student_count ?? 0} Students</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Access Type:</span> <strong>Open Enrollment</strong>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <button className="btn btn-secondary" onClick={() => setPreviewCourse(null)}>
                Close
              </button>

              {enrolledCourses.has(previewCourse.id) ? (
                <Link href={`/dashboard/student/courses/${previewCourse.id}`} className="btn btn-primary" style={{ textDecoration: "none" }}>
                  Go to Class
                </Link>
              ) : (
                <button 
                  className="btn btn-primary"
                  disabled={enrolling === previewCourse.id}
                  onClick={() => handleEnroll(previewCourse.id)}
                >
                  {enrolling === previewCourse.id ? "Enrolling..." : "Enroll in Class"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function BrowseClassesPage() {
  return (
    <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}>
      <BrowseClassesContent />
    </Suspense>
  );
}
