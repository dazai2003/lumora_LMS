"""
AI Quiz Generation Service: Uses Groq LLM to generate quiz questions
from course materials stored in the vector database.
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
    difficulty: str = "medium",
    material_ids: Optional[List[int]] = None,
) -> List[Dict]:
    """
    Generate quiz questions using Groq LLM + course material context from ChromaDB.

    Args:
        course_id: The course to pull materials from
        lesson_id: The specific lesson for context
        num_questions: How many questions to generate
        question_types: List of types: "mcq", "true_false", "short_answer"
        difficulty: "easy", "medium", or "hard"
        material_ids: Optional list of specific material IDs to include

    Returns:
        List of question dicts ready to insert into the database
    """
    if question_types is None:
        question_types = ["mcq", "true_false", "short_answer"]

    start_time = time.time()

    # Step 1: Retrieve relevant material from ChromaDB
    context_text = _get_lesson_context(course_id, lesson_id)

    if not context_text or len(context_text.strip()) < 50:
        logger.warning(f"Not enough material for lesson {lesson_id} to generate quiz")
        return []

    # Step 2: Build prompt and call Groq LLM
    questions = _call_groq_for_questions(
        context_text=context_text,
        num_questions=num_questions,
        question_types=question_types,
        difficulty=difficulty,
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


def _call_groq_for_questions(
    context_text: str,
    num_questions: int,
    question_types: List[str],
    difficulty: str,
) -> List[Dict]:
    """Call Groq LLM to generate quiz questions from the given context."""
    try:
        from groq import Groq

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return []

        model = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
        client = Groq(api_key=api_key, timeout=45.0)

        types_str = ", ".join(question_types)
        schema_json = AIQuizOutput.schema_json()
        
        system_prompt = f"""You are an expert educational assessment creator. Generate exactly {num_questions} quiz questions based ONLY on the provided course material.

RULES:
- Generate ONLY questions that can be answered from the provided material.
- Difficulty level: {difficulty}
- Allowed question types: {types_str}
- For "mcq": provide exactly 4 options (A, B, C, D) and specify the exact correct option text.
- For "true_false": correct_answer must be "True" or "False".
- For "short_answer": correct_answer should be a brief 1-5 word phrase.
- Provide a brief 1-sentence explanation for each answer.

You MUST respond in valid JSON format matching this JSON schema:
{schema_json}

IMPORTANT: Return ONLY the JSON object, no markdown, no code fences, no extra text."""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate {num_questions} quiz questions from this material:\n\n{context_text[:6000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=3000,
        )

        raw = response.choices[0].message.content.strip()

        # Clean up response: strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        parsed_json = json.loads(raw)
        
        # In case the model returns an array directly despite the schema asking for an object
        if isinstance(parsed_json, list):
            parsed_json = {"questions": parsed_json}
            
        validated_output = AIQuizOutput(**parsed_json)

        # Map to dict format for downstream
        validated = []
        for i, q in enumerate(validated_output.questions):
            validated.append({
                "question_text": q.question_text,
                "question_type": q.question_type,
                "options": q.options if q.question_type == "mcq" else None,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
                "points": q.points,
                "difficulty": q.difficulty,
                "cognitive_level": q.cognitive_level,
                "ai_validation_status": q.ai_validation_status,
                "source_reference": q.source_reference,
                "order": i,
            })

        return validated

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"Error calling Groq for quiz generation: {e}")
        return []

def evaluate_short_answers(eval_requests: List[Dict]) -> List[Dict]:
    """
    Evaluate short answers using the LLM.
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
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return [{"id": req["id"], "is_correct": False, "points_earned": 0.0} for req in eval_requests]

        model = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
        client = Groq(api_key=api_key, timeout=45.0)

        system_prompt = """You are an expert AI teacher grading short answer questions. 
You will be provided with a JSON array of questions, the correct answer, the student's answer, and the maximum points.
You must evaluate the student's answer semantically. If it conveys the correct meaning, even if phrased differently or with minor typos, award full points. 
If it is partially correct, you can award partial points.
If it is wrong, award 0 points.

OUTPUT FORMAT: Return ONLY a valid JSON array of evaluation results. No markdown, no extra text.
[
  {
    "id": 1, // must match the input id
    "is_correct": true, // true if points > 0
    "points_earned": 1.0
  }
]"""
        
        user_prompt = json.dumps(eval_requests, indent=2)

        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=model,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        
        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from Groq")
            
        data = json.loads(content)
        # Groq with json_object format often wraps arrays in an object like {"results": [...]}
        if isinstance(data, dict):
            for key, val in data.items():
                if isinstance(val, list):
                    return val
            # Fallback if it's a dict but doesn't have a list
            raise ValueError("Expected JSON array in response")
        return data
        
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
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return []

        model = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
        client = Groq(api_key=api_key, timeout=90.0)

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

OUTPUT FORMAT: Return a JSON object with a single key "questions" containing an array of question objects.
Each question MUST strictly follow this schema:
{{
  "question_text": "string (The question text itself)",
  "question_type": "string (MUST be exactly one of: 'mcq', 'true_false', 'short_answer')",
  "options": ["string", "string", "string", "string"], // Provide exactly 4 options IF question_type is 'mcq'. Empty array otherwise.
  "correct_answer": "string", // Must exactly match one of the options for MCQ. For true_false, must be 'True' or 'False'. For short_answer, provide the expected model answer.
  "explanation": "string", // 1-sentence explanation of why the answer is correct
  "points": 1.0,
  "difficulty": "string (easy, medium, or hard)",
  "cognitive_level": "apply",
  "ai_validation_status": "review_recommended",
  "source_reference": "Extracted from PDF"
}}

IMPORTANT: Return ONLY valid JSON. No markdown formatting, no intro text, no outro text."""

        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Extract/Generate questions from the following text:\n\n{text}"}
            ],
            model=model,
            temperature=0.1 if is_extraction else 0.4,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        if not content:
            return []

        data = json.loads(content)
        questions = data.get("questions", [])
        return questions

    except Exception as e:
        logger.error(f"Error generating quiz from PDF: {e}")
        return []

def improve_question(question_data: dict, instructions: List[str]) -> Optional[Dict]:
    """
    Improve an existing question using LLM based on specific instructions.
    """
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return None

        model = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
        client = Groq(api_key=api_key, timeout=45.0)

        schema_json = AIQuizOutput.schema_json()
        instructions_str = "\n".join(f"- {inst}" for inst in instructions)

        system_prompt = f"""You are an expert curriculum designer. You have been asked to improve an existing exam question.
        
Here are the specific instructions for improvement:
{instructions_str}

Return EXACTLY ONE improved question inside a JSON array under the key "questions".
You MUST respond in valid JSON format matching this JSON schema:
{schema_json}

IMPORTANT: Keep the same question_type unless instructed otherwise. Ensure distractors (if MCQ) are completely plausible but unambiguously incorrect.
"""

        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is the existing question data in JSON:\n{json.dumps(question_data, indent=2)}\n\nPlease provide the improved version."}
            ],
            model=model,
            temperature=0.4,
            response_format={"type": "json_object"}
        )

        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)
        questions = data.get("questions", [])
        
        if questions:
            # Map back to dict
            q = questions[0]
            # Account for dict vs object depending on how pydantic parsed it inside
            if hasattr(q, "model_dump"):
                return q.model_dump()
            elif hasattr(q, "dict"):
                return q.dict()
            elif isinstance(q, dict):
                return q
            
        return None
    except Exception as e:
        logger.error(f"Error improving question: {e}")
        return None


def generate_question_variations(question_data: dict, count: int = 3) -> List[Dict]:
    """
    Generate variations of an existing question testing the exact same learning objective.
    """
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not set")
            return []

        model = os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant")
        client = Groq(api_key=api_key, timeout=60.0)

        system_prompt = f"""You are an expert curriculum designer.
You need to generate {count} VARIATIONS of a given question.
The variations MUST test the exact same underlying concept, cognitive level, and learning objective as the original question, but use different scenarios, numbers, or wording.

Maintain the original difficulty level.
Maintain the exact same question_type (MCQ, true_false, etc).

OUTPUT FORMAT: Return a JSON object with a single key "questions" containing an array of exactly {count} question objects.
Each question MUST strictly follow this schema:
{{
  "question_text": "string",
  "question_type": "string",
  "options": ["string", "string", "string", "string"], // Provide exactly 4 options IF question_type is 'mcq'.
  "correct_answer": "string",
  "explanation": "string",
  "points": 1.0,
  "difficulty": "string",
  "cognitive_level": "string",
  "ai_validation_status": "review_recommended",
  "source_reference": "Generated Variation"
}}
"""

        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Original Question Data:\n{json.dumps(question_data, indent=2)}\n\nGenerate {count} new variations now."}
            ],
            model=model,
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)
        return data.get("questions", [])

    except Exception as e:
        logger.error(f"Error generating question variations: {e}")
        return []