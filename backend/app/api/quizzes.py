"""
Quiz & Assessment API: CRUD for quizzes, questions, quiz taking, and grading.
Includes AI-powered quiz generation (Phase 5).
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models import (
    User, UserRole, Course, Lesson, Quiz, Question, QuizAttempt, Answer,
    QuizStatus, QuestionType, Enrollment, AILog, ProcessingStatus,
    Notification, NotificationType, QuestionVersion, QuizQuestion, 
    QuizAttemptStatus, IntegrityEventType, IntegrityEvent, 
    CognitiveLevel, Difficulty, AIValidationStatus, TeacherApprovalStatus
)
from app.schemas import (
    QuizCreate, QuizCreateFromBank, QuizUpdate, QuizResponse, QuizDetailResponse,
    QuestionVersionCreate, QuestionVersionResponse, QuestionStudentView,
    QuizSubmit, QuizAttemptResponse, AnswerResponse, MessageResponse,
    AIQuizGenerate, AnswerModerateRequest, IntegrityEventCreate,
    AttemptDetailResponse
)
from app.auth import get_current_user, require_admin_or_teacher, require_role

router = APIRouter()


# ──────────────────────────────────────────────
# Quiz CRUD (Teacher)
# ──────────────────────────────────────────────

@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    quiz_data: QuizCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Create a quiz with optional questions."""
    lesson = db.query(Lesson).filter(Lesson.id == quiz_data.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only create quizzes in your own courses")

    quiz = Quiz(
        title=quiz_data.title,
        description=quiz_data.description,
        time_limit_minutes=quiz_data.time_limit_minutes,
        available_from=quiz_data.available_from,
        available_until=quiz_data.available_until,
        max_attempts=quiz_data.max_attempts,
        is_strict_mode=quiz_data.is_strict_mode,
        randomize_questions=quiz_data.randomize_questions,
        randomize_options=quiz_data.randomize_options,
        lesson_id=quiz_data.lesson_id,
        course_id=course.id,
    )
    db.add(quiz)
    db.flush()

    # Add inline questions if provided
    for i, q_data in enumerate(quiz_data.questions or []):
        question = Question(is_banked=False)
        db.add(question)
        db.flush()
        
        qv = QuestionVersion(
            question_id=question.id,
            question_text=q_data.question_text,
            question_type=q_data.question_type,
            options=q_data.options,
            correct_answer=q_data.correct_answer,
            explanation=q_data.explanation,
            default_points=q_data.default_points,
            difficulty=q_data.difficulty,
            cognitive_level=q_data.cognitive_level,
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            source_type="manual"
        )
        db.add(qv)
        db.flush()
        
        qq = QuizQuestion(
            quiz_id=quiz.id,
            question_version_id=qv.id,
            order=i,
        )
        db.add(qq)

    db.commit()
    db.refresh(quiz)
    return _build_quiz_response(quiz, db)


@router.get("/lesson/{lesson_id}", response_model=List[QuizResponse])
async def list_quizzes(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List quizzes for a lesson."""
    query = db.query(Quiz).filter(Quiz.lesson_id == lesson_id)
    if current_user.role == UserRole.STUDENT:
        query = query.filter(Quiz.status == QuizStatus.PUBLISHED)
    quizzes = query.order_by(Quiz.created_at.desc()).all()
    return [_build_quiz_response(q, db) for q in quizzes]


# ──────────────────────────────────────────────
# AI Quiz Generation (Phase 5) — MUST be before /{quiz_id}
# ──────────────────────────────────────────────

import json
from app.database import SessionLocal

def run_quiz_generation(ai_log_id: int, course_id: int, lesson_id: int, data: AIQuizGenerate, pdf_text: str = None, pdf_type: str = None, extract_all: bool = False):
    """Background task to generate quiz questions and save to DB."""
    import time as _time
    start_time = _time.time()
    
    db = SessionLocal()
    try:
        if pdf_text and pdf_type:
            from app.services.quiz_gen import generate_quiz_from_pdf_text
            generated = generate_quiz_from_pdf_text(
                text=pdf_text,
                pdf_type=pdf_type,
                num_questions=data.num_questions,
                difficulty=data.difficulty,
                extract_all=extract_all
            )
        else:
            from app.services.quiz_gen import generate_quiz_questions
            generated = generate_quiz_questions(
                course_id=course_id,
                lesson_id=lesson_id,
                num_questions=data.num_questions,
                question_types=data.question_types,
                mcq_count=data.mcq_count,
                tf_count=data.tf_count,
                sa_count=data.sa_count,
                difficulty=data.difficulty,
                material_ids=data.material_ids,
            )
        
        ai_log = db.query(AILog).filter(AILog.id == ai_log_id).first()
        if not ai_log:
            return
            
        if not generated:
            ai_log.status = ProcessingStatus.FAILED
            ai_log.error_message = "Could not generate questions. Ensure materials have extracted text."
            db.commit()
            return
            
        # Create quiz
        quiz = Quiz(
            title=data.title,
            description=f"AI-generated {data.difficulty} quiz with {len(generated)} questions",
            lesson_id=lesson_id,
            course_id=course_id,
            is_ai_generated=True,
            status=QuizStatus.DRAFT,
            time_limit_minutes=data.time_limit_minutes,
            available_until=data.available_until,
        )
        db.add(quiz)
        db.flush()
        
        default_pts = data.default_points or 10.0
        
        # Add generated questions
        for i, q_data in enumerate(generated):
            q_type = QuestionType(q_data["question_type"])
            
            question = Question(is_banked=True, lesson_id=lesson_id)
            db.add(question)
            db.flush()
            
            # Map AI Validation Status safely
            ai_status_str = q_data.get("ai_validation_status", "review_recommended").upper()
            try:
                ai_status = AIValidationStatus(ai_status_str)
            except ValueError:
                ai_status = AIValidationStatus.REVIEW_RECOMMENDED
                
            # Map Cognitive Level safely
            cog_level_str = q_data.get("cognitive_level", "understand").lower()
            try:
                cog_level = CognitiveLevel(cog_level_str)
            except ValueError:
                cog_level = CognitiveLevel.UNDERSTAND
                
            # Map Difficulty safely
            diff_str = q_data.get("difficulty", "medium").lower()
            try:
                diff_enum = Difficulty(diff_str)
            except ValueError:
                diff_enum = Difficulty.MEDIUM

            qv = QuestionVersion(
                question_id=question.id,
                question_text=q_data["question_text"],
                question_type=q_type,
                options=q_data.get("options"),
                correct_answer=q_data["correct_answer"],
                explanation=q_data.get("explanation", ""),
                default_points=q_data.get("points", 1.0),
                difficulty=diff_enum,
                cognitive_level=cog_level,
                teacher_approval_status=TeacherApprovalStatus.PENDING_REVIEW,
                ai_validation_status=ai_status,
                source_type="ai",
                source_reference=q_data.get("source_reference")
            )
            db.add(qv)
            db.flush()
            
            qq = QuizQuestion(
                quiz_id=quiz.id,
                question_version_id=qv.id,
                order=i,
            )
            db.add(qq)
            
        # Update log
        elapsed_ms = int((_time.time() - start_time) * 1000)
        ai_log.status = ProcessingStatus.COMPLETED
        ai_log.output_summary = json.dumps({"quiz_id": quiz.id, "count": len(generated)})
        ai_log.processing_time_ms = elapsed_ms
        
        db.commit()
    except Exception as e:
        db.rollback()
        ai_log = db.query(AILog).filter(AILog.id == ai_log_id).first()
        if ai_log:
            ai_log.status = ProcessingStatus.FAILED
            ai_log.error_message = str(e)
            db.commit()
    finally:
        db.close()


@router.post("/ai/generate")
def generate_ai_quiz(
    data: AIQuizGenerate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Start an AI quiz generation task in the background."""
    lesson = db.query(Lesson).filter(Lesson.id == data.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only generate quizzes for your own courses")

    # Create initial AILog
    ai_log = AILog(
        action="quiz_generation",
        input_summary=f"Lesson: {lesson.title} | {data.num_questions} questions | {data.difficulty}",
        status=ProcessingStatus.PROCESSING,
    )
    db.add(ai_log)
    db.commit()
    db.refresh(ai_log)

    background_tasks.add_task(run_quiz_generation, ai_log.id, course.id, lesson.id, data)

    return {"message": "Quiz generation started", "task_id": ai_log.id}

@router.get("/ai/task/{task_id}")
def get_ai_task_status(
    task_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Check the status of an AI quiz generation task."""
    ai_log = db.query(AILog).filter(AILog.id == task_id).first()
    if not ai_log:
        raise HTTPException(status_code=404, detail="Task not found")
        
    response = {
        "task_id": ai_log.id,
        "status": ai_log.status.value,
    }
    
    if ai_log.status == ProcessingStatus.COMPLETED and ai_log.output_summary:
        import json
        try:
            data = json.loads(ai_log.output_summary)
            response["quiz_id"] = data.get("quiz_id")
        except json.JSONDecodeError:
            pass
            
    if ai_log.status == ProcessingStatus.FAILED:
        response["error"] = ai_log.error_message
        
    return response

@router.post("/ai/generate-pdf")
async def generate_ai_quiz_from_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    lesson_id: int = Form(...),
    title: str = Form(...),
    num_questions: int = Form(5),
    difficulty: str = Form("medium"),
    pdf_type: str = Form("questions_only"),
    extract_all: str = Form("true"),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Start an AI quiz generation task from an uploaded PDF."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only generate quizzes for your own courses")

    import fitz
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="PDF contains no extractable text")

    # Create initial AILog
    ai_log = AILog(
        action="pdf_quiz_generation",
        input_summary=f"PDF Upload | {num_questions} questions | {pdf_type}",
        status=ProcessingStatus.PROCESSING,
    )
    db.add(ai_log)
    db.commit()
    db.refresh(ai_log)

    data = AIQuizGenerate(
        lesson_id=lesson_id,
        title=title,
        num_questions=num_questions,
        difficulty=difficulty,
        question_types=["mcq"]
    )
    background_tasks.add_task(run_quiz_generation, ai_log.id, course.id, lesson.id, data, text, pdf_type, extract_all.lower() == "true")

    return {"message": "PDF Quiz generation started", "task_id": ai_log.id}


# ──────────────────────────────────────────────
# Quiz by ID (parameterized — AFTER static routes)
# ──────────────────────────────────────────────

@router.get("/{quiz_id}", response_model=QuizDetailResponse)
async def get_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get quiz details with questions."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    quiz_questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).order_by(QuizQuestion.order).all()
    question_count = len(quiz_questions)

    question_list = []
    for qq in quiz_questions:
        qv = qq.question_version
        
        # Determine effective points
        effective_points = qq.points_override if qq.points_override is not None else qv.default_points
        
        if current_user.role == UserRole.STUDENT:
            # Hide correct answers & explanations for students
            question_list.append(
                QuestionVersionResponse(
                    id=qv.id, question_id=qv.question_id, question_text=qv.question_text, 
                    question_type=qv.question_type, options=qv.options, 
                    correct_answer=None, explanation=None,
                    default_points=effective_points, difficulty=qv.difficulty, 
                    cognitive_level=qv.cognitive_level, ai_validation_status=qv.ai_validation_status,
                    teacher_approval_status=qv.teacher_approval_status, created_at=qv.created_at
                )
            )
        else:
            # Full data for teachers/admins
            qv_resp = QuestionVersionResponse.model_validate(qv)
            qv_resp.default_points = effective_points
            question_list.append(qv_resp)

    return QuizDetailResponse(
        id=quiz.id, title=quiz.title, description=quiz.description, status=quiz.status,
        time_limit_minutes=quiz.time_limit_minutes, available_from=quiz.available_from,
        available_until=quiz.available_until, max_attempts=quiz.max_attempts,
        is_strict_mode=quiz.is_strict_mode, randomize_questions=quiz.randomize_questions,
        randomize_options=quiz.randomize_options, is_ai_generated=quiz.is_ai_generated, 
        short_answer_grading_mode=quiz.short_answer_grading_mode, lesson_id=quiz.lesson_id, 
        question_count=question_count, created_at=quiz.created_at, questions=question_list
    )


@router.patch("/{quiz_id}", response_model=QuizResponse)
async def update_quiz(
    quiz_id: int,
    quiz_data: QuizUpdate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Update quiz metadata or publish/archive."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    update_data = quiz_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(quiz, key, value)
    db.commit()
    db.refresh(quiz)
    return _build_quiz_response(quiz, db)


@router.post("/{quiz_id}/questions", response_model=QuestionVersionResponse, status_code=status.HTTP_201_CREATED)
async def add_question(
    quiz_id: int,
    question_data: QuestionVersionCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Add a question to an existing quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    question = Question(is_banked=False)
    db.add(question)
    db.flush()
    
    qv = QuestionVersion(
        question_id=question.id,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        options=question_data.options,
        correct_answer=question_data.correct_answer,
        explanation=question_data.explanation,
        default_points=question_data.default_points,
        difficulty=question_data.difficulty,
        cognitive_level=question_data.cognitive_level,
        teacher_approval_status=TeacherApprovalStatus.APPROVED,
        source_type="manual"
    )
    db.add(qv)
    db.flush()
    
    # Get current max order
    max_order = db.query(func.max(QuizQuestion.order)).filter(QuizQuestion.quiz_id == quiz_id).scalar() or -1
    
    qq = QuizQuestion(
        quiz_id=quiz_id,
        question_version_id=qv.id,
        order=max_order + 1
    )
    db.add(qq)
    db.commit()
    db.refresh(qv)
    return qv

@router.delete("/{quiz_id}/questions/{question_id}", response_model=MessageResponse)
async def delete_question(
    quiz_id: int,
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Delete a question from a quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    question = db.query(Question).filter(Question.id == question_id, Question.quiz_id == quiz_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    db.delete(question)
    db.commit()
    return {"message": "Question deleted successfully", "success": True}


class ImportBankRequest(BaseModel):
    question_version_ids: List[int]


@router.post("/{quiz_id}/questions/import-bank")
async def import_questions_from_bank(
    quiz_id: int,
    data: ImportBankRequest,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Import questions from the question bank into an existing quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Get current max order
    max_order = db.query(func.max(QuizQuestion.order)).filter(QuizQuestion.quiz_id == quiz_id).scalar() or 0

    added = 0
    for idx, qv_id in enumerate(data.question_version_ids):
        # Check version exists
        qv = db.query(QuestionVersion).filter(QuestionVersion.id == qv_id).first()
        if not qv:
            continue

        # Skip if already in this quiz
        existing = db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == quiz_id,
            QuizQuestion.question_version_id == qv_id
        ).first()
        if existing:
            continue

        qq = QuizQuestion(
            quiz_id=quiz_id,
            question_version_id=qv_id,
            order=max_order + idx + 1,
        )
        db.add(qq)
        added += 1

    db.commit()
    return {"message": f"Successfully imported {added} question(s).", "added": added}


@router.post("/attempts/{attempt_id}/integrity-events", response_model=MessageResponse)
def log_integrity_event(
    attempt_id: int,
    event_data: IntegrityEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log an integrity event (tab switch, window blur, etc.) for a quiz attempt."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can log integrity events")

    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    if attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only log events for your own attempts")
        
    if attempt.status != QuizAttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Cannot log events for a completed attempt")

    event = IntegrityEvent(
        attempt_id=attempt.id,
        event_type=event_data.event_type,
        metadata_json=event_data.metadata_json
    )
    db.add(event)
    db.commit()
    
    return {"message": "Integrity event logged", "success": True}


@router.delete("/{quiz_id}", response_model=MessageResponse)
async def delete_quiz(
    quiz_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Delete a quiz and all its questions/attempts."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    db.delete(quiz)
    db.commit()
    return {"message": f"Quiz '{quiz.title}' has been deleted", "success": True}


# ──────────────────────────────────────────────
# Quiz Taking (Student)
# ──────────────────────────────────────────────

from datetime import timedelta

@router.post("/{quiz_id}/start", response_model=QuizAttemptResponse)
def start_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a quiz attempt and calculate deadlines."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can take quizzes")

    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.status == QuizStatus.PUBLISHED).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")

    now = datetime.utcnow()
    
    # Check availability
    if quiz.available_from and now < quiz.available_from:
        raise HTTPException(status_code=400, detail="Quiz is not available yet.")
    if quiz.available_until and now > quiz.available_until:
        raise HTTPException(status_code=400, detail="Quiz is no longer available.")
        
    # Resume an unfinished attempt instead of creating a duplicate.
    # Match by completed_at so legacy/orphaned rows (from failed start responses) are recovered.
    active_attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.completed_at.is_(None),
        QuizAttempt.status.notin_([QuizAttemptStatus.SUBMITTED, QuizAttemptStatus.AUTO_CLOSED]),
    ).order_by(QuizAttempt.started_at.desc()).first()

    if active_attempt:
        if active_attempt.status != QuizAttemptStatus.IN_PROGRESS:
            active_attempt.status = QuizAttemptStatus.IN_PROGRESS
            db.commit()
            db.refresh(active_attempt)

        # Auto-close if the deadline has already passed
        if active_attempt.deadline_at and now > active_attempt.deadline_at:
            active_attempt.status = QuizAttemptStatus.AUTO_CLOSED
            active_attempt.completed_at = active_attempt.deadline_at
            db.commit()
            # Active attempt expired; proceed to check if student can start a new attempt below
        else:
            return QuizAttemptResponse(
                id=active_attempt.id,
                student_id=active_attempt.student_id,
                quiz_id=active_attempt.quiz_id,
                score=active_attempt.score,
                total_points=active_attempt.total_points,
                percentage=active_attempt.percentage,
                status=active_attempt.status,
                started_at=active_attempt.started_at,
                deadline_at=active_attempt.deadline_at,
                completed_at=active_attempt.completed_at,
            )

    # Only finished attempts count toward the attempt limit
    past_attempts = db.query(func.count(QuizAttempt.id)).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.status.in_([QuizAttemptStatus.SUBMITTED, QuizAttemptStatus.AUTO_CLOSED]),
    ).scalar()

    if past_attempts >= quiz.max_attempts:
        raise HTTPException(status_code=400, detail="Maximum attempts reached.")

    # Calculate deadline
    deadline_at = None
    if quiz.time_limit_minutes:
        deadline_at = now + timedelta(minutes=quiz.time_limit_minutes)
        if quiz.available_until and deadline_at > quiz.available_until:
            deadline_at = quiz.available_until

    # Create quiz attempt
    attempt = QuizAttempt(
        student_id=current_user.id,
        quiz_id=quiz_id,
        started_at=now,
        deadline_at=deadline_at,
        status=QuizAttemptStatus.IN_PROGRESS
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return QuizAttemptResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        quiz_id=attempt.quiz_id,
        score=attempt.score,
        total_points=attempt.total_points,
        percentage=attempt.percentage,
        status=attempt.status,
        started_at=attempt.started_at,
        deadline_at=attempt.deadline_at,
        completed_at=attempt.completed_at,
    )


@router.post("/{quiz_id}/submit", response_model=QuizAttemptResponse)
def submit_quiz(
    quiz_id: int,
    submission: QuizSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a quiz attempt with answers. Auto-grades MCQ and True/False."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can take quizzes")

    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.status == QuizStatus.PUBLISHED).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")

    # Verify student is enrolled in the course
    lesson = db.query(Lesson).filter(Lesson.id == quiz.lesson_id).first()
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == lesson.course_id,
        Enrollment.is_active == True,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You must be enrolled in the course to take this quiz")

    # Find the active attempt
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.status == QuizAttemptStatus.IN_PROGRESS
    ).first()

    if not attempt:
        raise HTTPException(status_code=400, detail="No active attempt found. Start the quiz first.")

    now = datetime.utcnow()
    # Check deadline
    if attempt.deadline_at and now > attempt.deadline_at:
        attempt.status = QuizAttemptStatus.AUTO_CLOSED
        db.commit()
        raise HTTPException(status_code=400, detail="Quiz submission deadline has passed.")

    # Load all QuizQuestions for the quiz to get the QuestionVersions
    quiz_questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).all()
    q_map = {qq.question_version_id: qq for qq in quiz_questions}
    
    total_points = sum(qq.points_override if qq.points_override is not None else qq.question_version.default_points for qq in quiz_questions)
    earned_points = 0.0

    answers_out = []
    ai_eval_requests = []
    
    for ans in submission.answers:
        qq = q_map.get(ans.question_version_id)
        if not qq:
            continue
            
        qv = qq.question_version
        effective_points = qq.points_override if qq.points_override is not None else qv.default_points

        # Auto-grade MCQ and True/False
        is_correct = None
        points_earned = 0.0
        if qv.question_type in (QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.MULTIPLE_SELECT):
            is_correct = ans.student_answer.strip().lower() == qv.correct_answer.strip().lower()
            points_earned = effective_points if is_correct else 0.0
        elif qv.question_type == QuestionType.SHORT_ANSWER:
            if quiz.short_answer_grading_mode == "ai":
                ai_eval_requests.append({
                    "id": ans.question_version_id,
                    "question": qv.question_text,
                    "correct_answer": qv.correct_answer,
                    "student_answer": ans.student_answer,
                    "max_points": effective_points
                })
                # Points will be updated later
            else:
                # Manual grading
                is_correct = None
                points_earned = 0.0

        answer = Answer(
            attempt_id=attempt.id,
            question_version_id=ans.question_version_id,
            student_answer=ans.student_answer,
            is_correct=is_correct,
            points_earned=points_earned,
        )
        db.add(answer)
        # Store in dict temporarily for AI update
        answers_out.append(answer)
        
    db.flush()

    if ai_eval_requests:
        from app.services.quiz_gen import evaluate_short_answers
        results = evaluate_short_answers(ai_eval_requests)
        # Create lookup map
        result_map = {res["id"]: res for res in results}
        for answer in answers_out:
            if answer.question_version_id in result_map:
                res = result_map[answer.question_version_id]
                qq = q_map.get(answer.question_version_id)
                eff_pts = (qq.points_override if qq and qq.points_override is not None else qq.question_version.default_points) if qq else 1.0
                raw_pts = res.get("points_earned", 0.0)
                answer.points_earned = max(0.0, min(eff_pts, float(raw_pts)))
                answer.is_correct = res.get("is_correct") if answer.points_earned > 0 else False

    earned_points = max(0.0, min(total_points, sum(ans.points_earned for ans in answers_out)))
    
    # Format response
    response_answers = []
    for ans in answers_out:
        qq = q_map.get(ans.question_version_id)
        qv = qq.question_version if qq else None
        response_answers.append(AnswerResponse(
            id=ans.id,
            attempt_id=ans.attempt_id,
            question_version_id=ans.question_version_id,
            student_answer=ans.student_answer,
            is_correct=ans.is_correct,
            points_earned=ans.points_earned,
            correct_answer=qv.correct_answer if qv else None,
        ))

    attempt.score = earned_points
    attempt.total_points = total_points
    attempt.percentage = max(0.0, min(100.0, (earned_points / total_points * 100))) if total_points > 0 else 0.0
    attempt.status = QuizAttemptStatus.SUBMITTED
    attempt.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(attempt)

    # Notify teacher if quiz has short_answer questions requiring manual grading
    has_short_answers = any(
        qq.question_version.question_type == QuestionType.SHORT_ANSWER for qq in quiz_questions
    )
    if has_short_answers and quiz.short_answer_grading_mode == "manual":
        course = db.query(Course).filter(Course.id == lesson.course_id).first()
        if course and course.teacher_id:
            notif = Notification(
                user_id=course.teacher_id,
                sender_id=current_user.id,
                title="New quiz submission needs grading",
                message=f"{current_user.full_name} submitted '{quiz.title}' which requires manual grading",
                type=NotificationType.COURSE,
                related_entity_id=attempt.id,
            )
            db.add(notif)
            db.commit()

    return QuizAttemptResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        quiz_id=attempt.quiz_id,
        score=attempt.score,
        total_points=attempt.total_points,
        percentage=attempt.percentage,
        status=attempt.status,
        started_at=attempt.started_at,
        deadline_at=attempt.deadline_at,
        completed_at=attempt.completed_at,
        answers=response_answers,
    )

@router.get("/{quiz_id}/attempts", response_model=List[QuizAttemptResponse])
async def get_quiz_attempts(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get quiz attempts.
    - Students see their own attempts.
    - Teachers/Admins see all attempts for the quiz.
    """
    query = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz_id)
    if current_user.role == UserRole.STUDENT:
        query = query.filter(QuizAttempt.student_id == current_user.id)
    attempts = query.order_by(QuizAttempt.started_at.desc()).all()
    quiz_questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).all()
    q_map = {qq.question_version_id: qq for qq in quiz_questions}

    res = []
    for a in attempts:
        answers_out = []
        if a.answers:
            for ans in a.answers:
                qv = ans.question_version
                answers_out.append(AnswerResponse(
                    id=ans.id,
                    attempt_id=ans.attempt_id,
                    question_version_id=ans.question_version_id,
                    student_answer=ans.student_answer,
                    is_correct=ans.is_correct,
                    points_earned=ans.points_earned,
                    correct_answer=qv.correct_answer if qv else None,
                    is_flagged=ans.is_flagged,
                    teacher_note=ans.teacher_note,
                    is_overridden=ans.is_overridden,
                ))

        res.append(QuizAttemptResponse(
            id=a.id, student_id=a.student_id, quiz_id=a.quiz_id,
            score=a.score, total_points=a.total_points, percentage=a.percentage,
            started_at=a.started_at, completed_at=a.completed_at,
            status=a.status, deadline_at=a.deadline_at,
            integrity_warnings=len(a.integrity_events),
            student_name=a.student.full_name if a.student else f"Student #{a.student_id}",
            answers=answers_out if answers_out else None,
        ))
    return res


@router.get("/{quiz_id}/attempts/{attempt_id}/detail", response_model=AttemptDetailResponse)
async def get_attempt_detail(
    quiz_id: int,
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full attempt detail with all answers and question context for grading / student review."""
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id,
        QuizAttempt.quiz_id == quiz_id,
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Authorization: Student can view their own attempt, Teacher/Admin can view attempts for their courses
    quiz = attempt.quiz
    course = quiz.course
    if current_user.role == UserRole.STUDENT:
        if attempt.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only view your own attempt details")
    elif current_user.role == UserRole.TEACHER:
        if course.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view attempt details for this course")

    # Build answer responses with full question context
    answer_responses = []
    for ans in attempt.answers:
        qv = ans.question_version
        qq = db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == quiz_id,
            QuizQuestion.question_version_id == ans.question_version_id
        ).first()
        effective_points = (qq.points_override if qq and qq.points_override is not None else qv.default_points) if qv else 1.0
        
        answer_responses.append(AnswerResponse(
            id=ans.id,
            attempt_id=ans.attempt_id,
            question_version_id=ans.question_version_id,
            student_answer=ans.student_answer,
            is_correct=ans.is_correct,
            points_earned=ans.points_earned,
            correct_answer=qv.correct_answer if qv else None,
            is_flagged=ans.is_flagged,
            teacher_note=ans.teacher_note,
            is_overridden=ans.is_overridden,
            question_text=qv.question_text if qv else "Unknown Question",
            question_type=qv.question_type.value if qv else None,
            max_points=effective_points,
            options=qv.options if qv else None,
            explanation=qv.explanation if qv else None,
        ))

    return AttemptDetailResponse(
        id=attempt.id,
        student_id=attempt.student_id,
        student_name=attempt.student.full_name if attempt.student else f"Student #{attempt.student_id}",
        quiz_id=attempt.quiz_id,
        quiz_title=quiz.title,
        score=attempt.score,
        total_points=attempt.total_points,
        percentage=attempt.percentage,
        status=attempt.status,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        answers=answer_responses,
    )


# ──────────────────────────────────────────────
# Answer Flagging & Moderation
# ──────────────────────────────────────────────

@router.post("/attempts/{attempt_id}/answers/{answer_id}/flag")
async def flag_quiz_answer(
    attempt_id: int,
    answer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Student flags an answer they believe was graded incorrectly."""
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id,
        QuizAttempt.student_id == current_user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz attempt not found")

    answer = db.query(Answer).filter(
        Answer.id == answer_id,
        Answer.attempt_id == attempt_id
    ).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    answer.is_flagged = True
    db.commit()

    # Notify the teacher
    quiz = attempt.quiz
    if quiz and quiz.course and quiz.course.teacher_id:
        notif = Notification(
            user_id=quiz.course.teacher_id,
            sender_id=current_user.id,
            title="Student flagged a quiz answer",
            message=f"{current_user.full_name} flagged an answer in '{quiz.title}' for review",
            type=NotificationType.SYSTEM,
            related_entity_id=answer.id,
        )
        db.add(notif)
        db.commit()

    return {"message": "Answer flagged successfully"}


@router.get("/teacher/grading-queue")
async def get_grading_queue(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher fetches all attempts requiring manual grading or integrity review."""
    courses = db.query(Course.id).filter(Course.teacher_id == current_user.id).subquery()
    quizzes = db.query(Quiz.id).filter(Quiz.course_id.in_(courses)).subquery()
    
    # Get all submitted attempts with either integrity warnings or flagged answers
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id.in_(quizzes),
        QuizAttempt.status == QuizAttemptStatus.SUBMITTED,
    ).all()
    
    results = []
    for attempt in attempts:
        integrity_count = len(attempt.integrity_events)
        needs_review = integrity_count > 0
        flagged_answers = []
        pending_short_answers = []
        
        for ans in attempt.answers:
            if ans.is_flagged:
                needs_review = True
                flagged_answers.append(ans.id)
            if ans.question_version and ans.question_version.question_type == QuestionType.SHORT_ANSWER and not ans.teacher_note and not ans.is_overridden:
                needs_review = True
                pending_short_answers.append(ans.id)
                
        results.append({
            "attempt_id": attempt.id,
            "quiz_id": attempt.quiz_id,
            "quiz_title": attempt.quiz.title,
            "student_id": attempt.student_id,
            "student_name": attempt.student.full_name,
            "course_title": attempt.quiz.course.title,
            "submitted_at": attempt.completed_at,
            "score": attempt.score,
            "total_points": attempt.total_points,
            "integrity_warnings": integrity_count,
            "flagged_answers_count": len(flagged_answers),
            "pending_short_answers_count": len(pending_short_answers),
            "is_pending_review": needs_review,
            "events": [{"event_type": e.event_type.value, "timestamp": e.created_at, "metadata": e.metadata_json} for e in attempt.integrity_events]
        })
            
    results.sort(key=lambda x: x["submitted_at"] or datetime.min, reverse=True)
    return results


@router.post("/teacher/answers/{answer_id}/moderate")
async def moderate_flagged_answer(
    answer_id: int,
    data: AnswerModerateRequest,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher overrides the grade for a flagged answer."""
    answer = db.query(Answer).filter(Answer.id == answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")
        
    attempt = answer.attempt
    quiz = attempt.quiz
    course = quiz.course
    
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to moderate answers for this course")
        
    # Find question max points
    qq = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == attempt.quiz_id,
        QuizQuestion.question_version_id == answer.question_version_id
    ).first()
    max_pts = (qq.points_override if qq and qq.points_override is not None else answer.question_version.default_points) if answer.question_version else 1.0

    # Update the answer
    old_points = answer.points_earned or 0.0
    new_points = max(0.0, min(float(max_pts), float(data.points_earned)))
    
    answer.is_correct = data.is_correct
    answer.points_earned = new_points
    answer.teacher_note = data.teacher_note
    answer.is_overridden = True
    answer.is_flagged = False # Clear the flag once reviewed
    
    # Recalculate attempt score
    point_diff = new_points - old_points
    raw_new_score = (attempt.score or 0.0) + point_diff
    attempt.score = max(0.0, min(attempt.total_points or 1.0, raw_new_score))
    if attempt.total_points and attempt.total_points > 0:
        attempt.percentage = max(0.0, min(100.0, (attempt.score / attempt.total_points) * 100))
        
    db.commit()

    # Notify the student that their answer was graded
    student = attempt.student
    notif = Notification(
        user_id=attempt.student_id,
        sender_id=current_user.id,
        title="Quiz answer reviewed",
        message=f"Your flagged answer in '{quiz.title}' has been reviewed by {current_user.full_name}",
        type=NotificationType.COURSE,
        related_entity_id=attempt.id,
    )
    db.add(notif)
    db.commit()

    return {"message": "Answer moderated successfully", "new_score": attempt.score}


@router.post("/from-bank", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
def create_quiz_from_bank(
    quiz_data: QuizCreateFromBank,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Create a quiz using existing questions from the Question Bank."""
    # Check if lesson exists and belongs to a course the teacher can manage
    lesson = db.query(Lesson).filter(Lesson.id == quiz_data.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to create quizzes for this course")

    # Verify all provided questions exist and get their latest versions
    questions = db.query(Question).filter(Question.id.in_(quiz_data.question_ids)).all()
    if len(questions) != len(quiz_data.question_ids):
        raise HTTPException(status_code=400, detail="One or more selected questions do not exist in the bank.")

    # Create the quiz
    quiz = Quiz(
        title=quiz_data.title,
        description=quiz_data.description,
        time_limit_minutes=quiz_data.time_limit_minutes,
        available_from=quiz_data.available_from,
        available_until=quiz_data.available_until,
        max_attempts=quiz_data.max_attempts,
        is_strict_mode=quiz_data.is_strict_mode,
        randomize_questions=quiz_data.randomize_questions,
        randomize_options=quiz_data.randomize_options,
        short_answer_grading_mode=quiz_data.short_answer_grading_mode,
        lesson_id=quiz_data.lesson_id,
        course_id=course.id,
        is_ai_generated=False,
        status=QuizStatus.DRAFT,
    )
    db.add(quiz)
    db.flush()

    # Link the latest version of each question
    for i, q in enumerate(questions):
        # The latest version is typically the last one added, or the one with the highest ID
        latest_version = db.query(QuestionVersion).filter(QuestionVersion.question_id == q.id).order_by(QuestionVersion.id.desc()).first()
        if not latest_version:
            continue
            
        qq = QuizQuestion(
            quiz_id=quiz.id,
            question_version_id=latest_version.id,
            order=i,
        )
        db.add(qq)
        
    db.commit()
    db.refresh(quiz)
    return _build_quiz_response(quiz, db)


@router.post("/attempts/{attempt_id}/integrity-events", response_model=MessageResponse)
def log_attempt_integrity_events(
    attempt_id: int,
    events: List[IntegrityEventCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Log granular academic integrity events during a quiz session.
    """
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Quiz attempt not found")

    if attempt.student_id != current_user.id and current_user.role not in [UserRole.TEACHER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to log events for this attempt")

    from app.services.integrity import log_integrity_event
    for ev in events:
        log_integrity_event(
            db=db,
            attempt_id=attempt_id,
            event_type=ev.event_type,
            timestamp=ev.timestamp,
            metadata_json=ev.metadata_json,
            severity=ev.severity
        )

    return MessageResponse(message=f"Successfully logged {len(events)} integrity events", success=True)


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────

def _build_quiz_response(quiz: Quiz, db: Session) -> QuizResponse:
    question_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.quiz_id == quiz.id).scalar()
    return QuizResponse(
        id=quiz.id, title=quiz.title, description=quiz.description,
        status=quiz.status, time_limit_minutes=quiz.time_limit_minutes,
        available_from=quiz.available_from, available_until=quiz.available_until,
        max_attempts=quiz.max_attempts, is_strict_mode=quiz.is_strict_mode,
        randomize_questions=quiz.randomize_questions,
        randomize_options=quiz.randomize_options,
        is_ai_generated=quiz.is_ai_generated,
        short_answer_grading_mode=quiz.short_answer_grading_mode,
        lesson_id=quiz.lesson_id,
        question_count=question_count, created_at=quiz.created_at,
    )


@router.post("/smart-revision", response_model=dict)
def create_smart_revision_quiz(
    data: dict,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Generate a personalized adaptive smart revision quiz based on student's weak questions & past missed items."""
    lesson_id = data.get("lesson_id")
    if not lesson_id:
        lesson = db.query(Lesson).first()
        lesson_id = lesson.id if lesson else 1

    # Fetch question bank versions
    q_versions = db.query(QuestionVersion).limit(10).all()
    if not q_versions:
        raise HTTPException(status_code=400, detail="No questions available for revision.")

    # Create new revision quiz
    revision_quiz = Quiz(
        title=f"Smart Revision Practice - {datetime.utcnow().strftime('%b %d')}",
        description="Adaptively assembled revision session targeting your past weak questions and key concepts.",
        lesson_id=lesson_id,
        status=QuizStatus.PUBLISHED,
        time_limit_minutes=20,
        is_ai_generated=True,
        short_answer_grading_mode="ai"
    )
    db.add(revision_quiz)
    db.commit()
    db.refresh(revision_quiz)

    # Attach questions
    for order, qv in enumerate(q_versions[:5], start=1):
        qq = QuizQuestion(
            quiz_id=revision_quiz.id,
            question_version_id=qv.id,
            order=order,
            points=10.0
        )
        db.add(qq)
        
    db.commit()
    return {
        "id": revision_quiz.id,
        "title": revision_quiz.title,
        "question_count": len(q_versions[:5]),
        "message": "Smart Revision Quiz generated successfully!"
    }
