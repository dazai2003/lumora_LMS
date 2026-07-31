from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import User, UserRole, Question, QuestionVersion, Difficulty, CognitiveLevel, QuestionType
from app.auth import require_admin_or_teacher
from app.schemas import (
    QuestionVersionResponse,
    QuestionAnalyticsResponse,
    QuestionImproveRequest,
    QuestionVariationRequest
)
router = APIRouter()

@router.get("/bank", response_model=List[QuestionVersionResponse])
def get_question_bank(
    subject_id: Optional[int] = Query(None, description="Filter by subject"),
    topic_id: Optional[int] = Query(None, description="Filter by topic"),
    lesson_id: Optional[int] = Query(None, description="Filter by lesson"),
    question_type: Optional[QuestionType] = Query(None, description="Filter by question type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Retrieve questions from the Question Bank.
    Questions are considered 'banked' if `is_banked=True`.
    """
    from sqlalchemy.orm import joinedload
    # Join Question with QuestionVersion to filter on both identities
    query = db.query(QuestionVersion).join(Question, Question.id == QuestionVersion.question_id)
    
    # Eagerly load the question and lesson to satisfy the properties
    query = query.options(joinedload(QuestionVersion.question).joinedload(Question.lesson))

    # Only return banked questions
    query = query.filter(Question.is_banked == True, Question.is_active == True)
    
    # Apply filters
    if topic_id is not None:
        query = query.filter(Question.topic_id == topic_id)
        
    if subject_id is not None:
        from app.models import Topic
        query = query.join(Topic, Question.topic_id == Topic.id).filter(Topic.subject_id == subject_id)
        
    if lesson_id is not None:
        query = query.filter(Question.lesson_id == lesson_id)
        
    if question_type is not None:
        query = query.filter(QuestionVersion.question_type == question_type)
        
    # Get the latest versions
    # For a real implementation, we would ensure we get the latest approved version.
    # Currently we just return all matching versions, or the most recent per question.
    # We will order by creation date descending.
    query = query.order_by(QuestionVersion.created_at.desc())
    
    versions = query.offset(offset).limit(limit).all()
    
    # Build response
    return [QuestionVersionResponse.model_validate(v) for v in versions]

@router.get("/{question_id}/analytics", response_model=QuestionAnalyticsResponse)
def get_question_analytics(
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.models import Answer
    from app.schemas import QuestionAnalyticsResponse

    # Make sure question exists
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    # Get all versions for this question
    version_ids = [v.id for v in question.versions]
    
    if not version_ids:
        return QuestionAnalyticsResponse(
            total_attempts=0,
            correct_attempts=0,
            success_rate=0.0,
            observed_difficulty="unknown",
            distractor_distribution={}
        )

    # Get all answers for these versions
    answers = db.query(Answer).filter(Answer.question_version_id.in_(version_ids)).all()
    
    total_attempts = len(answers)
    if total_attempts == 0:
        return QuestionAnalyticsResponse(
            total_attempts=0,
            correct_attempts=0,
            success_rate=0.0,
            observed_difficulty="unknown",
            distractor_distribution={}
        )
        
    correct_attempts = sum(1 for a in answers if a.is_correct)
    success_rate = (correct_attempts / total_attempts) * 100
    
    # Calculate observed difficulty
    observed_difficulty = "medium"
    if success_rate < 40:
        observed_difficulty = "hard"
    elif success_rate > 75:
        observed_difficulty = "easy"
        
    # Calculate distractor distribution
    distractor_distribution = {}
    for a in answers:
        # Only do distractor analysis if there is a student answer text
        if a.student_answer:
            ans_str = str(a.student_answer).strip()
            if ans_str not in distractor_distribution:
                distractor_distribution[ans_str] = 0
            distractor_distribution[ans_str] += 1
            
    # Convert counts to percentages
    for k in distractor_distribution:
        distractor_distribution[k] = round((distractor_distribution[k] / total_attempts) * 100, 1)

    return QuestionAnalyticsResponse(
        total_attempts=total_attempts,
        correct_attempts=correct_attempts,
        success_rate=round(success_rate, 1),
        observed_difficulty=observed_difficulty,
        distractor_distribution=distractor_distribution
    )


@router.post("/{question_id}/improve", response_model=QuestionVersionResponse)
def improve_question_endpoint(
    question_id: int,
    request: dict, # Using dict to avoid schema circular imports here for a quick add
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.services.quiz_gen import improve_question
    from app.models import TeacherApprovalStatus, AIValidationStatus
    
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    latest = db.query(QuestionVersion).filter(QuestionVersion.question_id == question_id).order_by(QuestionVersion.id.desc()).first()
    if not latest:
        raise HTTPException(status_code=404, detail="Question version not found")

    q_data = {
        "question_text": latest.question_text,
        "question_type": latest.question_type.value if hasattr(latest.question_type, 'value') else latest.question_type,
        "options": latest.options,
        "correct_answer": latest.correct_answer,
        "explanation": latest.explanation,
        "difficulty": latest.difficulty.value if hasattr(latest.difficulty, 'value') else latest.difficulty,
        "cognitive_level": latest.cognitive_level.value if hasattr(latest.cognitive_level, 'value') else latest.cognitive_level,
    }
    
    instructions = request.get("instructions", ["Improve question wording"])
    
    improved_data = improve_question(q_data, instructions)
    if not improved_data:
        raise HTTPException(status_code=500, detail="Failed to improve question with AI")
        
    # Create new version
    qv = QuestionVersion(
        question_id=question_id,
        question_text=improved_data.get("question_text", q_data["question_text"]),
        question_type=latest.question_type,
        options=improved_data.get("options", q_data["options"]),
        correct_answer=improved_data.get("correct_answer", q_data["correct_answer"]),
        explanation=improved_data.get("explanation", q_data["explanation"]),
        default_points=latest.default_points,
        difficulty=improved_data.get("difficulty", q_data["difficulty"]),
        cognitive_level=improved_data.get("cognitive_level", q_data["cognitive_level"]),
        teacher_approval_status=TeacherApprovalStatus.APPROVED,
        ai_validation_status=improved_data.get("ai_validation_status", AIValidationStatus.VALIDATED),
        source_type="ai",
        source_reference="AI Improved Version"
    )
    
    db.add(qv)
    db.commit()
    db.refresh(qv)
    return qv


@router.post("/{question_id}/variations", response_model=List[QuestionVersionResponse])
def generate_variations_endpoint(
    question_id: int,
    request: dict,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.services.quiz_gen import generate_question_variations
    from app.models import TeacherApprovalStatus, AIValidationStatus
    
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    latest = db.query(QuestionVersion).filter(QuestionVersion.question_id == question_id).order_by(QuestionVersion.id.desc()).first()
    if not latest:
        raise HTTPException(status_code=404, detail="Question version not found")

    q_data = {
        "question_text": latest.question_text,
        "question_type": latest.question_type.value if hasattr(latest.question_type, 'value') else latest.question_type,
        "options": latest.options,
        "correct_answer": latest.correct_answer,
        "explanation": latest.explanation,
        "difficulty": latest.difficulty.value if hasattr(latest.difficulty, 'value') else latest.difficulty,
        "cognitive_level": latest.cognitive_level.value if hasattr(latest.cognitive_level, 'value') else latest.cognitive_level,
    }
    
    count = request.get("count", 3)
    variations_data = generate_question_variations(q_data, count=count)
    if not variations_data:
        raise HTTPException(status_code=500, detail="Failed to generate variations with AI")
        
    new_versions = []
    for var_data in variations_data:
        # Create a brand new Question for each variation
        new_q = Question(
            topic_id=question.topic_id,
            subtopic_id=question.subtopic_id,
            lesson_id=question.lesson_id,
            is_banked=True,
            is_active=True
        )
        db.add(new_q)
        db.flush()
        
        qv = QuestionVersion(
            question_id=new_q.id,
            question_text=var_data.get("question_text"),
            question_type=latest.question_type,
            options=var_data.get("options"),
            correct_answer=var_data.get("correct_answer"),
            explanation=var_data.get("explanation"),
            default_points=latest.default_points,
            difficulty=var_data.get("difficulty"),
            cognitive_level=var_data.get("cognitive_level"),
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            ai_validation_status=var_data.get("ai_validation_status", AIValidationStatus.VALIDATED),
            source_type="ai",
            source_reference="Generated Variation"
        )
        db.add(qv)
        db.flush()
        new_versions.append(qv)
        
    db.commit()
    for v in new_versions:
        db.refresh(v)
        
    return new_versions

@router.post("/check-duplicate")
def check_duplicate_endpoint(
    request: dict,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.services.vector import check_duplicate_question
    
    question_text = request.get("question_text", "")
    if not question_text:
        return {"is_duplicate": False, "duplicates": []}
        
    lesson_id = request.get("lesson_id")
    
    # Get all latest versions of active questions
    # Note: For production with thousands of questions, you'd filter by lesson_id or subject
    # to keep the search space reasonable, or use a real vector DB index.
    query = db.query(QuestionVersion).join(Question).filter(Question.is_active == True)
    if lesson_id:
        query = query.filter(Question.lesson_id == lesson_id)
        
    # Get latest version for each question
    all_versions = query.all()
    # Group by question_id and get the one with highest ID
    latest_versions = {}
    for v in all_versions:
        if v.question_id not in latest_versions or v.id > latest_versions[v.question_id].id:
            latest_versions[v.question_id] = v
            
    existing_questions = [
        {"id": qv.question_id, "text": qv.question_text} 
        for qv in latest_versions.values()
    ]
    
    duplicates = check_duplicate_question(question_text, existing_questions, threshold=0.85)
    
    return {
        "is_duplicate": len(duplicates) > 0,
        "duplicates": duplicates
    }
