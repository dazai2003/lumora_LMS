"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import api, {
  Course,
  FullCourseAnalytics,
  CourseLearningOverview,
  CourseMaterialAnalyticsReport,
  MaterialEngagementMetric,
  ContextualFlagMetric,
  AskAIAnalyticsReport,
  AIConceptTopicMetric,
  AIInquiryDetailMetric,
  UnitLearningAssessmentCrossover,
  StudentLearningProfileReport,
  TeacherCourseLearningIntelligenceReport,
  CourseComprehensiveReport,
  ExamFoundationOverview,
  MCQExamAnalyticsReport,
  MCQItemMetric,
  StructuredExamAnalyticsReport,
  StructuredSubpartMetric,
  EssayExamAnalyticsReport,
  ContentHotspotIntelligence,
  UnitQuestionInventoryItem,
  TeacherCrossAnalyticsReport,
  StudentCrossAnalyticsDossier,
} from "@/lib/api";
import { SvgIcon, IconName } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/Modal";

type AnalyticsTab = "overview" | "assessments" | "intelligence" | "materials" | "ai_insights" | "roster" | "reports";

export default function TeacherAnalyticsPage() {
  return (
    <Suspense fallback={<div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>}>
      <TeacherAnalyticsContent />
    </Suspense>
  );
}

function TeacherAnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  // Data states
  const [fullAnalytics, setFullAnalytics] = useState<FullCourseAnalytics | null>(null);
  const [learningOverview, setLearningOverview] = useState<CourseLearningOverview | null>(null);
  const [materialAnalytics, setMaterialAnalytics] = useState<CourseMaterialAnalyticsReport | null>(null);
  const [aiAnalytics, setAiAnalytics] = useState<AskAIAnalyticsReport | null>(null);
  const [unitCrossover, setUnitCrossover] = useState<UnitLearningAssessmentCrossover[]>([]);
  const [intelligenceReport, setIntelligenceReport] = useState<TeacherCourseLearningIntelligenceReport | null>(null);
  const [comprehensiveReport, setComprehensiveReport] = useState<CourseComprehensiveReport | null>(null);

  // Assessment Selection & Deep Dive States (Phase T3)
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examTypeFilter, setExamTypeFilter] = useState<"all" | "full_paper" | "paper_1_mcq" | "paper_2_structured" | "paper_2_essay">("all");
  const [selectedExamFoundation, setSelectedExamFoundation] = useState<ExamFoundationOverview | null>(null);
  const [selectedExamMcq, setSelectedExamMcq] = useState<MCQExamAnalyticsReport | null>(null);
  const [selectedExamStructured, setSelectedExamStructured] = useState<StructuredExamAnalyticsReport | null>(null);
  const [selectedExamEssay, setSelectedExamEssay] = useState<EssayExamAnalyticsReport | null>(null);
  const [loadingSelectedExam, setLoadingSelectedExam] = useState(false);
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<MCQItemMetric | null>(null);

  // Syllabus Unit Intelligence Modal (Phase T4 / V5.4 / V5.5)
  const [selectedUnitModal, setSelectedUnitModal] = useState<UnitLearningAssessmentCrossover | null>(null);
  const [unitInventoryItems, setUnitInventoryItems] = useState<UnitQuestionInventoryItem[]>([]);
  const [loadingUnitInventory, setLoadingUnitInventory] = useState(false);
  const [unitInventoryFilter, setUnitInventoryFilter] = useState<"all" | "paper_1_mcq" | "paper_2_structured" | "paper_2_essay">("all");

  // Material Workstation States (Phase T5)
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<"all" | "pdf" | "video" | "note" | "image">("all");
  const [materialDiagnosticFilter, setMaterialDiagnosticFilter] = useState<"all" | "needs_attention" | "high_completion" | "low_views">("all");
  const [materialSortBy, setMaterialSortBy] = useState<"views_desc" | "completion_asc" | "completion_desc" | "flags_desc" | "title_asc">("views_desc");
  const [selectedMaterialForDetail, setSelectedMaterialForDetail] = useState<MaterialEngagementMetric | null>(null);
  const [materialModalFlagFilter, setMaterialModalFlagFilter] = useState<"all" | "unresolved" | "contextual" | "document">("all");
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [resolvingFlagId, setResolvingFlagId] = useState<number | null>(null);

  // Ask AI Intelligence & Moderation States (Phase T6)
  const [selectedInquiryForDetail, setSelectedInquiryForDetail] = useState<AIInquiryDetailMetric | null>(null);
  const [aiInquirySearchQuery, setAiInquirySearchQuery] = useState("");
  const [aiInquiryFilter, setAiInquiryFilter] = useState<"all" | "low_confidence" | "flagged" | "corrected" | "grounded" | "ungrounded">("all");
  const [aiInquiryConceptFilter, setAiInquiryConceptFilter] = useState("all");
  const [selectedConceptModal, setSelectedConceptModal] = useState<AIConceptTopicMetric | null>(null);
  const [inquiryCorrectionText, setInquiryCorrectionText] = useState("");
  const [inquiryIsFlagged, setInquiryIsFlagged] = useState(false);
  const [submittingInquiryModeration, setSubmittingInquiryModeration] = useState(false);

  // Modals & Drilldowns
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<number | null>(null);
  const [studentProfileData, setStudentProfileData] = useState<StudentLearningProfileReport | null>(null);
  const [loadingStudentProfile, setLoadingStudentProfile] = useState(false);

  const [selectedTopicModal, setSelectedTopicModal] = useState<string | null>(null);
  const [topicQuestions, setTopicQuestions] = useState<any[]>([]);
  const [loadingTopicQuestions, setLoadingTopicQuestions] = useState(false);

  // Filters & Roster Intelligence (Phase T7)
  const [rosterSearchQuery, setRosterSearchQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"all" | "needs_attention" | "limited_data" | "no_activity" | "on_track" | "active">("all");
  const [rosterSortBy, setRosterSortBy] = useState<"name" | "assessment_asc" | "assessment_desc" | "material" | "flags">("assessment_asc");
  const [sendingStudentNudge, setSendingStudentNudge] = useState<number | null>(null);

  // ─── Phase T8 Reports & Print Configuration State ───
  const [reportType, setReportType] = useState<
    "course" | "syllabus" | "unit" | "assessment" | "student" | "all_students" | "material" | "difficulty" | "export_data"
  >("course");
  const [selectedReportUnitId, setSelectedReportUnitId] = useState<number | "all">("all");
  const [selectedReportExamId, setSelectedReportExamId] = useState<number | "all">("all");
  const [selectedReportStudentId, setSelectedReportStudentId] = useState<number | null>(null);
  const [selectedReportMaterialId, setSelectedReportMaterialId] = useState<number | "all">("all");
  const [selectedReportPaperType, setSelectedReportPaperType] = useState<"all" | "paper_1_mcq" | "paper_2_structured" | "paper_2_essay">("all");
  const [reportDateRange, setReportDateRange] = useState<"all" | "30d" | "term">("all");
  const [studentReportData, setStudentReportData] = useState<StudentLearningProfileReport | null>(null);
  const [loadingStudentReport, setLoadingStudentReport] = useState(false);

  // Initialize selected student for report when roster is ready
  useEffect(() => {
    if (fullAnalytics?.student_roster && fullAnalytics.student_roster.length > 0 && !selectedReportStudentId) {
      setSelectedReportStudentId(fullAnalytics.student_roster[0].student_id);
    }
  }, [fullAnalytics, selectedReportStudentId]);

  // Load student report dossier dynamically when student report is selected
  useEffect(() => {
    if (activeTab === "reports" && reportType === "student" && selectedReportStudentId && selectedCourse) {
      setLoadingStudentReport(true);
      api.getStudentLearningProfile(selectedReportStudentId, selectedCourse)
        .then((res) => setStudentReportData(res.data))
        .catch(() => setStudentReportData(null))
        .finally(() => setLoadingStudentReport(false));
    }
  }, [activeTab, reportType, selectedReportStudentId, selectedCourse]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      if (tabParam === "unit_crossover") {
        setActiveTab("intelligence");
      } else if (tabParam === "flags" || tabParam === "materials") {
        router.push("/dashboard/teacher/insights");
      } else if (["overview", "assessments", "intelligence", "ai_insights", "roster", "reports"].includes(tabParam)) {
        setActiveTab(tabParam as AnalyticsTab);
      }
    }
  }, [searchParams, router]);

  // Load course list
  useEffect(() => {
    api.listCourses()
      .then((c) => {
        setCourses(c);
        if (c.length > 0) setSelectedCourse(c[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load multi-source analytics whenever selectedCourse changes
  useEffect(() => {
    if (!selectedCourse) return;

    setAnalyticsLoading(true);
    Promise.all([
      api.getFullCourseAnalytics(selectedCourse).catch(() => null),
      api.getCourseLearningOverview(selectedCourse).catch(() => null),
      api.getCourseMaterialAnalytics(selectedCourse).catch(() => null),
      api.getCourseAIAnalytics(selectedCourse).catch(() => null),
      api.getUnitLearningCrossover(selectedCourse).catch(() => null),
      api.getCourseLearningIntelligence(selectedCourse).catch(() => null),
      api.getCourseAnalyticsReport(selectedCourse).catch(() => null),
    ])
      .then(([fullRes, learnRes, matRes, aiRes, unitRes, intelRes, reportRes]) => {
        setFullAnalytics(fullRes);
        setLearningOverview(learnRes?.data || null);
        setMaterialAnalytics(matRes?.data || null);
        setAiAnalytics(aiRes?.data || null);
        setUnitCrossover(unitRes?.data || []);
        setIntelligenceReport(intelRes?.data || null);
        setComprehensiveReport(reportRes?.data || null);

        // Select first assessment if available
        if (reportRes?.data?.assessment_highlights && reportRes.data.assessment_highlights.length > 0) {
          setSelectedExamId(reportRes.data.assessment_highlights[0].exam_id);
        }
      })
      .catch((err) => {
        console.error("Error loading course analytics:", err);
        addToast("Failed to load analytics for selected course", "error");
      })
      .finally(() => setAnalyticsLoading(false));
  }, [selectedCourse, addToast]);

  // Load detailed assessment data whenever selectedExamId changes
  useEffect(() => {
    if (!selectedExamId) {
      setSelectedExamFoundation(null);
      setSelectedExamMcq(null);
      setSelectedExamStructured(null);
      setSelectedExamEssay(null);
      return;
    }

    setLoadingSelectedExam(true);
    Promise.all([
      api.getExamFoundationAnalytics(selectedExamId).catch(() => null),
      api.getMCQExamAnalytics(selectedExamId).catch(() => null),
      api.getStructuredExamAnalytics(selectedExamId).catch(() => null),
      api.getEssayExamAnalytics(selectedExamId).catch(() => null),
    ])
      .then(([fdRes, mcqRes, strRes, esyRes]) => {
        setSelectedExamFoundation(fdRes?.data || null);
        setSelectedExamMcq(mcqRes?.data || null);
        setSelectedExamStructured(strRes?.data || null);
        setSelectedExamEssay(esyRes?.data || null);
      })
      .catch((e) => {
        console.error("Failed to load selected exam details:", e);
      })
      .finally(() => {
        setLoadingSelectedExam(false);
      });
  }, [selectedExamId]);

  // Open Student Learning Profile
  const handleOpenStudentProfile = async (studentId: number) => {
    setSelectedStudentForProfile(studentId);
    setLoadingStudentProfile(true);
    try {
      const res = await api.getStudentLearningProfile(studentId, selectedCourse || undefined);
      setStudentProfileData(res.data);
    } catch (e) {
      console.error("Failed to load student learning profile:", e);
      addToast("Failed to load student learning profile", "error");
    } finally {
      setLoadingStudentProfile(false);
    }
  };

  // Open Syllabus Unit Modal & Fetch Unit Question Inventory (Phase V5.4)
  const handleOpenUnitModal = async (unit: UnitLearningAssessmentCrossover) => {
    setSelectedUnitModal(unit);
    if (!selectedCourse) return;
    setLoadingUnitInventory(true);
    try {
      const items = await api.getUnitQuestionInventory(selectedCourse, unit.unit_id);
      setUnitInventoryItems(items || []);
    } catch (e) {
      console.error("Failed to load unit question inventory:", e);
      setUnitInventoryItems([]);
    } finally {
      setLoadingUnitInventory(false);
    }
  };

  // Open Topic Modal for Ask AI
  const openTopicModal = async (topic: string) => {
    if (!selectedCourse) return;
    setSelectedTopicModal(topic);
    setLoadingTopicQuestions(true);
    try {
      const data = await api.getQuestionsByTopic(selectedCourse, topic);
      setTopicQuestions(data || []);
    } catch (e) {
      console.error(e);
      addToast("Failed to load student questions for topic", "error");
    } finally {
      setLoadingTopicQuestions(false);
    }
  };

  // General Nudge Reminders
  const handleSendReminders = async () => {
    setSendingReminder(true);
    try {
      const res = await api.sendProgressReminders();
      addToast(res.message || "Progress reminders sent successfully!", "success");
    } catch {
      addToast("Failed to send reminders", "error");
    } finally {
      setSendingReminder(false);
    }
  };

  // Send Individual Student Nudge Reminder (Phase T7)
  const handleSendIndividualNudge = async (studentId: number, studentName: string) => {
    setSendingStudentNudge(studentId);
    try {
      // Trigger reminder
      await api.sendProgressReminders();
      addToast(`Study check-in reminder dispatched to ${studentName}.`, "success");
    } catch {
      addToast(`Unable to send reminder to ${studentName}.`, "error");
    } finally {
      setSendingStudentNudge(null);
    }
  };

  // Helper for Student Diagnostic Status (Phase T7)
  const getStudentDiagnosticBadge = (statusCode?: string, riskLevel?: string) => {
    const code = (statusCode || "").toUpperCase();
    if (code === "NO_ACTIVITY") {
      return {
        label: "No Activity",
        className: "badge-secondary",
        desc: "No coursework materials, assessments, or interactions recorded"
      };
    }
    if (code === "LIMITED_DATA") {
      return {
        label: "Limited Data",
        className: "badge-secondary",
        desc: "Early study started; insufficient assessment submissions to evaluate mastery"
      };
    }
    if (code === "NEEDS_ATTENTION" || riskLevel === "at_risk") {
      return {
        label: "Needs Attention",
        className: "badge-error",
        desc: "Low assessment performance (<50%) or multiple unresolved content flags"
      };
    }
    if (code === "ON_TRACK" || riskLevel === "healthy") {
      return {
        label: "On Track",
        className: "badge-success",
        desc: "Strong assessment scores (≥65%) and active material completion"
      };
    }
    return {
      label: "Active",
      className: "badge-info",
      desc: "Active student coursework engagement with developing evidence"
    };
  };

  // Memoized Filtered and Sorted Roster (Phase T7)
  const filteredRoster = useMemo(() => {
    let list = fullAnalytics?.student_roster || [];

    // 1. Text Search Filter
    if (rosterSearchQuery.trim()) {
      const q = rosterSearchQuery.toLowerCase();
      list = list.filter((s: any) =>
        (s.student_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
      );
    }

    // 2. Status / Risk Filter (Separating Absence from Failure)
    if (rosterFilter !== "all") {
      list = list.filter((s: any) => {
        const code = (s.status_code || "").toLowerCase();
        if (rosterFilter === "needs_attention") {
          return code === "needs_attention" || s.risk_level === "at_risk";
        }
        if (rosterFilter === "limited_data") {
          return code === "limited_data";
        }
        if (rosterFilter === "no_activity") {
          return code === "no_activity" || (s.material_completion_pct === 0 && (s.quizzes_taken || 0) === 0 && (s.al_exams_taken || 0) === 0);
        }
        if (rosterFilter === "on_track") {
          return code === "on_track" || s.risk_level === "healthy";
        }
        if (rosterFilter === "active") {
          return code === "active" || s.risk_level === "moderate";
        }
        return true;
      });
    }

    // 3. Sorting
    return [...list].sort((a: any, b: any) => {
      if (rosterSortBy === "name") {
        return (a.student_name || "").localeCompare(b.student_name || "");
      }
      if (rosterSortBy === "assessment_asc") {
        const aVal = a.effective_assessment_avg ?? a.quiz_avg ?? 999;
        const bVal = b.effective_assessment_avg ?? b.quiz_avg ?? 999;
        return aVal - bVal;
      }
      if (rosterSortBy === "assessment_desc") {
        const aVal = a.effective_assessment_avg ?? a.quiz_avg ?? -1;
        const bVal = b.effective_assessment_avg ?? b.quiz_avg ?? -1;
        return bVal - aVal;
      }
      if (rosterSortBy === "material") {
        return (b.material_completion_pct ?? 0) - (a.material_completion_pct ?? 0);
      }
      if (rosterSortBy === "flags") {
        return (b.unresolved_flags ?? 0) - (a.unresolved_flags ?? 0);
      }
      return 0;
    });
  }, [fullAnalytics?.student_roster, rosterSearchQuery, rosterFilter, rosterSortBy]);

  // Ask AI Diagnostic Status (Phase T6)
  const getAskAIDiagnosticStatus = (report: AskAIAnalyticsReport | null) => {
    if (!report || report.total_questions_asked === 0) {
      return { label: "No AI Activity Recorded", badgeClass: "badge-secondary", reason: "Students have not submitted inquiries to the Ask AI tutor." };
    }
    if (report.flagged_count > 0) {
      return { label: "Flagged Content Detected", badgeClass: "badge-error", reason: `${report.flagged_count} AI responses flagged for inaccurate or confusing explanations.` };
    }
    if (report.low_confidence_count > 0) {
      return { label: "Quality Review Signal", badgeClass: "badge-warning", reason: `${report.low_confidence_count} responses have low semantic confidence (<70%) or missing source materials.` };
    }
    if ((report.source_grounded_percentage ?? 0) >= 80) {
      return { label: "Strong Material Grounding", badgeClass: "badge-success", reason: "Over 80% of answers are directly grounded in uploaded course notes and videos." };
    }
    return { label: "Standard Inquiry Flow", badgeClass: "badge-info", reason: "AI tutor is actively responding to student questions." };
  };

  const getInquiryConfidenceBadge = (score: number | undefined | null) => {
    if (score === undefined || score === null) return { label: "N/A", badgeClass: "badge-secondary" };
    const pct = (score * 100).toFixed(0) + "%";
    if (score >= 0.7) return { label: pct, badgeClass: "badge-success" };
    if (score >= 0.4) return { label: pct, badgeClass: "badge-warning" };
    return { label: pct, badgeClass: "badge-error" };
  };

  const handleOpenInquiryDetail = (inq: AIInquiryDetailMetric) => {
    setSelectedInquiryForDetail(inq);
    setInquiryCorrectionText(inq.teacher_correction || "");
    setInquiryIsFlagged(inq.is_flagged || false);
  };

  const handleSubmitInquiryModeration = async () => {
    if (!selectedInquiryForDetail || !selectedInquiryForDetail.response_id) {
      addToast("Cannot moderate an inquiry without an active response ID.", "error");
      return;
    }
    setSubmittingInquiryModeration(true);
    try {
      await api.moderateAIResponse(selectedInquiryForDetail.response_id, {
        is_flagged: inquiryIsFlagged,
        correction_text: inquiryCorrectionText,
      });

      const updatedInquiry: AIInquiryDetailMetric = {
        ...selectedInquiryForDetail,
        is_flagged: inquiryIsFlagged,
        teacher_correction: inquiryCorrectionText.trim() || null,
      };
      setSelectedInquiryForDetail(updatedInquiry);

      if (aiAnalytics) {
        const updatedInquiries = (aiAnalytics.detailed_inquiries || []).map((inq) =>
          inq.question_id === selectedInquiryForDetail.question_id ? updatedInquiry : inq
        );
        const flaggedCount = updatedInquiries.filter((i) => i.is_flagged).length;
        const correctedCount = updatedInquiries.filter((i) => !!i.teacher_correction).length;
        setAiAnalytics({
          ...aiAnalytics,
          detailed_inquiries: updatedInquiries,
          flagged_count: flaggedCount,
          teacher_corrected_count: correctedCount,
        });
      }

      addToast("Moderation saved and student notified.", "success");
    } catch (err: any) {
      addToast(err?.message || "Failed to submit moderation.", "error");
    } finally {
      setSubmittingInquiryModeration(false);
    }
  };

  const filteredInquiries = useMemo(() => {
    if (!aiAnalytics?.detailed_inquiries) return [];
    return aiAnalytics.detailed_inquiries.filter((inq) => {
      const matchesSearch =
        inq.question_text.toLowerCase().includes(aiInquirySearchQuery.toLowerCase()) ||
        inq.student_name.toLowerCase().includes(aiInquirySearchQuery.toLowerCase()) ||
        (inq.topic_category || "").toLowerCase().includes(aiInquirySearchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (aiInquiryConceptFilter !== "all" && inq.topic_category !== aiInquiryConceptFilter) {
        return false;
      }

      if (aiInquiryFilter === "low_confidence") {
        return inq.confidence_score != null && inq.confidence_score < 0.7;
      }
      if (aiInquiryFilter === "flagged") {
        return inq.is_flagged;
      }
      if (aiInquiryFilter === "corrected") {
        return !!inq.teacher_correction;
      }
      if (aiInquiryFilter === "grounded") {
        return inq.is_grounded;
      }
      if (aiInquiryFilter === "ungrounded") {
        return !inq.is_grounded;
      }
      return true;
    });
  }, [aiAnalytics?.detailed_inquiries, aiInquirySearchQuery, aiInquiryConceptFilter, aiInquiryFilter]);

  // Filtered assessment highlights
  const filteredAssessments = useMemo(() => {
    if (!comprehensiveReport?.assessment_highlights) return [];
    if (examTypeFilter === "all") return comprehensiveReport.assessment_highlights;
    return comprehensiveReport.assessment_highlights.filter(a => a.exam_type === examTypeFilter);
  }, [comprehensiveReport, examTypeFilter]);

  // Filtered & Sorted Materials (Phase T5)
  const filteredMaterials = useMemo(() => {
    const list = materialAnalytics?.materials || [];
    return list
      .filter((m) => {
        if (materialTypeFilter !== "all" && m.material_type.toLowerCase() !== materialTypeFilter) {
          return false;
        }
        if (materialSearchQuery.trim()) {
          const q = materialSearchQuery.toLowerCase();
          const matchTitle = m.title.toLowerCase().includes(q);
          const matchId = String(m.material_id).includes(q);
          const matchLesson = m.lesson_title?.toLowerCase().includes(q);
          if (!matchTitle && !matchId && !matchLesson) return false;
        }
        if (materialDiagnosticFilter === "needs_attention") {
          return m.unresolved_flags > 0 || (m.completion_rate_percentage != null && m.completion_rate_percentage < 50);
        }
        if (materialDiagnosticFilter === "high_completion") {
          return (m.completion_rate_percentage ?? 0) >= 70;
        }
        if (materialDiagnosticFilter === "low_views") {
          return m.total_views < 5;
        }
        return true;
      })
      .sort((a, b) => {
        if (materialSortBy === "views_desc") return b.total_views - a.total_views;
        if (materialSortBy === "completion_asc") return (a.completion_rate_percentage ?? 0) - (b.completion_rate_percentage ?? 0);
        if (materialSortBy === "completion_desc") return (b.completion_rate_percentage ?? 0) - (a.completion_rate_percentage ?? 0);
        if (materialSortBy === "flags_desc") return (b.unresolved_flags - a.unresolved_flags) || (b.total_flags - a.total_flags);
        if (materialSortBy === "title_asc") return a.title.localeCompare(b.title);
        return 0;
      });
  }, [materialAnalytics, materialTypeFilter, materialSearchQuery, materialDiagnosticFilter, materialSortBy]);

  const getMaterialDiagnosticStatus = (m: MaterialEngagementMetric) => {
    if (m.unresolved_flags > 0) {
      return { label: "High Friction", badgeClass: "badge-error" };
    }
    if ((m.completion_rate_percentage ?? 0) >= 70) {
      return { label: "Optimal Progress", badgeClass: "badge-success" };
    }
    if (m.total_views < 5) {
      return { label: "Low Engagement", badgeClass: "badge-warning" };
    }
    return { label: "Active", badgeClass: "badge-secondary" };
  };

  const handleResolveFlag = async (flagId: number, materialId: number) => {
    try {
      setResolvingFlagId(flagId);
      const replyText = replyInputs[flagId] || "Issue reviewed by teacher.";
      await api.bulkResolveMaterialFlags([flagId], replyText);
      addToast("Student difficulty flag resolved successfully", "success");
      if (selectedCourse) {
        const matRes = await api.getCourseMaterialAnalytics(selectedCourse);
        const matData = matRes?.data || null;
        setMaterialAnalytics(matData);
        if (selectedMaterialForDetail && selectedMaterialForDetail.material_id === materialId) {
          const updated = matData?.materials.find(x => x.material_id === materialId);
          if (updated) setSelectedMaterialForDetail(updated);
        }
      }
    } catch (err: any) {
      addToast(err.message || "Failed to resolve flag", "error");
    } finally {
      setResolvingFlagId(null);
    }
  };

  const summary = fullAnalytics?.summary;
  const roster = fullAnalytics?.student_roster || [];

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "HIGH_PRIORITY":
        return <span className="badge badge-error" style={{ fontSize: "0.72rem" }}>Needs Attention (High Priority)</span>;
      case "MEDIUM_PRIORITY":
        return <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>Review Recommended</span>;
      case "MONITORING":
        return <span className="badge badge-info" style={{ fontSize: "0.72rem" }}>Monitoring</span>;
      case "NOT_STARTED":
        return <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>No Activity</span>;
      case "LIMITED_DATA":
        return <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>Limited Data</span>;
      default:
        return <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>On Track</span>;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "strong_pattern":
        return <span className="badge badge-purple" style={{ fontSize: "0.675rem" }}>Strong Evidence (N≥25)</span>;
      case "emerging_pattern":
        return <span className="badge badge-info" style={{ fontSize: "0.675rem" }}>Emerging Pattern (N≥10)</span>;
      case "early_signal":
        return <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>Early Signal (N&lt;10)</span>;
      default:
        return <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>Limited Data (N&lt;3)</span>;
    }
  };

  const getUnitStatus = (u: UnitLearningAssessmentCrossover, hotspot?: ContentHotspotIntelligence) => {
    const evState = hotspot?.evidence_state || u.evidence_state;
    if (evState === "NO_DATA" || hotspot?.priority_level === "NO_DATA" || hotspot?.priority_level === "NOT_STARTED") {
      return { label: "NO DATA", badgeClass: "badge-secondary", explanation: "No learning activity or assessment evidence has been recorded for this unit." };
    }
    if (evState === "LEARNING_ONLY" || hotspot?.priority_level === "LEARNING_ONLY") {
      return { label: "LEARNING ONLY", badgeClass: "badge-info", explanation: "Learning materials engaged; assessment evidence unavailable." };
    }
    if (evState === "ASSESSMENT_ONLY" || hotspot?.priority_level === "ASSESSMENT_ONLY") {
      return { label: "ASSESSMENT ONLY", badgeClass: "badge-purple", explanation: "Assessment evidence available; learning activity unavailable." };
    }
    if (hotspot?.priority_level === "HIGH_PRIORITY" || (u.attainment_percentage != null && u.attainment_percentage < 50) || (u.mcq_average_percentage != null && u.mcq_average_percentage < 50) || u.unresolved_flags >= 3) {
      return { label: "NEEDS ATTENTION", badgeClass: "badge-error", explanation: "Assessment attainment below threshold or multiple difficulty signals." };
    }
    if (evState === "STRONG_EVIDENCE" || ((u.attainment_percentage ?? u.mcq_average_percentage ?? 0) >= 65 && (u.material_completion_percentage ?? 0) >= 50)) {
      return { label: "ON TRACK", badgeClass: "badge-success", explanation: "Strong demonstrated attainment supported by consistent study activity." };
    }
    if (evState === "LIMITED_DATA") {
      return { label: "LIMITED DATA", badgeClass: "badge-secondary", explanation: "Sparse activity or limited attempts." };
    }
    return { label: "DEVELOPING", badgeClass: "badge-info", explanation: "Active study engagement with developing assessment evidence." };
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "A": return "#10B981";
      case "B": return "#2563EB";
      case "C": return "#8B5CF6";
      case "S": return "#F59E0B";
      case "F": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getQuestionAttentionStatus = (q: MCQItemMetric): { status: "HIGH ATTENTION" | "REVIEW" | "ON TRACK" | "NO DATA"; reason: string; badgeClass: string } => {
    if (!q.total_attempts || q.total_attempts === 0) {
      return { status: "NO DATA", reason: "No attempts yet", badgeClass: "badge-secondary" };
    }
    const p = q.difficulty_index_p ?? 1.0;
    const d = q.discrimination.valid ? (q.discrimination.value ?? 0.0) : 0.0;
    const unansweredPct = (q.unanswered_count / q.total_attempts) * 100;

    if (p < 0.25 || (q.discrimination.valid && d < 0.0) || unansweredPct > 40) {
      return { status: "HIGH ATTENTION", reason: p < 0.25 ? "Extremely low success rate" : d < 0.0 ? "Negative discrimination index" : "High unanswered rate", badgeClass: "badge-error" };
    }
    if (p < 0.40 || p > 0.90 || (q.discrimination.valid && d < 0.20) || q.option_distribution.some(o => o.is_non_functional_distractor)) {
      return { status: "REVIEW", reason: p < 0.40 ? "Difficult item" : p > 0.90 ? "High mastery / low discrimination" : "Check distractor engagement", badgeClass: "badge-warning" };
    }
    return { status: "ON TRACK", reason: "Standard response curve", badgeClass: "badge-success" };
  };

  if (loading) {
    return (
      <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 1rem 3rem 1rem", boxSizing: "border-box" }}>
        <div className="page-loader" style={{ minHeight: "60vh" }}>
          <div className="spinner" />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading learning analytics workstation...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 0.5rem 3rem 0.5rem", boxSizing: "border-box", overflowX: "hidden" }}>
      {/* ──────────────── HEADER & COURSE SWITCHER ──────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
            <Link href="/dashboard/teacher" style={{ color: "inherit", textDecoration: "none" }}>Dashboard</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Analytics &amp; Learning Intelligence</span>
          </div>
          <h1 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>Teacher Analytics Workstation</h1>
          <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
            Evidence-grounded academic workstation: Cross-source learning intelligence, assessment item diagnostics, and printable reports.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {courses.length > 0 && (
            <select
              value={selectedCourse || ""}
              onChange={(e) => setSelectedCourse(Number(e.target.value))}
              className="form-select"
              style={{ minWidth: "200px", fontSize: "0.85rem", height: "36px" }}
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}

          {selectedCourse && (
            <a
              href={api.getCourseAnalyticsCsvUrl(selectedCourse)}
              className="btn btn-secondary btn-sm"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", height: "36px", textDecoration: "none" }}
              download
            >
              <SvgIcon name="download" size={14} />
              Export CSV
            </a>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleSendReminders}
            disabled={sendingReminder}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", height: "36px" }}
          >
            <SvgIcon name="bell" size={14} />
            {sendingReminder ? "Sending..." : "Nudge"}
          </button>
        </div>
      </div>

      {/* ──────────────── WORKSTATION NAVIGATION TABS ──────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem", gap: "0.25rem", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none" }}>
        {[
          { key: "overview" as AnalyticsTab, label: "Overview & KPIs", icon: "bar-chart" as IconName },
          { key: "assessments" as AnalyticsTab, label: `Assessments (${comprehensiveReport?.assessments_conducted || 0})`, icon: "clipboard" as IconName },
          { key: "intelligence" as AnalyticsTab, label: `Learning Intelligence (${intelligenceReport?.hotspots?.length || 0})`, icon: "sparkles" as IconName },
          { key: "materials" as AnalyticsTab, label: `Materials & Performance (${materialAnalytics?.total_materials || 0})`, icon: "book-open" as IconName },
          { key: "ai_insights" as AnalyticsTab, label: `Ask AI Inquiries (${aiAnalytics?.total_questions_asked || 0})`, icon: "sparkle" as IconName },
          { key: "roster" as AnalyticsTab, label: `Student Roster (${roster.length})`, icon: "users" as IconName, alert: summary?.at_risk_students_count },
          { key: "reports" as AnalyticsTab, label: "Reports & Print", icon: "file-text" as IconName },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.55rem 0.85rem",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.825rem",
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "var(--accent-primary)" : "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            <SvgIcon name={tab.icon} size={15} />
            {tab.label}
            {tab.alert != null && tab.alert > 0 && (
              <span className="badge badge-error" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                {tab.alert}
              </span>
            )}
          </button>
        ))}
      </div>

      {analyticsLoading ? (
        <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW & KPIS (COURSE-LEVEL DASHBOARD)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Summary KPI Cards Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "1rem" }}>
                {[
                  { label: "Enrolled Students", value: learningOverview?.enrolled_students || summary?.total_students || 0, icon: "users" as IconName, color: "#2563EB", sub: `${learningOverview?.active_learners_30d || 0} active (30d)` },
                  { label: "Course Materials", value: learningOverview?.total_materials || materialAnalytics?.total_materials || 0, icon: "book-open" as IconName, color: "#8B5CF6", sub: `${learningOverview?.materials_viewed_count || 0} total reads` },
                  { label: "Syllabus Units", value: learningOverview?.unit_crossover_profiles?.length || 0, icon: "layers" as IconName, color: "#10B981", sub: `${learningOverview?.unit_crossover_profiles?.length || 0} units active` },
                  { label: "Unresolved Flags", value: learningOverview?.unresolved_flags ?? (materialAnalytics?.total_unresolved_flags || 0), icon: "flag" as IconName, color: (learningOverview?.unresolved_flags || 0) > 0 ? "#EF4444" : "#10B981", sub: `${learningOverview?.total_flags ?? (materialAnalytics?.total_flags || 0)} total friction reports` },
                  { label: "AI Inquiries", value: learningOverview?.ask_ai_questions_count || aiAnalytics?.total_questions_asked || 0, icon: "sparkle" as IconName, color: "#06B6D4", sub: `${learningOverview?.ask_ai_questions_count || 0} total inquiries` },
                ].map((kpi, idx) => (
                  <div key={idx} className="card" style={{ padding: "1.1rem 1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>{kpi.label}</span>
                      <span style={{ color: kpi.color }}><SvgIcon name={kpi.icon} size={18} /></span>
                    </div>
                    <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>{kpi.value}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>{kpi.sub}</div>
                  </div>
                ))}
              </div>

              {/* Action Jump Buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
                <Link
                  href="/dashboard/teacher/al-exams/marking"
                  className="card"
                  style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", border: "1px solid var(--border)", background: "var(--bg-card)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ color: "#2563EB" }}><SvgIcon name="check-circle" size={18} /></span>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Marking Studio</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Evaluate student answer scripts &amp; verify marks</div>
                    </div>
                  </div>
                  <span className="btn btn-secondary btn-sm" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}>Open Studio &rarr;</span>
                </Link>

                <Link
                  href="/dashboard/teacher/insights"
                  className="card"
                  style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", border: "1px solid var(--border)", background: "var(--bg-card)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ color: "#EF4444" }}><SvgIcon name="alert-triangle" size={18} /></span>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Material Stats &amp; Friction Hotspots</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Inspect video heatmaps, document flags &amp; clusters</div>
                    </div>
                  </div>
                  <span className="btn btn-secondary btn-sm" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}>Open Material Stats &rarr;</span>
                </Link>

                <Link
                  href="/dashboard/teacher/qa"
                  className="card"
                  style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", border: "1px solid var(--border)", background: "var(--bg-card)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ color: "#06B6D4" }}><SvgIcon name="sparkles" size={18} /></span>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Q&amp;A Moderation</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Audit and correct individual AI Tutor answers</div>
                    </div>
                  </div>
                  <span className="btn btn-secondary btn-sm" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}>Moderate Q&amp;A &rarr;</span>
                </Link>
              </div>

              {/* Temporal Activity Trends & High-Level Highlights */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "1.25rem" }}>
                {/* 4-Week Activity Progression */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Learning Activity Progression (Past 4 Weeks)</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Weekly views, difficulty flags, and AI inquiries</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {Object.entries(learningOverview?.temporal_activity || {}).map(([week, acts]) => (
                      <div key={week} style={{ padding: "0.65rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.8rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{week}</span>
                          <span style={{ color: "var(--text-muted)" }}>{acts.views} views • {acts.flags} flags • {acts.ai_questions} AI questions</span>
                        </div>
                        <div style={{ display: "flex", gap: "4px", height: "7px", borderRadius: "999px", overflow: "hidden", background: "var(--bg-card)" }}>
                          <div style={{ width: `${Math.min(acts.views * 8, 70)}%`, background: "#2563EB" }} title="Views" />
                          <div style={{ width: `${Math.min(acts.ai_questions * 10, 20)}%`, background: "#06B6D4" }} title="AI Questions" />
                          <div style={{ width: `${Math.min(acts.flags * 15, 10)}%`, background: "#EF4444" }} title="Flags" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Difficult Questions Snapshot */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>Top Challenging Assessment Items</h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Items with lowest average class attainment</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {(comprehensiveReport?.top_difficult_questions || []).length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {comprehensiveReport?.assessments_conducted === 0
                          ? "No assessment submissions recorded yet."
                          : "No significant question-level difficulty anomalies identified."}
                      </div>
                    ) : (
                      comprehensiveReport?.top_difficult_questions.slice(0, 4).map((dq) => (
                        <div key={dq.question_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-primary)" }}>
                              Q{dq.question_number}: {dq.exam_title}
                            </div>
                            <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>
                              Format: {dq.template_type} • Depth: {dq.cognitive_level}
                            </div>
                          </div>
                          <span className="badge badge-warning" style={{ fontSize: "0.725rem", fontWeight: 700 }}>
                            {dq.average_score_percentage}% avg
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 2: ASSESSMENTS (PHASE T3 ASSESSMENT DEEP DIVE WORKSTATION)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "assessments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Type Filter Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>Paper Filter:</span>
                  {[
                    { key: "all", label: "All Assessments" },
                    { key: "full_paper", label: "Full Papers" },
                    { key: "paper_1_mcq", label: "Paper I — MCQ" },
                    { key: "paper_2_structured", label: "Paper II-A — Structured" },
                    { key: "paper_2_essay", label: "Paper II-B — Essay" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setExamTypeFilter(f.key as any)}
                      className={examTypeFilter === f.key ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem" }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assessment Selector Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
                {filteredAssessments.length === 0 ? (
                  <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
                    No published examinations found matching the selected filter.
                  </div>
                ) : (
                  filteredAssessments.map((ah) => {
                    const isSelected = selectedExamId === ah.exam_id;
                    return (
                      <div
                        key={ah.exam_id}
                        className="card"
                        style={{
                          padding: "1.1rem 1.25rem",
                          border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                          background: isSelected ? "var(--bg-secondary)" : "var(--bg-card)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                        onClick={() => setSelectedExamId(ah.exam_id)}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                            <span className={`badge ${ah.exam_type === "paper_1_mcq" ? "badge-blue" : ah.exam_type === "paper_2_structured" ? "badge-purple" : "badge-amber"}`} style={{ fontSize: "0.675rem", textTransform: "capitalize", fontWeight: 700 }}>
                              {ah.exam_type.replace(/_/g, " ")}
                            </span>
                            <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>{ah.submissions_count} submissions</span>
                          </div>
                          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>{ah.exam_title}</h4>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem" }}>
                            <span style={{ color: "var(--text-muted)" }}>Average Score:</span>
                            <strong style={{ color: (ah.average_score_percentage ?? 0) >= 60 ? "var(--success)" : "var(--warning)" }}>
                              {ah.average_score_percentage != null ? `${ah.average_score_percentage}%` : "—"}
                            </strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", marginTop: "2px" }}>
                            <span style={{ color: "var(--text-muted)" }}>Pass Rate:</span>
                            <strong style={{ color: "var(--text-primary)" }}>{ah.pass_rate_percentage != null ? `${ah.pass_rate_percentage}%` : "—"}</strong>
                          </div>
                        </div>

                        {/* Direct Analytics Button inside Card */}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.85rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)" }}>
                          <Link
                            href={`/dashboard/teacher/al-exams/analytics?exam_id=${ah.exam_id}`}
                            className="btn btn-secondary btn-sm"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              fontSize: "0.75rem",
                              padding: "0.25rem 0.65rem",
                              textDecoration: "none",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SvgIcon name="bar-chart" size={13} />
                            Analytics &rarr;
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* ──────────────── SELECTED ASSESSMENT OVERVIEW SECTION ──────────────── */}
              {loadingSelectedExam ? (
                <div style={{ padding: "3rem", textAlign: "center" }}>
                  <div className="spinner" />
                  <p style={{ marginTop: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading assessment diagnostics &amp; benchmarks...</p>
                </div>
              ) : selectedExamFoundation ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "0.5rem" }}>
                  {/* Assessment Summary Stats Grid (5 Core KPIs) */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                    {[
                      { label: "Submissions", value: selectedExamFoundation.total_submissions, icon: "users" as IconName, color: "#2563EB", sub: `${selectedExamFoundation.teacher_verified_count} verified` },
                      { label: "Class Average", value: selectedExamFoundation.average_percentage != null ? `${selectedExamFoundation.average_percentage}%` : "—", icon: "award" as IconName, color: "#10B981", sub: `Raw: ${selectedExamFoundation.average_raw_score ?? 0} pts` },
                      { label: "Median Score", value: selectedExamFoundation.median_percentage != null ? `${selectedExamFoundation.median_percentage}%` : "—", icon: "bar-chart" as IconName, color: "#8B5CF6", sub: "50th percentile" },
                      { label: "Highest Score", value: selectedExamFoundation.highest_percentage != null ? `${selectedExamFoundation.highest_percentage}%` : "—", icon: "trending-up" as IconName, color: "#10B981", sub: "Top mark" },
                      { label: "Lowest Score", value: selectedExamFoundation.lowest_percentage != null ? `${selectedExamFoundation.lowest_percentage}%` : "—", icon: "alert-triangle" as IconName, color: "#EF4444", sub: "Minimum mark" },
                    ].map((c) => (
                      <div key={c.label} className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>{c.label}</span>
                          <SvgIcon name={c.icon} size={16} style={{ color: c.color }} />
                        </div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "4px 0 2px 0" }}>{c.value}</div>
                        <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Proportional Grade Distribution Bar Chart (Section 4) */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <div>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>G.C.E. A/L Grade Distribution</h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Proportional benchmark distribution across student submissions</p>
                      </div>
                      <span className="badge badge-info" style={{ fontSize: "0.72rem" }}>
                        N = {selectedExamFoundation.total_submissions} Attempts
                      </span>
                    </div>

                    {selectedExamFoundation.total_submissions === 0 ? (
                      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        No assessment attempts yet. Grade distribution will populate once students submit.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        {[
                          { grade: "A", label: "≥ 75% (Distinction)", count: selectedExamFoundation.grade_distribution?.["A"] || 0 },
                          { grade: "B", label: "65–74% (Very Good)", count: selectedExamFoundation.grade_distribution?.["B"] || 0 },
                          { grade: "C", label: "55–64% (Credit)", count: selectedExamFoundation.grade_distribution?.["C"] || 0 },
                          { grade: "S", label: "35–54% (Ordinary Pass)", count: selectedExamFoundation.grade_distribution?.["S"] || 0 },
                          { grade: "F", label: "< 35% (Fail)", count: selectedExamFoundation.grade_distribution?.["F"] || 0 },
                        ].map((g) => {
                          const total = selectedExamFoundation.total_submissions || 1;
                          const pct = Math.round((g.count / total) * 100);
                          const color = getGradeColor(g.grade);

                          return (
                            <div key={g.grade} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.825rem" }}>
                              <span style={{ width: "24px", fontWeight: 800, color }}>{g.grade}</span>
                              <span style={{ width: "160px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{g.label}</span>
                              <div style={{ flex: 1, height: "14px", background: "var(--bg-secondary)", borderRadius: "4px", overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.4s ease" }} />
                              </div>
                              <span style={{ width: "130px", textAlign: "right", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                <strong>{g.count}</strong> {g.count === 1 ? "student" : "students"} · {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  Select an assessment above to view its benchmark grade distribution.
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 3: LEARNING INTELLIGENCE (PHASE T4 SYLLABUS & CROSS-DOMAIN INTELLIGENCE)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "intelligence" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {/* Executive Narrative */}
              {intelligenceReport?.executive_summary_narrative && (
                <div style={{ padding: "1rem 1.25rem", background: "rgba(99, 102, 241, 0.07)", border: "1px solid rgba(99, 102, 241, 0.22)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.875rem", color: "var(--accent-primary)" }}>
                      <SvgIcon name="sparkles" size={16} />
                      Learning Intelligence Executive Summary
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: "0.675rem" }}>Evidence-Synthesized</span>
                  </div>
                  <p style={{ fontSize: "0.825rem", color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
                    {intelligenceReport.executive_summary_narrative}
                  </p>
                </div>
              )}

              {/* 1. Intelligence Summary KPI Bar */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                <div style={{ padding: "0.85rem 1rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Units with Active Evidence</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--success)", marginTop: "2px" }}>{unitCrossover.length}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Learning &amp; assessment recorded</div>
                </div>
                <div style={{ padding: "0.85rem 1rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Units Needing Attention</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--danger)", marginTop: "2px" }}>
                    {(intelligenceReport?.hotspots || []).filter(h => h.priority_level === "HIGH_PRIORITY").length}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Attainment below 50% or high flags</div>
                </div>
                <div style={{ padding: "0.85rem 1rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Strong Evidence Units</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--accent-primary)", marginTop: "2px" }}>
                    {unitCrossover.filter(u => u.evidence_state === "STRONG_EVIDENCE" || u.evidence_state === "EVIDENCE_AVAILABLE").length}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Multi-source validation</div>
                </div>
                <div style={{ padding: "0.85rem 1rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Units Awaiting Data</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-muted)", marginTop: "2px" }}>
                    {unitCrossover.filter(u => u.evidence_state === "NO_DATA" || u.evidence_state === "LEARNING_ONLY").length}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Diagnostic check recommended</div>
                </div>
              </div>

              {/* Authoritative "My Syllabus Units" Master Table (Section 7) */}
              <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>My Syllabus Units Intelligence</h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>Authoritative unit-level overview: Materials, assessment mastery, confusion flags, and evidence levels</p>
                  </div>
                  <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                    {unitCrossover.length} Syllabus Units
                  </span>
                </div>

                <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)", marginTop: "0.75rem" }}>
                  <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "0.65rem 0.85rem" }}>Syllabus Unit</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Materials</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Completion</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Assessment Attainment</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Flags</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>AI Queries</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Evidence Level</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Overall Status</th>
                        <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitCrossover.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                            No syllabus unit crossover data recorded yet.
                          </td>
                        </tr>
                      ) : (
                        unitCrossover.map((u) => {
                          const hotspot = intelligenceReport?.hotspots?.find(h => h.unit_id === u.unit_id || h.unit_title === u.unit_title);
                          const status = getUnitStatus(u, hotspot);
                          const avgScore = u.mcq_average_percentage ?? u.structured_average_percentage ?? u.essay_average_percentage;

                          return (
                            <tr key={u.unit_id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "0.65rem 0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>{u.unit_title}</td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{u.total_materials}</td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                                  {u.material_completion_percentage != null ? `${u.material_completion_percentage}%` : "0%"}
                                </span>
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center", fontWeight: 700 }}>
                                {avgScore != null ? (
                                  <span style={{ color: avgScore >= 60 ? "var(--success)" : avgScore >= 45 ? "var(--warning)" : "var(--danger)" }}>
                                    {avgScore}%
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--text-muted)" }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                <span className={`badge ${u.unresolved_flags > 0 ? "badge-error" : u.total_flags > 0 ? "badge-secondary" : "badge-success"}`} style={{ fontSize: "0.72rem" }}>
                                  {u.total_flags} ({u.unresolved_flags} unres)
                                </span>
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center", fontWeight: 600 }}>{u.ask_ai_questions_count}</td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                {getConfidenceBadge(hotspot?.evidence_confidence || "early_signal")}
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                <span className={`badge ${status.badgeClass}`} style={{ fontSize: "0.72rem" }}>
                                  {status.label}
                                </span>
                              </td>
                              <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                                  onClick={() => handleOpenUnitModal(u)}
                                >
                                  Inspect Unit &rarr;
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Format Divergence & Cognitive Attenuation Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "1.25rem" }}>
                {/* Question Format Divergence */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
                    <SvgIcon name="layers" size={16} />
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Question Format Divergence</h3>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Direct factual recall vs applied multi-variable structural attainment</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(intelligenceReport?.question_type_cross_matrix || []).length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.825rem" }}>No question format divergence data.</div>
                    ) : (
                      intelligenceReport?.question_type_cross_matrix.map((qf, idx) => (
                        <div key={idx} style={{ padding: "0.75rem 0.85rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "0.82rem" }}>
                            <strong style={{ color: "var(--text-primary)" }}>{qf.unit_title}</strong>
                            <div style={{ display: "flex", gap: "0.6rem", fontSize: "0.75rem" }}>
                              <span>Recall: <strong style={{ color: "var(--text-primary)" }}>{qf.direct_recall_accuracy}%</strong></span>
                              <span>Applied: <strong style={{ color: "var(--accent-primary)" }}>{qf.applied_multi_variable_accuracy}%</strong></span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                            <div style={{ flex: 1, height: "6px", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, qf.direct_recall_accuracy ?? 0)}%`, height: "100%", background: "#3B82F6", borderRadius: "3px" }} />
                            </div>
                            <div style={{ flex: 1, height: "6px", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, qf.applied_multi_variable_accuracy ?? 0)}%`, height: "100%", background: "#8B5CF6", borderRadius: "3px" }} />
                            </div>
                          </div>

                          <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{qf.insight}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cognitive Depth Attenuation */}
                <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
                    <SvgIcon name="trending-up" size={16} />
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Cognitive Depth Attenuation</h3>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>Performance drop between lower-order and higher-order Bloom levels</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(intelligenceReport?.cognitive_cross_matrix || []).length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.825rem" }}>No cognitive attenuation data.</div>
                    ) : (
                      intelligenceReport?.cognitive_cross_matrix.map((cg, idx) => (
                        <div key={idx} style={{ padding: "0.75rem 0.85rem", background: "var(--bg-primary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "0.82rem" }}>
                            <strong style={{ color: "var(--text-primary)" }}>{cg.unit_title}</strong>
                            <div style={{ display: "flex", gap: "0.6rem", fontSize: "0.75rem" }}>
                              <span>Lower: <strong style={{ color: "var(--text-primary)" }}>{cg.lower_order_accuracy ?? 0}%</strong></span>
                              <span>Higher: <strong style={{ color: ((cg.higher_order_accuracy ?? 0) < 50 ? "var(--danger)" : "var(--success)") }}>{cg.higher_order_accuracy ?? 0}%</strong></span>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                            <div style={{ flex: 1, height: "6px", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, cg.lower_order_accuracy ?? 0)}%`, height: "100%", background: "#10B981", borderRadius: "3px" }} />
                            </div>
                            <div style={{ flex: 1, height: "6px", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, cg.higher_order_accuracy ?? 0)}%`, height: "100%", background: (cg.higher_order_accuracy ?? 0) < 50 ? "#EF4444" : "#F59E0B", borderRadius: "3px" }} />
                            </div>
                          </div>

                          <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{cg.insight}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 4: MATERIALS & ENGAGEMENT PERFORMANCE WORKSTATION
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "materials" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* 1. Material Analytics Overview KPI Strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.85rem" }}>
                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Total Materials</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    {materialAnalytics?.total_materials ?? 0}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    Across active course modules
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Avg. Completion Rate</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2563EB" }}>
                    {materialAnalytics?.overall_completion_rate != null ? `${materialAnalytics.overall_completion_rate}%` : "0%"}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    Cohort-wide progression
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Lifetime Material Views</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10B981" }}>
                    {materialAnalytics?.materials?.reduce((acc, m) => acc + m.total_views, 0) ?? 0}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    Total reads &amp; lecture views
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Difficulty Flags</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: (materialAnalytics?.total_unresolved_flags ?? 0) > 0 ? "#EF4444" : "#10B981" }}>
                    {materialAnalytics?.total_unresolved_flags ?? 0}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {materialAnalytics?.total_flags ?? 0} total lifetime reports
                  </span>
                </div>
              </div>

              {/* 2. Format Distribution & Quick Navigation Banner */}
              <div style={{ padding: "0.9rem 1.15rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Format Breakdown:
                  </div>
                  {(() => {
                    const mats = materialAnalytics?.materials || [];
                    const pdfs = mats.filter(m => m.material_type.toLowerCase() === "pdf").length;
                    const vids = mats.filter(m => m.material_type.toLowerCase() === "video").length;
                    const notes = mats.filter(m => m.material_type.toLowerCase() === "note").length;
                    const images = mats.filter(m => m.material_type.toLowerCase() === "image").length;
                    return (
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>PDF: {pdfs}</span>
                        <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>Video: {vids}</span>
                        <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>Notes: {notes}</span>
                        {images > 0 && <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>Images: {images}</span>}
                      </div>
                    );
                  })()}
                </div>

                <Link
                  href="/dashboard/teacher/insights"
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.775rem" }}
                >
                  <SvgIcon name="sparkle" size={14} style={{ color: "var(--accent-primary)" }} />
                  Open Material Stats Radar &rarr;
                </Link>
              </div>

              {/* 3. Search, Filter & Sorting Bar */}
              <div className="card" style={{ padding: "0.9rem 1.15rem", border: "1px solid var(--border-subtle)", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search material title or ID..."
                    value={materialSearchQuery}
                    onChange={(e) => setMaterialSearchQuery(e.target.value)}
                    className="form-input"
                    style={{ width: "100%", fontSize: "0.825rem", paddingLeft: "2rem", height: "34px" }}
                  />
                  <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                    <SvgIcon name="search" size={14} />
                  </span>
                </div>

                <select
                  value={materialTypeFilter}
                  onChange={(e) => setMaterialTypeFilter(e.target.value as any)}
                  className="form-select"
                  style={{ fontSize: "0.8rem", minWidth: "140px", height: "34px" }}
                >
                  <option value="all">All Formats</option>
                  <option value="pdf">PDF Documents</option>
                  <option value="video">Video Lectures</option>
                  <option value="note">Notes &amp; Articles</option>
                  <option value="image">Diagrams / Images</option>
                </select>

                <select
                  value={materialDiagnosticFilter}
                  onChange={(e) => setMaterialDiagnosticFilter(e.target.value as any)}
                  className="form-select"
                  style={{ fontSize: "0.8rem", minWidth: "155px", height: "34px" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="needs_attention">Needs Attention (Flags &gt; 0 or &lt;50%)</option>
                  <option value="high_completion">High Completion (&ge;70%)</option>
                  <option value="low_views">Low Engagement (&lt;5 Views)</option>
                </select>

                <select
                  value={materialSortBy}
                  onChange={(e) => setMaterialSortBy(e.target.value as any)}
                  className="form-select"
                  style={{ fontSize: "0.8rem", minWidth: "140px", height: "34px" }}
                >
                  <option value="views_desc">Most Views</option>
                  <option value="completion_asc">Lowest Completion</option>
                  <option value="completion_desc">Highest Completion</option>
                  <option value="flags_desc">Most Flags</option>
                  <option value="title_asc">Title (A-Z)</option>
                </select>
              </div>

              {/* 4. Comprehensive Material Catalog Table */}
              <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "0.75rem 1rem" }}>Material Title &amp; Context</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Format</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Views</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Completion</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Avg Position</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Flags</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Diagnostic</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }} className="no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No learning materials found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredMaterials.map((m) => {
                        const diag = getMaterialDiagnosticStatus(m);
                        return (
                          <tr key={m.material_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "0.75rem 1rem" }}>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{m.title}</div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                {m.lesson_title ? `Lesson: ${m.lesson_title}` : `ID: #${m.material_id}`} {m.unit_title ? `• ${m.unit_title}` : ""}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem 1rem" }}>
                              <span className="badge badge-secondary" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>
                                {m.material_type}
                              </span>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 700, color: "var(--text-primary)" }}>
                              {m.total_views}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <div style={{ fontWeight: 700, color: (m.completion_rate_percentage ?? 0) >= 70 ? "#10B981" : (m.completion_rate_percentage ?? 0) < 40 ? "#EF4444" : "#2563EB" }}>
                                {m.completion_rate_percentage != null ? `${m.completion_rate_percentage}%` : "0%"}
                              </div>
                              <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>
                                {m.completed_count}/{m.total_enrolled} done
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {m.avg_last_position != null ? (
                                m.material_type.toLowerCase() === "video"
                                  ? `${Math.floor(m.avg_last_position / 60)}:${String(Math.floor(m.avg_last_position % 60)).padStart(2, "0")}`
                                  : `Page ${Math.round(m.avg_last_position)}`
                              ) : "—"}
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <span className={`badge ${m.unresolved_flags > 0 ? "badge-error" : m.total_flags > 0 ? "badge-secondary" : "badge-success"}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                {m.unresolved_flags > 0 ? `${m.unresolved_flags} open` : `${m.total_flags} total`}
                              </span>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <span className={`badge ${diag.badgeClass}`} style={{ fontSize: "0.68rem", fontWeight: 700 }}>
                                {diag.label}
                              </span>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }} className="no-print">
                              <div style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setSelectedMaterialForDetail(m)}
                                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                                >
                                  Inspect
                                </button>
                                <Link
                                  href={`/dashboard/teacher/insights?course_id=${selectedCourse || ""}&material_id=${m.material_id}`}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                                  title="View in Material Stats Radar"
                                >
                                  Radar &rarr;
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 5: ASK AI INTELLIGENCE CENTER (PHASE T6)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "ai_insights" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* 1. Ask AI Overview KPI Strip (Section 3) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.85rem" }}>
                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Total Inquiries</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    {aiAnalytics?.total_questions_asked ?? 0}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {aiAnalytics?.answered_questions_count ?? 0} answered
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Unique Inquiring Learners</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                    {aiAnalytics?.unique_students_count || learningOverview?.unique_students_asking_ai || 0}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    Active students seeking AI tutor support
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Source Grounding Rate</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: (aiAnalytics?.source_grounded_percentage ?? 0) >= 75 ? "#10B981" : "#F59E0B" }}>
                    {aiAnalytics?.source_grounded_percentage != null ? `${aiAnalytics.source_grounded_percentage}%` : "—"}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    Grounded in uploaded notes &amp; video lessons
                  </span>
                </div>

                <div className="card" style={{ padding: "0.9rem 1.1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Low-Confidence &amp; Flags</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: (aiAnalytics?.low_confidence_count || 0) + (aiAnalytics?.flagged_count || 0) > 0 ? "#EF4444" : "var(--text-primary)" }}>
                      {(aiAnalytics?.low_confidence_count || 0) + (aiAnalytics?.flagged_count || 0)}
                    </div>
                    {aiAnalytics && (aiAnalytics.flagged_count > 0 || aiAnalytics.low_confidence_count > 0) && (
                      <span className="badge badge-error" style={{ fontSize: "0.65rem" }}>Needs Review</span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {aiAnalytics?.flagged_count ?? 0} flagged • {aiAnalytics?.low_confidence_count ?? 0} low confidence
                  </span>
                </div>
              </div>

              {/* 2. Diagnostic Status Banner */}
              {(() => {
                const diag = getAskAIDiagnosticStatus(aiAnalytics);
                return (
                  <div style={{ padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span className={`badge ${diag.badgeClass}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                        {diag.label}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {diag.reason}
                      </span>
                    </div>

                    <Link href="/dashboard/teacher/qa" className="btn btn-secondary btn-sm" style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                      <SvgIcon name="sparkles" size={13} />
                      Q&amp;A Moderation Queue &rarr;
                    </Link>
                  </div>
                );
              })()}

              {/* 3. Urgent Attention Panel */}
              {aiAnalytics && (aiAnalytics.flagged_count > 0 || aiAnalytics.low_confidence_count > 0) && (
                <div className="card" style={{ padding: "1rem 1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--danger)" }}><SvgIcon name="alert-triangle" size={16} /></span>
                    <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Inquiries Requiring Teacher Attention ({aiAnalytics.flagged_count} flagged, {aiAnalytics.low_confidence_count} low confidence)
                    </h4>
                  </div>
                  <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.775rem", color: "var(--text-secondary)" }}>
                    The following AI tutor responses generated low confidence scores or received student/teacher flags. Review the answers and provide authoritative corrections where necessary.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {(aiAnalytics.detailed_inquiries || [])
                      .filter((inq) => inq.is_flagged || (inq.confidence_score != null && inq.confidence_score < 0.7))
                      .slice(0, 3)
                      .map((inq) => (
                        <div
                          key={inq.question_id}
                          style={{ padding: "0.6rem 0.8rem", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxWidth: "75%" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>{inq.topic_category || "General"}</span>
                              {inq.is_flagged && <span className="badge badge-error" style={{ fontSize: "0.65rem" }}>FLAGGED</span>}
                              {inq.confidence_score != null && inq.confidence_score < 0.7 && (
                                <span className="badge badge-warning" style={{ fontSize: "0.65rem" }}>Low Confidence ({(inq.confidence_score * 100).toFixed(0)}%)</span>
                              )}
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>• {inq.student_name}</span>
                            </div>
                            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              &ldquo;{inq.question_text}&rdquo;
                            </div>
                          </div>

                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                            onClick={() => handleOpenInquiryDetail(inq)}
                          >
                            Inspect &amp; Moderate &rarr;
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 4. Top Inquired Concepts (Section 5 & 6) */}
              <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Top Inquired Syllabus Concepts
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                      Topics generating the highest volume of AI inquiries across the cohort
                    </p>
                  </div>
                </div>

                <div style={{ width: "100%", overflowX: "auto" }}>
                  <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "0.65rem 0.9rem" }}>Concept Topic</th>
                        <th style={{ padding: "0.65rem 0.9rem", textAlign: "center" }}>Inquiry Count</th>
                        <th style={{ padding: "0.65rem 0.9rem", textAlign: "center" }}>Cohort Share</th>
                        <th style={{ padding: "0.65rem 0.9rem" }}>Dominant Intent</th>
                        <th style={{ padding: "0.65rem 0.9rem", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(aiAnalytics?.topic_categories || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                            No Ask AI concept inquiries recorded yet.
                          </td>
                        </tr>
                      ) : (
                        (aiAnalytics?.topic_categories || []).slice(0, 8).map((top) => (
                          <tr key={top.topic_category} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.65rem 0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              {top.topic_category}
                            </td>
                            <td style={{ padding: "0.65rem 0.9rem", textAlign: "center", fontWeight: 700 }}>
                              {top.question_count}
                            </td>
                            <td style={{ padding: "0.65rem 0.9rem", textAlign: "center" }}>
                              <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                                {top.percentage != null ? `${top.percentage}%` : "—"}
                              </span>
                            </td>
                            <td style={{ padding: "0.65rem 0.9rem" }}>
                              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                                {Object.entries(top.sentiment_breakdown || {}).map(([sent, cnt]) => (
                                  <span key={sent} className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>
                                    {sent}: {cnt}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: "0.65rem 0.9rem", textAlign: "center" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                                onClick={() => setSelectedConceptModal(top)}
                              >
                                Inspect Concept &rarr;
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. Inquiry Explorer (Section 7) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Ask AI Inquiry Explorer
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                      Search, inspect, and moderate individual student questions and AI tutor responses
                    </p>
                  </div>

                  {/* Filter Toolbar */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Search questions or students..."
                      value={aiInquirySearchQuery}
                      onChange={(e) => setAiInquirySearchQuery(e.target.value)}
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", width: "220px" }}
                    />

                    <select
                      value={aiInquiryConceptFilter}
                      onChange={(e) => setAiInquiryConceptFilter(e.target.value)}
                      style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                    >
                      <option value="all">All Concepts</option>
                      {(aiAnalytics?.topic_categories || []).map((t) => (
                        <option key={t.topic_category} value={t.topic_category}>{t.topic_category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Filter Pills */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: `All Inquiries (${aiAnalytics?.detailed_inquiries?.length || 0})` },
                    { key: "low_confidence", label: `Low Confidence (${aiAnalytics?.low_confidence_count || 0})` },
                    { key: "flagged", label: `Flagged (${aiAnalytics?.flagged_count || 0})` },
                    { key: "corrected", label: `Teacher Corrected (${aiAnalytics?.teacher_corrected_count || 0})` },
                    { key: "grounded", label: "Source Grounded" },
                    { key: "ungrounded", label: "General Ungrounded" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setAiInquiryFilter(f.key as any)}
                      className={aiInquiryFilter === f.key ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                      style={{ fontSize: "0.725rem", padding: "0.25rem 0.55rem" }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Primary Inquiry Table */}
                <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
                  <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Student &amp; Time</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Inquiry &amp; Concept</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Confidence</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Grounding</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Moderation Status</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInquiries.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                            No inquiries match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredInquiries.map((inq) => {
                          const conf = getInquiryConfidenceBadge(inq.confidence_score);
                          return (
                            <tr key={inq.question_id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "0.75rem 1rem" }}>
                                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{inq.student_name}</div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                  {inq.asked_at ? new Date(inq.asked_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                </div>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", maxWidth: "340px" }}>
                                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                                  {inq.question_text}
                                </div>
                                <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                                  <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>
                                    {inq.topic_category || "General"}
                                  </span>
                                  {inq.sentiment_difficulty && inq.sentiment_difficulty !== "General Query" && (
                                    <span className="badge badge-purple" style={{ fontSize: "0.65rem" }}>
                                      {inq.sentiment_difficulty}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                                <span className={`badge ${conf.badgeClass}`} style={{ fontSize: "0.72rem" }}>
                                  {conf.label}
                                </span>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                                {inq.is_grounded ? (
                                  <span className="badge badge-success" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                    Grounded (Course Material)
                                  </span>
                                ) : (
                                  <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                                    Curriculum Query
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                                {inq.teacher_correction ? (
                                  <span className="badge badge-purple" style={{ fontSize: "0.7rem" }}>Teacher Corrected</span>
                                ) : inq.is_flagged ? (
                                  <span className="badge badge-error" style={{ fontSize: "0.7rem" }}>Flagged</span>
                                ) : inq.confidence_score != null && inq.confidence_score < 0.7 ? (
                                  <span className="badge badge-warning" style={{ fontSize: "0.7rem" }}>Low Confidence</span>
                                ) : (
                                  <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>Normal</span>
                                )}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                                  onClick={() => handleOpenInquiryDetail(inq)}
                                >
                                  Inspect Inquiry &rarr;
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 6: STUDENT ROSTER (ACADEMIC MONITORING & INTERVENTION)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "roster" && (
            selectedStudentForProfile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Top Action & Navigation Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedStudentForProfile(null);
                      setStudentProfileData(null);
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                  >
                    <SvgIcon name="arrow-left" size={14} />
                    Back to Student Roster
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => window.print()}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      <SvgIcon name="file-text" size={14} />
                      Print Dossier
                    </button>
                    {studentProfileData && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSendIndividualNudge(studentProfileData.student_id, studentProfileData.student_name)}
                        disabled={sendingStudentNudge === studentProfileData.student_id}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                      >
                        <SvgIcon name="bell" size={14} />
                        {sendingStudentNudge === studentProfileData.student_id ? "Sending Reminder..." : "Send Study Reminder"}
                      </button>
                    )}
                  </div>
                </div>

                {loadingStudentProfile || !studentProfileData ? (
                  <div className="card" style={{ padding: "4rem 2rem", textAlign: "center", border: "1px solid var(--border-subtle)" }}>
                    <div className="spinner" />
                    <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      Loading comprehensive student profile and learning diagnostics...
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    {/* 1. Student Header & Diagnostic Status Banner */}
                    <div className="card" style={{ padding: "1.5rem 1.75rem", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.25rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                            {(() => {
                              const diag = studentProfileData.status_diagnostic;
                              const badgeClass = diag?.badgeClass || (studentProfileData.engagement_pattern.includes("High Performance") ? "badge-success" : studentProfileData.engagement_pattern.includes("At-Risk") ? "badge-error" : "badge-info");
                              return (
                                <span className={`badge ${badgeClass}`} style={{ fontSize: "0.8rem", fontWeight: 800 }}>
                                  {diag?.label || studentProfileData.engagement_pattern}
                                </span>
                              );
                            })()}
                            <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>
                              Student #{studentProfileData.student_id}
                            </span>
                          </div>

                          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                            {studentProfileData.student_name}
                          </h2>
                          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                            <span>Email: <strong style={{ color: "var(--text-primary)" }}>{studentProfileData.student_email}</strong></span>
                            <span>•</span>
                            <span>Course: <strong style={{ color: "var(--text-primary)" }}>{fullAnalytics?.course_title || "G.C.E. A/L Biology"}</strong></span>
                            {studentProfileData.last_activity_at && (
                              <>
                                <span>•</span>
                                <span>Last Activity: <strong>{new Date(studentProfileData.last_activity_at).toLocaleDateString()}</strong></span>
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", maxWidth: "340px" }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                            Diagnostic Evaluation
                          </div>
                          <div style={{ fontSize: "0.825rem", color: "var(--text-primary)", marginTop: "3px", lineHeight: 1.45 }}>
                            {studentProfileData.status_diagnostic?.reason || studentProfileData.engagement_pattern}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. 4-Card KPI Strip */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Average Assessment Score</div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 900, color: studentProfileData.assessment_average_percentage != null ? (studentProfileData.assessment_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)", marginTop: "4px" }}>
                          {studentProfileData.assessment_average_percentage != null ? `${studentProfileData.assessment_average_percentage}%` : "No data"}
                        </div>
                      </div>

                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Material Completion</div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--accent-primary)", marginTop: "4px" }}>
                          {studentProfileData.material_completion_percentage != null ? `${studentProfileData.material_completion_percentage}%` : "0%"}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {studentProfileData.materials_completed} of {studentProfileData.materials_total} materials completed
                        </div>
                      </div>

                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Difficulty Flags</div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 900, color: studentProfileData.flags_unresolved_count > 0 ? "#EF4444" : "#10B981", marginTop: "4px" }}>
                          {studentProfileData.flags_unresolved_count} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>open</span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {studentProfileData.flags_submitted_count} submitted in total
                        </div>
                      </div>

                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Ask AI Tutor Queries</div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--accent-primary)", marginTop: "4px" }}>
                          {studentProfileData.ask_ai_questions_count}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          inquiries & concepts explored
                        </div>
                      </div>
                    </div>

                    {/* 3. Paper-Type Breakdown & Submissions History */}
                    <div className="card" style={{ padding: "1.5rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <SvgIcon name="award" size={18} />
                          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                            Assessment Performance & Paper Breakdown
                          </h3>
                        </div>
                      </div>

                      {/* Paper Type Strip */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                        <div style={{ padding: "0.85rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Paper I (MCQ)</div>
                          <div style={{ fontSize: "1.35rem", fontWeight: 900, color: studentProfileData.mcq_average_percentage != null ? "#10B981" : "var(--text-muted)", marginTop: "2px" }}>
                            {studentProfileData.mcq_average_percentage != null ? `${studentProfileData.mcq_average_percentage}%` : "No data"}
                          </div>
                        </div>

                        <div style={{ padding: "0.85rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Paper II-A (Structured)</div>
                          <div style={{ fontSize: "1.35rem", fontWeight: 900, color: studentProfileData.structured_average_percentage != null ? "#10B981" : "var(--text-muted)", marginTop: "2px" }}>
                            {studentProfileData.structured_average_percentage != null ? `${studentProfileData.structured_average_percentage}%` : "No data"}
                          </div>
                        </div>

                        <div style={{ padding: "0.85rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Paper II-B (Essay)</div>
                          <div style={{ fontSize: "1.35rem", fontWeight: 900, color: studentProfileData.essay_average_percentage != null ? "#10B981" : "var(--text-muted)", marginTop: "2px" }}>
                            {studentProfileData.essay_average_percentage != null ? `${studentProfileData.essay_average_percentage}%` : "No data"}
                          </div>
                        </div>
                      </div>

                      {/* Submissions History Table */}
                      <h4 style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                        Examination Attempt History ({studentProfileData.assessment_history.length})
                      </h4>
                      {studentProfileData.assessment_history.length === 0 ? (
                        <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                          No assessment submissions recorded for this student yet.
                        </p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                            <thead>
                              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Exam Title</th>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Paper Type</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Score</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Grade</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>Submitted Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentProfileData.assessment_history.map((sub, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                  <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{sub.exam_title}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textTransform: "capitalize", color: "var(--text-secondary)" }}>
                                    {sub.exam_type.replace(/_/g, " ")}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 800, color: (sub.percentage ?? 0) < 50 ? "#EF4444" : "#10B981" }}>
                                    {sub.percentage != null ? `${sub.percentage}%` : "—"}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                    <span className="badge badge-secondary" style={{ fontSize: "0.75rem", fontWeight: 700 }}>{sub.grade || "—"}</span>
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "right", color: "var(--text-muted)" }}>
                                    {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "In progress"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 4. Syllabus Unit Attainment Breakdown */}
                    <div className="card" style={{ padding: "1.5rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                        <SvgIcon name="layers" size={18} />
                        <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                          Syllabus Unit Mastery & Progress Breakdown
                        </h3>
                      </div>

                      {studentProfileData.unit_mastery_breakdown.length === 0 ? (
                        <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                          No unit mastery data recorded yet.
                        </p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                            <thead>
                              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Syllabus Unit</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Material Completion</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Assessment Score</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Flags</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Mastery Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentProfileData.unit_mastery_breakdown.map((u, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                  <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{u.unit_title}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                    {u.material_completion_pct != null ? `${u.material_completion_pct}%` : "0%"}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 800 }}>
                                    {u.assessment_score_pct != null ? `${u.assessment_score_pct}%` : "No data"}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                    {u.flags_count > 0 ? (
                                      <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>{u.flags_count} flags</span>
                                    ) : (
                                      "0"
                                    )}
                                  </td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                    <span
                                      className={`badge ${
                                        u.mastery_status === "On Track"
                                          ? "badge-success"
                                          : u.mastery_status === "Needs Attention"
                                          ? "badge-error"
                                          : u.mastery_status === "Developing"
                                          ? "badge-info"
                                          : "badge-secondary"
                                      }`}
                                      style={{ fontSize: "0.72rem", fontWeight: 700 }}
                                    >
                                      {u.mastery_status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 5. Difficulty Flags & AI Inquiries Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.5rem" }}>
                      {/* Difficulty Flags */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.85rem" }}>
                          <SvgIcon name="flag" size={16} />
                          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Difficulty Flags Submitted ({studentProfileData.flags_submitted_count})
                          </h4>
                        </div>

                        {studentProfileData.recent_flags.length === 0 ? (
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                            No difficulty flags submitted by this student.
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            {studentProfileData.recent_flags.map((fl: any) => (
                              <div key={fl.flag_id} style={{ padding: "0.75rem 0.95rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${fl.is_resolved ? "#10B981" : "#EF4444"}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                  <span style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                    {fl.material_title} <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 500 }}>({fl.context_value})</span>
                                  </span>
                                  <span className={`badge ${fl.is_resolved ? "badge-success" : "badge-error"}`} style={{ fontSize: "0.675rem" }}>
                                    {fl.is_resolved ? "Resolved" : "Open Flag"}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{fl.comment}</div>
                                {fl.teacher_reply && (
                                  <div style={{ marginTop: "0.35rem", fontSize: "0.74rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                    Teacher Reply: {fl.teacher_reply}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Ask AI Inquiries */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.85rem" }}>
                          <SvgIcon name="cpu" size={16} />
                          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Ask AI Inquiries ({studentProfileData.ask_ai_questions_count})
                          </h4>
                        </div>

                        {studentProfileData.recent_ai_questions.length === 0 ? (
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                            No Ask AI tutor inquiries recorded for this student.
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                            {studentProfileData.recent_ai_questions.map((q: any) => (
                              <div key={q.question_id} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                  <span className="badge badge-purple" style={{ fontSize: "0.68rem" }}>{q.topic_category}</span>
                                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                    {q.asked_at ? new Date(q.asked_at).toLocaleDateString() : ""}
                                  </span>
                                </div>
                                <div style={{ fontSize: "0.825rem", color: "var(--text-primary)", fontWeight: 600 }}>{q.question_text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 6. Actionable Teacher Interventions */}
                    <div style={{ padding: "1.25rem", background: "rgba(99, 102, 241, 0.04)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
                        <SvgIcon name="zap" size={18} />
                        <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                          Actionable Teacher Interventions & Recommendations
                        </h4>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                        {studentProfileData.recommended_interventions && studentProfileData.recommended_interventions.length > 0 ? (
                          studentProfileData.recommended_interventions.map((rec, idx) => (
                            <div key={idx} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                              <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>{rec.title}</div>
                              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "2px" }}>{rec.reason}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                            No urgent interventions indicated. Student is progressing normally.
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: "0.8rem" }}
                          onClick={() => handleSendIndividualNudge(studentProfileData.student_id, studentProfileData.student_name)}
                          disabled={sendingStudentNudge === studentProfileData.student_id}
                        >
                          {sendingStudentNudge === studentProfileData.student_id ? "Sending Reminder..." : "Send Study Reminder / Nudge"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.8rem" }}
                          onClick={() => {
                            setSelectedStudentForProfile(null);
                            setStudentProfileData(null);
                          }}
                        >
                          Back to Roster
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* 1. Roster Context KPI Strip (Phase T7 Section 3) */}
              {(() => {
                const rosterList = fullAnalytics?.student_roster || [];
                const totalEnrolled = rosterList.length;
                const activeLearners = rosterList.filter((s: any) => (s.material_completion_pct || 0) > 0 || (s.quizzes_taken || 0) > 0 || (s.al_exams_taken || 0) > 0).length;
                const needsAttention = rosterList.filter((s: any) => s.status_code === "NEEDS_ATTENTION" || s.risk_level === "at_risk").length;
                const noActivityOrLimited = rosterList.filter((s: any) => s.status_code === "NO_ACTIVITY" || s.status_code === "LIMITED_DATA").length;

                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
                    <div className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Total Enrolled</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                        {totalEnrolled} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)" }}>learners</span>
                      </div>
                    </div>

                    <div className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Active Learners</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--accent-primary)", marginTop: "2px" }}>
                        {activeLearners} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)" }}>participating</span>
                      </div>
                    </div>

                    <div className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", background: needsAttention > 0 ? "rgba(239, 68, 68, 0.05)" : "var(--bg-secondary)" }}>
                      <div style={{ fontSize: "0.72rem", color: needsAttention > 0 ? "#EF4444" : "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Needs Attention</div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: needsAttention > 0 ? "#EF4444" : "var(--text-primary)", marginTop: "2px" }}>
                        {needsAttention} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)" }}>students</span>
                      </div>
                    </div>

                    <div className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>No Activity / Limited</div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                          {noActivityOrLimited} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)" }}>students</span>
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleSendReminders}
                        disabled={sendingReminder}
                        style={{ marginTop: "0.4rem", fontSize: "0.72rem", padding: "0.2rem 0.5rem", width: "fit-content" }}
                      >
                        {sendingReminder ? "Dispatching..." : "Send General Reminders"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 2. Roster Search, Filter & Sort Toolbar (Phase T7 Section 7 & 8) */}
              <div className="card" style={{ padding: "0.85rem 1rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  {/* Search Input */}
                  <div style={{ position: "relative", minWidth: "240px", flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search student by name or email..."
                      value={rosterSearchQuery}
                      onChange={(e) => setRosterSearchQuery(e.target.value)}
                      style={{ fontSize: "0.825rem", padding: "0.4rem 0.75rem 0.4rem 2rem", width: "100%", borderRadius: "var(--radius-md)" }}
                    />
                    <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                      <SvgIcon name="search" size={14} />
                    </span>
                  </div>

                  {/* Sort By Dropdown */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Sort:</span>
                    <select
                      className="form-input"
                      value={rosterSortBy}
                      onChange={(e) => setRosterSortBy(e.target.value as any)}
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", borderRadius: "var(--radius-md)" }}
                    >
                      <option value="assessment_asc">Assessment (Lowest First)</option>
                      <option value="assessment_desc">Assessment (Highest First)</option>
                      <option value="name">Student Name (A–Z)</option>
                      <option value="material">Material Progress (High to Low)</option>
                      <option value="flags">Unresolved Flags (High to Low)</option>
                    </select>
                  </div>
                </div>

                {/* Status Filter Pills */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.6rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginRight: "0.25rem" }}>Status Filter:</span>
                  {[
                    { key: "all", label: `All (${fullAnalytics?.student_roster?.length || 0})` },
                    { key: "needs_attention", label: "Needs Attention", badge: "badge-error" },
                    { key: "limited_data", label: "Limited Data", badge: "badge-secondary" },
                    { key: "no_activity", label: "No Activity", badge: "badge-secondary" },
                    { key: "on_track", label: "On Track", badge: "badge-success" },
                    { key: "active", label: "Active Study", badge: "badge-info" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setRosterFilter(f.key as any)}
                      className={rosterFilter === f.key ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem" }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Primary Student Table (Phase T7 Section 4, 5, 6) */}
              <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border-subtle)" }}>
                <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "0.75rem 1rem" }}>Student</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Assessment</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Material Progress</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Learning Signals</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Status Diagnostic</th>
                      <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No students match the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((s: any) => {
                        const statusBadge = getStudentDiagnosticBadge(s.status_code, s.risk_level);
                        const effectiveScore = s.effective_assessment_avg ?? s.al_exam_avg ?? s.quiz_avg ?? s.coursework_avg;

                        return (
                          <tr key={s.student_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            {/* Student Name & Email */}
                            <td style={{ padding: "0.75rem 1rem" }}>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.student_name}</div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.email}</div>
                              {s.enrolled_at && (
                                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                  Enrolled: {new Date(s.enrolled_at).toLocaleDateString()}
                                </div>
                              )}
                            </td>

                            {/* Assessment Performance */}
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              {effectiveScore != null ? (
                                <div>
                                  <span style={{ fontWeight: 800, fontSize: "0.95rem", color: effectiveScore < 50 ? "#EF4444" : effectiveScore >= 70 ? "#10B981" : "var(--text-primary)" }}>
                                    {effectiveScore}%
                                  </span>
                                  <div style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>
                                    {s.al_exams_taken ? `${s.al_exams_taken} AL exam${s.al_exams_taken > 1 ? "s" : ""}` : s.quizzes_taken ? `${s.quizzes_taken} quiz${s.quizzes_taken > 1 ? "zes" : ""}` : "Coursework"}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                  No assessment data
                                </span>
                              )}
                            </td>

                            {/* Material Progress */}
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                <span className="badge badge-info" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                  {s.material_completion_pct ?? 0}%
                                </span>
                                <span style={{ fontSize: "0.675rem", color: "var(--text-muted)" }}>completed</span>
                              </div>
                            </td>

                            {/* Learning & Flag Signals */}
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                                {s.unresolved_flags > 0 ? (
                                  <span className="badge badge-warning" style={{ fontSize: "0.675rem" }}>
                                    {s.unresolved_flags} open flag{s.unresolved_flags > 1 ? "s" : ""}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>0 flags</span>
                                )}
                                {s.ai_questions_asked > 0 && (
                                  <span style={{ fontSize: "0.675rem", color: "var(--accent-primary)" }}>
                                    {s.ai_questions_asked} AI inquir{s.ai_questions_asked > 1 ? "ies" : "y"}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status Diagnostic (Separating Absence from Failure) */}
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                <span className={`badge ${statusBadge.className}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                  {s.status_label || statusBadge.label}
                                </span>
                                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", maxWidth: "160px", lineHeight: 1.2 }}>
                                  {s.status_reason || statusBadge.desc}
                                </span>
                              </div>
                            </td>

                            {/* Action Buttons */}
                            <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "center" }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", whiteSpace: "nowrap" }}
                                  onClick={() => handleOpenStudentProfile(s.student_id)}
                                >
                                  View Profile &rarr;
                                </button>
                                {(s.status_code === "NO_ACTIVITY" || s.status_code === "NEEDS_ATTENTION" || s.unresolved_flags > 0) && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: "0.675rem", padding: "0.15rem 0.45rem", color: "var(--accent-primary)" }}
                                    onClick={() => handleSendIndividualNudge(s.student_id, s.student_name)}
                                    disabled={sendingStudentNudge === s.student_id}
                                  >
                                    {sendingStudentNudge === s.student_id ? "Sending..." : "Send Reminder"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TAB 7: REPORTS, PRINT & EXPORT WORKSTATION (PHASE T8)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "reports" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* ──────────────── 1. REPORT CONFIGURATION TOOLBAR (NO PRINT) ──────────────── */}
              <div className="card no-print" style={{ padding: "1rem 1.25rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                      Academic Reporting &amp; Dossier Center
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                      Configure, review, print, and export evidence-based reports synthesized from Assessments, Syllabus, Materials, and Ask AI.
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => window.print()}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                      title="Print or Save as PDF"
                    >
                      <SvgIcon name="file-text" size={14} />
                      Print / Save PDF
                    </button>

                    {selectedCourse && (
                      <a
                        href={api.getCourseAnalyticsCsvUrl(
                          selectedCourse,
                          reportType === "student" || reportType === "all_students"
                            ? "student_roster"
                            : reportType === "assessment"
                            ? "assessment_items"
                            : reportType === "unit" || reportType === "syllabus"
                            ? "unit_analytics"
                            : reportType === "material"
                            ? "material_analytics"
                            : reportType === "difficulty"
                            ? "flag_data"
                            : "course_summary",
                          {
                            unit_id: typeof selectedReportUnitId === "number" ? selectedReportUnitId : undefined,
                            exam_id: typeof selectedReportExamId === "number" ? selectedReportExamId : undefined,
                            student_id: typeof selectedReportStudentId === "number" ? selectedReportStudentId : undefined,
                          }
                        )}
                        className="btn btn-primary btn-sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", textDecoration: "none", fontWeight: 700 }}
                        download
                      >
                        <SvgIcon name="download" size={14} />
                        Download CSV
                      </a>
                    )}
                  </div>
                </div>

                {/* Filter & Scope Selector Row */}
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)" }}>
                  {/* Report Type Selector */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Report Type</label>
                    <select
                      className="form-control"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value as any)}
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", minWidth: "190px" }}
                    >
                      <option value="course">Course Overview Report</option>
                      <option value="syllabus">Full Syllabus Report</option>
                      <option value="unit">Unit Deep-Dive Report</option>
                      <option value="assessment">Assessment &amp; Exam Report</option>
                      <option value="student">Individual Student Dossier</option>
                      <option value="all_students">All-Students Roster Report</option>
                      <option value="material">Material &amp; Resource Report</option>
                      <option value="difficulty">Difficulty &amp; Intervention Report</option>
                      <option value="export_data">Export Data Center</option>
                    </select>
                  </div>

                  {/* Context-Sensitive Scope Selector */}
                  {reportType === "unit" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Select Unit</label>
                      <select
                        className="form-control"
                        value={selectedReportUnitId}
                        onChange={(e) => setSelectedReportUnitId(e.target.value === "all" ? "all" : Number(e.target.value))}
                        style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", minWidth: "180px" }}
                      >
                        <option value="all">All Syllabus Units</option>
                        {(learningOverview?.unit_crossover_profiles || unitCrossover || []).map((u, idx) => (
                          <option key={u.unit_id} value={u.unit_id}>
                            Unit {idx + 1}: {u.unit_title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {reportType === "assessment" && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Select Assessment</label>
                        <select
                          className="form-control"
                          value={selectedReportExamId}
                          onChange={(e) => setSelectedReportExamId(e.target.value === "all" ? "all" : Number(e.target.value))}
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", minWidth: "180px" }}
                        >
                          <option value="all">All Assessments ({comprehensiveReport?.assessment_highlights?.length || 0})</option>
                          {(comprehensiveReport?.assessment_highlights || []).map((ex) => (
                            <option key={ex.exam_id} value={ex.exam_id}>
                              {ex.exam_title} ({ex.exam_type})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Paper Type</label>
                        <select
                          className="form-control"
                          value={selectedReportPaperType}
                          onChange={(e) => setSelectedReportPaperType(e.target.value as any)}
                          style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
                        >
                          <option value="all">All Paper Types</option>
                          <option value="paper_1_mcq">Paper I (MCQ)</option>
                          <option value="paper_2_structured">Paper II (Structured)</option>
                          <option value="paper_2_essay">Paper II (Essay)</option>
                        </select>
                      </div>
                    </>
                  )}

                  {reportType === "student" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Select Student</label>
                      <select
                        className="form-control"
                        value={selectedReportStudentId || ""}
                        onChange={(e) => setSelectedReportStudentId(Number(e.target.value))}
                        style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", minWidth: "200px" }}
                      >
                        {(fullAnalytics?.student_roster || []).map((s) => (
                          <option key={s.student_id} value={s.student_id}>
                            {s.student_name} ({s.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {reportType === "material" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Material Scope</label>
                      <select
                        className="form-control"
                        value={selectedReportMaterialId}
                        onChange={(e) => setSelectedReportMaterialId(e.target.value === "all" ? "all" : Number(e.target.value))}
                        style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", minWidth: "180px" }}
                      >
                        <option value="all">All Learning Materials ({materialAnalytics?.materials?.length || 0})</option>
                        {(materialAnalytics?.materials || []).map((m) => (
                          <option key={m.material_id} value={m.material_id}>
                            {m.title} ({m.material_type.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Date Range Selector */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Date Range</label>
                    <select
                      className="form-control"
                      value={reportDateRange}
                      onChange={(e) => setReportDateRange(e.target.value as any)}
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
                    >
                      <option value="all">All Time (Complete History)</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="term">Current Academic Term</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ──────────────── 2. FORMAL DOSSIER HEADER (PRINT ONLY) ──────────────── */}
              <div className="print-only" style={{ padding: "0 0 1rem 0", borderBottom: "2px solid #0f172a", marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h1 style={{ fontSize: "1.4rem", fontWeight: 900, margin: "0 0 4px 0", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Lumora LMS — Academic Analytics &amp; Intervention Dossier
                    </h1>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}>
                      Course: {fullAnalytics?.course_title || "Course Analytics"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                      Report Type: {reportType.replace(/_/g, " ").toUpperCase()} • Scope: {reportDateRange === "30d" ? "Last 30 Days" : "All Time"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                    <div>Generated: {comprehensiveReport?.generated_at ? new Date(comprehensiveReport.generated_at).toLocaleString() : new Date().toLocaleString()}</div>
                    <div>Source: Lumora Deterministic Analytics Engine</div>
                  </div>
                </div>
              </div>

              {/* ──────────────── 3. REPORT TEMPLATES (1 OF 9 ACTIVE) ──────────────── */}

              {/* ═══════════════ TEMPLATE 1: COURSE OVERVIEW REPORT ═══════════════ */}
              {reportType === "course" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {/* 1. Executive Summary */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>1. Executive Summary &amp; Cohort Diagnostics</h4>
                      <span className="badge badge-purple" style={{ fontSize: "0.675rem" }}>AI-Synthesized Context</span>
                    </div>
                    <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
                      {comprehensiveReport?.executive_summary || "No executive summary available."}
                    </p>
                  </div>

                  {/* 2. Course KPI Summary Strip */}
                  <div className="card" style={{ padding: "1.15rem", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>2. Cohort Participation &amp; Attainment Summary</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "0.75rem" }}>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Enrolled Students</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>{comprehensiveReport?.enrolled_students ?? fullAnalytics?.summary?.total_students ?? 0}</div>
                      </div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Active Learners (30d)</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10B981" }}>{comprehensiveReport?.active_learners_30d ?? 0}</div>
                      </div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Course Average</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: (comprehensiveReport?.course_average_score ?? 0) >= 60 ? "#10B981" : "#EF4444" }}>
                          {comprehensiveReport?.course_average_score != null ? `${comprehensiveReport.course_average_score}%` : "No assessment data"}
                        </div>
                      </div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Material Completion</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#2563EB" }}>
                          {comprehensiveReport?.average_material_completion != null ? `${comprehensiveReport.average_material_completion}%` : "0%"}
                        </div>
                      </div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Open Difficulty Flags</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: (comprehensiveReport?.unresolved_flags ?? 0) > 0 ? "#EF4444" : "#10B981" }}>
                          {comprehensiveReport?.unresolved_flags ?? 0}
                        </div>
                      </div>
                      <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Ask AI Inquiries</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--accent-primary)" }}>{comprehensiveReport?.total_ai_questions ?? 0}</div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Course-Wide Grade Distribution Breakdown */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>3. Cohort Grade Distribution Breakdown</h4>
                        <p style={{ fontSize: "0.725rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>G.C.E. A/L standard attainment boundaries across all evaluated course submissions.</p>
                      </div>
                    </div>
                    {(() => {
                      const dist = comprehensiveReport?.grade_distribution;
                      const subsCount = comprehensiveReport?.total_submissions || 0;
                      if (subsCount === 0 || !dist) {
                        return <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>No assessment submissions recorded yet.</div>;
                      }

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {(["A", "B", "C", "S", "F"] as const).map((grade) => {
                            const count = dist[grade] || 0;
                            const pct = subsCount > 0 ? Math.round((count / subsCount) * 100) : 0;
                            const color = grade === "A" ? "#10B981" : grade === "B" ? "#3B82F6" : grade === "C" ? "#F59E0B" : grade === "S" ? "#8B5CF6" : "#EF4444";
                            return (
                              <div key={grade} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                <span style={{ fontWeight: 800, width: "24px", fontSize: "0.85rem", color }}>{grade}</span>
                                <div style={{ flex: 1, height: "12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s ease" }} />
                                </div>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "90px", textAlign: "right" }}>
                                  {count} ({pct}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. Syllabus Attainment Matrix */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>4. Syllabus Unit Attainment &amp; Hotspot Classification</h4>
                      <button className="btn btn-secondary btn-sm no-print" onClick={() => setActiveTab("intelligence")} style={{ fontSize: "0.72rem" }}>
                        View Unit Intelligence &rarr;
                      </button>
                    </div>
                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Unit Title</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Material Completion</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Assessment Score</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Flags</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>AI Queries</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Evidence Status</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }} className="no-print">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(comprehensiveReport?.syllabus_breakdown || []).length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No syllabus units recorded.</td></tr>
                          ) : (
                            comprehensiveReport?.syllabus_breakdown.map((sb) => {
                              const matchingUnit = unitCrossover.find((x) => x.unit_id === sb.unit_id);
                              return (
                                <tr key={sb.unit_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                  <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600 }}>{sb.unit_title}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{sb.material_completion_pct != null ? `${sb.material_completion_pct}%` : "0%"}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700 }}>{sb.assessment_score_pct != null ? `${sb.assessment_score_pct}%` : "—"}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{sb.flags_count}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{sb.ai_inquiries_count}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{getPriorityBadge(sb.priority_level)}</td>
                                  <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }} className="no-print">
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => {
                                        if (matchingUnit) setSelectedUnitModal(matchingUnit);
                                        else setActiveTab("intelligence");
                                      }}
                                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                    >
                                      Inspect Unit
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 5. Assessment Highlights Table */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>5. Assessment &amp; Examination Attainment Highlights</h4>
                      <button className="btn btn-secondary btn-sm no-print" onClick={() => setActiveTab("assessments")} style={{ fontSize: "0.72rem" }}>
                        View Assessments &rarr;
                      </button>
                    </div>
                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Assessment Title</th>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Paper Type</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Submissions</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Average Score</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Pass Rate</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }} className="no-print">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(comprehensiveReport?.assessment_highlights || []).length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No assessment data available.</td></tr>
                          ) : (
                            comprehensiveReport?.assessment_highlights.map((a) => (
                              <tr key={a.exam_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600 }}>{a.exam_title}</td>
                                <td style={{ padding: "0.6rem 0.8rem" }}><span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>{a.exam_type}</span></td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{a.submissions_count}</td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700, color: (a.average_score_percentage ?? 0) < 50 ? "#EF4444" : "#10B981" }}>
                                  {a.average_score_percentage != null ? `${a.average_score_percentage}%` : "—"}
                                </td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{a.pass_rate_percentage != null ? `${a.pass_rate_percentage}%` : "—"}</td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }} className="no-print">
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      setSelectedExamId(a.exam_id);
                                      setActiveTab("assessments");
                                    }}
                                    style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                  >
                                    Inspect Exam
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 6. Top Difficult Questions Highlight Table */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>6. Difficult Assessment Items Detected (Attainment &lt; 50%)</h4>
                    </div>
                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Question #</th>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Exam</th>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Template Type</th>
                            <th style={{ padding: "0.6rem 0.8rem" }}>Cognitive Level</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Attainment Avg</th>
                            <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Attempts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(comprehensiveReport?.top_difficult_questions || []).length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No high-friction items detected (all assessed items &ge;50% or sample size &lt;3).</td></tr>
                          ) : (
                            comprehensiveReport?.top_difficult_questions.map((dq, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "0.6rem 0.8rem", fontWeight: 700 }}>Q{dq.question_number}</td>
                                <td style={{ padding: "0.6rem 0.8rem" }}>{dq.exam_title}</td>
                                <td style={{ padding: "0.6rem 0.8rem" }}><span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>{dq.template_type}</span></td>
                                <td style={{ padding: "0.6rem 0.8rem" }}><span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{dq.cognitive_level}</span></td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700, color: "#EF4444" }}>{dq.average_score_percentage}%</td>
                                <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>{dq.attempts_count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 7. Recommended Teacher Actions */}
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>7. Recommended Teacher Next Steps &amp; Action Integrations</h4>
                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                      <Link href="/dashboard/teacher/insights" className="btn btn-secondary btn-sm" style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="book-open" size={13} /> Review Material Stats &amp; Flags &rarr;
                      </Link>
                      <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab("assessments")} style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="bar-chart" size={13} /> Deep Dive Assessment Psychometrics &rarr;
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab("ai_insights")} style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="sparkles" size={13} /> Moderate Ask AI Inquiries &rarr;
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab("roster")} style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="users" size={13} /> Open Student Monitoring Roster &rarr;
                      </button>
                      <Link href="/dashboard/teacher/al-exams/create" className="btn btn-primary btn-sm" style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="plus" size={13} /> Create New Assessment &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════ TEMPLATE 2: FULL SYLLABUS REPORT ═══════════════ */}
              {reportType === "syllabus" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                          Syllabus Coverage, Mastery &amp; Friction Analysis
                        </h4>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                          Comprehensive evaluation of all curriculum units distinguishing unstudied units from learning failure.
                        </p>
                      </div>
                      <button className="btn btn-secondary btn-sm no-print" onClick={() => setActiveTab("intelligence")} style={{ fontSize: "0.72rem" }}>
                        Open Syllabus Intelligence &rarr;
                      </button>
                    </div>

                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.65rem 0.85rem" }}>Unit #</th>
                            <th style={{ padding: "0.65rem 0.85rem" }}>Unit Title</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Materials</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Completion Rate</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Assessment Attainment</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Flags</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>AI Queries</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Evidence Status</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(unitCrossover || []).length === 0 ? (
                            <tr><td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No syllabus units found.</td></tr>
                          ) : (
                            unitCrossover.map((u, idx) => {
                              const effScore = u.mcq_average_percentage ?? u.structured_average_percentage ?? u.essay_average_percentage;
                              const hasAssess = effScore != null;
                              const hasMat = (u.material_completion_percentage ?? 0) > 0;
                              let evStatus = "No Data";
                              let badgeClass = "badge-secondary";

                              if (!hasAssess && !hasMat) {
                                evStatus = "No Data";
                                badgeClass = "badge-secondary";
                              } else if (!hasAssess) {
                                evStatus = "Limited Data";
                                badgeClass = "badge-info";
                              } else if (effScore! < 50 || (u.total_flags ?? 0) >= 2) {
                                evStatus = "Strong Evidence (Friction)";
                                badgeClass = "badge-error";
                              } else if (effScore! >= 70) {
                                evStatus = "Strong Evidence (Mastered)";
                                badgeClass = "badge-success";
                              } else {
                                evStatus = "Emerging Pattern";
                                badgeClass = "badge-warning";
                              }

                              return (
                                <tr key={u.unit_id || idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                  <td style={{ padding: "0.65rem 0.85rem", fontWeight: 700, color: "var(--text-muted)" }}>{idx + 1}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{u.unit_title}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{u.total_materials ?? 0}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{u.material_completion_percentage != null ? `${u.material_completion_percentage}%` : "0%"}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center", fontWeight: 700 }}>
                                    {effScore != null ? `${effScore}%` : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No data</span>}
                                  </td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{u.total_flags ?? 0}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{u.ask_ai_questions_count ?? 0}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                    <span className={`badge ${badgeClass}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>{evStatus}</span>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => setSelectedUnitModal(u)}
                                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                    >
                                      Inspect Unit
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════ TEMPLATE 3: UNIT DEEP-DIVE REPORT ═══════════════ */}
              {reportType === "unit" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {(() => {
                    const u = unitCrossover.find((x) => x.unit_id === selectedReportUnitId) || unitCrossover[0];
                    if (!u) {
                      return (
                        <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No unit data available.
                        </div>
                      );
                    }

                    const effScore = u.mcq_average_percentage ?? u.structured_average_percentage ?? u.essay_average_percentage;

                    return (
                      <>
                        {/* Unit Header with Action Toolbar */}
                        <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                            <div>
                              <span className="badge badge-secondary" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>
                                Unit Deep Dive
                              </span>
                              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "4px 0 0 0", color: "var(--text-primary)" }}>
                                {u.unit_title}
                              </h3>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }} className="no-print">
                              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUnitModal(u)} style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <SvgIcon name="search" size={13} /> Inspect Unit Questions &amp; Content &rarr;
                              </button>
                              <Link href="/dashboard/teacher/insights" className="btn btn-secondary btn-sm" style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <SvgIcon name="book-open" size={13} /> Review Unit Materials &rarr;
                              </Link>
                              <Link href={`/dashboard/teacher/al-exams/create?unit_id=${u.unit_id}`} className="btn btn-primary btn-sm" style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <SvgIcon name="plus" size={13} /> Create Unit Assessment &rarr;
                              </Link>
                            </div>
                          </div>

                          {/* Unit 4-Stat Strip */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: "0.65rem" }}>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Assessment Attainment</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: effScore != null && effScore < 50 ? "#EF4444" : "#10B981" }}>
                                {effScore != null ? `${effScore}%` : "No data"}
                              </div>
                            </div>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Material Completion</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2563EB" }}>
                                {u.material_completion_percentage != null ? `${u.material_completion_percentage}%` : "0%"} ({u.total_materials ?? 0} materials)
                              </div>
                            </div>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Difficulty Flags</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: (u.unresolved_flags ?? 0) > 0 ? "#EF4444" : "#10B981" }}>
                                {u.unresolved_flags ?? 0} open ({u.total_flags ?? 0} total)
                              </div>
                            </div>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Ask AI Questions</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                                {u.ask_ai_questions_count ?? 0} inquiries
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Paper-by-Paper Attainment Breakdown for Unit */}
                        <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                            Paper-Specific Unit Performance
                          </h4>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.75rem" }}>
                            <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper I (MCQ)</div>
                              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: u.mcq_average_percentage != null ? (u.mcq_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                                {u.mcq_average_percentage != null ? `${u.mcq_average_percentage}%` : "No MCQ data"}
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>Direct recall &amp; applied MCQs</div>
                            </div>
                            <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper II-A (Structured)</div>
                              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: u.structured_average_percentage != null ? (u.structured_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                                {u.structured_average_percentage != null ? `${u.structured_average_percentage}%` : "No Structured data"}
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>Subpart mark trees &amp; derivations</div>
                            </div>
                            <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper II-B (Essay)</div>
                              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: u.essay_average_percentage != null ? (u.essay_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                                {u.essay_average_percentage != null ? `${u.essay_average_percentage}%` : "No Essay data"}
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>Synthesis &amp; structured essays</div>
                            </div>
                          </div>
                        </div>

                        {/* Learning Support Signals & Diagnostics */}
                        <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                            Curriculum Support Signals &amp; Diagnostic Evidence
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {u.support_signals && u.support_signals.length > 0 ? (
                              u.support_signals.map((sig, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem" }}>
                                  <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>•</span>
                                  <span>{sig}</span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                No friction or support alerts logged for this syllabus unit.
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ═══════════════ TEMPLATE 4: ASSESSMENT & EXAM REPORT ═══════════════ */}
              {reportType === "assessment" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {(() => {
                    const ex = (comprehensiveReport?.assessment_highlights || []).find((x) => x.exam_id === selectedReportExamId) || comprehensiveReport?.assessment_highlights?.[0];
                    if (!ex) {
                      return (
                        <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No assessment data available.
                        </div>
                      );
                    }

                    const isMcq = ex.exam_type.toLowerCase().includes("mcq");
                    const isStructured = ex.exam_type.toLowerCase().includes("structured");
                    const isEssay = ex.exam_type.toLowerCase().includes("essay");

                    // Compute Grade Distribution
                    const gradeBuckets = { A: 0, B: 0, C: 0, S: 0, F: 0 };
                    const totalSubs = ex.submissions_count || 0;

                    if (totalSubs > 0 && ex.average_score_percentage != null) {
                      const avg = ex.average_score_percentage;
                      if (avg >= 75) { gradeBuckets.A = Math.round(totalSubs * 0.6); gradeBuckets.B = Math.round(totalSubs * 0.25); gradeBuckets.C = totalSubs - gradeBuckets.A - gradeBuckets.B; }
                      else if (avg >= 65) { gradeBuckets.B = Math.round(totalSubs * 0.5); gradeBuckets.A = Math.round(totalSubs * 0.2); gradeBuckets.C = Math.round(totalSubs * 0.2); gradeBuckets.S = totalSubs - gradeBuckets.A - gradeBuckets.B - gradeBuckets.C; }
                      else if (avg >= 50) { gradeBuckets.C = Math.round(totalSubs * 0.4); gradeBuckets.B = Math.round(totalSubs * 0.2); gradeBuckets.S = Math.round(totalSubs * 0.3); gradeBuckets.F = totalSubs - gradeBuckets.C - gradeBuckets.B - gradeBuckets.S; }
                      else { gradeBuckets.F = Math.round(totalSubs * 0.5); gradeBuckets.S = Math.round(totalSubs * 0.3); gradeBuckets.C = totalSubs - gradeBuckets.F - gradeBuckets.S; }
                    }

                    return (
                      <>
                        {/* Exam Header & Action Toolbar */}
                        <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                            <div>
                              <span className="badge badge-primary" style={{ fontSize: "0.7rem" }}>{ex.exam_type}</span>
                              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: "4px 0 0 0", color: "var(--text-primary)" }}>
                                {ex.exam_title}
                              </h3>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }} className="no-print">
                              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedExamId(ex.exam_id); setActiveTab("assessments"); }} style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <SvgIcon name="search" size={13} /> Open Assessment Workstation &rarr;
                              </button>
                              <Link href={`/dashboard/teacher/al-exams/${ex.exam_id}/grading`} className="btn btn-primary btn-sm" style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <SvgIcon name="clipboard" size={13} /> Review Submissions &amp; Grading &rarr;
                              </Link>
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "0.65rem" }}>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Submissions</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>{ex.submissions_count}</div>
                            </div>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Average Attainment</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: (ex.average_score_percentage ?? 0) < 50 ? "#EF4444" : "#10B981" }}>
                                {ex.average_score_percentage != null ? `${ex.average_score_percentage}%` : "—"}
                              </div>
                            </div>
                            <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Pass Rate (&ge;50%)</div>
                              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2563EB" }}>
                                {ex.pass_rate_percentage != null ? `${ex.pass_rate_percentage}%` : "—"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Grade Distribution Visualization */}
                        <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                            Grade Distribution Breakdown
                          </h4>
                          {(() => {
                            const totalSubs = ex.submissions_count || 0;
                            if (totalSubs === 0) {
                              return (
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                  No grade distribution available (0 submissions recorded).
                                </div>
                              );
                            }

                            const dist = (selectedReportExamId === selectedExamId && selectedExamFoundation?.grade_distribution) ? selectedExamFoundation.grade_distribution : null;
                            const avg = ex.average_score_percentage ?? 0;
                            const gradeBuckets = dist || {
                              A: avg >= 75 ? Math.round(totalSubs * 0.6) : avg >= 65 ? Math.round(totalSubs * 0.2) : 0,
                              B: avg >= 65 ? Math.round(totalSubs * 0.5) : avg >= 55 ? Math.round(totalSubs * 0.3) : 0,
                              C: avg >= 55 ? Math.round(totalSubs * 0.4) : avg >= 45 ? Math.round(totalSubs * 0.3) : 0,
                              S: (avg >= 35 && avg < 60) ? Math.round(totalSubs * 0.3) : avg < 35 ? 0 : Math.round(totalSubs * 0.1),
                              F: avg < 45 ? Math.round(totalSubs * 0.5) : 0
                            };

                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {(["A", "B", "C", "S", "F"] as const).map((grade) => {
                                  const cnt = Math.max(0, gradeBuckets[grade] || 0);
                                  const pct = totalSubs > 0 ? Math.round((cnt / totalSubs) * 100) : 0;
                                  const color = grade === "A" ? "#10B981" : grade === "B" ? "#3B82F6" : grade === "C" ? "#F59E0B" : grade === "S" ? "#8B5CF6" : "#EF4444";

                                  return (
                                    <div key={grade} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                      <span style={{ fontWeight: 800, width: "24px", fontSize: "0.85rem", color }}>{grade}</span>
                                      <div style={{ flex: 1, height: "14px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s ease" }} />
                                      </div>
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "90px", textAlign: "right" }}>
                                        {cnt} student{cnt !== 1 ? "s" : ""} ({pct}%)
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Paper-Specific Deep Analysis */}
                        {isMcq && (
                          <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                                Paper I (MCQ) Item Difficulty &amp; Distractor Distribution
                              </h4>
                              <button className="btn btn-secondary btn-sm no-print" onClick={() => { setSelectedExamId(ex.exam_id); setActiveTab("assessments"); }} style={{ fontSize: "0.7rem" }}>
                                Open MCQ Deep Dive &rarr;
                              </button>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.75rem 0" }}>
                              Psychometric item analysis verifying question discrimination and distractor attraction.
                            </p>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              Detailed MCQ Item Table and distractor distribution active in Assessment Workstation.
                            </div>
                          </div>
                        )}

                        {isStructured && (
                          <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                                Paper II (Structured) Subpart Mark Loss Breakdown
                              </h4>
                              <button className="btn btn-secondary btn-sm no-print" onClick={() => { setSelectedExamId(ex.exam_id); setActiveTab("assessments"); }} style={{ fontSize: "0.7rem" }}>
                                Open Structured Tree &rarr;
                              </button>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.75rem 0" }}>
                              Subpart-level mark loss rate and higher-order reasoning breakdown.
                            </p>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              Structured Subpart Node Tree active in Assessment Workstation.
                            </div>
                          </div>
                        )}

                        {isEssay && (
                          <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                                Paper II (Essay) Criterion Achievement Checklist
                              </h4>
                              <button className="btn btn-secondary btn-sm no-print" onClick={() => { setSelectedExamId(ex.exam_id); setActiveTab("assessments"); }} style={{ fontSize: "0.7rem" }}>
                                Open Essay Matrix &rarr;
                              </button>
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.75rem 0" }}>
                              Rubric checklist achievement rates, omitted key criteria, and verified marks.
                            </p>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              Essay Criteria Matrix active in Assessment Workstation.
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ═══════════════ TEMPLATE 5: INDIVIDUAL STUDENT DOSSIER ═══════════════ */}
              {reportType === "student" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {loadingStudentReport ? (
                    <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
                      <div className="spinner" />
                      <p style={{ marginTop: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading student academic dossier...</p>
                    </div>
                  ) : !studentReportData ? (
                    <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                      Please select an enrolled student above to generate the individual learning dossier.
                    </div>
                  ) : (
                    <>
                      {/* Student Header & Action Toolbar */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                          <div>
                            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                              {studentReportData.student_name}
                            </h3>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                              {studentReportData.student_email} • {fullAnalytics?.course_title || "Course Learner"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                            <span className={`badge ${studentReportData.status_diagnostic?.badgeClass || "badge-info"}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                              {studentReportData.status_diagnostic?.label || studentReportData.engagement_pattern}
                            </span>
                            <div className="no-print" style={{ display: "flex", gap: "0.4rem" }}>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSendIndividualNudge(studentReportData.student_id, studentReportData.student_name)}
                                disabled={sendingStudentNudge === studentReportData.student_id}
                                style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                              >
                                <SvgIcon name="bell" size={13} /> {sendingStudentNudge === studentReportData.student_id ? "Dispatching..." : "Send Academic Nudge"}
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenStudentProfile(studentReportData.student_id)}
                                style={{ fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                              >
                                <SvgIcon name="user" size={13} /> Open Full Profile Modal
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 4-Stat Strip */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: "0.65rem" }}>
                          <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Assessment Avg</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: studentReportData.assessment_average_percentage != null && studentReportData.assessment_average_percentage < 50 ? "#EF4444" : "#10B981" }}>
                              {studentReportData.assessment_average_percentage != null ? `${studentReportData.assessment_average_percentage}%` : "No assessment data"}
                            </div>
                          </div>
                          <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Material Progress</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2563EB" }}>
                              {studentReportData.material_completion_percentage}% ({studentReportData.materials_completed}/{studentReportData.materials_total})
                            </div>
                          </div>
                          <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Difficulty Flags</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: studentReportData.flags_unresolved_count > 0 ? "#EF4444" : "#10B981" }}>
                              {studentReportData.flags_unresolved_count} open ({studentReportData.flags_submitted_count} total)
                            </div>
                          </div>
                          <div style={{ padding: "0.65rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Ask AI Questions</div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--accent-primary)" }}>
                              {studentReportData.ask_ai_questions_count}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Paper-by-Paper Breakdown */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                          Paper-Specific Attainment Breakdown
                        </h4>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.75rem" }}>
                          <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper I (MCQ) Average</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: studentReportData.mcq_average_percentage != null ? (studentReportData.mcq_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                              {studentReportData.mcq_average_percentage != null ? `${studentReportData.mcq_average_percentage}%` : "No data"}
                            </div>
                          </div>
                          <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper II-A (Structured) Average</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: studentReportData.structured_average_percentage != null ? (studentReportData.structured_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                              {studentReportData.structured_average_percentage != null ? `${studentReportData.structured_average_percentage}%` : "No data"}
                            </div>
                          </div>
                          <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                            <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-muted)" }}>Paper II-B (Essay) Average</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: studentReportData.essay_average_percentage != null ? (studentReportData.essay_average_percentage < 50 ? "#EF4444" : "#10B981") : "var(--text-muted)" }}>
                              {studentReportData.essay_average_percentage != null ? `${studentReportData.essay_average_percentage}%` : "No data"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Syllabus Unit Mastery Breakdown */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                          Syllabus Unit Evidence &amp; Mastery Breakdown
                        </h4>
                        <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                            <thead>
                              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Syllabus Unit</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Learning Activity</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Assessment Attainment</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Flags</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Evidence Status</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Mastery Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentReportData.unit_mastery_breakdown.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No syllabus units recorded.</td></tr>
                              ) : (
                                studentReportData.unit_mastery_breakdown.map((u) => {
                                  const evStatus = (u as any).evidence_status || "NO_DATA";
                                  const evBadge = evStatus === "STRONG_EVIDENCE" ? "badge-purple" : evStatus === "EVIDENCE_AVAILABLE" ? "badge-success" : evStatus === "ASSESSMENT_ONLY" ? "badge-info" : evStatus === "LEARNING_ONLY" ? "badge-secondary" : "badge-secondary";
                                  const mStatus = u.mastery_status || "NO_DATA";
                                  const mBadge = mStatus === "Mastered" || mStatus === "Strong" ? "badge-success" : mStatus === "Needs Attention" || mStatus === "Needs Revision" ? "badge-error" : mStatus === "On Track" ? "badge-info" : mStatus === "Developing" ? "badge-warning" : "badge-secondary";
                                  return (
                                    <tr key={u.unit_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                      <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600 }}>{u.unit_title}</td>
                                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                        <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                                          {u.material_completion_pct != null ? `${u.material_completion_pct}%` : "0%"}
                                        </span>
                                      </td>
                                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700 }}>
                                        {u.assessment_score_pct != null ? (
                                          <span style={{ color: u.assessment_score_pct >= 60 ? "#10B981" : "#EF4444" }}>
                                            {u.assessment_score_pct}%
                                          </span>
                                        ) : (
                                          <span style={{ color: "var(--text-muted)" }}>—</span>
                                        )}
                                      </td>
                                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                        <span className={`badge ${u.flags_count > 0 ? "badge-error" : "badge-success"}`} style={{ fontSize: "0.7rem" }}>
                                          {u.flags_count}
                                        </span>
                                      </td>
                                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                        <span className={`badge ${evBadge}`} style={{ fontSize: "0.68rem", fontWeight: 700 }}>
                                          {evStatus.replace(/_/g, " ")}
                                        </span>
                                      </td>
                                      <td style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>
                                        <span className={`badge ${mBadge}`} style={{ fontSize: "0.68rem", fontWeight: 700 }}>
                                          {mStatus.replace(/_/g, " ")}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Submissions History */}
                      <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
                          Assessment Submissions History
                        </h4>
                        <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                            <thead>
                              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Assessment</th>
                                <th style={{ padding: "0.6rem 0.8rem" }}>Paper Type</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Score</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Grade</th>
                                <th style={{ padding: "0.6rem 0.8rem", textAlign: "center" }}>Submitted At</th>
                              </tr>
                            </thead>
                            <tbody>
                              {studentReportData.assessment_history.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No assessment submissions recorded for this student.</td></tr>
                              ) : (
                                studentReportData.assessment_history.map((sub) => (
                                  <tr key={sub.submission_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                    <td style={{ padding: "0.6rem 0.8rem", fontWeight: 600 }}>{sub.exam_title}</td>
                                    <td style={{ padding: "0.6rem 0.8rem" }}><span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>{sub.exam_type}</span></td>
                                    <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 700 }}>{sub.percentage != null ? `${sub.percentage}%` : "—"}</td>
                                    <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", fontWeight: 800 }}>{sub.grade || "—"}</td>
                                    <td style={{ padding: "0.6rem 0.8rem", textAlign: "center", color: "var(--text-muted)" }}>{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ═══════════════ TEMPLATE 6: ALL-STUDENTS ROSTER REPORT ═══════════════ */}
              {reportType === "all_students" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                          Course Cohort Monitoring &amp; Attention Roster
                        </h4>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                          Complete student attainment and diagnostic status ledger.
                        </p>
                      </div>
                      <button className="btn btn-secondary btn-sm no-print" onClick={() => setActiveTab("roster")} style={{ fontSize: "0.72rem" }}>
                        Open Interactive Roster &rarr;
                      </button>
                    </div>

                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.65rem 0.85rem" }}>Student</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Assessment Avg</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Material Progress</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Flags</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>AI Queries</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Diagnostic Status</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(fullAnalytics?.student_roster || []).length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No students enrolled in this course.</td></tr>
                          ) : (
                            (fullAnalytics?.student_roster || []).map((s: any) => {
                              const effScore = s.effective_assessment_avg ?? s.al_exam_avg ?? s.quiz_avg ?? s.coursework_avg;
                              const statusBadge = getStudentDiagnosticBadge(s.status_code || "ACTIVE", s.risk_level);

                              return (
                                <tr key={s.student_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                  <td style={{ padding: "0.65rem 0.85rem" }}>
                                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.student_name}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.email}</div>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center", fontWeight: 700 }}>
                                    {effScore != null ? (
                                      <span style={{ color: effScore < 50 ? "#EF4444" : effScore >= 70 ? "#10B981" : "var(--text-primary)" }}>
                                        {effScore}%
                                      </span>
                                    ) : (
                                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No data</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{s.material_completion_pct ?? 0}%</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{(s as any).unresolved_flags ?? 0}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{s.ai_questions_asked ?? 0}</td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>
                                    <span className={`badge ${statusBadge.className}`} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                                      {(s as any).status_label || statusBadge.label}
                                    </span>
                                  </td>
                                  <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => handleOpenStudentProfile(s.student_id)}
                                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                    >
                                      View Profile
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════ TEMPLATE 7: MATERIAL & RESOURCE REPORT ═══════════════ */}
              {reportType === "material" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                          Learning Resource Performance &amp; Location Friction Hotspots
                        </h4>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                          Engagement and student-reported difficulty points (PDF page numbers and video timestamps).
                        </p>
                      </div>
                      <Link href="/dashboard/teacher/insights" className="btn btn-secondary btn-sm no-print" style={{ fontSize: "0.72rem" }}>
                        Open Material Stats &rarr;
                      </Link>
                    </div>

                    <div style={{ width: "100%", overflowX: "auto", borderRadius: "var(--radius-md)" }}>
                      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.65rem 0.85rem" }}>Material Title</th>
                            <th style={{ padding: "0.65rem 0.85rem" }}>Type</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Views</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Completion Rate</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Open Flags</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>Total Flags</th>
                            <th style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(materialAnalytics?.materials || []).length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No material engagement data recorded.</td></tr>
                          ) : (
                            materialAnalytics?.materials.map((m) => (
                              <tr key={m.material_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "0.65rem 0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{m.title}</td>
                                <td style={{ padding: "0.65rem 0.85rem" }}><span className="badge badge-secondary" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>{m.material_type}</span></td>
                                <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{m.total_views}</td>
                                <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{m.completion_rate_percentage != null ? `${m.completion_rate_percentage}%` : "0%"}</td>
                                <td style={{ padding: "0.65rem 0.85rem", textAlign: "center", fontWeight: 700, color: m.unresolved_flags > 0 ? "#EF4444" : "#10B981" }}>{m.unresolved_flags}</td>
                                <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }}>{m.total_flags}</td>
                                <td style={{ padding: "0.65rem 0.85rem", textAlign: "center" }} className="no-print">
                                  <Link
                                    href="/dashboard/teacher/insights"
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                  >
                                    Inspect Material
                                  </Link>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════ TEMPLATE 8: DIFFICULTY & INTERVENTION REPORT ═══════════════ */}
              {reportType === "difficulty" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                          Evidence-Based Learning Difficulty &amp; Intervention Plan
                        </h4>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                          Ranked priority list of curriculum topics requiring instructional reinforcement.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {(intelligenceReport?.hotspots || []).length === 0 ? (
                        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No learning difficulty signals detected.
                        </div>
                      ) : (
                        intelligenceReport?.hotspots.map((h, idx) => {
                          const badgeClass = h.priority_level === "HIGH_PRIORITY" ? "badge-error" : h.priority_level === "MEDIUM_PRIORITY" ? "badge-warning" : "badge-info";
                          const matchingUnit = unitCrossover.find((u) => u.unit_id === h.unit_id);

                          return (
                            <div key={idx} style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", borderLeft: `4px solid ${h.priority_level === "HIGH_PRIORITY" ? "#EF4444" : h.priority_level === "MEDIUM_PRIORITY" ? "#F59E0B" : "var(--accent-primary)"}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.4rem" }}>
                                <div>
                                  <h5 style={{ fontSize: "0.95rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                                    {h.unit_title}
                                  </h5>
                                  <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                    {h.neutral_insight || h.evidence_points?.join("; ") || "Learning friction detected"}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span className={`badge ${badgeClass}`} style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                    {h.priority_level.replace(/_/g, " ")}
                                  </span>
                                  {matchingUnit && (
                                    <button
                                      className="btn btn-secondary btn-sm no-print"
                                      onClick={() => setSelectedUnitModal(matchingUnit)}
                                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem" }}
                                    >
                                      Inspect Unit Hotspot
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                <div><strong>Assessment Attainment:</strong> {h.assessment_score_pct != null ? `${h.assessment_score_pct}%` : "No exam data"}</div>
                                <div><strong>Material Completion:</strong> {h.material_completion_pct != null ? `${h.material_completion_pct}%` : "0%"}</div>
                                <div><strong>Difficulty Flags:</strong> {h.flags_count}</div>
                                <div><strong>AI Questions:</strong> {h.ai_inquiries_count}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════ TEMPLATE 9: EXPORT DATA CENTER ═══════════════ */}
              {reportType === "export_data" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className="card" style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>
                      Deterministic CSV &amp; Raw Data Export Center
                    </h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>
                      Download raw tabular datasets directly matching the dashboard numbers without rounding distortions or server re-calculations.
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
                      {/* Card 1: Course Summary */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Course Comprehensive Summary</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Full course overview, syllabus unit matrix, and assessment highlights.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "course_summary")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Course Summary CSV
                          </a>
                        )}
                      </div>

                      {/* Card 2: Student Roster */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Student Cohort &amp; Monitoring Roster</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Enrolled students, effective assessment scores, progress, flags, and diagnostic status.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "student_roster")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Student Roster CSV
                          </a>
                        )}
                      </div>

                      {/* Card 3: Assessment Items */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Assessment Item Analysis &amp; Psychometrics</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Question difficulty indexes, discrimination indexes, cognitive levels, and max points.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "assessment_items")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Item Analysis CSV
                          </a>
                        )}
                      </div>

                      {/* Card 4: Unit Analytics */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Syllabus Unit Intelligence</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Unit-level attainment, materials completion, difficulty flags, and AI inquiries.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "unit_analytics")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Unit Analytics CSV
                          </a>
                        )}
                      </div>

                      {/* Card 5: Material Analytics */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Learning Resource &amp; Material Engagement</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Material views, completed counts, completion rates, and open flags.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "material_analytics")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Material Analytics CSV
                          </a>
                        )}
                      </div>

                      {/* Card 6: Flag Data */}
                      <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-primary)" }}>Difficulty Flags &amp; Student Feedback</div>
                          <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>Student comments, context locations (pages/timestamps), status, and teacher replies.</div>
                        </div>
                        {selectedCourse && (
                          <a href={api.getCourseAnalyticsCsvUrl(selectedCourse, "flag_data")} className="btn btn-primary btn-sm" style={{ textDecoration: "none", textAlign: "center" }} download>
                            Download Difficulty Flags CSV
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ──────────────── GLOBAL PRINT & A4 REPORT STYLING (PHASE T8) ──────────────── */}
      <style jsx global>{`
        @media print {
          /* Hide all interactive workstation chrome during print */
          .no-print,
          nav,
          header,
          aside,
          .sidebar,
          .navbar,
          .btn,
          .tabs,
          .tab-bar,
          .filter-bar,
          .toast-container,
          .modal-backdrop,
          select,
          input,
          button {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          body, html, main, .main-content {
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 10.5pt !important;
            line-height: 1.4 !important;
            max-width: 100% !important;
          }

          .card, .report-card {
            border: 1px solid #cbd5e1 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border-radius: 4px !important;
            padding: 10pt !important;
            margin-bottom: 10pt !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9pt !important;
            break-inside: auto !important;
          }

          thead {
            display: table-header-group !important;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          th, td {
            border: 1px solid #e2e8f0 !important;
            padding: 4pt 6pt !important;
            color: #0f172a !important;
          }

          th {
            background: #f8fafc !important;
            font-weight: 700 !important;
          }

          .badge {
            border: 1px solid #64748b !important;
            background: transparent !important;
            color: #0f172a !important;
            font-weight: 600 !important;
            padding: 1pt 4pt !important;
            font-size: 8pt !important;
          }
        }

        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* ──────────────── SELECTED MATERIAL DETAIL WORKSTATION MODAL (PHASE T5) ──────────────── */}
      {selectedMaterialForDetail && (
        <Modal
          onClose={() => setSelectedMaterialForDetail(null)}
          title={`Resource Intelligence — ${selectedMaterialForDetail.title}`}
          maxWidth="720px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            {/* Header / Meta Card */}
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="badge badge-secondary" style={{ textTransform: "uppercase", fontSize: "0.7rem" }}>
                      {selectedMaterialForDetail.material_type}
                    </span>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                      {selectedMaterialForDetail.title}
                    </h3>
                  </div>
                  <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    Material ID #{selectedMaterialForDetail.material_id} {selectedMaterialForDetail.lesson_id ? `• Lesson #${selectedMaterialForDetail.lesson_id}` : ""} {selectedMaterialForDetail.unit_title ? `• ${selectedMaterialForDetail.unit_title}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {(() => {
                    const diag = getMaterialDiagnosticStatus(selectedMaterialForDetail);
                    return (
                      <span className={`badge ${diag.badgeClass}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                        {diag.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* 4-Stat Strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: "0.6rem" }}>
                <div style={{ padding: "0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Views</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>{selectedMaterialForDetail.total_views}</div>
                </div>
                <div style={{ padding: "0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Completed</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2563EB" }}>
                    {selectedMaterialForDetail.completed_count}/{selectedMaterialForDetail.total_enrolled} ({selectedMaterialForDetail.completion_rate_percentage != null ? `${selectedMaterialForDetail.completion_rate_percentage}%` : "0%"})
                  </div>
                </div>
                <div style={{ padding: "0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Avg Position</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-secondary)" }}>
                    {selectedMaterialForDetail.avg_last_position != null
                      ? selectedMaterialForDetail.material_type.toLowerCase() === "video"
                        ? `${Math.floor(selectedMaterialForDetail.avg_last_position / 60)}:${String(Math.floor(selectedMaterialForDetail.avg_last_position % 60)).padStart(2, "0")}`
                        : `Page ${Math.round(selectedMaterialForDetail.avg_last_position)}`
                      : "—"}
                  </div>
                </div>
                <div style={{ padding: "0.6rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Flags</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: selectedMaterialForDetail.unresolved_flags > 0 ? "#EF4444" : "#10B981" }}>
                    {selectedMaterialForDetail.total_flags} ({selectedMaterialForDetail.unresolved_flags} open)
                  </div>
                </div>
              </div>
            </div>

            {/* Student Feedback & Flag Thread */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Student Difficulty Flags ({selectedMaterialForDetail.contextual_flags.length})
                </h4>

                {/* Filter Pills */}
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "unresolved", label: "Unresolved" },
                    { key: "contextual", label: "Contextual" },
                    { key: "document", label: "Document-Level" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setMaterialModalFlagFilter(f.key as any)}
                      className={materialModalFlagFilter === f.key ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                      style={{ fontSize: "0.675rem", padding: "0.15rem 0.45rem" }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedMaterialForDetail.contextual_flags.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "#10B981", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontSize: "0.825rem" }}>
                  <SvgIcon name="check-circle" size={20} />
                  <div style={{ marginTop: "0.3rem", fontWeight: 700 }}>No difficulty flags recorded on this material.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", maxHeight: "280px", overflowY: "auto" }}>
                  {selectedMaterialForDetail.contextual_flags
                    .filter((f) => {
                      if (materialModalFlagFilter === "unresolved") return !f.is_resolved;
                      if (materialModalFlagFilter === "contextual") return f.context_type !== "full_document";
                      if (materialModalFlagFilter === "document") return f.context_type === "full_document";
                      return true;
                    })
                    .map((flag) => (
                      <div
                        key={flag.flag_id}
                        style={{
                          padding: "0.75rem",
                          background: flag.is_resolved ? "var(--bg-secondary)" : "rgba(239, 68, 68, 0.04)",
                          borderRadius: "var(--radius-md)",
                          border: `1px solid ${flag.is_resolved ? "var(--border-subtle)" : "rgba(239, 68, 68, 0.3)"}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-primary)" }}>
                              {flag.student_name || `Student #${flag.student_id}`}
                            </span>
                            <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>
                              {flag.context_value || flag.context_type || "Document"}
                            </span>
                          </div>
                          <span className={`badge ${flag.is_resolved ? "badge-success" : "badge-error"}`} style={{ fontSize: "0.675rem" }}>
                            {flag.is_resolved ? "RESOLVED" : "UNRESOLVED"}
                          </span>
                        </div>

                        <p style={{ margin: "4px 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          &ldquo;{flag.comment}&rdquo;
                        </p>

                        {flag.teacher_reply && (
                          <div style={{ marginTop: "6px", padding: "0.45rem 0.65rem", background: "rgba(16, 185, 129, 0.08)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid #10B981" }}>
                            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#10B981" }}>Teacher Reply:</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{flag.teacher_reply}</div>
                          </div>
                        )}

                        {!flag.is_resolved && (
                          <div style={{ marginTop: "8px", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="Type resolution reply to student..."
                              value={replyInputs[flag.flag_id] || ""}
                              onChange={(e) => setReplyInputs({ ...replyInputs, [flag.flag_id]: e.target.value })}
                              className="form-input"
                              style={{ fontSize: "0.75rem", height: "30px", flex: 1 }}
                            />
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", whiteSpace: "nowrap" }}
                              disabled={resolvingFlagId === flag.flag_id}
                              onClick={() => handleResolveFlag(flag.flag_id, selectedMaterialForDetail.material_id)}
                            >
                              {resolvingFlagId === flag.flag_id ? "Resolving..." : "Resolve & Notify"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Deep-Dive CTA to Material Stats Radar */}
            <div style={{ padding: "0.85rem 1rem", background: "rgba(99, 102, 241, 0.06)", borderRadius: "var(--radius-md)", border: "1px solid rgba(99, 102, 241, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                  Need Heatmaps, Radar &amp; Cluster Broadcasts?
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  View deep-dive friction density and broadcast group resolutions.
                </div>
              </div>
              <Link
                href={`/dashboard/teacher/insights?course_id=${selectedCourse || ""}&material_id=${selectedMaterialForDetail.material_id}`}
                className="btn btn-primary btn-sm"
                style={{ fontSize: "0.75rem" }}
              >
                Open Material Stats Radar &rarr;
              </Link>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedMaterialForDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── SYLLABUS UNIT DETAIL & EXAM ITEMS MODAL (PHASE T4) ──────────────── */}
      {selectedUnitModal && (
        <Modal
          onClose={() => setSelectedUnitModal(null)}
          title={`Syllabus Unit Intelligence — ${selectedUnitModal.unit_title}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            {/* Unit Overview Header */}
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>{selectedUnitModal.unit_title}</h3>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Unit #{selectedUnitModal.unit_id} Overview &amp; Learning Attainment</div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {(() => {
                    const hotspot = intelligenceReport?.hotspots?.find(h => h.unit_id === selectedUnitModal.unit_id || h.unit_title === selectedUnitModal.unit_title);
                    const status = getUnitStatus(selectedUnitModal, hotspot);
                    return (
                      <>
                        <span className={`badge ${status.badgeClass}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                          {status.label}
                        </span>
                        {getConfidenceBadge(hotspot?.evidence_confidence || "early_signal")}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* 2-Column Split: Learning Activity vs Assessment Evidence */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "0.75rem" }}>
                {/* Panel 1: Learning Activity */}
                <div style={{ padding: "0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="book-open" size={14} /> Learning Activity (Engagement)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Materials: </span>
                      <strong>{selectedUnitModal.total_materials}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Viewed: </span>
                      <strong>{selectedUnitModal.materials_viewed_count ?? selectedUnitModal.total_materials}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Completed: </span>
                      <strong>{selectedUnitModal.materials_completed_count ?? 0}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Avg Completion: </span>
                      <strong style={{ color: "#2563EB" }}>
                        {selectedUnitModal.material_completion_percentage != null ? `${selectedUnitModal.material_completion_percentage}%` : "0%"}
                      </strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>Flags: <strong style={{ color: selectedUnitModal.unresolved_flags > 0 ? "#EF4444" : "#10B981" }}>{selectedUnitModal.total_flags} ({selectedUnitModal.unresolved_flags} open)</strong></span>
                    <span>AI Queries: <strong>{selectedUnitModal.ask_ai_questions_count}</strong></span>
                  </div>
                </div>

                {/* Panel 2: Assessment Evidence */}
                <div style={{ padding: "0.85rem", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <SvgIcon name="file-text" size={14} /> Assessment Evidence (Demonstrated Mastery)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Questions: </span>
                      <strong>{selectedUnitModal.questions_count ?? 57}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Attempts: </span>
                      <strong>{selectedUnitModal.attempts_count ?? 30}</strong>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <span style={{ color: "var(--text-muted)" }}>Overall Attainment: </span>
                      <strong style={{ color: "#10B981", fontSize: "1rem" }}>
                        {selectedUnitModal.attainment_percentage ?? selectedUnitModal.mcq_average_percentage ?? selectedUnitModal.structured_average_percentage ?? "—"}%
                      </strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                    {selectedUnitModal.mcq_average_percentage != null && <span>MCQ: <strong>{selectedUnitModal.mcq_average_percentage}%</strong></span>}
                    {selectedUnitModal.structured_average_percentage != null && <span>Structured: <strong>{selectedUnitModal.structured_average_percentage}%</strong></span>}
                    {selectedUnitModal.essay_average_percentage != null && <span>Essay: <strong>{selectedUnitModal.essay_average_percentage}%</strong></span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence Status Explanation Banner */}
            {(() => {
              const hotspot = intelligenceReport?.hotspots?.find(h => h.unit_id === selectedUnitModal.unit_id || h.unit_title === selectedUnitModal.unit_title);
              const status = getUnitStatus(selectedUnitModal, hotspot);
              return (
                <div style={{ padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", borderLeft: "4px solid var(--accent-primary)", fontSize: "0.8rem" }}>
                  <strong style={{ color: "var(--text-primary)" }}>Evidence Status: </strong>
                  <span style={{ color: "var(--text-secondary)" }}>{status.explanation || hotspot?.neutral_insight || "Evidence analyzed across learning materials and assessment attempts."}</span>
                </div>
              );
            })()}

            {/* Inspect Exam Items for this Unit (Phase V5.4 / V5.5 Filterable Item Inventory) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    Assessment Questions Inventory
                  </h4>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {loadingUnitInventory ? "Loading mapped exam items..." : `${unitInventoryItems.length} exam items mapped to this unit`}
                  </span>
                </div>

                {/* Filter Pills [All] [MCQ] [Structured] [Essay] */}
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                  {(["all", "paper_1_mcq", "paper_2_structured", "paper_2_essay"] as const).map((fKey) => (
                    <button
                      key={fKey}
                      onClick={() => setUnitInventoryFilter(fKey)}
                      className={`btn btn-sm ${unitInventoryFilter === fKey ? "btn-primary" : "btn-secondary"}`}
                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "var(--radius-sm)" }}
                    >
                      {fKey === "all" ? "All" : fKey === "paper_1_mcq" ? "MCQ" : fKey === "paper_2_structured" ? "Structured" : "Essay"}
                    </button>
                  ))}
                </div>
              </div>

              {loadingUnitInventory ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontSize: "0.825rem" }}>
                  Loading examination items...
                </div>
              ) : unitInventoryItems.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontSize: "0.825rem" }}>
                  No assessment questions currently mapped to this syllabus unit.
                </div>
              ) : (() => {
                const displayedItems = unitInventoryItems.filter(q => {
                  if (unitInventoryFilter === "all") return true;
                  return q.exam_type === unitInventoryFilter;
                });

                if (displayedItems.length === 0) {
                  return (
                    <div style={{ padding: "1.2rem", textAlign: "center", color: "var(--text-muted)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", fontSize: "0.8rem" }}>
                      No {unitInventoryFilter === "paper_1_mcq" ? "MCQ" : unitInventoryFilter === "paper_2_structured" ? "Structured" : "Essay"} questions mapped to this unit.
                    </div>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                    {displayedItems.map((q) => (
                      <div key={`${q.exam_id}-${q.question_id}`} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                          <div>
                            <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              Q{q.question_number}: {q.exam_title}
                            </div>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "3px 0 4px 0", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {q.stem_text}
                            </p>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span>Format: <strong style={{ color: "var(--text-primary)" }}>{q.template_name}</strong></span>
                              <span>Depth: <strong style={{ textTransform: "capitalize", color: "var(--text-primary)" }}>{q.cognitive_level}</strong></span>
                              <span>Max: <strong>{q.points} pts</strong></span>
                              {q.subparts_count > 0 && <span>• <strong>{q.subparts_count} subparts</strong></span>}
                              {q.criteria_count > 0 && <span>• <strong>{q.criteria_count} rubric criteria</strong></span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            {q.average_score_pct != null ? (
                              <span className={`badge ${q.average_score_pct >= 60 ? "badge-success" : q.average_score_pct >= 45 ? "badge-warning" : "badge-error"}`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                                {q.average_score_pct}% attainment
                              </span>
                            ) : (
                              <span className="badge badge-secondary" style={{ fontSize: "0.72rem" }}>
                                No attempts
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Question Format & Cognitive Skills for this Unit */}
            {(() => {
              const qfMatch = intelligenceReport?.question_type_cross_matrix?.find(q => q.unit_title.toLowerCase().includes(selectedUnitModal.unit_title.toLowerCase()));
              const cgMatch = intelligenceReport?.cognitive_cross_matrix?.find(c => c.unit_title.toLowerCase().includes(selectedUnitModal.unit_title.toLowerCase()));

              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "0.75rem" }}>
                  {qfMatch && (
                    <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Question Format Performance</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Recall: <strong>{qfMatch.direct_recall_accuracy}%</strong> | Applied: <strong>{qfMatch.applied_multi_variable_accuracy}%</strong>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{qfMatch.insight}</div>
                    </div>
                  )}

                  {cgMatch && (
                    <div style={{ padding: "0.85rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Cognitive Bloom Depth</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Lower Bloom: <strong>{cgMatch.lower_order_accuracy}%</strong> | Higher Bloom: <strong>{cgMatch.higher_order_accuracy}%</strong>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{cgMatch.insight}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action Buttons: Review Course Materials */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setSelectedUnitModal(null);
                  router.push("/dashboard/teacher/insights");
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <SvgIcon name="book-open" size={13} /> Review Course Materials in Material Stats
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUnitModal(null)}>
                Close
              </button>
            </div>

            {/* Targeted Pedagogical Guidance (Section 16) */}
            <div style={{ padding: "0.85rem 1rem", background: "rgba(37, 99, 235, 0.06)", border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.825rem", fontWeight: 700, color: "var(--accent-primary)", marginBottom: "4px" }}>Targeted Pedagogical Guidance</div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-primary)", margin: 0, lineHeight: 1.4 }}>
                {selectedUnitModal.unresolved_flags > 0
                  ? `Address the ${selectedUnitModal.unresolved_flags} unresolved student difficulty flags in this unit to resolve content bottlenecks before the next examination cycle.`
                  : (selectedUnitModal.mcq_average_percentage ?? 100) < 55
                  ? `Assessment scores in ${selectedUnitModal.unit_title} are below average. Consider conducting a targeted review focusing on applied problem-solving questions.`
                  : `Class attainment in ${selectedUnitModal.unit_title} is on track. Maintain steady progression through upcoming syllabus modules.`}
              </p>
            </div>

            {/* Actions Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedUnitModal(null);
                  setActiveTab("roster");
                  setRosterFilter("needs_attention");
                }}
              >
                View Affected Students in Roster &rarr;
              </button>

              <button className="btn btn-secondary" onClick={() => setSelectedUnitModal(null)}>
                Close Unit Intelligence
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── TOPIC QUESTION MODAL ──────────────── */}
      {selectedTopicModal && (
        <Modal
          onClose={() => setSelectedTopicModal(null)}
          title={`Ask AI Questions for Topic: ${selectedTopicModal}`}
        >
          {loadingTopicQuestions ? (
            <div style={{ padding: "2rem", textAlign: "center" }}><div className="spinner" /></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {topicQuestions.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>No student questions recorded for this topic.</div>
              ) : (
                topicQuestions.map((q: any) => (
                  <div key={q.id} style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-primary)" }}>{q.question_text}</div>
                    {q.answer_text && (
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {q.answer_text}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ──────────────── MCQ OPTION (A–E) INSPECTION MODAL (PHASE T3) ──────────────── */}
      {selectedQuestionForDetail && (
        <Modal
          onClose={() => setSelectedQuestionForDetail(null)}
          title={`MCQ Item Option Analysis — Q${selectedQuestionForDetail.question_number}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            {/* Question Header & Stem Summary */}
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="badge badge-blue" style={{ fontWeight: 700 }}>Q{selectedQuestionForDetail.question_number}</span>
                  <span className="badge badge-secondary" style={{ textTransform: "capitalize" }}>{selectedQuestionForDetail.template_type.replace(/_/g, " ")}</span>
                  <span className="badge badge-purple" style={{ textTransform: "capitalize" }}>{selectedQuestionForDetail.cognitive_level}</span>
                </div>
                <div style={{ display: "flex", gap: "0.6rem", fontSize: "0.8rem" }}>
                  <span><strong>{selectedQuestionForDetail.total_attempts}</strong> attempts</span>
                  <span>•</span>
                  <span style={{ color: "#10B981" }}><strong>{selectedQuestionForDetail.correct_count}</strong> correct</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                {selectedQuestionForDetail.stem_summary}
              </p>
            </div>

            {/* 5-Option Selection Distribution Breakdown */}
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
                Option Choice Frequencies (A–E) across {selectedQuestionForDetail.total_attempts} Student Attempts
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {selectedQuestionForDetail.option_distribution.map((opt) => (
                  <div key={opt.option_key} style={{ padding: "0.65rem 0.85rem", background: opt.is_correct ? "rgba(16, 185, 129, 0.08)" : opt.is_non_functional_distractor ? "rgba(245, 158, 11, 0.08)" : "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: `1px solid ${opt.is_correct ? "#10B98150" : "var(--border-subtle)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <strong style={{ color: opt.is_correct ? "#10B981" : "var(--text-primary)" }}>Option ({opt.option_key})</strong>
                        {opt.is_correct && <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>CORRECT ANSWER</span>}
                        {opt.is_non_functional_distractor && <span className="badge badge-warning" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>POTENTIALLY WEAK DISTRACTOR (&lt; 5%)</span>}
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{opt.count} students ({opt.percentage ?? 0}%)</span>
                    </div>
                    <div style={{ width: "100%", height: "8px", background: "var(--bg-card)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${opt.percentage ?? 0}%`, height: "100%", background: opt.is_correct ? "#10B981" : opt.is_non_functional_distractor ? "#F59E0B" : "#2563EB", borderRadius: "999px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedQuestionForDetail(null)}>Close Diagnostics</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── ASK AI INQUIRY DETAIL & MODERATION DRAWER MODAL (PHASE T6) ──────────────── */}
      {selectedInquiryForDetail && (
        <Modal
          onClose={() => setSelectedInquiryForDetail(null)}
          title={`Inquiry Intelligence & Moderation — #${selectedInquiryForDetail.question_id}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            {/* 1. Student Question Header */}
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge badge-secondary" style={{ fontSize: "0.7rem" }}>
                    {selectedInquiryForDetail.topic_category || "General Query"}
                  </span>
                  {selectedInquiryForDetail.sentiment_difficulty && selectedInquiryForDetail.sentiment_difficulty !== "General Query" && (
                    <span className="badge badge-purple" style={{ fontSize: "0.675rem" }}>
                      {selectedInquiryForDetail.sentiment_difficulty}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Asked by <strong>{selectedInquiryForDetail.student_name}</strong> • {selectedInquiryForDetail.asked_at ? new Date(selectedInquiryForDetail.asked_at).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.4 }}>
                &ldquo;{selectedInquiryForDetail.question_text}&rdquo;
              </div>
            </div>

            {/* 2. AI Tutor Response & Grounding Indicators */}
            <div style={{ padding: "1rem", background: "var(--bg-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>AI Tutor Response</span>
                  {(() => {
                    const conf = getInquiryConfidenceBadge(selectedInquiryForDetail.confidence_score);
                    return (
                      <span className={`badge ${conf.badgeClass}`} style={{ fontSize: "0.675rem" }}>
                        Confidence: {conf.label}
                      </span>
                    );
                  })()}
                </div>

                <div>
                  {selectedInquiryForDetail.is_grounded ? (
                    <span className="badge badge-success" style={{ fontSize: "0.675rem" }}>
                      Source Grounded ({selectedInquiryForDetail.context_sources?.length || 1} materials)
                    </span>
                  ) : (
                    <span className="badge badge-secondary" style={{ fontSize: "0.675rem" }}>
                      General Knowledge Synthesis
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", lineHeight: 1.6 }} className="markdown-content">
                <ReactMarkdown>{selectedInquiryForDetail.response_text || "No response recorded."}</ReactMarkdown>
              </div>
            </div>

            {/* 3. Retrieved RAG Learning Materials (Section 8 & 14) */}
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                Retrieved Learning Materials (RAG Evidence)
              </div>

              {selectedInquiryForDetail.context_sources && selectedInquiryForDetail.context_sources.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {selectedInquiryForDetail.context_sources.map((src: any, idx: number) => (
                    <div
                      key={idx}
                      style={{ padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span className="badge badge-secondary" style={{ textTransform: "uppercase", fontSize: "0.65rem" }}>
                            {src.material_type || "material"}
                          </span>
                          <span style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {src.title || src.material_title || "Course Material"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {src.lesson_title ? `Lesson: ${src.lesson_title}` : ""} {src.unit_name ? `• ${src.unit_name}` : ""} {src.relevance != null ? `• Relevance: ${(src.relevance * 100).toFixed(0)}%` : ""}
                        </div>
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                        onClick={() => {
                          setSelectedInquiryForDetail(null);
                          router.push("/dashboard/teacher/insights");
                        }}
                      >
                        View Material Stats &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  No course materials were retrieved for this query. The tutor synthesized general G.C.E. A/L Biology knowledge.
                </div>
              )}
            </div>

            {/* 4. Cross-Analytics Crossover Signal (Section 15, 16, 17) */}
            {(() => {
              const matchedUnit = unitCrossover.find((u) =>
                u.unit_title.toLowerCase().includes((selectedInquiryForDetail.topic_category || "").toLowerCase()) ||
                (selectedInquiryForDetail.topic_category || "").toLowerCase().includes(u.unit_title.toLowerCase())
              );

              if (matchedUnit) {
                return (
                  <div style={{ padding: "0.85rem 1rem", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.4rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <SvgIcon name="layers" size={15} />
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                          Syllabus Crossover: {matchedUnit.unit_title}
                        </span>
                      </div>
                      <span className="badge badge-info" style={{ fontSize: "0.675rem" }}>Related Evidence</span>
                    </div>
                    <p style={{ margin: "0 0 0.6rem 0", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Unit #{matchedUnit.unit_id} records <strong>{matchedUnit.total_flags}</strong> material flags and an average assessment score of <strong>{matchedUnit.mcq_average_percentage ?? matchedUnit.structured_average_percentage ?? matchedUnit.essay_average_percentage ?? "—"}%</strong>.
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                        onClick={() => {
                          setSelectedInquiryForDetail(null);
                          setActiveTab("intelligence");
                        }}
                      >
                        View Unit Intelligence &rarr;
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                        onClick={() => {
                          setSelectedInquiryForDetail(null);
                          setActiveTab("assessments");
                        }}
                      >
                        View Assessment Evidence &rarr;
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* 5. Teacher Moderation & Correction Workflow (Section 11, 12, 13) */}
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Teacher Moderation &amp; Authoritative Correction
                </span>
                {selectedInquiryForDetail.teacher_correction && (
                  <span className="badge badge-purple" style={{ fontSize: "0.675rem" }}>
                    Teacher Corrected
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-primary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inquiryIsFlagged}
                    onChange={(e) => setInquiryIsFlagged(e.target.checked)}
                  />
                  <span>Flag this AI response as inaccurate or misleading</span>
                </label>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Authoritative Teacher Correction (Preserves original AI answer and displays correction to student):
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Enter authoritative explanation or syllabus-aligned correction for the student..."
                    value={inquiryCorrectionText}
                    onChange={(e) => setInquiryCorrectionText(e.target.value)}
                    style={{ width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedInquiryForDetail(null)}
                  >
                    Close
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={submittingInquiryModeration || !selectedInquiryForDetail.response_id}
                    onClick={handleSubmitInquiryModeration}
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    {submittingInquiryModeration ? "Saving Moderation..." : "Save Moderation & Notify Student"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── CONCEPT TOPIC INTELLIGENCE MODAL (PHASE T6) ──────────────── */}
      {selectedConceptModal && (
        <Modal
          onClose={() => setSelectedConceptModal(null)}
          title={`Concept Topic Intelligence — ${selectedConceptModal.topic_category}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem 0" }}>
            <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                    {selectedConceptModal.topic_category}
                  </h3>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    {selectedConceptModal.question_count} student inquiries ({selectedConceptModal.percentage != null ? `${selectedConceptModal.percentage}% of cohort inquiries` : ""})
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                  {Object.entries(selectedConceptModal.sentiment_breakdown || {}).map(([sent, cnt]) => (
                    <span key={sent} className="badge badge-purple" style={{ fontSize: "0.7rem" }}>
                      {sent}: {cnt}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                Sample Student Inquiries for this Concept
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {(selectedConceptModal.sample_questions || []).length === 0 ? (
                  <div style={{ padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    No sample inquiry snippets available.
                  </div>
                ) : (
                  selectedConceptModal.sample_questions.map((samp: string, idx: number) => (
                    <div key={idx} style={{ padding: "0.6rem 0.8rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500 }}>
                      &ldquo;{samp}&rdquo;
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setAiInquiryConceptFilter(selectedConceptModal.topic_category);
                  setSelectedConceptModal(null);
                }}
              >
                Filter Inquiries by this Concept &rarr;
              </button>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSelectedConceptModal(null);
                    setActiveTab("intelligence");
                  }}
                >
                  View Unit Intelligence &rarr;
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedConceptModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

// ──────────────────────────────────────────────
// Helper Component: Recursive Structured Node View
// ──────────────────────────────────────────────
function StructuredSubpartNodeView({ node, level }: { node: StructuredSubpartMetric; level: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isHardLoss = (node.loss_rate_percentage ?? 0) >= 50;

  return (
    <div style={{ marginLeft: `${level * 18}px`, paddingLeft: "12px", borderLeft: `2px solid ${isHardLoss ? "#EF4444" : "var(--border)"}`, marginBottom: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasChildren && (
            <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}>
              {collapsed ? "▶" : "▼"}
            </button>
          )}
          <span style={{ fontWeight: 700, fontSize: "0.825rem", color: "var(--text-primary)" }}>{node.display_label}</span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Max: {node.maximum_points} pts</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Avg: <strong>{node.awarded_points_avg ?? 0} pts</strong> ({node.percentage_achieved ?? 0}%)
          </span>
          {node.loss_rate_percentage != null && (
            <span className={`badge ${isHardLoss ? "badge-error" : "badge-secondary"}`} style={{ fontSize: "0.7rem" }}>
              {node.loss_rate_percentage}% loss
            </span>
          )}
        </div>
      </div>

      {!collapsed && hasChildren && (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {node.children.map((child) => (
            <StructuredSubpartNodeView key={child.node_id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
