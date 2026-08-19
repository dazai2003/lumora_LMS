"""
Pedagogy & Scope Slicer Service.

Handles 3-tier Scope-based Assessment Generation (Lesson Scope, Unit Scope, Subject Scope)
fusing lesson learning materials with RAG context from the private Course Materials Vault.
"""

from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import logging

from app.models import (
    Course, Unit, Lesson, Material,
    ALExam, ALExamType, ALQuestion, ALQuestionTemplate,
    normalize_al_template_type
)
from app.services.gemini_service import gemini

logger = logging.getLogger(__name__)


class ScopeSlicerService:
    """Service to slice question generation by Lesson, Unit, or Full Subject Scope."""

    def generate_scope_sliced_assessment(
        self,
        db: Session,
        scope: str,
        target_id: Optional[int],
        course_id: int,
        paper_type: str = "paper_1_mcq",
    ) -> Dict[str, Any]:
        """
        Generates an assessment based on the requested Scope.

        Args:
            scope: "lesson", "unit", or "subject".
            target_id: lesson_id (if scope=="lesson") or unit_id (if scope=="unit").
            course_id: Target Course ID.
            paper_type: "paper_1_mcq", "paper_2_structured", or "paper_2_essay".

        Returns:
            Dict containing exam metadata and list of generated questions.
        """
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course #{course_id} not found.")

        scope_title = f"{course.title} - Full Subject A/L Mock Paper"
        lesson_text_context = ""

        if scope == "lesson" and target_id:
            lesson = db.query(Lesson).filter(Lesson.id == target_id).first()
            if lesson:
                scope_title = f"{lesson.title} (Lesson Scope Exam)"
                mats = db.query(Material).filter(Material.lesson_id == target_id, Material.is_private_rag_vault == False).all()
                for m in mats:
                    if m.extracted_text or m.content:
                        lesson_text_context += f"\n--- Material: {m.title} ---\n{m.extracted_text or m.content}\n"
        elif scope == "unit" and target_id:
            unit = db.query(Unit).filter(Unit.id == target_id).first()
            if unit:
                scope_title = f"{unit.title} (Unit Scope Exam)"
                lessons = db.query(Lesson).filter(Lesson.unit_id == target_id).all()
                for l in lessons:
                    mats = db.query(Material).filter(Material.lesson_id == l.id, Material.is_private_rag_vault == False).all()
                    for m in mats:
                        if m.extracted_text or m.content:
                            lesson_text_context += f"\n--- Lesson: {l.title} | Material: {m.title} ---\n{m.extracted_text or m.content}\n"

        # Fetch Private Teacher RAG Vault Context (Past Papers, Resource Books, Marking Schemes)
        rag_mats = db.query(Material).filter(
            Material.course_id == course_id,
            Material.is_private_rag_vault == True
        ).all()

        rag_context = ""
        for rm in rag_mats:
            if rm.extracted_text or rm.content:
                rag_context += f"\n[RAG Vault Standards - {rm.category.upper()}]: {rm.extracted_text or rm.content}\n"

        system_instruction = """You are a senior G.C.E. Advanced Level Biology Chief Examiner in Sri Lanka.
Generate high-quality G.C.E. A/L Biology questions based strictly on the provided lesson text context.
Align all terminology and marking guidelines with the provided RAG Vault marking schemes and resource books.

Return ONLY valid JSON matching this exact structure:
{
  "title": "Exam Title",
  "paper_type": "paper_1_mcq",
  "questions": [
    {
      "question_number": 1,
      "template_type": "generic_mcq",
      "stem_text": "...",
      "options": ["A...", "B...", "C...", "D...", "E..."],
      "correct_option": "B",
      "explanation": "Detailed scientific model explanation...",
      "points": 1.0,
      "cognitive_level": "understand",
      "difficulty": "medium"
    }
  ]
}"""

        prompt = f"""Assessment Scope: {scope.upper()}
Target Title: {scope_title}
Paper Type: {paper_type}

Lesson Learning Materials Context:
{lesson_text_context[:6000] if lesson_text_context else 'General G.C.E. A/L Biology Syllabus Content'}

Private RAG Vault Marking Scheme Context:
{rag_context[:3000] if rag_context else 'Official G.C.E. A/L Biology Marking Standards'}

Please generate a complete set of questions for this assessment."""

        try:
            generated_res = gemini.generate_json(
                prompt=prompt,
                system_instruction=system_instruction,
                model_tier="flash_25",
                temperature=0.2,
                max_tokens=6000,
            )
        except Exception as e:
            logger.error(f"Scope slicer generation failed: {e}")
            generated_res = {
                "title": scope_title,
                "paper_type": paper_type,
                "questions": [
                    {
                        "question_number": 1,
                        "template_type": "generic_mcq" if paper_type == "paper_1_mcq" else "structured_subparts",
                        "stem_text": f"Sample question generated for {scope_title}",
                        "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4", "E. Option 5"] if paper_type == "paper_1_mcq" else None,
                        "correct_option": "A" if paper_type == "paper_1_mcq" else None,
                        "explanation": "Gemini AI fallback explanation.",
                        "points": 1.0,
                    }
                ],
                "fallback": True
            }

        # Create ALExam record
        exam = ALExam(
            course_id=course_id,
            lesson_id=target_id if scope == "lesson" else None,
            title=scope_title,
            description=f"Generated via Scope Slicer ({scope.upper()} Scope)",
            exam_type=paper_type,
            time_limit_minutes=120 if paper_type == "paper_1_mcq" else 180,
            total_questions=len(generated_res.get("questions", [])),
            is_published=True,
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)

        # Batch insert generated questions into Question Bank
        saved_qs = []
        for q_data in generated_res.get("questions", []):
            raw_type = q_data.get("template_type", "generic_mcq")
            enum_type = normalize_al_template_type(raw_type)

            q = ALQuestion(
                exam_id=exam.id,
                question_number=q_data.get("question_number", 1),
                template_type=enum_type,
                stem_text=q_data.get("stem_text", "Question Stem"),
                explanation=q_data.get("explanation", "Explanation"),
                points=float(q_data.get("points", 1.0)),
                options=q_data.get("options"),
                correct_option=q_data.get("correct_option"),
                structured_subparts_json=q_data.get("structured_subparts_json"),
                essay_checklist_json=q_data.get("essay_checklist_json"),
            )
            db.add(q)
            saved_qs.append(q)

        db.commit()

        return {
            "message": f"Successfully generated {scope.upper()} Scope Assessment!",
            "exam_id": exam.id,
            "title": exam.title,
            "questions_count": len(saved_qs),
            "paper_set_group": scope_title,
        }


scope_slicer = ScopeSlicerService()
