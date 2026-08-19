"""
Materials API: Upload and manage learning resources (notes, PDFs, images, videos).
"""
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db, SessionLocal
from app.models import User, UserRole, Course, Lesson, Material, MaterialType, ProcessingStatus, MaterialFlag, MaterialNote, StudentMaterialProgress, Notification, NotificationType, Enrollment
from app.schemas import (
    MaterialCreate, MaterialResponse, 
    MaterialFlagCreate, MaterialFlagResponse,
    MaterialNoteCreate, MaterialNoteResponse,
    StudentMaterialProgressUpdate, StudentMaterialProgressResponse,
    TeacherMaterialFlagResponse, MessageResponse
)
from app.auth import get_current_user, require_admin_or_teacher, require_role, check_course_access
import groq
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_material(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    lesson_id: int = Form(...),
    material_type: MaterialType = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Upload a file (PDF, image, video) as learning material."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only upload to your own courses")

    # Validate file type
    allowed_extensions = {
        MaterialType.PDF: [".pdf"],
        MaterialType.IMAGE: [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"],
        MaterialType.VIDEO: [".mp4", ".mkv", ".avi", ".mov", ".webm"],
        MaterialType.NOTE: [".txt", ".md"],
    }
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions.get(material_type, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type for {material_type.value}. Allowed: {allowed_extensions[material_type]}",
        )

    # Save file to disk
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    type_dir = os.path.join(UPLOAD_DIR, material_type.value)
    os.makedirs(type_dir, exist_ok=True)
    file_path = os.path.join(type_dir, unique_filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    relative_file_path = f"uploads/{material_type.value}/{unique_filename}"

    # Determine processing status
    processing = ProcessingStatus.PENDING
    if material_type == MaterialType.NOTE:
        processing = ProcessingStatus.COMPLETED  # Notes don't need OCR/Whisper

    material = Material(
        title=title,
        description=description,
        material_type=material_type,
        file_path=relative_file_path,
        processing_status=processing,
        lesson_id=lesson_id,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Notify enrolled students
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course.id).all()
    for enrollment in enrollments:
        notification = Notification(
            user_id=enrollment.student_id,
            sender_id=current_user.id,
            title=f"New Material in {course.title}",
            message=f"A new {material_type.value} '{material.title}' has been added to lesson '{lesson.title}'.",
            type=NotificationType.COURSE,
            related_entity_id=course.id,
        )
        db.add(notification)

    # Notify teacher if video uploaded
    if material_type == MaterialType.VIDEO and current_user:
        teacher_notif = Notification(
            user_id=current_user.id,
            title=f"Video Uploaded: '{material.title}'",
            message=f"Video '{material.title}' uploaded successfully. AI transcription is running in the background.",
            type=NotificationType.SYSTEM,
            related_entity_id=material.id,
        )
        db.add(teacher_notif)

    db.commit()

    # Trigger AI background processing for non-note materials
    if material_type != MaterialType.NOTE:
        from app.services.processor import process_material
        background_tasks.add_task(process_material, material.id, SessionLocal)

    return material


@router.post("/note", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    material_data: MaterialCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Create a text-based note directly (no file upload)."""
    lesson = db.query(Lesson).filter(Lesson.id == material_data.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only add materials to your own courses")

    material = Material(
        title=material_data.title,
        description=material_data.description,
        material_type=MaterialType.NOTE,
        content=material_data.content,
        extracted_text=material_data.content,  # For notes, content IS the extracted text
        processing_status=ProcessingStatus.COMPLETED,
        lesson_id=material_data.lesson_id,
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.post("/course-upload", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_course_material(
    course_id: int = Form(...),
    title: str = Form(...),
    category: Optional[str] = Form("general"),
    material_type: Optional[str] = Form("pdf"),
    description: Optional[str] = Form(None),
    paper_type: Optional[str] = Form(None),
    year: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Upload course-level reference material (PDFs, Word docs, past papers, marking schemes)."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only upload materials to your own courses")

    file_ext = os.path.splitext(file.filename)[1].lower()
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    course_dir = os.path.join(UPLOAD_DIR, "course_materials", f"course_{course_id}")
    os.makedirs(course_dir, exist_ok=True)
    file_path = os.path.join(course_dir, unique_filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    relative_file_path = f"uploads/course_materials/course_{course_id}/{unique_filename}"

    # Parse material_type string safely to MaterialType Enum
    m_type = MaterialType.PDF
    if material_type:
        try:
            m_type = MaterialType(material_type.lower())
        except ValueError:
            m_type = MaterialType.PDF

    full_description = description or ""
    if paper_type or year:
        details = []
        if paper_type:
            details.append(f"Format: {paper_type.replace('_', ' ').title()}")
        if year:
            details.append(f"Year/Session: {year}")
        info_str = " | ".join(details)
        full_description = f"{full_description}\n[{info_str}]".strip()

    material = Material(
        title=title,
        description=full_description,
        material_type=m_type,
        category=category or "general",
        file_path=relative_file_path,
        processing_status=ProcessingStatus.COMPLETED,
        course_id=course_id,
        lesson_id=None,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Question Bank Ingestion for Past Papers & Model Papers
    if category in ["past_paper", "model_paper"]:
        try:
            from app.models import Question, QuestionVersion, QuestionType, Difficulty
            from app.services.pdf_parser import parse_pdf_questions

            parsed_questions = parse_pdf_questions(file_path, paper_type, year)
            for item in parsed_questions:
                q = Question(lesson_id=None, is_banked=True, is_active=True)
                db.add(q)
                db.commit()
                db.refresh(q)

                q_type = QuestionType.MCQ if item.get("type") == "MCQ" else QuestionType.SHORT_ANSWER

                qv = QuestionVersion(
                    question_id=q.id,
                    question_text=item["text"],
                    question_type=q_type,
                    options=item.get("options"),
                    correct_answer=item.get("answer", "Refer to marking scheme."),
                    explanation=item.get("explanation", ""),
                    difficulty=Difficulty.MEDIUM,
                    tags=item.get("tags", ["past_paper", f"year_{year}", paper_type]),
                )
                db.add(qv)
            db.commit()
        except Exception as err:
            logger.warning(f"Failed to auto-populate question bank entry: {err}")

    return material


@router.get("/course/{course_id}", response_model=List[MaterialResponse])
async def list_course_materials(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all course-level reference materials (past papers, marking schemes, resource books)."""
    check_course_access(course_id, current_user, db)
    materials = (
        db.query(Material)
        .filter(Material.course_id == course_id)
        .order_by(Material.created_at.desc())
        .all()
    )
    return materials


@router.get("/lesson/{lesson_id}", response_model=List[MaterialResponse])
async def list_materials(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all materials for a lesson."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
        
    check_course_access(lesson.course_id, current_user, db)

    materials = (
        db.query(Material)
        .filter(Material.lesson_id == lesson_id)
        .order_by(Material.created_at.asc())
        .all()
    )
    return materials


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific material by ID."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    lesson = db.query(Lesson).filter(Lesson.id == material.lesson_id).first()
    if lesson:
        check_course_access(lesson.course_id, current_user, db)
        
    return material


@router.put("/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: int,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Edit material metadata, note content, and optionally upload a replacement file."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if title is not None and title.strip():
        material.title = title.strip()
    if description is not None:
        material.description = description.strip()
    if content is not None:
        material.content = content
        material.extracted_text = content

    if file and file.filename:
        ext = file.filename.split(".")[-1].lower()
        if ext in ["pdf"]:
            m_type = MaterialType.PDF
            subfolder = "pdf"
        elif ext in ["mp4", "webm", "mov", "avi"]:
            m_type = MaterialType.VIDEO
            subfolder = "video"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type .{ext}")

        file_id = str(uuid.uuid4())
        saved_filename = f"{file_id}.{ext}"
        saved_path = os.path.join(UPLOAD_DIR, subfolder, saved_filename)
        os.makedirs(os.path.dirname(saved_path), exist_ok=True)

        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if material.file_path and os.path.exists(material.file_path):
            try:
                os.remove(material.file_path)
            except Exception:
                pass

        material.material_type = m_type
        material.file_path = saved_path
        material.content = f"/uploads/{subfolder}/{saved_filename}"
        material.processing_status = ProcessingStatus.PROCESSING
        material.processing_error = None

        db.commit()

        if m_type == MaterialType.PDF:
            background_tasks.add_task(process_pdf_background, material.id, saved_path)
        elif m_type == MaterialType.VIDEO:
            background_tasks.add_task(process_video_background, material.id, saved_path)

    db.commit()
    db.refresh(material)
    return material


from pydantic import BaseModel

class TranscriptUpdate(BaseModel):
    extracted_text: str

@router.put("/{material_id}/transcript", response_model=MaterialResponse)
def update_material_transcript(
    material_id: int,
    data: TranscriptUpdate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Teacher review and update of extracted AI transcript."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    material.extracted_text = data.extracted_text
    db.commit()

    # Re-index in vector database for RAG Q&A
    if material.extracted_text and len(material.extracted_text) > 20:
        lesson = db.query(Lesson).filter(Lesson.id == material.lesson_id).first()
        course_id = lesson.course_id if lesson else 0
        from app.services.vector import store_material_embeddings
        store_material_embeddings(
            material_id=material.id,
            lesson_id=material.lesson_id,
            course_id=course_id,
            text=material.extracted_text,
            title=material.title,
        )

    db.refresh(material)
    return material


@router.delete("/{material_id}", response_model=MessageResponse)
async def delete_material(
    material_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Delete a material and its associated file."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Delete file from disk if it exists
    if material.file_path and os.path.exists(material.file_path):
        os.remove(material.file_path)

    db.delete(material)
    db.commit()
    return {"message": f"Material '{material.title}' has been deleted", "success": True}


# ──────────────────────────────────────────────
# Material Analytics & AI
# ──────────────────────────────────────────────

from app.models import MaterialFlag, MaterialNote
from app.schemas import MaterialFlagCreate, MaterialFlagResponse, MaterialNoteCreate, MaterialNoteResponse

@router.post("/{material_id}/flags", response_model=MaterialFlagResponse, status_code=status.HTTP_201_CREATED)
def create_material_flag(
    material_id: int,
    data: MaterialFlagCreate,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    flag = MaterialFlag(
        student_id=current_user.id,
        material_id=material_id,
        context=data.context,
        comment=data.comment
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    
    # Notify the teacher
    lesson = db.query(Lesson).filter(Lesson.id == material.lesson_id).first()
    if lesson:
        course = db.query(Course).filter(Course.id == lesson.course_id).first()
        if course and course.teacher_id:
            notif = Notification(
                user_id=course.teacher_id,
                sender_id=current_user.id,
                title="Student flagged material",
                message=f"{current_user.full_name} is confused about '{material.title}' in '{course.title}'",
                type=NotificationType.SYSTEM,
                related_entity_id=flag.id,
            )
            db.add(notif)
            db.commit()
            
    return flag

@router.get("/{material_id}/flags", response_model=List[MaterialFlagResponse])
def get_material_flags(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MaterialFlag).filter(MaterialFlag.material_id == material_id)
    if current_user.role == UserRole.STUDENT:
        query = query.filter(MaterialFlag.student_id == current_user.id)
    return query.order_by(MaterialFlag.created_at.desc()).all()

@router.post("/{material_id}/notes", response_model=MaterialNoteResponse, status_code=status.HTTP_201_CREATED)
def create_material_note(
    material_id: int,
    data: MaterialNoteCreate,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    note = MaterialNote(
        student_id=current_user.id,
        material_id=material_id,
        context=data.context,
        content=data.content
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note

@router.get("/{material_id}/notes", response_model=List[MaterialNoteResponse])
def get_material_notes(
    material_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    return (
        db.query(MaterialNote)
        .filter(MaterialNote.material_id == material_id, MaterialNote.student_id == current_user.id)
        .order_by(MaterialNote.created_at.desc())
        .all()
    )

@router.delete("/{material_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_note(
    note_id: int,
    material_id: Optional[int] = None,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    note = db.query(MaterialNote).filter(
        MaterialNote.id == note_id,
        MaterialNote.student_id == current_user.id
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return None

@router.get("/{material_id}/progress", response_model=StudentMaterialProgressResponse)
def get_material_progress(
    material_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    progress = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id == material_id,
        StudentMaterialProgress.student_id == current_user.id
    ).first()
    
    if not progress:
        # Return default 0 progress instead of 404
        return StudentMaterialProgressResponse(
            id=0,
            student_id=current_user.id,
            material_id=material_id,
            last_position=0.0,
            is_completed=False,
            updated_at=datetime.utcnow()
        )
    return progress

@router.post("/{material_id}/progress", response_model=StudentMaterialProgressResponse)
def update_material_progress(
    material_id: int,
    data: StudentMaterialProgressUpdate,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    progress = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id == material_id,
        StudentMaterialProgress.student_id == current_user.id
    ).first()
    
    if progress:
        progress.last_position = data.last_position
        if data.is_completed:
            progress.is_completed = True
    else:
        progress = StudentMaterialProgress(
            student_id=current_user.id,
            material_id=material_id,
            last_position=data.last_position,
            is_completed=data.is_completed
        )
        db.add(progress)
        
    db.commit()
    db.refresh(progress)
    return progress

from app.schemas import (
    MaterialFlagCreate, MaterialFlagResponse, MaterialNoteCreate, MaterialNoteResponse,
    MaterialSummarizeRequest
)

@router.post("/{material_id}/summarize")
def summarize_material(
    material_id: int,
    data: Optional[MaterialSummarizeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    text = (material.extracted_text or material.content or "").strip()
    
    # If text is empty or too short, attempt on-the-fly extraction from disk
    if len(text) < 50 and material.file_path:
        import os
        from app.services.ocr import extract_text_from_pdf, extract_text_from_image
        from app.services.vector import store_material_embeddings
        
        file_path = material.file_path
        if os.path.exists(file_path):
            extracted = None
            type_str = str(material.material_type.value if hasattr(material.material_type, "value") else material.material_type).lower()
            if type_str == "pdf" or file_path.lower().endswith(".pdf"):
                extracted = extract_text_from_pdf(file_path)
            elif type_str == "image" or any(file_path.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                extracted = extract_text_from_image(file_path)
            elif any(file_path.lower().endswith(ext) for ext in [".md", ".txt", ".json", ".csv"]):
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                        extracted = f.read()
                except Exception as read_err:
                    logger.warning(f"Failed to read file {file_path}: {read_err}")
            
            if extracted and len(extracted.strip()) >= 50:
                text = extracted.strip()
                material.extracted_text = text
                db.commit()
                logger.info(f"On-the-fly extracted {len(text)} chars for material {material.id}")
                
                # Store vector embeddings for RAG search
                try:
                    lesson = db.query(Lesson).filter(Lesson.id == material.lesson_id).first() if material.lesson_id else None
                    course_id = lesson.course_id if lesson else (material.course_id or 0)
                    store_material_embeddings(
                        material_id=material.id,
                        lesson_id=material.lesson_id or 0,
                        course_id=course_id,
                        text=text,
                        title=material.title,
                    )
                except Exception as emb_err:
                    logger.warning(f"Embedding storage during on-the-fly extraction failed: {emb_err}")

    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="The material does not contain enough extractable text to generate a summary.")
        
    requested_style = (data.summary_type if data and data.summary_type else "paragraph").lower()
    summary_style = "student_notes" if requested_style in ["student_notes", "story_mode"] else requested_style

    try:
        from app.services.gemini_service import gemini
            
        # Take up to 24000 characters to cover multi-page documents
        context = text[:24000]
        
        if summary_style == "point_form":
            system_prompt = (
                "You are an expert educational tutor for Sri Lankan G.C.E. Advanced Level Biology.\n"
                "Generate structured revision notes in concise point form based strictly on the provided learning material.\n\n"
                "STRUCTURE:\n"
                "## Core Topics & Principles\n"
                "• High-level summary points\n\n"
                "## Key Biological Mechanisms & Concepts\n"
                "• Main concept\n"
                "  - Sub-points and mechanisms\n"
                "  - Key steps in sequential order\n\n"
                "## Important Terminology & Definitions\n"
                "• **Term**: Definition and significance\n\n"
                "## Essential Revision Facts\n"
                "• High-yield facts and exam takeaways\n\n"
                "CRITICAL RULES: Use clean markdown bullet points (• or -) and bold key terminology. "
                "Do not convert into long blocks of paragraphs. Keep the summary strictly grounded in the provided material."
            )
        elif summary_style == "student_notes":
            system_prompt = (
                "You are an engaging, student-centered biology educator for Sri Lankan G.C.E. Advanced Level students.\n"
                "Generate a clear, simplified 'Student Note Style' version of the provided learning material.\n"
                "Your goal is to make the full note significantly simpler to understand, digest, and remember, breaking down complex scientific concepts into intuitive explanations while preserving 100% biological accuracy for the A/L examination.\n\n"
                "STRUCTURE:\n"
                "## 📌 Core Concept in Simple Terms\n"
                "[Clear, simplified explanation of the central concept without overwhelming jargon.]\n\n"
                "## 💡 Step-by-Step Breakdown\n"
                "[Walkthrough of the biological mechanisms and processes with clear, intuitive cause-and-effect explanations.]\n\n"
                "## 🔬 Key Terminology & Definitions\n"
                "[Plain-English explanations of the most essential terms and structures.]\n\n"
                "## 🎯 Exam Revision Pointers\n"
                "[High-yield takeaways, common student pitfalls, and memory aids for exam revision.]\n\n"
                "CRITICAL RULES: Keep the content strictly factual and scoped to the provided material. "
                "Write in a clear, friendly, and structured student note style."
            )
        else:  # paragraph mode (default)
            system_prompt = (
                "You are an expert educational tutor for Sri Lankan G.C.E. Advanced Level Biology.\n"
                "Generate a coherent academic summary of the provided learning material using connected, well-structured paragraphs.\n\n"
                "STRUCTURE:\n"
                "## Conceptual Overview\n"
                "[Clear, well-articulated paragraphs explaining the core concepts, principles, and biological context.]\n\n"
                "## Detailed Explanation\n"
                "[Further paragraphs breaking down the mechanisms, biological structures, and significance in logical flow.]\n\n"
                "## Concluding Summary\n"
                "[Final synthesis paragraph highlighting the overall takeaway for exam revision.]\n\n"
                "CRITICAL RULES: Do NOT convert the explanation into a bulleted list. Use flowing, cohesive paragraph prose. "
                "Keep the summary strictly scoped to the provided material."
            )

        result = gemini.generate_text(
            prompt=f"Summarize the following learning material thoroughly in {summary_style.replace('_', ' ')} format:\n\n{context}",
            system_instruction=system_prompt,
            model_tier="flash",
            temperature=0.3,
            max_tokens=2000,
        )
        return {"summary": result, "summary_type": summary_style}
    except Exception as e:
        logger.error(f"Error summarizing material: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate AI summary: {str(e)}")

@router.get("/teacher/insights/flags")
def get_teacher_material_flags(
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Get all material flags for courses taught by this teacher."""
    # First, get courses taught by the teacher
    teacher_courses = db.query(Course.id).filter(Course.teacher_id == current_user.id).subquery()
    
    # Get lessons in those courses
    from app.models import Lesson
    teacher_lessons = db.query(Lesson.id).filter(Lesson.course_id.in_(teacher_courses)).subquery()
    
    # Get materials in those lessons
    teacher_materials = db.query(Material.id).filter(Material.lesson_id.in_(teacher_lessons)).subquery()
    
    # Get flags for those materials, joined with material and student
    flags = (
        db.query(
            MaterialFlag.id,
            MaterialFlag.material_id,
            MaterialFlag.context,
            MaterialFlag.comment,
            MaterialFlag.is_resolved,
            MaterialFlag.teacher_reply,
            MaterialFlag.resolved_at,
            MaterialFlag.created_at,
            Material.title.label("material_title"),
            Material.material_type.label("material_type"),
            User.full_name.label("student_name")
        )
        .join(Material, MaterialFlag.material_id == Material.id)
        .join(User, MaterialFlag.student_id == User.id)
        .filter(MaterialFlag.material_id.in_(teacher_materials))
        .order_by(MaterialFlag.created_at.desc())
        .all()
    )
    
    result = []
    for f in flags:
        result.append({
            "id": f.id,
            "material_id": f.material_id,
            "context": f.context,
            "comment": f.comment,
            "is_resolved": f.is_resolved,
            "teacher_reply": f.teacher_reply,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            "created_at": f.created_at.isoformat(),
            "material_title": f.material_title,
            "material_type": f.material_type,
            "student_name": f.student_name
        })
    return result

class SingleResolveRequest(BaseModel):
    teacher_reply: Optional[str] = None

@router.post("/teacher/insights/flags/{flag_id}/resolve")
def resolve_material_flag(
    flag_id: int,
    data: Optional[SingleResolveRequest] = None,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    flag = db.query(MaterialFlag).filter(MaterialFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
        
    flag.is_resolved = True
    if data and data.teacher_reply:
        flag.teacher_reply = data.teacher_reply
        from app.models import Notification, NotificationType
        notification = Notification(
            user_id=flag.student_id,
            sender_id=current_user.id,
            title="Difficulty Flag Resolved",
            message=data.teacher_reply,
            type=NotificationType.MESSAGE,
            related_entity_id=flag.material_id
        )
        db.add(notification)
    flag.resolved_at = datetime.utcnow()
    db.commit()
    return {"message": "Flag marked as resolved", "success": True}

from pydantic import BaseModel
class BulkResolveRequest(BaseModel):
    flag_ids: List[int]
    message: str

@router.post("/teacher/insights/flags/bulk-resolve")
def bulk_resolve_material_flags(
    req: BulkResolveRequest,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    from app.models import Notification, NotificationType

    flags = db.query(MaterialFlag).filter(MaterialFlag.id.in_(req.flag_ids)).all()
    if not flags:
        raise HTTPException(status_code=404, detail="No flags found")

    student_ids = set()
    for flag in flags:
        flag.is_resolved = True
        flag.teacher_reply = req.message
        flag.resolved_at = datetime.utcnow()
        student_ids.add(flag.student_id)

    # Send notifications
    for student_id in student_ids:
        notification = Notification(
            user_id=student_id,
            sender_id=current_user.id,
            title="Confusion Flag Resolved",
            message=req.message,
            type=NotificationType.MESSAGE,
            related_entity_id=flags[0].material_id if flags else None
        )
        db.add(notification)

    db.commit()
    return {"message": f"{len(flags)} flags resolved and students notified.", "success": True}

class AISummaryRequest(BaseModel):
    material_title: str
    material_type: str
    flag_contexts: List[str]
    flag_comments: List[str]

@router.post("/teacher/insights/ai-summary")
def get_material_ai_hotspot_summary(
    req: AISummaryRequest,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Generates an AI Executive Brief analyzing confusion hotspots and recommending action."""
    comments = [c for c in req.flag_comments if c]
    contexts = list(set([cx for cx in req.flag_contexts if cx]))
    
    context_str = ", ".join(contexts[:4]) if contexts else "general content"
    comment_str = " | ".join(comments[:4]) if comments else "Requests for detailed explanation"

    summary = f"Analysis of {len(req.flag_contexts)} student flags on '{req.material_title}' indicates primary confusion around [{context_str}]. Key student feedback: \"{comment_str}\"."
    recommended_action = f"Review video/page sections near [{context_str}]. Consider broadcasting a 2-minute clarification note or reviewing during live QA."

    return {
        "summary": summary,
        "recommended_action": recommended_action,
        "success": True
    }
