"""
AI Quiz Generation Service: Uses Google Gemini to generate quiz questions
from course materials stored in the vector database.

Migrated from Groq to Gemini as part of Phase 0 (A/L Exam Engine).
"""
import os
import json
import logging
import time
from typing import List, Dict, Optional
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class AIQuestionOutput(BaseModel):
    question_text: str = Field(..., description="The main text of the question")
    question_type: Literal["mcq", "true_false", "short_answer", "multiple_select"] = Field(..., description="The format of the question")
    options: Optional[List[str]] = Field(None, description="Array of exactly 4 options (A, B, C, D) for MCQ, or None")
    correct_answer: str = Field(..., description="The exact correct answer or phrase")
    explanation: str = Field(..., description="A brief 1-sentence explanation of why the answer is correct")
    points: float = Field(1.0, description="Default points for the question")
    difficulty: Literal["easy", "medium", "hard"] = Field(..., description="Difficulty level of the question")
    cognitive_level: Literal["remember", "understand", "apply", "analyze", "evaluate"] = Field(..., description="Bloom's taxonomy cognitive level")
    ai_validation_status: Literal["validated", "review_recommended", "potential_issue"] = Field(..., description="AI's confidence in the question's correctness and formatting")
    source_reference: Optional[str] = Field(None, description="A snippet or reference to the material used")

class AIQuizOutput(BaseModel):
    questions: List[AIQuestionOutput]

def generate_quiz_questions(
    course_id: int,
    lesson_id: int,
    num_questions: int = 5,
    question_types: Optional[List[str]] = None,
    mcq_count: Optional[int] = None,
    tf_count: Optional[int] = None,
    sa_count: Optional[int] = None,
    difficulty: str = "medium",
    material_ids: Optional[List[int]] = None,
) -> List[Dict]:
    """
    Generate quiz questions using Gemini + course material context from ChromaDB.
    """
    if question_types is None:
        question_types = ["mcq", "true_false", "short_answer"]

    start_time = time.time()

    total_requested = (mcq_count or 0) + (tf_count or 0) + (sa_count or 0)
    if total_requested > 0:
        num_questions = total_requested

    # Step 1: Retrieve relevant material from ChromaDB
    context_text = _get_lesson_context(course_id, lesson_id)

    if not context_text or len(context_text.strip()) < 50:
        logger.warning(f"Not enough material for lesson {lesson_id} to generate quiz")
        return []

    # Step 2: Build prompt and call Gemini
    questions = _call_gemini_for_questions(
        context_text=context_text,
        num_questions=num_questions,
        question_types=question_types,
        difficulty=difficulty,
        mcq_count=mcq_count,
        tf_count=tf_count,
        sa_count=sa_count,
    )

    elapsed = int((time.time() - start_time) * 1000)
    logger.info(f"Generated {len(questions)} questions in {elapsed}ms for lesson {lesson_id}")

    return questions


def _get_lesson_context(course_id: int, lesson_id: int, material_ids: Optional[List[int]] = None) -> str:
    """Pull all available text content for a lesson from the vector store and database."""
    chunks = []

    # Try vector store first (embeddings from processed materials) if we aren't filtering to specific materials
    if not material_ids:
        try:
            from app.services.vector import search_similar
            # Use a broad query to get general lesson content
            results = search_similar(
                query="key concepts and important information",
                course_id=course_id,
                n_results=15,
            )
            for hit in results:
                meta = hit.get("metadata", {})
                # Filter to this lesson's materials if possible
                if meta.get("lesson_id") == lesson_id or not meta.get("lesson_id"):
                    chunks.append(hit["text"])
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")

    # Also pull directly from database extracted_text
    try:
        from app.database import SessionLocal
        from app.models import Material
        db = SessionLocal()
        query = (
            db.query(Material)
            .filter(Material.lesson_id == lesson_id)
            .filter(Material.extracted_text.isnot(None))
            .filter(Material.extracted_text != "")
        )
        if material_ids:
            query = query.filter(Material.id.in_(material_ids))
        materials = query.all()
        for mat in materials:
            if mat.extracted_text and mat.extracted_text.strip():
                chunks.append(mat.extracted_text.strip())
        db.close()
    except Exception as e:
        logger.warning(f"DB material fetch failed: {e}")

    # Deduplicate and combine
    seen = set()
    unique_chunks = []
    for chunk in chunks:
        key = chunk[:100]  # Use first 100 chars as dedup key
        if key not in seen:
            seen.add(key)
            unique_chunks.append(chunk)

    combined = "\n\n---\n\n".join(unique_chunks[:10])  # Limit to ~10 chunks for token budget
    return combined


def _call_gemini_for_questions(
    context_text: str,
    num_questions: int,
    question_types: List[str],
    difficulty: str,
    mcq_count: Optional[int] = None,
    tf_count: Optional[int] = None,
    sa_count: Optional[int] = None,
) -> List[Dict]:
    """Call Gemini to generate quiz questions from the given context."""
    try:
        from app.services.gemini_service import gemini

        types_str = ", ".join(question_types)

        breakdown_instruction = ""
        if mcq_count or tf_count or sa_count:
            breakdown_parts = []
            if mcq_count: breakdown_parts.append(f"{mcq_count} MCQ questions ('mcq')")
            if tf_count: breakdown_parts.append(f"{tf_count} True/False questions ('true_false')")
            if sa_count: breakdown_parts.append(f"{sa_count} Short Answer questions ('short_answer')")
            breakdown_instruction = f"- STRICT BREAKDOWN REQUIREMENT: You MUST generate EXACTLY: {', '.join(breakdown_parts)}."
        
        system_prompt = f"""You are an expert educational assessment creator. Generate exactly {num_questions} quiz questions based ONLY on the provided course material.

RULES:
- Generate ONLY questions that can be answered from the provided material.
- Difficulty level: {difficulty}
- Allowed question types: {types_str}
{breakdown_instruction}
- For "mcq": provide exactly 4 options (A, B, C, D) and specify the exact correct option text.
- For "true_false": correct_answer must be "True" or "False".
- For "short_answer": correct_answer should be a brief 1-5 word phrase.
- Provide a brief 1-sentence explanation for each answer.

Return a JSON object with a single key "questions" containing an array of question objects.
Each question object must have these fields:
- question_text (string)
- question_type (string: "mcq", "true_false", or "short_answer")
- options (array of 4 strings for MCQ, null otherwise)
- correct_answer (string)
- explanation (string)
- points (number, default 1.0)
- difficulty (string: "easy", "medium", or "hard")
- cognitive_level (string: "remember", "understand", "apply", "analyze", or "evaluate")
- ai_validation_status (string: "validated", "review_recommended", or "potential_issue")
- source_reference (string or null)"""

        user_prompt = f"Generate {num_questions} quiz questions from this material:\n\n{context_text[:8000]}"

        result = gemini.generate_json(
            prompt=user_prompt,
            system_instruction=system_prompt,
            model_tier="flash",
            temperature=0.4,
            max_tokens=4000,
        )

        # Parse and validate
        questions_raw = result.get("questions", [])
        if isinstance(result, list):
            questions_raw = result

        validated = []
        for i, q in enumerate(questions_raw):
            if not isinstance(q, dict):
                continue
            validated.append({
                "question_text": q.get("question_text", ""),
                "question_type": q.get("question_type", "mcq"),
                "options": q.get("options") if q.get("question_type") == "mcq" else None,
                "correct_answer": q.get("correct_answer", ""),
                "explanation": q.get("explanation", ""),
                "points": float(q.get("points", 1.0)),
                "difficulty": q.get("difficulty", difficulty),
                "cognitive_level": q.get("cognitive_level", "remember"),
                "ai_validation_status": q.get("ai_validation_status", "review_recommended"),
                "source_reference": q.get("source_reference"),
                "order": i,
            })

        return validated

    except Exception as e:
        logger.error(f"Error calling Gemini for quiz generation: {e}")
        return []

def evaluate_short_answers(eval_requests: List[Dict]) -> List[Dict]:
    """
    Evaluate short answers using Gemini.
    eval_requests should be a list of dictionaries:
    [
        {"id": 1, "question": "...", "correct_answer": "...", "student_answer": "...", "max_points": 1.0}
    ]
    Returns a list of results:
    [
        {"id": 1, "is_correct": bool, "points_earned": float}
    ]
    """
    if not eval_requests:
        return []
        
    try:
        from app.services.gemini_service import gemini

        system_prompt = """You are an expert AI teacher grading short answer questions. 
You will be provided with a JSON array of questions, the correct answer, the student's answer, and the maximum points.
You must evaluate the student's answer semantically. If it conveys the correct meaning, even if phrased differently or with minor typos, award full points. 
If it is partially correct, you can award partial points.
If it is wrong, award 0 points.

Return a JSON object with a key "results" containing an array of evaluation results.
Each result must have: "id" (matching input), "is_correct" (boolean), "points_earned" (number)."""
        
        user_prompt = json.dumps(eval_requests, indent=2)

        result = gemini.generate_json(
            prompt=user_prompt,
            system_instruction=system_prompt,
            model_tier="flash_25",
            temperature=0.0,
        )
        
        raw_results = result.get("results", [])
        if isinstance(result, list):
            raw_results = result

        req_map = {req["id"]: float(req.get("max_points", 1.0)) for req in eval_requests}
        clamped_results = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            qid = item.get("id")
            max_pts = req_map.get(qid, 1.0)
            try:
                pts = float(item.get("points_earned", 0.0))
            except (ValueError, TypeError):
                pts = 0.0
            clamped_pts = round(max(0.0, min(max_pts, pts)), 2)
            is_corr = item.get("is_correct")
            if is_corr is not None:
                is_corr = bool(is_corr) and (clamped_pts > 0)
            clamped_results.append({
                "id": qid,
                "is_correct": is_corr,
                "points_earned": clamped_pts
            })
        return clamped_results
        
    except Exception as e:
        logger.error(f"Error evaluating short answers: {e}")
        # Default to manual grading if AI fails
        return [{"id": req["id"], "is_correct": None, "points_earned": 0.0} for req in eval_requests]

def generate_quiz_from_pdf_text(
    text: str,
    pdf_type: str,
    num_questions: int = 5,
    difficulty: str = "medium",
    extract_all: bool = False,
) -> List[Dict]:
    """
    Generate or extract quiz questions from an uploaded PDF.
    pdf_type controls the prompt behavior:
      - "exact_extraction": Extract questions and provided answers exactly. Auto-classify type. Generate distractors for MCQ if missing.
      - "solve_extraction": Extract questions (no answers provided). Auto-classify type. AI solves to find the correct answer.
      - "mixed": Standard generation from text content based on count and difficulty.
    """
    try:
        from app.services.gemini_service import gemini

        # Truncate text if too large
        text = text[:32000]

        is_extraction = pdf_type in ["exact_extraction", "solve_extraction"]
        count_instruction = "Extract EVERY single question found in the text." if extract_all and is_extraction else f"Target question count: approximately {num_questions}"
        difficulty_instruction = "Maintain the exact difficulty of the original question, or default to medium." if is_extraction else f"Target difficulty: {difficulty}"
        
        type_instructions = ""
        if pdf_type == "exact_extraction":
            type_instructions = "The provided text is an existing exam containing questions AND their correct answers. You MUST extract the questions and correct answers exactly as written. Auto-classify each question as 'mcq', 'true_false', or 'short_answer'. If a question is 'mcq' and only the correct answer is given, generate 3 plausible incorrect options (distractors)."
        elif pdf_type == "solve_extraction":
            type_instructions = "The provided text is an existing exam containing questions WITHOUT answers. You MUST extract these questions exactly as written, accurately solve them to determine the correct answers, and auto-classify each question as 'mcq', 'true_false', or 'short_answer'. For 'mcq', generate 3 plausible incorrect options (distractors)."
        else:
            type_instructions = "The provided text is study material. Generate entirely new exam questions based on the concepts found within it. You can generate a mix of mcq, true_false, and short_answer."

        system_prompt = f"""You are an expert curriculum designer and exam creator.
{type_instructions}

{difficulty_instruction}
{count_instruction}

Return a JSON object with a single key "questions" containing an array of question objects.
Each question must have these fields:
- question_text (string)
- question_type (string: "mcq", "true_false", or "short_answer")
- options (array of 4 strings if MCQ, empty array otherwise)
- correct_answer (string matching one option for MCQ, "True"/"False" for true_false, model answer for short_answer)
- explanation (string, 1-sentence)
- points (number, default 1.0)
- difficulty (string: "easy", "medium", or "hard")
- cognitive_level (string: "apply")
- ai_validation_status (string: "review_recommended")
- source_reference (string: "Extracted from PDF")"""

        result = gemini.generate_json(
            prompt=f"Extract/Generate questions from the following text:\n\n{text}",
            system_instruction=system_prompt,
            model_tier="flash",
            temperature=0.1 if is_extraction else 0.4,
        )

        return result.get("questions", [])

    except Exception as e:
        logger.error(f"Error generating quiz from PDF: {e}")
        return []

def improve_question(question_data: dict, instructions: List[str]) -> Optional[Dict]:
    """
    Improve an existing question using Gemini based on specific instructions.
    """
    try:
        from app.services.gemini_service import gemini

        instructions_str = "\n".join(f"- {inst}" for inst in instructions)

        system_prompt = f"""You are an expert curriculum designer. You have been asked to improve an existing exam question.
        
Here are the specific instructions for improvement:
{instructions_str}

Return a JSON object with a key "questions" containing an array of EXACTLY ONE improved question.
The question object must have: question_text, question_type, options, correct_answer, explanation, points, difficulty, cognitive_level, ai_validation_status, source_reference.

Keep the same question_type unless instructed otherwise. Ensure distractors (if MCQ) are completely plausible but unambiguously incorrect."""

        result = gemini.generate_json(
            prompt=f"Here is the existing question data in JSON:\n{json.dumps(question_data, indent=2)}\n\nPlease provide the improved version.",
            system_instruction=system_prompt,
            model_tier="flash",
            temperature=0.4,
        )

        questions = result.get("questions", [])
        if questions and isinstance(questions[0], dict):
            return questions[0]
            
        return None
    except Exception as e:
        logger.error(f"Error improving question: {e}")
        return None


def generate_question_variations(question_data: dict, count: int = 3) -> List[Dict]:
    """
    Generate variations of an existing question testing the exact same learning objective.
    """
    try:
        from app.services.gemini_service import gemini

        system_prompt = f"""You are an expert curriculum designer.
You need to generate {count} VARIATIONS of a given question.
The variations MUST test the exact same underlying concept, cognitive level, and learning objective as the original question, but use different scenarios, numbers, or wording.

Maintain the original difficulty level.
Maintain the exact same question_type (MCQ, true_false, etc).

Return a JSON object with a key "questions" containing an array of exactly {count} question objects.
Each question must have: question_text, question_type, options, correct_answer, explanation, points, difficulty, cognitive_level, ai_validation_status, source_reference."""

        result = gemini.generate_json(
            prompt=f"Original Question Data:\n{json.dumps(question_data, indent=2)}\n\nGenerate {count} new variations now.",
            system_instruction=system_prompt,
            model_tier="flash",
            temperature=0.7,
        )

        return result.get("questions", [])

    except Exception as e:
        logger.error(f"Error generating question variations: {e}")
        return []