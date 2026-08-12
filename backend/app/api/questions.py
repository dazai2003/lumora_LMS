from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import User, UserRole, Question, QuestionVersion, Difficulty, CognitiveLevel, QuestionType, TeacherApprovalStatus
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
    difficulty: Optional[str] = Query(None, description="Filter by difficulty"),
    cognitive_level: Optional[str] = Query(None, description="Filter by Bloom's taxonomy"),
    question_type: Optional[QuestionType] = Query(None, description="Filter by question type"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    source_type: Optional[str] = Query(None, description="Filter by source (ai, manual, imported)"),
    approval_status: Optional[TeacherApprovalStatus] = Query(None, description="Filter by approval status"),
    search: Optional[str] = Query(None, description="Search question text or outcome"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Retrieve questions from the Question Bank with multi-criteria filtering.
    """
    from sqlalchemy.orm import joinedload
    query = db.query(QuestionVersion).join(Question, Question.id == QuestionVersion.question_id)
    query = query.options(joinedload(QuestionVersion.question).joinedload(Question.lesson))
    query = query.filter(Question.is_banked == True, Question.is_active == True)
    
    if topic_id is not None:
        query = query.filter(Question.topic_id == topic_id)
        
    if subject_id is not None:
        from app.models import Topic
        query = query.join(Topic, Question.topic_id == Topic.id).filter(Topic.subject_id == subject_id)
        
    if lesson_id is not None:
        query = query.filter(Question.lesson_id == lesson_id)
        
    if question_type is not None:
        query = query.filter(QuestionVersion.question_type == question_type)

    if difficulty is not None:
        query = query.filter(QuestionVersion.difficulty == difficulty.lower())

    if cognitive_level is not None:
        query = query.filter(QuestionVersion.cognitive_level == cognitive_level.lower())

    if source_type is not None:
        query = query.filter(QuestionVersion.source_type == source_type.lower())

    if approval_status is not None:
        query = query.filter(QuestionVersion.teacher_approval_status == approval_status)

    if search:
        pattern = f"%{search}%"
        query = query.filter(QuestionVersion.question_text.ilike(pattern))

    query = query.order_by(QuestionVersion.created_at.desc())
    versions = query.offset(offset).limit(limit).all()
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
        
    # Get latest version for type-specific answer normalization
    latest_version = db.query(QuestionVersion).filter(
        QuestionVersion.question_id == question_id
    ).order_by(QuestionVersion.created_at.desc()).first()

    q_type = latest_version.question_type if latest_version else None

    # Calculate distractor distribution with normalization
    distractor_distribution = {}
    for a in answers:
        if a.student_answer:
            ans_str = str(a.student_answer).strip()
            
            # Normalize True/False answers to canonical "True" or "False"
            if q_type == QuestionType.TRUE_FALSE or ans_str.lower() in ["true", "false"]:
                if ans_str.lower() in ["true", "t", "1"]:
                    ans_str = "True"
                elif ans_str.lower() in ["false", "f", "0"]:
                    ans_str = "False"
            elif latest_version and latest_version.options and isinstance(latest_version.options, list):
                # Match MCQ options case-insensitively
                for opt in latest_version.options:
                    if str(opt).strip().lower() == ans_str.lower():
                        ans_str = str(opt).strip()
                        break

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


@router.post("/scan-duplicates")
def scan_duplicates_endpoint(
    request: dict = {},
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.services.vector import scan_all_duplicates

    lesson_id = request.get("lesson_id")
    threshold = request.get("threshold", 0.85)

    query = db.query(QuestionVersion).join(Question).filter(Question.is_active == True)
    if lesson_id:
        query = query.filter(Question.lesson_id == lesson_id)

    all_versions = query.all()
    latest_versions = {}
    for v in all_versions:
        if v.question_id not in latest_versions or v.id > latest_versions[v.question_id].id:
            latest_versions[v.question_id] = v

    questions_data = [
        {"id": qv.question_id, "text": qv.question_text}
        for qv in latest_versions.values()
    ]

    duplicate_groups = scan_all_duplicates(questions_data, threshold=threshold)

    return {
        "total_scanned": len(questions_data),
        "duplicate_groups": duplicate_groups
    }


# ──────────────────────────────────────────────
# Phase 2 Moderation & Import/Export Endpoints
# ──────────────────────────────────────────────

@router.post("/{question_id}/approve")
def approve_question(
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Approve a question version for quiz usage.
    """
    v = db.query(QuestionVersion).filter(QuestionVersion.question_id == question_id).order_by(QuestionVersion.version_number.desc()).first()
    if not v:
        raise HTTPException(status_code=404, detail="Question version not found")
    
    v.teacher_approval_status = TeacherApprovalStatus.APPROVED
    db.commit()

    from app.services.audit import log_audit_event
    log_audit_event(
        db=db, action="QUESTION_APPROVED", entity_type="question", entity_id=question_id,
        actor_id=current_user.id, actor_email=current_user.email
    )
    return {"message": "Question approved successfully", "success": True}


@router.post("/{question_id}/reject")
def reject_question(
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Reject a question version.
    """
    v = db.query(QuestionVersion).filter(QuestionVersion.question_id == question_id).order_by(QuestionVersion.version_number.desc()).first()
    if not v:
        raise HTTPException(status_code=404, detail="Question version not found")
    
    v.teacher_approval_status = TeacherApprovalStatus.REJECTED
    db.commit()

    from app.services.audit import log_audit_event
    log_audit_event(
        db=db, action="QUESTION_REJECTED", entity_type="question", entity_id=question_id,
        actor_id=current_user.id, actor_email=current_user.email
    )
    return {"message": "Question rejected", "success": True}


@router.post("/{question_id}/archive")
def archive_question(
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Soft-delete/archive a question.
    """
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    q.is_active = False
    db.commit()

    from app.services.audit import log_audit_event
    log_audit_event(
        db=db, action="QUESTION_ARCHIVED", entity_type="question", entity_id=question_id,
        actor_id=current_user.id, actor_email=current_user.email
    )
    return {"message": "Question archived", "success": True}


@router.post("/bulk-moderate")
def bulk_moderate_questions(
    request: dict,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Bulk approve, reject, or archive questions.
    """
    question_ids = request.get("question_ids", [])
    action = request.get("action", "approve").lower()

    versions = (
        db.query(QuestionVersion)
        .filter(QuestionVersion.question_id.in_(question_ids))
        .all()
    )

    status_map = {
        "approve": TeacherApprovalStatus.APPROVED,
        "reject": TeacherApprovalStatus.REJECTED,
        "archive": TeacherApprovalStatus.REJECTED
    }

    target_status = status_map.get(action, TeacherApprovalStatus.APPROVED)
    for v in versions:
        v.teacher_approval_status = target_status

    if action == "archive":
        db.query(Question).filter(Question.id.in_(question_ids)).update({"is_active": False}, synchronize_session=False)

    db.commit()
    return {"message": f"Successfully processed bulk {action} for {len(question_ids)} questions", "success": True}


@router.get("/export")
def export_questions_endpoint(
    question_ids: List[int] = Query(...),
    format: str = Query("json"),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Export specified question IDs as JSON or CSV.
    """
    from app.services.import_export import export_questions_to_json, export_questions_to_csv
    from fastapi.responses import Response

    if format.lower() == "csv":
        csv_data = export_questions_to_csv(db, question_ids)
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=questions_export.csv"})
    else:
        json_data = export_questions_to_json(db, question_ids)
        return Response(content=json_data, media_type="application/json", headers={"Content-Disposition": "attachment; filename=questions_export.json"})


@router.post("/import")
def import_questions_endpoint(
    request: dict,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Import questions from JSON payload.
    """
    from app.services.import_export import import_questions_from_json
    import json
    
    json_data = request.get("questions_data")
    if not json_data:
        raise HTTPException(status_code=400, detail="Missing questions_data JSON")

    json_str = json.dumps(json_data) if isinstance(json_data, list) or isinstance(json_data, dict) else str(json_data)
    count = import_questions_from_json(db, json_str)
    return {"message": f"Successfully imported {count} questions", "count": count, "success": True}


@router.delete("/{question_id}")
def delete_question_endpoint(
    question_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Delete a question (or question version) from the question bank completely.
    """
    from app.models import QuestionPoolItem, QuizQuestion, QuestionAnalytics, Answer, RubricScore, GradingRubric
    
    # Try finding parent Question first
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        # If not found by question_id, check if question_id is actually a QuestionVersion.id
        v = db.query(QuestionVersion).filter(QuestionVersion.id == question_id).first()
        if v:
            q = db.query(Question).filter(Question.id == v.question_id).first()

    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    target_question_id = q.id

    try:
        # 1. Clean analytics & pool items
        db.query(QuestionAnalytics).filter(QuestionAnalytics.question_id == target_question_id).delete(synchronize_session=False)
        db.query(QuestionPoolItem).filter(QuestionPoolItem.question_id == target_question_id).delete(synchronize_session=False)
        db.query(GradingRubric).filter(GradingRubric.question_id == target_question_id).delete(synchronize_session=False)
        db.flush()

        # 2. Clean versions and their answers/quiz_questions
        for v in q.versions:
            answers = db.query(Answer).filter(Answer.question_version_id == v.id).all()
            for ans in answers:
                db.query(RubricScore).filter(RubricScore.answer_id == ans.id).delete(synchronize_session=False)
                db.delete(ans)
            db.query(QuizQuestion).filter(QuizQuestion.question_version_id == v.id).delete(synchronize_session=False)
            db.delete(v)
        db.flush()

        # 3. Delete parent question
        db.delete(q)
        db.commit()

        from app.services.audit import log_audit_event
        log_audit_event(
            db=db, action="QUESTION_DELETED", entity_type="question", entity_id=target_question_id,
            actor_id=current_user.id, actor_email=current_user.email
        )
        return {"message": "Question deleted successfully", "success": True}
    except Exception as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete question: {str(err)}")


