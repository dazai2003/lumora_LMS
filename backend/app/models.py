"""
SQLAlchemy ORM Models for the Learning Analytics Platform.

Entity Relationships:
    - User (1) -> (M) Course (teacher creates courses)
    - User (M) <-> (M) Course (students enroll via Enrollment)
    - Course (1) -> (M) Lesson
    - Lesson (1) -> (M) Material
    - Lesson (1) -> (M) Quiz
    - Quiz (1) -> (M) Question
    - User (1) -> (M) QuizAttempt (student takes quizzes)
    - QuizAttempt (1) -> (M) Answer
    - User (1) -> (M) StudentQuestion
    - StudentQuestion (1) -> (1) AIResponse
    - Various -> AILog (audit trail)
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float,
    DateTime, ForeignKey, Enum, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class MaterialType(str, enum.Enum):
    NOTE = "note"
    PDF = "pdf"
    IMAGE = "image"
    VIDEO = "video"


class QuestionType(str, enum.Enum):
    MCQ = "mcq"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    MULTIPLE_SELECT = "multiple_select"
    NUMERICAL_ANSWER = "numerical_answer"


class AIValidationStatus(str, enum.Enum):
    VALIDATED = "validated"
    REVIEW_RECOMMENDED = "review_recommended"
    POTENTIAL_ISSUE = "potential_issue"


class TeacherApprovalStatus(str, enum.Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    EDITED = "edited"
    REJECTED = "rejected"


class QuizAttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_CLOSED = "auto_closed"


class IntegrityEventType(str, enum.Enum):
    TAB_SWITCH = "tab_switch"
    WINDOW_BLUR = "window_blur"
    FULLSCREEN_EXIT = "fullscreen_exit"
    FULLSCREEN_ENTER = "fullscreen_enter"


class CognitiveLevel(str, enum.Enum):
    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuizStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class NotificationType(str, enum.Enum):
    SYSTEM = "system"
    COURSE = "course"
    REMINDER = "reminder"
    MESSAGE = "message"


class PaymentPlanType(str, enum.Enum):
    MONTHLY = "monthly"
    ONE_TIME = "one_time"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PasswordResetStatus(str, enum.Enum):
    PENDING = "pending"
    RESOLVED = "resolved"


# ──────────────────────────────────────────────
# User & Authentication
# ──────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STUDENT)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    profile_image = Column(String(500), nullable=True)
    last_active_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    taught_courses = relationship("Course", back_populates="teacher", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")
    quiz_attempts = relationship("QuizAttempt", back_populates="student", cascade="all, delete-orphan")
    student_questions = relationship("StudentQuestion", back_populates="student", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")
    password_reset_requests = relationship("PasswordResetRequest", back_populates="user", cascade="all, delete-orphan")


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    email = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(Enum(PasswordResetStatus), default=PasswordResetStatus.PENDING, nullable=False)
    temp_password = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="password_reset_requests")


# ──────────────────────────────────────────────
# Courses & Enrollment
# ──────────────────────────────────────────────

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    subject = Column(String(100), nullable=True)
    cover_image = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    is_paid_course = Column(Boolean, default=False)
    monthly_price = Column(Float, nullable=True)
    full_price = Column(Float, nullable=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    teacher = relationship("User", back_populates="taught_courses")
    lessons = relationship("Lesson", back_populates="course", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="course", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    enrolled_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # Relationships
    student = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")


# ──────────────────────────────────────────────
# Lessons & Materials
# ──────────────────────────────────────────────

class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, default=0)
    is_published = Column(Boolean, default=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    course = relationship("Course", back_populates="lessons")
    materials = relationship("Material", back_populates="lesson", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="lesson", cascade="all, delete-orphan")


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    material_type = Column(Enum(MaterialType), nullable=False)
    file_path = Column(String(500), nullable=True)
    content = Column(Text, nullable=True)  # For notes / extracted text
    extracted_text = Column(Text, nullable=True)  # OCR / Whisper output
    processing_status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    lesson = relationship("Lesson", back_populates="materials")
    flags = relationship("MaterialFlag", back_populates="material", cascade="all, delete-orphan")
    notes = relationship("MaterialNote", back_populates="material", cascade="all, delete-orphan")


class MaterialFlag(Base):
    __tablename__ = "material_flags"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    context = Column(String(255), nullable=False)  # e.g., "Timestamp 01:23" or "Page 4"
    comment = Column(Text, nullable=False)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("User")
    material = relationship("Material", back_populates="flags")


class MaterialNote(Base):
    __tablename__ = "material_notes"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    context = Column(String(255), nullable=True)  # e.g., "Page 2"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("User")
    material = relationship("Material", back_populates="notes")


class StudentMaterialProgress(Base):
    __tablename__ = "student_material_progress"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    last_position = Column(Float, default=0.0)  # Timestamp in seconds or page number
    is_completed = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student = relationship("User")
    material = relationship("Material")


# ──────────────────────────────────────────────
# Taxonomy & Topics
# ──────────────────────────────────────────────

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)

    topics = relationship("Topic", back_populates="subject", cascade="all, delete-orphan")


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    subject = relationship("Subject", back_populates="topics")
    subtopics = relationship("Subtopic", back_populates="topic", cascade="all, delete-orphan")


class Subtopic(Base):
    __tablename__ = "subtopics"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    topic = relationship("Topic", back_populates="subtopics")


# ──────────────────────────────────────────────
# Quizzes & Assessment
# ──────────────────────────────────────────────

class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(QuizStatus), default=QuizStatus.DRAFT)
    time_limit_minutes = Column(Integer, nullable=True)
    
    # Advanced Settings
    available_from = Column(DateTime, nullable=True)
    available_until = Column(DateTime, nullable=True)
    max_attempts = Column(Integer, default=1)
    is_strict_mode = Column(Boolean, default=False)
    randomize_questions = Column(Boolean, default=False)
    randomize_options = Column(Boolean, default=False)

    is_ai_generated = Column(Boolean, default=False)
    short_answer_grading_mode = Column(String(20), default="manual")  # "manual" or "ai"
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    lesson = relationship("Lesson", back_populates="quizzes")
    course = relationship("Course", back_populates="quizzes")
    quiz_questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    is_banked = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)  # Soft delete
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    subtopic_id = Column(Integer, ForeignKey("subtopics.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    lesson = relationship("Lesson")
    topic = relationship("Topic")
    subtopic = relationship("Subtopic")
    versions = relationship("QuestionVersion", back_populates="question", cascade="all, delete-orphan")


class QuestionVersion(Base):
    __tablename__ = "question_versions"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    
    question_text = Column(Text, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    options = Column(JSON, nullable=True)  # For MCQ/Multiple Select
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    default_points = Column(Float, default=1.0)
    
    # Metadata
    difficulty = Column(Enum(Difficulty), nullable=True)
    cognitive_level = Column(Enum(CognitiveLevel), nullable=True)
    
    # AI & Approval
    ai_validation_status = Column(Enum(AIValidationStatus), nullable=True)
    teacher_approval_status = Column(Enum(TeacherApprovalStatus), default=TeacherApprovalStatus.PENDING_REVIEW)
    
    # Provenance
    source_type = Column(String(50), nullable=True)  # e.g., 'manual', 'material'
    source_id = Column(Integer, nullable=True)
    source_reference = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    question = relationship("Question", back_populates="versions")
    quiz_questions = relationship("QuizQuestion", back_populates="question_version", cascade="all, delete-orphan")
    answers = relationship("Answer", back_populates="question_version", cascade="all, delete-orphan")

    @property
    def lesson_id(self):
        return self.question.lesson_id

    @property
    def lesson_title(self):
        return self.question.lesson.title if self.question and self.question.lesson else None


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    question_version_id = Column(Integer, ForeignKey("question_versions.id"), nullable=False)
    order = Column(Integer, default=0)
    points_override = Column(Float, nullable=True)

    # Relationships
    quiz = relationship("Quiz", back_populates="quiz_questions")
    question_version = relationship("QuestionVersion", back_populates="quiz_questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    
    status = Column(Enum(QuizAttemptStatus), default=QuizAttemptStatus.IN_PROGRESS)
    score = Column(Float, nullable=True)
    total_points = Column(Float, nullable=True)
    percentage = Column(Float, nullable=True)
    
    started_at = Column(DateTime, default=datetime.utcnow)
    deadline_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    student = relationship("User", back_populates="quiz_attempts")
    quiz = relationship("Quiz", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")
    integrity_events = relationship("IntegrityEvent", back_populates="attempt", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("quiz_attempts.id"), nullable=False)
    question_version_id = Column(Integer, ForeignKey("question_versions.id"), nullable=False)
    student_answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    points_earned = Column(Float, default=0.0)

    # Moderation Fields
    is_flagged = Column(Boolean, default=False)
    teacher_note = Column(Text, nullable=True)
    is_overridden = Column(Boolean, default=False)

    # Relationships
    attempt = relationship("QuizAttempt", back_populates="answers")
    question_version = relationship("QuestionVersion", back_populates="answers")


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("quiz_attempts.id"), nullable=False)
    event_type = Column(Enum(IntegrityEventType), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metadata_json = Column(JSON, nullable=True)

    # Relationships
    attempt = relationship("QuizAttempt", back_populates="integrity_events")


# ──────────────────────────────────────────────
# Student Questions & AI Responses
# ──────────────────────────────────────────────

class StudentQuestion(Base):
    __tablename__ = "student_questions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    is_answered = Column(Boolean, default=False)
    asked_at = Column(DateTime, default=datetime.utcnow)

    # Analytics fields
    topic_category = Column(String(100), nullable=True)
    sentiment_difficulty = Column(String(100), nullable=True)
    course_material_id = Column(Integer, ForeignKey("materials.id", name="fk_sq_material"), nullable=True)

    # Relationships
    student = relationship("User", back_populates="student_questions")
    ai_response = relationship("AIResponse", back_populates="student_question", uselist=False, cascade="all, delete-orphan")


class AIResponse(Base):
    __tablename__ = "ai_responses"

    id = Column(Integer, primary_key=True, index=True)
    student_question_id = Column(Integer, ForeignKey("student_questions.id"), nullable=False)
    response_text = Column(Text, nullable=False)
    context_sources = Column(JSON, nullable=True)  # Which materials were used
    confidence_score = Column(Float, nullable=True)
    is_flagged = Column(Boolean, default=False)
    teacher_correction = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student_question = relationship("StudentQuestion", back_populates="ai_response")


# ──────────────────────────────────────────────
# Teacher Direct Questions
# ──────────────────────────────────────────────

class TeacherQuestion(Base):
    __tablename__ = "teacher_questions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    tag = Column(String(100), nullable=True)
    
    question_text = Column(Text, nullable=False)
    teacher_response = Column(Text, nullable=True)
    
    is_answered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    answered_at = Column(DateTime, nullable=True)
    
    teacher_seen_at = Column(DateTime, nullable=True)
    student_seen_at = Column(DateTime, nullable=True)

    # Relationships
    student = relationship("User", foreign_keys=[student_id])
    course = relationship("Course", foreign_keys=[course_id])


# ──────────────────────────────────────────────
# Direct Messaging
# ──────────────────────────────────────────────

class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    content = Column(Text, nullable=False)
    tag = Column(String(100), nullable=True)  # Keep the tag context from Q&A
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
    course = relationship("Course", foreign_keys=[course_id])



# ──────────────────────────────────────────────
# Activity Logging & Analytics
# ──────────────────────────────────────────────

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)  # e.g. "view_lesson", "submit_quiz", "ask_question"
    entity_type = Column(String(50), nullable=True)  # e.g. "lesson", "quiz", "material"
    entity_id = Column(Integer, nullable=True)
    action_metadata = Column(JSON, nullable=True)  # Additional context data
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="activity_logs")


# ──────────────────────────────────────────────
# Payments & Subscriptions
# ──────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    status = Column(Enum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.ACTIVE)
    current_period_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User")
    course = relationship("Course")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    amount = Column(Float, nullable=False)
    payment_plan = Column(Enum(PaymentPlanType), nullable=False)
    status = Column(Enum(PaymentStatus), nullable=False, default=PaymentStatus.PENDING)
    transaction_id = Column(String(255), unique=True, nullable=True)
    due_date = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User")
    course = relationship("Course")


class AILog(Base):
    __tablename__ = "ai_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False)  # "ocr", "transcribe", "qa", "quiz_gen", "summarize"
    input_summary = Column(Text, nullable=True)
    output_summary = Column(Text, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.COMPLETED)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(Enum(NotificationType), default=NotificationType.SYSTEM)
    is_read = Column(Boolean, default=False)
    related_entity_id = Column(Integer, nullable=True)  # Course ID, Material ID, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    sender = relationship("User", foreign_keys=[sender_id])
