"use client";

import { useState, useEffect } from "react";
import api, { Course } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";
import Link from "next/link";

interface StudentOnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  userId?: number;
}

const STREAM_CATEGORIES = [
  { id: "bio", label: "Biological Science", desc: "Biology, Chemistry, Physics", icon: "sparkle" },
  { id: "maths", label: "Physical Science", desc: "Combined Maths, Physics, Chemistry", icon: "grid" },
  { id: "commerce", label: "Commerce Stream", desc: "Accounting, Business, Economics", icon: "dollar-sign" },
  { id: "tech", label: "Technology Stream", desc: "Engineering Tech, Science for Tech, ICT", icon: "book" },
  { id: "arts", label: "Arts Stream", desc: "Logic, Languages, Political Science", icon: "file-text" },
  { id: "olevel", label: "O-Level Foundation", desc: "O/L Mathematics & Science", icon: "graduation" }
];

export default function StudentOnboardingModal({
  open,
  onClose,
  onComplete,
  userId
}: StudentOnboardingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedStream, setSelectedStream] = useState<string>("bio");
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.listCourses()
        .then((courses) => {
          setAvailableCourses(courses || []);
        })
        .catch(() => {
          addToast("Failed to load available courses.", "error");
        })
        .finally(() => setLoading(false));
    }
  }, [open, addToast]);

  if (!open) return null;

  // Filter courses by selected stream
  const filteredCourses = availableCourses.filter(course => {
    const titleLower = (course.title || "").toLowerCase();
    const subjectLower = (course.subject || "").toLowerCase();

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

  const toggleCourseSelection = (courseId: number) => {
    setSelectedCourseIds(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const selectAllStreamCourses = () => {
    const ids = filteredCourses.map(c => c.id);
    setSelectedCourseIds(new Set(ids));
  };

  const handleFinishOnboarding = async (paymentOption: "trial" | "pay_now") => {
    if (selectedCourseIds.size === 0) {
      addToast("Please select at least one class to join.", "warning");
      return;
    }

    try {
      setSubmitting(true);
      // Enroll in all selected courses
      const enrollPromises = Array.from(selectedCourseIds).map(id => api.enrollInCourse(id));
      await Promise.all(enrollPromises);

      // Save onboarding flag in localStorage
      if (typeof window !== "undefined" && userId) {
        localStorage.setItem(`lms_student_onboarded_${userId}`, "true");
      }

      if (paymentOption === "trial") {
        addToast("3-Day Grace Trial Activated! You now have full access to your selected classes.", "success");
      } else {
        addToast("Classes enrolled! Redirecting to Tuition Subscriptions...", "success");
      }

      onComplete();
      onClose();

      if (paymentOption === "pay_now") {
        window.location.href = "/dashboard/student/billing?tab=browse";
      }
    } catch (err: any) {
      addToast(err.message || "Failed to complete class enrollment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Welcome to Lumora! Set Up Your Academic Classes" onClose={onClose} maxWidth="680px">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        
        {/* Progress Stepper Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-body)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= 1 ? "var(--accent-primary)" : "var(--border)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>1</div>
            <span style={{ fontSize: "0.82rem", fontWeight: step === 1 ? 700 : 500, color: step === 1 ? "var(--text-primary)" : "var(--text-muted)" }}>Academic Stream</span>
          </div>
          <SvgIcon name="chevron-right" size={14} style={{ opacity: 0.3 }} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= 2 ? "var(--accent-primary)" : "var(--border)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>2</div>
            <span style={{ fontSize: "0.82rem", fontWeight: step === 2 ? 700 : 500, color: step === 2 ? "var(--text-primary)" : "var(--text-muted)" }}>Select Classes</span>
          </div>
          <SvgIcon name="chevron-right" size={14} style={{ opacity: 0.3 }} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= 3 ? "var(--accent-primary)" : "var(--border)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>3</div>
            <span style={{ fontSize: "0.82rem", fontWeight: step === 3 ? 700 : 500, color: step === 3 ? "var(--text-primary)" : "var(--text-muted)" }}>Access & Trial</span>
          </div>
        </div>

        {/* STEP 1: SELECT ACADEMIC STREAM */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.3rem 0" }}>Which Sri Lankan Academic Stream are you studying?</h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Select your stream to automatically tailor your subject classes and AI Tutor recommendations.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.85rem" }}>
              {STREAM_CATEGORIES.map((st) => {
                const isSelected = selectedStream === st.id;
                return (
                  <div
                    key={st.id}
                    onClick={() => setSelectedStream(st.id)}
                    style={{
                      padding: "1rem",
                      borderRadius: "var(--radius-md)",
                      border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-card)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem"
                    }}
                  >
                    <div style={{ padding: "0.5rem", borderRadius: "8px", background: isSelected ? "var(--accent-primary)" : "var(--bg-body)", color: isSelected ? "#fff" : "var(--text-secondary)" }}>
                      <SvgIcon name={st.icon as any} size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>{st.label}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{st.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                className="btn-primary"
                onClick={() => {
                  selectAllStreamCourses();
                  setStep(2);
                }}
                style={{ padding: "0.6rem 1.5rem", fontWeight: 700 }}
              >
                Next: Select Classes →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT SUBJECT CLASSES */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.3rem 0" }}>Select Subject Classes to Join</h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Choose the classes you want to add to your daily dashboard.
                </p>
              </div>

              <button
                className="btn-secondary btn-sm"
                onClick={selectAllStreamCourses}
                style={{ fontSize: "0.78rem" }}
              >
                Select All Stream Classes
              </button>
            </div>

            {loading ? (
              <div style={{ padding: "2rem", textAlign: "center" }}><div className="spinner" /></div>
            ) : filteredCourses.length === 0 ? (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No classes found for this stream. You can select another stream or browse all classes later.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "320px", overflowY: "auto", paddingRight: "0.25rem" }}>
                {filteredCourses.map((c) => {
                  const isChecked = selectedCourseIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCourseSelection(c.id)}
                      style={{
                        padding: "0.85rem 1rem",
                        borderRadius: "var(--radius-md)",
                        border: isChecked ? "1.5px solid var(--accent-primary)" : "1px solid var(--border)",
                        background: isChecked ? "rgba(99, 102, 241, 0.06)" : "var(--bg-card)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{ width: 18, height: 18, accentColor: "var(--accent-primary)", cursor: "pointer" }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>{c.title}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Taught by {c.teacher_name || "Instructor"} · {c.lesson_count} lessons
                          </div>
                        </div>
                      </div>

                      {c.subject && <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{c.subject}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <button className="btn-secondary" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className="btn-primary"
                disabled={selectedCourseIds.size === 0}
                onClick={() => setStep(3)}
                style={{ padding: "0.6rem 1.5rem", fontWeight: 700 }}
              >
                Next: Access & Trial ({selectedCourseIds.size} Selected) →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ACCESS & TRIAL SELECTION */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.3rem 0" }}>Choose Your Learning Access Mode</h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                You are about to join <strong>{selectedCourseIds.size} subject classes</strong>. Select how you would like to begin.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              
              {/* Option A: 3-Day Grace Trial */}
              <div 
                className="card"
                style={{
                  padding: "1.25rem",
                  border: "2px solid #10b981",
                  background: "linear-gradient(135deg, var(--bg-card) 0%, rgba(16, 185, 129, 0.08) 100%)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative"
                }}
              >
                <div style={{ position: "absolute", top: "-10px", right: "12px", background: "#10b981", color: "#fff", fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: "8px" }}>
                  RECOMMENDED FOR NEW STUDENTS
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <SvgIcon name="sparkle" size={20} style={{ color: "#10b981" }} />
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>Start 3-Day Free Grace Access</h4>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 1rem 0" }}>
                    Get instant 3-day full access to all theory lessons, coursework, and AI Tutor features. You can pay your monthly tuition pass anytime during the grace period!
                  </p>
                </div>

                <button
                  className="btn-primary"
                  disabled={submitting}
                  onClick={() => handleFinishOnboarding("trial")}
                  style={{ width: "100%", background: "#10b981", border: "none", fontWeight: 700, padding: "0.65rem" }}
                >
                  {submitting ? "Activating..." : "Start 3-Day Free Access"}
                </button>
              </div>

              {/* Option B: Pay Tuition Fee Now */}
              <div 
                className="card"
                style={{
                  padding: "1.25rem",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <SvgIcon name="credit-card" size={20} style={{ color: "var(--accent-primary)" }} />
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>Pay Monthly Tuition Fee Now</h4>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 1rem 0" }}>
                    Enroll in your chosen subject classes and proceed directly to checkout for your monthly tuition pass or 3-Subject Stream Combo discount!
                  </p>
                </div>

                <button
                  className="btn-secondary"
                  disabled={submitting}
                  onClick={() => handleFinishOnboarding("pay_now")}
                  style={{ width: "100%", fontWeight: 700, padding: "0.65rem" }}
                >
                  {submitting ? "Processing..." : "Pay Tuition & Unlock Passes"}
                </button>
              </div>

            </div>

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "0.5rem" }}>
              <button className="btn-secondary" onClick={() => setStep(2)}>
                ← Back to Class Selection
              </button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
