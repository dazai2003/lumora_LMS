"""
Lumora Analytics Service Package.
Provides centralized data contracts, normalization helpers, psychometric engines,
hierarchical traversers, material tracking, Ask AI topic metrics, and data quality auditors.
"""

from app.services.analytics.data_contracts import (
    AnalyticsMeta,
    AnalyticsResponseEnvelope,
    OptionDistributionItem,
    DiscriminationMetric,
    MCQItemMetric,
    MCQExamAnalyticsReport,
    StructuredSubpartMetric,
    StructuredQuestionMetric,
    StructuredExamAnalyticsReport,
    EssayCriterionMetric,
    EssayQuestionMetric,
    EssayExamAnalyticsReport,
    ContextualFlagMetric,
    MaterialEngagementMetric,
    CourseMaterialAnalyticsReport,
    AIConceptTopicMetric,
    AskAIAnalyticsReport,
    ExamFoundationOverview,
    DataQualityAnomaly,
    DataQualityReport,
    UnitLearningAssessmentCrossover,
    CourseLearningOverview,
    StudentSupportSignalItem,
    StudentLearningProfileReport,
    StudentSyllabusUnitMastery,
    QuestionTypeMasteryItem,
    CognitiveSkillMasteryItem,
    RevisionPriorityItem,
    StudentPersonalMasteryReport,
    ActionableTargetLink,
    ContentHotspotIntelligence,
    QuestionTypeTopicCrossItem,
    CognitiveLevelTopicCrossItem,
    DistractorIntelligenceItem,
    LongitudinalTopicTrendItem,
    TeacherCourseLearningIntelligenceReport,
    StudentPersonalLearningIntelligenceReport,
    AssessmentHighlightItem,
    CourseComprehensiveReport,
)

from app.services.analytics.normalization import (
    safe_div,
    safe_percentage,
    normalize_option_choice,
    normalize_cognitive_level,
    normalize_difficulty,
    parse_context_location,
)

from app.services.analytics.discrimination import calculate_item_discrimination
from app.services.analytics.mcq_analytics import compute_mcq_question_metrics, compute_mcq_exam_report
from app.services.analytics.structured_analytics import compute_structured_question_metrics, compute_structured_exam_report
from app.services.analytics.essay_analytics import compute_essay_question_metrics, compute_essay_exam_report
from app.services.analytics.material_analytics import compute_course_material_analytics
from app.services.analytics.ai_analytics import compute_ask_ai_analytics
from app.services.analytics.foundation_overview import compute_exam_foundation_overview
from app.services.analytics.data_quality import audit_exam_data_quality
from app.services.analytics.ai_categorization import categorize_student_question
from app.services.analytics.learning_analytics import compute_course_learning_overview, compute_unit_learning_assessment_crossover
from app.services.analytics.student_profile_analytics import compute_student_learning_profile
from app.services.analytics.student_mastery_analytics import compute_student_mastery_report
from app.services.analytics.learning_intelligence import (
    classify_evidence_confidence,
    compute_teacher_learning_intelligence,
    compute_student_learning_intelligence,
)
from app.services.analytics.reporting import (
    generate_course_analytics_report,
    generate_course_analytics_csv,
)

__all__ = [
    "AnalyticsMeta",
    "AnalyticsResponseEnvelope",
    "OptionDistributionItem",
    "DiscriminationMetric",
    "MCQItemMetric",
    "MCQExamAnalyticsReport",
    "StructuredSubpartMetric",
    "StructuredQuestionMetric",
    "StructuredExamAnalyticsReport",
    "EssayCriterionMetric",
    "EssayQuestionMetric",
    "EssayExamAnalyticsReport",
    "ContextualFlagMetric",
    "MaterialEngagementMetric",
    "CourseMaterialAnalyticsReport",
    "AIConceptTopicMetric",
    "AskAIAnalyticsReport",
    "ExamFoundationOverview",
    "DataQualityAnomaly",
    "DataQualityReport",
    "UnitLearningAssessmentCrossover",
    "CourseLearningOverview",
    "StudentSupportSignalItem",
    "StudentLearningProfileReport",
    "StudentSyllabusUnitMastery",
    "QuestionTypeMasteryItem",
    "CognitiveSkillMasteryItem",
    "RevisionPriorityItem",
    "StudentPersonalMasteryReport",
    "ActionableTargetLink",
    "ContentHotspotIntelligence",
    "QuestionTypeTopicCrossItem",
    "CognitiveLevelTopicCrossItem",
    "DistractorIntelligenceItem",
    "LongitudinalTopicTrendItem",
    "TeacherCourseLearningIntelligenceReport",
    "StudentPersonalLearningIntelligenceReport",
    "AssessmentHighlightItem",
    "CourseComprehensiveReport",
    "safe_div",
    "safe_percentage",
    "normalize_option_choice",
    "normalize_cognitive_level",
    "normalize_difficulty",
    "parse_context_location",
    "calculate_item_discrimination",
    "compute_mcq_question_metrics",
    "compute_mcq_exam_report",
    "compute_structured_question_metrics",
    "compute_structured_exam_report",
    "compute_essay_question_metrics",
    "compute_essay_exam_report",
    "compute_course_material_analytics",
    "compute_ask_ai_analytics",
    "compute_exam_foundation_overview",
    "audit_exam_data_quality",
    "categorize_student_question",
    "compute_course_learning_overview",
    "compute_unit_learning_assessment_crossover",
    "compute_student_learning_profile",
    "compute_student_mastery_report",
    "classify_evidence_confidence",
    "compute_teacher_learning_intelligence",
    "compute_student_learning_intelligence",
    "generate_course_analytics_report",
    "generate_course_analytics_csv",
]
