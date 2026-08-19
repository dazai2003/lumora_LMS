"""
Canonical Pydantic Data Contracts and Schemas for Lumora Analytics Foundation.
Enforces consistent concept and field naming across all analytics subsystems.
"""
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime


class AnalyticsMeta(BaseModel):
    sample_size: int = 0
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    data_quality: str = "sufficient" # "sufficient", "insufficient_sample", "degraded"
    execution_time_ms: Optional[float] = None


class AnalyticsResponseEnvelope(BaseModel):
    status: str = "success" # "success", "warning", "error"
    data: Any
    meta: AnalyticsMeta


# ──────────────────────────────────────────────
# MCQ Item Analysis Data Contracts
# ──────────────────────────────────────────────

class OptionDistributionItem(BaseModel):
    option_key: str # "A", "B", "C", "D", "E"
    count: int = 0
    percentage: Optional[float] = None
    is_correct: bool = False
    is_non_functional_distractor: bool = False # < 5% selection


class DiscriminationMetric(BaseModel):
    value: Optional[float] = None
    sample_size: int = 0
    valid: bool = False
    confidence: str = "insufficient_sample" # "sufficient_sample", "low_confidence", "insufficient_sample"
    reason: Optional[str] = None


class MCQItemMetric(BaseModel):
    question_id: int
    question_number: int
    template_type: str
    stem_summary: str
    cognitive_level: str
    difficulty: str
    points: float
    correct_option: Optional[str] = None
    
    total_attempts: int = 0
    answered_count: int = 0
    unanswered_count: int = 0
    correct_count: int = 0
    incorrect_count: int = 0
    
    difficulty_index_p: Optional[float] = None # Success rate 0.0 - 1.0
    percentage_score: Optional[float] = None # 0.0 - 100.0%
    discrimination: DiscriminationMetric
    option_distribution: List[OptionDistributionItem] = []


class MCQExamAnalyticsReport(BaseModel):
    exam_id: int
    exam_title: str
    total_questions: int
    total_submissions: int
    average_score: Optional[float] = None
    average_percentage: Optional[float] = None
    median_percentage: Optional[float] = None
    highest_percentage: Optional[float] = None
    lowest_percentage: Optional[float] = None
    
    cognitive_level_breakdown: Dict[str, Any] = {}
    template_type_breakdown: Dict[str, Any] = {}
    difficulty_level_breakdown: Dict[str, Any] = {}
    hardest_questions: List[Dict[str, Any]] = []
    easiest_questions: List[Dict[str, Any]] = []
    
    questions: List[MCQItemMetric] = []


# ──────────────────────────────────────────────
# Structured Question Hierarchy Data Contracts
# ──────────────────────────────────────────────

class StructuredSubpartMetric(BaseModel):
    node_id: str # e.g. "Q1.a.i"
    display_label: str # e.g. "Q1 Part A (i)"
    part_type: str # "main_question", "part", "subpart", "nested_subpart"
    prompt_text: Optional[str] = None
    expected_keywords: List[str] = []
    
    maximum_points: float = 0.0
    awarded_points_avg: Optional[float] = None
    percentage_achieved: Optional[float] = None
    loss_rate_percentage: Optional[float] = None
    
    total_attempts: int = 0
    successful_attempts: int = 0
    children: List["StructuredSubpartMetric"] = []


class StructuredQuestionMetric(BaseModel):
    question_id: int
    question_number: int
    stem_summary: str
    total_points: float
    total_attempts: int = 0
    average_score: Optional[float] = None
    average_percentage: Optional[float] = None
    hierarchy: List[StructuredSubpartMetric] = []


class StructuredExamAnalyticsReport(BaseModel):
    exam_id: int
    exam_title: str
    total_questions: int
    total_submissions: int
    average_score: Optional[float] = None
    average_percentage: Optional[float] = None
    subpart_loss_ranking: List[Dict[str, Any]] = []
    questions: List[StructuredQuestionMetric] = []


# ──────────────────────────────────────────────
# Essay Question Rubric Data Contracts
# ──────────────────────────────────────────────

class EssayCriterionMetric(BaseModel):
    criterion_id: Union[int, str]
    item_number: int
    criterion_text: str
    max_points: float = 0.0
    
    total_attempts: int = 0
    awarded_count: int = 0
    omitted_count: int = 0
    omission_frequency_percentage: Optional[float] = None
    success_percentage: Optional[float] = None
    average_awarded_points: Optional[float] = None


class EssayQuestionMetric(BaseModel):
    question_id: int
    question_number: int
    stem_summary: str
    total_points: float
    total_attempts: int = 0
    average_score: Optional[float] = None
    average_percentage: Optional[float] = None
    criteria_count: int = 0
    criteria: List[EssayCriterionMetric] = []


class EssayExamAnalyticsReport(BaseModel):
    exam_id: int
    exam_title: str
    total_questions: int
    total_submissions: int
    average_score: Optional[float] = None
    average_percentage: Optional[float] = None
    most_omitted_criteria: List[Dict[str, Any]] = []
    questions: List[EssayQuestionMetric] = []


# ──────────────────────────────────────────────
# Material & Content Analytics Data Contracts
# ──────────────────────────────────────────────

class ContextualFlagMetric(BaseModel):
    flag_id: int
    student_id: int
    student_name: Optional[str] = None
    context_type: str # "timestamp", "pdf_page", "full_document"
    context_value: Optional[str] = None
    comment: Optional[str] = None
    is_resolved: bool = False
    teacher_reply: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: str


class MaterialEngagementMetric(BaseModel):
    material_id: int
    lesson_id: Optional[int] = None
    lesson_title: Optional[str] = None
    unit_id: Optional[int] = None
    unit_title: Optional[str] = None
    title: str
    material_type: str
    total_enrolled: int = 0
    total_views: int = 0
    completed_count: int = 0
    completion_rate_percentage: Optional[float] = None
    avg_last_position: Optional[float] = None
    
    total_flags: int = 0
    unresolved_flags: int = 0
    resolved_flags: int = 0
    contextual_flags: List[ContextualFlagMetric] = []


class CourseMaterialAnalyticsReport(BaseModel):
    course_id: int
    course_title: str
    total_materials: int
    total_enrolled: int
    overall_completion_rate: Optional[float] = None
    total_flags: int = 0
    total_unresolved_flags: int = 0
    materials: List[MaterialEngagementMetric] = []


# ──────────────────────────────────────────────
# Ask AI Tutor Analytics Data Contracts
# ──────────────────────────────────────────────

class AIConceptTopicMetric(BaseModel):
    topic_category: str
    question_count: int = 0
    percentage: Optional[float] = None
    sentiment_breakdown: Dict[str, int] = {}
    sample_questions: List[str] = []


class AIInquiryDetailMetric(BaseModel):
    question_id: int
    student_id: int
    student_name: str
    question_text: str
    response_id: Optional[int] = None
    response_text: Optional[str] = None
    confidence_score: Optional[float] = None
    is_grounded: bool = False
    context_sources: Optional[List[Dict[str, Any]]] = None
    topic_category: Optional[str] = None
    sentiment_difficulty: Optional[str] = None
    is_flagged: bool = False
    teacher_correction: Optional[str] = None
    asked_at: str


class AskAIAnalyticsReport(BaseModel):
    course_id: int
    course_title: str
    total_questions_asked: int
    answered_questions_count: int
    unique_students_count: int = 0
    low_confidence_count: int = 0
    flagged_count: int = 0
    teacher_corrected_count: int = 0
    average_confidence_score: Optional[float] = None
    source_grounded_percentage: Optional[float] = None
    topic_categories: List[AIConceptTopicMetric] = []
    sentiment_distribution: Dict[str, int] = {}
    recent_ai_logs_summary: Dict[str, Any] = {}
    detailed_inquiries: List[AIInquiryDetailMetric] = []


# ──────────────────────────────────────────────
# Exam Foundation Overview Contract
# ──────────────────────────────────────────────

class ExamFoundationOverview(BaseModel):
    exam_id: int
    title: str
    exam_type: str
    time_limit_minutes: int
    total_questions: int = 0
    raw_mark_cap: Optional[float] = 100.0
    is_published: bool = False
    
    total_submissions: int = 0
    in_progress_count: int = 0
    submitted_count: int = 0
    ai_graded_count: int = 0
    teacher_verified_count: int = 0
    
    average_raw_score: Optional[float] = None
    average_scaled_score: Optional[float] = None
    average_percentage: Optional[float] = None
    median_percentage: Optional[float] = None
    highest_percentage: Optional[float] = None
    lowest_percentage: Optional[float] = None
    
    score_distribution_buckets: Dict[str, int] = {}
    grade_distribution: Dict[str, int] = {}


# ──────────────────────────────────────────────
# Data Quality Diagnostic Contract
# ──────────────────────────────────────────────

class DataQualityAnomaly(BaseModel):
    severity: str # "error", "warning", "info"
    category: str # "orphan_record", "out_of_bounds", "missing_field", "malformed_json"
    entity_type: str
    entity_id: Optional[int] = None
    description: str
    context: Dict[str, Any] = {}


class DataQualityReport(BaseModel):
    target_type: str # "exam", "course"
    target_id: int
    total_checks_run: int = 0
    errors_count: int = 0
    warnings_count: int = 0
    is_clean: bool = True
    anomalies: List[DataQualityAnomaly] = []


# ──────────────────────────────────────────────
# Phase A3: Learning Behaviour & Student Profile Contracts
# ──────────────────────────────────────────────

class UnitLearningAssessmentCrossover(BaseModel):
    unit_id: int
    unit_title: str
    total_materials: int = 0
    materials_viewed_count: int = 0
    materials_completed_count: int = 0
    material_completion_percentage: Optional[float] = None
    total_material_views: int = 0
    total_flags: int = 0
    unresolved_flags: int = 0
    ask_ai_questions_count: int = 0
    questions_count: int = 0
    attempts_count: int = 0
    attainment_percentage: Optional[float] = None
    mcq_average_percentage: Optional[float] = None
    structured_average_percentage: Optional[float] = None
    essay_average_percentage: Optional[float] = None
    evidence_state: str = "NO_DATA" # "NO_DATA", "LEARNING_ONLY", "ASSESSMENT_ONLY", "LIMITED_DATA", "EVIDENCE_AVAILABLE", "STRONG_EVIDENCE"
    support_signals: List[str] = []


class CourseLearningOverview(BaseModel):
    course_id: int
    course_title: str
    enrolled_students: int = 0
    active_learners_30d: int = 0
    total_materials: int = 0
    materials_viewed_count: int = 0
    materials_completed_count: int = 0
    average_material_completion_percentage: Optional[float] = None
    average_revisit_frequency: Optional[float] = None
    total_flags: int = 0
    unresolved_flags: int = 0
    flag_resolution_rate_percentage: Optional[float] = None
    ask_ai_questions_count: int = 0
    unique_students_asking_ai: int = 0
    top_flagged_materials: List[Dict[str, Any]] = []
    top_revisited_materials: List[Dict[str, Any]] = []
    temporal_activity: Dict[str, Any] = {}
    unit_crossover_profiles: List[UnitLearningAssessmentCrossover] = []


class StudentSupportSignalItem(BaseModel):
    signal_type: str # "frequent_revisits", "elevated_ai_queries", "attainment_gap", "unresolved_flags", "high_completion_low_performance"
    severity: str # "info", "warning", "attention"
    topic_or_material: str
    evidence_text: str


class StudentLearningProfileReport(BaseModel):
    student_id: int
    student_name: str
    student_email: str
    enrolled_courses_count: int = 0
    materials_completed: int = 0
    materials_total: int = 0
    material_completion_percentage: Optional[float] = None
    frequently_revisited_materials: List[Dict[str, Any]] = []
    flags_submitted_count: int = 0
    flags_unresolved_count: int = 0
    ask_ai_questions_count: int = 0
    top_asked_topics: List[Dict[str, Any]] = []
    recent_flags: List[Dict[str, Any]] = []
    recent_ai_questions: List[Dict[str, Any]] = []
    assessment_history: List[Dict[str, Any]] = []
    assessment_average_percentage: Optional[float] = None
    highest_assessment_percentage: Optional[float] = None
    recent_assessment_percentage: Optional[float] = None
    mcq_average_percentage: Optional[float] = None
    structured_average_percentage: Optional[float] = None
    essay_average_percentage: Optional[float] = None
    unit_mastery_breakdown: List[Dict[str, Any]] = []
    engagement_pattern: str = "Insufficient Activity"
    status_diagnostic: Dict[str, Any] = {}
    support_signals: List[StudentSupportSignalItem] = []
    recommended_interventions: List[Dict[str, Any]] = []
    last_activity_at: Optional[str] = None


# ──────────────────────────────────────────────
# Phase A4: Student Personal Mastery Contracts
# ──────────────────────────────────────────────

class StudentSyllabusUnitMastery(BaseModel):
    unit_id: int
    unit_title: str
    assessment_mastery_percentage: Optional[float] = None
    learning_activity_percentage: Optional[float] = None
    materials_total: int = 0
    materials_completed: int = 0
    questions_count: int = 0
    attempts_count: int = 0
    mcq_percentage: Optional[float] = None
    structured_percentage: Optional[float] = None
    essay_percentage: Optional[float] = None
    material_completion_percentage: Optional[float] = None
    evidence_state: str = "NO_DATA" # "NO_DATA", "LEARNING_ONLY", "ASSESSMENT_ONLY", "LIMITED_DATA", "EVIDENCE_AVAILABLE", "STRONG_EVIDENCE"
    mastery_status: str # "Strong", "Developing", "Needs Revision", "Insufficient Data", "No Activity", "Studied — Awaiting Assessment"
    data_source_note: str = "" # e.g. "Based on MCQ and Structured data", "Based on MCQ data"
    
    # Granular Question-Type Breakdown per Unit
    mcq_breakdown: Dict[str, Any] = {}
    structured_breakdown: Dict[str, Any] = {}
    essay_breakdown: Dict[str, Any] = {}


class QuestionTypeMasteryItem(BaseModel):
    template_type: str
    template_name: str
    paper_phase: str = "Paper I (MCQ)" # "Paper I (MCQ)", "Paper II Part A (Structured)", "Paper II Part B (Essay)"
    attempts_count: int = 0
    correct_count: int = 0
    accuracy_percentage: Optional[float] = None
    mastery_status: str # "Strong", "Developing", "Needs Revision", "Not Attempted", "Early Data"


class CognitiveSkillMasteryItem(BaseModel):
    cognitive_level: str
    attempts_count: int = 0
    correct_count: int = 0
    accuracy_percentage: Optional[float] = None
    mastery_status: str # "Strong", "Developing", "Needs Revision", "Not Attempted", "Early Data"


class RevisionPriorityItem(BaseModel):
    priority_rank: int
    unit_id: Optional[int] = None
    unit_title: str
    current_performance_percentage: Optional[float] = None
    evidence_rationale: str
    suggested_action: str


class StudentPersonalMasteryReport(BaseModel):
    student_id: int
    student_name: str
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    
    # Overview KPIs
    enrolled_courses_count: int = 0
    materials_completed: int = 0
    materials_total: int = 0
    material_completion_percentage: Optional[float] = None
    assessments_completed: int = 0
    average_assessment_percentage: Optional[float] = None
    latest_assessment_percentage: Optional[float] = None
    latest_assessment_title: Optional[str] = None
    latest_assessment_date: Optional[str] = None
    
    # Progress & Trends
    performance_trend: List[Dict[str, Any]] = [] # [{ "date": "...", "exam_title": "...", "percentage": 72.0 }]
    strongest_unit: Optional[str] = None
    revision_priority_unit: Optional[str] = None
    
    # Detailed Mastery Breakdowns
    syllabus_unit_mastery: List[StudentSyllabusUnitMastery] = []
    question_type_mastery: List[QuestionTypeMasteryItem] = []
    mcq_formats: List[QuestionTypeMasteryItem] = []
    structured_formats: List[QuestionTypeMasteryItem] = []
    essay_formats: List[QuestionTypeMasteryItem] = []
    cognitive_skills_mastery: List[CognitiveSkillMasteryItem] = []
    revision_priorities: List[RevisionPriorityItem] = []
    paper_phases_summary: Dict[str, Any] = {}
    
    # Detailed Assessment Deep Dive (MCQ, Structured, Essay)
    mcq_deep_dive: Dict[str, Any] = {}
    structured_deep_dive: Dict[str, Any] = {}
    essay_deep_dive: Dict[str, Any] = {}
    
    # Paper Components (legacy summary)
    structured_summary: Dict[str, Any] = {}
    essay_summary: Dict[str, Any] = {}
    
    # Personal Activity
    assessment_history: List[Dict[str, Any]] = []
    frequently_revisited_materials: List[Dict[str, Any]] = []
    personal_flags: List[Dict[str, Any]] = []
    personal_ai_topics: List[Dict[str, Any]] = []
    personal_signals: List[str] = []


# ──────────────────────────────────────────────
# Phase A5: Advanced Cross-Analytics & Learning Intelligence Contracts
# ──────────────────────────────────────────────

class ActionableTargetLink(BaseModel):
    label: str
    target_url: str
    action_type: str # "review_material", "view_questions", "inspect_item", "ask_ai", "practice_exam"


class ContentHotspotIntelligence(BaseModel):
    hotspot_id: str
    unit_id: Optional[int] = None
    unit_title: str
    priority_level: str # "HIGH_PRIORITY", "MEDIUM_PRIORITY", "MONITORING", "HEALTHY", "NO_DATA", "ASSESSMENT_ONLY", "LEARNING_ONLY"
    evidence_state: str = "NO_DATA" # "NO_DATA", "LEARNING_ONLY", "ASSESSMENT_ONLY", "LIMITED_DATA", "EVIDENCE_AVAILABLE", "STRONG_EVIDENCE"
    evidence_confidence: str # "strong_pattern", "emerging_pattern", "early_signal", "insufficient_data"
    evidence_points: List[str] = []
    material_completion_pct: Optional[float] = None
    assessment_score_pct: Optional[float] = None
    flags_count: int = 0
    unresolved_flags_count: int = 0
    ai_inquiries_count: int = 0
    subpart_losses_count: int = 0
    essay_omissions_count: int = 0
    neutral_insight: str
    recommended_actions: List[ActionableTargetLink] = []


class QuestionTypeTopicCrossItem(BaseModel):
    unit_title: str
    direct_recall_accuracy: Optional[float] = None
    applied_multi_variable_accuracy: Optional[float] = None
    gap_percentage: Optional[float] = None
    insight: str


class CognitiveLevelTopicCrossItem(BaseModel):
    unit_title: str
    lower_order_accuracy: Optional[float] = None # Remember + Understand
    higher_order_accuracy: Optional[float] = None # Apply + Analyze + Evaluate
    attenuation_gap: Optional[float] = None
    insight: str


class DistractorIntelligenceItem(BaseModel):
    question_id: int
    question_number: int
    exam_title: str
    stem_snippet: str
    correct_option: str
    strong_distractor_option: str
    distractor_selection_pct: float
    cognitive_level: str
    insight: str


class LongitudinalTopicTrendItem(BaseModel):
    unit_title: str
    trend_direction: str # "improving", "declining", "stable_strength", "persistent_weakness", "insufficient_data"
    score_progression: List[float] = []
    net_change_pct: Optional[float] = None
    insight: str


class TeacherCourseLearningIntelligenceReport(BaseModel):
    course_id: int
    course_title: str
    enrolled_students: int = 0
    total_assessments_analyzed: int = 0
    hotspots: List[ContentHotspotIntelligence] = []
    question_type_cross_matrix: List[QuestionTypeTopicCrossItem] = []
    cognitive_cross_matrix: List[CognitiveLevelTopicCrossItem] = []
    distractor_insights: List[DistractorIntelligenceItem] = []
    longitudinal_trends: List[LongitudinalTopicTrendItem] = []
    executive_summary_narrative: str
    ai_narrative_status: str = "deterministic_ready" # "deterministic_ready", "ai_generated", "fallback_used"


class StudentPersonalLearningIntelligenceReport(BaseModel):
    student_id: int
    student_name: str
    course_id: Optional[int] = None
    personal_hotspots: List[ContentHotspotIntelligence] = []
    question_format_divergence: List[QuestionTypeTopicCrossItem] = []
    cognitive_attenuation: List[CognitiveLevelTopicCrossItem] = []
    personal_longitudinal_trends: List[LongitudinalTopicTrendItem] = []
    actionable_recommendations: List[ActionableTargetLink] = []
    personal_executive_narrative: str
    ai_narrative_status: str = "deterministic_ready"


# ──────────────────────────────────────────────
# Phase A6: Analytics Reporting & Export Contracts
# ──────────────────────────────────────────────

class AssessmentHighlightItem(BaseModel):
    exam_id: int
    exam_title: str
    exam_type: str
    submissions_count: int
    average_score_percentage: Optional[float] = None
    pass_rate_percentage: Optional[float] = None


class CourseComprehensiveReport(BaseModel):
    course_id: int
    course_title: str
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    enrolled_students: int = 0
    active_learners_30d: int = 0
    average_material_completion: Optional[float] = None
    assessments_conducted: int = 0
    total_submissions: int = 0
    course_average_score: Optional[float] = None
    total_material_flags: int = 0
    unresolved_flags: int = 0
    total_ai_questions: int = 0
    executive_summary: str
    assessment_highlights: List[AssessmentHighlightItem] = []
    grade_distribution: Dict[str, int] = {}
    top_difficult_questions: List[Dict[str, Any]] = []
    syllabus_breakdown: List[Dict[str, Any]] = []
    learning_hotspots: List[ContentHotspotIntelligence] = []
    recommended_teacher_actions: List[ActionableTargetLink] = []
    ai_narrative_status: str = "deterministic_ready"


# ──────────────────────────────────────────────
# Phase V5.4: Cross-Analytics & Teacher Intelligence Contracts
# ──────────────────────────────────────────────

class LearningAssessmentDivergenceItem(BaseModel):
    unit_id: Optional[int] = None
    unit_title: str
    learning_activity_pct: Optional[float] = None
    assessment_score_pct: Optional[float] = None
    divergence_state: str # "ENGAGED_MASTERED", "ENGAGED_STRUGGLING", "LOW_ACTIVITY_HIGH_ATTAINMENT", "LOW_ACTIVITY_LOW_ATTAINMENT", "NO_DATA", "LEARNING_ONLY", "ASSESSMENT_ONLY", "LIMITED_DATA"
    divergence_label: str
    interpretation: str
    pedagogical_action: str
    evidence_points: List[str] = []


class UnitQuestionInventoryItem(BaseModel):
    question_id: int
    question_number: int
    exam_id: int
    exam_title: str
    exam_type: str # "paper_1_mcq", "paper_2a_structured", "paper_2b_essay"
    template_type: str
    template_name: str
    stem_text: str
    points: float
    average_score_pct: Optional[float] = None
    cognitive_level: str = "understand"
    subparts_count: int = 0
    criteria_count: int = 0


class UnitFormatDivergenceItem(BaseModel):
    unit_id: int
    unit_title: str
    mcq_attainment_pct: Optional[float] = None
    structured_attainment_pct: Optional[float] = None
    essay_attainment_pct: Optional[float] = None
    format_pattern: str # "CONSISTENT", "RECOGNITION_PROBLEM", "CONSTRUCTION_PROBLEM", "EXPLANATION_PROBLEM", "BROAD_WEAKNESS", "INSUFFICIENT_DATA"
    pattern_label: str
    insight: str


class CognitiveDepthIntelligence(BaseModel):
    unit_id: Optional[int] = None
    unit_title: str
    bloom_levels: Dict[str, Optional[float]] = {}
    lower_order_avg_pct: Optional[float] = None
    higher_order_avg_pct: Optional[float] = None
    has_taxonomy_metadata: bool = True
    insight: str


class UnitCrossAnalyticsItem(BaseModel):
    unit_id: int
    unit_title: str
    unit_order: int = 0
    materials_count: int = 0
    materials_viewed_count: int = 0
    materials_completed_count: int = 0
    material_completion_pct: Optional[float] = None
    total_material_views: int = 0
    difficulty_flags_count: int = 0
    unresolved_flags_count: int = 0
    ask_ai_inquiries_count: int = 0
    questions_count: int = 0
    evaluated_attempts_count: int = 0
    assessment_attainment_pct: Optional[float] = None
    mcq_attainment_pct: Optional[float] = None
    structured_attainment_pct: Optional[float] = None
    essay_attainment_pct: Optional[float] = None
    divergence_state: str = "NO_DATA"
    evidence_state: str = "NO_DATA"
    confidence_level: str = "limited" # "high", "moderate", "limited"
    evidence_explanation: str = ""
    why_this_matters: str = ""
    struggling_students_count: int = 0
    mastering_students_count: int = 0
    recommended_actions: List[ActionableTargetLink] = []


class TeacherCrossAnalyticsReport(BaseModel):
    course_id: int
    course_title: str
    enrolled_students: int = 0
    total_materials: int = 0
    total_questions: int = 0
    total_submissions_analyzed: int = 0
    units: List[UnitCrossAnalyticsItem] = []
    divergence_matrix: List[LearningAssessmentDivergenceItem] = []
    format_divergence_matrix: List[UnitFormatDivergenceItem] = []
    cognitive_intelligence: List[CognitiveDepthIntelligence] = []
    hotspots: List[ContentHotspotIntelligence] = []
    summary_counts: Dict[str, int] = {}


class StudentCrossAnalyticsDossier(BaseModel):
    student_id: int
    student_name: str
    student_email: str
    course_id: int
    course_title: str
    overall_assessment_pct: Optional[float] = None
    overall_material_completion_pct: Optional[float] = None
    total_flags_count: int = 0
    unresolved_flags_count: int = 0
    ask_ai_inquiries_count: int = 0
    primary_learning_signal: str = "Monitor" # "Strong", "Monitor", "Needs Attention", "High Priority"
    evidence_state: str = "NO_DATA"
    divergence_state: str = "NO_DATA"
    divergence_explanation: str = ""
    unit_breakdown: List[Dict[str, Any]] = []
    format_breakdown: Dict[str, Optional[float]] = {}
    cognitive_breakdown: Dict[str, Optional[float]] = {}
    suggested_teacher_actions: List[ActionableTargetLink] = []




