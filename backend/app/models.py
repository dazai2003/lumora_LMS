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
    TAB_BLUR = "tab_blur"
    TAB_FOCUS = "tab_focus"
    COPY = "copy"
    PASTE = "paste"
    WINDOW_HIDDEN = "window_hidden"
    WINDOW_VISIBLE = "window_visible"
    FULLSCREEN_EXIT = "fullscreen_exit"
    FULLSCREEN_ENTER = "fullscreen_enter"
    FAST_RESPONSE = "fast_response"
    LONG_RESPONSE = "long_response"


class EventSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class JobType(str, enum.Enum):
    OCR = "ocr"
    TRANSCRIPTION = "transcription"
    VECTOR_INDEXING = "vector_indexing"
    AI_QUIZ_GENERATION = "ai_quiz_generation"
    AI_SUMMARY = "ai_summary"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


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
    
    # Metadata & Taxonomy
    difficulty = Column(Enum(Difficulty), nullable=True)
    cognitive_level = Column(Enum(CognitiveLevel), nullable=True)
    tags = Column(JSON, nullable=True)  # List of string tags e.g. ["Midterm", "SQL"]
    learning_outcome = Column(Text, nullable=True)
    estimated_completion_time_seconds = Column(Integer, default=60)
    
    # Automatic Feedback Engine Fields
    correct_explanation = Column(Text, nullable=True)
    incorrect_explanation = Column(Text, nullable=True)
    suggested_reading = Column(Text, nullable=True)
    recommended_material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    related_lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    follow_up_practice_question_ids = Column(JSON, nullable=True)  # List of question IDs
    
    # AI & Approval
    ai_validation_status = Column(Enum(AIValidationStatus), nullable=True)
    teacher_approval_status = Column(Enum(TeacherApprovalStatus), default=TeacherApprovalStatus.PENDING_REVIEW)
    
    # Provenance
    source_type = Column(String(50), nullable=True)  # e.g., 'manual', 'material', 'ai', 'imported'
    source_id = Column(Integer, nullable=True)
    source_reference = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    question = relationship("Question", back_populates="versions")
    quiz_questions = relationship("QuizQuestion", back_populates="question_version", cascade="all, delete-orphan")
    answers = relationship("Answer", back_populates="question_version", cascade="all, delete-orphan")
    recommended_material = relationship("Material", foreign_keys=[recommended_material_id])
    related_lesson = relationship("Lesson", foreign_keys=[related_lesson_id])

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
    severity = Column(Enum(EventSeverity), default=EventSeverity.LOW)

    # Relationships
    attempt = relationship("QuizAttempt", back_populates="integrity_events")


# ──────────────────────────────────────────────
# Student Questions & AI Responses
# ──────────────────────────────────────────────

class AITutorSession(Base):
    __tablename__ = "ai_tutor_sessions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    title = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User")
    course = relationship("Course")
    questions = relationship("StudentQuestion", back_populates="session", cascade="all, delete-orphan")


class StudentQuestion(Base):
    __tablename__ = "student_questions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("ai_tutor_sessions.id"), nullable=True)
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
    session = relationship("AITutorSession", back_populates="questions")
    student = relationship("User", back_populates="student_questions")
    ai_response = relationship("AIResponse", back_populates="student_question", uselist=False, cascade="all, delete-orphan")


class AIResponse(Base):
    __tablename__ = "ai_responses"

    id = Column(Integer, primary_key=True, index=True)
    student_question_id = Column(Integer, ForeignKey("student_questions.id"), nullable=False)
    response_text = Column(Text, nullable=False)
    context_sources = Column(JSON, nullable=True)  # Which materials were used
    confidence_score = Column(Float, nullable=True)
    reasoning_quality = Column(String(100), nullable=True)
    retrieved_context_score = Column(Float, nullable=True)
    generation_time_ms = Column(Integer, nullable=True)
    sources_json = Column(JSON, nullable=True)
    is_escalated = Column(Boolean, default=False)
    is_flagged = Column(Boolean, default=False)
    teacher_correction = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student_question = relationship("StudentQuestion", back_populates="ai_response")


class StudentRecommendation(Base):
    __tablename__ = "student_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    recommendation_type = Column(String(50), nullable=False)  # 'lesson', 'quiz', 'topic', 'practice_question'
    target_id = Column(Integer, nullable=True)
    title = Column(String(255), nullable=False)
    reason = Column(Text, nullable=False)
    priority_score = Column(Float, default=1.0)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("User")
    course = relationship("Course")


class StudentLearningProfile(Base):
    __tablename__ = "student_learning_profiles"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    strong_topics = Column(JSON, default=list)
    weak_topics = Column(JSON, default=list)
    streak_days = Column(Integer, default=0)
    avg_study_duration_minutes = Column(Float, default=0.0)
    preferred_material_type = Column(String(50), default="mixed")
    quiz_score_trend = Column(JSON, default=list)
    improvement_rate = Column(Float, default=0.0)
    last_analyzed_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("User")


class MaterialAIInsight(Base):
    __tablename__ = "material_ai_insights"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), unique=True, nullable=False)
    summary_text = Column(Text, nullable=False)
    key_concepts = Column(JSON, default=list)
    definitions = Column(JSON, default=list)
    learning_objectives = Column(JSON, default=list)
    revision_points = Column(JSON, default=list)
    misunderstood_concepts = Column(JSON, default=list)
    is_published = Column(Boolean, default=True)
    teacher_edited = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    material = relationship("Material")


class SystemAIConfig(Base):
    __tablename__ = "system_ai_configs"

    id = Column(Integer, primary_key=True, index=True)
    llm_provider = Column(String(50), default="openai")
    llm_model = Column(String(100), default="gpt-4o")
    temperature = Column(Float, default=0.3)
    max_tokens = Column(Integer, default=1500)
    confidence_threshold = Column(Float, default=0.70)
    embedding_model = Column(String(100), default="text-embedding-3-small")
    chunk_size = Column(Integer, default=500)
    retrieval_top_k = Column(Integer, default=5)
    enabled_modules = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
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


# ──────────────────────────────────────────────
# Phase 1 Architecture Foundation Models
# ──────────────────────────────────────────────


class ProcessingJob(Base):
    """
    Background asynchronous job status tracker.
    """
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(Enum(JobType), nullable=False, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.QUEUED, nullable=False, index=True)
    progress = Column(Float, default=0.0)  # 0.0 to 100.0
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    related_entity_type = Column(String(100), nullable=True)  # e.g., "material", "quiz", "course"
    related_entity_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    """
    Global enterprise governance audit log table.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False, index=True)
    entity_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    previous_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String(100), nullable=True)

    # Relationship
    actor = relationship("User")


# ──────────────────────────────────────────────
# Phase 2 Advanced Learning Experience Models
# ──────────────────────────────────────────────

class QuestionPool(Base):
    """
    Reusable logical question repository (e.g. "Midterm Pool", "Database MCQs").
    """
    __tablename__ = "question_pools"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    course = relationship("Course")
    created_by = relationship("User")
    items = relationship("QuestionPoolItem", back_populates="pool", cascade="all, delete-orphan")


class QuestionPoolItem(Base):
    """
    Junction linking a Question/QuestionVersion into a QuestionPool.
    """
    __tablename__ = "question_pool_items"

    id = Column(Integer, primary_key=True, index=True)
    pool_id = Column(Integer, ForeignKey("question_pools.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, index=True)
    question_version_id = Column(Integer, ForeignKey("question_versions.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    pool = relationship("QuestionPool", back_populates="items")
    question = relationship("Question")
    question_version = relationship("QuestionVersion")


class QuizPoolRule(Base):
    """
    Rule configuring a quiz to sample N questions from a QuestionPool on attempt start.
    """
    __tablename__ = "quiz_pool_rules"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False, index=True)
    pool_id = Column(Integer, ForeignKey("question_pools.id"), nullable=False, index=True)
    count = Column(Integer, default=5, nullable=False)
    difficulty_filter = Column(String(50), nullable=True)  # easy, medium, hard
    blooms_filter = Column(String(50), nullable=True)     # remember, understand, etc.
    question_type_filter = Column(String(50), nullable=True)

    # Relationships
    quiz = relationship("Quiz")
    pool = relationship("QuestionPool")


class QuestionAnalytics(Base):
    """
    Item difficulty, discrimination index, and per-question performance metrics.
    """
    __tablename__ = "question_analytics"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, unique=True, index=True)
    attempts_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    avg_response_time_seconds = Column(Float, default=0.0)
    difficulty_index = Column(Float, default=0.0)      # p-value (correct_count / attempts_count)
    discrimination_index = Column(Float, default=0.0)  # Item discrimination index d
    skip_count = Column(Integer, default=0)
    flag_count = Column(Integer, default=0)
    teacher_override_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    question = relationship("Question")


class GradingRubric(Base):
    """
    Multi-criteria rubric definitions for manual and AI short answer evaluation.
    """
    __tablename__ = "grading_rubrics"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    max_marks = Column(Float, default=10.0)
    criteria_json = Column(JSON, nullable=False)  # List of {name, max_points, description}
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    question = relationship("Question")
    course = relationship("Course")


class RubricScore(Base):
    """
    Detailed rubric evaluation score breakdown for a student answer.
    """
    __tablename__ = "rubric_scores"

    id = Column(Integer, primary_key=True, index=True)
    answer_id = Column(Integer, ForeignKey("answers.id"), nullable=False, index=True)
    rubric_id = Column(Integer, ForeignKey("grading_rubrics.id"), nullable=False, index=True)
    criteria_scores_json = Column(JSON, nullable=False)  # List of {criterion_name, points_awarded, comment}
    ai_suggested_score = Column(Float, nullable=True)
    ai_confidence = Column(Float, nullable=True)
    teacher_final_score = Column(Float, nullable=False)
    override_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    answer = relationship("Answer")
    rubric = relationship("GradingRubric")


# ──────────────────────────────────────────────
# Phase 4: Assignment & Coursework Management
# ──────────────────────────────────────────────

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    max_marks = Column(Float, default=100.0)
    weightage = Column(Float, default=10.0)
    is_group = Column(Boolean, default=False)
    status = Column(String(50), default="published")  # 'draft', 'published', 'archived'
    available_from = Column(DateTime, nullable=True)
    available_until = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    # Phase 4.1: Advanced Coursework Designer fields
    learning_outcomes = Column(JSON, default=list)
    blooms_level = Column(String(50), nullable=True)  # 'remember','understand','apply','analyze','evaluate','create'
    difficulty = Column(String(50), default="medium")  # 'easy','medium','hard'
    est_completion_time_minutes = Column(Integer, nullable=True)
    category = Column(String(100), nullable=True)  # 'essay','report','project','lab','presentation','portfolio'
    anonymous_marking = Column(Boolean, default=False)
    ai_policy = Column(String(100), default="allowed")  # 'allowed','prohibited','assisted','no_policy'
    word_count_limits = Column(JSON, nullable=True)  # {"min": 500, "max": 2000}
    allowed_file_types = Column(JSON, nullable=True)  # [".pdf",".docx",".pptx"]
    max_upload_size_mb = Column(Integer, default=50)
    late_submission_rules = Column(JSON, nullable=True)  # {"allowed": true, "penalty_pct_per_day": 5, "max_late_days": 7}
    max_attempts = Column(Integer, default=1)
    ai_pre_check_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course = relationship("Course")
    lesson = relationship("Lesson")
    files = relationship("AssignmentFile", back_populates="assignment", cascade="all, delete-orphan")
    resources = relationship("AssignmentResource", back_populates="assignment", cascade="all, delete-orphan")
    submissions = relationship("AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan")
    groups = relationship("AssignmentGroup", back_populates="assignment", cascade="all, delete-orphan")
    rubrics = relationship("AssignmentRubric", back_populates="assignment", cascade="all, delete-orphan")


class AssignmentFile(Base):
    __tablename__ = "assignment_files"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    checksum = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="files")


class AssignmentGroup(Base):
    __tablename__ = "assignment_groups"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    group_name = Column(String(255), nullable=False)
    leader_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="groups")
    leader = relationship("User")
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("assignment_groups.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contribution_percentage = Column(Float, default=100.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("AssignmentGroup", back_populates="members")
    student = relationship("User")


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("assignment_groups.id"), nullable=True)
    status = Column(String(50), default="submitted")  # 'draft', 'submitted', 'graded', 'returned'
    submitted_at = Column(DateTime, default=datetime.utcnow)
    is_late = Column(Boolean, default=False)
    student_comment = Column(Text, nullable=True)
    grade_marks = Column(Float, nullable=True)
    feedback_text = Column(Text, nullable=True)
    feedback_file_path = Column(String(500), nullable=True)
    graded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    graded_at = Column(DateTime, nullable=True)
    is_published = Column(Boolean, default=False)
    ai_suggested_marks = Column(Float, nullable=True)
    ai_feedback_json = Column(JSON, nullable=True)
    # Phase 4.1: Coursework Workspace fields
    submission_mode = Column(String(50), default="file")  # 'rich_text','file','markdown','code','url','mixed'
    submission_content_text = Column(Text, nullable=True)  # Rich text / markdown body
    repository_url = Column(String(500), nullable=True)
    word_count = Column(Integer, nullable=True)
    character_count = Column(Integer, nullable=True)
    reading_time_minutes = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("User", foreign_keys=[student_id])
    graded_by = relationship("User", foreign_keys=[graded_by_id])
    files = relationship("SubmissionFile", back_populates="submission", cascade="all, delete-orphan")
    history = relationship("SubmissionHistory", back_populates="submission", cascade="all, delete-orphan")
    annotations = relationship("SubmissionAnnotation", back_populates="submission", cascade="all, delete-orphan")
    plagiarism_reports = relationship("PlagiarismReport", back_populates="submission", cascade="all, delete-orphan")
    # Phase 4.2 relationships
    versions = relationship("SubmissionVersion", back_populates="submission", cascade="all, delete-orphan")
    comments = relationship("SubmissionComment", back_populates="submission", cascade="all, delete-orphan")
    suggestions = relationship("SubmissionSuggestion", back_populates="submission", cascade="all, delete-orphan")
    section_feedbacks = relationship("SubmissionSectionFeedback", back_populates="submission", cascade="all, delete-orphan")
    doc_extractions = relationship("DocumentExtraction", back_populates="submission", cascade="all, delete-orphan")


class SubmissionFile(Base):
    __tablename__ = "submission_files"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    version_number = Column(Integer, default=1)
    checksum = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="files")


class SubmissionHistory(Base):
    __tablename__ = "submission_histories"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    action = Column(String(100), nullable=False)  # 'created', 'file_uploaded', 'submitted', 'graded', 'returned'
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    details_json = Column(JSON, nullable=True)

    submission = relationship("AssignmentSubmission", back_populates="history")
    changed_by = relationship("User")


class AssignmentRubric(Base):
    __tablename__ = "assignment_rubrics"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="rubrics")
    criteria = relationship("RubricCriteria", back_populates="rubric", cascade="all, delete-orphan")


class RubricCriteria(Base):
    __tablename__ = "rubric_criteria"

    id = Column(Integer, primary_key=True, index=True)
    rubric_id = Column(Integer, ForeignKey("assignment_rubrics.id"), nullable=False)
    criterion_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    max_score = Column(Float, default=10.0)
    weight = Column(Float, default=1.0)
    order = Column(Integer, default=1)

    rubric = relationship("AssignmentRubric", back_populates="criteria")


class RubricScoreDetail(Base):
    __tablename__ = "rubric_score_details"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    criteria_id = Column(Integer, ForeignKey("rubric_criteria.id"), nullable=False)
    score = Column(Float, nullable=False)
    comments = Column(Text, nullable=True)
    teacher_override_score = Column(Float, nullable=True)

    submission = relationship("AssignmentSubmission")
    criteria = relationship("RubricCriteria")


class PlagiarismReport(Base):
    __tablename__ = "plagiarism_reports"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    similarity_score = Column(Float, default=0.0)  # Percentage 0 to 100
    matched_sources_json = Column(JSON, default=list)
    matched_submissions_json = Column(JSON, default=list)
    risk_level = Column(String(50), default="low")  # 'low', 'medium', 'high', 'critical'
    status = Column(String(50), default="completed")  # 'pending', 'completed', 'failed'
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="plagiarism_reports")


# ──────────────────────────────────────────────
# Phase 4.1: Coursework Workspace Upgrade
# ──────────────────────────────────────────────

class AssignmentResource(Base):
    """Resources & templates attached to an assignment (PDFs, samples, external links)."""
    __tablename__ = "assignment_resources"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    resource_type = Column(String(50), nullable=False)  # 'pdf','word','pptx','image','video','zip','template','link'
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    url = Column(String(500), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="resources")


class SubmissionAnnotation(Base):
    """Inline teacher annotations and comments on a submission."""
    __tablename__ = "submission_annotations"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    highlight_text = Column(Text, nullable=True)
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    comment_text = Column(Text, nullable=False)
    annotation_type = Column(String(50), default="comment")  # 'comment','highlight','suggestion','underline','strikethrough','rectangle','arrow','sticky_note'
    # Phase 4.2: Visual annotation fields
    position_json = Column(JSON, nullable=True)  # {"page": 1, "x": 100, "y": 200, "width": 50, "height": 20}
    color = Column(String(30), nullable=True)  # '#FFE066', 'red', etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="annotations")
    teacher = relationship("User")


# ──────────────────────────────────────────────
# Phase 4.2: Professional Document Authoring & Review
# ──────────────────────────────────────────────

class SubmissionVersion(Base):
    """Submission revision snapshots for version history."""
    __tablename__ = "submission_versions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    version_number = Column(Integer, nullable=False, default=1)
    submission_mode = Column(String(50), nullable=True)
    content_html = Column(Text, nullable=True)
    files_json = Column(JSON, nullable=True)  # Snapshot of file list
    word_count = Column(Integer, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="versions")


class SubmissionComment(Base):
    """Threaded inline comments attached to text selections."""
    __tablename__ = "submission_comments"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    version_number = Column(Integer, default=1)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    highlight_text = Column(Text, nullable=True)
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    comment_text = Column(Text, nullable=False)
    is_resolved = Column(Boolean, default=False)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("submission_comments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="comments")
    author = relationship("User", foreign_keys=[author_id])
    parent = relationship("SubmissionComment", remote_side=[id], back_populates="replies")
    replies = relationship("SubmissionComment", back_populates="parent", cascade="all, delete-orphan")


class SubmissionSuggestion(Base):
    """Track-changes style edit suggestions from teachers."""
    __tablename__ = "submission_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    version_number = Column(Integer, default=1)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_text = Column(Text, nullable=True)
    suggested_text = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    status = Column(String(50), default="pending")  # 'pending','accepted','rejected'
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="suggestions")
    author = relationship("User")


class SubmissionSectionFeedback(Base):
    """Independent section-level evaluation (Introduction, Research, etc.)."""
    __tablename__ = "submission_section_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    section_name = Column(String(100), nullable=False)  # 'introduction','research','analysis','discussion','conclusion','references'
    score = Column(Float, nullable=True)
    max_score = Column(Float, default=10.0)
    comments = Column(Text, nullable=True)
    strengths_json = Column(JSON, nullable=True)
    weaknesses_json = Column(JSON, nullable=True)
    suggestions_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="section_feedbacks")


class DocumentExtraction(Base):
    """Extracted text, headings, metadata from uploaded files (PDF, DOCX, etc.)."""
    __tablename__ = "document_extractions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False)
    file_id = Column(Integer, ForeignKey("submission_files.id"), nullable=True)
    extracted_text = Column(Text, nullable=True)
    headings_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    word_count = Column(Integer, nullable=True)
    summary_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("AssignmentSubmission", back_populates="doc_extractions")
    file = relationship("SubmissionFile")
