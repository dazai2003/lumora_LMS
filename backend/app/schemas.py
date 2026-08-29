"""
Lumora LMS — Pydantic Request & Response Data Contracts.

Defines strongly-typed data validation schemas across all architectural subsystems:
1. Authentication & Security: JWT tokens, user registration, role enforcement, and password resets.
2. Academic Hierarchy: Course administration, syllabus units, and lesson material associations.
3. Assessment Engine: G.C.E. Advanced Level Paper I (MCQ 7-templates), Paper II-A (Structured subparts),
   and Paper II-B (Essay rubrics) with validation rules for marks and cognitive tiers.
4. Student Submissions & SpeedGrader: Attempt lifecycle states, live autosave answer payloads,
   AI pre-grading suggestions, and teacher verification requests.
5. Psychometrics & Learning Analytics: Item discrimination indices, mastery distributions, and telemetry.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from app.models import UserRole, MaterialType, QuestionType, QuizStatus, PasswordResetStatus, ALExamType, ALQuestionTemplate, ALStructuredFormat


# ──────────────────────────────────────────────
# Authentication Schemas
# ──────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = UserRole.STUDENT


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None


class PasswordResetCreate(BaseModel):
    email: EmailStr
    reason: Optional[str] = None


class PasswordResetResolve(BaseModel):
    new_password: str = Field(..., min_length=6)


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)


class PasswordResetResponse(BaseModel):
    id: int
    user_id: int
    email: str
    reason: Optional[str] = None
    status: PasswordResetStatus
    temp_password: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# User Schemas
# ──────────────────────────────────────────────

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool = False
    profile_image: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    profile_image: Optional[str] = None
    is_active: Optional[bool] = None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=6)
    role: UserRole


# ──────────────────────────────────────────────
# Course Schemas
# ──────────────────────────────────────────────

class CourseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    subject: Optional[str] = None
    teacher_id: Optional[int] = None


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject: Optional[str] = None
    is_active: Optional[bool] = None
    is_paid_course: Optional[bool] = None
    monthly_price: Optional[float] = None
    full_price: Optional[float] = None


class CourseResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    cover_image: Optional[str] = None
    is_active: bool
    is_paid_course: bool = False
    monthly_price: Optional[float] = None
    full_price: Optional[float] = None
    teacher_id: int
    teacher_name: Optional[str] = None
    teacher_last_active_at: Optional[datetime] = None
    created_at: datetime
    lesson_count: Optional[int] = 0
    student_count: Optional[int] = 0

    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    cover_image: Optional[str] = None
    is_active: bool
    is_paid_course: bool = False
    monthly_price: Optional[float] = None
    full_price: Optional[float] = None
    teacher_name: Optional[str] = None
    teacher_last_active_at: Optional[datetime] = None
    lesson_count: Optional[int] = 0
    student_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Enrollment Schemas
# ──────────────────────────────────────────────

class EnrollmentCreate(BaseModel):
    course_id: int


class EnrollmentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    enrolled_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Unit Schemas
# ──────────────────────────────────────────────

class UnitCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    order: Optional[int] = 0
    course_id: int


class UnitUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None


class UnitReorderRequest(BaseModel):
    unit_ids: List[int]


class UnitResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    order: int
    course_id: int
    created_at: datetime
    lesson_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Lesson Schemas
# ──────────────────────────────────────────────

class LessonCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    order: Optional[int] = 0
    course_id: int
    unit_id: Optional[int] = None


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None
    is_published: Optional[bool] = None
    unit_id: Optional[int] = None


class LessonResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    order: int
    is_published: bool
    course_id: int
    unit_id: Optional[int] = None
    created_at: datetime
    material_count: Optional[int] = 0

    class Config:
        from_attributes = True


class UnitWithLessonsResponse(UnitResponse):
    lessons: List[LessonResponse] = []


# ──────────────────────────────────────────────
# Material Schemas
# ──────────────────────────────────────────────

class MaterialCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    material_type: MaterialType
    content: Optional[str] = None
    lesson_id: int


class MaterialResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    material_type: MaterialType
    category: Optional[str] = "general"
    file_path: Optional[str] = None
    content: Optional[str] = None
    extracted_text: Optional[str] = None
    processing_status: str
    course_id: Optional[int] = None
    lesson_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MaterialSummarizeRequest(BaseModel):
    summary_type: Optional[str] = "paragraph"  # "paragraph", "point_form", "student_notes"

class MaterialFlagCreate(BaseModel):
    context: str
    comment: str

class MaterialFlagResponse(BaseModel):
    id: int
    student_id: int
    material_id: int
    context: str
    comment: str
    is_resolved: bool
    created_at: datetime

    class Config:
        from_attributes = True

class StudentMaterialProgressUpdate(BaseModel):
    last_position: float
    is_completed: bool

class StudentMaterialProgressResponse(BaseModel):
    id: int
    student_id: int
    material_id: int
    last_position: float
    is_completed: bool
    updated_at: datetime

    class Config:
        from_attributes = True

class StudentCourseProgressResponse(BaseModel):
    student_id: int
    student_name: str
    course_id: int
    course_title: str
    completed_materials: int
    total_materials: int
    progress_percentage: float

class TeacherMaterialFlagResponse(MaterialFlagResponse):
    student_name: str
    material_title: str
    material_type: str

class MaterialNoteCreate(BaseModel):
    context: Optional[str] = None
    content: str

class MaterialNoteResponse(BaseModel):
    id: int
    student_id: int
    material_id: int
    context: Optional[str] = None
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Taxonomy Schemas
# ──────────────────────────────────────────────
class SubjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    
    class Config:
        from_attributes = True

class TopicResponse(BaseModel):
    id: int
    subject_id: int
    name: str
    description: Optional[str] = None
    
    class Config:
        from_attributes = True

class SubtopicResponse(BaseModel):
    id: int
    topic_id: int
    name: str
    description: Optional[str] = None
    
    class Config:
        from_attributes = True

# ──────────────────────────────────────────────
# Quiz & Question Schemas
# ──────────────────────────────────────────────

from app.models import Difficulty, CognitiveLevel, AIValidationStatus, TeacherApprovalStatus, QuizAttemptStatus, IntegrityEventType

class QuestionVersionCreate(BaseModel):
    question_text: str
    question_type: QuestionType
    options: Optional[List[str]] = None
    correct_answer: str
    explanation: Optional[str] = None
    default_points: float = 1.0
    difficulty: Optional[Difficulty] = None
    cognitive_level: Optional[CognitiveLevel] = None

class QuestionVersionResponse(BaseModel):
    id: int
    question_id: int
    version_number: Optional[int] = 1
    question_text: str
    question_type: QuestionType
    options: Optional[Any] = None
    correct_answer: Optional[str] = None  # Hidden from students during quiz taking
    explanation: Optional[str] = None
    default_points: float = 1.0
    difficulty: Optional[Difficulty] = None
    cognitive_level: Optional[CognitiveLevel] = None
    tags: Optional[List[str]] = None
    learning_outcome: Optional[str] = None
    estimated_completion_time_seconds: Optional[int] = 60
    correct_explanation: Optional[str] = None
    incorrect_explanation: Optional[str] = None
    suggested_reading: Optional[str] = None
    ai_validation_status: Optional[AIValidationStatus] = None
    teacher_approval_status: Optional[TeacherApprovalStatus] = None
    source_type: Optional[str] = None
    source_reference: Optional[str] = None
    created_at: datetime
    lesson_id: Optional[int] = None
    lesson_title: Optional[str] = None
    unit_id: Optional[int] = None
    unit_title: Optional[str] = None

    class Config:
        from_attributes = True

class QuestionStudentView(BaseModel):
    """View for students taking a quiz — correct_answer is hidden."""
    id: int
    question_id: int
    question_text: str
    question_type: QuestionType
    options: Optional[List[str]] = None
    points: float
    order: int

    class Config:
        from_attributes = True

class QuestionAnalyticsResponse(BaseModel):
    total_attempts: int = 0
    correct_attempts: int = 0
    success_rate: float = 0.0
    observed_difficulty: str = "unknown"
    distractor_distribution: dict = {}
    
    # Extended Phase 2 metrics
    question_id: Optional[int] = None
    attempts_count: Optional[int] = 0
    correct_count: Optional[int] = 0
    avg_response_time_seconds: Optional[float] = 0.0
    difficulty_index: Optional[float] = 0.0
    discrimination_index: Optional[float] = 0.0
    skip_count: Optional[int] = 0
    flag_count: Optional[int] = 0
    teacher_override_count: Optional[int] = 0

    class Config:
        from_attributes = True
    
class QuestionImproveRequest(BaseModel):
    instructions: List[str] = Field(..., min_length=1)

class QuestionVariationRequest(BaseModel):
    count: int = 3

class DuplicateCheckRequest(BaseModel):
    question_text: str
    lesson_id: Optional[int] = None

class DuplicateMatch(BaseModel):
    id: int
    text: str
    similarity: float

class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    duplicates: List[DuplicateMatch]

class QuizQuestionCreate(BaseModel):
    question_version_id: int
    order: Optional[int] = 0
    points_override: Optional[float] = None

class QuizCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    max_attempts: int = 1
    is_strict_mode: bool = False
    randomize_questions: bool = False
    randomize_options: bool = False
    lesson_id: int
    short_answer_grading_mode: Optional[str] = "manual"
    questions: Optional[List[QuestionVersionCreate]] = [] # Helper array to inline create questions

class QuizCreateFromBank(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    max_attempts: int = 1
    is_strict_mode: bool = False
    randomize_questions: bool = False
    randomize_options: bool = False
    lesson_id: int
    short_answer_grading_mode: Optional[str] = "manual"
    question_ids: List[int] = Field(..., min_length=1)


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[QuizStatus] = None
    time_limit_minutes: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    max_attempts: Optional[int] = None
    is_strict_mode: Optional[bool] = None
    randomize_questions: Optional[bool] = None
    randomize_options: Optional[bool] = None
    short_answer_grading_mode: Optional[str] = None


class QuizResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: QuizStatus
    time_limit_minutes: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    max_attempts: int
    is_strict_mode: bool
    randomize_questions: bool
    randomize_options: bool
    is_ai_generated: bool
    short_answer_grading_mode: str
    lesson_id: int
    question_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True


class QuizDetailResponse(QuizResponse):
    questions: List[QuestionVersionResponse] = []


# ──────────────────────────────────────────────
# Quiz Attempt Schemas
# ──────────────────────────────────────────────

class AnswerSubmit(BaseModel):
    question_version_id: int
    student_answer: str


class QuizSubmit(BaseModel):
    answers: List[AnswerSubmit]


class AnswerResponse(BaseModel):
    id: int
    attempt_id: int
    question_version_id: int
    student_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    points_earned: float
    correct_answer: Optional[str] = None
    is_flagged: bool = False
    teacher_note: Optional[str] = None
    is_overridden: bool = False
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    max_points: Optional[float] = None
    options: Optional[List[str]] = None
    explanation: Optional[str] = None

    class Config:
        from_attributes = True

class IntegrityEventCreate(BaseModel):
    event_type: IntegrityEventType
    metadata_json: Optional[dict] = None


class AnswerModerateRequest(BaseModel):
    is_correct: bool
    points_earned: float
    teacher_note: Optional[str] = None

    class Config:
        from_attributes = True


class QuizAttemptResponse(BaseModel):
    id: int
    student_id: int
    quiz_id: int
    score: Optional[float] = None
    total_points: Optional[float] = None
    percentage: Optional[float] = None
    status: QuizAttemptStatus
    started_at: datetime
    deadline_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    integrity_warnings: int = 0
    student_name: Optional[str] = None
    answers: Optional[List[AnswerResponse]] = None

    class Config:
        from_attributes = True


class AttemptDetailResponse(BaseModel):
    """Full attempt detail with all answers and question context for grading."""
    id: int
    student_id: int
    student_name: str
    quiz_id: int
    quiz_title: str
    score: Optional[float] = None
    total_points: Optional[float] = None
    percentage: Optional[float] = None
    status: QuizAttemptStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    answers: List[AnswerResponse] = []

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Student Question Schemas
# ──────────────────────────────────────────────

class StudentQuestionCreate(BaseModel):
    course_id: int
    question_text: str


class StudentQuestionResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    question_text: str
    is_answered: bool
    asked_at: datetime
    ai_response: Optional[str] = None

    class Config:
        from_attributes = True


class TeacherCorrectionCreate(BaseModel):
    is_flagged: bool
    correction_text: str


# ──────────────────────────────────────────────
# Analytics Schemas
# ──────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_students: int = 0
    total_teachers: int = 0
    total_courses: int = 0
    total_quizzes: int = 0
    total_questions_asked: int = 0
    active_enrollments: int = 0


class CourseAnalytics(BaseModel):
    course_id: int
    course_title: str
    total_students: int = 0
    average_quiz_score: Optional[float] = None
    total_questions_asked: int = 0
    completion_rate: Optional[float] = None


class StudentProgress(BaseModel):
    student_id: int
    student_name: str
    courses_enrolled: int = 0
    quizzes_taken: int = 0
    average_score: Optional[float] = None
    questions_asked: int = 0
    last_active: Optional[datetime] = None


# ──────────────────────────────────────────────
# AI Q&A Schemas
# ──────────────────────────────────────────────

class QuestionAsk(BaseModel):
    course_id: int
    question: str = Field(..., min_length=5, max_length=2000)
    session_id: Optional[int] = None
    existing_question_id: Optional[int] = None


class StudentQuestionItem(BaseModel):
    id: int
    question_text: str
    is_answered: bool
    asked_at: datetime
    student_name: Optional[str] = None
    course_title: Optional[str] = None
    session_id: Optional[int] = None


class AIResponseDetail(BaseModel):
    question_id: int
    question_text: str
    response_text: Optional[str] = None
    context_sources: Optional[list] = []
    confidence_score: Optional[float] = None
    reasoning_quality: Optional[str] = "High"
    retrieved_context_score: Optional[float] = None
    generation_time_ms: Optional[int] = None
    sources_json: Optional[list] = []
    is_escalated: bool = False
    is_flagged: bool = False
    teacher_correction: Optional[str] = None
    asked_at: str
    student_name: Optional[str] = None
    session_id: Optional[int] = None


class AITutorSessionCreate(BaseModel):
    course_id: Optional[int] = None
    title: Optional[str] = None


class AITutorSessionResponse(BaseModel):
    id: int
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    title: str
    created_at: str
    updated_at: str
    is_active: bool = True
    question_count: int = 0


class StudentRecommendationResponse(BaseModel):
    id: int
    course_id: Optional[int] = None
    recommendation_type: str
    target_id: Optional[int] = None
    title: str
    reason: str
    priority_score: float = 1.0
    is_completed: bool = False


class StudentLearningProfileResponse(BaseModel):
    strong_topics: list = []
    weak_topics: list = []
    streak_days: int = 0
    avg_study_duration_minutes: float = 0.0
    preferred_material_type: str = "mixed"
    quiz_score_trend: list = []
    improvement_rate: float = 0.0


class MaterialAIInsightResponse(BaseModel):
    id: int
    material_id: int
    summary_text: str
    key_concepts: list = []
    definitions: list = []
    learning_objectives: list = []
    revision_points: list = []
    misunderstood_concepts: list = []
    is_published: bool = True
    teacher_edited: bool = False


class MaterialAIInsightUpdate(BaseModel):
    summary_text: Optional[str] = None
    key_concepts: Optional[list] = None
    definitions: Optional[list] = None
    learning_objectives: Optional[list] = None
    revision_points: Optional[list] = None
    misunderstood_concepts: Optional[list] = None
    is_published: Optional[bool] = None


class SystemAIConfigResponse(BaseModel):
    id: int
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    temperature: float = 0.3
    max_tokens: int = 1500
    confidence_threshold: float = 0.70
    embedding_model: str = "text-embedding-3-small"
    chunk_size: int = 500
    retrieval_top_k: int = 5
    enabled_modules: dict = {}


class SystemAIConfigUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    confidence_threshold: Optional[float] = None
    embedding_model: Optional[str] = None
    chunk_size: Optional[int] = None
    retrieval_top_k: Optional[int] = None
    enabled_modules: Optional[dict] = None


class TeacherQuestionCreate(BaseModel):
    course_id: int
    question_text: str = Field(..., min_length=5, max_length=2000)
    tag: Optional[str] = None

class TeacherQuestionReply(BaseModel):
    teacher_response: str = Field(..., min_length=2)

class TeacherQuestionResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    tag: Optional[str] = None
    question_text: str
    teacher_response: Optional[str] = None
    is_answered: bool
    created_at: datetime
    answered_at: Optional[datetime] = None
    teacher_seen_at: Optional[datetime] = None
    student_seen_at: Optional[datetime] = None
    student_name: Optional[str] = None
    course_title: Optional[str] = None

    class Config:
        from_attributes = True

# ──────────────────────────────────────────────
# Direct Messaging
# ──────────────────────────────────────────────

class DirectMessageCreate(BaseModel):
    course_id: Optional[int] = 0
    receiver_id: int
    content: str = Field(..., min_length=1, max_length=5000)
    tag: Optional[str] = None

class DirectMessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    course_id: Optional[int] = 0
    content: str
    tag: Optional[str] = None
    is_read: bool
    created_at: datetime
    
    sender_name: Optional[str] = None
    receiver_name: Optional[str] = None
    course_title: Optional[str] = None

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Payments & Subscriptions
# ──────────────────────────────────────────────
from app.models import PaymentPlanType, PaymentStatus, SubscriptionStatus

class PaymentCreate(BaseModel):
    course_id: int
    payment_plan: PaymentPlanType


class PaymentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    course_title: str = ""
    amount: float
    payment_plan: PaymentPlanType
    status: PaymentStatus
    transaction_id: Optional[str] = None
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    course_title: str = ""
    status: SubscriptionStatus
    current_period_end: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentOverview(BaseModel):
    total_revenue: float
    monthly_recurring: float
    overdue_balance: float
    active_subscriptions: int

class ConversationSummary(BaseModel):
    course_id: int
    course_title: str
    other_user_id: int
    other_user_name: str
    last_message: str
    last_message_at: datetime
    unread_count: int


# ──────────────────────────────────────────────
# AI Quiz Generation Schemas
# ──────────────────────────────────────────────

class AIQuizGenerate(BaseModel):
    lesson_id: int
    title: str = Field(default="AI Generated Quiz", max_length=255)
    num_questions: int = Field(default=5, ge=1, le=30)
    question_types: Optional[List[str]] = ["mcq", "true_false", "short_answer"]
    mcq_count: Optional[int] = Field(default=None, ge=0, le=20)
    tf_count: Optional[int] = Field(default=None, ge=0, le=20)
    sa_count: Optional[int] = Field(default=None, ge=0, le=20)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    material_ids: Optional[List[int]] = None
    time_limit_minutes: Optional[int] = Field(default=None, ge=0)
    available_until: Optional[datetime] = None
    default_points: Optional[float] = Field(default=10.0, ge=0.1)


# ──────────────────────────────────────────────
# Recommendations Schemas
# ──────────────────────────────────────────────

class RecommendationMaterial(BaseModel):
    material_id: int
    title: str
    material_type: str
    file_url: Optional[str] = None

class StudyRecommendation(BaseModel):
    id: int
    lesson_id: int
    course_id: int
    course_title: str
    lesson_title: str
    ai_tip: str
    materials: List[RecommendationMaterial] = []

# ──────────────────────────────────────────────
# Generic Response

class MessageResponse(BaseModel):
    message: str
    success: bool = True

# ──────────────────────────────────────────────
# Notification Schemas
# ──────────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    sender_id: Optional[int] = None
    title: str
    message: str
    type: str
    is_read: bool
    related_entity_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Phase 1 Architecture Foundation Schemas
# ──────────────────────────────────────────────


class QuizQuestionResponse(BaseModel):
    id: int
    quiz_id: int
    question_id: int
    question_version_id: Optional[int] = None
    order_index: int
    points_override: Optional[float] = None

    class Config:
        from_attributes = True


class IntegrityEventCreate(BaseModel):
    event_type: str
    timestamp: Optional[datetime] = None
    metadata_json: Optional[Dict[str, Any]] = None
    severity: Optional[str] = "low"


class IntegrityEventResponse(BaseModel):
    id: int
    attempt_id: int
    event_type: str
    timestamp: datetime
    metadata_json: Optional[Dict[str, Any]] = None
    severity: str

    class Config:
        from_attributes = True


class ProcessingJobResponse(BaseModel):
    id: int
    job_type: str
    status: str
    progress: float
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    actor_id: Optional[int] = None
    actor_email: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    timestamp: datetime
    previous_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Phase 2 Advanced Learning Experience Schemas
# ──────────────────────────────────────────────

class QuestionPoolCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    course_id: int
    question_ids: Optional[List[int]] = None


class QuestionPoolResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    course_id: int
    created_by_id: int
    created_at: datetime
    item_count: Optional[int] = 0

    class Config:
        from_attributes = True


class QuizPoolRuleCreate(BaseModel):
    pool_id: int
    count: int = 5
    difficulty_filter: Optional[str] = None
    blooms_filter: Optional[str] = None
    question_type_filter: Optional[str] = None


class QuizPoolRuleResponse(BaseModel):
    id: int
    quiz_id: int
    pool_id: int
    count: int
    difficulty_filter: Optional[str] = None
    blooms_filter: Optional[str] = None
    question_type_filter: Optional[str] = None

    class Config:
        from_attributes = True





class RubricCriterion(BaseModel):
    name: str
    max_points: float
    description: Optional[str] = None


class GradingRubricCreate(BaseModel):
    title: str
    question_id: Optional[int] = None
    course_id: Optional[int] = None
    max_marks: float = 10.0
    criteria: List[RubricCriterion]


class GradingRubricResponse(BaseModel):
    id: int
    title: str
    question_id: Optional[int] = None
    course_id: Optional[int] = None
    max_marks: float
    criteria_json: Any
    created_at: datetime

    class Config:
        from_attributes = True


class RubricScoreSubmit(BaseModel):
    rubric_id: int
    criteria_scores: List[Dict[str, Any]]
    teacher_final_score: float
    override_reason: Optional[str] = None


class BulkModerationRequest(BaseModel):
    question_ids: List[int]
    action: str = Field(..., pattern="^(approve|reject|archive)$")
    teacher_note: Optional[str] = None


# ──────────────────────────────────────────────
# A/L Exam Engine Schemas (Phase 1)
# ──────────────────────────────────────────────

class ALExamCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    exam_type: ALExamType
    time_limit_minutes: int = 120
    total_questions: int = 50
    raw_mark_cap: Optional[float] = None
    score_multiplier: float = 1.0
    max_attempts: int = 1
    course_id: Optional[int] = None
    lesson_id: Optional[int] = None
    is_published: bool = False


class ALExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit_minutes: Optional[int] = None
    total_questions: Optional[int] = None
    raw_mark_cap: Optional[float] = None
    score_multiplier: Optional[float] = None
    max_attempts: Optional[int] = None
    is_published: Optional[bool] = None
    difficulty_policy: Optional[str] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    show_result_immediately: Optional[bool] = None


class ALQuestionCreate(BaseModel):
    exam_id: int
    question_number: int
    template_type: ALQuestionTemplate = ALQuestionTemplate.GENERIC_MCQ
    stem_text: str
    diagram_url: Optional[str] = None
    requires_image: Optional[bool] = False
    image_description: Optional[str] = None
    explanation: Optional[str] = None
    points: float = 1.0
    cognitive_level: str = "understand"
    difficulty: str = "medium"

    # MCQ options & correct answer
    options: Optional[List[str]] = None
    correct_option: Optional[str] = None

    # Advanced templates
    assertion_text: Optional[str] = None
    reason_text: Optional[str] = None
    statements_json: Optional[List[Dict[str, Any]]] = None
    grid_key_json: Optional[Dict[str, Any]] = None

    # Paper 2
    structured_subparts_json: Optional[List[Dict[str, Any]]] = None
    essay_checklist_json: Optional[Any] = None
    paper_set_group: Optional[str] = None


class ALQuestionUpdate(BaseModel):
    stem_text: Optional[str] = None
    template_type: Optional[ALQuestionTemplate] = None
    diagram_url: Optional[str] = None
    requires_image: Optional[bool] = None
    image_description: Optional[str] = None
    explanation: Optional[str] = None
    points: Optional[float] = None
    cognitive_level: Optional[str] = None
    difficulty: Optional[str] = None
    options: Optional[List[str]] = None
    correct_option: Optional[str] = None
    assertion_text: Optional[str] = None
    reason_text: Optional[str] = None
    statements_json: Optional[List[Dict[str, Any]]] = None
    grid_key_json: Optional[Dict[str, Any]] = None
    structured_subparts_json: Optional[List[Dict[str, Any]]] = None
    essay_checklist_json: Optional[Any] = None
    paper_set_group: Optional[str] = None


class ALQuestionResponse(BaseModel):
    id: int
    exam_id: int
    question_number: int
    template_type: ALQuestionTemplate
    stem_text: str
    diagram_url: Optional[str] = None
    requires_image: Optional[bool] = False
    image_description: Optional[str] = None
    explanation: Optional[str] = None
    points: float
    cognitive_level: str
    difficulty: str
    options: Optional[List[str]] = None
    correct_option: Optional[str] = None
    assertion_text: Optional[str] = None
    reason_text: Optional[str] = None
    statements_json: Optional[Any] = None
    grid_key_json: Optional[Any] = None
    structured_subparts_json: Optional[Any] = None
    essay_checklist_json: Optional[Any] = None
    paper_set_group: Optional[str] = None
    snapshot_json: Optional[Any] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ALExamResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    exam_type: ALExamType
    time_limit_minutes: int
    total_questions: int
    total_marks: Optional[float] = None
    raw_mark_cap: Optional[float] = None
    score_multiplier: float
    max_attempts: int
    is_published: bool
    difficulty_policy: Optional[str] = "mixed"
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    show_result_immediately: Optional[bool] = True
    course_id: int
    lesson_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    questions: Optional[List[ALQuestionResponse]] = []

    class Config:
        from_attributes = True


class ALGenerationRequest(BaseModel):
    assessment_type: str = "paper_1_mcq"  # "full_paper", "paper_1_only", "paper_2_only", "paper_2_structured", "paper_2_essay", "custom"
    question_count: int = 10
    generation_mode: str = "al_certified"  # "al_certified", "custom", "balanced"
    subtype_distribution: Optional[Dict[str, float]] = None
    difficulty_distribution: Optional[Dict[str, float]] = None
    cognitive_distribution: Optional[Dict[str, float]] = None
    course_id: Optional[int] = None
    unit_ids: Optional[List[int]] = None
    lesson_ids: Optional[List[int]] = None
    material_ids: Optional[List[int]] = None
    material_scopes: Optional[List[str]] = None
    custom_instruction: Optional[str] = None


class ALRegenerateCandidateRequest(BaseModel):
    candidate_question: Dict[str, Any]
    custom_instruction: Optional[str] = None


class ALBatchAcceptRequest(BaseModel):
    exam_id: int
    candidates: List[Dict[str, Any]]


class ALBatchAcceptResponse(BaseModel):
    requested: int
    accepted: int
    failed: int
    results: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]


class StructuredMarkingPointItem(BaseModel):
    criterion: str
    points: Optional[float] = 1.0


class StructuredMarkingRules(BaseModel):
    unit_required: Optional[bool] = False
    required_unit: Optional[str] = None
    exact_spelling_required: Optional[bool] = False
    underline_required: Optional[bool] = False
    taxonomic_format_required: Optional[bool] = False
    all_or_nothing: Optional[bool] = False
    both_conditions_required: Optional[bool] = False
    sequence_order_required: Optional[bool] = False
    label_required: Optional[bool] = False
    custom_rules: Optional[List[str]] = []


class StructuredDiagramInfo(BaseModel):
    requires_image: Optional[bool] = False
    image_url: Optional[str] = None
    image_description: Optional[str] = None
    expected_interpretation: Optional[str] = None
    diagram_type: Optional[str] = "PRE_SUPPLIED"  # "PRE_SUPPLIED" | "STUDENT_DRAWING"


class StructuredDrawingInfo(BaseModel):
    canvas_description: Optional[str] = None
    required_structures: Optional[List[str]] = []
    required_flow: Optional[str] = None


class StructuredTableData(BaseModel):
    headers: List[str]
    rows: List[List[str]]
    expected_answers: Optional[List[Dict[str, Any]]] = []


class StructuredSequenceData(BaseModel):
    expected_sequence: List[str]
    sequence_order_required: Optional[bool] = True
    sequence_all_or_nothing: Optional[bool] = True
    separator_flexible: Optional[bool] = True
    alternative_separator_allowed: Optional[str] = "comma"


class StructuredComparisonPair(BaseModel):
    left: str
    right: str
    points: Optional[float] = 1.0


class StructuredComparisonData(BaseModel):
    pairs: List[StructuredComparisonPair]
    both_conditions_required: Optional[bool] = True


class StructuredQuestionPartSchema(BaseModel):
    id: Optional[str] = None
    parent_id: Optional[str] = None
    label: str
    format_type: ALStructuredFormat
    prompt: str
    points: float
    model_answer: Optional[str] = None
    marking_points: Optional[List[StructuredMarkingPointItem]] = []
    marking_rules: Optional[StructuredMarkingRules] = None
    diagram_info: Optional[StructuredDiagramInfo] = None
    drawing_info: Optional[StructuredDrawingInfo] = None
    table_data: Optional[StructuredTableData] = None
    sequence_data: Optional[StructuredSequenceData] = None
    comparison_data: Optional[StructuredComparisonData] = None
    difficulty: Optional[str] = "medium"
    cognitive_level: Optional[str] = "understand"
    content_unit: Optional[str] = None
    children: Optional[List[Any]] = []


class StructuredGenerationRequest(BaseModel):
    assessment_type: str = "paper_2_structured"
    question_count: int = 4  # 1 to 5
    custom_blueprints: Optional[List[Dict[str, Any]]] = None
    course_id: Optional[int] = None
    unit_ids: Optional[List[int]] = None
    difficulty_mode: Optional[str] = "balanced"
    cognitive_mode: Optional[str] = "recommended"
    custom_instruction: Optional[str] = None


class StructuredSingleCandidateRegenerateRequest(BaseModel):
    candidate: Dict[str, Any]
    course_id: Optional[int] = None
    unit_ids: Optional[List[int]] = None
    difficulty_mode: Optional[str] = "balanced"
    cognitive_mode: Optional[str] = "recommended"
    custom_instruction: Optional[str] = None


class EssayGenerationRequest(BaseModel):
    assessment_type: str = "paper_2_essay"
    question_count: int = 3  # 1 to 5
    custom_blueprints: Optional[List[Dict[str, Any]]] = None
    paper_blueprint: Optional[Dict[str, Any]] = None
    course_id: Optional[int] = None
    unit_ids: Optional[List[int]] = None
    difficulty_mode: Optional[str] = "balanced"
    cognitive_mode: Optional[str] = "recommended"
    custom_instruction: Optional[str] = None


class EssaySingleCandidateRegenerateRequest(BaseModel):
    candidate: Dict[str, Any]
    course_id: Optional[int] = None
    unit_ids: Optional[List[int]] = None
    difficulty_mode: Optional[str] = "balanced"
    cognitive_mode: Optional[str] = "recommended"
    custom_instruction: Optional[str] = None


class ALExamValidationResponse(BaseModel):
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    summary: Dict[str, Any]


class ALStudentAnswerSubmit(BaseModel):
    question_id: int
    selected_option: Optional[str] = None
    subpart_answers_json: Optional[Dict[str, Any]] = None
    essay_text_answer: Optional[str] = None
    essay_attachment_url: Optional[str] = None


class ALStudentSubmissionCreate(BaseModel):
    exam_id: int
    answers: List[ALStudentAnswerSubmit] = []


class ALStudentAnswerResponse(BaseModel):
    id: int
    submission_id: int
    question_id: int
    selected_option: Optional[str] = None
    subpart_answers_json: Optional[Any] = None
    essay_text_answer: Optional[str] = None
    essay_attachment_url: Optional[str] = None
    raw_points_earned: Optional[float] = 0.0
    scaled_points_earned: Optional[float] = 0.0
    is_correct: Optional[bool] = None
    auto_score: Optional[float] = 0.0
    ai_score: Optional[float] = 0.0
    teacher_score: Optional[float] = None
    final_score: Optional[float] = 0.0
    correct_option: Optional[str] = None
    explanation: Optional[str] = None
    ai_checklist_results_json: Optional[Any] = None
    teacher_checklist_results_json: Optional[Any] = None
    teacher_override_points: Optional[float] = None
    feedback_notes: Optional[str] = None

    class Config:
        from_attributes = True


class ALStudentSubmissionResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    started_at: datetime
    submitted_at: Optional[datetime] = None
    raw_score: Optional[float] = 0.0
    scaled_score: Optional[float] = 0.0
    percentage: Optional[float] = 0.0
    grade: Optional[str] = None
    status: str
    ai_feedback_summary: Optional[str] = None
    teacher_feedback: Optional[str] = None
    teacher_verified_at: Optional[datetime] = None
    finalized_by_id: Optional[int] = None
    finalized_at: Optional[datetime] = None
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    exam_title: Optional[str] = None
    exam_type: Optional[str] = None
    answers: Optional[List[ALStudentAnswerResponse]] = []

    class Config:
        from_attributes = True


class ALTeacherVerifyAnswerItem(BaseModel):
    answer_id: int
    teacher_override_points: Optional[float] = None
    teacher_checklist_results_json: Optional[Any] = None
    feedback_notes: Optional[str] = None


class ALTeacherVerifySubmissionRequest(BaseModel):
    answers: List[ALTeacherVerifyAnswerItem] = []
    teacher_feedback: Optional[str] = None


class ALPastPaperCreate(BaseModel):
    year: int
    title: str
    paper_type: ALExamType
    pdf_url: Optional[str] = None
    marking_scheme_url: Optional[str] = None
    course_id: Optional[int] = None


class ALPastPaperResponse(BaseModel):
    id: int
    year: int
    title: str
    paper_type: ALExamType
    pdf_url: Optional[str] = None
    marking_scheme_url: Optional[str] = None
    exam_id: Optional[int] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class HotspotCreate(BaseModel):
    material_id: int
    timestamp_seconds: Optional[int] = None
    page_number: Optional[int] = None
    note: Optional[str] = None


class HotspotResponse(BaseModel):
    id: int
    material_id: int
    student_id: int
    timestamp_seconds: Optional[int] = None
    page_number: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True







