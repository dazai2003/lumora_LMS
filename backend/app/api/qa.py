"""
AI Q&A API: Students ask questions, AI answers using course materials (RAG).
Teachers can view student questions and AI responses.
"""
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
from datetime import datetime

from app.database import get_db
from app.models import (
    User, UserRole, Course, Enrollment, Material,
    StudentQuestion, AIResponse, AILog, ProcessingStatus,
    TeacherQuestion, Notification, NotificationType
)
from app.schemas import (
    QuestionAsk, StudentQuestionItem, AIResponseDetail, MessageResponse, TeacherCorrectionCreate,
    TeacherQuestionCreate, TeacherQuestionReply, TeacherQuestionResponse
)
from app.auth import get_current_user, require_role, require_admin_or_teacher

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ask", response_model=AIResponseDetail)
def ask_question(
    data: QuestionAsk,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Student asks a question about a course. AI answers using course materials."""
    import time
    start_time = time.time()

    # Verify enrollment
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == current_user.id, Enrollment.course_id == data.course_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Save the question
    question = StudentQuestion(
        student_id=current_user.id,
        course_id=data.course_id,
        question_text=data.question,
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    # Search vector store for relevant context
    context_chunks = []
    context_sources = []
    seen_material_ids = set()  # Deduplicate sources
    try:
        from app.services.vector import search_similar
        results = search_similar(query=data.question, course_id=data.course_id, n_results=5)
        for hit in results:
            meta = hit.get("metadata", {})
            mat_id = meta.get("material_id")

            if not mat_id or mat_id in seen_material_ids:
                continue

            # Strict Database Validation: Must be an active, non-private Lesson Material belonging to this Course
            material = (
                db.query(Material)
                .join(Lesson, Material.lesson_id == Lesson.id)
                .filter(
                    Material.id == mat_id,
                    Material.lesson_id.isnot(None),
                    Material.is_private_rag_vault == False,
                    Lesson.course_id == data.course_id
                )
                .first()
            )
            if not material:
                continue

            seen_material_ids.add(mat_id)
            context_chunks.append(hit["text"])

            file_url = None
            mat_type = material.material_type.value if material.material_type else "note"
            if material.file_path:
                file_url = f"/uploads/{mat_type}/{os.path.basename(material.file_path)}"

            lesson_title = material.lesson.title if material.lesson else None
            unit_name = None
            if material.lesson and material.lesson.unit:
                u = material.lesson.unit
                unit_name = f"Unit {u.unit_number}: {u.name}" if getattr(u, 'unit_number', None) else getattr(u, 'title', getattr(u, 'name', 'Unit'))

            context_sources.append({
                "material_id": mat_id,
                "lesson_id": material.lesson_id,
                "title": material.title,
                "lesson_title": lesson_title,
                "unit_name": unit_name,
                "material_type": mat_type,
                "file_url": file_url,
                "content": material.content[:500] if material.content else None,
                "extracted_text": material.extracted_text[:1000] if material.extracted_text else None,
                "relevance": round(1 - hit.get("distance", 0), 3),
            })
    except Exception as e:
        logger.warning(f"Vector search failed: {e}")

    # Build prompt and call Gemini LLM
    response_text = _call_groq_llm(data.question, context_chunks, data.course_id, db)

    # Save AI response
    ai_response = AIResponse(
        student_question_id=question.id,
        response_text=response_text,
        context_sources=context_sources if context_sources else None,
        confidence_score=_calculate_confidence(context_chunks),
    )
    db.add(ai_response)

    # Mark question as answered
    question.is_answered = True
    db.commit()
    db.refresh(ai_response)

    # Queue background task to categorize the question
    from app.services.analytics import categorize_student_question
    background_tasks.add_task(categorize_student_question, question.id, db)

    # Log AI operation
    elapsed_ms = int((time.time() - start_time) * 1000)
    ai_log = AILog(
        action="qa_answer",
        details={
            "question_id": question.id,
            "course_id": data.course_id,
            "sources_count": len(context_sources),
            "grounded": len(context_chunks) > 0,
            "elapsed_ms": elapsed_ms,
        },
    )
    db.add(ai_log)
    db.commit()

    return {
        "id": ai_response.id,
        "question_id": question.id,
        "question_text": question.question_text,
        "response_text": ai_response.response_text,
        "context_sources": ai_response.context_sources or [],
        "confidence_score": ai_response.confidence_score,
        "is_flagged": ai_response.is_flagged,
        "teacher_correction": ai_response.teacher_correction,
        "asked_at": question.asked_at.isoformat(),
    }


@router.post("/ask/stream")
async def ask_question_stream(
    data: QuestionAsk,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Student asks a question about a course. AI streams answer using lesson learning materials."""
    import time
    import json
    start_time = time.time()

    # Verify enrollment
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == current_user.id, Enrollment.course_id == data.course_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Check if an existing question ID is provided for retry or if identical recent question exists
    question = None
    if data.existing_question_id:
        question = db.query(StudentQuestion).filter(
            StudentQuestion.id == data.existing_question_id,
            StudentQuestion.student_id == current_user.id
        ).first()

    if not question:
        from datetime import datetime, timedelta
        recent_cutoff = datetime.utcnow() - timedelta(minutes=3)
        recent_q = db.query(StudentQuestion).filter(
            StudentQuestion.student_id == current_user.id,
            StudentQuestion.course_id == data.course_id,
            StudentQuestion.question_text == data.question,
            StudentQuestion.asked_at >= recent_cutoff
        ).first()

        if recent_q:
            question = recent_q
        else:
            question = StudentQuestion(
                student_id=current_user.id,
                course_id=data.course_id,
                question_text=data.question,
            )
            db.add(question)
            db.commit()
            db.refresh(question)

    # Search vector store for relevant context (with 1.5s timeout & SQL fallback)
    context_chunks = []
    context_sources = []
    seen_material_ids = set()
    is_grounded = False

    def _do_vector_search():
        try:
            from app.services.vector import search_similar
            return search_similar(query=data.question, course_id=data.course_id, n_results=4)
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")
            return []

    results = []
    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_vector_search)
            results = future.result(timeout=1.5)
    except Exception as timeout_err:
        logger.warning(f"Vector search timed out or failed: {timeout_err}")

    # Process vector search results with strict Lesson-Material validation
    question_keywords = [w.lower().strip() for w in data.question.split() if len(w.strip()) > 3]

    if results:
        for hit in results:
            distance = hit.get("distance", 1.0)
            text_snippet = hit.get("text", "")
            meta = hit.get("metadata", {})
            mat_id = meta.get("material_id")

            if not mat_id or mat_id in seen_material_ids:
                continue

            # Strict Database Validation: Must be an active, non-private Lesson Material belonging to this Course
            material = (
                db.query(Material)
                .join(Lesson, Material.lesson_id == Lesson.id)
                .filter(
                    Material.id == mat_id,
                    Material.lesson_id.isnot(None),
                    Material.is_private_rag_vault == False,
                    Lesson.course_id == data.course_id
                )
                .first()
            )
            if not material:
                continue

            # Check if snippet has semantic similarity OR contains direct question keywords
            has_keyword_match = any(kw in text_snippet.lower() for kw in question_keywords)
            is_relevant_distance = distance < 0.45

            if (is_relevant_distance or (has_keyword_match and distance < 0.60)) and text_snippet:
                seen_material_ids.add(mat_id)
                context_chunks.append(text_snippet)

                file_url = None
                mat_type = material.material_type.value if material.material_type else "note"
                if material.file_path:
                    file_url = f"/uploads/{mat_type}/{os.path.basename(material.file_path)}"

                lesson_title = material.lesson.title if material.lesson else None
                unit_name = None
                if material.lesson and material.lesson.unit:
                    u = material.lesson.unit
                    unit_name = f"Unit {u.unit_number}: {u.name}" if getattr(u, 'unit_number', None) else getattr(u, 'title', getattr(u, 'name', 'Unit'))

                context_sources.append({
                    "course_id": data.course_id,
                    "lesson_id": material.lesson_id,
                    "material_id": mat_id,
                    "title": material.title,
                    "material_type": mat_type,
                    "lesson_title": lesson_title,
                    "unit_name": unit_name,
                    "file_url": file_url,
                    "relevance": round(1 - distance, 3),
                })

    # Fast SQL Fallback if no vector search results found and direct keyword match exists
    if not context_chunks and question_keywords:
        try:
            from sqlalchemy import or_
            mat_matches = (
                db.query(Material)
                .join(Lesson, Material.lesson_id == Lesson.id)
                .filter(
                    Lesson.course_id == data.course_id,
                    Material.lesson_id.isnot(None),
                    Material.is_private_rag_vault == False,
                    or_(*[Material.title.ilike(f"%{kw}%") for kw in question_keywords[:3]])
                )
                .limit(2)
                .all()
            )

            for mat in mat_matches:
                if mat.content or mat.extracted_text:
                    raw = mat.content or mat.extracted_text
                    context_chunks.append(raw[:800])
                mat_type = mat.material_type.value if mat.material_type else "note"
                file_url = f"/uploads/{mat_type}/{os.path.basename(mat.file_path)}" if mat.file_path else None
                if mat.id not in seen_material_ids:
                    seen_material_ids.add(mat.id)
                    lesson_title = mat.lesson.title if mat.lesson else None
                    unit_name = None
                    if mat.lesson and mat.lesson.unit:
                        u = mat.lesson.unit
                        unit_name = f"Unit {u.unit_number}: {u.name}" if getattr(u, 'unit_number', None) else getattr(u, 'title', getattr(u, 'name', 'Unit'))

                    context_sources.append({
                        "course_id": data.course_id,
                        "lesson_id": mat.lesson_id,
                        "material_id": mat.id,
                        "title": mat.title,
                        "material_type": mat_type,
                        "lesson_title": lesson_title,
                        "unit_name": unit_name,
                        "file_url": file_url,
                        "relevance": 0.75,
                    })
        except Exception as sql_err:
            logger.warning(f"SQL fallback failed: {sql_err}")

    is_grounded = bool(context_chunks and context_sources)

    # Build prompt
    course = db.query(Course).filter(Course.id == data.course_id).first()
    course_title = course.title if course else "this course"

    if is_grounded:
        context = "\n\n---\n\n".join(context_chunks[:3])
        system_prompt = f"""You are an expert AI tutor for the Sri Lankan G.C.E. Advanced Level Biology course "{course_title}".
Your task is to answer the student's question directly, clearly, concisely, and educationally using the provided relevant lesson learning material excerpts.

CRITICAL INSTRUCTIONS:
- Directly answer the student's question first.
- DO NOT dump or list unrelated course outlines, syllabus headings, or material introductory text.
- Ground your explanation in the provided lesson materials without copying verbatim blocks of unrelated text.
- If the question is simple, provide a direct, concise answer (2-4 sentences).
- If the question requires an explanation, explain the biological concept or mechanism step-by-step with clear scientific terminology.
- Use markdown formatting (bold, bullet points) where appropriate.

RELEVANT LESSON MATERIAL EXCERPTS:
{context}"""
    else:
        system_prompt = f"""You are an expert AI tutor for the Sri Lankan G.C.E. Advanced Level Biology course "{course_title}".
The student asked a question that is not directly covered in their available course materials.
Your task is to answer the student's question clearly, accurately, and educationally using general G.C.E. A/L Biology knowledge.

CRITICAL INSTRUCTIONS:
- Directly answer the student's question with accurate scientific concepts suitable for G.C.E. A/L Biology.
- DO NOT claim that this answer came from their course materials.
- Provide a clear, educational, and structured explanation.
- Use clear markdown formatting."""

    def generate():
        # First yield the sources, grounded state, and question ID immediately
        initial_data = {
            "type": "start",
            "question_id": question.id,
            "is_grounded": is_grounded,
            "context_sources": context_sources if is_grounded else []
        }
        yield f"data: {json.dumps(initial_data)}\n\n"

        full_response = ""
        try:
            from app.services.gemini_service import gemini
            from google.genai import types as genai_types

            client = gemini._get_client()
            config = genai_types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=1024,
                system_instruction=system_prompt,
            )

            stream_succeeded = False
            for stream_model in ["gemini-flash-lite-latest", "gemini-flash-latest"]:
                try:
                    stream = client.models.generate_content_stream(
                        model=stream_model,
                        contents=data.question,
                        config=config,
                    )
                    for chunk in stream:
                        content = chunk.text
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'type': 'chunk', 'text': content})}\n\n"
                    if full_response:
                        stream_succeeded = True
                        break
                except Exception as stream_err:
                    logger.warning(f"Streaming failed with model {stream_model}: {stream_err}. Trying next...")
                    continue

            if not stream_succeeded or not full_response:
                logger.info("Streaming incomplete. Using robust gemini.generate_text fallback...")
                full_response = gemini.generate_text(
                    prompt=data.question,
                    system_instruction=system_prompt,
                    model_tier="flash",
                    temperature=0.3,
                    max_tokens=1024,
                )
                if full_response:
                    yield f"data: {json.dumps({'type': 'chunk', 'text': full_response})}\n\n"
        except Exception as e:
            logger.error(f"Gemini API call failed completely: {e}")

        # Tier 3 Fallback: If LLM APIs failed or returned empty response
        if not full_response:
            logger.info("Using Tier 3 Educational Guidance fallback...")
            full_response = f"Thank you for your question regarding '{data.question}'. I am temporarily unable to reach the AI model. Please check the video lessons and downloadable study notes under My Courses, or send a direct question to your teacher using the 'Ask Teacher' tab for personalized guidance."
            yield f"data: {json.dumps({'type': 'chunk', 'text': full_response})}\n\n"
        
        # After streaming completes, save to DB and categorize
        try:
            db_session = next(get_db())
            q = db_session.query(StudentQuestion).filter(StudentQuestion.id == question.id).first()
            if q:
                existing_ai_resp = db_session.query(AIResponse).filter(AIResponse.student_question_id == question.id).first()
                if existing_ai_resp:
                    existing_ai_resp.response_text = full_response
                    existing_ai_resp.context_sources = context_sources if context_sources else None
                    existing_ai_resp.confidence_score = _calculate_confidence(context_chunks)
                else:
                    ai_resp = AIResponse(
                        student_question_id=question.id,
                        response_text=full_response,
                        context_sources=context_sources if context_sources else None,
                        confidence_score=_calculate_confidence(context_chunks),
                    )
                    db_session.add(ai_resp)
                q.is_answered = True
                db_session.commit()
                
                # Categorize question immediately
                from app.services.analytics import categorize_student_question
                categorize_student_question(question.id, db_session)
        except Exception as e:
            logger.error(f"Failed to save streamed response & categorize: {e}")

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/history/{course_id}", response_model=List[AIResponseDetail])
async def get_question_history(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get question history for a course (students see their own, teachers see all)."""
    query = db.query(StudentQuestion).filter(StudentQuestion.course_id == course_id)

    if current_user.role == UserRole.STUDENT:
        query = query.filter(StudentQuestion.student_id == current_user.id)

    questions = query.order_by(StudentQuestion.asked_at.desc()).limit(50).all()

    results = []
    for q in questions:
        ai_resp = q.ai_response
        resp_text = ai_resp.response_text if ai_resp and ai_resp.response_text else "Sorry, this response was interrupted. Please ask your question again."
        results.append({
            "question_id": q.id,
            "question_text": q.question_text,
            "response_text": resp_text,
            "context_sources": ai_resp.context_sources if ai_resp else [],
            "confidence_score": ai_resp.confidence_score if ai_resp else None,
            "is_flagged": ai_resp.is_flagged if ai_resp else False,
            "teacher_correction": ai_resp.teacher_correction if ai_resp else None,
            "asked_at": q.asked_at.isoformat(),
            "student_name": q.student.full_name if current_user.role != UserRole.STUDENT else None,
        })

    return results


@router.get("/teacher/all-questions")
async def get_all_student_questions(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher views all questions across their courses."""
    # Get teacher's course IDs
    courses = db.query(Course).filter(Course.teacher_id == current_user.id).all()
    course_ids = [c.id for c in courses]

    if not course_ids:
        return []

    questions = (
        db.query(StudentQuestion)
        .filter(StudentQuestion.course_id.in_(course_ids))
        .order_by(StudentQuestion.asked_at.desc())
        .limit(100)
        .all()
    )

    results = []
    for q in questions:
        ai_resp = q.ai_response
        course = next((c for c in courses if c.id == q.course_id), None)
        results.append({
            "question_id": q.id,
            "ai_response_id": ai_resp.id if ai_resp else None,
            "question_text": q.question_text,
            "response_text": ai_resp.response_text if ai_resp else None,
            "confidence_score": ai_resp.confidence_score if ai_resp else None,
            "is_flagged": ai_resp.is_flagged if ai_resp else False,
            "teacher_correction": ai_resp.teacher_correction if ai_resp else None,
            "asked_at": q.asked_at.isoformat(),
            "student_name": q.student.full_name,
            "course_title": course.title if course else "Unknown",
            "is_answered": q.is_answered,
        })

    return results


@router.post("/teacher/moderate/{ai_response_id}", response_model=MessageResponse)
async def moderate_ai_response(
    ai_response_id: int,
    data: TeacherCorrectionCreate,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher flags and corrects an AI response."""
    ai_resp = db.query(AIResponse).filter(AIResponse.id == ai_response_id).first()
    if not ai_resp:
        raise HTTPException(status_code=404, detail="AI Response not found")
        
    # Verify the teacher owns the course for this question
    question = ai_resp.student_question
    course = db.query(Course).filter(Course.id == question.course_id).first()
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to moderate this course's Q&A")

    ai_resp.is_flagged = data.is_flagged
    ai_resp.teacher_correction = data.correction_text
    
    if data.correction_text and question.student_id:
        snippet = question.question_text[:50] + ("..." if len(question.question_text) > 50 else "")
        notif = Notification(
            user_id=question.student_id,
            sender_id=current_user.id,
            title="Teacher Correction to AI Answer",
            message=f"Your teacher reviewed and provided an authoritative correction for your question: '{snippet}'",
            type=NotificationType.SYSTEM,
            related_entity_id=question.id,
        )
        db.add(notif)

    db.commit()

    return MessageResponse(message="Moderation saved successfully", success=True)


# ──────────────────────────────────────────────
# Ask Teacher (Direct Q&A)
# ──────────────────────────────────────────────

from app.models import TeacherQuestion, Notification, NotificationType
from app.schemas import TeacherQuestionCreate, TeacherQuestionReply, TeacherQuestionResponse
from datetime import datetime

@router.post("/ask-teacher", response_model=TeacherQuestionResponse)
def ask_teacher(
    data: TeacherQuestionCreate,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Student asks a direct question to the teacher."""
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id, 
        Enrollment.course_id == data.course_id
    ).first()
    
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    question = TeacherQuestion(
        student_id=current_user.id,
        course_id=data.course_id,
        tag=data.tag,
        question_text=data.question_text
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    course = db.query(Course).filter(Course.id == question.course_id).first()

    # Notify the teacher
    if course and course.teacher_id:
        tag_label = f" [{data.tag}]" if data.tag else ""
        notif = Notification(
            user_id=course.teacher_id,
            sender_id=current_user.id,
            title="New message from student",
            message=f"{current_user.full_name} sent you a message in {course.title}{tag_label}",
            type=NotificationType.MESSAGE,
            related_entity_id=question.id,
        )
        db.add(notif)
        db.commit()

    return {
        **question.__dict__,
        "student_name": current_user.full_name,
        "course_title": course.title if course else "Unknown",
    }


@router.get("/teacher-questions/student", response_model=List[TeacherQuestionResponse])
def get_student_teacher_questions(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Student views all questions they've asked their teachers."""
    questions = db.query(TeacherQuestion).filter(TeacherQuestion.student_id == current_user.id).order_by(TeacherQuestion.created_at.desc()).all()
    
    results = []
    for q in questions:
        course = db.query(Course).filter(Course.id == q.course_id).first()
        results.append({
            **q.__dict__,
            "student_name": current_user.full_name,
            "course_title": course.title if course else "Unknown"
        })
    return results


@router.get("/teacher-questions/teacher", response_model=List[TeacherQuestionResponse])
def get_teacher_inbox_questions(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher views all direct questions asked by their students."""
    # Find all courses taught by this teacher
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(Course.teacher_id == current_user.id).all()]
    
    if not teacher_course_ids:
        return []

    questions = db.query(TeacherQuestion).filter(TeacherQuestion.course_id.in_(teacher_course_ids)).order_by(TeacherQuestion.is_answered.asc(), TeacherQuestion.created_at.desc()).all()
    
    results = []
    for q in questions:
        student = db.query(User).filter(User.id == q.student_id).first()
        course = db.query(Course).filter(Course.id == q.course_id).first()
        results.append({
            **q.__dict__,
            "student_name": student.full_name if student else "Unknown",
            "course_title": course.title if course else "Unknown"
        })
    return results


@router.post("/teacher-questions/{question_id}/reply", response_model=TeacherQuestionResponse)
def reply_teacher_question(
    question_id: int,
    data: TeacherQuestionReply,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher replies to a direct question."""
    question = db.query(TeacherQuestion).filter(TeacherQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    course = db.query(Course).filter(Course.id == question.course_id).first()
    if not course or course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to answer this question")

    question.teacher_response = data.teacher_response
    question.is_answered = True
    question.answered_at = datetime.utcnow()
    
    db.commit()
    db.refresh(question)

    # Notify the student
    notif = Notification(
        user_id=question.student_id,
        sender_id=current_user.id,
        title="Teacher replied to your message",
        message=f"{current_user.full_name} replied to your message in {course.title}",
        type=NotificationType.MESSAGE,
        related_entity_id=question.id,
    )
    db.add(notif)
    db.commit()

    student = db.query(User).filter(User.id == question.student_id).first()
    return {
        **question.__dict__,
        "student_name": student.full_name if student else "Unknown",
        "course_title": course.title if course else "Unknown"
    }


@router.post("/teacher-questions/initiate", response_model=TeacherQuestionResponse)
def initiate_teacher_question(
    data: TeacherQuestionReply,
    student_id: int,
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher initiates a conversation with a student."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == student_id, 
        Enrollment.course_id == course_id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this course")

    question = TeacherQuestion(
        student_id=student_id,
        course_id=course_id,
        tag="Teacher Message",
        question_text="", # Empty because it's initiated by the teacher
        teacher_response=data.teacher_response,
        is_answered=True,
        answered_at=datetime.utcnow()
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    # Notify the student
    notif = Notification(
        user_id=student_id,
        sender_id=current_user.id,
        title="New message from teacher",
        message=f"{current_user.full_name} sent you a message in {course.title}",
        type=NotificationType.MESSAGE,
        related_entity_id=question.id,
    )
    db.add(notif)
    db.commit()

    student = db.query(User).filter(User.id == student_id).first()
    return {
        **question.__dict__,
        "student_name": student.full_name if student else "Unknown",
        "course_title": course.title if course else "Unknown"
    }


@router.post("/teacher-questions/{question_id}/read", response_model=TeacherQuestionResponse)
def mark_teacher_question_read(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a direct question as read by the current user."""
    question = db.query(TeacherQuestion).filter(TeacherQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if current_user.role == UserRole.STUDENT:
        if question.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
        question.student_seen_at = datetime.utcnow()
    elif current_user.role == UserRole.TEACHER:
        course = db.query(Course).filter(Course.id == question.course_id).first()
        if not course or course.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
        question.teacher_seen_at = datetime.utcnow()
    
    db.commit()
    db.refresh(question)
    
    student = db.query(User).filter(User.id == question.student_id).first()
    course = db.query(Course).filter(Course.id == question.course_id).first()
    return {
        **question.__dict__,
        "student_name": student.full_name if student else "Unknown",
        "course_title": course.title if course else "Unknown"
    }


def _call_groq_llm(question: str, context_chunks: list, course_id: int, db: Session) -> str:
    """Call Gemini with RAG context to answer the student's question."""
    try:
        from app.services.gemini_service import gemini

        # Get course title for context
        course = db.query(Course).filter(Course.id == course_id).first()
        course_title = course.title if course else "this course"

        # Build context from retrieved chunks
        if context_chunks:
            context = "\n\n---\n\n".join(context_chunks[:5])
            system_prompt = f"""You are an AI tutor for the course "{course_title}". 
Answer the student's question using ONLY the provided lesson learning materials below.
If the materials don't contain enough information to answer, say so honestly.
Be clear, concise, and educational. Use examples when helpful.

LESSON LEARNING MATERIALS:
{context}"""
        else:
            system_prompt = f"""You are an AI tutor for the course "{course_title}".
The student asked a question but no relevant lesson learning materials were found in the database.
Provide a helpful general answer, but clearly note that this answer is not based on specific lesson materials.
Suggest the student check their course lessons for more detailed information."""

        return gemini.generate_text(
            prompt=question,
            system_instruction=system_prompt,
            model_tier="flash_25",
            temperature=0.3,
            max_tokens=1024,
        )

    except Exception as e:
        logger.error(f"Gemini LLM call failed: {e}")
        return f"Sorry, I encountered an error while processing your question. Please try again later."


def _calculate_confidence(context_chunks: list) -> float:
    """Estimate confidence based on how much relevant context was found."""
    if not context_chunks:
        return 0.2
    if len(context_chunks) >= 4:
        return 0.95
    if len(context_chunks) >= 2:
        return 0.75
    return 0.5


# ──────────────────────────────────────────────
# AI Tutor Multi-Turn Session Management
# ──────────────────────────────────────────────

@router.post("/sessions", response_model=dict)
def create_ai_tutor_session(
    data: dict,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Create a new AI tutor chat session."""
    from app.models import AITutorSession
    course_id = data.get("course_id")
    title = data.get("title", "New Conversation")
    
    session = AITutorSession(
        student_id=current_user.id,
        course_id=course_id,
        title=title,
        is_active=True
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "title": session.title,
        "course_id": session.course_id,
        "created_at": session.created_at.isoformat(),
        "is_active": session.is_active
    }


@router.get("/sessions", response_model=List[dict])
def list_ai_tutor_sessions(
    course_id: Optional[int] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """List active AI tutor chat sessions for student."""
    from app.models import AITutorSession
    query = db.query(AITutorSession).filter(AITutorSession.student_id == current_user.id, AITutorSession.is_active == True)
    if course_id:
        query = query.filter(AITutorSession.course_id == course_id)
    if search:
        query = query.filter(AITutorSession.title.ilike(f"%{search}%"))
    
    sessions = query.order_by(AITutorSession.updated_at.desc()).all()
    results = []
    for s in sessions:
        q_count = len(s.questions)
        results.append({
            "id": s.id,
            "title": s.title,
            "course_id": s.course_id,
            "course_title": s.course.title if s.course else None,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "is_active": s.is_active,
            "question_count": q_count
        })
    return results


@router.get("/sessions/{session_id}", response_model=dict)
def get_ai_tutor_session(
    session_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Fetch all messages within a specific session."""
    from app.models import AITutorSession
    session = db.query(AITutorSession).filter(AITutorSession.id == session_id, AITutorSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = []
    for q in session.questions:
        ans = q.ai_response
        messages.append({
            "question_id": q.id,
            "question_text": q.question_text,
            "response_text": ans.response_text if ans else None,
            "confidence_score": ans.confidence_score if ans else None,
            "context_sources": ans.context_sources if ans else [],
            "sources_json": ans.sources_json if ans else [],
            "asked_at": q.asked_at.isoformat(),
            "is_escalated": ans.is_escalated if ans else False
        })
        
    return {
        "id": session.id,
        "title": session.title,
        "course_id": session.course_id,
        "course_title": session.course.title if session.course else None,
        "created_at": session.created_at.isoformat(),
        "messages": messages
    }


@router.delete("/sessions/{session_id}")
def delete_ai_tutor_session(
    session_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Soft delete / deactivate a chat session."""
    from app.models import AITutorSession
    session = db.query(AITutorSession).filter(AITutorSession.id == session_id, AITutorSession.student_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.is_active = False
    db.commit()
    return {"message": "Session deleted successfully"}


@router.get("/teacher/course/{course_id}/topic-questions")
def get_questions_by_topic(
    course_id: int,
    topic: str,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Retrieves all student questions and AI answers categorized under a specific topic."""
    try:
        query = db.query(StudentQuestion).filter(StudentQuestion.course_id == course_id)
        
        if topic and topic.strip():
            clean_topic = topic.strip()
            if clean_topic.lower() == "general":
                query = query.filter(
                    (StudentQuestion.topic_category == None) | 
                    (StudentQuestion.topic_category == "") | 
                    (StudentQuestion.topic_category.ilike("general"))
                )
            else:
                query = query.filter(StudentQuestion.topic_category.ilike(f"%{clean_topic}%"))
                
        questions = query.order_by(StudentQuestion.asked_at.desc()).all()

        res = []
        for q in questions:
            student = db.query(User).filter(User.id == q.student_id).first()
            ai_resp = db.query(AIResponse).filter(AIResponse.student_question_id == q.id).first()
            time_iso = q.asked_at.isoformat() if getattr(q, 'asked_at', None) else None
            res.append({
                "id": q.id,
                "question_text": q.question_text,
                "created_at": time_iso,
                "asked_at": time_iso,
                "student_name": student.full_name if (student and student.full_name) else "Student",
                "student_email": student.email if student else "",
                "avatar_url": getattr(student, "avatar_url", None),
                "ai_response": ai_resp.response_text if ai_resp else "No AI response recorded.",
                "sentiment_difficulty": q.sentiment_difficulty or "Confusion",
            })
        return res
    except Exception as e:
        logger.error(f"Error in get_questions_by_topic: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve topic questions: {str(e)}")
