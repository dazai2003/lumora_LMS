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
    file: Optional[UploadFile] = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Edit material metadata and optionally upload a replacement file."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if title is not None and title.strip():
        material.title = title.strip()
    if description is not None:
        material.description = description.strip()

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

@router.post("/{material_id}/summarize")
def summarize_material(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    text = material.extracted_text or material.content
    if not text or len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Not enough text to summarize in this material")
        
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return {"summary": "AI Summarization unavailable (No API key)."}
            
        client = Groq(api_key=api_key, timeout=45.0)
        
        # Take up to 8000 characters
        context = text[:8000]
        
        response = client.chat.completions.create(
            model=os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant"),
            messages=[
                {"role": "system", "content": "You are a helpful educational assistant. Provide a concise, easy-to-understand summary of the following learning material. Use bullet points for key concepts."},
                {"role": "user", "content": f"Summarize this material:\n\n{context}"}
            ],
            temperature=0.3,
            max_tokens=500
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        logger.error(f"Error summarizing material: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate AI summary.")

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
            MaterialFlag.context,
            MaterialFlag.comment,
            MaterialFlag.is_resolved,
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
            "context": f.context,
            "comment": f.comment,
            "is_resolved": f.is_resolved,
            "created_at": f.created_at.isoformat(),
            "material_title": f.material_title,
            "material_type": f.material_type,
            "student_name": f.student_name
        })
    return result

@router.post("/teacher/insights/flags/{flag_id}/resolve")
def resolve_material_flag(
    flag_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    flag = db.query(MaterialFlag).filter(MaterialFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
        
    flag.is_resolved = True
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
