"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from app.models import UserRole, MaterialType, QuestionType, QuizStatus, PasswordResetStatus


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
# Lesson Schemas
# ──────────────────────────────────────────────

class LessonCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    order: Optional[int] = 0
    course_id: int


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None
    is_published: Optional[bool] = None


class LessonResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    order: int
    is_published: bool
    course_id: int
    created_at: datetime
    material_count: Optional[int] = 0

    class Config:
        from_attributes = True


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
    file_path: Optional[str] = None
    content: Optional[str] = None
    extracted_text: Optional[str] = None
    processing_status: str
    lesson_id: int
    created_at: datetime

    class Config:
        from_attributes = True


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
    question_text: str
    question_type: QuestionType
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None  # Hidden from students during quiz
    explanation: Optional[str] = None
    default_points: float
    difficulty: Optional[Difficulty] = None
    cognitive_level: Optional[CognitiveLevel] = None
    ai_validation_status: Optional[AIValidationStatus] = None
    teacher_approval_status: TeacherApprovalStatus
    created_at: datetime
    lesson_id: Optional[int] = None
    lesson_title: Optional[str] = None

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
    total_attempts: int
    correct_attempts: int
    success_rate: float
    observed_difficulty: str
    distractor_distribution: dict
    
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


class StudentQuestionItem(BaseModel):
    id: int
    question_text: str
    is_answered: bool
    asked_at: datetime
    student_name: Optional[str] = None
    course_title: Optional[str] = None


class AIResponseDetail(BaseModel):
    question_id: int
    question_text: str
    response_text: Optional[str] = None
    context_sources: Optional[list] = []
    confidence_score: Optional[float] = None
    is_flagged: bool = False
    teacher_correction: Optional[str] = None
    asked_at: str
    student_name: Optional[str] = None


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
    course_id: int
    receiver_id: int
    content: str = Field(..., min_length=1, max_length=5000)
    tag: Optional[str] = None

class DirectMessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    course_id: int
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
    num_questions: int = Field(default=5, ge=1, le=20)
    question_types: Optional[List[str]] = ["mcq", "true_false", "short_answer"]
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    material_ids: Optional[List[int]] = None


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
