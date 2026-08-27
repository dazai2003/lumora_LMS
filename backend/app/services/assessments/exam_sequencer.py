"""
Exam Sequencer Service for Sri Lankan G.C.E. Advanced Level Examinations.
Enforces canonical section hierarchy and deterministic question numbering:
- Section 1 (Paper I: MCQ): Questions 1 .. N_mcq (1 to 50)
- Section 2 (Paper II Part A: Structured): Questions N_mcq + 1 .. N_mcq + N_struct (or 1..4 in Paper II)
- Section 3 (Paper II Part B: Essay): Questions N_mcq + N_struct + 1 .. Total (or 5..10 in Paper II)
"""
import logging
from typing import List
from sqlalchemy.orm import Session
from app.models import ALExam, ALQuestion, ALExamType, ALQuestionTemplate

logger = logging.getLogger(__name__)


def is_structured_question(q: ALQuestion) -> bool:
    """Detects whether an ALQuestion is a Paper II Part A Structured Question."""
    t = q.template_type.value if hasattr(q.template_type, "value") else str(q.template_type)
    return t == "structured_subparts" or bool(q.structured_subparts_json and len(q.structured_subparts_json) > 0)


def is_essay_question(q: ALQuestion) -> bool:
    """Detects whether an ALQuestion is a Paper II Part B Essay Question."""
    t = q.template_type.value if hasattr(q.template_type, "value") else str(q.template_type)
    return t in ("essay_rubric", "essay") or bool(q.essay_checklist_json)


def resequence_exam_questions_canonically(exam_id: int, db: Session) -> List[ALQuestion]:
    """
    Deterministically re-orders and re-numbers all questions in an exam according to the
    official Sri Lankan A/L examination structure:

    1. Section 1 (Paper I: MCQ): Questions 1 .. N_mcq
    2. Section 2 (Paper II Part A: Structured): Questions N_mcq + 1 .. N_mcq + N_struct
    3. Section 3 (Paper II Part B: Essay): Questions N_mcq + N_struct + 1 .. Total

    Preserves intra-section user ordering while guaranteeing that MCQs are always first,
    Structured questions second, and Essays third regardless of the order they were generated.
    """
    all_qs = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    if not all_qs:
        return []

    mcqs = []
    structured = []
    essays = []

    for q in all_qs:
        if is_structured_question(q):
            structured.append(q)
        elif is_essay_question(q):
            essays.append(q)
        else:
            mcqs.append(q)

    # Sort each bucket preserving existing relative order (using current question_number, then id)
    mcqs.sort(key=lambda x: (x.question_number if x.question_number is not None else 9999, x.id))
    structured.sort(key=lambda x: (x.question_number if x.question_number is not None else 9999, x.id))
    essays.sort(key=lambda x: (x.question_number if x.question_number is not None else 9999, x.id))

    current_num = 1
    # 1. Number MCQs (1..N_mcq)
    for q in mcqs:
        q.question_number = current_num
        current_num += 1

    # 2. Number Structured Questions (N_mcq + 1 .. N_mcq + N_struct)
    for q in structured:
        q.question_number = current_num
        current_num += 1

    # 3. Number Essay Questions (N_mcq + N_struct + 1 .. Total)
    for q in essays:
        q.question_number = current_num
        current_num += 1

    db.commit()
    logger.info(
        f"[ExamSequencer] Resequenced exam {exam_id}: {len(mcqs)} MCQs (Q1-Q{len(mcqs)}), "
        f"{len(structured)} Structured (Q{len(mcqs)+1}-Q{len(mcqs)+len(structured)}), "
        f"{len(essays)} Essays (Q{len(mcqs)+len(structured)+1}-Q{current_num-1})"
    )
    return db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).order_by(ALQuestion.question_number.asc()).all()
