import json
import logging
from sqlalchemy.orm import Session
from app.models import StudentQuestion, Course

logger = logging.getLogger(__name__)

def categorize_student_question(question_id: int, db: Session):
    """
    Background task to categorize a student's question and determine sentiment/difficulty.
    Uses Groq LLM to classify.
    """
    try:
        from app.services.llm_service import call_llm

        question = db.query(StudentQuestion).filter(StudentQuestion.id == question_id).first()
        if not question:
            logger.warning(f"Question {question_id} not found for categorization.")
            return

        course = db.query(Course).filter(Course.id == question.course_id).first()
        course_title = course.title if course else "Unknown"

        prompt = f"""You are an educational AI classifying student questions.
Course: {course_title}
Student Question: "{question.question_text}"

Classify this question by outputting ONLY a valid JSON object with the following fields:
- topic_category: A short string (1-4 words) describing the main concept or topic (e.g. "Cell Division", "Newton's Laws", "Exam Prep").
- sentiment_difficulty: A short string (1-3 words) describing the implied difficulty or student's sentiment (e.g. "Confusion", "Definition Request", "Advanced Query", "Syllabus Question").

Do NOT include markdown formatting or backticks. Return raw JSON.
"""
        response = call_llm(prompt, temperature=0.1, max_tokens=150)
        
        try:
            # Try to parse the response
            # Remove any markdown formatting if present despite instructions
            cleaned = response.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
                
            data = json.loads(cleaned.strip())
            
            question.topic_category = data.get("topic_category", "Uncategorized")[:100]
            question.sentiment_difficulty = data.get("sentiment_difficulty", "Unknown")[:100]
            
            # Note: course_material_id is optional and can be linked if needed later.
            
            db.commit()
            logger.info(f"Categorized question {question_id}: {question.topic_category} / {question.sentiment_difficulty}")
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse categorization JSON: {e} - Response was: {response}")
            
    except Exception as e:
        logger.error(f"Error in categorize_student_question: {e}")
