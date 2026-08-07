import os
import json
import logging
from sqlalchemy.orm import Session
from app.models import StudentQuestion, Course

logger = logging.getLogger(__name__)

def categorize_student_question(question_id: int, db: Session):
    """
    Background task to categorize a student's question and determine sentiment/difficulty.
    Uses Groq LLM to classify with keyword-matching fallback.
    """
    try:
        question = db.query(StudentQuestion).filter(StudentQuestion.id == question_id).first()
        if not question:
            logger.warning(f"Question {question_id} not found for categorization.")
            return

        course = db.query(Course).filter(Course.id == question.course_id).first()
        course_title = course.title if course else "Biology"
        q_text = question.question_text.lower()

        # Step 1: Fast Rule/Keyword Based Classifier
        topic_category = "General Course Query"
        sentiment_difficulty = "Confusion"

        if any(w in q_text for w in ["anabolism", "catabolism", "metabolism", "exothermic", "endothermic"]):
            topic_category = "Metabolism & Bioenergetics"
        elif any(w in q_text for w in ["virus", "bacteria", "living", "non-living", "cell organization"]):
            topic_category = "Viruses & Cellular Organization"
        elif any(w in q_text for w in ["emergent", "hierarchy", "organelle", "tissue", "ecosystem"]):
            topic_category = "Emergent Properties & Hierarchy"
        elif any(w in q_text for w in ["homeostasis", "irritability", "stimuli", "phototropism"]):
            topic_category = "Homeostasis & Irritability"
        elif any(w in q_text for w in ["mitosis", "meiosis", "cell division"]):
            topic_category = "Cell Division & Genetics"
        elif any(w in q_text for w in ["newton", "force", "gravity"]):
            topic_category = "Newtonian Mechanics"

        # Step 2: Try Groq LLM for fine-grained classification
        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            try:
                from groq import Groq
                client = Groq(api_key=api_key)
                prompt = f"""You are an educational AI classifying student questions.
Course: {course_title}
Student Question: "{question.question_text}"

Classify this question by outputting ONLY a valid JSON object with:
- topic_category: A short string (1-4 words) describing the main concept (e.g. "Metabolism & Bioenergetics", "Cell Division", "Viruses & Cell Organization").
- sentiment_difficulty: A short string (1-3 words) (e.g. "Confusion", "Definition Request").

Do NOT include markdown backticks. Return raw JSON.
"""
                resp = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=100
                )
                cleaned = resp.choices[0].message.content.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                
                parsed = json.loads(cleaned)
                if parsed.get("topic_category"):
                    topic_category = parsed["topic_category"][:100]
                if parsed.get("sentiment_difficulty"):
                    sentiment_difficulty = parsed["sentiment_difficulty"][:100]
            except Exception as llm_err:
                logger.warning(f"Groq categorization fallback to rule engine: {llm_err}")

        question.topic_category = topic_category
        question.sentiment_difficulty = sentiment_difficulty
        db.commit()
        logger.info(f"Categorized question {question_id}: {topic_category} / {sentiment_difficulty}")

    except Exception as e:
        logger.error(f"Error in categorize_student_question: {e}")

